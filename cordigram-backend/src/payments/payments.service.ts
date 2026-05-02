import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Stripe from 'stripe';
import { ConfigService } from '../config/config.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { PaymentTransaction } from './payment-transaction.schema';
import { Post } from '../posts/post.schema';
import {
  AdEngagementEvent,
  AdEngagementEventType,
} from './ad-engagement-event.schema';
import { PostInteraction } from '../posts/post-interaction.schema';
import { Comment } from '../comment/comment.schema';
import { CampaignExpirySchedulerService } from './campaign-expiry-scheduler.service';
import { MailService } from '../mail/mail.service';
import { BoostService } from '../boost/boost.service';
import type {
  BoostBillingCycle,
  BoostTier,
} from '../boost/boost-entitlement.schema';

@Injectable()
export class PaymentsService {
  private readonly adClickCooldownMs = 60 * 1000;

  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: Stripe;
  private readonly durationDaysByPackage: Record<string, number> = {
    none: 0,
    d3: 3,
    d7: 7,
    d14: 14,
    d30: 30,
  };
  private readonly durationPriceByPackage: Record<string, number> = {
    none: 0,
    d3: 29000,
    d7: 59000,
    d14: 99000,
    d30: 179000,
  };
  private readonly boostPriceByPackage: Record<string, number> = {
    light: 79000,
    standard: 149000,
    strong: 299000,
  };
  private readonly boostWeightByPackage: Record<string, number> = {
    light: 0.15,
    standard: 0.3,
    strong: 0.6,
  };

  private buildCheckoutSuccessUrl(raw?: string): string {
    const fallback = `${this.config.frontendUrl}/ads/payment/success?session_id={CHECKOUT_SESSION_ID}`;
    const trimmed = raw?.trim();
    if (!trimmed) return fallback;

    if (/^cordigram:\/\//i.test(trimmed)) {
      return trimmed.includes('{CHECKOUT_SESSION_ID}')
        ? trimmed
        : `${trimmed}${trimmed.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`;
    }

    if (!/^https?:\/\//i.test(trimmed)) {
      throw new BadRequestException('Invalid successUrl');
    }

    return trimmed.includes('{CHECKOUT_SESSION_ID}')
      ? trimmed
      : `${trimmed}${trimmed.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`;
  }

  private buildCheckoutCancelUrl(raw?: string): string {
    const fallback = `${this.config.frontendUrl}/ads/payment/cancel`;
    const trimmed = raw?.trim();
    if (!trimmed) return fallback;

    if (/^cordigram:\/\//i.test(trimmed)) {
      return trimmed;
    }

    if (!/^https?:\/\//i.test(trimmed)) {
      throw new BadRequestException('Invalid cancelUrl');
    }

    return trimmed;
  }
  private readonly boostStoreMonthlyPriceByTier: Record<string, number> = {
    basic: 42000,
    boost: 113000,
  };

  private computeBoostStoreAmountTotal(params: {
    tier: string;
    billingCycle: string;
  }): number {
    const tier =
      params.tier === 'boost'
        ? 'boost'
        : params.tier === 'basic'
          ? 'basic'
          : '';
    const monthly = this.boostStoreMonthlyPriceByTier[tier] ?? 0;
    if (monthly <= 0) {
      throw new BadRequestException('Invalid boostTier');
    }
    const cycle = params.billingCycle === 'yearly' ? 'yearly' : 'monthly';
    if (cycle === 'monthly') return monthly;
    // yearly = 12 months with 16% discount
    return Math.round(monthly * 12 * (1 - 0.16));
  }

  private computeBoostStoreExpiry(params: {
    startsAt: Date;
    billingCycle: string;
  }): Date {
    const start = params.startsAt;
    const cycle = params.billingCycle === 'yearly' ? 'yearly' : 'monthly';
    const days = cycle === 'yearly' ? 365 : 30;
    return new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private getCampaignStatus(
    tx: Pick<
      PaymentTransaction,
      'isExpiredHidden' | 'hiddenReason' | 'expiresAt'
    >,
    now: Date,
  ): 'active' | 'hidden' | 'canceled' | 'completed' {
    if (tx.hiddenReason === 'canceled') return 'canceled';
    if (tx.hiddenReason === 'paused') return 'hidden';

    const expiresAt = tx.expiresAt ? new Date(tx.expiresAt) : null;
    if (
      tx.isExpiredHidden ||
      (expiresAt && expiresAt.getTime() <= now.getTime())
    ) {
      return 'completed';
    }

    return 'active';
  }

  private async mergeRepostMetricsAndDeleteReposts(params: {
    userId: string;
    promotedPostId?: string | null;
    now: Date;
  }) {
    const promotedPostId = String(params.promotedPostId ?? '');
    if (!Types.ObjectId.isValid(promotedPostId)) return;

    const promotedPostObjectId = new Types.ObjectId(promotedPostId);
    const reposts = await this.postModel
      .find({ repostOf: promotedPostObjectId, deletedAt: null })
      .select('_id stats')
      .lean();

    if (!reposts.length) return;

    const mergedHearts = reposts.reduce(
      (sum, post) => sum + Number(post?.stats?.hearts ?? 0),
      0,
    );
    const mergedViews = reposts.reduce(
      (sum, post) => sum + Number(post?.stats?.views ?? 0),
      0,
    );

    if (mergedHearts > 0 || mergedViews > 0) {
      await this.postModel
        .updateOne(
          {
            _id: promotedPostObjectId,
            authorId: new Types.ObjectId(params.userId),
            deletedAt: null,
          },
          {
            $inc: {
              'stats.hearts': mergedHearts,
              'stats.views': mergedViews,
            },
          },
        )
        .exec();
    }

    const repostIds = reposts
      .map((item) => item._id)
      .filter((id): id is Types.ObjectId => Boolean(id));

    if (!repostIds.length) return;

    await this.postModel
      .updateMany(
        { _id: { $in: repostIds }, deletedAt: null },
        {
          $set: {
            deletedAt: params.now,
            deletedBy: new Types.ObjectId(params.userId),
            deletedSource: 'system',
            deletedReason: 'campaign_hidden_cleanup',
          },
        },
      )
      .exec();

    await this.postInteractionModel
      .deleteMany({ postId: { $in: repostIds } })
      .exec();
  }

  private parseCreativeContent(content?: string | null) {
    const raw = (content ?? '').replace(/\r/g, '').trim();

    const extractBlock = (name: string) => {
      const pattern = new RegExp(
        `\\[\\[AD_${name}\\]\\]([\\s\\S]*?)\\[\\[\\/AD_${name}\\]\\]`,
        'i',
      );
      const matched = pattern.exec(raw);
      if (!matched) return '';
      return matched[1]?.replace(/^\n+|\n+$/g, '') ?? '';
    };

    const structuredPrimaryText = extractBlock('PRIMARY_TEXT');
    const structuredHeadline = extractBlock('HEADLINE');
    const structuredDescription = extractBlock('DESCRIPTION');
    const structuredDestinationUrl = extractBlock('URL');
    const structuredCta = extractBlock('CTA');

    if (
      structuredPrimaryText ||
      structuredHeadline ||
      structuredDescription ||
      structuredDestinationUrl ||
      structuredCta
    ) {
      return {
        primaryText: structuredPrimaryText,
        headline: structuredHeadline,
        adDescription: structuredDescription,
        destinationUrl: structuredDestinationUrl,
        cta: structuredCta,
      };
    }

    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return {
        primaryText: '',
        headline: '',
        adDescription: '',
        destinationUrl: '',
        cta: '',
      };
    }

    let destinationUrl = '';
    const last = lines[lines.length - 1];
    if (/^https?:\/\//i.test(last)) {
      destinationUrl = last;
      lines.pop();
    }

    let cta = '';
    const metaLines: string[] = [];
    lines.forEach((line) => {
      const matched = /^cta\s*:\s*(.+)$/i.exec(line);
      if (matched && !cta) {
        cta = matched[1]?.trim() ?? '';
        return;
      }
      metaLines.push(line);
    });

    const primaryText = metaLines[0] ?? '';
    const headline = metaLines.length > 1 ? metaLines[1] : '';
    const adDescription =
      metaLines.length > 2 ? metaLines.slice(2).join(' ') : '';

    return {
      primaryText,
      headline,
      adDescription,
      destinationUrl,
      cta,
    };
  }

  private buildCreativeContent(params: {
    primaryText?: string;
    headline?: string;
    adDescription?: string;
    destinationUrl?: string;
    ctaLabel?: string;
  }) {
    return [
      '[[AD_PRIMARY_TEXT]]',
      params.primaryText?.trim() ?? '',
      '[[/AD_PRIMARY_TEXT]]',
      '',
      '[[AD_HEADLINE]]',
      params.headline?.trim() ?? '',
      '[[/AD_HEADLINE]]',
      '',
      '[[AD_DESCRIPTION]]',
      params.adDescription?.trim() ?? '',
      '[[/AD_DESCRIPTION]]',
      '',
      '[[AD_CTA]]',
      params.ctaLabel?.trim() ?? '',
      '[[/AD_CTA]]',
      '',
      '[[AD_URL]]',
      params.destinationUrl?.trim() ?? '',
      '[[/AD_URL]]',
    ]
      .join('\n')
      .slice(0, 2200);
  }

  private inferMediaTypeFromUrl(url: string): 'image' | 'video' {
    return /\.(mp4|mov|webm|mkv)(\?|#|$)/i.test(url) ? 'video' : 'image';
  }

  constructor(
    private readonly config: ConfigService,
    @InjectModel(PaymentTransaction.name)
    private readonly paymentTransactions: Model<PaymentTransaction>,
    @InjectModel(Post.name)
    private readonly postModel: Model<Post>,
    @InjectModel(AdEngagementEvent.name)
    private readonly adEngagementEventModel: Model<AdEngagementEvent>,
    @InjectModel(PostInteraction.name)
    private readonly postInteractionModel: Model<PostInteraction>,
    @InjectModel(Comment.name)
    private readonly commentModel: Model<Comment>,
    private readonly campaignExpiryScheduler: CampaignExpirySchedulerService,
    private readonly mailService: MailService,
    private readonly boostService: BoostService,
  ) {
    this.stripe = new Stripe(this.config.stripeSecretKey);
  }

  async trackAdsEvent(
    userId: string,
    params: {
      promotedPostId: string;
      renderedPostId?: string;
      eventType: AdEngagementEventType;
      sessionId: string;
      durationMs?: number;
      source?: string;
    },
  ) {
    const { promotedPostId, renderedPostId, eventType, sessionId, durationMs } =
      params;
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid userId');
    }
    if (!Types.ObjectId.isValid(promotedPostId)) {
      throw new BadRequestException('Invalid promotedPostId');
    }

    const payload = {
      userId: new Types.ObjectId(userId),
      promotedPostId: new Types.ObjectId(promotedPostId),
      renderedPostId:
        renderedPostId && Types.ObjectId.isValid(renderedPostId)
          ? new Types.ObjectId(renderedPostId)
          : null,
      eventType,
      sessionId: sessionId.toString().slice(0, 120),
      durationMs:
        typeof durationMs === 'number' && Number.isFinite(durationMs)
          ? Math.min(Math.max(0, Math.floor(durationMs)), 30 * 60 * 1000)
          : null,
      source: params.source?.toString?.() || 'home_feed',
    };

    if (eventType === 'impression') {
      const existing = await this.adEngagementEventModel
        .findOne({
          userId: payload.userId,
          promotedPostId: payload.promotedPostId,
          sessionId: payload.sessionId,
          eventType: 'impression',
        })
        .select('_id')
        .lean();
      if (existing?._id) {
        return { tracked: true, deduped: true };
      }
    }

    if (eventType === 'cta_click') {
      const sameSessionClick = await this.adEngagementEventModel
        .findOne({
          userId: payload.userId,
          promotedPostId: payload.promotedPostId,
          sessionId: payload.sessionId,
          eventType: 'cta_click',
        })
        .select('_id')
        .lean();

      if (sameSessionClick?._id) {
        return { tracked: true, deduped: true };
      }

      const cooldownFrom = new Date(Date.now() - this.adClickCooldownMs);
      const recentClick = await this.adEngagementEventModel
        .findOne({
          userId: payload.userId,
          promotedPostId: payload.promotedPostId,
          eventType: 'cta_click',
          createdAt: { $gte: cooldownFrom },
        })
        .select('_id')
        .lean();

      if (recentClick?._id) {
        return { tracked: true, deduped: true };
      }
    }

    await this.adEngagementEventModel.create(payload);
    return { tracked: true, deduped: false };
  }

  async getAdsDashboard(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid userId');
    }

    const now = new Date();
    const campaigns = await this.paymentTransactions
      .find({
        userId,
        promotedPostId: { $ne: null },
        $or: [
          { paymentStatus: 'paid' },
          { paymentStatus: 'no_payment_required' },
          { checkoutStatus: 'complete' },
        ],
      })
      .sort({ paidAt: -1, createdAt: -1 })
      .lean();

    const campaignRows = await Promise.all(
      campaigns
        .filter((tx) => Types.ObjectId.isValid(tx.promotedPostId ?? ''))
        .map(async (tx) => {
          const promotedPostId = String(tx.promotedPostId);
          const startsAt = tx.startsAt ?? tx.paidAt ?? tx.createdAt ?? now;
          const expiresAt = tx.expiresAt ?? now;

          const related = await this.postModel
            .find({
              $or: [
                { _id: new Types.ObjectId(promotedPostId) },
                { repostOf: new Types.ObjectId(promotedPostId) },
              ],
              deletedAt: null,
            })
            .select('_id stats')
            .lean();

          const relatedPostIds = related
            .map((item) => item._id?.toString?.())
            .filter((id): id is string => Boolean(id));

          const [
            impressionCount,
            reachUserIds,
            ctaClickCount,
            dwellAgg,
            interactionAgg,
            viewUserIds,
            commentCount,
          ] = await Promise.all([
            this.adEngagementEventModel
              .countDocuments({
                promotedPostId: new Types.ObjectId(promotedPostId),
                eventType: 'impression',
                createdAt: { $gte: startsAt, $lte: expiresAt },
              })
              .exec(),
            this.adEngagementEventModel
              .distinct('userId', {
                promotedPostId: new Types.ObjectId(promotedPostId),
                eventType: 'impression',
                createdAt: { $gte: startsAt, $lte: expiresAt },
              })
              .exec(),
            this.adEngagementEventModel
              .countDocuments({
                promotedPostId: new Types.ObjectId(promotedPostId),
                eventType: 'cta_click',
                createdAt: { $gte: startsAt, $lte: expiresAt },
              })
              .exec(),
            this.adEngagementEventModel
              .aggregate([
                {
                  $match: {
                    promotedPostId: new Types.ObjectId(promotedPostId),
                    eventType: 'dwell',
                    durationMs: { $gt: 0 },
                    createdAt: { $gte: startsAt, $lte: expiresAt },
                  },
                },
                {
                  $group: {
                    _id: null,
                    avgDurationMs: { $avg: '$durationMs' },
                    totalDurationMs: { $sum: '$durationMs' },
                    samples: { $sum: 1 },
                  },
                },
              ])
              .exec(),
            relatedPostIds.length
              ? this.postInteractionModel
                  .aggregate([
                    {
                      $match: {
                        postId: {
                          $in: relatedPostIds.map(
                            (id) => new Types.ObjectId(id),
                          ),
                        },
                        type: { $in: ['like', 'repost'] },
                        createdAt: { $gte: startsAt, $lte: expiresAt },
                      },
                    },
                    {
                      $group: {
                        _id: '$type',
                        count: { $sum: 1 },
                      },
                    },
                  ])
                  .exec()
              : Promise.resolve([]),
            relatedPostIds.length
              ? this.postInteractionModel
                  .distinct('userId', {
                    postId: {
                      $in: relatedPostIds.map((id) => new Types.ObjectId(id)),
                    },
                    type: 'view',
                    createdAt: { $gte: startsAt, $lte: expiresAt },
                  })
                  .exec()
              : Promise.resolve([]),
            relatedPostIds.length
              ? this.commentModel
                  .countDocuments({
                    postId: {
                      $in: relatedPostIds.map((id) => new Types.ObjectId(id)),
                    },
                    deletedAt: null,
                    createdAt: { $gte: startsAt, $lte: expiresAt },
                  })
                  .exec()
              : Promise.resolve(0),
          ]);

          const interactionMap = new Map<string, number>();
          interactionAgg.forEach((row: { _id?: string; count?: number }) => {
            if (!row?._id) return;
            interactionMap.set(row._id, row.count ?? 0);
          });

          const dwell = dwellAgg?.[0] ?? null;
          const likes = interactionMap.get('like') ?? 0;
          const reposts = interactionMap.get('repost') ?? 0;
          const views = viewUserIds.length;
          const engagements = likes + commentCount + reposts;
          const clicks = ctaClickCount ?? 0;
          const impressions = impressionCount ?? 0;
          const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
          const engagementRate =
            impressions > 0 ? (engagements / impressions) * 100 : 0;

          return {
            id: String(tx._id),
            promotedPostId,
            campaignName: tx.campaignName || 'Ads Campaign',
            status: this.getCampaignStatus(tx, now),
            adminCancelReason:
              typeof tx.adminCancelReason === 'string'
                ? tx.adminCancelReason
                : null,
            budget: tx.amountTotal ?? 0,
            spent: tx.amountTotal ?? 0,
            startsAt,
            expiresAt,
            impressions,
            reach: reachUserIds.length,
            clicks,
            ctr,
            views,
            likes,
            comments: commentCount,
            reposts,
            engagements,
            averageDwellMs:
              typeof dwell?.avgDurationMs === 'number'
                ? dwell.avgDurationMs
                : 0,
            totalDwellMs:
              typeof dwell?.totalDurationMs === 'number'
                ? dwell.totalDurationMs
                : 0,
            dwellSamples: dwell?.samples ?? 0,
            engagementRate,
            _reachUserIds: reachUserIds.map((id) => String(id)),
          };
        }),
    );

    const summary = campaignRows.reduce(
      (acc, item) => {
        acc.totalBudget += item.budget;
        acc.totalSpent += item.spent;
        acc.impressions += item.impressions;
        acc.reach += item.reach;
        acc.clicks += item.clicks;
        acc.views += item.views;
        acc.likes += item.likes;
        acc.comments += item.comments;
        acc.reposts += item.reposts;
        acc.totalDwellMs += item.totalDwellMs;
        acc.dwellSamples += item.dwellSamples;
        if (item.status === 'active') {
          acc.activeCount += 1;
        }
        return acc;
      },
      {
        totalBudget: 0,
        totalSpent: 0,
        impressions: 0,
        reach: 0,
        clicks: 0,
        views: 0,
        likes: 0,
        comments: 0,
        reposts: 0,
        engagements: 0,
        totalDwellMs: 0,
        dwellSamples: 0,
        activeCount: 0,
      },
    );

    const promotedIds = Array.from(
      new Set(campaignRows.map((item) => item.promotedPostId)),
    ).filter((id) => Types.ObjectId.isValid(id));

    const uniqueReachUsers = new Set<string>();
    campaignRows.forEach((row) => {
      (row._reachUserIds ?? []).forEach((userId: string) => {
        if (userId) uniqueReachUsers.add(userId);
      });
    });

    summary.reach = uniqueReachUsers.size;
    summary.engagements = summary.likes + summary.comments + summary.reposts;

    const ctr =
      summary.impressions > 0
        ? (summary.clicks / summary.impressions) * 100
        : 0;
    const engagementRate =
      summary.impressions > 0
        ? (summary.engagements / summary.impressions) * 100
        : 0;

    const trendStart = new Date(now);
    trendStart.setHours(0, 0, 0, 0);
    trendStart.setDate(trendStart.getDate() - 6);

    const trendRaw = promotedIds.length
      ? await this.adEngagementEventModel
          .aggregate([
            {
              $match: {
                promotedPostId: {
                  $in: promotedIds.map((id) => new Types.ObjectId(id)),
                },
                eventType: { $in: ['impression', 'cta_click'] },
                createdAt: { $gte: trendStart, $lte: now },
              },
            },
            {
              $project: {
                day: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$createdAt',
                  },
                },
                eventType: 1,
              },
            },
            {
              $group: {
                _id: { day: '$day', eventType: '$eventType' },
                count: { $sum: 1 },
              },
            },
          ])
          .exec()
      : [];

    const trendMap = new Map<string, { impressions: number; clicks: number }>();
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(trendStart);
      day.setDate(trendStart.getDate() + i);
      const key = day.toISOString().slice(0, 10);
      trendMap.set(key, { impressions: 0, clicks: 0 });
    }

    trendRaw.forEach(
      (row: { _id?: { day?: string; eventType?: string }; count?: number }) => {
        const key = row?._id?.day;
        if (!key || !trendMap.has(key)) return;
        const entry = trendMap.get(key);
        if (!entry) return;
        if (row?._id?.eventType === 'impression') {
          entry.impressions += row.count ?? 0;
        } else if (row?._id?.eventType === 'cta_click') {
          entry.clicks += row.count ?? 0;
        }
        trendMap.set(key, entry);
      },
    );

    const trend = Array.from(trendMap.entries()).map(([day, values]) => ({
      day,
      impressions: values.impressions,
      clicks: values.clicks,
    }));

    return {
      summary: {
        ...summary,
        ctr,
        engagementRate,
        averageDwellMs:
          summary.dwellSamples > 0
            ? summary.totalDwellMs / summary.dwellSamples
            : 0,
      },
      campaigns: campaignRows.map(({ _reachUserIds, ...item }) => item),
      trend,
    };
  }

  private getDurationDays(durationPackageId?: string | null) {
    return this.durationDaysByPackage[durationPackageId ?? ''] ?? 7;
  }

  private getBoostWeight(boostPackageId?: string | null) {
    return this.boostWeightByPackage[boostPackageId ?? ''] ?? 0.3;
  }

  private getBoostPrice(boostPackageId?: string | null) {
    return this.boostPriceByPackage[boostPackageId ?? ''] ?? 0;
  }

  private getDurationPrice(durationPackageId?: string | null) {
    return this.durationPriceByPackage[durationPackageId ?? ''] ?? 0;
  }

  private isPaidState(input: {
    paymentStatus?: string | null;
    checkoutStatus?: string | null;
  }) {
    const paymentStatus = input.paymentStatus ?? null;
    const checkoutStatus = input.checkoutStatus ?? null;
    return (
      paymentStatus === 'paid' ||
      paymentStatus === 'no_payment_required' ||
      checkoutStatus === 'complete'
    );
  }

  private async sendAdsPaymentSuccessEmailIfNeeded(sessionId: string) {
    const lockedTx = await this.paymentTransactions.findOneAndUpdate(
      {
        sessionId,
        adsReceiptEmailSentAt: null,
        adsReceiptEmailSendingAt: null,
      },
      {
        $set: {
          adsReceiptEmailSendingAt: new Date(),
          adsReceiptEmailError: null,
        },
      },
      { new: true },
    );

    if (!lockedTx) return;

    const email = (lockedTx.customerEmail ?? '').trim();
    if (!email) {
      await this.paymentTransactions
        .updateOne(
          { _id: lockedTx._id },
          {
            $set: { adsReceiptEmailError: 'Missing customer email' },
            $unset: { adsReceiptEmailSendingAt: 1 },
          },
        )
        .exec();
      return;
    }

    if (
      !this.isPaidState({
        paymentStatus: lockedTx.paymentStatus,
        checkoutStatus: lockedTx.checkoutStatus,
      })
    ) {
      await this.paymentTransactions
        .updateOne(
          { _id: lockedTx._id },
          {
            $set: { adsReceiptEmailError: 'Payment not in paid state' },
            $unset: { adsReceiptEmailSendingAt: 1 },
          },
        )
        .exec();
      return;
    }

    try {
      await this.mailService.sendAdsPaymentSuccessEmail({
        email,
        campaignName: lockedTx.campaignName,
        actionType: lockedTx.actionType,
        sessionId: lockedTx.sessionId,
        paymentIntentId: lockedTx.paymentIntentId,
        paidAt: lockedTx.paidAt ?? new Date(),
        amountTotal: Number(lockedTx.amountTotal ?? 0),
        currency: lockedTx.currency,
        objective: lockedTx.objective,
        adFormat: lockedTx.adFormat,
        placement: lockedTx.placement,
        boostPackageId: lockedTx.boostPackageId,
        durationPackageId: lockedTx.durationPackageId,
        durationDays: lockedTx.durationDays,
        targetLocation: lockedTx.targetLocation,
        targetAgeMin: lockedTx.targetAgeMin,
        targetAgeMax: lockedTx.targetAgeMax,
        ctaLabel: lockedTx.ctaLabel,
        destinationUrl: lockedTx.destinationUrl,
        interests: lockedTx.interests ?? [],
        mediaCount: Array.isArray(lockedTx.mediaUrls)
          ? lockedTx.mediaUrls.length
          : 0,
        targetCampaignId: lockedTx.targetCampaignId,
      });

      await this.paymentTransactions
        .updateOne(
          { _id: lockedTx._id },
          {
            $set: {
              adsReceiptEmailSentAt: new Date(),
              adsReceiptEmailError: null,
            },
            $unset: { adsReceiptEmailSendingAt: 1 },
          },
        )
        .exec();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown email sending error';
      this.logger.error(
        `Failed sending ads receipt email for session ${sessionId}: ${message}`,
      );
      await this.paymentTransactions
        .updateOne(
          { _id: lockedTx._id },
          {
            $set: { adsReceiptEmailError: message.slice(0, 500) },
            $unset: { adsReceiptEmailSendingAt: 1 },
          },
        )
        .exec();
    }
  }

  private async upsertAdLifecycleForSession(params: {
    sessionId: string;
    userId?: string | null;
    boostPackageId?: string | null;
    durationPackageId?: string | null;
    promotedPostId?: string | null;
    paidAt?: Date | null;
  }) {
    const {
      sessionId,
      userId,
      boostPackageId,
      durationPackageId,
      promotedPostId: inputPromotedPostId,
      paidAt,
    } = params;

    const durationDays = this.getDurationDays(durationPackageId);
    const boostWeight = this.getBoostWeight(boostPackageId);

    let promotedPostId: string | null =
      inputPromotedPostId && Types.ObjectId.isValid(inputPromotedPostId)
        ? inputPromotedPostId
        : null;

    if (!promotedPostId && userId && Types.ObjectId.isValid(userId)) {
      const latestPublishedPost = await this.postModel
        .findOne({
          authorId: new Types.ObjectId(userId),
          status: 'published',
          moderationState: { $in: ['normal', 'restricted', null] },
          visibility: { $ne: 'private' },
          deletedAt: null,
          publishedAt: { $ne: null },
        })
        .sort({ publishedAt: -1, createdAt: -1 })
        .select('_id')
        .lean();

      promotedPostId = latestPublishedPost?._id?.toString?.() ?? null;
    }

    const startsAt = paidAt ?? new Date();
    const expiresAt = new Date(
      startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000,
    );

    const updatedTx = await this.paymentTransactions.findOneAndUpdate(
      { sessionId },
      {
        durationDays,
        boostWeight,
        promotedPostId,
        startsAt,
        expiresAt,
        isExpiredHidden: expiresAt.getTime() <= Date.now(),
        hiddenAt: null,
        hiddenReason: null,
      },
      { new: true },
    );

    if (updatedTx?._id) {
      await this.campaignExpiryScheduler.syncCampaignExpiry({
        campaignId: updatedTx._id.toString(),
        expiresAt: updatedTx.expiresAt ?? null,
        hiddenReason: updatedTx.hiddenReason ?? null,
        isExpiredHidden: updatedTx.isExpiredHidden ?? false,
      });
    }
  }

  private async publishPromotedPostIfEligible(params: {
    promotedPostId?: string | null;
    userId?: string | null;
  }) {
    const { promotedPostId, userId } = params;
    if (!promotedPostId || !Types.ObjectId.isValid(promotedPostId)) return;

    const filter: Record<string, unknown> = {
      _id: new Types.ObjectId(promotedPostId),
      deletedAt: null,
      status: 'published',
    };
    if (userId && Types.ObjectId.isValid(userId)) {
      filter.authorId = new Types.ObjectId(userId);
    }

    await this.postModel
      .updateOne(filter, {
        $set: {
          visibility: 'public',
          publishedAt: new Date(),
        },
      })
      .exec();
  }

  async createCheckoutSession(opts: {
    userId: string;
    email: string;
    dto: CreateCheckoutSessionDto;
  }) {
    const { userId, email, dto } = opts;
    const rawAction = String(dto.actionType ?? '');
    const actionType =
      rawAction === 'campaign_upgrade'
        ? 'campaign_upgrade'
        : rawAction === 'boost_subscribe'
          ? 'boost_subscribe'
          : rawAction === 'boost_gift'
            ? 'boost_gift'
            : 'campaign_create';
    const durationDays = this.getDurationDays(dto.durationPackageId);
    const boostWeight = this.getBoostWeight(dto.boostPackageId);
    const currency = (dto.currency ?? 'vnd').toLowerCase();

    let amountTotal = dto.amount;
    let targetCampaignId: string | null = null;
    let campaignName = dto.campaignName || 'Cordigram Ads Campaign';
    let description =
      dto.description ||
      'Payment for promoted campaign in Cordigram Home Feed.';
    const successUrl = this.buildCheckoutSuccessUrl(dto.successUrl);
    const cancelUrl = this.buildCheckoutCancelUrl(dto.cancelUrl);

    let boostTier: BoostTier | null = null;
    let billingCycle: BoostBillingCycle | null = null;
    let recipientUserId: string | null = null;

    if (actionType === 'boost_subscribe' || actionType === 'boost_gift') {
      boostTier = (dto.boostTier === 'boost' ? 'boost' : 'basic') as BoostTier;
      billingCycle = (
        dto.billingCycle === 'yearly' ? 'yearly' : 'monthly'
      ) as BoostBillingCycle;
      recipientUserId =
        actionType === 'boost_gift'
          ? String(dto.recipientUserId ?? '').trim() || null
          : null;
      if (actionType === 'boost_gift' && !recipientUserId) {
        throw new BadRequestException('Missing recipientUserId');
      }

      amountTotal = this.computeBoostStoreAmountTotal({
        tier: boostTier,
        billingCycle,
      });
      campaignName = boostTier === 'boost' ? 'Boost' : 'Boost Basic';
      description =
        billingCycle === 'yearly'
          ? `${campaignName} yearly plan`
          : `${campaignName} monthly plan`;
    }

    if (actionType === 'campaign_upgrade') {
      if (
        !dto.targetCampaignId ||
        !Types.ObjectId.isValid(dto.targetCampaignId)
      ) {
        throw new BadRequestException('Invalid targetCampaignId');
      }

      const targetTx = await this.paymentTransactions.findOne({
        _id: new Types.ObjectId(dto.targetCampaignId),
        userId,
        promotedPostId: { $ne: null },
        $or: [
          { paymentStatus: 'paid' },
          { paymentStatus: 'no_payment_required' },
          { checkoutStatus: 'complete' },
        ],
      });

      if (!targetTx) {
        throw new BadRequestException('Target campaign not found');
      }

      const currentBoostPrice = this.getBoostPrice(
        targetTx.boostPackageId ?? null,
      );
      const nextBoostPrice = this.getBoostPrice(dto.boostPackageId);
      if (nextBoostPrice <= 0) {
        throw new BadRequestException('Invalid boostPackageId');
      }
      if (nextBoostPrice < currentBoostPrice) {
        throw new BadRequestException('Only boost upgrades are allowed');
      }

      const boostDelta = Math.max(nextBoostPrice - currentBoostPrice, 0);
      const durationAddon = this.getDurationPrice(dto.durationPackageId);
      amountTotal = boostDelta + durationAddon;
      if (!Number.isFinite(amountTotal) || amountTotal < 1000) {
        throw new BadRequestException(
          'Upgrade total must be at least 1000 VND',
        );
      }

      targetCampaignId = dto.targetCampaignId;
      campaignName = `${targetTx.campaignName || 'Cordigram Ads Campaign'} Upgrade`;
      description =
        dto.description ||
        `${targetTx.boostPackageId || 'current'} -> ${dto.boostPackageId} + ${durationDays} day extension`;
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountTotal,
            product_data: {
              name: campaignName,
              description,
            },
          },
        },
      ],
      success_url:
        actionType === 'boost_subscribe' || actionType === 'boost_gift'
          ? `${this.config.frontendUrl}/boost/payment/success?session_id={CHECKOUT_SESSION_ID}`
          : `${this.config.frontendUrl}/ads/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:
        actionType === 'boost_subscribe' || actionType === 'boost_gift'
          ? `${this.config.frontendUrl}/boost/payment/cancel`
          : `${this.config.frontendUrl}/ads/payment/cancel`,
      metadata: {
        userId,
        actionType,
        targetCampaignId: targetCampaignId ?? '',
        campaignName: dto.campaignName ?? '',
        objective: dto.objective ?? '',
        adFormat: dto.adFormat ?? '',
        boostPackageId: dto.boostPackageId,
        durationPackageId: dto.durationPackageId,
        boostTier: boostTier ?? '',
        billingCycle: billingCycle ?? '',
        recipientUserId: recipientUserId ?? '',
        promotedPostId:
          actionType === 'campaign_upgrade' ? '' : (dto.promotedPostId ?? ''),
        durationDays: String(durationDays),
        boostWeight: String(boostWeight),
      },
    });

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);

    await this.paymentTransactions.findOneAndUpdate(
      { sessionId: session.id },
      {
        userId,
        sessionId: session.id,
        actionType,
        targetCampaignId,
        upgradeAppliedAt: null,
        paymentIntentId,
        customerEmail: email,
        amountTotal,
        currency,
        paymentStatus: session.payment_status,
        checkoutStatus: session.status,
        campaignName: dto.campaignName ?? '',
        objective: dto.objective ?? '',
        adFormat: dto.adFormat ?? '',
        adPrimaryText: dto.primaryText ?? '',
        adHeadline: dto.headline ?? '',
        adDescription: dto.adDescription ?? '',
        destinationUrl: dto.destinationUrl ?? '',
        ctaLabel: dto.cta ?? '',
        interests: dto.interests ?? [],
        targetLocation: dto.locationText ?? '',
        targetAgeMin: Number.isFinite(dto.ageMin) ? dto.ageMin : null,
        targetAgeMax: Number.isFinite(dto.ageMax) ? dto.ageMax : null,
        placement: dto.placement ?? 'home_feed',
        mediaUrls: dto.mediaUrls ?? [],
        boostPackageId: dto.boostPackageId,
        durationPackageId: dto.durationPackageId,
        boostTier,
        billingCycle,
        recipientUserId,
        promotedPostId:
          actionType === 'campaign_upgrade'
            ? null
            : (dto.promotedPostId ?? null),
        durationDays,
        boostWeight,
      },
      { upsert: true, new: true },
    );

    return {
      id: session.id,
      paymentIntentId,
      url: session.url,
      status: session.status,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
    };
  }

  async getCheckoutSessionStatus(sessionId: string, userId?: string) {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    const actionType =
      session.metadata?.actionType === 'campaign_upgrade'
        ? 'campaign_upgrade'
        : session.metadata?.actionType === 'boost_subscribe'
          ? 'boost_subscribe'
          : session.metadata?.actionType === 'boost_gift'
            ? 'boost_gift'
            : 'campaign_create';
    const durationDays = this.getDurationDays(
      session.metadata?.durationPackageId,
    );
    const boostWeight = this.getBoostWeight(session.metadata?.boostPackageId);
    const paidAt =
      session.payment_status === 'paid' || session.status === 'complete'
        ? new Date()
        : null;

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);

    await this.paymentTransactions.findOneAndUpdate(
      { sessionId: session.id },
      {
        ...(userId ? { userId } : {}),
        actionType,
        targetCampaignId: session.metadata?.targetCampaignId ?? null,
        paymentIntentId,
        paymentStatus: session.payment_status,
        checkoutStatus: session.status,
        campaignName: session.metadata?.campaignName ?? '',
        objective: session.metadata?.objective ?? '',
        adFormat: session.metadata?.adFormat ?? '',
        boostPackageId: session.metadata?.boostPackageId ?? '',
        durationPackageId: session.metadata?.durationPackageId ?? '',
        promotedPostId:
          actionType === 'campaign_upgrade'
            ? null
            : (session.metadata?.promotedPostId ?? null),
        durationDays,
        boostWeight,
        amountTotal: session.amount_total ?? 0,
        currency: session.currency ?? 'vnd',
        customerEmail: session.customer_details?.email ?? null,
        ...(paidAt ? { paidAt } : {}),
      },
      { upsert: true, new: true },
    );

    if (
      this.isPaidState({
        paymentStatus: session.payment_status,
        checkoutStatus: session.status,
      })
    ) {
      if (actionType === 'campaign_upgrade') {
        await this.applyCampaignUpgradeSession({
          sessionId: session.id,
          userId: session.metadata?.userId ?? userId ?? null,
          targetCampaignId: session.metadata?.targetCampaignId ?? null,
          boostPackageId: session.metadata?.boostPackageId ?? null,
          durationPackageId: session.metadata?.durationPackageId ?? null,
          amountTotal: session.amount_total ?? 0,
        });
      } else {
        if (actionType === 'boost_subscribe' || actionType === 'boost_gift') {
          const buyerId = session.metadata?.userId ?? userId ?? null;
          const recipient =
            actionType === 'boost_gift'
              ? (session.metadata?.recipientUserId ?? null)
              : buyerId;
          const tier =
            session.metadata?.boostTier === 'boost' ? 'boost' : 'basic';
          const cycle =
            session.metadata?.billingCycle === 'yearly' ? 'yearly' : 'monthly';
          const paidAtDate = paidAt ?? new Date();
          if (recipient) {
            await this.boostService.finalizeBoostPurchaseAfterPayment({
              userId: recipient,
              tier: tier as any,
              billingCycle: cycle as any,
              paidAt: paidAtDate,
              latestSessionId: session.id,
              latestPaymentIntentId: paymentIntentId,
              source: actionType === 'boost_gift' ? 'gift' : 'purchase',
              giftedByUserId: actionType === 'boost_gift' ? buyerId : null,
            });
          }
        } else {
          await this.upsertAdLifecycleForSession({
            sessionId: session.id,
            userId: session.metadata?.userId ?? userId ?? null,
            boostPackageId: session.metadata?.boostPackageId ?? null,
            durationPackageId: session.metadata?.durationPackageId ?? null,
            promotedPostId: session.metadata?.promotedPostId ?? null,
            paidAt: paidAt ?? new Date(),
          });
          await this.publishPromotedPostIfEligible({
            promotedPostId: session.metadata?.promotedPostId ?? null,
            userId: session.metadata?.userId ?? userId ?? null,
          });
        }
      }

      if (actionType !== 'boost_subscribe' && actionType !== 'boost_gift') {
        await this.sendAdsPaymentSuccessEmailIfNeeded(session.id);
      }
    }

    return {
      id: session.id,
      paymentIntentId,
      status: session.status,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
      customerEmail: session.customer_details?.email ?? null,
      metadata: session.metadata ?? {},
    };
  }

  async markCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);

    const metadata = session.metadata ?? {};
    const actionType =
      metadata.actionType === 'campaign_upgrade'
        ? 'campaign_upgrade'
        : metadata.actionType === 'boost_subscribe'
          ? 'boost_subscribe'
          : metadata.actionType === 'boost_gift'
            ? 'boost_gift'
            : 'campaign_create';
    const durationDays = this.getDurationDays(
      metadata.durationPackageId ?? null,
    );
    const boostWeight = this.getBoostWeight(metadata.boostPackageId ?? null);
    const paidAt =
      session.payment_status === 'paid' || session.status === 'complete'
        ? new Date()
        : null;

    await this.paymentTransactions.findOneAndUpdate(
      { sessionId: session.id },
      {
        userId: metadata.userId ?? '',
        sessionId: session.id,
        actionType,
        targetCampaignId: metadata.targetCampaignId ?? null,
        paymentIntentId,
        customerEmail:
          session.customer_details?.email ?? session.customer_email ?? null,
        amountTotal: session.amount_total ?? 0,
        currency: session.currency ?? 'vnd',
        paymentStatus: session.payment_status,
        checkoutStatus: session.status,
        campaignName: metadata.campaignName ?? '',
        objective: metadata.objective ?? '',
        adFormat: metadata.adFormat ?? '',
        boostPackageId: metadata.boostPackageId ?? '',
        durationPackageId: metadata.durationPackageId ?? '',
        boostTier: metadata.boostTier ?? null,
        billingCycle: metadata.billingCycle ?? null,
        recipientUserId: metadata.recipientUserId ?? null,
        promotedPostId:
          actionType === 'campaign_upgrade'
            ? null
            : (metadata.promotedPostId ?? null),
        durationDays,
        boostWeight,
        ...(paidAt ? { paidAt } : {}),
      },
      { upsert: true, new: true },
    );

    if (
      this.isPaidState({
        paymentStatus: session.payment_status,
        checkoutStatus: session.status,
      })
    ) {
      if (actionType === 'campaign_upgrade') {
        await this.applyCampaignUpgradeSession({
          sessionId: session.id,
          userId: metadata.userId ?? null,
          targetCampaignId: metadata.targetCampaignId ?? null,
          boostPackageId: metadata.boostPackageId ?? null,
          durationPackageId: metadata.durationPackageId ?? null,
          amountTotal: session.amount_total ?? 0,
        });
      } else {
        if (actionType === 'boost_subscribe' || actionType === 'boost_gift') {
          const buyerId = metadata.userId ?? null;
          const recipient =
            actionType === 'boost_gift'
              ? (metadata.recipientUserId ?? null)
              : buyerId;
          const tier = metadata.boostTier === 'boost' ? 'boost' : 'basic';
          const cycle =
            metadata.billingCycle === 'yearly' ? 'yearly' : 'monthly';
          const paidAtDate = paidAt ?? new Date();
          if (recipient) {
            await this.boostService.finalizeBoostPurchaseAfterPayment({
              userId: recipient,
              tier: tier as any,
              billingCycle: cycle as any,
              paidAt: paidAtDate,
              latestSessionId: session.id,
              latestPaymentIntentId: paymentIntentId,
              source: actionType === 'boost_gift' ? 'gift' : 'purchase',
              giftedByUserId: actionType === 'boost_gift' ? buyerId : null,
            });
          }
        } else {
          await this.upsertAdLifecycleForSession({
            sessionId: session.id,
            userId: metadata.userId ?? null,
            boostPackageId: metadata.boostPackageId ?? null,
            durationPackageId: metadata.durationPackageId ?? null,
            promotedPostId: metadata.promotedPostId ?? null,
            paidAt: paidAt ?? new Date(),
          });
          await this.publishPromotedPostIfEligible({
            promotedPostId: metadata.promotedPostId ?? null,
            userId: metadata.userId ?? null,
          });
        }
      }

      if (actionType !== 'boost_subscribe' && actionType !== 'boost_gift') {
        await this.sendAdsPaymentSuccessEmailIfNeeded(session.id);
      }
    }
  }

  private async applyCampaignUpgradeSession(params: {
    sessionId: string;
    userId?: string | null;
    targetCampaignId?: string | null;
    boostPackageId?: string | null;
    durationPackageId?: string | null;
    amountTotal?: number | null;
  }) {
    const {
      sessionId,
      userId,
      targetCampaignId,
      boostPackageId,
      durationPackageId,
      amountTotal,
    } = params;

    const sessionTx = await this.paymentTransactions.findOne({ sessionId });
    if (!sessionTx || sessionTx.upgradeAppliedAt) {
      return;
    }

    if (!targetCampaignId || !Types.ObjectId.isValid(targetCampaignId)) {
      return;
    }

    const targetTx = await this.paymentTransactions.findOne({
      _id: new Types.ObjectId(targetCampaignId),
      ...(userId ? { userId } : {}),
      promotedPostId: { $ne: null },
    });
    if (!targetTx) {
      return;
    }

    const now = new Date();
    const currentBoostPrice = this.getBoostPrice(
      targetTx.boostPackageId ?? null,
    );
    const nextBoostPrice = this.getBoostPrice(boostPackageId ?? null);
    const nextWeight = this.getBoostWeight(boostPackageId ?? null);
    const extraDays = this.getDurationDays(durationPackageId ?? null);

    if (nextBoostPrice >= currentBoostPrice && nextBoostPrice > 0) {
      targetTx.boostPackageId = boostPackageId ?? targetTx.boostPackageId;
      targetTx.boostWeight = nextWeight;
    }

    if (extraDays > 0) {
      const currentExpires = targetTx.expiresAt
        ? new Date(targetTx.expiresAt)
        : now;
      const base =
        currentExpires.getTime() > now.getTime() ? currentExpires : now;
      targetTx.durationDays = (targetTx.durationDays ?? 0) + extraDays;
      targetTx.durationPackageId =
        durationPackageId ?? targetTx.durationPackageId;
      targetTx.expiresAt = new Date(
        base.getTime() + extraDays * 24 * 60 * 60 * 1000,
      );
    }

    const paidValue = Number(amountTotal ?? 0);
    if (Number.isFinite(paidValue) && paidValue > 0) {
      targetTx.amountTotal = (targetTx.amountTotal ?? 0) + paidValue;
    }

    if (
      targetTx.hiddenReason !== 'paused' &&
      targetTx.hiddenReason !== 'canceled' &&
      targetTx.hiddenReason !== 'expired' &&
      targetTx.isExpiredHidden !== true
    ) {
      targetTx.isExpiredHidden = false;
      targetTx.hiddenReason = null;
      targetTx.hiddenAt = null;
    }

    await targetTx.save();
    await this.campaignExpiryScheduler.syncCampaignExpiry({
      campaignId: targetTx._id?.toString?.() ?? null,
      expiresAt: targetTx.expiresAt ?? null,
      hiddenReason: targetTx.hiddenReason ?? null,
      isExpiredHidden: targetTx.isExpiredHidden ?? false,
    });

    sessionTx.actionType = 'campaign_upgrade';
    sessionTx.targetCampaignId = targetCampaignId;
    sessionTx.promotedPostId = null;
    sessionTx.upgradeAppliedAt = now;
    await sessionTx.save();
  }

  async getMyAdsCreationStatus(userId: string) {
    const latestPaidTransaction = await this.paymentTransactions
      .findOne({
        userId,
        $or: [
          { paymentStatus: 'paid' },
          { paymentStatus: 'no_payment_required' },
          { checkoutStatus: 'complete' },
        ],
      })
      .sort({ paidAt: -1, createdAt: -1 })
      .lean();

    return {
      hasCreatedAds: Boolean(latestPaidTransaction),
      latestPaidAt: latestPaidTransaction?.paidAt ?? null,
      latestPaymentId:
        latestPaidTransaction?.paymentIntentId ??
        latestPaidTransaction?.sessionId ??
        null,
    };
  }

  async getAdsCampaignDetail(userId: string, campaignId: string) {
    if (!Types.ObjectId.isValid(campaignId)) {
      throw new BadRequestException('Invalid campaignId');
    }

    const dashboard = await this.getAdsDashboard(userId);
    const campaign = dashboard.campaigns.find((item) => item.id === campaignId);
    if (!campaign) {
      throw new BadRequestException('Campaign not found');
    }

    const tx = await this.paymentTransactions
      .findOne({ _id: new Types.ObjectId(campaignId), userId })
      .select(
        'objective adFormat adPrimaryText adHeadline adDescription destinationUrl ctaLabel interests targetLocation targetAgeMin targetAgeMax placement mediaUrls boostPackageId durationPackageId durationDays boostWeight hiddenReason adminCancelReason isExpiredHidden startsAt expiresAt promotedPostId',
      )
      .lean();

    if (!tx) {
      throw new BadRequestException('Campaign not found');
    }

    const now = new Date();

    const promotedPostId = String(
      campaign.promotedPostId ?? tx.promotedPostId ?? '',
    );
    const promotedPost = Types.ObjectId.isValid(promotedPostId)
      ? await this.postModel
          .findOne({ _id: new Types.ObjectId(promotedPostId), deletedAt: null })
          .select('content media')
          .lean()
      : null;

    const parsedCreative = this.parseCreativeContent(
      promotedPost?.content ?? '',
    );
    const postMediaUrls = Array.isArray(promotedPost?.media)
      ? promotedPost.media
          .map((item) => item?.url?.toString?.() ?? '')
          .filter((url) => Boolean(url))
      : [];

    return {
      ...campaign,
      objective: tx.objective ?? '',
      adFormat: tx.adFormat ?? '',
      primaryText: tx.adPrimaryText || parsedCreative.primaryText,
      headline: tx.adHeadline || parsedCreative.headline,
      adDescription: tx.adDescription || parsedCreative.adDescription,
      destinationUrl: tx.destinationUrl || parsedCreative.destinationUrl,
      cta: tx.ctaLabel || parsedCreative.cta || '',
      interests: Array.isArray(tx.interests) ? tx.interests : [],
      locationText: tx.targetLocation ?? '',
      ageMin: typeof tx.targetAgeMin === 'number' ? tx.targetAgeMin : null,
      ageMax: typeof tx.targetAgeMax === 'number' ? tx.targetAgeMax : null,
      placement: tx.placement ?? 'home_feed',
      mediaUrls:
        Array.isArray(tx.mediaUrls) && tx.mediaUrls.length > 0
          ? tx.mediaUrls
          : postMediaUrls,
      boostPackageId: tx.boostPackageId ?? '',
      durationPackageId: tx.durationPackageId ?? '',
      durationDays: tx.durationDays ?? 0,
      boostWeight: tx.boostWeight ?? 0,
      hiddenReason: tx.hiddenReason ?? null,
      adminCancelReason:
        typeof tx.adminCancelReason === 'string' ? tx.adminCancelReason : null,
      actions: {
        canChangeBoost: tx.hiddenReason !== 'canceled',
        canExtend: tx.hiddenReason !== 'canceled',
        canPause:
          tx.hiddenReason !== 'canceled' &&
          tx.hiddenReason !== 'paused' &&
          tx.hiddenReason !== 'expired' &&
          tx.isExpiredHidden !== true,
        canResume:
          tx.hiddenReason !== 'canceled' &&
          (tx.hiddenReason === 'paused' ||
            tx.hiddenReason === 'expired' ||
            tx.isExpiredHidden === true),
        canCancel: false,
        requiresExtendBeforeResume:
          (tx.hiddenReason === 'expired' || tx.isExpiredHidden === true) &&
          (!tx.expiresAt || new Date(tx.expiresAt).getTime() <= now.getTime()),
      },
    };
  }

  async performAdsCampaignAction(
    userId: string,
    campaignId: string,
    params: {
      action:
        | 'change_boost'
        | 'extend_days'
        | 'pause_campaign'
        | 'resume_campaign'
        | 'cancel_campaign'
        | 'update_details';
      boostPackageId?: string;
      extendDays?: number;
      campaignName?: string;
      objective?: string;
      adFormat?: string;
      primaryText?: string;
      headline?: string;
      adDescription?: string;
      destinationUrl?: string;
      cta?: string;
      interests?: string[];
      locationText?: string;
      ageMin?: number | null;
      ageMax?: number | null;
      placement?: string;
      mediaUrls?: string[];
    },
  ) {
    if (!Types.ObjectId.isValid(campaignId)) {
      throw new BadRequestException('Invalid campaignId');
    }

    const tx = await this.paymentTransactions.findOne({
      _id: new Types.ObjectId(campaignId),
      userId,
      promotedPostId: { $ne: null },
      $or: [
        { paymentStatus: 'paid' },
        { paymentStatus: 'no_payment_required' },
        { checkoutStatus: 'complete' },
      ],
    });

    if (!tx) {
      throw new BadRequestException('Campaign not found');
    }

    const now = new Date();

    switch (params.action) {
      case 'change_boost': {
        const boostPackageId = params.boostPackageId ?? '';
        const nextWeight = this.boostWeightByPackage[boostPackageId];
        if (!nextWeight) {
          throw new BadRequestException('Invalid boostPackageId');
        }
        tx.boostPackageId = boostPackageId;
        tx.boostWeight = nextWeight;
        break;
      }

      case 'extend_days': {
        const extendDays = Number(params.extendDays ?? 0);
        if (!Number.isFinite(extendDays) || extendDays < 1 || extendDays > 90) {
          throw new BadRequestException('extendDays must be between 1 and 90');
        }
        const currentExpires = tx.expiresAt ? new Date(tx.expiresAt) : now;
        const base =
          currentExpires.getTime() > now.getTime() ? currentExpires : now;
        tx.durationDays = (tx.durationDays ?? 0) + extendDays;
        tx.expiresAt = new Date(
          base.getTime() + extendDays * 24 * 60 * 60 * 1000,
        );
        if (
          tx.hiddenReason !== 'paused' &&
          tx.hiddenReason !== 'canceled' &&
          tx.hiddenReason !== 'expired' &&
          tx.isExpiredHidden !== true
        ) {
          tx.isExpiredHidden = false;
          tx.hiddenReason = null;
          tx.hiddenAt = null;
        }
        break;
      }

      case 'pause_campaign': {
        if (tx.hiddenReason === 'canceled') {
          throw new BadRequestException('Canceled campaign cannot be paused');
        }
        tx.isExpiredHidden = true;
        tx.hiddenReason = 'paused';
        tx.adminCancelReason = null;
        tx.hiddenAt = now;
        await this.mergeRepostMetricsAndDeleteReposts({
          userId,
          promotedPostId: tx.promotedPostId,
          now,
        });
        break;
      }

      case 'resume_campaign': {
        const canResumeHidden =
          tx.hiddenReason === 'paused' ||
          tx.hiddenReason === 'expired' ||
          tx.isExpiredHidden === true;
        if (!canResumeHidden) {
          throw new BadRequestException('Campaign is already visible');
        }
        if (tx.hiddenReason === 'canceled') {
          throw new BadRequestException('Canceled campaign cannot be reopened');
        }

        const expiresAt = tx.expiresAt ? new Date(tx.expiresAt) : null;
        if (!expiresAt || expiresAt.getTime() <= now.getTime()) {
          throw new BadRequestException(
            'Campaign has expired. Please extend campaign days before reopening.',
          );
        }

        tx.isExpiredHidden = false;
        tx.hiddenReason = null;
        tx.adminCancelReason = null;
        tx.hiddenAt = null;
        break;
      }

      case 'cancel_campaign': {
        tx.isExpiredHidden = true;
        tx.hiddenReason = 'canceled';
        tx.adminCancelReason = null;
        tx.hiddenAt = now;
        tx.expiresAt = now;
        break;
      }

      case 'update_details': {
        const campaignName = (params.campaignName ?? '').trim();
        const objective = (params.objective ?? '').trim();
        const adFormat = (params.adFormat ?? '').trim();
        const primaryText = (params.primaryText ?? '').trim();
        const headline = (params.headline ?? '').trim();
        const adDescription = (params.adDescription ?? '').trim();
        const destinationUrl = (params.destinationUrl ?? '').trim();
        const cta = (params.cta ?? '').trim();
        const locationText = (params.locationText ?? '').trim();
        const placement = (params.placement ?? 'home_feed').trim();
        const interests = Array.from(
          new Set(
            (params.interests ?? [])
              .map((item) => String(item).trim())
              .filter(Boolean),
          ),
        ).slice(0, 30);
        const mediaUrls = Array.from(
          new Set(
            (params.mediaUrls ?? [])
              .map((item) => String(item).trim())
              .filter(Boolean),
          ),
        ).slice(0, 8);

        const ageMin =
          typeof params.ageMin === 'number' && Number.isFinite(params.ageMin)
            ? Math.max(13, Math.min(120, Math.floor(params.ageMin)))
            : null;
        const ageMax =
          typeof params.ageMax === 'number' && Number.isFinite(params.ageMax)
            ? Math.max(13, Math.min(120, Math.floor(params.ageMax)))
            : null;

        if (destinationUrl) {
          try {
            const parsed = new URL(destinationUrl);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
              throw new Error('invalid destinationUrl protocol');
            }
          } catch {
            throw new BadRequestException('destinationUrl is invalid');
          }
        }

        tx.campaignName = campaignName || tx.campaignName || '';
        tx.objective = objective;
        tx.adFormat = adFormat;
        tx.adPrimaryText = primaryText;
        tx.adHeadline = headline;
        tx.adDescription = adDescription;
        tx.destinationUrl = destinationUrl;
        tx.ctaLabel = cta;
        tx.interests = interests;
        tx.targetLocation = locationText;
        tx.targetAgeMin = ageMin;
        tx.targetAgeMax = ageMax;
        tx.placement = placement;
        tx.mediaUrls = mediaUrls;

        if (tx.promotedPostId && Types.ObjectId.isValid(tx.promotedPostId)) {
          const content = this.buildCreativeContent({
            primaryText,
            headline,
            adDescription,
            destinationUrl,
            ctaLabel: cta,
          });
          const media = mediaUrls.map((url) => ({
            type: this.inferMediaTypeFromUrl(url),
            url,
            metadata: null,
          }));

          await this.postModel
            .updateOne(
              {
                _id: new Types.ObjectId(String(tx.promotedPostId)),
                authorId: new Types.ObjectId(userId),
                deletedAt: null,
              },
              {
                $set: {
                  content,
                  media,
                },
              },
            )
            .exec();
        }
        break;
      }

      default:
        throw new BadRequestException('Unsupported action');
    }

    await tx.save();
    await this.campaignExpiryScheduler.syncCampaignExpiry({
      campaignId: tx._id?.toString?.() ?? null,
      expiresAt: tx.expiresAt ?? null,
      hiddenReason: tx.hiddenReason ?? null,
      isExpiredHidden: tx.isExpiredHidden ?? false,
    });
    return this.getAdsCampaignDetail(userId, campaignId);
  }

  constructWebhookEvent(rawBody: Buffer, signature: string | undefined) {
    if (!signature) {
      throw new InternalServerErrorException('Missing Stripe signature header');
    }

    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.config.stripeWebhookSecret,
    );
  }
}

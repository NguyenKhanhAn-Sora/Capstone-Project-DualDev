import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BoostBillingCycle,
  BoostEntitlement,
  BoostScope,
  BoostTier,
} from './boost-entitlement.schema';
import { DirectMessagesGateway } from '../direct-messages/direct-messages.gateway';
import { ChannelMessagesGateway } from '../messages/channel-messages.gateway';

export type BoostLimits = {
  maxUploadBytes: number;
  hdScreenShare: boolean;
  serverBoostSlots: number;
  crossServerEmojis: boolean;
  crossServerStickers: boolean;
  /** Gửi sticker máy chủ (từ máy chủ đã tham gia) trong tin nhắn trực tiếp */
  dmServerStickers: boolean;
};

export type BoostStatusResponse = {
  scope: BoostScope;
  tier: BoostTier | null;
  active: boolean;
  expiresAt: string | null;
  billingCycle?: BoostBillingCycle | null;
  source?: 'purchase' | 'gift' | null;
  limits: BoostLimits;
};

const BASIC_LIMITS: BoostLimits = {
  maxUploadBytes: 300 * 1024 * 1024,
  hdScreenShare: false,
  serverBoostSlots: 0,
  crossServerEmojis: true,
  crossServerStickers: false,
  dmServerStickers: true,
};

const BOOST_LIMITS: BoostLimits = {
  maxUploadBytes: 600 * 1024 * 1024,
  hdScreenShare: true,
  serverBoostSlots: 2,
  crossServerEmojis: true,
  crossServerStickers: true,
  dmServerStickers: true,
};

/** Giới hạn upload mặc định (không gói Boost): 100MB — DM, máy chủ, avatar/banner, v.v. */
export const FREE_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const FREE_LIMITS: BoostLimits = {
  maxUploadBytes: FREE_MAX_UPLOAD_BYTES,
  hdScreenShare: false,
  serverBoostSlots: 0,
  crossServerEmojis: false,
  crossServerStickers: false,
  dmServerStickers: false,
};

@Injectable()
export class BoostService {
  constructor(
    @InjectModel(BoostEntitlement.name)
    private readonly boostEntitlementModel: Model<BoostEntitlement>,
    @Inject(forwardRef(() => DirectMessagesGateway))
    private readonly directMessagesGateway: DirectMessagesGateway,
    @Inject(forwardRef(() => ChannelMessagesGateway))
    private readonly channelMessagesGateway: ChannelMessagesGateway,
  ) {}

  computeLimits(tier: BoostTier | null): BoostLimits {
    if (tier === 'boost') return BOOST_LIMITS;
    if (tier === 'basic') return BASIC_LIMITS;
    return FREE_LIMITS;
  }

  private scopeFilter(scope: BoostScope): Record<string, unknown> {
    if (scope === 'messages') {
      return {
        $or: [
          { scope: 'messages' },
          { scope: { $exists: false } },
          { scope: null },
        ],
      };
    }
    return { scope: 'social' };
  }

  async getBoostStatus(
    userId: string,
    scope: BoostScope = 'messages',
  ): Promise<BoostStatusResponse> {
    const now = new Date();
    const ent = await this.boostEntitlementModel
      .findOne({
        userId,
        status: 'active',
        expiresAt: { $gt: now },
        ...this.scopeFilter(scope),
      })
      .sort({ expiresAt: -1 })
      .lean()
      .exec();

    const tier = ent?.tier ?? null;
    const active = Boolean(ent?._id && tier);
    const expiresAt = ent?.expiresAt
      ? new Date(ent.expiresAt).toISOString()
      : null;
    return {
      scope,
      tier,
      active,
      expiresAt,
      billingCycle: ent?.billingCycle ?? null,
      source: ent?.source ?? null,
      limits: this.computeLimits(tier),
    };
  }

  private addBillingCycleDuration(
    from: Date,
    billingCycle: BoostBillingCycle,
  ): Date {
    const days = billingCycle === 'yearly' ? 365 : 30;
    return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  }

  /**
   * Applies a paid Boost checkout: same-tier renewals stack onto remaining time;
   * tier changes replace entitlement without carrying over remaining time.
   * Idempotent per Stripe session via latestSessionId.
   */
  async finalizeBoostPurchaseAfterPayment(params: {
    userId: string;
    scope?: BoostScope;
    tier: BoostTier;
    billingCycle: BoostBillingCycle;
    paidAt: Date;
    latestSessionId: string;
    latestPaymentIntentId?: string | null;
    source: 'purchase' | 'gift';
    giftedByUserId?: string | null;
  }): Promise<BoostStatusResponse> {
    const {
      userId,
      tier,
      billingCycle,
      paidAt,
      latestSessionId,
      latestPaymentIntentId,
      source,
      giftedByUserId,
    } = params;
    const scope: BoostScope =
      params.scope === 'social' ? 'social' : 'messages';

    const doc = await this.boostEntitlementModel
      .findOne({
        userId,
        status: 'active',
        ...this.scopeFilter(scope),
      })
      .sort({ expiresAt: -1 })
      .lean()
      .exec();

    if (doc?.latestSessionId === latestSessionId) {
      return this.getBoostStatus(userId, scope);
    }

    const now = paidAt;
    const existingExpires = doc?.expiresAt ? new Date(doc.expiresAt) : null;
    const active =
      Boolean(doc) &&
      doc!.status === 'active' &&
      existingExpires !== null &&
      existingExpires.getTime() > now.getTime();
    const durationAnchor = this.addBillingCycleDuration(now, billingCycle);

    let startsAt: Date;
    let expiresAt: Date;

    if (active && doc!.tier === tier) {
      const baseMs = Math.max(existingExpires.getTime(), now.getTime());
      startsAt = new Date(doc!.startsAt ?? now);
      expiresAt = this.addBillingCycleDuration(new Date(baseMs), billingCycle);
    } else if (active && doc!.tier !== tier) {
      startsAt = now;
      expiresAt = durationAnchor;
    } else {
      startsAt = now;
      expiresAt = durationAnchor;
    }

    const writeFilter = doc?._id
      ? { _id: doc._id }
      : { userId, scope };

    await this.boostEntitlementModel
      .updateOne(
        writeFilter,
        {
          $set: {
            userId,
            scope,
            tier,
            billingCycle,
            status: 'active',
            startsAt,
            expiresAt,
            source,
            latestSessionId,
            latestPaymentIntentId: latestPaymentIntentId ?? null,
            giftedByUserId: giftedByUserId ?? null,
          },
        },
        { upsert: true },
      )
      .exec();

    const status = await this.getBoostStatus(userId, scope);
    this.emitBoostEntitlementUpdated(userId, status);
    return status;
  }

  async upsertActiveEntitlement(params: {
    userId: string;
    scope?: BoostScope;
    tier: BoostTier;
    billingCycle: BoostBillingCycle;
    startsAt: Date;
    expiresAt: Date;
    source: 'purchase' | 'gift';
    latestSessionId?: string | null;
    latestPaymentIntentId?: string | null;
    giftedByUserId?: string | null;
  }) {
    const { userId, tier, billingCycle, startsAt, expiresAt } = params;
    const scope: BoostScope =
      params.scope === 'social' ? 'social' : 'messages';

    const existing = await this.boostEntitlementModel
      .findOne({ userId, ...this.scopeFilter(scope) })
      .lean()
      .exec();
    const writeFilter = existing?._id
      ? { _id: existing._id }
      : { userId, scope };

    await this.boostEntitlementModel
      .updateOne(
        writeFilter,
        {
          $set: {
            userId,
            scope,
            tier,
            billingCycle,
            status: 'active',
            startsAt,
            expiresAt,
            source: params.source,
            latestSessionId: params.latestSessionId ?? null,
            latestPaymentIntentId: params.latestPaymentIntentId ?? null,
            giftedByUserId: params.giftedByUserId ?? null,
          },
        },
        { upsert: true },
      )
      .exec();

    const status = await this.getBoostStatus(userId, scope);
    this.emitBoostEntitlementUpdated(userId, status);
    return status;
  }

  emitBoostEntitlementUpdated(userId: string, status: BoostStatusResponse) {
    const payload = {
      userId,
      scope: status.scope,
      tier: status.tier,
      active: status.active,
      unlocked: status.active,
      expiresAt: status.expiresAt,
      limits: status.limits,
    };
    try {
      this.directMessagesGateway?.emitToUser?.(
        userId,
        'boost-entitlement-updated',
        payload,
      );
    } catch {
      // ignore
    }
    try {
      this.channelMessagesGateway?.emitToUser?.(
        userId,
        'boost-entitlement-updated',
        payload,
      );
    } catch {
      // ignore
    }
  }
}

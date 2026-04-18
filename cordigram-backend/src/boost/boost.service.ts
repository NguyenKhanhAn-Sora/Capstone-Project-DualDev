import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BoostBillingCycle,
  BoostEntitlement,
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
};

export type BoostStatusResponse = {
  tier: BoostTier | null;
  active: boolean;
  expiresAt: string | null;
  limits: BoostLimits;
};

const BASIC_LIMITS: BoostLimits = {
  maxUploadBytes: 300 * 1024 * 1024,
  hdScreenShare: false,
  serverBoostSlots: 0,
  crossServerEmojis: true,
  crossServerStickers: false,
};

const BOOST_LIMITS: BoostLimits = {
  maxUploadBytes: 600 * 1024 * 1024,
  hdScreenShare: true,
  serverBoostSlots: 2,
  crossServerEmojis: true,
  crossServerStickers: true,
};

/** Giới hạn upload mặc định (không Boost) — dùng cho Social / request không kèm context Messages. */
export const FREE_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const FREE_LIMITS: BoostLimits = {
  maxUploadBytes: FREE_MAX_UPLOAD_BYTES,
  hdScreenShare: false,
  serverBoostSlots: 0,
  crossServerEmojis: false,
  crossServerStickers: false,
};

@Injectable()
export class BoostService {
  constructor(
    @InjectModel(BoostEntitlement.name)
    private readonly boostEntitlementModel: Model<BoostEntitlement>,
    private readonly directMessagesGateway: DirectMessagesGateway,
    private readonly channelMessagesGateway: ChannelMessagesGateway,
  ) {}

  computeLimits(tier: BoostTier | null): BoostLimits {
    if (tier === 'boost') return BOOST_LIMITS;
    if (tier === 'basic') return BASIC_LIMITS;
    return FREE_LIMITS;
  }

  async getBoostStatus(userId: string): Promise<BoostStatusResponse> {
    const now = new Date();
    const ent = await this.boostEntitlementModel
      .findOne({
        userId,
        status: 'active',
        expiresAt: { $gt: now },
      })
      .sort({ expiresAt: -1 })
      .lean()
      .exec();

    const tier = (ent?.tier as BoostTier | undefined) ?? null;
    const active = Boolean(ent?._id && tier);
    const expiresAt = ent?.expiresAt ? new Date(ent.expiresAt).toISOString() : null;
    return {
      tier,
      active,
      expiresAt,
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

    const doc = await this.boostEntitlementModel
      .findOne({ userId })
      .lean()
      .exec();

    if (doc?.latestSessionId === latestSessionId) {
      return this.getBoostStatus(userId);
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
      const baseMs = Math.max(existingExpires!.getTime(), now.getTime());
      startsAt = new Date(doc!.startsAt ?? now);
      expiresAt = this.addBillingCycleDuration(new Date(baseMs), billingCycle);
    } else if (active && doc!.tier !== tier) {
      startsAt = now;
      expiresAt = durationAnchor;
    } else {
      startsAt = now;
      expiresAt = durationAnchor;
    }

    await this.boostEntitlementModel
      .updateOne(
        { userId },
        {
          $set: {
            userId,
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

    const status = await this.getBoostStatus(userId);
    this.emitBoostEntitlementUpdated(userId, status);
    return status;
  }

  async upsertActiveEntitlement(params: {
    userId: string;
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

    await this.boostEntitlementModel
      .updateOne(
        { userId },
        {
          $set: {
            userId,
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

    const status = await this.getBoostStatus(userId);
    this.emitBoostEntitlementUpdated(userId, status);
    return status;
  }

  emitBoostEntitlementUpdated(userId: string, status: BoostStatusResponse) {
    const payload = {
      userId,
      tier: status.tier,
      active: status.active,
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
      this.channelMessagesGateway?.emitToUser?.(userId, 'boost-entitlement-updated', payload);
    } catch {
      // ignore
    }
  }
}


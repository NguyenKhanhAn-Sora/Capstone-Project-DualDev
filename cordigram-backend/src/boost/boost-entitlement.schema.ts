import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BoostTier = 'basic' | 'boost';
export type BoostBillingCycle = 'monthly' | 'yearly';
export type BoostEntitlementStatus = 'active' | 'expired' | 'canceled';
export type BoostEntitlementSource = 'purchase' | 'gift';

@Schema({ timestamps: true })
export class BoostEntitlement extends Document {
  @Prop({ type: String, required: true, index: true })
  userId!: string;

  @Prop({ type: String, required: true })
  tier!: BoostTier;

  @Prop({ type: String, required: true })
  billingCycle!: BoostBillingCycle;

  @Prop({ type: String, default: 'active', index: true })
  status!: BoostEntitlementStatus;

  @Prop({ type: Date, required: true })
  startsAt!: Date;

  @Prop({ type: Date, required: true, index: true })
  expiresAt!: Date;

  @Prop({ type: String, default: 'purchase' })
  source!: BoostEntitlementSource;

  @Prop({ type: String, default: null })
  latestSessionId?: string | null;

  @Prop({ type: String, default: null })
  latestPaymentIntentId?: string | null;

  @Prop({ type: String, default: null })
  giftedByUserId?: string | null;
}

export const BoostEntitlementSchema =
  SchemaFactory.createForClass(BoostEntitlement);

BoostEntitlementSchema.index({ userId: 1, status: 1, expiresAt: -1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class PaymentTransaction extends Document {
  @Prop({ type: String, default: 'campaign_create', index: true })
  actionType?: string;

  @Prop({ type: String, default: null, index: true })
  targetCampaignId?: string | null;

  @Prop({ type: Date, default: null })
  upgradeAppliedAt?: Date | null;

  @Prop({ type: String, required: true, index: true })
  userId: string;

  @Prop({ type: String, required: true, unique: true, index: true })
  sessionId: string;

  @Prop({ type: String, default: null, index: true })
  paymentIntentId?: string | null;

  @Prop({ type: String, default: null })
  customerEmail?: string | null;

  @Prop({ type: Number, required: true })
  amountTotal: number;

  @Prop({ type: String, default: 'vnd' })
  currency: string;

  @Prop({ type: String, default: null, index: true })
  paymentStatus?: string | null;

  @Prop({ type: String, default: null })
  checkoutStatus?: string | null;

  @Prop({ type: String, default: '' })
  objective?: string;

  @Prop({ type: String, default: '' })
  campaignName?: string;

  @Prop({ type: String, default: '' })
  adFormat?: string;

  @Prop({ type: String, default: '' })
  adPrimaryText?: string;

  @Prop({ type: String, default: '' })
  adHeadline?: string;

  @Prop({ type: String, default: '' })
  adDescription?: string;

  @Prop({ type: String, default: '' })
  destinationUrl?: string;

  @Prop({ type: String, default: '' })
  ctaLabel?: string;

  @Prop({ type: [String], default: [] })
  interests?: string[];

  @Prop({ type: String, default: '' })
  targetLocation?: string;

  @Prop({ type: Number, default: null })
  targetAgeMin?: number | null;

  @Prop({ type: Number, default: null })
  targetAgeMax?: number | null;

  @Prop({ type: String, default: 'home_feed' })
  placement?: string;

  @Prop({ type: [String], default: [] })
  mediaUrls?: string[];

  @Prop({ type: String, default: '' })
  boostPackageId?: string;

  @Prop({ type: String, default: '' })
  durationPackageId?: string;

  @Prop({ type: Number, default: 0 })
  durationDays?: number;

  @Prop({ type: Number, default: 0 })
  boostWeight?: number;

  @Prop({ type: String, default: null, index: true })
  promotedPostId?: string | null;

  @Prop({ type: Date, default: null })
  startsAt?: Date | null;

  @Prop({ type: Date, default: null, index: true })
  expiresAt?: Date | null;

  @Prop({ type: Boolean, default: false, index: true })
  isExpiredHidden?: boolean;

  @Prop({ type: Date, default: null })
  hiddenAt?: Date | null;

  @Prop({ type: String, default: null })
  hiddenReason?: string | null;

  @Prop({ type: String, default: null })
  adminCancelReason?: string | null;

  @Prop({ type: Date, default: null, index: true })
  paidAt?: Date | null;

  @Prop({ type: Date, default: null })
  adsReceiptEmailSentAt?: Date | null;

  @Prop({ type: Date, default: null })
  adsReceiptEmailSendingAt?: Date | null;

  @Prop({ type: String, default: null })
  adsReceiptEmailError?: string | null;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const PaymentTransactionSchema =
  SchemaFactory.createForClass(PaymentTransaction);

PaymentTransactionSchema.index({ userId: 1, createdAt: -1 });
PaymentTransactionSchema.index({ userId: 1, paymentStatus: 1 });
PaymentTransactionSchema.index({ promotedPostId: 1, expiresAt: 1 });

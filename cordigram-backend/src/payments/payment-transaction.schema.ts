import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class PaymentTransaction extends Document {
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
  adFormat?: string;

  @Prop({ type: String, default: '' })
  boostPackageId?: string;

  @Prop({ type: String, default: '' })
  durationPackageId?: string;

  @Prop({ type: Date, default: null, index: true })
  paidAt?: Date | null;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const PaymentTransactionSchema =
  SchemaFactory.createForClass(PaymentTransaction);

PaymentTransactionSchema.index({ userId: 1, createdAt: -1 });
PaymentTransactionSchema.index({ userId: 1, paymentStatus: 1 });

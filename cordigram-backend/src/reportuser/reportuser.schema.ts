import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReportUserCategory =
  | 'abuse'
  | 'violence'
  | 'sensitive'
  | 'misinfo'
  | 'spam'
  | 'ip'
  | 'illegal'
  | 'privacy'
  | 'other';

export const ReportUserReasons: Record<ReportUserCategory, string[]> = {
  abuse: ['harassment', 'hate_speech', 'offensive_discrimination'],
  violence: ['violence_threats', 'graphic_violence', 'extremism', 'self_harm'],
  sensitive: ['nudity', 'minor_nudity', 'sexual_solicitation'],
  misinfo: ['fake_news', 'impersonation'],
  spam: ['spam', 'financial_scam', 'unsolicited_ads'],
  ip: ['copyright', 'trademark', 'brand_impersonation'],
  illegal: ['contraband', 'illegal_transaction'],
  privacy: ['doxxing', 'nonconsensual_intimate'],
  other: ['other'],
};

@Schema({ timestamps: true })
export class ReportUser extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  reporterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  targetUserId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: Object.keys(ReportUserReasons),
    index: true,
  })
  category: ReportUserCategory;

  @Prop({ type: String, required: true })
  reason: string;

  @Prop({ type: String, trim: true, maxlength: 500, default: null })
  note?: string | null;

  @Prop({ type: String, default: 'open', index: true })
  status?: 'open' | 'resolved';

  @Prop({ type: String, default: null })
  resolvedAction?: string | null;

  @Prop({ type: String, default: null })
  resolvedCategory?: string | null;

  @Prop({ type: String, default: null })
  resolvedReason?: string | null;

  @Prop({ type: String, enum: ['low', 'medium', 'high'], default: null })
  resolvedSeverity?: 'low' | 'medium' | 'high' | null;

  @Prop({ type: String, trim: true, maxlength: 500, default: null })
  resolvedNote?: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  resolvedBy?: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  resolvedAt?: Date | null;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const ReportUserSchema = SchemaFactory.createForClass(ReportUser);
ReportUserSchema.index({ reporterId: 1, targetUserId: 1 }, { unique: true });

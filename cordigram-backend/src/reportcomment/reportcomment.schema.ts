import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReportCommentCategory =
  | 'abuse'
  | 'violence'
  | 'sensitive'
  | 'misinfo'
  | 'spam'
  | 'ip'
  | 'illegal'
  | 'privacy'
  | 'other';

export const ReportCommentReasons: Record<ReportCommentCategory, string[]> = {
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
export class ReportComment extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  reporterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Comment', required: true, index: true })
  commentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Post', required: true, index: true })
  postId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: Object.keys(ReportCommentReasons),
    index: true,
  })
  category: ReportCommentCategory;

  @Prop({ type: String, required: true })
  reason: string;

  @Prop({ type: String, trim: true, maxlength: 500, default: null })
  note?: string | null;
}

export const ReportCommentSchema = SchemaFactory.createForClass(ReportComment);

ReportCommentSchema.index({ reporterId: 1, commentId: 1 }, { unique: true });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CreatorVerificationStatus = 'pending' | 'approved' | 'rejected';

export type CreatorEligibilitySnapshot = {
  score: number;
  minimumScore: number;
  accountAgeDays: number;
  minAccountAgeDays: number;
  followersCount: number;
  minFollowersCount: number;
  postsCount: number;
  minPostsCount: number;
  activePostingDays30d: number;
  minActivePostingDays30d: number;
  engagementPerPost30d: number;
  minEngagementPerPost30d: number;
  recentViolations90d: number;
  maxRecentViolations90d: number;
  eligible: boolean;
  failedRequirements: string[];
};

@Schema({ timestamps: true })
export class CreatorVerificationRequest extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    required: true,
  })
  status: CreatorVerificationStatus;

  @Prop({ type: String, trim: true, maxlength: 600, default: '' })
  requestNote: string;

  @Prop({
    type: {
      score: { type: Number, default: 0 },
      minimumScore: { type: Number, default: 0 },
      accountAgeDays: { type: Number, default: 0 },
      minAccountAgeDays: { type: Number, default: 0 },
      followersCount: { type: Number, default: 0 },
      minFollowersCount: { type: Number, default: 0 },
      postsCount: { type: Number, default: 0 },
      minPostsCount: { type: Number, default: 0 },
      activePostingDays30d: { type: Number, default: 0 },
      minActivePostingDays30d: { type: Number, default: 0 },
      engagementPerPost30d: { type: Number, default: 0 },
      minEngagementPerPost30d: { type: Number, default: 0 },
      recentViolations90d: { type: Number, default: 0 },
      maxRecentViolations90d: { type: Number, default: 0 },
      eligible: { type: Boolean, default: false },
      failedRequirements: { type: [String], default: [] },
    },
    _id: false,
    required: true,
  })
  eligibility: CreatorEligibilitySnapshot;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  reviewedBy?: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  reviewedAt?: Date | null;

  @Prop({ type: String, trim: true, maxlength: 800, default: null })
  decisionReason?: string | null;

  @Prop({ type: Date, default: null })
  cooldownUntil?: Date | null;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const CreatorVerificationRequestSchema = SchemaFactory.createForClass(
  CreatorVerificationRequest,
);

CreatorVerificationRequestSchema.index({ userId: 1, createdAt: -1 });
CreatorVerificationRequestSchema.index({ status: 1, createdAt: -1 });

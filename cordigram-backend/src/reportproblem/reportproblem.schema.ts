import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReportProblemStatus = 'open' | 'in_progress' | 'resolved';

export type ReportProblemAttachment = {
  url: string;
  secureUrl: string;
  publicId: string;
  resourceType: string;
  bytes: number;
  format?: string;
  width?: number;
  height?: number;
  duration?: number;
};

@Schema({ timestamps: true })
export class ReportProblem extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  reporterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 2000 })
  description: string;

  @Prop({
    type: [
      {
        url: { type: String, required: true },
        secureUrl: { type: String, required: true },
        publicId: { type: String, required: true },
        resourceType: { type: String, required: true },
        bytes: { type: Number, required: true },
        format: { type: String },
        width: { type: Number },
        height: { type: Number },
        duration: { type: Number },
      },
    ],
    default: [],
  })
  attachments: ReportProblemAttachment[];

  @Prop({
    type: String,
    enum: ['open', 'in_progress', 'resolved'],
    default: 'open',
    index: true,
  })
  status: ReportProblemStatus;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const ReportProblemSchema = SchemaFactory.createForClass(ReportProblem);

ReportProblemSchema.index({ createdAt: -1 });
ReportProblemSchema.index({ userId: 1, createdAt: -1 });

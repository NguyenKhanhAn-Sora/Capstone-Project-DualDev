import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Rule extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Server', required: true, index: true })
  serverId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 1000 })
  content: string;
}

export const RuleSchema = SchemaFactory.createForClass(Rule);

RuleSchema.index({ serverId: 1, content: 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CompanyStatus = 'active' | 'pending';

@Schema({ timestamps: true })
export class Company extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  // Lowercase + diacritics removed + whitespace normalized.
  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  nameNormalized: string;

  @Prop({ type: [String], default: [] })
  aliases: string[];

  @Prop({ type: [String], default: [], index: true })
  aliasesNormalized: string[];

  @Prop({
    type: String,
    enum: ['active', 'pending'],
    default: 'active',
    index: true,
  })
  status: CompanyStatus;

  @Prop({ type: Number, default: 0, index: true })
  memberCount: number;
}

export const CompanySchema = SchemaFactory.createForClass(Company);
CompanySchema.index({ nameNormalized: 1 }, { unique: true });
CompanySchema.index({ status: 1, memberCount: -1 });

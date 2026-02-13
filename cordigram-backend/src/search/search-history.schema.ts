import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SearchHistoryKind =
  | 'profile'
  | 'hashtag'
  | 'post'
  | 'reel'
  | 'query';

@Schema({ timestamps: true })
export class SearchHistoryItem {
  @Prop({ type: String, required: true })
  key: string;

  @Prop({
    type: String,
    enum: ['profile', 'hashtag', 'post', 'reel', 'query'],
    required: true,
  })
  kind: SearchHistoryKind;

  @Prop({ type: String, default: '' })
  label: string;

  @Prop({ type: String, default: '' })
  subtitle: string;

  @Prop({ type: String, default: '' })
  imageUrl: string;

  @Prop({ type: String, default: '' })
  mediaType: '' | 'image' | 'video';

  @Prop({ type: String, default: '' })
  refId: string;

  @Prop({ type: String, default: '' })
  refSlug: string;

  @Prop({ type: Date, default: () => new Date() })
  lastUsedAt: Date;
}

@Schema({ timestamps: true })
export class SearchHistory extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', unique: true, index: true })
  userId: Types.ObjectId;

  @Prop({
    type: [SchemaFactory.createForClass(SearchHistoryItem)],
    default: [],
  })
  items: SearchHistoryItem[];
}

export const SearchHistoryItemSchema =
  SchemaFactory.createForClass(SearchHistoryItem);
export const SearchHistorySchema = SchemaFactory.createForClass(SearchHistory);

SearchHistorySchema.index({ userId: 1 }, { unique: true });
SearchHistorySchema.index({ userId: 1, 'items.lastUsedAt': -1 });

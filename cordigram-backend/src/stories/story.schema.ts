import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StoryMediaType = 'image' | 'video';
export type StoryType = 'media' | 'text';
export type StoryVisibility = 'public' | 'followers' | 'private';

@Schema({ _id: false })
export class StoryTextOverlay {
  @Prop({ type: String, required: true })
  text: string;

  @Prop({ type: String, default: '#ffffff' })
  color: string;

  @Prop({ type: String })
  backgroundColor?: string;

  @Prop({ type: Number, default: 5 })
  fontSize: number;

  @Prop({ type: String, enum: ['left', 'center', 'right'], default: 'center' })
  align: 'left' | 'center' | 'right';

  @Prop({ type: Number, default: 50 })
  x: number;

  @Prop({ type: Number, default: 50 })
  y: number;
}
const StoryTextOverlaySchema = SchemaFactory.createForClass(StoryTextOverlay);

@Schema({ _id: false })
export class StorySticker {
  @Prop({ type: String, required: true })
  emoji: string;

  @Prop({ type: Number, default: 50 })
  x: number;

  @Prop({ type: Number, default: 50 })
  y: number;

  @Prop({ type: Number, default: 40 })
  size: number;
}
const StoryStickerSchema = SchemaFactory.createForClass(StorySticker);

@Schema({ _id: false })
export class StoryReaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true })
  emoji: string;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}
const StoryReactionSchema = SchemaFactory.createForClass(StoryReaction);

@Schema({ _id: false })
export class StoryMusic {
  @Prop({ type: String, required: true })
  trackId: string;

  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, required: true })
  artist: string;

  @Prop({ type: String, required: true })
  coverUrl: string;

  @Prop({ type: String, required: true })
  audioUrl: string;

  @Prop({ type: Number, default: 0 })
  startTime: number;

  @Prop({ type: Number, default: 5 })
  stickerX: number;

  @Prop({ type: Number, default: 75 })
  stickerY: number;

  @Prop({ type: Number, default: 90 })
  stickerWidth: number;
}
const StoryMusicSchema = SchemaFactory.createForClass(StoryMusic);

@Schema({ _id: false })
export class StoryView {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  viewedAt: Date;
}
const StoryViewSchema = SchemaFactory.createForClass(StoryView);

@Schema({ timestamps: true })
export class Story extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  authorId: Types.ObjectId;

  @Prop({ type: String, enum: ['media', 'text'], default: 'media' })
  type: StoryType;

  // For media stories
  @Prop({ type: String, enum: ['image', 'video'], default: null })
  mediaType: StoryMediaType | null;

  @Prop({ type: String, default: null })
  mediaUrl: string | null;

  @Prop({ type: Number, default: null })
  mediaDurationMs: number | null;

  @Prop({ type: Number, default: null })
  trimStartMs: number | null;

  @Prop({ type: Number, default: null })
  trimEndMs: number | null;

  // For text stories
  @Prop({ type: String, maxlength: 500, default: null })
  textContent: string | null;

  @Prop({ type: String, default: null })
  backgroundStyle: string | null; // CSS gradient or color

  // Overlays on top of media/text
  @Prop({ type: [StoryTextOverlaySchema], default: [] })
  textOverlays: StoryTextOverlay[];

  @Prop({ type: [StoryStickerSchema], default: [] })
  stickers: StorySticker[];

  @Prop({ type: String, enum: ['public', 'followers', 'private'], default: 'followers' })
  visibility: StoryVisibility;

  @Prop({ type: [StoryViewSchema], default: [] })
  views: StoryView[];

  @Prop({ type: [StoryReactionSchema], default: [] })
  reactions: StoryReaction[];

  @Prop({ type: StoryMusicSchema, default: null })
  music: StoryMusic | null;

  @Prop({ type: String, maxlength: 160, default: null })
  location: string | null;

  // TTL: auto delete after 24h
  @Prop({ type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), index: { expireAfterSeconds: 0 } })
  expiresAt: Date;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const StorySchema = SchemaFactory.createForClass(Story);

StorySchema.index({ authorId: 1, createdAt: -1 });
StorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

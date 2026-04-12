import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MentionMute } from './mention-mute.schema';

export type MentionMuteDurationKey =
  | '15m'
  | '1h'
  | '3h'
  | '8h'
  | '24h'
  | 'forever';

@Injectable()
export class MentionMuteService {
  constructor(
    @InjectModel(MentionMute.name)
    private readonly mentionMuteModel: Model<MentionMute>,
  ) {}

  private untilFromDuration(key: MentionMuteDurationKey): Date {
    const now = Date.now();
    switch (key) {
      case '15m':
        return new Date(now + 15 * 60 * 1000);
      case '1h':
        return new Date(now + 60 * 60 * 1000);
      case '3h':
        return new Date(now + 3 * 60 * 60 * 1000);
      case '8h':
        return new Date(now + 8 * 60 * 60 * 1000);
      case '24h':
        return new Date(now + 24 * 60 * 60 * 1000);
      case 'forever':
        return new Date('2099-12-31T23:59:59.000Z');
      default:
        throw new BadRequestException('Invalid duration');
    }
  }

  async upsertMute(
    ownerUserId: string,
    mutedSenderId: string,
    duration: MentionMuteDurationKey,
  ): Promise<{ until: string }> {
    if (ownerUserId === mutedSenderId) {
      throw new BadRequestException('Cannot mute yourself');
    }
    const ownerOid = new Types.ObjectId(ownerUserId);
    const senderOid = new Types.ObjectId(mutedSenderId);
    const until = this.untilFromDuration(duration);
    await this.mentionMuteModel
      .findOneAndUpdate(
        { ownerUserId: ownerOid, mutedSenderId: senderOid },
        { $set: { until } },
        { upsert: true, new: true },
      )
      .exec();
    return { until: until.toISOString() };
  }

  async removeMute(ownerUserId: string, mutedSenderId: string): Promise<void> {
    await this.mentionMuteModel
      .deleteOne({
        ownerUserId: new Types.ObjectId(ownerUserId),
        mutedSenderId: new Types.ObjectId(mutedSenderId),
      })
      .exec();
  }

  /** Các recipient (owner) đang mute sender và until > now. */
  async recipientsWhoMutedSender(
    senderId: string,
    recipientUserIds: string[],
  ): Promise<Set<string>> {
    if (!recipientUserIds.length) return new Set();
    const now = new Date();
    const senderOid = new Types.ObjectId(senderId);
    const recipientOids = recipientUserIds.map((id) => new Types.ObjectId(id));
    const rows = await this.mentionMuteModel
      .find({
        mutedSenderId: senderOid,
        ownerUserId: { $in: recipientOids },
        until: { $gt: now },
      })
      .select('ownerUserId')
      .lean()
      .exec();
    return new Set(
      rows.map((r: any) => r.ownerUserId?.toString?.()).filter(Boolean),
    );
  }

  async isMuted(ownerUserId: string, senderId: string): Promise<boolean> {
    const now = new Date();
    const doc = await this.mentionMuteModel
      .findOne({
        ownerUserId: new Types.ObjectId(ownerUserId),
        mutedSenderId: new Types.ObjectId(senderId),
        until: { $gt: now },
      })
      .select('_id')
      .lean()
      .exec();
    return Boolean(doc);
  }

  /** Senders mà owner đang tắt thông báo @ (còn hiệu lực). */
  async listMutedSendersForOwner(
    ownerUserId: string,
    candidateSenderIds: string[],
  ): Promise<Set<string>> {
    if (!candidateSenderIds.length) return new Set();
    const now = new Date();
    const rows = await this.mentionMuteModel
      .find({
        ownerUserId: new Types.ObjectId(ownerUserId),
        mutedSenderId: {
          $in: candidateSenderIds.map((id) => new Types.ObjectId(id)),
        },
        until: { $gt: now },
      })
      .select('mutedSenderId')
      .lean()
      .exec();
    return new Set(
      rows.map((r: any) => r.mutedSenderId?.toString?.()).filter(Boolean),
    );
  }
}

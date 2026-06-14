import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DM_CONVERSATION_CATEGORIES,
  DmConversationCategory,
  DmConversationPreference,
} from './dm-conversation-preference.schema';

export type DmConversationPreferencePayload = {
  mutedUntil: string | null;
  mutedForever: boolean;
  category: DmConversationCategory | null;
};

@Injectable()
export class DmConversationPreferenceService {
  constructor(
    @InjectModel(DmConversationPreference.name)
    private readonly prefModel: Model<DmConversationPreference>,
  ) {}

  normalize(doc: any): DmConversationPreferencePayload {
    const mutedUntilRaw = doc?.mutedUntil;
    const mutedUntil =
      mutedUntilRaw instanceof Date
        ? mutedUntilRaw.toISOString()
        : mutedUntilRaw
          ? String(mutedUntilRaw)
          : null;
    const categoryRaw = doc?.category;
    const category =
      categoryRaw &&
      DM_CONVERSATION_CATEGORIES.includes(categoryRaw as DmConversationCategory)
        ? (categoryRaw as DmConversationCategory)
        : null;
    return {
      mutedUntil,
      mutedForever: doc?.mutedForever === true,
      category,
    };
  }

  emptyPreference(): DmConversationPreferencePayload {
    return {
      mutedUntil: null,
      mutedForever: false,
      category: null,
    };
  }

  isMutedPayload(pref: DmConversationPreferencePayload, now = new Date()): boolean {
    if (pref.mutedForever) return true;
    if (!pref.mutedUntil) return false;
    const until = new Date(pref.mutedUntil);
    return !Number.isNaN(until.getTime()) && until.getTime() > now.getTime();
  }

  async getMapForUser(
    userId: string,
    peerUserIds?: string[],
  ): Promise<Map<string, DmConversationPreferencePayload>> {
    const map = new Map<string, DmConversationPreferencePayload>();
    if (!Types.ObjectId.isValid(userId)) return map;

    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
    };
    if (peerUserIds?.length) {
      const ids = peerUserIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));
      if (ids.length) filter.peerUserId = { $in: ids };
    }

    const rows = await this.prefModel.find(filter).lean().exec();
    for (const row of rows as any[]) {
      const peerId = row.peerUserId?.toString?.() ?? String(row.peerUserId);
      if (!peerId) continue;
      map.set(peerId, this.normalize(row));
    }
    return map;
  }

  async isMuted(userId: string, peerUserId: string): Promise<boolean> {
    if (
      !Types.ObjectId.isValid(userId) ||
      !Types.ObjectId.isValid(peerUserId)
    ) {
      return false;
    }
    const row = await this.prefModel
      .findOne({
        userId: new Types.ObjectId(userId),
        peerUserId: new Types.ObjectId(peerUserId),
      })
      .lean()
      .exec();
    if (!row) return false;
    return this.isMutedPayload(this.normalize(row));
  }

  async upsert(
    userId: string,
    peerUserId: string,
    patch: {
      mutedUntil?: string | null;
      mutedForever?: boolean;
      category?: DmConversationCategory | null;
    },
  ): Promise<DmConversationPreferencePayload> {
    if (userId === peerUserId) {
      throw new BadRequestException('Cannot set preferences for yourself');
    }
    if (
      !Types.ObjectId.isValid(userId) ||
      !Types.ObjectId.isValid(peerUserId)
    ) {
      throw new BadRequestException('Invalid user id');
    }

    const userOid = new Types.ObjectId(userId);
    const peerOid = new Types.ObjectId(peerUserId);

    const existing = await this.prefModel
      .findOne({ userId: userOid, peerUserId: peerOid })
      .lean()
      .exec();
    const current = existing
      ? this.normalize(existing)
      : this.emptyPreference();

    let mutedForever = current.mutedForever;
    let mutedUntil = current.mutedUntil;
    let category = current.category;

    if (patch.mutedForever !== undefined) {
      mutedForever = Boolean(patch.mutedForever);
      if (mutedForever) mutedUntil = null;
    }

    if (patch.mutedUntil !== undefined) {
      if (patch.mutedUntil == null || patch.mutedUntil === '') {
        mutedUntil = null;
      } else {
        const until = new Date(patch.mutedUntil);
        if (Number.isNaN(until.getTime())) {
          throw new BadRequestException('mutedUntil must be a valid ISO date');
        }
        mutedUntil = until.toISOString();
        mutedForever = false;
      }
    }

    if (patch.category !== undefined) {
      if (patch.category == null) {
        category = null;
      } else if (
        !DM_CONVERSATION_CATEGORIES.includes(
          patch.category as DmConversationCategory,
        )
      ) {
        throw new BadRequestException('Invalid category');
      } else {
        category = patch.category as DmConversationCategory;
      }
    }

    const next: DmConversationPreferencePayload = {
      mutedForever,
      mutedUntil,
      category,
    };

    if (!next.mutedForever && !next.mutedUntil && !next.category) {
      await this.prefModel
        .deleteOne({ userId: userOid, peerUserId: peerOid })
        .exec();
      return this.emptyPreference();
    }

    await this.prefModel
      .updateOne(
        { userId: userOid, peerUserId: peerOid },
        {
          $set: {
            mutedForever: next.mutedForever,
            mutedUntil: next.mutedUntil ? new Date(next.mutedUntil) : null,
            category: next.category,
          },
          $setOnInsert: { userId: userOid, peerUserId: peerOid },
        },
        { upsert: true },
      )
      .exec();

    return next;
  }
}

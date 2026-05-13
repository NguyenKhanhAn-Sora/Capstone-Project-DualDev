import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LivestreamMute } from './livestream-mute.schema';

@Injectable()
export class LivestreamMuteService {
  constructor(
    @InjectModel(LivestreamMute.name)
    private readonly muteModel: Model<LivestreamMute>,
  ) {}

  async mute(
    hostId: string,
    userId: string,
    durationMinutes: number,
  ): Promise<{ expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    await this.muteModel.findOneAndUpdate(
      {
        hostId: new Types.ObjectId(hostId),
        userId: new Types.ObjectId(userId),
      },
      { expiresAt },
      { upsert: true, new: true },
    );
    return { expiresAt };
  }

  async isMuted(
    hostId: string,
    userId: string,
  ): Promise<{ muted: boolean; expiresAt?: Date }> {
    const doc = await this.muteModel
      .findOne({
        hostId: new Types.ObjectId(hostId),
        userId: new Types.ObjectId(userId),
      })
      .lean();

    if (!doc) return { muted: false };

    // Guard against TTL index not having fired yet
    if (doc.expiresAt < new Date()) {
      await this.muteModel.deleteOne({ _id: doc._id });
      return { muted: false };
    }

    return { muted: true, expiresAt: doc.expiresAt };
  }

  async unmute(hostId: string, userId: string): Promise<void> {
    await this.muteModel.deleteOne({
      hostId: new Types.ObjectId(hostId),
      userId: new Types.ObjectId(userId),
    });
  }
}

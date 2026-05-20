import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Poll, PollDocument } from './poll.schema';
import { CreatePollDto, UpdatePollDto, VotePollDto } from './dto/create-poll.dto';
import { Follow } from '../users/follow.schema';
import { Profile } from '../profiles/profile.schema';

@Injectable()
export class PollsService {
  constructor(
    @InjectModel(Poll.name) private pollModel: Model<PollDocument>,
    @InjectModel(Profile.name) private profileModel: Model<Profile & { _id: Types.ObjectId }>,
    @InjectModel(Follow.name) private followModel: Model<Follow & { _id: Types.ObjectId }>,
  ) {}

  async create(userId: string, dto: CreatePollDto): Promise<Poll> {
    const durationHours = dto.durationHours || 24;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + durationHours);

    const poll = new this.pollModel({
      creatorId: new Types.ObjectId(userId),
      question: dto.question,
      options: dto.options,
      optionImages: dto.optionImages ?? null,
      durationHours,
      allowMultipleAnswers: dto.allowMultipleAnswers || false,
      expiresAt,
      votes: [],
    });

    return poll.save();
  }

  async findById(pollId: string): Promise<Poll> {
    const poll = await this.pollModel
      .findOne({ _id: new Types.ObjectId(pollId), isDeleted: false })
      .populate('creatorId', 'username displayName avatarUrl')
      .lean()
      .exec();

    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    return poll;
  }

  async vote(pollId: string, userId: string, dto: VotePollDto): Promise<Poll> {
    const poll = await this.pollModel.findOne({
      _id: new Types.ObjectId(pollId),
      isDeleted: false,
    });

    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    // Check if poll has expired
    if (new Date() > poll.expiresAt) {
      throw new BadRequestException('Poll has expired');
    }

    // Validate option indexes
    for (const index of dto.optionIndexes) {
      if (index < 0 || index >= poll.options.length) {
        throw new BadRequestException(`Invalid option index: ${index}`);
      }
    }

    // Check if multiple answers allowed
    if (!poll.allowMultipleAnswers && dto.optionIndexes.length > 1) {
      throw new BadRequestException(
        'This poll does not allow multiple answers',
      );
    }

    const userObjectId = new Types.ObjectId(userId);

    // Remove existing votes from this user
    poll.votes = poll.votes.filter((vote) => vote.userId.toString() !== userId);

    // Add new votes
    for (const optionIndex of dto.optionIndexes) {
      poll.votes.push({
        userId: userObjectId,
        optionIndex,
        votedAt: new Date(),
      });
    }

    await poll.save();

    return this.findById(pollId);
  }

  async getResults(pollId: string): Promise<any> {
    const poll = await this.findById(pollId);

    const uniqueVoters = new Set(poll.votes.map((v) => v.userId.toString()))
      .size;
    const totalVotes = uniqueVoters;
    const totalSelections = poll.votes.length;

    const results = poll.options.map((option, index) => {
      const voteCount = poll.votes.filter(
        (v) => v.optionIndex === index,
      ).length;
      const percentage =
        totalSelections > 0 ? Math.round((voteCount / totalSelections) * 100) : 0;

      return {
        option,
        voteCount,
        percentage,
      };
    });

    const now = new Date();
    const timeLeft = poll.expiresAt.getTime() - now.getTime();
    const hoursLeft = Math.max(0, Math.ceil(timeLeft / (1000 * 60 * 60)));

    return {
      _id: poll._id,
      question: poll.question,
      options: poll.options,
      allowMultipleAnswers: poll.allowMultipleAnswers,
      results,
      totalVotes,
      uniqueVoters,
      expiresAt: poll.expiresAt,
      hoursLeft,
      isExpired: now > poll.expiresAt,
      creatorId: poll.creatorId,
    };
  }

  async getUserVote(pollId: string, userId: string): Promise<number[]> {
    const poll = await this.pollModel.findOne({
      _id: new Types.ObjectId(pollId),
      isDeleted: false,
    });

    if (!poll) {
      return [];
    }

    return poll.votes
      .filter((v) => v.userId.toString() === userId)
      .map((v) => v.optionIndex);
  }

  async update(pollId: string, userId: string, dto: UpdatePollDto): Promise<Poll> {
    const poll = await this.pollModel.findOne({
      _id: new Types.ObjectId(pollId),
      isDeleted: false,
    });
    if (!poll) throw new Error('Poll not found');
    if (poll.creatorId.toString() !== userId) throw new Error('Forbidden');
    if (typeof dto.allowMultipleAnswers === 'boolean') {
      poll.allowMultipleAnswers = dto.allowMultipleAnswers;
    }
    if (Array.isArray(dto.options) && dto.options.length === poll.options.length) {
      poll.options = dto.options.map((o, i) => o.trim() || poll.options[i]);
    }
    return poll.save();
  }

  async delete(pollId: string, userId: string): Promise<void> {
    const poll = await this.pollModel.findOne({
      _id: new Types.ObjectId(pollId),
      isDeleted: false,
    });

    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    if (poll.creatorId.toString() !== userId) {
      throw new BadRequestException('You can only delete your own polls');
    }

    poll.isDeleted = true;
    await poll.save();
  }

  async getVoters(
    pollId: string,
    viewerId: string | null,
    limit: number,
    cursor?: string,
  ): Promise<{ items: any[]; nextCursor: string | null }> {
    const poll = await this.pollModel
      .findOne({ _id: new Types.ObjectId(pollId), isDeleted: false })
      .lean()
      .exec();
    if (!poll) throw new NotFoundException('Poll not found');

    // Deduplicate: keep the most recent vote timestamp per user
    const voterMap = new Map<string, number>();
    for (const vote of poll.votes) {
      const uid = vote.userId.toString();
      const ts = new Date(vote.votedAt).getTime();
      if (!voterMap.has(uid) || ts > voterMap.get(uid)!) {
        voterMap.set(uid, ts);
      }
    }

    // Sort by votedAt desc (most recent voter first), then by uid for stability
    const sortedVoters = [...voterMap.entries()]
      .sort(([aId, aTs], [bId, bTs]) => bTs - aTs || aId.localeCompare(bId))
      .map(([uid]) => uid);

    // Apply cursor: find its position and start after it
    let startIndex = 0;
    if (cursor) {
      const idx = sortedVoters.indexOf(cursor);
      startIndex = idx >= 0 ? idx + 1 : 0;
    }

    const slice = sortedVoters.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + limit < sortedVoters.length
        ? (slice[slice.length - 1] ?? null)
        : null;

    if (slice.length === 0) return { items: [], nextCursor: null };

    const userIds = slice.map((id) => new Types.ObjectId(id));
    const profiles = await this.profileModel
      .find({ userId: { $in: userIds } })
      .select('userId username displayName avatarUrl')
      .lean()
      .exec();

    const userMap = new Map(profiles.map((p: any) => [p.userId.toString(), p]));

    let followingSet = new Set<string>();
    if (viewerId) {
      const follows = await this.followModel
        .find({
          followerId: new Types.ObjectId(viewerId),
          followeeId: { $in: userIds },
        })
        .lean()
        .exec();
      followingSet = new Set(follows.map((f: any) => f.followeeId.toString()));
    }

    const items = slice
      .map((uid) => {
        const user = userMap.get(uid) as any;
        if (!user) return null;
        return {
          userId: uid,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          isFollowing: followingSet.has(uid),
        };
      })
      .filter(Boolean);

    return { items, nextCursor };
  }
}

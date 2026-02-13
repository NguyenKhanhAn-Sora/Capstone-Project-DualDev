import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Poll, PollDocument } from './poll.schema';
import { CreatePollDto, VotePollDto } from './dto/create-poll.dto';

@Injectable()
export class PollsService {
  constructor(@InjectModel(Poll.name) private pollModel: Model<PollDocument>) {}

  async create(userId: string, dto: CreatePollDto): Promise<Poll> {
    const durationHours = dto.durationHours || 24;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + durationHours);

    const poll = new this.pollModel({
      creatorId: new Types.ObjectId(userId),
      question: dto.question,
      options: dto.options,
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

    const totalVotes = poll.votes.length;
    const uniqueVoters = new Set(poll.votes.map((v) => v.userId.toString()))
      .size;

    const results = poll.options.map((option, index) => {
      const voteCount = poll.votes.filter(
        (v) => v.optionIndex === index,
      ).length;
      const percentage =
        totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;

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
}

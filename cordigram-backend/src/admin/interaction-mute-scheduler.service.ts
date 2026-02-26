import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { User } from '../users/user.schema';

type UnmuteJobData = {
  userId: string;
};

const QUEUE_NAME = 'interaction-unmute';

@Injectable()
export class InteractionMuteSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(InteractionMuteSchedulerService.name);
  private connection?: IORedis;
  private queue?: Queue<UnmuteJobData>;
  private worker?: Worker<UnmuteJobData>;

  constructor(@InjectModel(User.name) private readonly userModel: Model<User>) {}

  onModuleInit() {
    this.initQueue();
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  async scheduleUnmute(userId: string, expiresAt: Date) {
    if (!userId || !expiresAt) return;
    if (!this.queue) {
      this.initQueue();
    }
    const delay = Math.max(0, expiresAt.getTime() - Date.now());
    await this.queue?.add(
      'unmute',
      { userId },
      {
        delay,
        jobId: userId,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  private initQueue() {
    if (this.queue || this.worker) return;

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.queue = new Queue<UnmuteJobData>(QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true,
      },
    });

    this.worker = new Worker<UnmuteJobData>(
      QUEUE_NAME,
      async (job) => this.handleUnmute(job),
      {
        connection: this.connection,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Interaction unmute job failed ${job?.id}: ${err?.message}`);
    });
  }

  private async handleUnmute(job: Job<UnmuteJobData>) {
    const userId = job.data?.userId;
    if (!userId || !Types.ObjectId.isValid(userId)) return;

    const userObjectId = new Types.ObjectId(userId);
    const user = await this.userModel
      .findById(userObjectId)
      .select('interactionMutedUntil interactionMutedIndefinitely')
      .lean()
      .exec();

    if (user?.interactionMutedIndefinitely) return;

    if (!user?.interactionMutedUntil) return;

    const expiresAt = new Date(user.interactionMutedUntil);
    const now = new Date();

    if (Number.isNaN(expiresAt.getTime())) {
      await this.userModel
        .updateOne(
          { _id: userObjectId },
          { $set: { interactionMutedUntil: null, interactionMutedIndefinitely: false } },
        )
        .exec();
      return;
    }

    if (expiresAt.getTime() > now.getTime()) {
      const delay = Math.max(0, expiresAt.getTime() - now.getTime());
      await this.queue?.add(
        'unmute',
        { userId },
        {
          delay,
          jobId: userId,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      return;
    }

    await this.userModel
      .updateOne(
        { _id: userObjectId },
        { $set: { interactionMutedUntil: null, interactionMutedIndefinitely: false } },
      )
      .exec();
  }
}

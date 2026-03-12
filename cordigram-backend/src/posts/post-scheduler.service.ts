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
import { Post } from './post.schema';

type PublishJobData = {
  postId: string;
};

const QUEUE_NAME = 'post-publish';

@Injectable()
export class PostSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostSchedulerService.name);
  private connection?: IORedis;
  private queue?: Queue<PublishJobData>;
  private worker?: Worker<PublishJobData>;

  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
  ) {}

  onModuleInit() {
    this.initQueue();
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  async schedulePostPublish(postId: string, scheduledAt: Date) {
    if (!postId || !scheduledAt) return;
    if (!this.queue) {
      this.initQueue();
    }
    const delay = Math.max(0, scheduledAt.getTime() - Date.now());
    await this.queue?.add(
      'publish',
      { postId },
      {
        delay,
        jobId: postId,
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

    this.queue = new Queue<PublishJobData>(QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true,
      },
    });

    this.worker = new Worker<PublishJobData>(
      QUEUE_NAME,
      async (job) => this.handlePublish(job),
      {
        connection: this.connection,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Publish job failed ${job?.id}: ${err?.message}`);
    });
  }

  private async handlePublish(job: Job<PublishJobData>) {
    const postId = job.data?.postId;
    if (!postId) return;

    const postObjectId = new Types.ObjectId(postId);
    const post = await this.postModel
      .findOne({ _id: postObjectId, deletedAt: null })
      .select('status scheduledAt publishedAt')
      .lean();

    if (!post) return;
    if (post.status !== 'scheduled') return;

    const scheduledAt = post.scheduledAt ? new Date(post.scheduledAt) : null;
    const now = new Date();

    if (scheduledAt && scheduledAt.getTime() > now.getTime()) {
      const delay = Math.max(0, scheduledAt.getTime() - now.getTime());
      await this.queue?.add(
        'publish',
        { postId },
        {
          delay,
          jobId: postId,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      return;
    }

    await this.postModel
      .updateOne(
        { _id: postObjectId, status: 'scheduled', deletedAt: null },
        {
          $set: {
            status: 'published',
            publishedAt: scheduledAt ?? now,
          },
        },
      )
      .exec();
  }
}

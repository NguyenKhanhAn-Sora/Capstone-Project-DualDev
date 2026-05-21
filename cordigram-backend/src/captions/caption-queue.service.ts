import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { CaptionService } from './caption.service';

type CaptionJobData = {
  postId: string;
  mediaIndex: number;
};

const QUEUE_NAME = 'caption-generate';

@Injectable()
export class CaptionQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CaptionQueueService.name);
  private connection?: IORedis;
  private queue?: Queue<CaptionJobData>;
  private worker?: Worker<CaptionJobData>;

  constructor(private readonly captionService: CaptionService) {}

  onModuleInit() {
    this.initQueue();
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  async enqueue(postId: string, mediaIndex: number): Promise<void> {
    if (!this.queue) this.initQueue();
    await this.queue?.add(
      'generate',
      { postId, mediaIndex },
      {
        jobId: `${postId}-${mediaIndex}`,
        removeOnComplete: true,
        removeOnFail: true,
        attempts: 2,
        backoff: { type: 'fixed', delay: 30_000 },
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

    this.queue = new Queue<CaptionJobData>(QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
    });

    this.worker = new Worker<CaptionJobData>(
      QUEUE_NAME,
      async (job) => this.handleJob(job),
      { connection: this.connection },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Caption job failed ${job?.id}: ${err?.message}`);
    });
  }

  private async handleJob(job: Job<CaptionJobData>) {
    const { postId, mediaIndex } = job.data;
    if (!postId || mediaIndex == null) return;
    await this.captionService.generateAndSave(postId, mediaIndex);
  }
}

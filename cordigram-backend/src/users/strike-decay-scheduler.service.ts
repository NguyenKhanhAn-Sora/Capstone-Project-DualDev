import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { UsersService } from './users.service';

type StrikeDecayJobData = {
  trigger: 'daily';
};

const QUEUE_NAME = 'strike-decay-sweep';
const JOB_NAME = 'strike-decay-daily';
const JOB_ID = 'strike-decay-daily';

@Injectable()
export class StrikeDecaySchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(StrikeDecaySchedulerService.name);
  private connection?: IORedis;
  private queue?: Queue<StrikeDecayJobData>;
  private worker?: Worker<StrikeDecayJobData>;

  constructor(private readonly usersService: UsersService) {}

  async onModuleInit() {
    this.initQueue();
    await this.ensureDailyJob();
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  private initQueue() {
    if (this.queue || this.worker) return;

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.queue = new Queue<StrikeDecayJobData>(QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true,
      },
    });

    this.worker = new Worker<StrikeDecayJobData>(
      QUEUE_NAME,
      async (job) => this.handleSweep(job),
      {
        connection: this.connection,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Strike decay sweep job failed ${job?.id}: ${err?.message}`,
      );
    });
  }

  private async ensureDailyJob() {
    if (!this.queue) {
      this.initQueue();
    }

    await this.queue?.add(
      JOB_NAME,
      { trigger: 'daily' },
      {
        jobId: JOB_ID,
        repeat: {
          pattern: '30 2 * * *',
        },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  private async handleSweep(_job: Job<StrikeDecayJobData>) {
    const result = await this.usersService.runStrikeDecaySweep();
    this.logger.log(
      `Strike decay sweep completed: checked=${result.checkedUsers}, decayed=${result.decayedUsers}`,
    );
  }
}

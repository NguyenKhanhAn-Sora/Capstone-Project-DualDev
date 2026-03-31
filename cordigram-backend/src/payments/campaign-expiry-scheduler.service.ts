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
import { PaymentTransaction } from './payment-transaction.schema';

type ExpireCampaignJobData = {
  campaignId: string;
};

const QUEUE_NAME = 'ads-campaign-expire';

@Injectable()
export class CampaignExpirySchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CampaignExpirySchedulerService.name);
  private connection?: IORedis;
  private queue?: Queue<ExpireCampaignJobData>;
  private worker?: Worker<ExpireCampaignJobData>;

  constructor(
    @InjectModel(PaymentTransaction.name)
    private readonly paymentTransactions: Model<PaymentTransaction>,
  ) {}

  async onModuleInit() {
    this.initQueue();
    await this.bootstrapSchedules();
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  async syncCampaignExpiry(params: {
    campaignId?: string | null;
    expiresAt?: Date | string | null;
    hiddenReason?: string | null;
    isExpiredHidden?: boolean | null;
  }) {
    const campaignId = params.campaignId?.toString?.() ?? '';
    if (!campaignId || !Types.ObjectId.isValid(campaignId)) return;

    const hiddenReason = params.hiddenReason ?? null;
    const isExpiredHidden = params.isExpiredHidden === true;
    const expiresAt = params.expiresAt ? new Date(params.expiresAt) : null;

    if (
      isExpiredHidden ||
      hiddenReason === 'paused' ||
      hiddenReason === 'canceled' ||
      !expiresAt ||
      Number.isNaN(expiresAt.getTime())
    ) {
      await this.cancelCampaignExpiry(campaignId);
      return;
    }

    await this.scheduleCampaignExpiry(campaignId, expiresAt);
  }

  async scheduleCampaignExpiry(campaignId: string, expiresAt: Date) {
    if (!campaignId || !expiresAt || Number.isNaN(expiresAt.getTime())) return;
    if (!this.queue) {
      this.initQueue();
    }

    const delay = Math.max(0, expiresAt.getTime() - Date.now());
    const jobId = campaignId;

    const existing = await this.queue?.getJob(jobId);
    if (existing) {
      await existing.remove();
    }

    await this.queue?.add(
      'expire',
      { campaignId },
      {
        delay,
        jobId,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  async cancelCampaignExpiry(campaignId: string) {
    if (!campaignId) return;
    if (!this.queue) {
      this.initQueue();
    }
    const existing = await this.queue?.getJob(campaignId);
    if (existing) {
      await existing.remove();
    }
  }

  private initQueue() {
    if (this.queue || this.worker) return;

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.queue = new Queue<ExpireCampaignJobData>(QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true,
      },
    });

    this.worker = new Worker<ExpireCampaignJobData>(
      QUEUE_NAME,
      async (job) => this.handleExpireCampaign(job),
      {
        connection: this.connection,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Campaign expire job failed ${job?.id}: ${err?.message}`,
      );
    });
  }

  private async bootstrapSchedules(limit = 500) {
    const now = new Date();

    const activeCampaigns = await this.paymentTransactions
      .find({
        promotedPostId: { $ne: null },
        isExpiredHidden: { $ne: true },
        hiddenReason: { $nin: ['paused', 'canceled'] },
        expiresAt: { $gt: now },
        $or: [
          { paymentStatus: 'paid' },
          { paymentStatus: 'no_payment_required' },
          { checkoutStatus: 'complete' },
        ],
      })
      .select('_id expiresAt')
      .sort({ expiresAt: 1 })
      .limit(limit)
      .lean();

    for (const item of activeCampaigns) {
      if (!item?._id || !item.expiresAt) continue;
      await this.scheduleCampaignExpiry(
        item._id.toString(),
        new Date(item.expiresAt),
      );
    }
  }

  private async handleExpireCampaign(job: Job<ExpireCampaignJobData>) {
    const campaignId = job.data?.campaignId;
    if (!campaignId || !Types.ObjectId.isValid(campaignId)) return;

    const now = new Date();
    const tx = await this.paymentTransactions.findOne({
      _id: new Types.ObjectId(campaignId),
      promotedPostId: { $ne: null },
    });

    if (!tx) return;

    if (tx.hiddenReason === 'paused' || tx.hiddenReason === 'canceled') {
      return;
    }

    const expiresAt = tx.expiresAt ? new Date(tx.expiresAt) : null;
    if (!expiresAt || Number.isNaN(expiresAt.getTime())) return;

    if (expiresAt.getTime() > now.getTime()) {
      await this.scheduleCampaignExpiry(campaignId, expiresAt);
      return;
    }

    if (tx.isExpiredHidden) return;

    tx.isExpiredHidden = true;
    tx.hiddenReason = 'expired';
    tx.hiddenAt = now;
    await tx.save();
  }
}

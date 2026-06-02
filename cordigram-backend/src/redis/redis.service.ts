import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';

/**
 * Singleton Redis connections shared across all BullMQ queues and workers.
 *
 * Problem this solves:
 *   Each scheduler service previously created its own IORedis instance.
 *   BullMQ needs 2 connections per service (Queue + Worker), so 5 schedulers
 *   = 10+ connections — easily exceeding the Redis Cloud free-tier limit of
 *   10–30 simultaneous clients.
 *
 * Solution:
 *   - `queueConnection`  — one shared connection for all Queue instances
 *     (non-blocking commands, maxRetriesPerRequest: 3).
 *   - `workerConnection` — one shared connection for all Worker instances
 *     (blocking BRPOP commands, maxRetriesPerRequest: null).
 *
 * BullMQ clones the connection internally with `connection.duplicate()` for
 * each Queue/Worker, so sharing a single IORedis instance is safe.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  /** Shared connection for Queue instances (non-blocking commands). */
  readonly queueConnection: IORedis;

  /** Shared connection for Worker instances (blocking commands). */
  readonly workerConnection: IORedis;

  constructor() {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';

    const retryStrategy = (times: number): number | null => {
      if (times > 5) return null;
      return Math.min(times * 200, 2000);
    };

    this.queueConnection = new IORedis(url, {
      enableReadyCheck: false,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 3,
      retryStrategy,
    });

    // Workers use blocking commands — maxRetriesPerRequest must be null
    this.workerConnection = new IORedis(url, {
      enableReadyCheck: false,
      enableOfflineQueue: false,
      maxRetriesPerRequest: null,
      retryStrategy,
    });

    this.queueConnection.on('error', (err) =>
      this.logger.warn(`Redis queue connection error: ${err.message}`),
    );
    this.workerConnection.on('error', (err) =>
      this.logger.warn(`Redis worker connection error: ${err.message}`),
    );
  }

  async onModuleDestroy() {
    await this.queueConnection.quit().catch(() => {});
    await this.workerConnection.quit().catch(() => {});
  }
}

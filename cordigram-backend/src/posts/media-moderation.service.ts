import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

type ModerationDecision = 'approve' | 'blur' | 'reject';

type ModerateImageResponse = {
  decision?: ModerationDecision;
  reasons?: string[];
  provider?: string;
  scores?: Record<string, number>;
};

export type ImageModerationResult = {
  decision: ModerationDecision;
  reasons: string[];
  provider: string;
  scores: Record<string, number>;
};

@Injectable()
export class MediaModerationService {
  private readonly logger = new Logger(MediaModerationService.name);

  constructor(private readonly config: ConfigService) {}

  async moderateImage(params: {
    buffer: Buffer;
    filename?: string;
    mimetype?: string;
  }): Promise<ImageModerationResult> {
    return this.callModerationEndpoint({
      endpoint: '/moderate/image',
      fallbackFilename: 'upload.jpg',
      fallbackMimeType: 'image/jpeg',
      params,
      context: 'image',
    });
  }

  async moderateVideo(params: {
    buffer: Buffer;
    filename?: string;
    mimetype?: string;
  }): Promise<ImageModerationResult> {
    return this.callModerationEndpoint({
      endpoint: '/moderate/video',
      fallbackFilename: 'upload.mp4',
      fallbackMimeType: 'video/mp4',
      params,
      context: 'video',
    });
  }

  private async callModerationEndpoint(opts: {
    endpoint: '/moderate/image' | '/moderate/video';
    fallbackFilename: string;
    fallbackMimeType: string;
    params: {
      buffer: Buffer;
      filename?: string;
      mimetype?: string;
    };
    context: 'image' | 'video';
  }): Promise<ImageModerationResult> {
    const { endpoint, fallbackFilename, fallbackMimeType, params, context } =
      opts;

    if (!this.config.moderationEnabled || !this.config.moderationServiceUrl) {
      return {
        decision: 'approve',
        reasons: ['moderation disabled'],
        provider: 'disabled',
        scores: {},
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.moderationTimeoutMs,
    );

    try {
      const form = new FormData();
      const fileBytes = new Uint8Array(params.buffer);
      const file = new Blob([fileBytes], {
        type: params.mimetype ?? fallbackMimeType,
      });
      form.append('file', file, params.filename ?? fallbackFilename);

      const response = await fetch(`${this.config.moderationServiceUrl}${endpoint}`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          detail?: string;
          message?: string;
        };
        throw new Error(
          body.detail ||
            body.message ||
            `Moderation service failed with status ${response.status}`,
        );
      }

      const payload = (await response.json()) as ModerateImageResponse;
      const decision = payload.decision ?? 'approve';

      return {
        decision,
        reasons: Array.isArray(payload.reasons)
          ? payload.reasons.filter((r) => typeof r === 'string')
          : [],
        provider: payload.provider ?? 'unknown',
        scores:
          payload.scores && typeof payload.scores === 'object'
            ? payload.scores
            : {},
      };
    } catch (error) {
      if (this.config.moderationFailOpen) {
        const errMessage =
          error instanceof Error ? error.message : 'unknown moderation error';
        this.logger.warn(
          `${context} moderation failed, fallback approve due to fail-open: ${errMessage}`,
        );
        return {
          decision: 'approve',
          reasons: [`fail-open: ${errMessage}`],
          provider: 'fallback',
          scores: {},
        };
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

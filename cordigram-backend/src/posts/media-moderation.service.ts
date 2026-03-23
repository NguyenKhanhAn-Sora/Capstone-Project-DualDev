import { Injectable, Logger } from '@nestjs/common';
import {
  ContentModerationDetection,
  DetectModerationLabelsCommand,
  GetContentModerationCommand,
  RekognitionClient,
  StartContentModerationCommand,
} from '@aws-sdk/client-rekognition';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
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

  private rekognition: RekognitionClient | null = null;
  private s3: S3Client | null = null;

  private static readonly NUDITY_LABELS = [
    'explicit nudity',
    'nudity',
    'sexual activity',
    'graphic male nudity',
    'graphic female nudity',
    'sexual situations',
  ];

  private static readonly GORE_LABELS = [
    'visually disturbing',
    'graphic violence or physical injury',
    'physical injury',
    'blood',
  ];

  private static readonly WEAPON_LABELS = ['weapons', 'weapon violence'];

  constructor(private readonly config: ConfigService) {}

  async moderateImage(params: {
    buffer: Buffer;
    filename?: string;
    mimetype?: string;
  }): Promise<ImageModerationResult> {
    if (this.config.moderationProvider === 'service') {
      return this.callModerationEndpoint({
        endpoint: '/moderate/image',
        fallbackFilename: 'upload.jpg',
        fallbackMimeType: 'image/jpeg',
        params,
        context: 'image',
      });
    }

    if (!this.config.moderationEnabled) {
      return {
        decision: 'approve',
        reasons: ['moderation disabled'],
        provider: 'disabled',
        scores: {},
      };
    }

    try {
      const rekognition = this.getRekognitionClient();
      const response = await rekognition.send(
        new DetectModerationLabelsCommand({
          Image: {
            Bytes: params.buffer,
          },
          MinConfidence: 40,
        }),
      );

      const scores = this.buildScoresFromImageLabels(
        response.ModerationLabels ?? [],
      );
      const decision = this.resolveDecision(scores);
      return {
        decision,
        reasons: this.buildReasons(decision, scores),
        provider: 'aws-rekognition-v1',
        scores,
      };
    } catch (error) {
      return this.handleModerationError('image', error);
    }
  }

  async moderateVideo(params: {
    buffer: Buffer;
    filename?: string;
    mimetype?: string;
  }): Promise<ImageModerationResult> {
    if (this.config.moderationProvider === 'service') {
      return this.callModerationEndpoint({
        endpoint: '/moderate/video',
        fallbackFilename: 'upload.mp4',
        fallbackMimeType: 'video/mp4',
        params,
        context: 'video',
      });
    }

    if (!this.config.moderationEnabled) {
      return {
        decision: 'approve',
        reasons: ['moderation disabled'],
        provider: 'disabled',
        scores: {},
      };
    }

    const extension = this.getFileExtension(
      params.filename,
      params.mimetype ?? 'video/mp4',
      'mp4',
    );
    const objectKey = this.buildModerationObjectKey(extension);

    try {
      const s3 = this.getS3Client();
      await s3.send(
        new PutObjectCommand({
          Bucket: this.config.moderationS3Bucket,
          Key: objectKey,
          Body: params.buffer,
          ContentType: params.mimetype ?? 'video/mp4',
        }),
      );

      const rekognition = this.getRekognitionClient();
      const start = await rekognition.send(
        new StartContentModerationCommand({
          Video: {
            S3Object: {
              Bucket: this.config.moderationS3Bucket,
              Name: objectKey,
            },
          },
          MinConfidence: 40,
          JobTag: 'cordigram-media-moderation',
        }),
      );

      if (!start.JobId) {
        throw new Error('Rekognition did not return JobId');
      }

      const detections = await this.waitForVideoModeration(start.JobId);
      const scores = this.buildScoresFromVideoDetections(detections);
      const decision = this.resolveDecision(scores);
      return {
        decision,
        reasons: this.buildReasons(decision, scores),
        provider: 'aws-rekognition-v1',
        scores,
      };
    } catch (error) {
      return this.handleModerationError('video', error);
    } finally {
      await this.safeDeleteModerationObject(objectKey);
    }
  }

  private getRekognitionClient(): RekognitionClient {
    if (this.rekognition) return this.rekognition;
    this.rekognition = new RekognitionClient({
      region: this.config.awsRegion,
    });
    return this.rekognition;
  }

  private getS3Client(): S3Client {
    if (this.s3) return this.s3;
    this.s3 = new S3Client({
      region: this.config.awsRegion,
    });
    return this.s3;
  }

  private async waitForVideoModeration(
    jobId: string,
  ): Promise<ContentModerationDetection[]> {
    const timeoutMs = Math.max(5000, this.config.moderationVideoMaxWaitMs);
    const pollIntervalMs = Math.max(500, this.config.moderationVideoPollIntervalMs);
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const page = await this.getRekognitionClient().send(
        new GetContentModerationCommand({
          JobId: jobId,
          MaxResults: 1000,
          SortBy: 'TIMESTAMP',
        }),
      );

      const status = (page.JobStatus ?? '').toUpperCase();
      if (status === 'SUCCEEDED') {
        return this.collectAllDetections(
          jobId,
          page.ModerationLabels ?? [],
          page.NextToken,
        );
      }

      if (status === 'FAILED') {
        throw new Error(page.StatusMessage || 'Rekognition video moderation failed');
      }

      await this.sleep(pollIntervalMs);
    }

    throw new Error('Timed out waiting for Rekognition video moderation');
  }

  private async collectAllDetections(
    jobId: string,
    firstPage: ContentModerationDetection[],
    nextToken?: string,
  ): Promise<ContentModerationDetection[]> {
    const all = [...firstPage];
    let token = nextToken;

    while (token) {
      const page = await this.getRekognitionClient().send(
        new GetContentModerationCommand({
          JobId: jobId,
          MaxResults: 1000,
          NextToken: token,
          SortBy: 'TIMESTAMP',
        }),
      );
      all.push(...(page.ModerationLabels ?? []));
      token = page.NextToken;
    }

    return all;
  }

  private buildScoresFromImageLabels(
    labels: Array<{ Name?: string; ParentName?: string; Confidence?: number }>,
  ): Record<string, number> {
    const normalized = labels.map((item) => ({
      name: item.Name ?? '',
      parent: item.ParentName ?? '',
      confidence: this.asProbability(item.Confidence),
    }));
    return this.mapScores(normalized);
  }

  private buildScoresFromVideoDetections(
    detections: ContentModerationDetection[],
  ): Record<string, number> {
    const normalized = detections.map((item) => ({
      name: item.ModerationLabel?.Name ?? '',
      parent: item.ModerationLabel?.ParentName ?? '',
      confidence: this.asProbability(item.ModerationLabel?.Confidence),
    }));
    return this.mapScores(normalized);
  }

  private mapScores(
    labels: Array<{ name: string; parent: string; confidence: number }>,
  ): Record<string, number> {
    let nudity = 0;
    let violence = 0;
    let gore = 0;
    let weapons = 0;

    for (const item of labels) {
      const name = item.name.toLowerCase();
      const parent = item.parent.toLowerCase();
      const merged = `${parent} ${name}`.trim();

      if (
        MediaModerationService.NUDITY_LABELS.some((key) => merged.includes(key))
      ) {
        nudity = Math.max(nudity, item.confidence);
      }

      if (merged.includes('violence')) {
        violence = Math.max(violence, item.confidence);
      }

      if (MediaModerationService.GORE_LABELS.some((key) => merged.includes(key))) {
        gore = Math.max(gore, item.confidence);
      }

      if (
        MediaModerationService.WEAPON_LABELS.some((key) => merged.includes(key))
      ) {
        weapons = Math.max(weapons, item.confidence);
      }
    }

    const sensitive = Math.max(nudity, violence, gore, weapons);

    return {
      nudity: this.round(nudity),
      violence: this.round(violence),
      gore: this.round(gore),
      weapons: this.round(weapons),
      sensitive: this.round(sensitive),
    };
  }

  private resolveDecision(scores: Record<string, number>): ModerationDecision {
    const rejectThreshold = this.clampThreshold(this.config.moderationRejectThreshold, 0.82);
    const blurThreshold = this.clampThreshold(this.config.moderationBlurThreshold, 0.55);

    if (scores.nudity >= rejectThreshold) {
      return 'reject';
    }

    if (
      scores.violence >= blurThreshold ||
      scores.gore >= blurThreshold ||
      scores.weapons >= blurThreshold
    ) {
      return 'blur';
    }

    return 'approve';
  }

  private buildReasons(
    decision: ModerationDecision,
    scores: Record<string, number>,
  ): string[] {
    const blurThreshold = this.clampThreshold(this.config.moderationBlurThreshold, 0.55);
    const rejectThreshold = this.clampThreshold(this.config.moderationRejectThreshold, 0.82);

    if (decision === 'reject') {
      return [
        `nudity score ${scores.nudity.toFixed(2)} >= reject threshold ${rejectThreshold.toFixed(2)}`,
      ];
    }

    if (decision === 'blur') {
      const reasons: string[] = [];
      if (scores.violence >= blurThreshold) {
        reasons.push(
          `violence score ${scores.violence.toFixed(2)} >= blur threshold ${blurThreshold.toFixed(2)}`,
        );
      }
      if (scores.gore >= blurThreshold) {
        reasons.push(
          `gore score ${scores.gore.toFixed(2)} >= blur threshold ${blurThreshold.toFixed(2)}`,
        );
      }
      if (scores.weapons >= blurThreshold) {
        reasons.push(
          `weapons score ${scores.weapons.toFixed(2)} >= blur threshold ${blurThreshold.toFixed(2)}`,
        );
      }
      return reasons.length
        ? reasons
        : ['violence/gore/weapons signal reached blur threshold'];
    }

    return ['no reject-level nudity and no blur-level violence/gore/weapons signals'];
  }

  private clampThreshold(value: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(0, Math.min(1, value));
  }

  private asProbability(value: number | undefined): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 0;
    }
    return Math.max(0, Math.min(1, value / 100));
  }

  private round(value: number): number {
    return Number(value.toFixed(4));
  }

  private buildModerationObjectKey(extension: string): string {
    const cleanPrefix = this.config.moderationS3Prefix
      .trim()
      .replace(/^\/+|\/+$/g, '');
    const prefix = cleanPrefix || 'moderation-inputs';
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 10);
    return `${prefix}/${timestamp}-${random}.${extension}`;
  }

  private getFileExtension(
    filename: string | undefined,
    mimetype: string,
    fallback: string,
  ): string {
    const fromName = filename?.split('.').pop()?.trim().toLowerCase();
    if (fromName && /^[a-z0-9]{2,8}$/.test(fromName)) {
      return fromName;
    }

    const mime = mimetype.toLowerCase();
    if (mime.includes('quicktime')) return 'mov';
    if (mime.includes('webm')) return 'webm';
    if (mime.includes('avi')) return 'avi';
    if (mime.includes('mp4')) return 'mp4';

    return fallback;
  }

  private async safeDeleteModerationObject(key: string): Promise<void> {
    try {
      await this.getS3Client().send(
        new DeleteObjectCommand({
          Bucket: this.config.moderationS3Bucket,
          Key: key,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Failed to delete moderation object ${key}: ${message}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private handleModerationError(
    context: 'image' | 'video',
    error: unknown,
  ): ImageModerationResult {
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

    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unknown moderation error');
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
      return this.handleModerationError(context, error);
    } finally {
      clearTimeout(timeout);
    }
  }
}

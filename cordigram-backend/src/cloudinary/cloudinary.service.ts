import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  v2 as cloudinary,
  UploadApiOptions,
  UploadApiResponse,
} from 'cloudinary';
import { ConfigService } from '../config/config.service';

export interface UploadResult {
  url: string;
  secureUrl: string;
  publicId: string;
  resourceType: string;
  bytes: number;
  format?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface VideoQuality {
  label: string;
  height: number;
  url: string;
}

export interface StorageUsage {
  usedBytes: number;
  limitBytes: number | null;
}

@Injectable()
export class CloudinaryService implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    cloudinary.config({
      cloud_name: this.config.cloudinaryCloudName,
      api_key: this.config.cloudinaryApiKey,
      api_secret: this.config.cloudinaryApiSecret,
    });
  }

  /**
   * Fetches a remote audio URL, trims it to [startSec, startSec+durationSec],
   * uploads the trimmed clip to Cloudinary, and returns its secure URL.
   * The original (un-trimmed) asset is deleted asynchronously to save storage.
   */
  async trimAudioFromUrl(params: {
    audioUrl: string;
    startSec: number;
    durationSec: number;
  }): Promise<string> {
    const { audioUrl, startSec, durationSec } = params;

    // Step 1: upload the original audio and generate a trimmed eager derivation.
    const res = await cloudinary.uploader.upload(audioUrl, {
      resource_type: 'video',
      folder: 'story-audio',
      unique_filename: true,
      eager: [
        {
          start_offset: startSec,
          end_offset: startSec + durationSec,
          audio_codec: 'aac',
          format: 'm4a',
        },
      ],
      eager_async: false,
      timeout: 60000,
    } as UploadApiOptions);

    // Step 2: re-upload the eager-derived URL as a standalone asset so it is
    // independent of the original. Cloudinary derived resources are deleted
    // together with their parent — storing only the eager URL and then
    // deleting the original would make the stored URL a dead link.
    const eagerUrl: string = (res as any).eager?.[0]?.secure_url ?? res.secure_url;

    let standaloneUrl = eagerUrl;
    try {
      const clip = await cloudinary.uploader.upload(eagerUrl, {
        resource_type: 'video',
        folder: 'story-audio',
        unique_filename: true,
        timeout: 60000,
      } as UploadApiOptions);
      standaloneUrl = clip.secure_url;

      // Now it is safe to delete the original (and its derived resources).
      cloudinary.uploader
        .destroy(res.public_id, { resource_type: 'video' })
        .catch(() => {});
    } catch {
      // Re-upload failed — keep the eager URL and do NOT delete the original,
      // so the eager derived resource remains accessible.
    }

    return standaloneUrl;
  }

  async uploadBuffer(params: {
    buffer: Buffer;
    folder?: string;
    publicId?: string;
    resourceType?: 'image' | 'video' | 'raw';
    overwrite?: boolean;
    /** Apply quality compression on upload (images) */
    quality?: 'auto' | 'auto:best' | 'auto:good' | 'auto:eco' | number;
    /** Pre-generate quality variants in background (video only) */
    eagerQualityHeights?: number[];
  }): Promise<UploadResult> {
    const {
      buffer,
      folder,
      publicId,
      resourceType = 'image',
      overwrite,
      quality,
      eagerQualityHeights,
    } = params;

    const options: UploadApiOptions = {
      folder,
      public_id: publicId,
      resource_type: resourceType,
      overwrite: overwrite ?? false,
      unique_filename: true,
      ...(quality !== undefined && { quality }),
    };

    if (eagerQualityHeights && eagerQualityHeights.length > 0) {
      options.eager = eagerQualityHeights.map((h) => ({
        height: h,
        crop: 'limit',
        quality: 'auto',
        format: 'mp4',
      }));
      // eager_async: false — block until all quality variants are generated.
      // The upload API takes longer but quality URLs are ready by the time
      // the post goes live, preventing the "duration grows from 0" issue.
      options.eager_async = false;
      // Allow up to 10 minutes for long videos (Cloudinary default is too short)
      options.timeout = 600000;
    }

    const res = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        options,
        (err, result) => {
          if (err || !result) {
            return reject(err ?? new Error('Cloudinary upload failed'));
          }
          resolve(result);
        },
      );
      stream.end(buffer);
    });

    return {
      url: res.url,
      secureUrl: res.secure_url,
      publicId: res.public_id,
      resourceType: res.resource_type,
      bytes: res.bytes,
      format: res.format,
      width: res.width,
      height: res.height,
      duration: res.duration,
    };
  }

  async getStorageUsage(): Promise<StorageUsage> {
    const usage = await cloudinary.api.usage();
    const gb = 1024 * 1024 * 1024;
    const toNumber = (value: unknown) =>
      typeof value === 'number' ? value : null;

    const storageUsed = toNumber(usage?.storage?.usage) ?? 0;
    const storageLimit = toNumber(usage?.storage?.limit);
    const creditsUsed =
      toNumber(usage?.credits?.used) ??
      toNumber(usage?.credits_used) ??
      toNumber(usage?.credits);
    const creditsLimit =
      toNumber(usage?.credits?.limit) ?? toNumber(usage?.credits_limit);

    const usedBytes = storageUsed || (creditsUsed ? creditsUsed * gb : 0);
    const limitBytes =
      storageLimit ?? (creditsLimit ? creditsLimit * gb : null);

    return {
      usedBytes,
      limitBytes,
    };
  }

  buildBlurImageUrl(params: {
    publicId: string;
    blurStrength?: number;
    secure?: boolean;
  }): string {
    const { publicId, blurStrength = 1800, secure = true } = params;
    return cloudinary.url(publicId, {
      resource_type: 'image',
      secure,
      transformation: [{ effect: `blur:${blurStrength}` }],
    });
  }

  buildBlurVideoUrl(params: {
    publicId: string;
    blurStrength?: number;
    secure?: boolean;
  }): string {
    const { publicId, blurStrength = 900, secure = true } = params;
    return cloudinary.url(publicId, {
      resource_type: 'video',
      secure,
      transformation: [{ effect: `blur:${blurStrength}` }],
    });
  }

  buildVideoQualityUrls(params: {
    publicId: string;
    originalHeight?: number;
    secure?: boolean;
  }): VideoQuality[] {
    const { publicId, originalHeight, secure = true } = params;
    const tiers = [
      { label: '240p', height: 240 },
      { label: '360p', height: 360 },
      { label: '480p', height: 480 },
      { label: '720p', height: 720 },
      { label: '1080p', height: 1080 },
    ];

    const available = originalHeight
      ? tiers.filter((t) => t.height <= originalHeight)
      : tiers;

    // Always include at least one tier
    const list = available.length > 0 ? available : [tiers[0]];

    return list.map((t) => ({
      label: t.label,
      height: t.height,
      url: cloudinary.url(publicId, {
        resource_type: 'video',
        secure,
        transformation: [{ height: t.height, crop: 'limit', quality: 'auto' }],
        format: 'mp4',
      }),
    }));
  }
}

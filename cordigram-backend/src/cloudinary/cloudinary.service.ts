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

  async uploadBuffer(params: {
    buffer: Buffer;
    folder?: string;
    publicId?: string;
    resourceType?: 'image' | 'video' | 'raw';
    overwrite?: boolean;
  }): Promise<UploadResult> {
    const {
      buffer,
      folder,
      publicId,
      resourceType = 'image',
      overwrite,
    } = params;

    const options: UploadApiOptions = {
      folder,
      public_id: publicId,
      resource_type: resourceType,
      overwrite: overwrite ?? false,
      unique_filename: true,
    };

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
}

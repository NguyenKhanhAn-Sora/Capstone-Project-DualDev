import * as dotenv from 'dotenv';
import { Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

@Injectable()
export class ConfigService {
  private require(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Missing env ${key}`);
    }
    return value;
  }

  get port(): number {
    return Number(process.env.PORT ?? 8888);
  }

  get appUrl(): string {
    return this.require('APP_URL');
  }

  get frontendUrl(): string {
    return this.require('FRONTEND_URL');
  }

  get mongoUri(): string {
    return this.require('MONGO_URI');
  }

  get jwtSecret(): string {
    return this.require('JWT_SECRET');
  }

  get jwtAccessExpiresIn(): number | `${number}${string}` {
    return this.require('JWT_ACCESS_EXPIRES_IN') as `${number}${string}`;
  }

  get jwtRefreshExpiresIn(): number | `${number}${string}` {
    return this.require('JWT_REFRESH_EXPIRES_IN') as `${number}${string}`;
  }

  get bcryptSaltRounds(): number {
    return Number(this.require('BCRYPT_SALT_ROUNDS'));
  }

  get otpExpiresIn(): string {
    return this.require('OTP_EXPIRES_IN');
  }

  get otpCodeLength(): number {
    return Number(this.require('OTP_CODE_LENGTH'));
  }

  get otpResendCooldown(): string {
    return this.require('OTP_RESEND_COOLDOWN');
  }

  get otpMaxAttempts(): number {
    return Number(this.require('OTP_MAX_ATTEMPTS'));
  }

  get otpMaxPerHour(): number {
    return Number(this.require('OTP_MAX_PER_HOUR'));
  }

  get otpHashSecret(): string {
    return this.require('OTP_HASH_SECRET');
  }

  get smtpHost(): string {
    return this.require('SMTP_HOST');
  }

  get smtpPort(): number {
    return Number(this.require('SMTP_PORT'));
  }

  get smtpSecure(): boolean {
    return String(this.require('SMTP_SECURE')).toLowerCase() === 'true';
  }

  get smtpUser(): string {
    return this.require('SMTP_USER');
  }

  get smtpPass(): string {
    return this.require('SMTP_PASS');
  }

  get mailFrom(): string {
    return this.require('MAIL_FROM');
  }

  get cloudinaryCloudName(): string {
    return this.require('CLOUDINARY_CLOUD_NAME');
  }

  get cloudinaryApiKey(): string {
    return this.require('CLOUDINARY_API_KEY');
  }

  get cloudinaryApiSecret(): string {
    return this.require('CLOUDINARY_API_SECRET');
  }

  get cloudinaryFolder(): string {
    return process.env.CLOUDINARY_FOLDER?.replace(/\/$/, '') ?? '';
  }

  get cloudinaryMaxFileSize(): number {
    return Number(process.env.CLOUDINARY_MAX_FILE_SIZE ?? 15 * 1024 * 1024);
  }

  get moderationEnabled(): boolean {
    return (
      String(process.env.MODERATION_ENABLED ?? 'true').toLowerCase() === 'true'
    );
  }

  get moderationProvider(): 'rekognition' | 'service' {
    const value = (process.env.MODERATION_PROVIDER ?? 'rekognition')
      .trim()
      .toLowerCase();
    return value === 'service' ? 'service' : 'rekognition';
  }

  get moderationServiceUrl(): string | null {
    const value = process.env.MODERATION_SERVICE_URL?.trim() ?? '';
    return value ? value.replace(/\/$/, '') : null;
  }

  get moderationTimeoutMs(): number {
    return Number(process.env.MODERATION_TIMEOUT_MS ?? 8000);
  }

  get moderationFailOpen(): boolean {
    return (
      String(process.env.MODERATION_FAIL_OPEN ?? 'true').toLowerCase() ===
      'true'
    );
  }

  get moderationBlurThreshold(): number {
    return Number(process.env.MODERATION_BLUR_THRESHOLD ?? 0.55);
  }

  get moderationRejectThreshold(): number {
    return Number(process.env.MODERATION_REJECT_THRESHOLD ?? 0.82);
  }

  get moderationVideoMaxWaitMs(): number {
    return Number(process.env.MODERATION_VIDEO_MAX_WAIT_MS ?? 30000);
  }

  get moderationVideoPollIntervalMs(): number {
    return Number(process.env.MODERATION_VIDEO_POLL_INTERVAL_MS ?? 2000);
  }

  get awsRegion(): string {
    return this.require('AWS_REGION');
  }

  get moderationS3Bucket(): string {
    return this.require('MODERATION_S3_BUCKET');
  }

  get moderationS3Prefix(): string {
    return (process.env.MODERATION_S3_PREFIX ?? 'moderation-inputs').trim();
  }

  get googleClientId(): string {
    return this.require('GOOGLE_CLIENT_ID');
  }

  get googleClientSecret(): string {
    return this.require('GOOGLE_CLIENT_SECRET');
  }

  get googleCallbackUrl(): string {
    return this.require('GOOGLE_CALLBACK_URL');
  }

  get livekitApiKey(): string {
    return this.require('LIVEKIT_API_KEY');
  }

  get livekitApiSecret(): string {
    return this.require('LIVEKIT_API_SECRET');
  }

  get livekitUrl(): string {
    return this.require('NEXT_PUBLIC_LIVEKIT_URL');
  }

  get livestreamHqProvider(): 'livekit' | 'ivs' {
    const value = (process.env.LIVESTREAM_HQ_PROVIDER ?? 'livekit')
      .trim()
      .toLowerCase();
    return value === 'ivs' ? 'ivs' : 'livekit';
  }

  get ivsRegion(): string {
    return process.env.AWS_IVS_REGION?.trim() || this.awsRegion;
  }

  get ivsAccessKeyId(): string {
    return process.env.AWS_IVS_ACCESS_KEY_ID?.trim() ?? '';
  }

  get ivsSecretAccessKey(): string {
    return process.env.AWS_IVS_SECRET_ACCESS_KEY?.trim() ?? '';
  }

  get adminEmail(): string | null {
    return process.env.ADMIN_EMAIL?.toLowerCase().trim() ?? null;
  }

  get adminPassword(): string | null {
    return process.env.ADMIN_PASSWORD ?? null;
  }

  get stripePublicKey(): string {
    return this.require('STRIPE_PUBLIC_KEY');
  }

  get stripeSecretKey(): string {
    return this.require('STRIPE_SECRET_KEY');
  }

  get stripeWebhookSecret(): string {
    return this.require('STRIPE_WEBHOOK_SECRET');
  }

  get fcmServiceAccountPath(): string | null {
    const value = process.env.FCM_SERVICE_ACCOUNT_PATH?.trim() ?? '';
    return value || null;
  }

  get fcmServiceAccountJson(): string | null {
    const value = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim() ?? '';
    return value || null;
  }
}

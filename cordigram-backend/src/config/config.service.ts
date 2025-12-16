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
    return Number(process.env.PORT ?? 3000);
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

  get googleClientId(): string {
    return this.require('GOOGLE_CLIENT_ID');
  }

  get googleClientSecret(): string {
    return this.require('GOOGLE_CLIENT_SECRET');
  }

  get googleCallbackUrl(): string {
    return this.require('GOOGLE_CALLBACK_URL');
  }
}

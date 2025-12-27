import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomInt, createHmac } from 'crypto';
import { Otp } from './otp.schema';
import { ConfigService } from '../config/config.service';
import { parseDuration } from '../common/time.util';

@Injectable()
export class OtpService {
  private readonly expireMs: number;
  private readonly cooldownMs: number;

  constructor(
    @InjectModel(Otp.name) private readonly otpModel: Model<Otp>,
    private readonly config: ConfigService,
  ) {
    this.expireMs = parseDuration(this.config.otpExpiresIn);
    this.cooldownMs = parseDuration(this.config.otpResendCooldown);
  }

  private hashCode(email: string, code: string): string {
    return createHmac('sha256', this.config.otpHashSecret)
      .update(`${email}:${code}`)
      .digest('hex');
  }

  private generateCode(): string {
    const length = this.config.otpCodeLength;
    const max = 10 ** length;
    const num = randomInt(0, max);
    return num.toString().padStart(length, '0');
  }

  async requestOtp(
    email: string,
  ): Promise<{ code: string; expiresMs: number }> {
    const now = new Date();
    const cooldownSince = new Date(now.getTime() - this.cooldownMs);
    const recent = await this.otpModel
      .findOne({ email })
      .sort({ createdAt: -1 })
      .exec();
    if (recent && recent.createdAt && recent.createdAt > cooldownSince) {
      const lastSent = recent.lastSentAt ?? recent.createdAt;
      const elapsed = now.getTime() - lastSent.getTime();
      const remainingMs = Math.max(0, this.cooldownMs - elapsed);
      throw new BadRequestException({
        message: 'OTP recently sent, please wait.',
        retryAfterSec: Math.max(1, Math.ceil(remainingMs / 1000)),
      });
    }

    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const countLastHour = await this.otpModel.countDocuments({
      email,
      createdAt: { $gte: hourAgo },
    });
    if (countLastHour >= this.config.otpMaxPerHour) {
      throw new BadRequestException('OTP request limit reached.');
    }

    const code = this.generateCode();
    const codeHash = this.hashCode(email, code);
    const expiresAt = new Date(now.getTime() + this.expireMs);

    await this.otpModel.create({
      email,
      codeHash,
      expiresAt,
      consumed: false,
      attempts: 0,
      sentCount: (recent?.sentCount ?? 0) + 1,
      lastSentAt: now,
    });

    return { code, expiresMs: this.expireMs };
  }

  async verifyOtpCode(
    email: string,
    code: string,
    opts?: { consume?: boolean },
  ): Promise<Otp> {
    const otp = await this.otpModel
      .findOne({ email, consumed: false, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .exec();

    if (!otp) {
      throw new BadRequestException('OTP not found or expired.');
    }

    if (otp.attempts >= this.config.otpMaxAttempts) {
      throw new BadRequestException('Too many attempts.');
    }

    const hash = this.hashCode(email, code);
    const isValid = hash === otp.codeHash;

    if (!isValid) {
      otp.attempts += 1;
      await otp.save();
      throw new BadRequestException('Invalid code.');
    }

    if (opts?.consume !== false) {
      otp.consumed = true;
    }
    await otp.save();
    return otp;
  }

  async verifyOtp(email: string, code: string): Promise<Otp> {
    return this.verifyOtpCode(email, code, { consume: true });
  }
}

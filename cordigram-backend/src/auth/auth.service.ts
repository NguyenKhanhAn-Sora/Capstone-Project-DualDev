import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '../config/config.service';
import { UsersService } from '../users/users.service';
import { ProfilesService } from '../profiles/profiles.service';
import { Types } from 'mongoose';
import {
  CloudinaryService,
  UploadResult,
} from '../cloudinary/cloudinary.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Session } from './session.schema';
import * as crypto from 'crypto';
import { OtpService } from '../otp/otp.service';
import { MailService } from '../mail/mail.service';
import {
  ForgotPasswordRequestDto,
  ResetPasswordDto,
  VerifyResetOtpDto,
} from './dto/forgot-password.dto';
import type { Role } from '../users/user.schema';

interface TokenPayload {
  sub: string;
  email: string;
  type: 'signup' | 'access' | 'two-factor';
  loginMethod?: string;
  roles?: Role[];
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Session.name) private readonly sessionModel: Model<Session>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    private readonly profilesService: ProfilesService,
    private readonly cloudinary: CloudinaryService,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
  ) {}

  createSignupToken(userId: string, email: string): string {
    const payload: TokenPayload = { sub: userId, email, type: 'signup' };
    return this.jwt.sign(payload, {
      secret: this.config.jwtSecret,
      expiresIn: '15m',
    });
  }

  createAccessToken(userId: string, email: string, roles?: Role[]): string {
    const payload: TokenPayload = { sub: userId, email, type: 'access', roles };
    const opts: JwtSignOptions = {
      secret: this.config.jwtSecret,
      expiresIn: this.config.jwtAccessExpiresIn as JwtSignOptions['expiresIn'],
    };
    return this.jwt.sign(payload, opts);
  }

  verifySignupToken(token: string): TokenPayload {
    try {
      const payload = this.jwt.verify<TokenPayload>(token, {
        secret: this.config.jwtSecret,
      });
      if (payload.type !== 'signup') {
        throw new UnauthorizedException('Invalid token type');
      }
      return payload;
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  createTwoFactorToken(userId: string, email: string, loginMethod?: string) {
    const payload: TokenPayload = {
      sub: userId,
      email,
      type: 'two-factor',
      loginMethod,
    };
    return this.jwt.sign(payload, {
      secret: this.config.jwtSecret,
      expiresIn: '10m',
    });
  }

  verifyTwoFactorToken(token: string): TokenPayload {
    try {
      const payload = this.jwt.verify<TokenPayload>(token, {
        secret: this.config.jwtSecret,
      });
      if (payload.type !== 'two-factor') {
        throw new UnauthorizedException('Invalid token type');
      }
      return payload;
    } catch (_err) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private generateRefreshToken(): {
    token: string;
    hash: string;
    expiresAt: Date;
  } {
    const token = crypto.randomBytes(48).toString('base64url');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const days = Number(process.env.REFRESH_TOKEN_DAYS || 30);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return { token, hash, expiresAt };
  }

  private parseUserAgent(ua?: string): {
    deviceType: string;
    os: string;
    browser: string;
  } {
    const source = ua ?? '';
    const lower = source.toLowerCase();
    let deviceType = 'desktop';
    if (lower.includes('tablet') || lower.includes('ipad'))
      deviceType = 'tablet';
    if (lower.includes('mobile')) deviceType = 'mobile';

    let os = 'unknown';
    if (lower.includes('windows')) os = 'Windows';
    else if (lower.includes('mac os') || lower.includes('macintosh'))
      os = 'macOS';
    else if (lower.includes('android')) os = 'Android';
    else if (
      lower.includes('iphone') ||
      lower.includes('ipad') ||
      lower.includes('ios')
    )
      os = 'iOS';
    else if (lower.includes('linux')) os = 'Linux';

    let browser = 'unknown';
    if (lower.includes('edg/')) browser = 'Edge';
    else if (lower.includes('chrome/')) browser = 'Chrome';
    else if (lower.includes('firefox/')) browser = 'Firefox';
    else if (lower.includes('safari/') && !lower.includes('chrome/'))
      browser = 'Safari';

    return { deviceType, os, browser };
  }

  private buildDeviceIdHash(params: {
    deviceId?: string;
    userAgent?: string;
    ip?: string;
  }): string {
    const base = params.deviceId?.trim()
      ? params.deviceId.trim()
      : `${params.userAgent ?? ''}::${params.ip ?? ''}`;
    return crypto
      .createHmac('sha256', this.config.jwtSecret)
      .update(base)
      .digest('hex');
  }

  private async persistRefreshToken(params: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    deviceInfo?: string;
    deviceIdHash?: string;
    ip?: string;
    location?: string;
    loginMethod?: string;
    deviceType?: string;
    os?: string;
    browser?: string;
  }): Promise<void> {
    await this.sessionModel.create({
      userId: new Types.ObjectId(params.userId),
      tokenHash: params.tokenHash,
      expiresAt: params.expiresAt,
      userAgent: params.userAgent ?? '',
      deviceInfo: params.deviceInfo ?? '',
      deviceIdHash: params.deviceIdHash ?? '',
      deviceType: params.deviceType ?? '',
      os: params.os ?? '',
      browser: params.browser ?? '',
      ip: params.ip ?? '',
      location: params.location ?? '',
      loginMethod: params.loginMethod ?? '',
      lastSeenAt: new Date(),
    });
  }

  async revokeRefreshToken(token: string): Promise<void> {
    if (!token) return;
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await this.sessionModel.deleteOne({ tokenHash: hash }).exec();
  }

  async login(params: {
    email: string;
    password: string;
    userAgent?: string;
    deviceInfo?: string;
    deviceId?: string;
    ip?: string;
    loginMethod?: string;
  }): Promise<
    | { accessToken: string; refreshToken: string }
    | { requiresTwoFactor: true; twoFactorToken: string; expiresSec: number }
  > {
    const user = await this.usersService.findByEmail(params.email);
    if (!user) {
      throw new BadRequestException('Email does not exist in the system');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Invalid sign-in method');
    }

    const passwordOk = await bcrypt.compare(params.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Incorrect password');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('Account is not ready for login');
    }

    const deviceId = params.deviceId ?? '';
    if (user.twoFactorEnabled) {
      const trusted = deviceId
        ? await this.usersService.isTwoFactorTrustedDevice({
            userId: user.id,
            deviceId,
          })
        : false;
      if (!trusted) {
        const { code, expiresMs } = await this.otpService.requestOtp(
          user.email,
        );
        await this.mailService.sendTwoFactorOtp(
          user.email,
          code,
          Math.floor(expiresMs / 60000),
        );
        const { deviceType, os, browser } = this.parseUserAgent(
          params.userAgent,
        );
        const deviceIdHash = this.buildDeviceIdHash({
          deviceId: params.deviceId,
          userAgent: params.userAgent,
          ip: params.ip,
        });
        await this.usersService.createLoginAlert({
          userId: user.id,
          deviceInfo: params.deviceInfo,
          deviceType,
          os,
          browser,
          location: '',
          ip: params.ip,
          deviceIdHash,
        });
        const twoFactorToken = this.createTwoFactorToken(
          user.id,
          user.email,
          params.loginMethod,
        );
        return {
          requiresTwoFactor: true,
          twoFactorToken,
          expiresSec: Math.max(1, Math.ceil(expiresMs / 1000)),
        };
      }
    }

    const accessToken = this.createAccessToken(
      user.id,
      user.email,
      user.roles ?? ['user'],
    );
    const { deviceType, os, browser } = this.parseUserAgent(params.userAgent);
    const deviceIdHash = this.buildDeviceIdHash({
      deviceId: params.deviceId,
      userAgent: params.userAgent,
      ip: params.ip,
    });
    const refresh = this.generateRefreshToken();
    await this.persistRefreshToken({
      userId: user.id,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
      userAgent: params.userAgent,
      deviceInfo: params.deviceInfo,
      deviceIdHash,
      ip: params.ip,
      loginMethod: params.loginMethod ?? 'password',
      deviceType,
      os,
      browser,
    });

    await this.usersService.recordLoginDevice({
      userId: user.id,
      deviceId: params.deviceId,
      userAgent: params.userAgent,
      deviceInfo: params.deviceInfo,
      ip: params.ip,
      loginMethod: params.loginMethod ?? 'password',
    });
    return { accessToken, refreshToken: refresh.token };
  }

  async adminLogin(params: {
    email: string;
    password: string;
    userAgent?: string;
    deviceInfo?: string;
    deviceId?: string;
    ip?: string;
  }): Promise<{ accessToken: string; refreshToken: string; roles: Role[] }> {
    const email = params.email.toLowerCase();
    const envEmail = this.config.adminEmail;
    const envPassword = this.config.adminPassword;
    let user = null as Awaited<
      ReturnType<typeof this.usersService.findByEmail>
    > | null;

    if (envEmail && envPassword && email === envEmail) {
      if (params.password === envPassword) {
        const saltRounds = this.config.bcryptSaltRounds;
        const hash = await bcrypt.hash(envPassword, saltRounds);
        user = await this.usersService.ensureAdminUser({
          email,
          passwordHash: hash,
        });
      }
    }

    if (!user) {
      user = await this.usersService.findByEmail(email);
      if (!user || !user.passwordHash) {
        throw new UnauthorizedException('Invalid credentials');
      }
      if (!user.roles?.includes('admin')) {
        throw new ForbiddenException('Admin access required');
      }
      const passwordOk = await bcrypt.compare(
        params.password,
        user.passwordHash,
      );
      if (!passwordOk) {
        throw new UnauthorizedException('Invalid credentials');
      }
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('Account is not active');
    }

    const accessToken = this.createAccessToken(
      user.id,
      user.email,
      user.roles ?? ['admin'],
    );
    const refresh = this.generateRefreshToken();
    const { deviceType, os, browser } = this.parseUserAgent(params.userAgent);
    const deviceIdHash = this.buildDeviceIdHash({
      deviceId: params.deviceId,
      userAgent: params.userAgent,
      ip: params.ip,
    });

    await this.persistRefreshToken({
      userId: user.id,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
      userAgent: params.userAgent,
      deviceInfo: params.deviceInfo,
      deviceIdHash,
      ip: params.ip,
      loginMethod: 'admin',
      deviceType,
      os,
      browser,
    });

    await this.usersService.recordLoginDevice({
      userId: user.id,
      deviceId: params.deviceId,
      userAgent: params.userAgent,
      deviceInfo: params.deviceInfo,
      ip: params.ip,
      loginMethod: 'admin',
    });

    return {
      accessToken,
      refreshToken: refresh.token,
      roles: user.roles ?? ['admin'],
    };
  }

  async verifyTwoFactorLogin(params: {
    token: string;
    code: string;
    trustDevice?: boolean;
    userAgent?: string;
    deviceInfo?: string;
    deviceId?: string;
    ip?: string;
  }): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = this.verifyTwoFactorToken(params.token);
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }
    await this.otpService.verifyOtp(user.email, params.code);

    const accessToken = this.createAccessToken(
      user.id,
      user.email,
      user.roles ?? ['user'],
    );
    const { deviceType, os, browser } = this.parseUserAgent(params.userAgent);
    const deviceIdHash = this.buildDeviceIdHash({
      deviceId: params.deviceId,
      userAgent: params.userAgent,
      ip: params.ip,
    });
    const refresh = this.generateRefreshToken();
    await this.persistRefreshToken({
      userId: user.id,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
      userAgent: params.userAgent,
      deviceInfo: params.deviceInfo,
      deviceIdHash,
      ip: params.ip,
      loginMethod: payload.loginMethod ?? 'password',
      deviceType,
      os,
      browser,
    });

    await this.usersService.recordLoginDevice({
      userId: user.id,
      deviceId: params.deviceId,
      userAgent: params.userAgent,
      deviceInfo: params.deviceInfo,
      ip: params.ip,
      loginMethod: payload.loginMethod ?? 'password',
    });

    if (params.trustDevice && params.deviceId) {
      await this.usersService.addTwoFactorTrustedDevice({
        userId: user.id,
        deviceId: params.deviceId,
        userAgent: params.userAgent,
      });
    }

    return { accessToken, refreshToken: refresh.token };
  }

  async resendTwoFactorOtp(token: string): Promise<{ expiresSec: number }> {
    const payload = this.verifyTwoFactorToken(token);
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }
    const { code, expiresMs } = await this.otpService.requestOtp(user.email);
    await this.mailService.sendTwoFactorOtp(
      user.email,
      code,
      Math.floor(expiresMs / 60000),
    );
    return { expiresSec: Math.max(1, Math.ceil(expiresMs / 1000)) };
  }

  async loginWithGoogle(params: {
    email: string;
    providerId: string;
    refreshToken?: string | null;
    userAgent?: string;
    deviceInfo?: string;
    deviceId?: string;
    ip?: string;
  }): Promise<
    | {
        mode: 'login';
        accessToken: string;
        refreshToken: string;
        needsProfile: false;
      }
    | { mode: 'complete-profile'; signupToken: string; needsProfile: true }
    | { mode: 'signup'; signupToken: string; needsProfile: true }
  > {
    const email = params.email.toLowerCase();
    let user = await this.usersService.findByEmail(email);

    if (!user) {
      user = await this.usersService.createWithGoogle({
        email,
        providerId: params.providerId,
        refreshToken: params.refreshToken ?? null,
      });

      const signupToken = this.createSignupToken(user.id, email);
      return { mode: 'signup', signupToken, needsProfile: true };
    }

    if (user.status === 'banned') {
      throw new UnauthorizedException('Tài khoản đã bị khóa');
    }

    await this.usersService.addOrUpdateOAuthProvider({
      userId: user.id,
      provider: 'google',
      providerId: params.providerId,
      refreshToken: params.refreshToken ?? null,
    });

    const requiresProfile =
      user.signupStage !== 'completed' || user.status !== 'active';

    if (requiresProfile) {
      const signupToken = this.createSignupToken(user.id, email);
      return { mode: 'complete-profile', signupToken, needsProfile: true };
    }

    const accessToken = this.createAccessToken(
      user.id,
      email,
      user.roles ?? ['user'],
    );
    const refresh = this.generateRefreshToken();
    const { deviceType, os, browser } = this.parseUserAgent(params.userAgent);
    const deviceIdHash = this.buildDeviceIdHash({
      deviceId: params.deviceId,
      userAgent: params.userAgent,
      ip: params.ip,
    });
    await this.persistRefreshToken({
      userId: user.id,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
      userAgent: params.userAgent,
      deviceInfo: params.deviceInfo,
      deviceIdHash,
      ip: params.ip,
      loginMethod: 'google',
      deviceType,
      os,
      browser,
    });
    await this.usersService.recordLoginDevice({
      userId: user.id,
      deviceId: params.deviceId,
      userAgent: params.userAgent,
      deviceInfo: params.deviceInfo,
      ip: params.ip,
      loginMethod: 'google',
    });
    return {
      mode: 'login',
      accessToken,
      refreshToken: refresh.token,
      needsProfile: false,
    };
  }

  async completeProfile(params: {
    token: string;
    email: string;
    displayName: string;
    username: string;
    birthdate?: string;
    avatarUrl?: string;
    avatarOriginalUrl?: string;
    avatarPublicId?: string;
    avatarOriginalPublicId?: string;
    coverUrl?: string;
    bio?: string;
    location?: string;
    gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
    links?: Record<string, string>;
    password?: string;
  }): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = this.verifySignupToken(params.token);
    if (payload.email !== params.email) {
      throw new UnauthorizedException('Email mismatch');
    }

    const user = await this.usersService.findByEmail(params.email);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (params.password) {
      const saltRounds = this.config.bcryptSaltRounds;
      const hash = await bcrypt.hash(params.password, saltRounds);
      await this.usersService.setPassword(user.id, hash);
    }

    const birthdate = params.birthdate ? new Date(params.birthdate) : null;
    await this.profilesService.createOrUpdate({
      userId: new Types.ObjectId(user.id),
      displayName: params.displayName,
      username: params.username,
      avatarUrl: params.avatarUrl,
      avatarOriginalUrl: params.avatarOriginalUrl,
      avatarPublicId: params.avatarPublicId,
      avatarOriginalPublicId: params.avatarOriginalPublicId,
      coverUrl: params.coverUrl,
      bio: params.bio,
      location: params.location,
      gender: params.gender,
      links: params.links,
      birthdate,
    });

    await this.usersService.completeSignup(user.id);
    const accessToken = this.createAccessToken(
      user.id,
      user.email,
      user.roles ?? ['user'],
    );
    const refresh = this.generateRefreshToken();
    await this.persistRefreshToken({
      userId: user.id,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
    });
    return { accessToken, refreshToken: refresh.token };
  }

  async refreshAccessToken(params: {
    refreshToken: string;
    userAgent?: string;
    deviceInfo?: string;
    deviceId?: string;
    ip?: string;
  }): Promise<{ accessToken: string; refreshToken: string }> {
    if (!params.refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const hash = crypto
      .createHash('sha256')
      .update(params.refreshToken)
      .digest('hex');
    const session = await this.sessionModel
      .findOne({ tokenHash: hash, expiresAt: { $gt: new Date() } })
      .lean()
      .exec();
    if (!session) {
      throw new ForbiddenException('Refresh token invalid or expired');
    }
    const user = await this.usersService.findById(session.userId.toString());
    if (!user || user.status !== 'active') {
      throw new ForbiddenException('User not allowed');
    }

    await this.sessionModel.deleteOne({ _id: session._id }).exec();

    const accessToken = this.createAccessToken(
      user.id,
      user.email,
      user.roles ?? ['user'],
    );
    const next = this.generateRefreshToken();
    const { deviceType, os, browser } = this.parseUserAgent(params.userAgent);
    const deviceIdHash = this.buildDeviceIdHash({
      deviceId: params.deviceId,
      userAgent: params.userAgent,
      ip: params.ip,
    });
    await this.persistRefreshToken({
      userId: user.id,
      tokenHash: next.hash,
      expiresAt: next.expiresAt,
      userAgent: params.userAgent,
      deviceInfo: params.deviceInfo,
      deviceIdHash,
      ip: params.ip,
      loginMethod: 'refresh',
      deviceType,
      os,
      browser,
    });

    await this.usersService.recordLoginDevice({
      userId: user.id,
      deviceId: params.deviceId,
      userAgent: params.userAgent,
      deviceInfo: params.deviceInfo,
      ip: params.ip,
      loginMethod: 'refresh',
    });

    return { accessToken, refreshToken: next.token };
  }

  async uploadAvatarImage(params: {
    buffer: Buffer;
    folder: string;
    publicId: string;
  }): Promise<UploadResult> {
    return this.cloudinary.uploadBuffer({
      buffer: params.buffer,
      folder: params.folder,
      publicId: params.publicId,
      resourceType: 'image',
      overwrite: false,
    });
  }

  async requestPasswordReset(dto: ForgotPasswordRequestDto) {
    const email = dto.email.toLowerCase();
    const user = await this.usersService.findByEmail(email);
    // Không tiết lộ sự tồn tại, nhưng có thể từ chối nếu banned
    if (!user) return { ok: true };
    if (user.status === 'banned') {
      throw new ForbiddenException('Tài khoản đã bị khóa');
    }

    const { code, expiresMs } = await this.otpService.requestOtp(email);
    await this.mailService.sendPasswordResetEmail(
      email,
      code,
      Math.ceil(expiresMs / 60000),
    );
    return { ok: true };
  }

  async verifyResetOtp(dto: VerifyResetOtpDto) {
    const email = dto.email.toLowerCase();
    await this.otpService.verifyOtpCode(email, dto.otp, { consume: false });
    return { ok: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.toLowerCase();
    const user = await this.usersService.findByEmail(email);
    if (!user || user.status === 'banned') {
      throw new BadRequestException('Yêu cầu không hợp lệ');
    }

    await this.otpService.verifyOtp(email, dto.otp);
    const saltRounds = this.config.bcryptSaltRounds;
    const hash = await bcrypt.hash(dto.newPassword, saltRounds);
    await this.usersService.setPassword(user.id, hash);

    await this.usersService.logoutAllDevices({ userId: user.id });
    return { ok: true };
  }
}

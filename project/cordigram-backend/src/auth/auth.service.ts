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

interface TokenPayload {
  sub: string;
  email: string;
  type: 'signup' | 'access';
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
  ) {}

  createSignupToken(userId: string, email: string): string {
    const payload: TokenPayload = { sub: userId, email, type: 'signup' };
    return this.jwt.sign(payload, {
      secret: this.config.jwtSecret,
      expiresIn: '15m',
    });
  }

  createAccessToken(userId: string, email: string): string {
    const payload: TokenPayload = { sub: userId, email, type: 'access' };
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

  private async persistRefreshToken(params: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    deviceInfo?: string;
  }): Promise<void> {
    await this.sessionModel.create({
      userId: new Types.ObjectId(params.userId),
      tokenHash: params.tokenHash,
      expiresAt: params.expiresAt,
      userAgent: params.userAgent ?? '',
      deviceInfo: params.deviceInfo ?? '',
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
  }): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.usersService.findByEmail(params.email);
    if (!user) {
      throw new BadRequestException('Email không tồn tại trong hệ thống');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Password sai');
    }

    const passwordOk = await bcrypt.compare(params.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Password sai');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('Tài khoản chưa sẵn sàng để đăng nhập');
    }

    const accessToken = this.createAccessToken(user.id, user.email);
    const refresh = this.generateRefreshToken();
    await this.persistRefreshToken({
      userId: user.id,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
      userAgent: params.userAgent,
      deviceInfo: params.deviceInfo,
    });
    return { accessToken, refreshToken: refresh.token };
  }

  async loginWithGoogle(params: {
    email: string;
    providerId: string;
    refreshToken?: string | null;
    userAgent?: string;
    deviceInfo?: string;
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

    const accessToken = this.createAccessToken(user.id, email);
    const refresh = this.generateRefreshToken();
    await this.persistRefreshToken({
      userId: user.id,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
      userAgent: params.userAgent,
      deviceInfo: params.deviceInfo,
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
      links: params.links,
      birthdate,
    });

    await this.usersService.completeSignup(user.id);
    const accessToken = this.createAccessToken(user.id, user.email);
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

    const accessToken = this.createAccessToken(user.id, user.email);
    const next = this.generateRefreshToken();
    await this.persistRefreshToken({
      userId: user.id,
      tokenHash: next.hash,
      expiresAt: next.expiresAt,
      userAgent: params.userAgent,
      deviceInfo: params.deviceInfo,
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
}

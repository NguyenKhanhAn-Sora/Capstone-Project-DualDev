import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  Headers,
  Injectable,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { LoginDto } from './dto/login.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { TwoFactorResendDto, TwoFactorVerifyDto } from './dto/two-factor.dto';
import { UpsertRecentAccountDto } from './dto/upsert-recent-account.dto';
import {
  ForgotPasswordRequestDto,
  ResetPasswordDto,
  VerifyResetOtpDto,
} from './dto/forgot-password.dto';
import { OtpService } from '../otp/otp.service';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '../config/config.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { v4 as uuid } from 'uuid';
import type { Response, Request } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthenticatedUser } from './jwt.strategy';
type MulterFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

const MAX_AVATAR_BYTES = Number(
  process.env.CLOUDINARY_MAX_FILE_SIZE ?? 15 * 1024 * 1024,
);

const avatarFileFilter = (
  _req: unknown,
  file: MulterFile,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new BadRequestException('Please choose an image file'), false);
  }
  cb(null, true);
};

/**
 * Guard used exclusively by GET /auth/google/mobile.
 * Encodes the app's deviceId into the OAuth `state` parameter so it survives
 * the full Google redirect round-trip without relying on cookies.
 * State format: "mobile:<urlencoded-deviceId>"
 */
@Injectable()
class MobileGoogleGuard extends AuthGuard('google') {
  override getAuthenticateOptions(context: ExecutionContext) {
    const req = context
      .switchToHttp()
      .getRequest<{ query: Record<string, string> }>();
    const deviceId = encodeURIComponent(req.query?.deviceId ?? '');
    return { state: `mobile:${deviceId}` };
  }
}

/**
 * Guard used by GET /auth/google (web).
 * Encodes web deviceId into OAuth state so callback can persist the same
 * login device and avoid immediate "Device session revoked" on next API call.
 * State format: "web:<urlencoded-deviceId>"
 */
@Injectable()
class WebGoogleGuard extends AuthGuard('google') {
  override getAuthenticateOptions(context: ExecutionContext) {
    const req = context
      .switchToHttp()
      .getRequest<{ query: Record<string, string> }>();
    const deviceId = encodeURIComponent(req.query?.deviceId ?? '');
    return { state: `web:${deviceId}` };
  }
}

@Controller('auth')
export class AuthController {
  private static readonly USER_REFRESH_COOKIE = 'refresh_token';
  private static readonly ADMIN_REFRESH_COOKIE = 'admin_refresh_token';

  constructor(
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  @Post('request-otp')
  async requestOtp(@Body() dto: RequestOtpDto) {
    const email = dto.email.toLowerCase();
    const adminEmail = this.config.adminEmail;
    if (adminEmail && email === adminEmail) {
      throw new BadRequestException('Email is reserved');
    }
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      const isCompleted =
        existing.signupStage === 'completed' || existing.status === 'active';

      if (isCompleted) {
        throw new BadRequestException('Email already existed!');
      }

      if (existing.status === 'banned') {
        throw new BadRequestException('Account has been banned');
      }
    }
    const { code, expiresMs } = await this.otpService.requestOtp(email);
    await this.mailService.sendOtpEmail(
      email,
      code,
      Math.floor(expiresMs / 60000),
    );
    return { message: 'OTP sent' };
  }

  @Post('verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    const email = dto.email.toLowerCase();
    await this.otpService.verifyOtp(email, dto.code);
    const user = await this.usersService.createPending(email);
    const signupToken = this.authService.createSignupToken(user.id, email);
    return { signupToken };
  }

  @Post('upload-avatar')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'original', maxCount: 1 },
        { name: 'cropped', maxCount: 1 },
      ],
      {
        limits: { fileSize: MAX_AVATAR_BYTES },
        fileFilter: avatarFileFilter,
      },
    ),
  )
  async uploadAvatar(
    @UploadedFiles()
    files: {
      original?: MulterFile[];
      cropped?: MulterFile[];
    },
    @Headers('authorization') authHeader: string | undefined,
  ) {
    const token = this.extractToken(authHeader);
    const payload = this.authService.verifySignupToken(token);

    const originalFile = files?.original?.[0];
    const croppedFile = files?.cropped?.[0];
    if (!originalFile || !croppedFile) {
      throw new BadRequestException('Thiếu file original hoặc cropped');
    }

    const folder = [
      this.config.cloudinaryFolder,
      'users',
      payload.sub,
      'avatars',
    ]
      .filter(Boolean)
      .join('/');

    const suffix = uuid();
    const [original, cropped] = await Promise.all([
      this.authService.uploadAvatarImage({
        buffer: originalFile.buffer,
        folder,
        publicId: `original-${suffix}`,
      }),
      this.authService.uploadAvatarImage({
        buffer: croppedFile.buffer,
        folder,
        publicId: `avatar-${suffix}`,
      }),
    ]);

    return {
      avatarUrl: cropped.secureUrl,
      avatarPublicId: cropped.publicId,
      avatarOriginalUrl: original.secureUrl,
      avatarOriginalPublicId: original.publicId,
    };
  }

  @Post('complete-profile')
  async completeProfile(
    @Body() dto: CompleteProfileDto,
    @Headers('authorization') authHeader: string | undefined,
    @Res() res: Response,
  ) {
    const token = this.extractToken(authHeader);
    const result = await this.authService.completeProfile({
      token,
      email: dto.email.toLowerCase(),
      displayName: dto.displayName,
      username: dto.username.toLowerCase(),
      birthdate: dto.birthdate,
      avatarUrl: dto.avatarUrl,
      avatarOriginalUrl: dto.avatarOriginalUrl,
      avatarPublicId: dto.avatarPublicId,
      avatarOriginalPublicId: dto.avatarOriginalPublicId,
      coverUrl: dto.coverUrl,
      bio: dto.bio,
      location: dto.location,
      gender: dto.gender,
      links: dto.links,
      password: dto.password,
    });

    this.setRefreshCookie(res, result.refreshToken);
    return res.json({ accessToken: result.accessToken });
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ||
      req.ip ||
      '';
    const email = dto.email.toLowerCase();
    const result = await this.authService.login({
      email,
      password: dto.password,
      userAgent: req.headers['user-agent'],
      deviceInfo: req.headers['x-device-info'] as string,
      deviceId: req.headers['x-device-id'] as string,
      ip,
      loginMethod: dto.loginMethod ?? (req.headers['x-login-method'] as string),
    });

    if ('requiresTwoFactor' in result && result.requiresTwoFactor) {
      return res.json(result);
    }

    const { accessToken, refreshToken } = result as {
      accessToken: string;
      refreshToken: string;
    };
    this.setRefreshCookie(res, refreshToken);
    return res.json({ accessToken });
  }

  @Post('admin/login')
  async adminLogin(
    @Body() dto: AdminLoginDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ||
      req.ip ||
      '';
    const result = await this.authService.adminLogin({
      email: dto.email,
      password: dto.password,
      userAgent: req.headers['user-agent'],
      deviceInfo: req.headers['x-device-info'] as string,
      deviceId: req.headers['x-device-id'] as string,
      ip,
    });

    this.setRefreshCookie(res, result.refreshToken, {
      name: AuthController.ADMIN_REFRESH_COOKIE,
      path: '/auth/admin',
    });
    return res.json({
      accessToken: result.accessToken,
      roles: result.roles,
    });
  }

  @Post('admin/refresh')
  async refreshAdmin(@Req() req: Request, @Res() res: Response) {
    const token = (req as Request & { cookies?: Record<string, string> })
      .cookies?.[AuthController.ADMIN_REFRESH_COOKIE];
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ||
      req.ip ||
      '';
    const result = await this.authService.refreshAccessToken({
      refreshToken: token,
      userAgent: req.headers['user-agent'] as string,
      deviceInfo: req.headers['x-device-info'] as string,
      deviceId: req.headers['x-device-id'] as string,
      ip,
    });
    this.setRefreshCookie(res, result.refreshToken, {
      name: AuthController.ADMIN_REFRESH_COOKIE,
      path: '/auth/admin',
    });
    return res.json({ accessToken: result.accessToken });
  }

  @Post('admin/logout')
  async adminLogout(@Req() req: Request, @Res() res: Response) {
    const token = (req as Request & { cookies?: Record<string, string> })
      .cookies?.[AuthController.ADMIN_REFRESH_COOKIE];
    await this.authService.revokeRefreshToken(token ?? '');
    res.clearCookie(AuthController.ADMIN_REFRESH_COOKIE, {
      path: '/auth/admin',
    });
    return res.json({ success: true });
  }

  @Post('two-factor/verify')
  async verifyTwoFactor(
    @Body() dto: TwoFactorVerifyDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ||
      req.ip ||
      '';
    const result = await this.authService.verifyTwoFactorLogin({
      token: dto.token,
      code: dto.code,
      trustDevice: dto.trustDevice,
      userAgent: req.headers['user-agent'] as string,
      deviceInfo: req.headers['x-device-info'] as string,
      deviceId: req.headers['x-device-id'] as string,
      ip,
    });

    this.setRefreshCookie(res, result.refreshToken);
    return res.json({ accessToken: result.accessToken });
  }

  @Post('two-factor/resend')
  async resendTwoFactor(@Body() dto: TwoFactorResendDto) {
    return this.authService.resendTwoFactorOtp(dto.token);
  }

  // ── Mobile Google OAuth entry point ──────────────────────────────────────
  // MobileGoogleGuard encodes deviceId into the OAuth `state` param so it
  // survives the full Google redirect round-trip without needing cookies.
  @Get('google/mobile')
  @UseGuards(MobileGoogleGuard)
  mobileGoogleAuth() {}

  @Get('google')
  @UseGuards(WebGoogleGuard)
  async googleAuth() {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ||
      req.ip ||
      '';

    // Decode platform + deviceId from the OAuth state param.
    // Format: "mobile:<urlencoded-deviceId>" or "web:<urlencoded-deviceId>".
    const rawState = (req.query as Record<string, string>)?.state;
    let isMobile = false;
    let stateDeviceId = '';
    if (rawState?.startsWith('mobile:')) {
      isMobile = true;
      stateDeviceId = decodeURIComponent(rawState.slice(7));
    } else if (rawState?.startsWith('web:')) {
      stateDeviceId = decodeURIComponent(rawState.slice(4));
    }

    const deviceId =
      stateDeviceId ||
      (req.cookies?.['device_id'] as string | undefined) ||
      (req.headers['x-device-id'] as string | undefined) ||
      '';

    const user = req.user as
      | undefined
      | {
          email: string;
          sub: string;
          refreshToken?: string | null;
        };

    if (!user) {
      throw new UnauthorizedException('Không lấy được thông tin Google');
    }

    const result = await this.authService.loginWithGoogle({
      email: user.email,
      providerId: user.sub,
      refreshToken: user.refreshToken ?? null,
      userAgent: req.headers['user-agent'] as string,
      deviceInfo: req.headers['x-device-info'] as string,
      deviceId,
      ip,
    });

    const params = new URLSearchParams();
    params.append('needsProfile', result.needsProfile ? '1' : '0');
    if ('signupToken' in result) {
      params.append('signupToken', result.signupToken);
    }

    if (isMobile) {
      // For mobile: pass refreshToken as URL param (app can't read HttpOnly cookies)
      if ('accessToken' in result) {
        params.append('accessToken', result.accessToken);
        params.append('refreshToken', result.refreshToken);
      }
      return res.redirect(
        `cordigram://auth/google/callback?${params.toString()}`,
      );
    }

    // Web flow — set cookie, redirect to frontend
    if ('accessToken' in result) {
      params.append('accessToken', result.accessToken);
      this.setRefreshCookie(res, result.refreshToken);
    }
    const redirectUrl = `${this.config.frontendUrl}/auth/google/callback?${params.toString()}`;
    return res.redirect(redirectUrl);
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
    const token = (req as Request & { cookies?: Record<string, string> })
      .cookies?.[AuthController.USER_REFRESH_COOKIE];
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ||
      req.ip ||
      '';
    const result = await this.authService.refreshAccessToken({
      refreshToken: token,
      userAgent: req.headers['user-agent'] as string,
      deviceInfo: req.headers['x-device-info'] as string,
      deviceId: req.headers['x-device-id'] as string,
      ip,
    });
    this.setRefreshCookie(res, result.refreshToken);
    return res.json({ accessToken: result.accessToken });
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    const token = (req as Request & { cookies?: Record<string, string> })
      .cookies?.[AuthController.USER_REFRESH_COOKIE];
    await this.authService.revokeRefreshToken(token ?? '');
    res.clearCookie(AuthController.USER_REFRESH_COOKIE, { path: '/auth' });
    return res.json({ success: true });
  }

  @Get('recent-accounts')
  @UseGuards(JwtAuthGuard)
  async getRecentAccounts(@Req() req: Request & { user?: AuthenticatedUser }) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    const recent = await this.usersService.getRecentAccounts(userId);
    return { recentAccounts: recent };
  }

  @Post('recent-accounts')
  @UseGuards(JwtAuthGuard)
  async upsertRecentAccount(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() dto: UpsertRecentAccountDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    const recent = await this.usersService.upsertRecentAccount({
      userId,
      email: dto.email,
      displayName: dto.displayName,
      username: dto.username,
      avatarUrl: dto.avatarUrl,
    });
    return { recentAccounts: recent };
  }

  @Delete('recent-accounts/:email')
  @UseGuards(JwtAuthGuard)
  async removeRecentAccount(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Param('email') email: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    const recent = await this.usersService.removeRecentAccount({
      userId,
      email,
    });
    return { recentAccounts: recent };
  }

  @Delete('recent-accounts')
  @UseGuards(JwtAuthGuard)
  async clearRecentAccounts(
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    const recent = await this.usersService.clearRecentAccounts(userId);
    return { recentAccounts: recent };
  }

  @Post('password/forgot')
  async forgotPassword(@Body() dto: ForgotPasswordRequestDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('password/verify')
  async verifyResetOtp(@Body() dto: VerifyResetOtpDto) {
    return this.authService.verifyResetOtp(dto);
  }

  @Post('password/reset')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  private setRefreshCookie(
    res: Response,
    token: string,
    options?: { name?: string; path?: string },
  ) {
    const name = options?.name ?? AuthController.USER_REFRESH_COOKIE;
    const path = options?.path ?? '/auth';
    res.cookie(name, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path,
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });
  }

  private extractToken(authHeader?: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedException('Invalid Authorization header');
    }
    return parts[1];
  }
}

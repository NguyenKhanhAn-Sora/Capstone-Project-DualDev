import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Patch,
  Query,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import type { Request } from 'express';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { BlocksService } from './blocks.service';
import { RequestChangeEmailCurrentOtpDto } from './dto/request-change-email-current-otp.dto';
import { VerifyChangeEmailCurrentOtpDto } from './dto/verify-change-email-current-otp.dto';
import { RequestChangeEmailNewOtpDto } from './dto/request-change-email-new-otp.dto';
import { VerifyChangeEmailNewOtpDto } from './dto/verify-change-email-new-otp.dto';
import { AuthService } from '../auth/auth.service';
import { VerifyChangePasswordOtpDto } from './dto/verify-change-password-otp.dto';
import { ConfirmChangePasswordDto } from './dto/confirm-change-password.dto';
import { RequestPasskeyOtpDto } from './dto/request-passkey-otp.dto';
import { VerifyPasskeyOtpDto } from './dto/verify-passkey-otp.dto';
import { ConfirmPasskeyDto } from './dto/confirm-passkey.dto';
import { VerifyPasskeyDeviceDto } from './dto/verify-passkey-device.dto';
import { TogglePasskeyDto } from './dto/toggle-passkey.dto';
import { LogoutLoginDeviceDto } from './dto/logout-login-device.dto';
import { RequestTwoFactorOtpDto } from './dto/request-two-factor-otp.dto';
import { VerifyTwoFactorOtpDto } from './dto/verify-two-factor-otp.dto';
import { ActivityType } from '../activity/activity.schema';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly blocksService: BlocksService,
    private readonly authService: AuthService,
  ) {}

  @Get('settings')
  async getSettings(
    @Req() req: Request & { user?: AuthenticatedUser },
  ): Promise<{ theme: 'light' | 'dark'; language: 'en' | 'vi' }> {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    const result = await this.usersService.getSettings(userId);
    return result;
  }

  @Get('notifications/settings')
  async getNotificationSettings(
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.getNotificationSettings(userId);
  }

  @Get('blocked')
  async getBlockedUsers(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Query('limit') limit?: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.usersService.listBlockedUsers(userId, parsedLimit ?? 50);
  }

  @Get('activity')
  async getActivity(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('type') type?: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const parsedLimit = limit ? Number(limit) : undefined;
    const types = type
      ? type
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
          .filter((value): value is ActivityType =>
            [
              'post_like',
              'comment_like',
              'comment',
              'repost',
              'save',
              'follow',
              'report_post',
              'report_user',
            ].includes(value as ActivityType),
          )
      : undefined;

    return this.usersService.listActivity({
      userId,
      types: types?.length ? types : undefined,
      limit: parsedLimit,
      cursor: cursor ?? null,
    });
  }

  @Get('password-change/status')
  async getPasswordChangeStatus(
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.getPasswordChangeStatus(userId);
  }

  @Get('passkey/status')
  async getPasskeyStatus(@Req() req: Request & { user?: AuthenticatedUser }) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.getPasskeyStatus(userId);
  }

  @Post('passkey/toggle')
  async togglePasskey(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() dto: TogglePasskeyDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.setPasskeyEnabled({
      userId,
      enabled: dto.enabled,
    });
  }

  @Get('two-factor/status')
  async getTwoFactorStatus(@Req() req: Request & { user?: AuthenticatedUser }) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    const user = await this.usersService.findById(userId);
    return { enabled: Boolean(user?.twoFactorEnabled) };
  }

  @Get('device-trust/status')
  async getDeviceTrustStatus(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Query('deviceId') deviceId?: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.getDeviceTrustStatus({ userId, deviceId });
  }

  @Get('login-devices')
  async getLoginDevices(@Req() req: Request & { user?: AuthenticatedUser }) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ||
      req.ip ||
      '';
    return this.usersService.getLoginDevices({
      userId,
      deviceId: req.headers['x-device-id'] as string,
      userAgent: req.headers['user-agent'] as string,
      ip,
    });
  }

  @Post('login-devices/logout')
  async logoutLoginDevice(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() dto: LogoutLoginDeviceDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.logoutLoginDevice({
      userId,
      deviceIdHash: dto.deviceIdHash,
    });
  }

  @Post('login-devices/logout-all')
  async logoutAllDevices(@Req() req: Request & { user?: AuthenticatedUser }) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ||
      req.ip ||
      '';
    return this.usersService.logoutAllDevicesExceptCurrent({
      userId,
      deviceId: req.headers['x-device-id'] as string,
      userAgent: req.headers['user-agent'] as string,
      ip,
    });
  }

  @Get('suggestions')
  async suggestPeople(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Query('limit') limit?: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.suggestPeople({
      viewerId: userId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Patch('settings')
  async updateSettings(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() dto: UpdateSettingsDto,
  ): Promise<{ theme: 'light' | 'dark'; language: 'en' | 'vi' }> {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    const result = await this.usersService.updateSettings({
      userId,
      theme: dto.theme,
      language: dto.language,
    });
    return result;
  }

  @Patch('notifications/settings')
  async updateNotificationSettings(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.updateNotificationSettings({
      userId,
      category: dto.category,
      enabled: dto.enabled,
      mutedIndefinitely: dto.mutedIndefinitely,
      mutedUntil: dto.mutedUntil ?? null,
    });
  }

  @Post('email-change/request-current-otp')
  async requestChangeEmailCurrentOtp(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() dto: RequestChangeEmailCurrentOtpDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.requestChangeEmailCurrentOtp({
      userId,
      password: dto.password,
    });
  }

  @Post('email-change/verify-current-otp')
  async verifyChangeEmailCurrentOtp(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() dto: VerifyChangeEmailCurrentOtpDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.verifyChangeEmailCurrentOtp({
      userId,
      code: dto.code,
    });
  }

  @Post('email-change/request-new-otp')
  async requestChangeEmailNewOtp(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() dto: RequestChangeEmailNewOtpDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.requestChangeEmailNewOtp({
      userId,
      newEmail: dto.newEmail,
    });
  }

  @Post('email-change/verify-new-otp')
  async verifyChangeEmailNewOtp(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() dto: VerifyChangeEmailNewOtpDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    const result = await this.usersService.verifyChangeEmailNewOtp({
      userId,
      code: dto.code,
    });
    if (!result.updated || !result.email) {
      return result;
    }
    const accessToken = this.authService.createAccessToken(
      userId,
      result.email,
    );
    return { ...result, accessToken };
  }

  @Post('password-change/request-otp')
  async requestChangePasswordOtp(
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.requestPasswordChangeOtp({ userId });
  }

  @Post('password-change/verify-otp')
  async verifyChangePasswordOtp(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() dto: VerifyChangePasswordOtpDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.verifyPasswordChangeOtp({
      userId,
      code: dto.code,
    });
  }

  @Post('password-change/confirm')
  async confirmChangePassword(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() dto: ConfirmChangePasswordDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.confirmPasswordChange({
      userId,
      currentPassword: dto.currentPassword,
      newPassword: dto.newPassword,
    });
  }

  @Post('passkey/request-otp')
  async requestPasskeyOtp(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() dto: RequestPasskeyOtpDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.requestPasskeyOtp({
      userId,
      password: dto.password,
    });
  }

  @Post('passkey/verify-otp')
  async verifyPasskeyOtp(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() dto: VerifyPasskeyOtpDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.verifyPasskeyOtp({
      userId,
      code: dto.code,
    });
  }

  @Post('passkey/confirm')
  async confirmPasskey(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() dto: ConfirmPasskeyDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.confirmPasskey({
      userId,
      currentPasskey: dto.currentPasskey,
      newPasskey: dto.newPasskey,
    });
  }

  @Post('two-factor/request-otp')
  async requestTwoFactorOtp(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() dto: RequestTwoFactorOtpDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.requestTwoFactorOtp({ userId });
  }

  @Post('two-factor/verify-otp')
  async verifyTwoFactorOtp(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() dto: VerifyTwoFactorOtpDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.verifyTwoFactorOtp({
      userId,
      code: dto.code,
      enable: dto.enable,
    });
  }

  @Post('device-trust/verify')
  async verifyDeviceTrust(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() dto: VerifyPasskeyDeviceDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    const userAgent = req.headers['user-agent'] ?? '';
    return this.usersService.verifyDeviceTrust({
      userId,
      deviceId: dto.deviceId,
      passkey: dto.passkey,
      userAgent: typeof userAgent === 'string' ? userAgent : '',
    });
  }

  @Post(':id/follow')
  async follow(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Param('id') targetUserId: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.follow(userId, targetUserId);
  }

  @Delete(':id/follow')
  async unfollow(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Param('id') targetUserId: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.unfollow(userId, targetUserId);
  }

  @Post(':id/block')
  async block(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Param('id') targetUserId: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.blocksService.block(userId, targetUserId);
  }

  @Delete(':id/block')
  async unblock(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Param('id') targetUserId: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.blocksService.unblock(userId, targetUserId);
  }

  @Get(':id/followers')
  async listFollowers(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Param('id') targetUserId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.listFollowers({
      viewerId: userId,
      userId: targetUserId,
      limit: limit ? Number(limit) : undefined,
      cursor: cursor || undefined,
    });
  }

  @Get(':id/following')
  async listFollowing(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Param('id') targetUserId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.usersService.listFollowing({
      viewerId: userId,
      userId: targetUserId,
      limit: limit ? Number(limit) : undefined,
      cursor: cursor || undefined,
    });
  }

  @Get(':id/is-following')
  async isFollowing(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Param('id') targetUserId: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    const isFollowing = await this.usersService.isFollowing(
      userId,
      targetUserId,
    );
    return { isFollowing };
  }
}

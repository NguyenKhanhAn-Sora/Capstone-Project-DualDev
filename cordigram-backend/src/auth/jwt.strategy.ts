import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '../config/config.service';
import { UsersService } from '../users/users.service';
import type { Request } from 'express';
import type { Role } from '../users/user.schema';

export type AuthenticatedUser = {
  userId: string;
  email: string;
  roles?: Role[];
  status?: 'active' | 'pending' | 'banned';
  signupStage?: 'otp_pending' | 'info_pending' | 'completed';
  accountLimitedUntil?: Date | null;
  accountLimitedIndefinitely?: boolean;
};

export type JwtPayload = {
  sub: string;
  email: string;
  type: 'access' | 'signup';
  roles?: Role[];
  status?: 'active' | 'pending' | 'banned';
  iat?: number;
  exp?: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwtSecret,
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    payload: JwtPayload,
  ): Promise<AuthenticatedUser> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }
    const deviceId = req.headers['x-device-id'] as string | undefined;
    if (deviceId) {
      const active = await this.usersService.isLoginDeviceActive({
        userId: payload.sub,
        deviceId,
      });
      if (!active) {
        throw new UnauthorizedException('Device session revoked');
      }
      this.usersService
        .touchDeviceLastSeen({ userId: payload.sub, deviceId })
        .catch(() => {});
    }

    const user = await this.usersService.releaseAccountLimitIfExpired(
      payload.sub,
    );
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const roles = payload.roles ?? user.roles ?? [];
    const isAdmin = roles.includes('admin');
    if (user.status === 'banned' && !isAdmin) {
      throw new ForbiddenException('Account is suspended.');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      roles,
      status: user.status,
      signupStage: user.signupStage,
      accountLimitedUntil: user.accountLimitedUntil ?? null,
      accountLimitedIndefinitely: Boolean(user.accountLimitedIndefinitely),
    };
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '../config/config.service';
import { UsersService } from '../users/users.service';
import type { Request } from 'express';

export type AuthenticatedUser = {
  userId: string;
  email: string;
};

export type JwtPayload = {
  sub: string;
  email: string;
  type: 'access' | 'signup';
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
    }
    return { userId: payload.sub, email: payload.email };
  }
}

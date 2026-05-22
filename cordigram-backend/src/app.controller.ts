import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Kiểm tra phiên bản API (dùng sau deploy — `features.dmServerStickers` cho sticker DM). */
  @Get('health')
  getHealth(): {
    ok: boolean;
    build: string;
    features: { dmServerStickers: boolean };
  } {
    return {
      ok: true,
      build: process.env.BUILD_ID || process.env.GIT_COMMIT || 'dev',
      features: { dmServerStickers: true },
    };
  }
}

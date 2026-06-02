import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LinkPreviewService } from './link-preview.service';

@Controller('link-preview')
export class LinkPreviewController {
  constructor(private readonly service: LinkPreviewService) {}

  /**
   * GET /link-preview?url=https://...
   * Returns Open Graph / Twitter Card metadata for the given URL.
   * Requires a valid JWT so only authenticated users can trigger server-side fetches.
   */
  @UseGuards(JwtAuthGuard)
  @Get()
  async preview(@Query('url') url: string) {
    if (!url) throw new BadRequestException('url is required');
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException('Only HTTP/S URLs are supported');
    }
    return this.service.fetch(url);
  }
}

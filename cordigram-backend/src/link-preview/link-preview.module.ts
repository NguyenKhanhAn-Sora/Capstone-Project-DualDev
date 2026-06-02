import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { LinkPreviewController } from './link-preview.controller';
import { LinkPreviewService } from './link-preview.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your_secret_key',
    }),
  ],
  controllers: [LinkPreviewController],
  providers: [LinkPreviewService],
  exports: [LinkPreviewService],
})
export class LinkPreviewModule {}

import { Module, Global } from '@nestjs/common';
import { DmCallSessionService } from './dm-call-session.service';

@Global()
@Module({
  providers: [DmCallSessionService],
  exports: [DmCallSessionService],
})
export class DmCallModule {}

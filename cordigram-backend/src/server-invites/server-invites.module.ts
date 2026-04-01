import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ServerInvite, ServerInviteSchema } from './server-invite.schema';
import { ServerInvitesService } from './server-invites.service';
import { ServerInvitesController } from './server-invites.controller';
import { ServersModule } from '../servers/servers.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ServerInvite.name, schema: ServerInviteSchema },
    ]),
    forwardRef(() => ServersModule),
  ],
  providers: [ServerInvitesService],
  controllers: [ServerInvitesController],
  exports: [ServerInvitesService],
})
export class ServerInvitesModule {}

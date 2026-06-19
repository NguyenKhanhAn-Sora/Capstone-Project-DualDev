import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ServerInvite, ServerInviteSchema } from './server-invite.schema';
import { ServerInvitesService } from './server-invites.service';
import { ServerInvitesController } from './server-invites.controller';
import { ServersModule } from '../servers/servers.module';
import { RolesModule } from '../roles/roles.module';
import { FollowsModule } from '../follows/follows.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ServerInvite.name, schema: ServerInviteSchema },
    ]),
    forwardRef(() => ServersModule),
    forwardRef(() => RolesModule),
    forwardRef(() => FollowsModule),
    forwardRef(() => ProfilesModule),
    forwardRef(() => MessagesModule),
  ],
  providers: [ServerInvitesService],
  controllers: [ServerInvitesController],
  exports: [ServerInvitesService],
})
export class ServerInvitesModule {}

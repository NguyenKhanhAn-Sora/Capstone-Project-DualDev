import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ServersModule } from '../servers/servers.module';
import { ServerInvitesModule } from '../server-invites/server-invites.module';
import { Profile, ProfileSchema } from '../profiles/profile.schema';
import { Rule, RuleSchema } from './rule.schema';
import { UserServer, UserServerSchema } from './user-server.schema';
import { ServerAccessService } from './server-access.service';

@Module({
  imports: [
    forwardRef(() => ServersModule),
    forwardRef(() => ServerInvitesModule),
    MongooseModule.forFeature([
      { name: Rule.name, schema: RuleSchema },
      { name: UserServer.name, schema: UserServerSchema },
      { name: Profile.name, schema: ProfileSchema },
    ]),
  ],
  providers: [ServerAccessService],
  exports: [ServerAccessService],
})
export class ServerAccessModule {}

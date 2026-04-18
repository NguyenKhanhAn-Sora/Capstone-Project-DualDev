import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ServersModule } from '../servers/servers.module';
import { ServerInvitesModule } from '../server-invites/server-invites.module';
import { RolesModule } from '../roles/roles.module';
import { OtpModule } from '../otp/otp.module';
import { MessagesModule } from '../messages/messages.module';
import { Profile, ProfileSchema } from '../profiles/profile.schema';
import { User, UserSchema } from '../users/user.schema';
import { Rule, RuleSchema } from './rule.schema';
import { UserServer, UserServerSchema } from './user-server.schema';
import { ServerAccessService } from './server-access.service';

@Module({
  imports: [
    forwardRef(() => ServersModule),
    forwardRef(() => ServerInvitesModule),
    forwardRef(() => RolesModule),
    forwardRef(() => MessagesModule),
    OtpModule,
    MongooseModule.forFeature([
      { name: Rule.name, schema: RuleSchema },
      { name: UserServer.name, schema: UserServerSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [ServerAccessService],
  exports: [ServerAccessService],
})
export class ServerAccessModule {}

import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  UseGuards,
  Request,
  NotFoundException,
} from '@nestjs/common';
import { FollowsService } from './follows.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProfilesService } from '../profiles/profiles.service';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { Types } from 'mongoose';

@Controller('follows')
@UseGuards(JwtAuthGuard)
export class FollowsController {
  constructor(
    private readonly followsService: FollowsService,
    private readonly profilesService: ProfilesService,
  ) {}

  @Get('following')
  async getFollowing(
    @Request() req: Request & { user?: AuthenticatedUser },
  ) {
    if (!req.user) {
      throw new Error('Unauthorized');
    }

    const userId = new Types.ObjectId(req.user.userId);
    console.log('Getting following for userId:', userId.toString());
    
    const followingIds = await this.followsService.getFollowing(userId);
    console.log('followingIds:', followingIds);

    const profiles = await Promise.all(
      followingIds.map((id) =>
        this.profilesService.findByUserId(id).then((profile) => {
          console.log('Profile for', id.toString(), ':', profile);
          return {
            id: profile?._id?.toString?.() ?? (profile as any)?.id,
            displayName: profile?.displayName,
            username: profile?.username,
            avatarUrl: profile?.avatarUrl,
            userId: id.toString(),
          };
        }),
      ),
    );

    console.log('Final profiles:', profiles);
    return profiles.filter((p) => p.displayName); // Filter out null profiles
  }

  @Get('followers')
  async getFollowers(
    @Request() req: Request & { user?: AuthenticatedUser },
  ) {
    if (!req.user) {
      throw new Error('Unauthorized');
    }

    const userId = new Types.ObjectId(req.user.userId);
    const followerIds = await this.followsService.getFollowers(userId);

    const profiles = await Promise.all(
      followerIds.map((id) =>
        this.profilesService.findByUserId(id).then((profile) => ({
          id: profile?._id?.toString?.() ?? (profile as any)?.id,
          displayName: profile?.displayName,
          username: profile?.username,
          avatarUrl: profile?.avatarUrl,
          userId: id.toString(),
        })),
      ),
    );

    return profiles.filter((p) => p.displayName);
  }

  @Get('check/:userId')
  async checkFollowing(
    @Param('userId') targetUserId: string,
    @Request() req: Request & { user?: AuthenticatedUser },
  ) {
    if (!req.user) {
      throw new Error('Unauthorized');
    }

    const followerId = new Types.ObjectId(req.user.userId);
    const followeeId = new Types.ObjectId(targetUserId);

    const isFollowing = await this.followsService.isFollowing(followerId, followeeId);

    return { isFollowing };
  }

  @Post(':userId')
  async follow(
    @Param('userId') targetUserId: string,
    @Request() req: Request & { user?: AuthenticatedUser },
  ) {
    if (!req.user) {
      throw new Error('Unauthorized');
    }

    const followerId = new Types.ObjectId(req.user.userId);
    const followeeId = new Types.ObjectId(targetUserId);

    if (followerId.toString() === followeeId.toString()) {
      throw new Error('Cannot follow yourself');
    }

    await this.followsService.follow(followerId, followeeId);

    return { message: 'Followed successfully' };
  }

  @Delete(':userId')
  async unfollow(
    @Param('userId') targetUserId: string,
    @Request() req: Request & { user?: AuthenticatedUser },
  ) {
    if (!req.user) {
      throw new Error('Unauthorized');
    }

    const followerId = new Types.ObjectId(req.user.userId);
    const followeeId = new Types.ObjectId(targetUserId);

    await this.followsService.unfollow(followerId, followeeId);

    return { message: 'Unfollowed successfully' };
  }
}

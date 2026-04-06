import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ServersService } from '../servers/servers.service';
import { ServerInvitesService } from '../server-invites/server-invites.service';
import { OtpService } from '../otp/otp.service';
import { MailService } from '../mail/mail.service';
import { Profile } from '../profiles/profile.schema';
import { Server, ServerAccessMode } from '../servers/server.schema';
import { Rule } from './rule.schema';
import { UserServer, UserServerStatus } from './user-server.schema';
import { User } from '../users/user.schema';
import { RolesService } from '../roles/roles.service';
import {
  calcAgeFromBirthdate,
  computeVerificationChecks,
  evaluateChannelChatGate,
  getVerificationWaitSeconds,
  normalizeServerVerificationLevel,
  type ChatGateBlockReason,
  type ServerVerificationLevel,
} from '../messages/channel-chat-gate.util';

function defaultStatusForAccessMode(
  accessMode: ServerAccessMode,
  serverHasRules: boolean,
): { status: UserServerStatus; acceptedRules: boolean } {
  // Age restriction sẽ được xử lý trước.
  const acceptedRules = !serverHasRules;
  if (accessMode === 'apply')
    return { status: 'pending', acceptedRules: false };
  // discoverable hoặc invite_only: vào thẳng accepted nhưng acceptedRules tùy hasRules
  return { status: 'accepted', acceptedRules };
}

@Injectable()
export class ServerAccessService {
  constructor(
    @Inject(forwardRef(() => ServersService))
    private readonly serversService: ServersService,
    private readonly serverInvitesService: ServerInvitesService,
    @Inject(forwardRef(() => RolesService))
    private readonly rolesService: RolesService,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    @InjectModel(Rule.name) private ruleModel: Model<Rule>,
    @InjectModel(UserServer.name) private userServerModel: Model<UserServer>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  private getEffectiveAccessMode(server: Server): ServerAccessMode {
    const fromField = (server as any).accessMode as
      | ServerAccessMode
      | undefined;
    if (fromField) return fromField;
    return server.isPublic ? 'discoverable' : 'invite_only';
  }

  async getAccessSettings(serverId: string): Promise<{
    accessMode: ServerAccessMode;
    isAgeRestricted: boolean;
    hasRules: boolean;
    rules: Array<{ id: string; content: string }>;
  }> {
    const server = await this.serversService.getServerById(serverId);
    const accessMode = this.getEffectiveAccessMode(server);
    const rules = await this.ruleModel
      .find({ serverId: new Types.ObjectId(serverId) })
      .select('_id content')
      .lean()
      .exec();

    return {
      accessMode,
      isAgeRestricted: Boolean((server as any).isAgeRestricted),
      hasRules: Boolean((server as any).hasRules),
      rules: (rules as any[]).map((r) => ({
        id: String(r._id),
        content: r.content,
      })),
    };
  }

  async updateAccessSettings(
    serverId: string,
    requesterUserId: string,
    patch: {
      accessMode?: ServerAccessMode;
      isAgeRestricted?: boolean;
      hasRules?: boolean;
    },
  ): Promise<{
    accessMode: ServerAccessMode;
    isAgeRestricted: boolean;
    hasRules: boolean;
  }> {
    const server = await this.serversService.getServerById(serverId);
    const isOwner = String(server.ownerId) === String(requesterUserId);
    if (!isOwner)
      throw new ForbiddenException('Chỉ chủ máy chủ mới có thể chỉnh sửa');

    const prevHasRules = Boolean((server as any).hasRules);

    if (patch.accessMode) (server as any).accessMode = patch.accessMode;
    if (patch.isAgeRestricted !== undefined)
      (server as any).isAgeRestricted = patch.isAgeRestricted;
    if (patch.hasRules !== undefined)
      (server as any).hasRules = Boolean(patch.hasRules);

    // Compatibility: sync isPublic with accessMode
    const effectiveMode = this.getEffectiveAccessMode(server);
    (server as any).isPublic = effectiveMode === 'discoverable';

    const nextHasRules = Boolean((server as any).hasRules);
    if (prevHasRules !== nextHasRules) {
      if (nextHasRules) {
        await this.userServerModel.updateMany(
          { serverId: new Types.ObjectId(serverId), status: 'accepted' },
          { $set: { acceptedRules: false } },
        );
      } else {
        await this.userServerModel.updateMany(
          { serverId: new Types.ObjectId(serverId) },
          { $set: { acceptedRules: true } },
        );
      }
    }

    await server.save();

    return {
      accessMode: this.getEffectiveAccessMode(server),
      isAgeRestricted: Boolean((server as any).isAgeRestricted),
      hasRules: Boolean((server as any).hasRules),
    };
  }

  async addRule(
    serverId: string,
    requesterUserId: string,
    content: string,
  ): Promise<{ id: string; content: string }> {
    const server = await this.serversService.getServerById(serverId);
    const isOwner = String(server.ownerId) === String(requesterUserId);
    if (!isOwner)
      throw new ForbiddenException('Chỉ chủ máy chủ mới có thể thêm quy định');

    const trimmed = (content ?? '').trim();
    if (!trimmed)
      throw new BadRequestException('Nội dung quy định không được rỗng');

    const rule = await new this.ruleModel({
      serverId: new Types.ObjectId(serverId),
      content: trimmed,
    }).save();

    return { id: String(rule._id), content: rule.content };
  }

  async getMyStatus(
    serverId: string,
    userId: string,
  ): Promise<{
    status: UserServerStatus | null;
    acceptedRules: boolean;
    hasRules: boolean;
    accessMode: ServerAccessMode;
    isAgeRestricted: boolean;
    ageRestrictedAcknowledged: boolean;
    ageYears: number | null;
    verificationLevel: ServerVerificationLevel;
    verificationChecks: {
      emailVerified: boolean;
      accountOver5Min: boolean;
      memberOver10Min: boolean;
    };
    verificationWait: {
      waitAccountSec: number | null;
      waitMemberSec: number | null;
    };
    chatViewBlocked: boolean;
    chatBlockReason: ChatGateBlockReason | null;
    /** Cảnh báo trên kênh khi server bật NSFW/age — chỉ khi user đã được phép vào chat. */
    showAgeRestrictedChannelNotice: boolean;
  }> {
    const server = await this.serversService.getServerById(serverId);
    const ownerCheck =
      (server as any).ownerId?.toString?.() === userId ||
      String((server as any).ownerId) === String(userId);
    const isMember = ownerCheck || this.serversService.isMember(server, userId);
    if (!isMember) throw new ForbiddenException('Bạn chưa tham gia máy chủ');

    const accessMode = this.getEffectiveAccessMode(server);
    const hasRules = Boolean((server as any).hasRules);
    const isAgeRestricted = Boolean((server as any).isAgeRestricted);
    const verificationLevel = normalizeServerVerificationLevel(
      (server as any).safetySettings?.spamProtection?.verificationLevel,
    );

    const doc = await this.userServerModel
      .findOne({
        userId: new Types.ObjectId(userId),
        serverId: new Types.ObjectId(serverId),
      })
      .lean()
      .exec();

    const ageRestrictedAcknowledged = Boolean(
      (doc as any)?.ageRestrictedAcknowledged,
    );

    const [userRow, profileRow] = await Promise.all([
      this.userModel
        .findById(userId)
        .select('createdAt isVerified')
        .lean()
        .exec(),
      this.profileModel
        .findOne({ userId: new Types.ObjectId(userId) })
        .select('birthdate')
        .lean()
        .exec(),
    ]);

    const memberRow = ((server as any).members || []).find(
      (m: any) => (m?.userId?._id ?? m?.userId)?.toString() === userId,
    );
    const memberJoinedAt = memberRow?.joinedAt
      ? new Date(memberRow.joinedAt)
      : null;

    const isOwner =
      (server as any).ownerId?.toString?.() === userId ||
      String((server as any).ownerId) === String(userId);
    const canManageServer = await this.rolesService.hasPermission(
      serverId,
      userId,
      'manageServer',
    );
    const isBypass = isOwner || canManageServer;

    const birthdate = (profileRow as any)?.birthdate ?? null;
    const accountCreatedAt = new Date((userRow as any)?.createdAt || Date.now());
    const isServerEmailVerified = Boolean((doc as any)?.serverEmailVerified);
    const verificationChecks = computeVerificationChecks({
      isVerified: isServerEmailVerified,
      accountCreatedAt,
      memberJoinedAt,
    });
    const verificationWait = getVerificationWaitSeconds({
      level: verificationLevel,
      isBypass,
      accountCreatedAt,
      memberJoinedAt,
    });
    const gate = evaluateChannelChatGate({
      isAgeRestricted,
      ageRestrictedAcknowledged,
      birthdate,
      verificationLevel,
      isVerified: isServerEmailVerified,
      accountCreatedAt,
      memberJoinedAt,
      isBypass,
    });

    const ageYears = calcAgeFromBirthdate(birthdate);

    const base = !doc
      ? {
          status: (accessMode === 'apply'
            ? 'pending'
            : 'accepted') as UserServerStatus,
          acceptedRules: !hasRules,
        }
      : {
          status: doc.status ?? null,
          acceptedRules: Boolean(doc.acceptedRules),
        };

    if (isBypass) {
      base.acceptedRules = true;
      base.status = 'accepted';
    }

    return {
      ...base,
      hasRules,
      accessMode,
      isAgeRestricted,
      ageRestrictedAcknowledged: isBypass ? true : ageRestrictedAcknowledged,
      ageYears,
      verificationLevel,
      verificationChecks,
      verificationWait,
      chatViewBlocked: !gate.allowed,
      chatBlockReason: gate.allowed ? null : (gate.reason ?? null),
      showAgeRestrictedChannelNotice:
        isAgeRestricted && gate.allowed && !isBypass && (ageYears ?? 0) >= 18,
    };
  }

  /**
   * User đủ 18 tuổi xác nhận đã đọc cảnh báo máy chủ giới hạn độ tuổi.
   */
  async acknowledgeAgeRestriction(
    serverId: string,
    userId: string,
  ): Promise<{ ok: boolean }> {
    const server = await this.serversService.getServerById(serverId);
    if (!this.serversService.isMember(server as any, userId)) {
      throw new ForbiddenException('Bạn chưa tham gia máy chủ');
    }
    if (!server.isAgeRestricted) {
      return { ok: true };
    }
    const profile = await this.profileModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .select('birthdate')
      .lean()
      .exec();
    const age = calcAgeFromBirthdate((profile as any)?.birthdate ?? null);
    if (age == null || age < 18) {
      throw new ForbiddenException('Tài khoản chưa đủ 18 tuổi');
    }
    await this.userServerModel
      .findOneAndUpdate(
        {
          userId: new Types.ObjectId(userId),
          serverId: new Types.ObjectId(serverId),
        },
        { $set: { ageRestrictedAcknowledged: true } },
        { upsert: true, new: true },
      )
      .exec();
    return { ok: true };
  }

  /**
   * User join server theo accessMode.
   * - invite_only: yêu cầu pending invite.
   * - apply: tạo pending.
   * - discoverable: tạo accepted.
   * - age restriction: nếu < 18 => rejected (để chặn chat).
   */
  async joinServer(userId: string, serverId: string): Promise<UserServer> {
    const server = await this.serversService.getServerById(serverId);
    if (!server) throw new NotFoundException('Server not found');

    // Tính tuổi nếu bật
    let statusOverride: UserServerStatus | null = null;
    let acceptedRulesOverride: boolean | null = null;
    if (server.isAgeRestricted) {
      const profile = await this.profileModel
        .findOne({ userId: new Types.ObjectId(userId) })
        .select('birthdate')
        .lean()
        .exec();
      const age = calcAgeFromBirthdate((profile as any)?.birthdate ?? null);
      if (age == null || age < 18) {
        statusOverride = 'rejected';
        acceptedRulesOverride = false;
      }
    }

    const serverHasRules = Boolean((server as any).hasRules);

    // Age restriction chặn ngay
    if (statusOverride === 'rejected') {
      await this.ensureMemberInServer(serverId, userId, 'member');
      const updated = await this.userServerModel
        .findOneAndUpdate(
          {
            userId: new Types.ObjectId(userId),
            serverId: new Types.ObjectId(serverId),
          },
          { $set: { status: 'rejected', acceptedRules: false } },
          { upsert: true, new: true },
        )
        .lean()
        .exec();
      return updated as any;
    }

    const accessMode: ServerAccessMode = this.getEffectiveAccessMode(server);

    // resolve status theo accessMode
    if (accessMode === 'invite_only') {
      // verify có pending invite
      const pendings =
        await this.serverInvitesService.getPendingForUser(userId);
      const hasPending = (pendings as any[]).some((inv) => {
        const sid =
          inv?.serverId?._id?.toString?.() ??
          inv?.serverId?.toString?.() ??
          inv?.serverId;
        return String(sid) === String(serverId);
      });
      if (!hasPending)
        throw new ForbiddenException('Bạn cần có invite link để tham gia');

      await this.serverInvitesService.acceptByServer(serverId, userId);
    } else if (accessMode === 'apply') {
      await this.ensureMemberInServer(serverId, userId, 'member');
    } else if (accessMode === 'discoverable') {
      await this.ensureMemberInServer(serverId, userId, 'member');
    } else {
      // fail-safe
      throw new BadRequestException(`Unknown accessMode: ${accessMode}`);
    }

    const { status, acceptedRules } = statusOverride
      ? {
          status: statusOverride,
          acceptedRules: acceptedRulesOverride as boolean,
        }
      : defaultStatusForAccessMode(accessMode, serverHasRules);

    const updated = await this.userServerModel
      .findOneAndUpdate(
        {
          userId: new Types.ObjectId(userId),
          serverId: new Types.ObjectId(serverId),
        },
        {
          $set: {
            status,
            acceptedRules,
          },
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();

    return updated as any;
  }

  /**
   * Owner approve user pending (kết quả status=accepted).
   */
  async approveUser(
    serverId: string,
    requesterUserId: string,
    targetUserId: string,
  ): Promise<UserServer> {
    const server = await this.serversService.getServerById(serverId);
    const isOwner = String(server.ownerId) === String(requesterUserId);
    if (!isOwner)
      throw new ForbiddenException('Chỉ chủ máy chủ mới duyệt được');

    const target = await this.userServerModel
      .findOne({
        userId: new Types.ObjectId(targetUserId),
        serverId: new Types.ObjectId(serverId),
      })
      .lean()
      .exec();

    if (!target || target.status !== 'pending') {
      throw new BadRequestException('User không ở trạng thái pending');
    }

    const serverHasRules = Boolean((server as any).hasRules);
    const updated = await this.userServerModel
      .findOneAndUpdate(
        {
          userId: new Types.ObjectId(targetUserId),
          serverId: new Types.ObjectId(serverId),
        },
        {
          $set: {
            status: 'accepted',
            acceptedRules: !serverHasRules,
          },
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();

    return updated as any;
  }

  /**
   * User accept rules của server.
   */
  async acceptRules(serverId: string, userId: string): Promise<UserServer> {
    const server = await this.serversService.getServerById(serverId);
    const user = await this.userServerModel
      .findOne({
        userId: new Types.ObjectId(userId),
        serverId: new Types.ObjectId(serverId),
      })
      .lean()
      .exec();

    // Nhiều flow join (invite/link) chỉ thêm vào server.members mà không có record userServer.
    // Với trường hợp đó, nếu user đã là member thì cho phép "accept rules" và tạo/ cập nhật record userServer.
    if (!user) {
      const isMember = this.serversService.isMember(server as any, userId);
      if (!isMember) {
        throw new ForbiddenException(
          'Bạn chưa được chấp nhận để truy cập chat',
        );
      }
      const created = await this.userServerModel
        .findOneAndUpdate(
          {
            userId: new Types.ObjectId(userId),
            serverId: new Types.ObjectId(serverId),
          },
          { $set: { status: 'accepted', acceptedRules: true } },
          { upsert: true, new: true },
        )
        .lean()
        .exec();
      return created as any;
    }

    // Đã có bản ghi userServer: cho phép accept rules miễn là user vẫn còn trong server,
    // không khóa theo status nữa để tránh kẹt quyền chat do dữ liệu lệch.
    const stillMember = this.serversService.isMember(server as any, userId);
    if (!stillMember) {
      throw new ForbiddenException('Bạn chưa được chấp nhận để truy cập chat');
    }
    if (!server.hasRules) {
      // server không bật rules thì coi như đã accept
      const updated = await this.userServerModel
        .findOneAndUpdate(
          {
            userId: new Types.ObjectId(userId),
            serverId: new Types.ObjectId(serverId),
          },
          { $set: { acceptedRules: true } },
          { upsert: true, new: true },
        )
        .lean()
        .exec();
      return updated as any;
    }

    // (Tùy chọn) kiểm tra rules tồn tại: nếu không có rule thì vẫn cho accept
    // const ruleCount = await this.ruleModel.countDocuments({ serverId: new Types.ObjectId(serverId) });

    const updated = await this.userServerModel
      .findOneAndUpdate(
        {
          userId: new Types.ObjectId(userId),
          serverId: new Types.ObjectId(serverId),
        },
        { $set: { acceptedRules: true } },
        { upsert: true, new: true },
      )
      .lean()
      .exec();

    return updated as any;
  }

  async requestServerEmailOtp(
    serverId: string,
    userId: string,
  ): Promise<{ ok: boolean; retryAfterSec?: number }> {
    const server = await this.serversService.getServerById(serverId);
    if (!this.serversService.isMember(server as any, userId)) {
      throw new ForbiddenException('Bạn chưa tham gia máy chủ');
    }
    const userRow = await this.userModel
      .findById(userId)
      .select('email')
      .lean()
      .exec();
    const email = (userRow as any)?.email;
    if (!email) throw new BadRequestException('Tài khoản không có email');

    try {
      const { code, expiresMs } = await this.otpService.requestOtp(email);
      const expiresMinutes = Math.ceil(expiresMs / 60000);
      await this.mailService.sendOtpEmail(email, code, expiresMinutes);
      return { ok: true };
    } catch (err: any) {
      if (err?.response?.retryAfterSec) {
        return { ok: false, retryAfterSec: err.response.retryAfterSec };
      }
      throw err;
    }
  }

  async verifyServerEmailOtp(
    serverId: string,
    userId: string,
    code: string,
  ): Promise<{ ok: boolean }> {
    const server = await this.serversService.getServerById(serverId);
    if (!this.serversService.isMember(server as any, userId)) {
      throw new ForbiddenException('Bạn chưa tham gia máy chủ');
    }
    const userRow = await this.userModel
      .findById(userId)
      .select('email')
      .lean()
      .exec();
    const email = (userRow as any)?.email;
    if (!email) throw new BadRequestException('Tài khoản không có email');

    await this.otpService.verifyOtp(email, code);

    await this.userServerModel
      .findOneAndUpdate(
        {
          userId: new Types.ObjectId(userId),
          serverId: new Types.ObjectId(serverId),
        },
        { $set: { serverEmailVerified: true } },
        { upsert: true, new: true },
      )
      .exec();

    return { ok: true };
  }

  private async ensureMemberInServer(
    serverId: string,
    userId: string,
    role: 'member' | 'moderator' | 'owner' = 'member',
  ) {
    const server = await this.serversService.getServerById(serverId);
    if (this.serversService.isMember(server as any, userId)) return;
    await this.serversService.addMemberToServer(
      serverId,
      userId,
      role === 'owner' ? 'member' : 'member',
    );
  }
}

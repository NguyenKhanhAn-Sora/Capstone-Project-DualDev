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
import { ChannelMessagesGateway } from '../messages/channel-messages.gateway';

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

/** Chuẩn hóa userId từ ObjectId, ref populate, hoặc chuỗi. */
function stringMongoUserId(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'object' && (value as { _id?: unknown })._id != null) {
    return String((value as { _id: unknown })._id);
  }
  return String(value);
}

/** So sánh hai userId (24-byte hex hoặc đã chuẩn hóa). */
function sameMongoUserId(a: unknown, b: unknown): boolean {
  const sa = stringMongoUserId(a);
  const sb = stringMongoUserId(b);
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  if (!Types.ObjectId.isValid(sa) || !Types.ObjectId.isValid(sb)) return false;
  try {
    return new Types.ObjectId(sa).equals(new Types.ObjectId(sb));
  } catch {
    return false;
  }
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
    private readonly channelMessagesGateway: ChannelMessagesGateway,
  ) {}

  private notifyJoinApplicationUpdated(
    server: unknown,
    serverId: string,
    applicantUserId: string,
    status: 'accepted' | 'rejected' | 'withdrawn',
  ): void {
    try {
      const ids = new Set<string>();
      const owner = stringMongoUserId((server as any)?.ownerId);
      if (owner) ids.add(owner);
      for (const m of (server as any)?.members || []) {
        const uid = stringMongoUserId(m?.userId);
        if (uid) ids.add(uid);
      }
      ids.add(String(applicantUserId));
      this.channelMessagesGateway.emitJoinApplicationUpdated([...ids], {
        serverId,
        userId: String(applicantUserId),
        status,
      });
    } catch {
      // ignore socket failures
    }
  }

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
    joinApplicationForm: {
      enabled: boolean;
      questions: Array<{
        id: string;
        title: string;
        type: 'short' | 'paragraph' | 'multiple_choice';
        required: boolean;
        options?: string[];
      }>;
    };
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
      joinApplicationForm: {
        enabled: Boolean((server as any)?.joinApplicationForm?.enabled),
        questions: Array.isArray(
          (server as any)?.joinApplicationForm?.questions,
        )
          ? (server as any).joinApplicationForm.questions
          : [],
      },
    };
  }

  async updateJoinApplicationForm(
    serverId: string,
    requesterUserId: string,
    payload: {
      enabled?: boolean;
      questions?: Array<{
        id: string;
        title: string;
        type: 'short' | 'paragraph' | 'multiple_choice';
        required?: boolean;
        options?: string[];
      }>;
    },
  ): Promise<{
    enabled: boolean;
    questions: Array<{
      id: string;
      title: string;
      type: 'short' | 'paragraph' | 'multiple_choice';
      required: boolean;
      options?: string[];
    }>;
  }> {
    const server = await this.serversService.getServerById(serverId);
    const isOwner = String(server.ownerId) === String(requesterUserId);
    const canManageServer = await this.rolesService.hasPermission(
      serverId,
      requesterUserId,
      'manageServer',
    );
    if (!isOwner && !canManageServer) {
      throw new ForbiddenException(
        'Chỉ chủ máy chủ hoặc thành viên có quyền Quản Lý Máy Chủ mới có thể chỉnh sửa',
      );
    }

    const enabled =
      payload.enabled ?? Boolean((server as any)?.joinApplicationForm?.enabled);
    const rawQuestions = Array.isArray(payload.questions)
      ? payload.questions
      : ((server as any)?.joinApplicationForm?.questions ?? []);

    const normalized = (rawQuestions as any[])
      .map((q) => ({
        id: String(q.id || ''),
        title: String(q.title || '').trim(),
        type:
          q.type === 'paragraph'
            ? 'paragraph'
            : q.type === 'multiple_choice'
              ? 'multiple_choice'
              : 'short',
        required: q.required !== false,
        options: Array.isArray(q.options)
          ? q.options
              .map((x: any) => String(x || '').trim())
              .filter(Boolean)
              .slice(0, 25)
          : [],
      }))
      .filter((q) => q.id && q.title);

    if (normalized.length > 5) {
      throw new BadRequestException(
        'Tối đa 5 câu hỏi trong đơn đăng ký tham gia',
      );
    }
    for (const q of normalized) {
      if (q.type === 'multiple_choice' && (q.options?.length ?? 0) < 1) {
        throw new BadRequestException(
          'Câu hỏi nhiều lựa chọn phải có ít nhất 1 tùy chọn',
        );
      }
    }

    (server as any).joinApplicationForm = {
      enabled: Boolean(enabled),
      questions: normalized,
      updatedAt: new Date(),
    };
    await server.save();

    return {
      enabled: Boolean((server as any).joinApplicationForm.enabled),
      questions: (server as any).joinApplicationForm.questions ?? [],
    };
  }

  async getJoinApplicationForm(
    serverId: string,
    requesterUserId: string,
  ): Promise<{
    enabled: boolean;
    questions: Array<{
      id: string;
      title: string;
      type: 'short' | 'paragraph' | 'multiple_choice';
      required: boolean;
      options?: string[];
    }>;
  }> {
    const server = await this.serversService.getServerById(serverId);
    const isOwner = String(server.ownerId) === String(requesterUserId);
    const canManageServer = await this.rolesService.hasPermission(
      serverId,
      requesterUserId,
      'manageServer',
    );
    if (!isOwner && !canManageServer) {
      throw new ForbiddenException(
        'Chỉ chủ máy chủ hoặc thành viên có quyền Quản Lý Máy Chủ mới xem được',
      );
    }
    return {
      enabled: Boolean((server as any)?.joinApplicationForm?.enabled),
      questions: Array.isArray((server as any)?.joinApplicationForm?.questions)
        ? (server as any).joinApplicationForm.questions
        : [],
    };
  }

  private async assertCanReviewJoinApplications(
    serverId: string,
    requesterUserId: string,
  ): Promise<void> {
    const server = await this.serversService.getServerById(serverId);
    const isOwner = String(server.ownerId) === String(requesterUserId);
    // IMPORTANT: use the same permission calculation as the UI permissions endpoint.
    // `hasPermission()` and `calculateMemberPermissions()` must remain consistent, but
    // historically they could diverge; join-applications should follow calculated perms.
    const perms = await this.rolesService.calculateMemberPermissions(
      serverId,
      requesterUserId,
    );
    const canManageServer = Boolean((perms as any)?.manageServer);
    if (!isOwner && !canManageServer) {
      throw new ForbiddenException(
        'Chỉ chủ máy chủ hoặc thành viên có quyền Quản Lý Máy Chủ mới xem được đơn đăng ký',
      );
    }
  }

  private validateJoinApplicationForJoin(
    server: Server,
    opts?: {
      rulesAccepted?: boolean;
      applicationAnswers?: Array<{
        questionId: string;
        text?: string;
        selectedOption?: string;
      }>;
    },
  ): void {
    const form = (server as any).joinApplicationForm;
    if (
      !form?.enabled ||
      !Array.isArray(form.questions) ||
      form.questions.length === 0
    ) {
      return;
    }
    // Client cũ gửi POST /join không body: không chặn; client mới gửi `applicationAnswers` thì validate đủ.
    if (opts?.applicationAnswers === undefined) {
      return;
    }
    const answers = opts.applicationAnswers ?? [];
    for (const q of form.questions as any[]) {
      const qid = String(q.id ?? '');
      const a = answers.find((x) => x && String(x.questionId) === qid);
      const required = q.required !== false;
      if (!required) continue;
      if (q.type === 'multiple_choice') {
        const v = String(a?.selectedOption ?? '').trim();
        if (!v) {
          throw new BadRequestException(
            `Vui lòng trả lời: ${String(q.title || '').trim() || qid}`,
          );
        }
      } else {
        const v = String(a?.text ?? '').trim();
        if (!v) {
          throw new BadRequestException(
            `Vui lòng trả lời: ${String(q.title || '').trim() || qid}`,
          );
        }
      }
    }
  }

  private normalizeJoinAnswersForStorage(
    server: Server,
    opts?: {
      applicationAnswers?: Array<{
        questionId: string;
        text?: string;
        selectedOption?: string;
      }>;
    },
  ): Array<{ questionId: string; text?: string; selectedOption?: string }> {
    const form = (server as any).joinApplicationForm;
    if (
      !form?.enabled ||
      !Array.isArray(form.questions) ||
      form.questions.length === 0
    ) {
      return [];
    }
    const raw = opts?.applicationAnswers ?? [];
    return (form.questions as any[]).map((q) => {
      const qid = String(q.id ?? '');
      const a = raw.find((x) => x && String(x.questionId) === qid);
      if (q.type === 'multiple_choice') {
        return {
          questionId: qid,
          selectedOption: String(a?.selectedOption ?? '').trim() || undefined,
        };
      }
      return {
        questionId: qid,
        text: String(a?.text ?? '').trim() || undefined,
      };
    });
  }

  async listJoinApplications(
    serverId: string,
    requesterUserId: string,
    statusRaw: string,
  ): Promise<{
    pendingCount: number;
    items: Array<{
      userId: string;
      displayName: string;
      username: string;
      avatarUrl?: string;
      status: UserServerStatus;
      registeredAt: string;
      acceptedRules: boolean;
    }>;
  }> {
    await this.assertCanReviewJoinApplications(serverId, requesterUserId);
    const server = await this.serversService.getServerById(serverId);
    await this.serversService.ensureOwnerMemberRow(server as any);
    const status =
      statusRaw === 'all' ||
      statusRaw === 'pending' ||
      statusRaw === 'rejected' ||
      statusRaw === 'approved'
        ? statusRaw
        : 'pending';

    const ownerIdStr = stringMongoUserId((server as any).ownerId);

    const members = ((server as any).members || []) as Array<{
      userId: Types.ObjectId | { _id?: Types.ObjectId };
      joinedAt?: Date;
    }>;
    const memberIds = members
      .map((m) => String(m.userId?._id ?? m.userId))
      .filter(Boolean);
    const oidList = memberIds.map((id) => new Types.ObjectId(id));

    const memberIdsNoOwner = memberIds.filter(
      (id) => id && !sameMongoUserId(id, ownerIdStr),
    );
    const oidListNoOwner = memberIdsNoOwner.map((id) => new Types.ObjectId(id));

    // Chỉ đếm pending trong số user vẫn còn trong server.members (tránh ghost sau khi rời mà chưa xóa UserServer).
    // Chủ server không có "đơn đăng ký" — không đếm vào pending.
    const pendingCount =
      oidListNoOwner.length === 0
        ? 0
        : await this.userServerModel.countDocuments({
            serverId: new Types.ObjectId(serverId),
            status: 'pending',
            userId: { $in: oidListNoOwner },
          });

    const [profiles, users, userServers] = await Promise.all([
      oidListNoOwner.length
        ? this.profileModel
            .find({ userId: { $in: oidListNoOwner } })
            .select('userId displayName username avatarUrl')
            .lean()
            .exec()
        : [],
      oidListNoOwner.length
        ? this.userModel
            .find({ _id: { $in: oidListNoOwner } })
            .select('_id username createdAt')
            .lean()
            .exec()
        : [],
      this.userServerModel
        .find({ serverId: new Types.ObjectId(serverId) })
        .lean()
        .exec(),
    ]);

    const profileByUser = new Map(
      (profiles as any[]).map((p) => [String(p.userId), p]),
    );
    const userById = new Map((users as any[]).map((u) => [String(u._id), u]));
    const usByUser = new Map(
      (userServers as any[]).map((u) => [stringMongoUserId(u.userId), u]),
    );

    type Row = {
      userId: string;
      displayName: string;
      username: string;
      avatarUrl?: string;
      status: UserServerStatus;
      registeredAt: string;
      acceptedRules: boolean;
    };

    const hasJoinApplicationRecord = (us: any): boolean => {
      if (!us) return false;
      if (us.applicationSubmittedAt) return true;
      const ans = us.joinApplicationAnswers;
      return Array.isArray(ans) && ans.length > 0;
    };

    const rows: Row[] = [];
    for (const m of members) {
      const uid = stringMongoUserId(m.userId?._id ?? m.userId);
      if (!uid) continue;
      if (ownerIdStr && sameMongoUserId(uid, ownerIdStr)) continue;
      const prof = profileByUser.get(uid);
      const urow = userById.get(uid);
      const us = usByUser.get(uid);
      const st: UserServerStatus =
        (us?.status as UserServerStatus) ?? 'accepted';
      const acceptedRules = Boolean(us?.acceptedRules);
      const registeredAt = us?.applicationSubmittedAt
        ? new Date(us.applicationSubmittedAt)
        : us?.createdAt
          ? new Date(us.createdAt)
          : m.joinedAt
            ? new Date(m.joinedAt)
            : new Date();
      rows.push({
        userId: uid,
        displayName: String(prof?.displayName || urow?.username || 'User'),
        username: String(prof?.username || urow?.username || ''),
        avatarUrl: prof?.avatarUrl ? String(prof.avatarUrl) : undefined,
        status: st,
        registeredAt: registeredAt.toISOString(),
        acceptedRules,
      });
    }

    let filtered = rows;
    if (status === 'all')
      filtered = rows.filter((r) => r.status === 'accepted');
    else if (status === 'pending')
      filtered = rows.filter((r) => r.status === 'pending');
    else if (status === 'rejected')
      filtered = rows.filter((r) => r.status === 'rejected');
    else if (status === 'approved')
      filtered = rows.filter((r) => {
        if (r.status !== 'accepted') return false;
        const us = usByUser.get(r.userId);
        return hasJoinApplicationRecord(us);
      });

    filtered.sort(
      (a, b) =>
        new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime(),
    );

    const withoutOwner = ownerIdStr
      ? filtered.filter((r) => !sameMongoUserId(r.userId, ownerIdStr))
      : filtered;

    return { pendingCount, items: withoutOwner };
  }

  async getJoinApplicationDetail(
    serverId: string,
    requesterUserId: string,
    applicantUserId: string,
  ): Promise<{
    userId: string;
    displayName: string;
    username: string;
    avatarUrl?: string;
    status: UserServerStatus;
    acceptedRules: boolean;
    accountCreatedAt: string | null;
    applicationSubmittedAt: string | null;
    questionsWithAnswers: Array<{
      questionId: string;
      title: string;
      type: string;
      answerText?: string;
      selectedOption?: string;
    }>;
  }> {
    await this.assertCanReviewJoinApplications(serverId, requesterUserId);
    const server = await this.serversService.getServerById(serverId);
    if (
      String((server as any).ownerId?._id ?? (server as any).ownerId) ===
      String(applicantUserId)
    ) {
      throw new BadRequestException(
        'Chủ máy chủ không có đơn đăng ký tham gia',
      );
    }
    if (!this.serversService.isMember(server as any, applicantUserId)) {
      throw new NotFoundException('Người dùng không thuộc máy chủ');
    }

    const [prof, urow, us] = await Promise.all([
      this.profileModel
        .findOne({ userId: new Types.ObjectId(applicantUserId) })
        .select('displayName username avatarUrl')
        .lean()
        .exec(),
      this.userModel
        .findById(applicantUserId)
        .select('username createdAt')
        .lean()
        .exec(),
      this.userServerModel
        .findOne({
          userId: new Types.ObjectId(applicantUserId),
          serverId: new Types.ObjectId(serverId),
        })
        .lean()
        .exec(),
    ]);

    const formQs = Array.isArray(
      (server as any)?.joinApplicationForm?.questions,
    )
      ? ((server as any).joinApplicationForm.questions as any[])
      : [];
    const answers = (us as any)?.joinApplicationAnswers as
      | Array<{
          questionId: string;
          text?: string;
          selectedOption?: string;
        }>
      | undefined;

    const questionsWithAnswers = formQs.map((q) => {
      const qid = String(q.id ?? '');
      const a = (answers || []).find((x) => String(x.questionId) === qid);
      return {
        questionId: qid,
        title: String(q.title ?? ''),
        type: String(q.type ?? 'short'),
        answerText: a?.text,
        selectedOption: a?.selectedOption,
      };
    });

    const st: UserServerStatus =
      ((us as any)?.status as UserServerStatus) ?? 'accepted';

    return {
      userId: applicantUserId,
      displayName: String(
        (prof as any)?.displayName || (urow as any)?.username || 'User',
      ),
      username: String(
        (prof as any)?.username || (urow as any)?.username || '',
      ),
      avatarUrl: (prof as any)?.avatarUrl
        ? String((prof as any).avatarUrl)
        : undefined,
      status: st,
      acceptedRules: Boolean((us as any)?.acceptedRules),
      accountCreatedAt: (urow as any)?.createdAt
        ? new Date((urow as any).createdAt).toISOString()
        : null,
      applicationSubmittedAt: (us as any)?.applicationSubmittedAt
        ? new Date((us as any).applicationSubmittedAt).toISOString()
        : (us as any)?.createdAt
          ? new Date((us as any).createdAt).toISOString()
          : null,
      questionsWithAnswers,
    };
  }

  async rejectUser(
    serverId: string,
    requesterUserId: string,
    targetUserId: string,
  ): Promise<UserServer> {
    const server = await this.serversService.getServerById(serverId);
    const isOwner = String(server.ownerId) === String(requesterUserId);
    const canManageServer = await this.rolesService.hasPermission(
      serverId,
      requesterUserId,
      'manageServer',
    );
    if (!isOwner && !canManageServer) {
      throw new ForbiddenException('Bạn không có quyền từ chối đơn đăng ký');
    }

    if (String((server as any).ownerId) === String(targetUserId)) {
      throw new BadRequestException('Không thể từ chối chủ máy chủ');
    }

    const target = await this.userServerModel
      .findOne({
        userId: new Types.ObjectId(targetUserId),
        serverId: new Types.ObjectId(serverId),
      })
      .lean()
      .exec();

    if (!target || target.status !== 'pending') {
      throw new BadRequestException('Người dùng không ở trạng thái chờ duyệt');
    }

    const updated = await this.userServerModel
      .findOneAndUpdate(
        {
          userId: new Types.ObjectId(targetUserId),
          serverId: new Types.ObjectId(serverId),
        },
        { $set: { status: 'rejected' } },
        { upsert: true, new: true },
      )
      .lean()
      .exec();

    // Notify applicant (Dành cho bạn)
    this.serversService
      .createUserNotification({
        serverId,
        actorId: requesterUserId,
        recipientUserIds: [targetUserId],
        title: '__SYS:joinAppRejectedTitle',
        content: '__SYS:joinAppRejectedContent',
      })
      .catch(() => {});

    this.notifyJoinApplicationUpdated(
      server,
      serverId,
      targetUserId,
      'rejected',
    );

    return updated as any;
  }

  /** Applicant rút đơn khi đang pending. */
  /**
   * Xóa bản ghi UserServer khi member không còn trong máy chủ (rời/kick/ban/dọn dữ liệu).
   */
  async deleteUserServerRecord(
    serverId: string,
    userId: string,
  ): Promise<void> {
    await this.userServerModel
      .deleteOne({
        userId: new Types.ObjectId(userId),
        serverId: new Types.ObjectId(serverId),
      })
      .exec();
  }

  async withdrawJoinApplication(
    serverId: string,
    userId: string,
  ): Promise<{ ok: boolean }> {
    const server = await this.serversService.getServerById(serverId);
    const accessMode = this.getEffectiveAccessMode(server);
    if (accessMode !== 'apply') {
      throw new BadRequestException('Máy chủ không bật chế độ đơn đăng ký');
    }

    const doc = await this.userServerModel
      .findOne({
        userId: new Types.ObjectId(userId),
        serverId: new Types.ObjectId(serverId),
      })
      .lean()
      .exec();

    if (!doc || doc.status !== 'pending') {
      throw new BadRequestException('Bạn không có đơn đang chờ xử lý');
    }

    // joinServer (apply) đã ensure member; rút đơn => remove khỏi server
    const before = (server as any).members?.length ?? 0;
    (server as any).members = ((server as any).members || []).filter(
      (m: any) => String(m.userId?._id ?? m.userId) !== String(userId),
    );
    const after = (server as any).members.length;
    if (after !== before) {
      (server as any).memberCount = after;
      await (server as any).save();
    }

    await this.deleteUserServerRecord(serverId, userId);

    this.notifyJoinApplicationUpdated(server, serverId, userId, 'withdrawn');

    return { ok: true };
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
    const canManageServer = await this.rolesService.hasPermission(
      serverId,
      requesterUserId,
      'manageServer',
    );
    if (!isOwner && !canManageServer) {
      throw new ForbiddenException(
        'Chỉ chủ máy chủ hoặc thành viên có quyền Quản Lý Máy Chủ mới có thể chỉnh sửa',
      );
    }

    const prevHasRules = Boolean((server as any).hasRules);
    const prevAgeRestricted = Boolean((server as any).isAgeRestricted);

    if (patch.accessMode) (server as any).accessMode = patch.accessMode;
    if (patch.isAgeRestricted !== undefined)
      (server as any).isAgeRestricted = patch.isAgeRestricted;
    if (patch.hasRules !== undefined)
      (server as any).hasRules = Boolean(patch.hasRules);

    // Compatibility: sync isPublic with accessMode
    const effectiveMode = this.getEffectiveAccessMode(server);
    (server as any).isPublic = effectiveMode === 'discoverable';

    const nextHasRules = Boolean((server as any).hasRules);
    const nextAgeRestricted = Boolean((server as any).isAgeRestricted);
    const ownerOid = new Types.ObjectId(String((server as any).ownerId));
    const serverOid = new Types.ObjectId(serverId);

    if (prevHasRules !== nextHasRules) {
      if (nextHasRules) {
        // Thành viên đã trong máy chủ: không bắt chấp nhận lại khi chủ bật quy định sau này.
        // Người gia nhập sau vẫn phải chấp nhận qua joinServer / UI.
        await this.userServerModel.updateMany(
          { serverId: serverOid },
          { $set: { acceptedRules: true } },
        );
      } else {
        await this.userServerModel.updateMany(
          { serverId: serverOid },
          { $set: { acceptedRules: true } },
        );
      }
    }

    // Bật giới hạn độ tuổi: thành viên hiện tại không phải bấm "Tiếp tục" lại; chỉ user mới vào sau mới ACK.
    if (!prevAgeRestricted && nextAgeRestricted) {
      await this.userServerModel.updateMany(
        { serverId: serverOid },
        { $set: { ageRestrictedAcknowledged: true } },
      );
    }

    await server.save();

    return {
      accessMode: this.getEffectiveAccessMode(server),
      isAgeRestricted: nextAgeRestricted,
      hasRules: nextHasRules,
    };
  }

  async addRule(
    serverId: string,
    requesterUserId: string,
    content: string,
  ): Promise<{ id: string; content: string }> {
    const server = await this.serversService.getServerById(serverId);
    const isOwner = String(server.ownerId) === String(requesterUserId);
    const canManageServer = await this.rolesService.hasPermission(
      serverId,
      requesterUserId,
      'manageServer',
    );
    if (!isOwner && !canManageServer) {
      throw new ForbiddenException(
        'Chỉ chủ máy chủ hoặc thành viên có quyền Quản Lý Máy Chủ mới có thể thêm quy định',
      );
    }

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
    const rawMemberJoinedAt = memberRow?.joinedAt
      ? new Date(memberRow.joinedAt)
      : null;

    // Apply-to-join: only start the "member over 10 minutes" timer after approval.
    // Otherwise, users could wait while pending and instantly pass verification after being accepted.
    const memberJoinedAt =
      accessMode === 'apply' &&
      (doc as any)?.status === 'accepted' &&
      (doc as any)?.acceptedAt
        ? new Date((doc as any).acceptedAt)
        : rawMemberJoinedAt;

    const isOwner =
      (server as any).ownerId?.toString?.() === userId ||
      String((server as any).ownerId) === String(userId);
    const canManageServer = await this.rolesService.hasPermission(
      serverId,
      userId,
      'manageServer',
    );
    const isBypass = isOwner || canManageServer;

    /** Thành viên trong members nhưng chưa có UserServer (dữ liệu cũ) — không áp dụng ngược gate tuổi/quy định. */
    const legacyMemberNoUserServerRow = !doc && rawMemberJoinedAt != null;

    const birthdate = (profileRow as any)?.birthdate ?? null;
    const accountCreatedAt = new Date(
      (userRow as any)?.createdAt || Date.now(),
    );
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
    const ageAckForGate =
      isBypass ||
      Boolean((doc as any)?.ageRestrictedAcknowledged) ||
      legacyMemberNoUserServerRow;

    const gate = evaluateChannelChatGate({
      isAgeRestricted,
      ageRestrictedAcknowledged: ageAckForGate,
      birthdate,
      verificationLevel,
      isVerified: isServerEmailVerified,
      accountCreatedAt,
      memberJoinedAt,
      isBypass,
    });

    const applyJoinAccepted =
      accessMode === 'apply' && (doc as any)?.status === 'accepted';
    const chatViewBlocked =
      !gate.allowed && !(applyJoinAccepted && gate.reason === 'verification');
    const chatBlockReason = chatViewBlocked ? (gate.reason ?? null) : null;

    const ageYears = calcAgeFromBirthdate(birthdate);

    // Thành viên đã có trong server trước khi bật "apply": không áp dụng ngược.
    // Nếu chưa có bản ghi UserServer (dữ liệu cũ), coi như đã chấp nhận quy định / không bắt ACK tuổi lại.
    const base = !doc
      ? {
          status: 'accepted' as UserServerStatus,
          acceptedRules: true,
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
      ageRestrictedAcknowledged: isBypass ? true : ageAckForGate,
      ageYears,
      verificationLevel,
      verificationChecks,
      verificationWait,
      chatViewBlocked,
      chatBlockReason,
      showAgeRestrictedChannelNotice:
        isAgeRestricted &&
        !chatViewBlocked &&
        !isBypass &&
        (ageYears ?? 0) >= 18,
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
  async joinServer(
    userId: string,
    serverId: string,
    opts?: {
      rulesAccepted?: boolean;
      nickname?: string;
      applicationAnswers?: Array<{
        questionId: string;
        text?: string;
        selectedOption?: string;
      }>;
    },
  ): Promise<UserServer> {
    const server = await this.serversService.getServerById(serverId);
    if (!server) throw new NotFoundException('Server not found');

    // If user is (re)joining (not currently a member), ensure no stale role membership remains.
    // This enforces "rejoin as a new member" semantics for server roles.
    if (!this.serversService.isMember(server as any, userId)) {
      await this.rolesService.removeMemberFromAllNonDefaultRoles(
        serverId,
        userId,
      );
      await this.userServerModel
        .deleteOne({
          userId: new Types.ObjectId(userId),
          serverId: new Types.ObjectId(serverId),
        })
        .exec();
    }

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

    // Đã là thành viên: chế độ apply chỉ áp dụng lần gia nhập đầu tiên, không ghi đè pending.
    if (this.serversService.isMember(server as any, userId)) {
      const existing = await this.userServerModel
        .findOne({
          userId: new Types.ObjectId(userId),
          serverId: new Types.ObjectId(serverId),
        })
        .lean()
        .exec();
      if (existing) {
        return existing as any;
      }
      const grandfatherAcceptedRules = !serverHasRules;
      const created = await this.userServerModel
        .findOneAndUpdate(
          {
            userId: new Types.ObjectId(userId),
            serverId: new Types.ObjectId(serverId),
          },
          {
            $set: {
              status: 'accepted',
              acceptedRules: grandfatherAcceptedRules,
            },
          },
          { upsert: true, new: true },
        )
        .lean()
        .exec();
      return created as any;
    }

    const accessMode: ServerAccessMode = this.getEffectiveAccessMode(server);

    if (accessMode === 'apply' && !statusOverride) {
      this.validateJoinApplicationForJoin(server, opts);
    }

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
      // Nếu user có pending invite, mark nó là accepted để inbox dọn dẹp.
      await this.serverInvitesService
        .acceptByServer(serverId, userId)
        .catch(() => {});
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

    let acceptedRulesFinal = acceptedRules;
    if (
      !statusOverride &&
      accessMode === 'apply' &&
      opts?.rulesAccepted === true
    ) {
      acceptedRulesFinal = true;
    }

    const setPayload: Record<string, unknown> = {
      status,
      acceptedRules: acceptedRulesFinal,
    };

    if (opts?.nickname?.trim()) {
      setPayload.nickname = opts.nickname.trim();
    }

    if (!statusOverride && accessMode === 'apply') {
      setPayload.applicationSubmittedAt = new Date();
      if (opts?.applicationAnswers !== undefined) {
        setPayload.joinApplicationAnswers = this.normalizeJoinAnswersForStorage(
          server,
          opts,
        );
      }
    }

    const updated = await this.userServerModel
      .findOneAndUpdate(
        {
          userId: new Types.ObjectId(userId),
          serverId: new Types.ObjectId(serverId),
        },
        {
          $set: setPayload,
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
    const canManageServer = await this.rolesService.hasPermission(
      serverId,
      requesterUserId,
      'manageServer',
    );
    if (!isOwner && !canManageServer) {
      throw new ForbiddenException(
        'Chỉ chủ máy chủ hoặc người có quyền Quản Lý Máy Chủ mới duyệt được',
      );
    }

    if (String((server as any).ownerId) === String(targetUserId)) {
      throw new BadRequestException('Không thể duyệt chủ máy chủ');
    }

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
            acceptedAt: new Date(),
          },
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();

    await this.ensureMemberInServer(serverId, targetUserId, 'member');

    if ((target as any).nickname) {
      await this.serversService
        .setMemberNickname(serverId, targetUserId, (target as any).nickname)
        .catch(() => {});
    }

    this.serversService
      .sendWelcomeMessagePublic(serverId, targetUserId)
      .catch(() => {});

    // Notify applicant (Dành cho bạn)
    this.serversService
      .createUserNotification({
        serverId,
        actorId: requesterUserId,
        recipientUserIds: [targetUserId],
        title: '__SYS:joinAppApprovedTitle',
        content: '__SYS:joinAppApprovedContent',
      })
      .catch(() => {});

    this.notifyJoinApplicationUpdated(
      server,
      serverId,
      targetUserId,
      'accepted',
    );

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

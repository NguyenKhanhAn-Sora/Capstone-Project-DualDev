import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog } from './audit-log.schema';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectModel(AuditLog.name) private readonly auditLogModel: Model<AuditLog>,
  ) {}

  async logRoleChange(params: {
    serverId: string;
    targetUserId: string;
    actorUserId: string;
    action: 'role.add' | 'role.remove';
    roleId: string;
    roleNameSnapshot: string;
  }): Promise<void> {
    const doc = new this.auditLogModel({
      serverId: new Types.ObjectId(params.serverId),
      targetUserId: new Types.ObjectId(params.targetUserId),
      actorUserId: new Types.ObjectId(params.actorUserId),
      action: params.action,
      roleId: new Types.ObjectId(params.roleId),
      roleNameSnapshot: params.roleNameSnapshot,
    });
    await doc.save();
  }

  async getRoleAuditLogs(params: {
    serverId: string;
    targetUserId: string;
    limit?: number;
  }) {
    const limit = params.limit && params.limit > 0 ? params.limit : 50;
    return this.auditLogModel
      .find({
        serverId: new Types.ObjectId(params.serverId),
        targetUserId: new Types.ObjectId(params.targetUserId),
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  async logServerEvent(params: {
    serverId: string;
    actorUserId: string;
    action:
      | 'server.update'
      | 'server.safety.update'
      | 'channel.create'
      | 'channel.update'
      | 'channel.delete';
    targetType: 'server' | 'channel' | 'member';
    targetId: string;
    targetName?: string;
    changes?: Array<{ field: string; from?: unknown; to?: unknown }>;
  }): Promise<void> {
    await this.auditLogModel.create({
      serverId: new Types.ObjectId(params.serverId),
      actorUserId: new Types.ObjectId(params.actorUserId),
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      targetName: params.targetName,
      changes: (params.changes || []).map((c) => ({
        field: c.field,
        from: c.from == null ? null : String(c.from),
        to: c.to == null ? null : String(c.to),
      })),
    });
  }

  async getServerAuditLogs(params: {
    serverId: string;
    action?: string;
    actorUserId?: string;
    limit?: number;
    before?: string;
  }) {
    const q: Record<string, any> = {
      serverId: new Types.ObjectId(params.serverId),
    };
    if (params.action) q.action = params.action;
    if (params.actorUserId)
      q.actorUserId = new Types.ObjectId(params.actorUserId);
    if (params.before) q.createdAt = { $lt: new Date(params.before) };
    const limit = Math.min(Math.max(params.limit || 50, 1), 100);
    return this.auditLogModel
      .find(q)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }
}

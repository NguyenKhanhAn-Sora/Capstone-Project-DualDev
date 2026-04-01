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
}


import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Channel, ChannelType } from './channel.schema';
import { ChannelCategory } from './channel-category.schema';
import { Server } from '../servers/server.schema';
import { CreateChannelDto } from './dto/create-channel.dto';
import { RolesService } from '../roles/roles.service';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class ChannelsService {
  constructor(
    @InjectModel(Channel.name) private channelModel: Model<Channel>,
    @InjectModel(ChannelCategory.name)
    private categoryModel: Model<ChannelCategory>,
    @InjectModel(Server.name) private serverModel: Model<Server>,
    @Inject(forwardRef(() => RolesService))
    private rolesService: RolesService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async createChannel(
    serverId: string,
    createChannelDto: CreateChannelDto,
    userId: string,
  ): Promise<Channel> {
    const server = await this.serverModel.findOne({
      _id: new Types.ObjectId(serverId),
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    });

    if (!server) {
      throw new NotFoundException(`Server with id ${serverId} not found`);
    }

    await this.assertCanManageChannels(serverId, userId);

    const userObjectId = new Types.ObjectId(userId);

    // Auto-assign position
    const maxPos = await this.channelModel
      .findOne({ serverId: new Types.ObjectId(serverId) })
      .sort({ position: -1 })
      .select('position')
      .lean();
    const nextPosition = ((maxPos as any)?.position ?? -1) + 1;

    const channel = new this.channelModel({
      name: createChannelDto.name,
      type: createChannelDto.type,
      description: createChannelDto.description || null,
      serverId: new Types.ObjectId(serverId),
      createdBy: userObjectId,
      isDefault: false,
      isPrivate: createChannelDto.isPrivate ?? false,
      categoryId: createChannelDto.categoryId
        ? new Types.ObjectId(createChannelDto.categoryId)
        : null,
      position: nextPosition,
    });

    const savedChannel = await channel.save();

    server.channels.push(savedChannel._id);
    await server.save();
    await this.auditLogService.logServerEvent({
      serverId,
      actorUserId: userId,
      action: 'channel.create',
      targetType: 'channel',
      targetId: savedChannel._id.toString(),
      targetName: savedChannel.name,
      changes: [
        { field: 'name', to: savedChannel.name },
        { field: 'type', to: savedChannel.type },
      ],
    });

    return savedChannel;
  }

  async getChannelsByServerId(serverId: string): Promise<Channel[]> {
    return this.channelModel
      .find({ serverId: new Types.ObjectId(serverId) })
      .sort({ position: 1 })
      .populate('createdBy', 'email')
      .exec();
  }

  async getChannelById(channelId: string): Promise<Channel> {
    const channel = await this.channelModel
      .findById(channelId)
      .populate('createdBy', 'email')
      .exec();

    if (!channel) {
      throw new NotFoundException(`Channel with id ${channelId} not found`);
    }

    return channel;
  }

  async updateChannel(
    channelId: string,
    name?: string,
    description?: string,
    userId?: string,
  ): Promise<Channel> {
    const channel = await this.channelModel.findById(channelId);

    if (!channel) {
      throw new NotFoundException(`Channel with id ${channelId} not found`);
    }

    if (userId) {
      const isCreator = channel.createdBy.toString() === userId;
      const canManage = await this.rolesService.hasPermission(
        channel.serverId.toString(),
        userId,
        'manageChannels',
      );
      if (!isCreator && !canManage) {
        throw new ForbiddenException('Bạn không có quyền chỉnh sửa kênh này');
      }
    }

    const oldName = channel.name;
    const oldDesc = channel.description;
    if (name) channel.name = name;
    if (description !== undefined) channel.description = description;
    const saved = await channel.save();
    await this.auditLogService.logServerEvent({
      serverId: channel.serverId.toString(),
      actorUserId: userId || channel.createdBy.toString(),
      action: 'channel.update',
      targetType: 'channel',
      targetId: channelId,
      targetName: saved.name,
      changes: [
        { field: 'name', from: oldName, to: saved.name },
        {
          field: 'description',
          from: oldDesc || '',
          to: saved.description || '',
        },
      ],
    });
    return saved;
  }

  async deleteChannel(channelId: string, userId: string): Promise<void> {
    const channel = await this.channelModel.findById(channelId);

    if (!channel) {
      throw new NotFoundException(`Channel with id ${channelId} not found`);
    }

    if (channel.isDefault) {
      throw new BadRequestException('Không thể xóa kênh mặc định');
    }

    const isCreator = channel.createdBy.toString() === userId;
    const canManage = await this.rolesService.hasPermission(
      channel.serverId.toString(),
      userId,
      'manageChannels',
    );
    if (!isCreator && !canManage) {
      throw new ForbiddenException('Bạn không có quyền xóa kênh này');
    }

    await this.serverModel.findByIdAndUpdate(
      channel.serverId,
      { $pull: { channels: new Types.ObjectId(channelId) } },
      { new: true },
    );

    await this.channelModel.findByIdAndDelete(channelId);
    await this.auditLogService.logServerEvent({
      serverId: channel.serverId.toString(),
      actorUserId: userId,
      action: 'channel.delete',
      targetType: 'channel',
      targetId: channelId,
      targetName: channel.name,
      changes: [{ field: 'deleted', from: 'false', to: 'true' }],
    });
  }

  async getChannelsByType(
    serverId: string,
    type: ChannelType,
  ): Promise<Channel[]> {
    return this.channelModel
      .find({
        serverId: new Types.ObjectId(serverId),
        type,
      })
      .sort({ position: 1 })
      .populate('createdBy', 'email')
      .exec();
  }

  private async assertCanManageChannels(
    serverId: string,
    userId: string,
  ): Promise<void> {
    const allowed = await this.rolesService.hasPermission(
      serverId,
      userId,
      'manageChannels',
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Chỉ chủ máy chủ hoặc thành viên có quyền Quản Lý Kênh mới được thực hiện',
      );
    }
  }

  // ── Category CRUD ──

  async createCategory(
    serverId: string,
    name: string,
    type: 'text' | 'voice' | 'mixed' = 'mixed',
  ): Promise<ChannelCategory> {
    const serverOid = new Types.ObjectId(serverId);
    const maxPos = await this.categoryModel
      .findOne({ serverId: serverOid })
      .sort({ position: -1 })
      .select('position')
      .lean();
    const nextPosition = ((maxPos as any)?.position ?? -1) + 1;

    const cat = new this.categoryModel({
      name,
      serverId: serverOid,
      position: nextPosition,
      type,
    });
    return cat.save();
  }

  async getCategories(serverId: string): Promise<any[]> {
    const serverOid = new Types.ObjectId(serverId);
    let cats = await this.categoryModel
      .find({ serverId: serverOid })
      .sort({ position: 1 })
      .lean()
      .exec();

    if (cats.length === 0) {
      const channelCount = await this.channelModel.countDocuments({
        serverId: serverOid,
      });
      if (channelCount > 0) {
        cats = await this.migrateServerToCategories(serverId);
      }
    }

    return cats;
  }

  private async migrateServerToCategories(serverId: string): Promise<any[]> {
    const serverOid = new Types.ObjectId(serverId);

    const textCat = new this.categoryModel({
      name: 'Kênh Chat',
      serverId: serverOid,
      position: 0,
      type: 'text',
    });
    const voiceCat = new this.categoryModel({
      name: 'Kênh Thoại',
      serverId: serverOid,
      position: 1,
      type: 'voice',
    });
    const [savedText, savedVoice] = await Promise.all([
      textCat.save(),
      voiceCat.save(),
    ]);

    await this.channelModel.updateMany(
      {
        serverId: serverOid,
        type: 'text',
        categoryId: null,
        $or: [{ category: { $ne: 'info' } }, { category: null }],
      },
      { $set: { categoryId: savedText._id } },
    );
    await this.channelModel.updateMany(
      { serverId: serverOid, type: 'voice', categoryId: null },
      { $set: { categoryId: savedVoice._id } },
    );

    const textChannels = await this.channelModel
      .find({ serverId: serverOid, categoryId: savedText._id })
      .select('_id')
      .exec();
    const voiceChannels = await this.channelModel
      .find({ serverId: serverOid, categoryId: savedVoice._id })
      .select('_id')
      .exec();
    const ops = [
      ...textChannels.map((ch, i) => ({
        updateOne: {
          filter: { _id: ch._id },
          update: { $set: { position: i } },
        },
      })),
      ...voiceChannels.map((ch, i) => ({
        updateOne: {
          filter: { _id: ch._id },
          update: { $set: { position: i } },
        },
      })),
    ];
    if (ops.length > 0) {
      await this.channelModel.bulkWrite(ops);
    }

    return [savedText.toObject(), savedVoice.toObject()];
  }

  async updateCategory(
    categoryId: string,
    name: string,
  ): Promise<ChannelCategory> {
    const cat = await this.categoryModel.findByIdAndUpdate(
      categoryId,
      { name },
      { new: true },
    );
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  async deleteCategory(categoryId: string): Promise<void> {
    const cat = await this.categoryModel.findById(categoryId);
    if (!cat) throw new NotFoundException('Category not found');

    await this.channelModel.updateMany(
      { categoryId: new Types.ObjectId(categoryId) },
      { $set: { categoryId: null } },
    );

    await this.categoryModel.findByIdAndDelete(categoryId);
  }

  // ── Reorder ──

  async reorderCategories(
    serverId: string,
    orderedIds: string[],
    userId: string,
  ): Promise<void> {
    await this.assertCanManageChannels(serverId, userId);

    const ops = orderedIds.map((id, i) => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(id) },
        update: { $set: { position: i } },
      },
    }));
    if (ops.length > 0) {
      await this.categoryModel.bulkWrite(ops);
    }
  }

  async reorderChannels(
    serverId: string,
    categoryId: string | null,
    orderedChannelIds: string[],
    userId: string,
  ): Promise<void> {
    await this.assertCanManageChannels(serverId, userId);

    const catOid = categoryId ? new Types.ObjectId(categoryId) : null;
    const ops = orderedChannelIds.map((id, i) => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(id) },
        update: { $set: { position: i, categoryId: catOid } },
      },
    }));
    if (ops.length > 0) {
      await this.channelModel.bulkWrite(ops);
    }
  }
}

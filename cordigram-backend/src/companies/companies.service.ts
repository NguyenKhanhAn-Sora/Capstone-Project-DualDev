import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Company } from './company.schema';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectModel(Company.name) private readonly companyModel: Model<Company>,
  ) {}

  private escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Normalizes company names for matching & de-dup.
   * - lowercases
   * - removes diacritics
   * - strips punctuation/symbols
   * - collapses whitespace
   */
  normalizeName(input: string): string {
    const trimmed = (input ?? '').trim();
    if (!trimmed) return '';

    // NFD splits base letters + diacritics; then strip diacritic marks.
    const noDiacritics = trimmed
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');

    // Replace punctuation/symbols with spaces so "VTC-Academy" ~= "VTC Academy".
    const noPunct = noDiacritics.toLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ');

    return noPunct.replace(/\s+/g, ' ').trim();
  }

  async suggest(params: { q: string; limit?: number }) {
    const limit = Math.min(Math.max(Number(params.limit) || 8, 1), 25);
    const normalized = this.normalizeName(params.q);
    if (!normalized) return [];

    const prefix = new RegExp('^' + this.escapeRegex(normalized));
    const contains = new RegExp(this.escapeRegex(normalized));

    const prefixItems = await this.companyModel
      .find({
        status: { $in: ['active', 'pending'] },
        $or: [{ nameNormalized: prefix }, { aliasesNormalized: prefix }],
      })
      .sort({ status: 1, memberCount: -1, nameNormalized: 1 })
      .limit(limit)
      .select('_id name memberCount')
      .lean()
      .exec();

    const remaining = limit - prefixItems.length;
    const items =
      remaining > 0
        ? prefixItems.concat(
            await this.companyModel
              .find({
                status: { $in: ['active', 'pending'] },
                _id: { $nin: prefixItems.map((c) => c._id) },
                $or: [
                  { nameNormalized: contains },
                  { aliasesNormalized: contains },
                ],
              })
              .sort({ status: 1, memberCount: -1, nameNormalized: 1 })
              .limit(remaining)
              .select('_id name memberCount')
              .lean()
              .exec(),
          )
        : prefixItems;

    return items.map((c) => ({
      id: c._id?.toString?.() ?? (c as any).id,
      name: c.name,
      memberCount: c.memberCount ?? 0,
    }));
  }

  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.companyModel.findById(new Types.ObjectId(id)).exec();
  }

  async incrementMemberCount(companyId: Types.ObjectId, delta: number) {
    if (!companyId) return;
    await this.companyModel
      .updateOne({ _id: companyId }, { $inc: { memberCount: delta } })
      .exec();
  }

  /**
   * Ensures a company exists and returns it.
   * Creates a "pending" record if not found.
   */
  async ensureCompanyByName(name: string) {
    const normalized = this.normalizeName(name);
    if (!normalized) return null;

    const existing = await this.companyModel
      .findOne({ nameNormalized: normalized })
      .exec();
    if (existing) return existing;

    try {
      return await this.companyModel.create({
        name: name.trim(),
        nameNormalized: normalized,
        aliases: [],
        aliasesNormalized: [],
        status: 'active',
        memberCount: 0,
      });
    } catch (err) {
      // If two requests create the same normalized name concurrently, unique index may throw.
      const code =
        typeof err === 'object' && err && 'code' in err
          ? Number((err as any).code)
          : undefined;
      if (code === 11000) {
        return this.companyModel.findOne({ nameNormalized: normalized }).exec();
      }
      throw err;
    }
  }
}

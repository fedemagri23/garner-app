import { Injectable } from '@nestjs/common';
import type {
  OptimizationPreferences as PreferencesRow,
  OptimizationRequest as RequestRow,
  Prisma,
} from '../../../generated/prisma/core/index.js';
import { CorePrismaService } from '../../common/database/core-prisma.service.js';
import type {
  OptimizationPreferences,
  OptimizationRequest,
  OptimizationSettings,
  OptimizationStatus,
} from '../domain/optimization-request.entity.js';
import type {
  OptimizationPreferencesRepository,
  OptimizationRequestRepository,
} from '../domain/optimization.repository.port.js';
import type { OptimizationResult } from '../domain/optimizer.js';
import type { OptimizationMode } from '../domain/scoring.js';

@Injectable()
export class PrismaOptimizationPreferencesRepository
  implements OptimizationPreferencesRepository
{
  constructor(private readonly prisma: CorePrismaService) {}

  async find(userId: string): Promise<OptimizationPreferences | null> {
    const row = await this.prisma.optimizationPreferences.findUnique({
      where: { userId },
    });

    return row ? this.toDomain(row) : null;
  }

  /** Created on first save, so an account carries no row until it chooses. */
  async save(
    userId: string,
    input: Partial<Omit<OptimizationPreferences, 'userId'>>,
  ): Promise<OptimizationPreferences> {
    const row = await this.prisma.optimizationPreferences.upsert({
      where: { userId },
      create: {
        userId,
        maxStores: input.maxStores,
        maxAdditionalDistanceKm: input.maxAdditionalDistanceKm,
        maxAdditionalMinutes: input.maxAdditionalMinutes,
        minSavingsCentsPerExtraStore: input.minSavingsCentsPerExtraStore,
        mode: input.mode,
        preferredSupermarketIds: input.preferredSupermarketIds,
        excludedSupermarketIds: input.excludedSupermarketIds,
      },
      update: {
        maxStores: input.maxStores,
        maxAdditionalDistanceKm: input.maxAdditionalDistanceKm,
        maxAdditionalMinutes: input.maxAdditionalMinutes,
        minSavingsCentsPerExtraStore: input.minSavingsCentsPerExtraStore,
        mode: input.mode,
        preferredSupermarketIds: input.preferredSupermarketIds,
        excludedSupermarketIds: input.excludedSupermarketIds,
      },
    });

    return this.toDomain(row);
  }

  private toDomain(row: PreferencesRow): OptimizationPreferences {
    return {
      userId: row.userId,
      maxStores: row.maxStores,
      maxAdditionalDistanceKm: row.maxAdditionalDistanceKm,
      maxAdditionalMinutes: row.maxAdditionalMinutes,
      minSavingsCentsPerExtraStore: row.minSavingsCentsPerExtraStore,
      mode: row.mode as OptimizationMode,
      preferredSupermarketIds: row.preferredSupermarketIds,
      excludedSupermarketIds: row.excludedSupermarketIds,
    };
  }
}

@Injectable()
export class PrismaOptimizationRequestRepository
  implements OptimizationRequestRepository
{
  constructor(private readonly prisma: CorePrismaService) {}

  async create(input: {
    ownerId: string;
    listId: string;
    settings: OptimizationSettings;
    fingerprint: string;
  }): Promise<OptimizationRequest> {
    const row = await this.prisma.optimizationRequest.create({
      data: {
        ownerId: input.ownerId,
        listId: input.listId,
        fingerprint: input.fingerprint,
        latitude: input.settings.latitude,
        longitude: input.settings.longitude,
        radiusKm: input.settings.radiusKm,
        maxStores: input.settings.maxStores,
        maxAdditionalDistanceKm: input.settings.maxAdditionalDistanceKm,
        maxAdditionalMinutes: input.settings.maxAdditionalMinutes,
        minSavingsCentsPerExtraStore:
          input.settings.minSavingsCentsPerExtraStore,
        mode: input.settings.mode,
        preferredSupermarketIds: input.settings.preferredSupermarketIds,
        excludedSupermarketIds: input.settings.excludedSupermarketIds,
      },
    });

    return this.toDomain(row);
  }

  async findById(id: string): Promise<OptimizationRequest | null> {
    const row = await this.prisma.optimizationRequest.findUnique({
      where: { id },
    });

    return row ? this.toDomain(row) : null;
  }

  async findByOwner(
    ownerId: string,
    filter: { listId?: string; skip: number; take: number },
  ): Promise<{ requests: OptimizationRequest[]; totalItems: number }> {
    const where = {
      ownerId,
      ...(filter.listId ? { listId: filter.listId } : {}),
    };

    const [rows, totalItems] = await Promise.all([
      this.prisma.optimizationRequest.findMany({
        where,
        orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
        skip: filter.skip,
        take: filter.take,
      }),
      this.prisma.optimizationRequest.count({ where }),
    ]);

    return { requests: rows.map((row) => this.toDomain(row)), totalItems };
  }

  async findReusable(
    listId: string,
    fingerprint: string,
  ): Promise<OptimizationRequest | null> {
    const row = await this.prisma.optimizationRequest.findFirst({
      where: { listId, fingerprint, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
    });

    return row ? this.toDomain(row) : null;
  }

  /**
   * Conditional on the request still being PENDING, so two workers handed the
   * same job cannot both compute it.
   */
  async claim(id: string, startedAt: Date): Promise<boolean> {
    const { count } = await this.prisma.optimizationRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'RUNNING', startedAt },
    });

    return count === 1;
  }

  async complete(
    id: string,
    outcome: {
      result: OptimizationResult;
      recommendedTotalCents: number | null;
      recommendedStoreCount: number | null;
    },
  ): Promise<OptimizationRequest> {
    const row = await this.prisma.optimizationRequest.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        error: null,
        result: outcome.result as unknown as Prisma.InputJsonValue,
        recommendedTotalCents: outcome.recommendedTotalCents,
        recommendedStoreCount: outcome.recommendedStoreCount,
      },
    });

    return this.toDomain(row);
  }

  async fail(id: string, error: string): Promise<OptimizationRequest> {
    const row = await this.prisma.optimizationRequest.update({
      where: { id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        error: error.slice(0, 2_000),
      },
    });

    return this.toDomain(row);
  }

  async release(id: string): Promise<void> {
    await this.prisma.optimizationRequest.updateMany({
      where: { id, status: 'RUNNING' },
      data: { status: 'PENDING', startedAt: null },
    });
  }

  async statusOf(id: string): Promise<OptimizationStatus | null> {
    const row = await this.prisma.optimizationRequest.findUnique({
      where: { id },
      select: { status: true },
    });

    return (row?.status as OptimizationStatus) ?? null;
  }

  private toDomain(row: RequestRow): OptimizationRequest {
    return {
      id: row.id,
      ownerId: row.ownerId,
      listId: row.listId,
      settings: {
        latitude: row.latitude,
        longitude: row.longitude,
        radiusKm: row.radiusKm,
        maxStores: row.maxStores,
        maxAdditionalDistanceKm: row.maxAdditionalDistanceKm,
        maxAdditionalMinutes: row.maxAdditionalMinutes,
        minSavingsCentsPerExtraStore: row.minSavingsCentsPerExtraStore,
        mode: row.mode as OptimizationMode,
        preferredSupermarketIds: row.preferredSupermarketIds,
        excludedSupermarketIds: row.excludedSupermarketIds,
      },
      status: row.status as OptimizationStatus,
      fingerprint: row.fingerprint,
      requestedAt: row.requestedAt,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      error: row.error,
      // Written by this module and read back whole; no other shape can reach
      // the column.
      result: (row.result as unknown as OptimizationResult | null) ?? null,
    };
  }
}

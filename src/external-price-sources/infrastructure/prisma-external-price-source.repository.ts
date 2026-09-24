import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/pricing/index.js';
import type {
  ExternalPriceSource as SourceRow,
  ImportRun as ImportRunRow,
  ExternalProductLink as LinkRow,
} from '../../../generated/prisma/pricing/index.js';
import { PricingPrismaService } from '../../common/database/pricing-prisma.service.js';
import type {
  ExternalPriceSource,
  ExternalProductLink,
  ExternalProductLinkStatus,
  ImportRun,
  ImportRunStatus,
  ProductMatchMethod,
} from '../domain/external-price-source.entity.js';
import type {
  CreateSourceInput,
  ExternalPriceSourceRepository,
  ExternalProductLinkRepository,
  ExternalStoreLinkRepository,
  ImportRunRepository,
  ImportRunTotals,
  UpdateSourceInput,
} from '../domain/external-price-source.repository.port.js';

/**
 * Adapter configuration is an open object by design — each adapter validates
 * its own shape — which Prisma's JSON column type cannot express directly.
 */
function asJson(config: Record<string, unknown>): Prisma.InputJsonValue {
  return config as Prisma.InputJsonValue;
}

@Injectable()
export class PrismaExternalPriceSourceRepository
  implements ExternalPriceSourceRepository
{
  constructor(private readonly prisma: PricingPrismaService) {}

  async findAll(): Promise<ExternalPriceSource[]> {
    const rows = await this.prisma.externalPriceSource.findMany({
      orderBy: { name: 'asc' },
    });

    return rows.map((row) => this.toDomain(row));
  }

  async findById(id: string): Promise<ExternalPriceSource | null> {
    const row = await this.prisma.externalPriceSource.findUnique({
      where: { id },
    });

    return row ? this.toDomain(row) : null;
  }

  async findBySlug(slug: string): Promise<ExternalPriceSource | null> {
    const row = await this.prisma.externalPriceSource.findUnique({
      where: { slug },
    });

    return row ? this.toDomain(row) : null;
  }

  async findEnabled(): Promise<ExternalPriceSource[]> {
    const rows = await this.prisma.externalPriceSource.findMany({
      where: { isEnabled: true },
      orderBy: { scheduleHourUtc: 'asc' },
    });

    return rows.map((row) => this.toDomain(row));
  }

  async create(input: CreateSourceInput): Promise<ExternalPriceSource> {
    const row = await this.prisma.externalPriceSource.create({
      data: {
        name: input.name,
        slug: input.slug,
        supermarketId: input.supermarketId,
        adapterKey: input.adapterKey,
        scheduleHourUtc: input.scheduleHourUtc,
        config: asJson(input.config),
      },
    });

    return this.toDomain(row);
  }

  async update(
    id: string,
    input: UpdateSourceInput,
  ): Promise<ExternalPriceSource> {
    const row = await this.prisma.externalPriceSource.update({
      where: { id },
      data: {
        name: input.name,
        isEnabled: input.isEnabled,
        scheduleHourUtc: input.scheduleHourUtc,
        config: input.config === undefined ? undefined : asJson(input.config),
      },
    });

    return this.toDomain(row);
  }

  async recordRunOutcome(
    sourceId: string,
    outcome: { status: ImportRunStatus; finishedAt: Date },
  ): Promise<void> {
    const failed = outcome.status === 'FAILED';

    await this.prisma.externalPriceSource.update({
      where: { id: sourceId },
      data: {
        lastRunAt: outcome.finishedAt,
        lastStatus: outcome.status,
        // A run that produced anything counts as the source working; only a
        // total failure moves the streak.
        ...(failed
          ? { consecutiveFailures: { increment: 1 } }
          : { consecutiveFailures: 0, lastSuccessfulRunAt: outcome.finishedAt }),
      },
    });
  }

  private toDomain(row: SourceRow): ExternalPriceSource {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      supermarketId: row.supermarketId,
      adapterKey: row.adapterKey,
      isEnabled: row.isEnabled,
      scheduleHourUtc: row.scheduleHourUtc,
      config: (row.config ?? {}) as Record<string, unknown>,
      lastRunAt: row.lastRunAt,
      lastSuccessfulRunAt: row.lastSuccessfulRunAt,
      lastStatus: row.lastStatus as ImportRunStatus | null,
      consecutiveFailures: row.consecutiveFailures,
    };
  }
}

@Injectable()
export class PrismaImportRunRepository implements ImportRunRepository {
  constructor(private readonly prisma: PricingPrismaService) {}

  /**
   * One run per source per slot. Two triggers for the same day meet on the
   * unique key, and the second gets the first's run rather than its own.
   */
  async startOrResume(
    sourceId: string,
    runKey: string,
  ): Promise<{ run: ImportRun; created: boolean }> {
    const existing = await this.prisma.importRun.findUnique({
      where: { sourceId_runKey: { sourceId, runKey } },
    });

    if (existing) {
      return { run: this.toDomain(existing), created: false };
    }

    const row = await this.prisma.importRun.create({
      data: { sourceId, runKey },
    });

    return { run: this.toDomain(row), created: true };
  }

  async finish(
    runId: string,
    outcome: {
      status: ImportRunStatus;
      totals: ImportRunTotals;
      error: string | null;
    },
  ): Promise<ImportRun> {
    const row = await this.prisma.importRun.update({
      where: { id: runId },
      data: {
        status: outcome.status,
        finishedAt: new Date(),
        error: outcome.error?.slice(0, 2_000) ?? null,
        ...outcome.totals,
      },
    });

    return this.toDomain(row);
  }

  async findRecent(sourceId: string, limit: number): Promise<ImportRun[]> {
    const rows = await this.prisma.importRun.findMany({
      where: { sourceId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    return rows.map((row) => this.toDomain(row));
  }

  async findLastRunKey(sourceId: string): Promise<string | null> {
    const row = await this.prisma.importRun.findFirst({
      where: { sourceId },
      orderBy: { startedAt: 'desc' },
      select: { runKey: true },
    });

    return row?.runKey ?? null;
  }

  private toDomain(row: ImportRunRow): ImportRun {
    return {
      id: row.id,
      sourceId: row.sourceId,
      runKey: row.runKey,
      status: row.status as ImportRunStatus,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      productsSeen: row.productsSeen,
      pricesSeen: row.pricesSeen,
      observationsCreated: row.observationsCreated,
      matchedProducts: row.matchedProducts,
      unmatchedProducts: row.unmatchedProducts,
      skippedPrices: row.skippedPrices,
      error: row.error,
    };
  }
}

@Injectable()
export class PrismaExternalProductLinkRepository
  implements ExternalProductLinkRepository
{
  constructor(private readonly prisma: PricingPrismaService) {}

  async findBySource(
    sourceId: string,
    externalProductIds: string[],
  ): Promise<ExternalProductLink[]> {
    if (externalProductIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.externalProductLink.findMany({
      where: { sourceId, externalProductId: { in: externalProductIds } },
    });

    return rows.map((row) => this.toDomain(row));
  }

  async findOne(
    sourceId: string,
    externalProductId: string,
  ): Promise<ExternalProductLink | null> {
    const row = await this.prisma.externalProductLink.findUnique({
      where: { sourceId_externalProductId: { sourceId, externalProductId } },
    });

    return row ? this.toDomain(row) : null;
  }

  async listByStatus(
    sourceId: string,
    status: ExternalProductLinkStatus,
    page: { skip: number; take: number },
  ): Promise<{ links: ExternalProductLink[]; totalItems: number }> {
    const where = { sourceId, status };

    const [rows, totalItems] = await Promise.all([
      this.prisma.externalProductLink.findMany({
        where,
        orderBy: { lastSeenAt: 'desc' },
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.externalProductLink.count({ where }),
    ]);

    return { links: rows.map((row) => this.toDomain(row)), totalItems };
  }

  async save(link: {
    sourceId: string;
    externalProductId: string;
    externalName: string;
    externalBarcode: string | null;
    productId: string | null;
    matchMethod: ProductMatchMethod | null;
    status: ExternalProductLinkStatus;
    lastSeenAt: Date;
  }): Promise<ExternalProductLink> {
    const { sourceId, externalProductId, ...rest } = link;

    const row = await this.prisma.externalProductLink.upsert({
      where: { sourceId_externalProductId: { sourceId, externalProductId } },
      create: { sourceId, externalProductId, ...rest },
      update: rest,
    });

    return this.toDomain(row);
  }

  private toDomain(row: LinkRow): ExternalProductLink {
    return {
      id: row.id,
      sourceId: row.sourceId,
      externalProductId: row.externalProductId,
      productId: row.productId,
      externalName: row.externalName,
      externalBarcode: row.externalBarcode,
      matchMethod: row.matchMethod as ProductMatchMethod | null,
      status: row.status as ExternalProductLinkStatus,
      lastSeenAt: row.lastSeenAt,
    };
  }
}

@Injectable()
export class PrismaExternalStoreLinkRepository
  implements ExternalStoreLinkRepository
{
  constructor(private readonly prisma: PricingPrismaService) {}

  async mapForSource(sourceId: string): Promise<Map<string, string>> {
    const rows = await this.prisma.externalStoreLink.findMany({
      where: { sourceId },
      select: { externalStoreId: true, storeId: true },
    });

    return new Map(rows.map((row) => [row.externalStoreId, row.storeId]));
  }

  async link(
    sourceId: string,
    externalStoreId: string,
    storeId: string,
  ): Promise<void> {
    await this.prisma.externalStoreLink.upsert({
      where: { sourceId_externalStoreId: { sourceId, externalStoreId } },
      create: { sourceId, externalStoreId, storeId },
      update: { storeId },
    });
  }

  async unlink(sourceId: string, externalStoreId: string): Promise<void> {
    await this.prisma.externalStoreLink.deleteMany({
      where: { sourceId, externalStoreId },
    });
  }
}

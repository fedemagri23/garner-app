import { Injectable } from '@nestjs/common';
import { PricingPrismaService } from '../../common/database/pricing-prisma.service.js';
import type { SessionContributionLedger } from '../domain/session-contribution.port.js';

/**
 * Kept in `pricing_db` beside the observations it accounts for, so the record
 * that a trip was processed lives and is pruned with what processing produced.
 */
@Injectable()
export class PrismaSessionContributionLedger implements SessionContributionLedger {
  constructor(private readonly prisma: PricingPrismaService) {}

  async isRecorded(sessionId: string): Promise<boolean> {
    const row = await this.prisma.sessionContribution.findUnique({
      where: { sessionId },
      select: { sessionId: true },
    });

    return row !== null;
  }

  async recordedAmong(sessionIds: string[]): Promise<Set<string>> {
    if (sessionIds.length === 0) {
      return new Set();
    }

    const rows = await this.prisma.sessionContribution.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { sessionId: true },
    });

    return new Set(rows.map((row) => row.sessionId));
  }

  async record(entry: {
    sessionId: string;
    userId: string;
    observationCount: number;
    skippedCount: number;
  }): Promise<void> {
    await this.prisma.sessionContribution.upsert({
      where: { sessionId: entry.sessionId },
      create: entry,
      update: {},
    });
  }
}

import { Injectable } from '@nestjs/common';
import { CorePrismaService } from '../../common/database/core-prisma.service.js';
import type { PasswordResetRepository, ResetCodeRecord } from '../domain/password-reset.js';

@Injectable()
export class PrismaPasswordResetRepository implements PasswordResetRepository {
  constructor(private readonly prisma: CorePrismaService) {}

  create(input: { userId: string; codeHash: string; expiresAt: Date }): Promise<ResetCodeRecord> {
    return this.prisma.passwordResetCode.create({ data: input });
  }

  latest(userId: string): Promise<ResetCodeRecord | null> {
    return this.prisma.passwordResetCode.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  countSince(userId: string, since: Date): Promise<number> {
    return this.prisma.passwordResetCode.count({ where: { userId, createdAt: { gte: since } } });
  }

  async recordFailedAttempt(id: string): Promise<void> {
    await this.prisma.passwordResetCode.update({ where: { id }, data: { attempts: { increment: 1 } } });
  }

  async markUsed(id: string, at: Date): Promise<void> {
    await this.prisma.passwordResetCode.update({ where: { id }, data: { usedAt: at } });
  }
}

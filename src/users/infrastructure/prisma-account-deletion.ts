import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { CorePrismaService } from '../../common/database/core-prisma.service.js';
import type { AccountDeletion } from '../domain/account-deletion.port.js';

/**
 * One transaction over the core database. It reaches into tables other
 * modules own (lists, trips, alerts…) on purpose: deleting an account has to
 * be all or nothing, and a cross-module event chain could leave half of it
 * behind (CON-064).
 */
@Injectable()
export class PrismaAccountDeletion implements AccountDeletion {
  constructor(private readonly prisma: CorePrismaService) {}

  async erase(userId: string, at: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Children of these go with them (items, deliveries).
      await tx.notification.deleteMany({ where: { userId } });
      await tx.priceAlert.deleteMany({ where: { ownerId: userId } });
      await tx.notificationPreferences.deleteMany({ where: { userId } });
      await tx.deviceToken.deleteMany({ where: { userId } });
      await tx.shoppingSession.deleteMany({ where: { ownerId: userId } });
      await tx.optimizationRequest.deleteMany({ where: { ownerId: userId } });
      await tx.optimizationPreferences.deleteMany({ where: { userId } });
      await tx.shoppingList.deleteMany({ where: { ownerId: userId } });
      await tx.userPreferences.deleteMany({ where: { userId } });
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.passwordResetCode.deleteMany({ where: { userId } });

      // Nobody can sign in to it, find it by email, or see who it was.
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@deleted.invalid`,
          displayName: 'Cuenta eliminada',
          passwordHash: `!deleted-${randomBytes(24).toString('hex')}`,
          isActive: false,
          deletedAt: at,
        },
      });
    });
  }
}

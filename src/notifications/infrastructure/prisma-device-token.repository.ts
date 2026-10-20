import { Injectable } from '@nestjs/common';
import type { DeviceToken as DeviceTokenRow } from '../../../generated/prisma/core/index.js';
import { CorePrismaService } from '../../common/database/core-prisma.service.js';
import type {
  DeviceToken,
  DeviceTokenRepository,
} from '../domain/notification.repository.port.js';

@Injectable()
export class PrismaDeviceTokenRepository implements DeviceTokenRepository {
  constructor(private readonly prisma: CorePrismaService) {}

  async upsert(userId: string, token: string, platform: string): Promise<DeviceToken> {
    // The token is unique across accounts: registering one another account
    // held moves it, so a pushed message never reaches the previous owner.
    const row = await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform, lastSeenAt: new Date() },
    });

    return this.toDomain(row);
  }

  async findByUser(userId: string): Promise<DeviceToken[]> {
    const rows = await this.prisma.deviceToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((row) => this.toDomain(row));
  }

  async remove(userId: string, token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
  }

  async removeMany(tokens: string[]): Promise<void> {
    if (tokens.length > 0) {
      await this.prisma.deviceToken.deleteMany({ where: { token: { in: tokens } } });
    }
  }

  private toDomain(row: DeviceTokenRow): DeviceToken {
    return {
      id: row.id,
      userId: row.userId,
      token: row.token,
      platform: row.platform,
      createdAt: row.createdAt,
      lastSeenAt: row.lastSeenAt,
    };
  }
}

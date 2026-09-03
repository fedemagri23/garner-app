import { Injectable } from '@nestjs/common';
import type { User as PrismaUser } from '../../../generated/prisma/core/index.js';
import { CorePrismaService } from '../../common/database/core-prisma.service.js';
import type { UserRole } from '../../security/domain/user-role.js';
import {
  normalizeEmail,
  type CreateUserInput,
  type User,
  type UserWithCredentials,
} from '../domain/user.entity.js';
import type { UserRepository } from '../domain/user.repository.port.js';

/**
 * The only code in the system that reads or writes the users table. The Prisma
 * row shape stops here: callers receive domain entities.
 */
@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: CorePrismaService) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByEmailWithCredentials(
    email: string,
  ): Promise<UserWithCredentials | null> {
    const row = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
    });

    return row
      ? { ...this.toDomain(row), passwordHash: row.passwordHash }
      : null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const row = await this.prisma.user.create({
      data: {
        email: normalizeEmail(input.email),
        passwordHash: input.passwordHash,
        displayName: input.displayName,
      },
    });

    return this.toDomain(row);
  }

  private toDomain(row: PrismaUser): User {
    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      // The Prisma enum and the domain union carry identical members; the
      // generated type is the infrastructure detail being mapped away here.
      role: row.role as UserRole,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

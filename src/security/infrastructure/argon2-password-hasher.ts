import { Injectable, Logger } from '@nestjs/common';
import argon2 from 'argon2';
import type { PasswordHasher } from '../domain/password-hasher.port.js';

/**
 * Argon2id with parameters above the OWASP minimum (19 MiB, 2 iterations).
 * Argon2 embeds its parameters in the encoded hash, so raising these later
 * keeps existing hashes verifiable.
 */
@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  private readonly logger = new Logger(Argon2PasswordHasher.name);

  private readonly options = {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  } as const;

  async hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, this.options);
  }

  async verify(hash: string, plainPassword: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plainPassword);
    } catch (error) {
      // A malformed stored hash must read as "wrong password", never as an
      // error that could distinguish accounts for an attacker.
      this.logger.warn(
        `Password verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}

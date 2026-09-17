import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  assertOwnership,
  type AuthenticatedUser,
} from '../../security/domain/authenticated-user.js';
import type {
  ShoppingSession,
  ShoppingSessionItem,
} from '../domain/shopping-session.entity.js';
import {
  SHOPPING_SESSION_REPOSITORY,
  type ShoppingSessionRepository,
} from '../domain/shopping-session.repository.port.js';

/** The one way use cases load a trip: it must exist and belong to the caller. */
@Injectable()
export class ShoppingSessionAccess {
  constructor(
    @Inject(SHOPPING_SESSION_REPOSITORY)
    private readonly sessions: ShoppingSessionRepository,
  ) {}

  async loadOwned(
    sessionId: string,
    actor: AuthenticatedUser,
  ): Promise<ShoppingSession> {
    const session = await this.sessions.findById(sessionId);

    if (!session) {
      throw new NotFoundException('Shopping session not found');
    }

    assertOwnership(session.ownerId, actor);
    return session;
  }

  loadItem(session: ShoppingSession, itemId: string): ShoppingSessionItem {
    const item = session.items.find((candidate) => candidate.id === itemId);

    if (!item) {
      throw new NotFoundException('Shopping session item not found');
    }

    return item;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import type { ShoppingSessionStatus } from '../domain/shopping-session.entity.js';
import {
  SHOPPING_SESSION_REPOSITORY,
  type ShoppingSessionRepository,
} from '../domain/shopping-session.repository.port.js';
import {
  ShoppingSessionViewBuilder,
  type ShoppingSessionView,
} from './shopping-session-view.js';

/** The caller's own trips, newest first, optionally narrowed to one status. */
@Injectable()
export class ListShoppingSessionsUseCase {
  constructor(
    @Inject(SHOPPING_SESSION_REPOSITORY)
    private readonly sessions: ShoppingSessionRepository,
    private readonly views: ShoppingSessionViewBuilder,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    filter: { status?: ShoppingSessionStatus; skip: number; take: number },
  ): Promise<{ views: ShoppingSessionView[]; totalItems: number }> {
    const { sessions, totalItems } = await this.sessions.findByOwner(
      actor.id,
      filter,
    );

    const views = await Promise.all(
      sessions.map((session) => this.views.build(session)),
    );

    return { views, totalItems };
  }
}

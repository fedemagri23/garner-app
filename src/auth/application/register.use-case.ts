import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { EventBus } from '../../common/events/event-bus.js';
import { createDomainEvent } from '../../common/events/domain-event.js';
import {
  DomainEventName,
  type UserCreatedEvent,
} from '../../common/events/event-catalog.js';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../security/domain/password-hasher.port.js';
import { normalizeEmail } from '../../users/domain/user.entity.js';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/user.repository.port.js';
import { IssueTokenPairService } from './issue-token-pair.service.js';
import type { TokenPair } from './token-pair.js';

export interface RegisterCommand {
  email: string;
  password: string;
  displayName: string;
}

@Injectable()
export class RegisterUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly issueTokens: IssueTokenPairService,
    private readonly events: EventBus,
  ) {}

  async execute(command: RegisterCommand): Promise<TokenPair> {
    const email = normalizeEmail(command.email);

    const existing = await this.users.findByEmailWithCredentials(email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await this.hasher.hash(command.password);
    const user = await this.users.create({
      email,
      passwordHash,
      displayName: command.displayName,
    });

    const event: UserCreatedEvent = createDomainEvent(
      DomainEventName.UserCreated,
      { userId: user.id, email: user.email },
    );
    await this.events.publish(event);

    return this.issueTokens.issue({
      id: user.id,
      email: user.email,
      role: user.role,
    });
  }
}

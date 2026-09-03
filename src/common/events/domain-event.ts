/**
 * A domain event is a business fact that has already happened — not a database
 * action and not a command. Publishing one states that something is true;
 * whether anyone reacts is the subscriber's concern.
 */
export interface DomainEvent<TName extends string = string, TPayload = unknown> {
  readonly name: TName;
  readonly occurredAt: Date;
  readonly payload: TPayload;
}

export function createDomainEvent<TName extends string, TPayload>(
  name: TName,
  payload: TPayload,
): DomainEvent<TName, TPayload> {
  return { name, payload, occurredAt: new Date() };
}

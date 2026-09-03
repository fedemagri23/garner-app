import { EventBus } from './event-bus.js';
import { createDomainEvent } from './domain-event.js';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('delivers an event to every subscriber of that name', async () => {
    const received: string[] = [];
    bus.subscribe('UserCreated', () => void received.push('first'));
    bus.subscribe('UserCreated', () => void received.push('second'));

    await bus.publish(createDomainEvent('UserCreated', { userId: 'u1' }));

    expect(received).toEqual(['first', 'second']);
  });

  it('does not deliver an event to subscribers of a different name', async () => {
    const handler = jest.fn();
    bus.subscribe('ShoppingListCreated', handler);

    await bus.publish(createDomainEvent('UserCreated', { userId: 'u1' }));

    expect(handler).not.toHaveBeenCalled();
  });

  it('isolates a throwing handler so other subscribers still run', async () => {
    const healthy = jest.fn();
    bus.subscribe('UserCreated', () => {
      throw new Error('subscriber exploded');
    });
    bus.subscribe('UserCreated', healthy);

    // The publisher must not see the failure: the fact already happened, and a
    // broken consumer cannot be allowed to roll back the business operation.
    await expect(
      bus.publish(createDomainEvent('UserCreated', { userId: 'u1' })),
    ).resolves.toBeUndefined();
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it('awaits asynchronous handlers before resolving', async () => {
    let settled = false;
    bus.subscribe('UserCreated', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      settled = true;
    });

    await bus.publish(createDomainEvent('UserCreated', { userId: 'u1' }));

    expect(settled).toBe(true);
  });

  it('stops delivering after unsubscribe', async () => {
    const handler = jest.fn();
    const unsubscribe = bus.subscribe('UserCreated', handler);

    unsubscribe();
    await bus.publish(createDomainEvent('UserCreated', { userId: 'u1' }));

    expect(handler).not.toHaveBeenCalled();
  });

  it('publishing with no subscribers is not an error', async () => {
    await expect(
      bus.publish(createDomainEvent('UserCreated', { userId: 'u1' })),
    ).resolves.toBeUndefined();
  });
});

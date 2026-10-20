import { ExpoPushSender } from './expo-push-sender.js';

const message = (to: string) => ({ to, title: 'T', body: 'B', data: { productId: 'p1' } });

const answering = (body: unknown, status = 200) =>
  jest.fn(async () => new Response(JSON.stringify(body), { status }));

describe('ExpoPushSender', () => {
  it('posts the messages as JSON and reads one outcome per message', async () => {
    const fetchImpl = answering({
      data: [
        { status: 'ok', id: 'a' },
        { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
        { status: 'error', message: 'slow down', details: { error: 'MessageRateExceeded' } },
      ],
    });
    const sender = new ExpoPushSender('https://push.test/send', 'secret', fetchImpl as unknown as typeof fetch);

    const outcomes = await sender.send([message('t1'), message('t2'), message('t3')]);

    expect(outcomes).toEqual([
      { token: 't1', status: 'ok' },
      { token: 't2', status: 'invalid' },
      { token: 't3', status: 'error', message: 'slow down' },
    ]);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://push.test/send');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret');
    expect(JSON.parse(init.body as string)[0]).toMatchObject({ to: 't1', title: 'T', data: { productId: 'p1' } });
  });

  it('sends no authorization header without an access token', async () => {
    const fetchImpl = answering({ data: [{ status: 'ok' }] });

    await new ExpoPushSender('https://push.test/send', null, fetchImpl as unknown as typeof fetch).send([message('t1')]);

    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).not.toHaveProperty('authorization');
  });

  it('splits more than a hundred messages into batches', async () => {
    const fetchImpl = jest.fn(async (_url: string, init: RequestInit) => {
      const sent = JSON.parse(init.body as string) as unknown[];
      return new Response(JSON.stringify({ data: sent.map(() => ({ status: 'ok' })) }));
    });
    const sender = new ExpoPushSender('https://push.test/send', null, fetchImpl as unknown as typeof fetch);

    const outcomes = await sender.send(Array.from({ length: 230 }, (_, i) => message(`t${i}`)));

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(outcomes).toHaveLength(230);
  });

  it('throws when the service is down or answers nonsense, so the send is retried', async () => {
    await expect(
      new ExpoPushSender('https://push.test/send', null, answering({}, 503) as unknown as typeof fetch).send([message('t1')]),
    ).rejects.toThrow('503');
    await expect(
      new ExpoPushSender('https://push.test/send', null, answering({ data: [] }) as unknown as typeof fetch).send([message('t1')]),
    ).rejects.toThrow('unexpected');
  });
});

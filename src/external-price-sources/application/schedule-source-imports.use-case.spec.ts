import type {
  ExternalPriceSource,
} from '../domain/external-price-source.entity.js';
import type {
  ExternalPriceSourceRepository,
  ImportRunRepository,
} from '../domain/external-price-source.repository.port.js';
import type { ImportJobs } from '../domain/import-jobs.port.js';
import { ScheduleSourceImportsUseCase } from './schedule-source-imports.use-case.js';

const source = (
  overrides: Partial<ExternalPriceSource> & { id: string },
): ExternalPriceSource => ({
  name: 'Source',
  slug: 'source',
  supermarketId: 'chain-1',
  adapterKey: 'json-http',
  isEnabled: true,
  scheduleHourUtc: 8,
  config: {},
  lastRunAt: null,
  lastSuccessfulRunAt: null,
  lastStatus: null,
  consecutiveFailures: 0,
  ...overrides,
});

describe('ScheduleSourceImportsUseCase', () => {
  let sources: { findEnabled: jest.Mock };
  let runs: { findLastRunKey: jest.Mock };
  let jobs: jest.Mocked<ImportJobs>;
  let useCase: ScheduleSourceImportsUseCase;

  beforeEach(() => {
    sources = { findEnabled: jest.fn().mockResolvedValue([]) };
    runs = { findLastRunKey: jest.fn().mockResolvedValue(null) };
    jobs = { enqueueImport: jest.fn() };

    useCase = new ScheduleSourceImportsUseCase(
      sources as unknown as ExternalPriceSourceRepository,
      runs as unknown as ImportRunRepository,
      jobs,
    );
  });

  const at = (iso: string) => new Date(iso);

  it('queues one job per due source, so one failure cannot block the others', async () => {
    sources.findEnabled.mockResolvedValue([
      source({ id: 'a' }),
      source({ id: 'b' }),
    ]);

    await expect(useCase.execute(at('2026-09-24T08:05:00Z'))).resolves.toBe(2);
    expect(jobs.enqueueImport.mock.calls).toEqual([
      ['a', '2026-09-24'],
      ['b', '2026-09-24'],
    ]);
  });

  it('leaves a source alone until its own hour', async () => {
    sources.findEnabled.mockResolvedValue([source({ id: 'late', scheduleHourUtc: 20 })]);

    await expect(useCase.execute(at('2026-09-24T09:00:00Z'))).resolves.toBe(0);
    expect(jobs.enqueueImport).not.toHaveBeenCalled();
  });

  it('does not queue a source that already ran today', async () => {
    sources.findEnabled.mockResolvedValue([source({ id: 'a' })]);
    runs.findLastRunKey.mockResolvedValue('2026-09-24');

    await expect(useCase.execute(at('2026-09-24T12:00:00Z'))).resolves.toBe(0);
  });

  it('catches up a day missed while the system was down', async () => {
    sources.findEnabled.mockResolvedValue([source({ id: 'a' })]);
    runs.findLastRunKey.mockResolvedValue('2026-09-22');

    await expect(useCase.execute(at('2026-09-24T23:00:00Z'))).resolves.toBe(1);
    expect(jobs.enqueueImport).toHaveBeenCalledWith('a', '2026-09-24');
  });
});

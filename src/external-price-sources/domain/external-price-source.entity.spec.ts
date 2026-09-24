import { dailyRunKey, isImportDue } from './external-price-source.entity.js';

describe('dailyRunKey', () => {
  it('is the UTC day, so one slot covers one day', () => {
    expect(dailyRunKey(new Date('2026-09-24T23:30:00Z'))).toBe('2026-09-24');
  });
});

describe('isImportDue', () => {
  const source = { isEnabled: true, scheduleHourUtc: 8 };
  const at = (iso: string) => new Date(iso);

  it('is not due before the source’s hour', () => {
    expect(isImportDue(source, null, at('2026-09-24T07:59:00Z'))).toBe(false);
  });

  it('is due once the hour has come and today has not run', () => {
    expect(isImportDue(source, null, at('2026-09-24T08:00:00Z'))).toBe(true);
    expect(isImportDue(source, '2026-09-23', at('2026-09-24T09:00:00Z'))).toBe(true);
  });

  it('is not due again once today has run', () => {
    expect(isImportDue(source, '2026-09-24', at('2026-09-24T09:00:00Z'))).toBe(false);
  });

  it('still catches up later in the day after an outage over the hour', () => {
    expect(isImportDue(source, '2026-09-23', at('2026-09-24T18:00:00Z'))).toBe(true);
  });

  it('never runs a disabled source', () => {
    expect(
      isImportDue({ ...source, isEnabled: false }, null, at('2026-09-24T09:00:00Z')),
    ).toBe(false);
  });

  it('respects a source that publishes later in the day', () => {
    const lateSource = { isEnabled: true, scheduleHourUtc: 20 };

    expect(isImportDue(lateSource, null, at('2026-09-24T09:00:00Z'))).toBe(false);
    expect(isImportDue(lateSource, null, at('2026-09-24T20:30:00Z'))).toBe(true);
  });
});

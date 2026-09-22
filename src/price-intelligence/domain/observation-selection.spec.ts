import {
  selectUsableObservations,
  type SelectableObservation,
} from './observation-selection.js';

const observation = (
  overrides: Partial<SelectableObservation> & { id: string },
): SelectableObservation => ({
  priceCents: 125,
  observedAt: new Date('2026-09-22T12:00:00Z'),
  sourceType: 'USER_REPORTED',
  status: 'ACCEPTED',
  userId: 'user-1',
  ...overrides,
});

const ids = (observations: SelectableObservation[]) =>
  observations.map((observation) => observation.id);

describe('selectUsableObservations', () => {
  it('uses accepted observations', () => {
    const selection = selectUsableObservations([observation({ id: 'a' })]);

    expect(ids(selection.usable)).toEqual(['a']);
    expect(selection.quarantined).toEqual([]);
  });

  it('never uses a rejected observation', () => {
    const selection = selectUsableObservations([
      observation({ id: 'rejected', status: 'REJECTED' }),
      observation({ id: 'ok' }),
    ]);

    expect(ids(selection.usable)).toEqual(['ok']);
    expect(ids(selection.quarantined)).toEqual(['rejected']);
  });

  it('holds back a flagged observation nobody else saw', () => {
    const selection = selectUsableObservations([
      observation({ id: 'flagged', status: 'FLAGGED', userId: 'newcomer' }),
      observation({ id: 'other', userId: 'user-2' }),
    ]);

    expect(ids(selection.quarantined)).toEqual(['flagged']);
  });

  it('releases a flagged observation two other contributors agree with', () => {
    const selection = selectUsableObservations([
      observation({ id: 'flagged', status: 'FLAGGED', userId: 'newcomer', priceCents: 130 }),
      observation({ id: 'a', userId: 'user-2', priceCents: 125 }),
      observation({ id: 'b', userId: 'user-3', priceCents: 128 }),
    ]);

    expect(ids(selection.usable)).toEqual(['flagged', 'a', 'b']);
    expect(selection.quarantined).toEqual([]);
  });

  it('does not let one contributor confirm their own flagged report', () => {
    const selection = selectUsableObservations([
      observation({ id: 'flagged', status: 'FLAGGED', userId: 'spammer' }),
      observation({ id: 'same-1', userId: 'spammer' }),
      observation({ id: 'same-2', userId: 'spammer' }),
    ]);

    expect(ids(selection.quarantined)).toEqual(['flagged']);
  });

  it('does not count agreement at a far-off price', () => {
    const selection = selectUsableObservations([
      observation({ id: 'flagged', status: 'FLAGGED', userId: 'newcomer', priceCents: 1000 }),
      observation({ id: 'a', userId: 'user-2', priceCents: 125 }),
      observation({ id: 'b', userId: 'user-3', priceCents: 128 }),
    ]);

    expect(ids(selection.quarantined)).toEqual(['flagged']);
  });
});

import { isOpenAt, parseWallClock } from './opening-hours.js';

/** A local-time date, so the test reads in the same zone the rule does. */
const at = (day: number, hour: number, minute = 0): Date => {
  // 2026-09-13 is a Sunday, so adding `day` lands on that weekday.
  const date = new Date(2026, 8, 13 + day, hour, minute);
  expect(date.getDay()).toBe(day);
  return date;
};

describe('parseWallClock', () => {
  it('reads minutes since midnight', () => {
    expect(parseWallClock('09:30')).toBe(570);
    expect(parseWallClock('00:00')).toBe(0);
  });

  it('rejects impossible and malformed times', () => {
    expect(parseWallClock('24:00')).toBeNull();
    expect(parseWallClock('09:60')).toBeNull();
    expect(parseWallClock('9:30')).toBeNull();
  });
});

describe('isOpenAt', () => {
  const weekday = [{ dayOfWeek: 1, opensAt: '09:00', closesAt: '21:00' }];

  it('is open inside the interval', () => {
    expect(isOpenAt(weekday, at(1, 10))).toBe(true);
  });

  it('is closed before opening and at closing time', () => {
    expect(isOpenAt(weekday, at(1, 8, 59))).toBe(false);
    expect(isOpenAt(weekday, at(1, 21))).toBe(false);
  });

  it('is closed on a day with no interval', () => {
    expect(isOpenAt(weekday, at(0, 10))).toBe(false);
  });

  it('handles a midday closure as two intervals', () => {
    const split = [
      { dayOfWeek: 2, opensAt: '09:00', closesAt: '13:00' },
      { dayOfWeek: 2, opensAt: '17:00', closesAt: '21:00' },
    ];

    expect(isOpenAt(split, at(2, 12))).toBe(true);
    expect(isOpenAt(split, at(2, 15))).toBe(false);
    expect(isOpenAt(split, at(2, 18))).toBe(true);
  });

  it('stays open past midnight into the next day', () => {
    const lateNight = [{ dayOfWeek: 5, opensAt: '22:00', closesAt: '02:00' }];

    expect(isOpenAt(lateNight, at(5, 23))).toBe(true);
    expect(isOpenAt(lateNight, at(6, 1))).toBe(true);
    expect(isOpenAt(lateNight, at(6, 3))).toBe(false);
  });

  it('treats a store with no hours on record as closed', () => {
    expect(isOpenAt([], at(1, 12))).toBe(false);
  });
});

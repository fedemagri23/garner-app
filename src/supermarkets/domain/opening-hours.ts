/**
 * Opening hours, as intervals on a weekday.
 *
 * A store closed for lunch has two intervals that day; a store closed all day
 * has none. An interval whose end is not after its start is read as running
 * past midnight (22:00–02:00), which is how late-night stores are expressed.
 */
export interface OpeningInterval {
  /** 0 = Sunday … 6 = Saturday, matching `Date#getDay`. */
  dayOfWeek: number;
  /** Local wall-clock `HH:MM`. */
  opensAt: string;
  closesAt: string;
}

const MINUTES_PER_DAY = 24 * 60;

/** `HH:MM` to minutes since midnight, or null when malformed. */
export function parseWallClock(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

/**
 * Whether `at` falls inside one of the store's intervals.
 *
 * `at` is read in the runtime's local time, deliberately: opening hours are
 * wall-clock facts about a place, and phase 6 adds the per-store timezone that
 * makes this exact for stores outside the server's zone.
 */
export function isOpenAt(intervals: OpeningInterval[], at: Date): boolean {
  const day = at.getDay();
  const minutes = at.getHours() * 60 + at.getMinutes();
  const previousDay = (day + 6) % 7;

  return intervals.some((interval) => {
    const opens = parseWallClock(interval.opensAt);
    const closes = parseWallClock(interval.closesAt);

    if (opens === null || closes === null) {
      return false;
    }

    if (closes > opens) {
      return interval.dayOfWeek === day && minutes >= opens && minutes < closes;
    }

    // Wraps past midnight: the evening part belongs to its own day, the
    // small-hours part to the next one.
    const wrappedClose = closes + MINUTES_PER_DAY;

    if (interval.dayOfWeek === day && minutes >= opens) {
      return true;
    }

    return (
      interval.dayOfWeek === previousDay &&
      minutes + MINUTES_PER_DAY < wrappedClose
    );
  });
}

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

/** Where a store is assumed to be when nobody said otherwise. */
export const DEFAULT_STORE_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The weekday and minutes since midnight on the wall clocks of `timeZone`. */
function wallClock(at: Date, timeZone: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  return {
    day: WEEKDAYS.indexOf(part('weekday')),
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
  };
}

/**
 * Whether `at` falls inside one of the store's intervals.
 *
 * Opening hours are wall-clock facts about a place, so `at` is read on the
 * clocks of the store's own time zone: 21:00 in Vienna is not 21:00 in
 * Buenos Aires, whatever zone the server runs in.
 */
export function isOpenAt(
  intervals: OpeningInterval[],
  at: Date,
  timeZone: string,
): boolean {
  const { day, minutes } = wallClock(at, timeZone);
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

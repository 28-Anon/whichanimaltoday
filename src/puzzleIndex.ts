const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Anything carrying the daily-rotation flag. */
export interface DailyCandidate {
  /** Absent means eligible. Only ever written as `false`. */
  dailyEligible?: boolean;
}

/**
 * The animals allowed to appear as a daily puzzle.
 *
 * Some animals cannot be a daily puzzle because no clue makes a player produce
 * their name — Chowsingha, Ibisbill, Bald Uacari. Those are not hard puzzles,
 * they are guaranteed losses, and a loss ends a streak.
 *
 * Timer mode deliberately keeps using the unfiltered list: it is multiple
 * choice, so spelling never arises and an unspellable animal is still a fair
 * question there. `scripts/orderAnimals.ts` writes the excluded ones after the
 * eligible ones, so filtering here never disturbs an already-played day.
 */
export function selectDailyAnimals<T extends DailyCandidate>(
  animals: readonly T[]
): T[] {
  return animals.filter((animal) => animal.dailyEligible !== false);
}

function utcDayNumber(date: Date): number {
  const utcMidnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  return Math.floor(utcMidnight / MS_PER_DAY);
}

export function getDaysSinceLaunch(today: Date, launchDate: Date): number {
  return utcDayNumber(today) - utcDayNumber(launchDate);
}

export function getTodayPuzzleIndex(
  today: Date,
  launchDate: Date,
  listLength: number
): number {
  if (listLength <= 0) {
    throw new Error("listLength must be greater than 0");
  }
  const daysSinceLaunch = getDaysSinceLaunch(today, launchDate);
  return ((daysSinceLaunch % listLength) + listLength) % listLength;
}

/**
 * Milliseconds until the next puzzle. Puzzles roll over at UTC midnight —
 * `getTodayPuzzleIndex` counts UTC days — so this must work off UTC and not
 * the visitor's local midnight, or the countdown would be wrong by the
 * viewer's timezone offset.
 *
 * At exactly midnight this returns a full day rather than zero: the puzzle
 * that just appeared is today's, and the next one is 24 hours out.
 */
export function msUntilNextUtcMidnight(now: Date): number {
  // Day + 1 overflows correctly into the next month or year; Date.UTC
  // normalises it.
  const nextMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  );
  return nextMidnight - now.getTime();
}

/** A duration as `HH:MM:SS`, floored to the second and never negative. */
export function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

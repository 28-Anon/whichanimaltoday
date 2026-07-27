const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

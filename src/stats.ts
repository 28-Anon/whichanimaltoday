import type { DailyResult } from "./gameState";

export interface Stats {
  played: number;
  wins: number;
  /** Integer 0-100. 0 when nothing has been played. */
  winPercent: number;
  currentStreak: number;
  maxStreak: number;
  /** Wins on guess 1, 2, and 3 respectively. */
  distribution: [number, number, number];
  /** Days that offered a bonus round and were played. */
  bonusRounds: number;
  /** Of those, the ones the player got right. */
  bonusHits: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days since the epoch for a YYYY-MM-DD UTC date string. */
function dayNumber(date: string): number {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / MS_PER_DAY);
}

export function computeStats(history: DailyResult[], today: string): Stats {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));

  const played = sorted.length;
  const wins = sorted.filter((entry) => entry.solved).length;
  const winPercent = played === 0 ? 0 : Math.round((wins / played) * 100);

  const distribution: [number, number, number] = [0, 0, 0];
  for (const entry of sorted) {
    if (entry.solved && entry.guessesUsed >= 1 && entry.guessesUsed <= 3) {
      distribution[entry.guessesUsed - 1] += 1;
    }
  }

  // Walk the history once, tracking the run of solved entries on
  // consecutive calendar days. `run` ends up holding the streak that
  // terminates at the most recent entry.
  let maxStreak = 0;
  let run = 0;
  let previous: DailyResult | null = null;
  for (const entry of sorted) {
    if (!entry.solved) {
      run = 0;
    } else if (
      previous !== null &&
      previous.solved &&
      dayNumber(entry.date) - dayNumber(previous.date) === 1
    ) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > maxStreak) maxStreak = run;
    previous = entry;
  }

  // A streak is only alive if the player has actually shown up recently.
  // Nothing is written on days they don't play, so absence has to be
  // detected by comparing against today rather than by a stored counter.
  let currentStreak = 0;
  const last = played === 0 ? null : sorted[played - 1];
  if (last !== null && last.solved) {
    const gap = dayNumber(today) - dayNumber(last.date);
    if (gap === 0 || gap === 1) currentStreak = run;
  }

  // Only the two known values count, so a hand-edited storage value can
  // neither inflate the tally nor throw.
  let bonusRounds = 0;
  let bonusHits = 0;
  for (const entry of sorted) {
    if (entry.bonus === "hit") {
      bonusRounds += 1;
      bonusHits += 1;
    } else if (entry.bonus === "miss") {
      bonusRounds += 1;
    }
  }

  return {
    played,
    wins,
    winPercent,
    currentStreak,
    maxStreak,
    distribution,
    bonusRounds,
    bonusHits,
  };
}

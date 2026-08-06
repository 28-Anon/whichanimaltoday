/**
 * Deciding which animal appears on which day.
 *
 * The list used to be in acceptance order, which is how it came to hold 24
 * consecutive obscure puzzles: `acceptCandidates.ts` appends, so every batch
 * lands as a block. This lays the calendar out deliberately instead.
 *
 * Tiers measure **nameability**, not strangeness. A platypus is a hard puzzle
 * whose clues lead you to a word you can type; an animal whose name nobody can
 * produce is not a hard puzzle but a guaranteed loss, and those are excluded
 * from the daily rotation entirely rather than tiered.
 *
 * Pure and deterministic: the result is baked into `data/animals.json` at build
 * time by `scripts/orderAnimals.ts`, so the client keeps indexing an array by
 * day and needs no knowledge of any of this.
 */

export type Difficulty = "easy" | "medium" | "hard";

export interface Orderable {
  commonName: string;
  difficulty: Difficulty;
  /** Absent means eligible. Only ever written as `false`. */
  dailyEligible?: boolean;
}

/**
 * One week: three easy, three medium, one hard.
 *
 * Six winnable days to one hard one. Because it repeats every seven days, a
 * given slot always lands on the same weekday — the hard slot is anchored to
 * Saturday, when players have more time. That is intentional, in the way the
 * NYT crossword hardens through the week.
 */
export const WEEK_PATTERN: readonly Difficulty[] = [
  "easy",
  "medium",
  "easy",
  "hard",
  "medium",
  "easy",
  "medium",
] as const;

/**
 * Which tier to reach for when the wanted one is empty, nearest first.
 *
 * Easy falls to medium before hard, and hard falls to medium before easy, so a
 * substitution moves the day's difficulty as little as possible.
 */
const FALLBACK: Record<Difficulty, readonly Difficulty[]> = {
  easy: ["easy", "medium", "hard"],
  medium: ["medium", "easy", "hard"],
  hard: ["hard", "medium", "easy"],
};

/**
 * Orders a pool of animals into a calendar, starting the weekly pattern at
 * `startSlot`.
 *
 * `startSlot` exists because already-played puzzles stay where they are: the
 * pattern has to resume at the right point past them, or the hard day would
 * drift to a different weekday every time the file is reordered.
 *
 * Never throws and never drops an animal. A pattern that cannot be satisfied
 * degrades to the nearest available tier, because a content script that fails
 * on a Saturday for want of a hard animal is worse than one that serves a
 * medium.
 */
export function layOutPuzzles<T extends Orderable>(
  pool: readonly T[],
  startSlot: number
): T[] {
  const queues: Record<Difficulty, T[]> = { easy: [], medium: [], hard: [] };
  for (const animal of pool) {
    queues[animal.difficulty].push(animal);
  }

  const week = WEEK_PATTERN.length;
  const offset = ((startSlot % week) + week) % week;

  const ordered: T[] = [];
  let previous: Difficulty | null = null;

  for (let index = 0; index < pool.length; index++) {
    const remaining = pool.length - index;
    const wanted = WEEK_PATTERN[(offset + index) % week];
    const available: Difficulty[] = FALLBACK[wanted].filter(
      (tier) => queues[tier].length > 0
    );

    // Following the pattern greedily spends the easy and medium piles first and
    // leaves the hard ones stacked at the end, adjacent to each other.
    //
    // So look ahead by one: skipping this slot leaves `remaining - 1` slots,
    // into which at most every other one can be hard. If the pile is larger
    // than that, skipping makes adjacency unavoidable and the hard day has to
    // go now. Anything less urgent defers to the pattern — testing `>=` against
    // the current slot instead pulled hard days forward a day early near the
    // end of the list, off their weekday.
    const hardMustGoNow =
      previous !== "hard" &&
      queues.hard.length > Math.ceil((remaining - 1) / 2);

    let chosen: Difficulty;
    if (hardMustGoNow) {
      chosen = "hard";
    } else {
      const allowed: Difficulty[] =
        previous === "hard"
          ? available.filter((tier) => tier !== "hard")
          : available;
      // `available[0]` is the last resort: when only hard animals remain, two
      // hard days in a row beats dropping one.
      chosen = allowed[0] ?? available[0];
    }

    ordered.push(queues[chosen].shift() as T);
    previous = chosen;
  }

  return ordered;
}

/** Where the single hard day sits inside `WEEK_PATTERN`. */
const HARD_SLOT = WEEK_PATTERN.indexOf("hard");

/**
 * The `startSlot` that lands every hard day on a chosen weekday.
 *
 * Without this the anchor falls wherever the already-played prefix happens to
 * end, which moves the hard day to a different weekday every time animals are
 * added — the first run put it on a Tuesday purely because six puzzles had been
 * served. Which weekday the hard day occupies is a product decision, so it
 * should be stated rather than inherited from a count.
 *
 * Days are 0 = Sunday, matching `Date.getUTCDay()`.
 */
export function startSlotForTargetWeekday(
  frozenCount: number,
  launchDayOfWeek: number,
  targetDayOfWeek: number
): number {
  const week = WEEK_PATTERN.length;
  // Puzzle index k falls on weekday (launchDayOfWeek + k) % 7, and the layout
  // starts at index `frozenCount`, so the offset has to cancel both.
  const slot = HARD_SLOT + frozenCount + launchDayOfWeek - targetDayOfWeek;
  return ((slot % week) + week) % week;
}

// `selectDailyAnimals` deliberately lives in src/puzzleIndex.ts, not here: it
// is the only part of this the browser needs, and puzzleIndex is already in the
// Framer codegen list. Putting it here would copy the whole build-time layout
// into the pasted component to no purpose.

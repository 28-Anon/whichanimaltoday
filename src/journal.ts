import type { DailyResult } from "./gameState";

export type JournalState = "starred" | "identified" | "missed";

export interface ArchivedAnimal {
  puzzleNumber: number;
  date: string;
  slug: string;
  commonName: string;
  species?: string;
  imageUrl: string;
}

export interface JournalEntry {
  date: string;
  puzzleNumber: number;
  commonName: string;
  species?: string;
  imageUrl: string;
  slug: string;
  state: JournalState;
}

export interface JournalSummary {
  entries: JournalEntry[];
  /** Includes starred entries — a star is an identification plus extra. */
  identified: number;
  starred: number;
  total: number;
}

/**
 * Joins what was featured (the archive) with what the player solved (local
 * history) on DATE.
 *
 * Date, never `puzzleNumber` arithmetic: `getTodayPuzzleIndex` wraps modulo
 * the animal list length, so adding a single animal would re-map every past
 * day and silently rewrite this journal with the wrong creatures. The archive
 * is a record of what actually happened and stays true as the list grows.
 *
 * This function only ever reads. The history it consumes lives under the key
 * holding the player's streak and stats, and `loadState` maps an unrecognised
 * version to an empty history — so a write from here could erase the very
 * record the journal exists to display.
 */
export function buildJournal(
  archive: ArchivedAnimal[],
  history: DailyResult[],
  today?: ArchivedAnimal
): JournalSummary {
  const empty: JournalSummary = { entries: [], identified: 0, starred: 0, total: 0 };
  if (history.length === 0) return empty;

  const byDate = new Map(history.map((entry) => [entry.date, entry]));

  // `runDailyArchive` writes the *previous* day at 00:15 UTC, so `archive`
  // never contains today. Without this a player solved today's puzzle, opened
  // the journal, and found nothing new — at exactly the moment the feature
  // exists to hook them, and on a new player's very first visit.
  //
  // Three conditions, each load-bearing:
  //
  // - `today` is supplied. Callers without it get the previous behaviour
  //   exactly, so nothing that only has an archive has to change.
  // - The player has a result for that date. A day still in progress is not a
  //   day they failed, and including it would stamp it "missed" hours early.
  // - The archive does not already cover the date. Tomorrow the job writes the
  //   real entry; keying on date collapses the two rather than showing the day
  //   twice, and the archive wins because it is the authoritative record of
  //   what was actually featured.
  const covered = new Set(archive.map((animal) => animal.date));
  const featured =
    today && byDate.has(today.date) && !covered.has(today.date)
      ? [...archive, today]
      : archive;

  // Days before the player's first play are not gaps they failed to fill,
  // and a wall of grey is a bleak first impression for a newcomer.
  const firstPlayed = history
    .map((entry) => entry.date)
    .reduce((earliest, date) => (date < earliest ? date : earliest));

  const entries: JournalEntry[] = featured
    .filter((animal) => animal.date >= firstPlayed)
    .map((animal) => {
      const result = byDate.get(animal.date);

      // A bonus miss is still an identification. The bonus is additive by
      // design and must never cost the player the entry.
      const state: JournalState = !result?.solved
        ? "missed"
        : result.bonus === "hit"
          ? "starred"
          : "identified";

      return {
        date: animal.date,
        puzzleNumber: animal.puzzleNumber,
        commonName: animal.commonName,
        ...(animal.species ? { species: animal.species } : {}),
        imageUrl: animal.imageUrl,
        slug: animal.slug,
        state,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    entries,
    identified: entries.filter((e) => e.state !== "missed").length,
    starred: entries.filter((e) => e.state === "starred").length,
    total: entries.length,
  };
}

import { computeStats, type Stats } from "./stats";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface DailyResult {
  date: string;
  puzzleNumber: number;
  solved: boolean;
  guessesUsed: number;
  /**
   * Absent when the day offered no bonus round. Deliberately does NOT bump
   * SCHEMA_VERSION: `loadState` maps an unrecognised version to an empty
   * history, so a bump would wipe every existing player's stats. An optional
   * field is read correctly by the v2 loader, and a pre-bonus entry having no
   * value here is accurate rather than missing.
   */
  bonus?: "hit" | "miss";
}

const SCHEMA_VERSION = 2;
const STORAGE_KEY = "whichanimaltoday_state";

interface StoredStateV2 {
  version: 2;
  history: DailyResult[];
}

/** The pre-2026-07-29 shape, read only during migration. */
interface StoredStateV1 {
  lastResult: DailyResult | null;
  currentStreak: number;
}

function emptyState(): StoredStateV2 {
  return { version: SCHEMA_VERSION, history: [] };
}

/**
 * A malformed entry (e.g. `null`, or missing/mistyped fields) would
 * otherwise pass the `Array.isArray` check below and then throw later
 * inside `computeStats` (`a.date.localeCompare`) — which, in the Framer
 * component, gets swallowed by the fetch `.catch` and bricks the game on
 * every load thereafter, since nothing ever clears the bad stored value.
 * Filtering here lets a corrupt value self-heal instead.
 */
function isWellFormedEntry(entry: unknown): entry is DailyResult {
  if (typeof entry !== "object" || entry === null) return false;
  const candidate = entry as Partial<DailyResult>;
  return (
    typeof candidate.date === "string" &&
    typeof candidate.solved === "boolean" &&
    typeof candidate.guessesUsed === "number"
  );
}

function loadState(storage: StorageLike): StoredStateV2 {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    // Storage can throw outright rather than return null: blocked cookies
    // and Safari private mode make even reading a SecurityError. Degrade to
    // an empty history so every stat reads zero.
    return emptyState();
  }
  if (!raw) return emptyState();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyState();
  }
  if (typeof parsed !== "object" || parsed === null) return emptyState();

  const candidate = parsed as Partial<StoredStateV2> & Partial<StoredStateV1>;

  if (candidate.version === SCHEMA_VERSION) {
    return Array.isArray(candidate.history)
      ? {
          version: SCHEMA_VERSION,
          history: candidate.history.filter(isWellFormedEntry),
        }
      : emptyState();
  }

  // v1 -> v2. `currentStreak` is deliberately dropped: the number is known
  // but the days that produced it are not, so it cannot become real
  // history. See spec §2 "Accepted loss".
  if ("lastResult" in candidate) {
    const last = candidate.lastResult;
    return { version: SCHEMA_VERSION, history: last ? [last] : [] };
  }

  return emptyState();
}

function saveState(storage: StorageLike, state: StoredStateV2): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded, or storage blocked entirely. Nothing to recover: the
    // player gets a fresh game on each load and their stats stay at zero.
    // Throwing here would crash the game the moment they finish a puzzle.
  }
}

export function getHistory(storage: StorageLike): DailyResult[] {
  return loadState(storage).history;
}

export function getLastResult(storage: StorageLike): DailyResult | null {
  const history = loadState(storage).history;
  if (history.length === 0) return null;
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  return sorted[sorted.length - 1];
}

export function getCurrentStreak(
  storage: StorageLike,
  today: string
): number {
  return computeStats(loadState(storage).history, today).currentStreak;
}

export function getStats(storage: StorageLike, today: string): Stats {
  return computeStats(loadState(storage).history, today);
}

export function recordResult(
  storage: StorageLike,
  result: DailyResult
): number {
  // Idempotent by date: re-recording the same day replaces that entry
  // rather than appending, so a double-fire can't inflate `played`.
  const history = loadState(storage).history.filter(
    (entry) => entry.date !== result.date
  );
  history.push(result);
  history.sort((a, b) => a.date.localeCompare(b.date));

  saveState(storage, { version: SCHEMA_VERSION, history });

  // The result being recorded is by definition today's.
  return computeStats(history, result.date).currentStreak;
}

export function hasPlayedToday(
  storage: StorageLike,
  today: string
): boolean {
  return loadState(storage).history.some((entry) => entry.date === today);
}

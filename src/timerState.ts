import type { StorageLike } from "./gameState";

/**
 * Deliberately a third key. Timer mode must never be able to reach the daily
 * history: `loadState` maps an unrecognised version to an empty history, so a
 * shared key means a schema change here could erase a player's streak.
 */
export const TIMER_STORAGE_KEY = "whichanimaltoday_timer";

interface TimerStore {
  best: number;
}

function load(storage: StorageLike): TimerStore {
  let raw: string | null;
  try {
    raw = storage.getItem(TIMER_STORAGE_KEY);
  } catch {
    // Storage can throw rather than return null — blocked cookies, private
    // mode. Degrade to "nothing played" rather than breaking the mode.
    return { best: 0 };
  }
  if (!raw) return { best: 0 };

  try {
    const parsed = JSON.parse(raw) as Partial<TimerStore>;
    return typeof parsed?.best === "number" && Number.isFinite(parsed.best)
      ? { best: parsed.best }
      : { best: 0 };
  } catch {
    return { best: 0 };
  }
}

export function getBestScore(storage: StorageLike): number {
  return load(storage).best;
}

export function recordRun(storage: StorageLike, score: number): number {
  const best = Math.max(load(storage).best, score);
  try {
    storage.setItem(TIMER_STORAGE_KEY, JSON.stringify({ best }));
  } catch {
    // Quota or blocked storage. The run still counts for this session; it
    // just will not survive a reload. Throwing here would end the run.
  }
  return best;
}

import { describe, it, expect } from "vitest";
import { getBestScore, recordRun, TIMER_STORAGE_KEY } from "./timerState";
import type { StorageLike } from "./gameState";

function memoryStorage(seed?: Record<string, string>): StorageLike {
  const map = new Map(Object.entries(seed ?? {}));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

describe("timerState", () => {
  it("uses a key separate from the daily game and preferences", () => {
    // The daily streak must be unreachable from timer mode. loadState maps an
    // unrecognised version to an empty history, so sharing a key risks wiping
    // a player's record.
    expect(TIMER_STORAGE_KEY).toBe("whichanimaltoday_timer");
    expect(TIMER_STORAGE_KEY).not.toBe("whichanimaltoday_state");
    expect(TIMER_STORAGE_KEY).not.toBe("whichanimaltoday_preferences");
  });

  it("reports zero before anything is played", () => {
    expect(getBestScore(memoryStorage())).toBe(0);
  });

  it("records a first run as the best", () => {
    const storage = memoryStorage();
    expect(recordRun(storage, 7)).toBe(7);
    expect(getBestScore(storage)).toBe(7);
  });

  it("keeps the higher score", () => {
    const storage = memoryStorage();
    recordRun(storage, 9);
    expect(recordRun(storage, 4)).toBe(9);
    expect(getBestScore(storage)).toBe(9);
  });

  it("survives a corrupt stored value instead of throwing", () => {
    expect(getBestScore(memoryStorage({ [TIMER_STORAGE_KEY]: "not json" }))).toBe(0);
    expect(getBestScore(memoryStorage({ [TIMER_STORAGE_KEY]: '{"best":"x"}' }))).toBe(0);
  });

  it("degrades to zero when storage throws outright", () => {
    // Blocked cookies and Safari private mode make even reading a
    // SecurityError — the same case src/gameState.ts already guards.
    const hostile: StorageLike = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };
    expect(getBestScore(hostile)).toBe(0);
    expect(() => recordRun(hostile, 5)).not.toThrow();
  });
});

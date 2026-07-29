import { describe, it, expect, beforeEach } from "vitest";
import {
  recordResult,
  getLastResult,
  getCurrentStreak,
  getHistory,
  hasPlayedToday,
  type StorageLike,
} from "./gameState";

const STORAGE_KEY = "whichanimaltoday_state";

function createFakeStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe("storage schema v2 migration", () => {
  let storage: StorageLike;

  beforeEach(() => {
    storage = createFakeStorage();
  });

  it("returns empty history when no key is present", () => {
    expect(getHistory(storage)).toEqual([]);
  });

  it("returns empty history when the stored value is not valid JSON", () => {
    storage.setItem(STORAGE_KEY, "{not json");
    expect(getHistory(storage)).toEqual([]);
  });

  it("returns empty history when the stored value is not an object", () => {
    storage.setItem(STORAGE_KEY, "42");
    expect(getHistory(storage)).toEqual([]);
  });

  it("reads a v2 value as-is", () => {
    const entry = {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 2,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, history: [entry] }));
    expect(getHistory(storage)).toEqual([entry]);
  });

  it("returns empty history when a v2 value has a non-array history", () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, history: "nope" }));
    expect(getHistory(storage)).toEqual([]);
  });

  it("migrates a v1 value by seeding history with its lastResult", () => {
    const lastResult = {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 3,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify({ lastResult, currentStreak: 7 }));
    expect(getHistory(storage)).toEqual([lastResult]);
  });

  it("migrates a v1 value with a null lastResult to empty history", () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ lastResult: null, currentStreak: 0 }));
    expect(getHistory(storage)).toEqual([]);
  });

  it("returns empty history when reading storage throws", () => {
    // Blocked cookies and Safari private mode make storage access itself
    // raise, not merely return null — so a null check is not enough.
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error("SecurityError: storage is not available");
      },
      setItem: () => {},
    };
    expect(getHistory(throwing)).toEqual([]);
  });
});

describe("gameState", () => {
  let storage: StorageLike;

  beforeEach(() => {
    storage = createFakeStorage();
  });

  it("returns null/0/false before anything has been recorded", () => {
    expect(getLastResult(storage)).toBeNull();
    expect(getCurrentStreak(storage, "2026-08-01")).toBe(0);
    expect(hasPlayedToday(storage, "2026-08-01")).toBe(false);
  });

  it("records a result and reports a streak of 1", () => {
    const streak = recordResult(storage, {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 2,
    });
    expect(streak).toBe(1);
    expect(hasPlayedToday(storage, "2026-08-01")).toBe(true);
    expect(getHistory(storage)).toHaveLength(1);
  });

  it("increments the streak on a solved result the next calendar day", () => {
    recordResult(storage, {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 2,
    });
    const streak = recordResult(storage, {
      date: "2026-08-02",
      puzzleNumber: 2,
      solved: true,
      guessesUsed: 1,
    });
    expect(streak).toBe(2);
  });

  it("returns the most recent entry from getLastResult", () => {
    recordResult(storage, {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 2,
    });
    recordResult(storage, {
      date: "2026-08-02",
      puzzleNumber: 2,
      solved: false,
      guessesUsed: 3,
    });
    expect(getLastResult(storage)?.date).toBe("2026-08-02");
  });

  it("reports a dead streak when the last played day is older than yesterday", () => {
    recordResult(storage, {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 2,
    });
    expect(getCurrentStreak(storage, "2026-08-02")).toBe(1);
    expect(getCurrentStreak(storage, "2026-08-09")).toBe(0);
  });

  it("is idempotent when the same date is recorded twice", () => {
    recordResult(storage, {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: false,
      guessesUsed: 3,
    });
    const streak = recordResult(storage, {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 2,
    });
    const history = getHistory(storage);
    expect(history).toHaveLength(1);
    expect(history[0].solved).toBe(true);
    expect(history[0].guessesUsed).toBe(2);
    expect(streak).toBe(1);
  });

  it("does not throw when writing to storage fails", () => {
    const throwing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    // The result still computes correctly for this session; it just won't
    // survive a reload. Crashing at the end of a puzzle would be worse.
    expect(() =>
      recordResult(throwing, {
        date: "2026-08-01",
        puzzleNumber: 1,
        solved: true,
        guessesUsed: 2,
      })
    ).not.toThrow();
  });

  it("keeps history sorted by date when results arrive out of order", () => {
    recordResult(storage, {
      date: "2026-08-03",
      puzzleNumber: 3,
      solved: true,
      guessesUsed: 1,
    });
    recordResult(storage, {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 1,
    });
    expect(getHistory(storage).map((e) => e.date)).toEqual([
      "2026-08-01",
      "2026-08-03",
    ]);
  });
});

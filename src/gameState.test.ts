import { describe, it, expect, beforeEach } from "vitest";
import {
  recordResult,
  getLastResult,
  getCurrentStreak,
  hasPlayedToday,
  type StorageLike,
} from "./gameState";

function createFakeStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe("gameState", () => {
  let storage: StorageLike;

  beforeEach(() => {
    storage = createFakeStorage();
  });

  it("returns null/0 before anything has been recorded", () => {
    expect(getLastResult(storage)).toBeNull();
    expect(getCurrentStreak(storage)).toBe(0);
    expect(hasPlayedToday(storage, "2026-08-01")).toBe(false);
  });

  it("sets streak to 1 on the first solved result", () => {
    const streak = recordResult(storage, {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 2,
    });
    expect(streak).toBe(1);
    expect(hasPlayedToday(storage, "2026-08-01")).toBe(true);
  });

  it("increments streak on a solved result the next calendar day", () => {
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

  it("resets streak to 1 when a day is skipped", () => {
    recordResult(storage, {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 2,
    });
    const streak = recordResult(storage, {
      date: "2026-08-03",
      puzzleNumber: 3,
      solved: true,
      guessesUsed: 3,
    });
    expect(streak).toBe(1);
  });

  it("resets streak to 0 on a missed result", () => {
    recordResult(storage, {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 2,
    });
    const streak = recordResult(storage, {
      date: "2026-08-02",
      puzzleNumber: 2,
      solved: false,
      guessesUsed: 3,
    });
    expect(streak).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { computeStats } from "./stats";
import type { DailyResult } from "./gameState";

function result(
  date: string,
  solved: boolean,
  guessesUsed: number
): DailyResult {
  return { date, puzzleNumber: 1, solved, guessesUsed };
}

describe("computeStats", () => {
  it("returns all zeros for an empty history without dividing by zero", () => {
    const stats = computeStats([], "2026-08-10");
    expect(stats).toEqual({
      played: 0,
      wins: 0,
      winPercent: 0,
      currentStreak: 0,
      maxStreak: 0,
      distribution: [0, 0, 0],
    });
  });

  it("counts played and wins and rounds win percentage", () => {
    // 2 wins out of 3 played = 66.67% -> 67
    const stats = computeStats(
      [
        result("2026-08-01", true, 1),
        result("2026-08-02", false, 3),
        result("2026-08-03", true, 2),
      ],
      "2026-08-03"
    );
    expect(stats.played).toBe(3);
    expect(stats.wins).toBe(2);
    expect(stats.winPercent).toBe(67);
  });

  it("buckets the distribution by guessesUsed and ignores losses", () => {
    const stats = computeStats(
      [
        result("2026-08-01", true, 1),
        result("2026-08-02", true, 3),
        result("2026-08-03", true, 3),
        result("2026-08-04", false, 3),
      ],
      "2026-08-04"
    );
    expect(stats.distribution).toEqual([1, 0, 2]);
  });

  it("reports distribution [0,0,0] with played > 0 when every game was lost", () => {
    const stats = computeStats(
      [result("2026-08-01", false, 3), result("2026-08-02", false, 3)],
      "2026-08-02"
    );
    expect(stats.played).toBe(2);
    expect(stats.wins).toBe(0);
    expect(stats.winPercent).toBe(0);
    expect(stats.distribution).toEqual([0, 0, 0]);
  });

  it("keeps the current streak alive when the last entry is today", () => {
    const stats = computeStats(
      [result("2026-08-01", true, 1), result("2026-08-02", true, 1)],
      "2026-08-02"
    );
    expect(stats.currentStreak).toBe(2);
  });

  it("keeps the current streak alive when the last entry is yesterday", () => {
    const stats = computeStats(
      [result("2026-08-01", true, 1), result("2026-08-02", true, 1)],
      "2026-08-03"
    );
    expect(stats.currentStreak).toBe(2);
  });

  it("kills the current streak when the last entry is older than yesterday", () => {
    const stats = computeStats(
      [result("2026-08-01", true, 1), result("2026-08-02", true, 1)],
      "2026-08-05"
    );
    expect(stats.currentStreak).toBe(0);
    expect(stats.maxStreak).toBe(2);
  });

  it("kills the current streak when the most recent entry is a loss", () => {
    const stats = computeStats(
      [result("2026-08-01", true, 1), result("2026-08-02", false, 3)],
      "2026-08-02"
    );
    expect(stats.currentStreak).toBe(0);
    expect(stats.maxStreak).toBe(1);
  });

  it("breaks a streak across a skipped day", () => {
    const stats = computeStats(
      [result("2026-08-01", true, 1), result("2026-08-03", true, 1)],
      "2026-08-03"
    );
    expect(stats.currentStreak).toBe(1);
    expect(stats.maxStreak).toBe(1);
  });

  it("takes the longest run for maxStreak across a gap", () => {
    const stats = computeStats(
      [
        result("2026-08-01", true, 1),
        result("2026-08-02", true, 1),
        result("2026-08-03", true, 1),
        result("2026-08-05", true, 1),
      ],
      "2026-08-05"
    );
    expect(stats.maxStreak).toBe(3);
    expect(stats.currentStreak).toBe(1);
  });

  it("sorts an out-of-order history before computing streaks", () => {
    const stats = computeStats(
      [
        result("2026-08-03", true, 1),
        result("2026-08-01", true, 1),
        result("2026-08-02", true, 1),
      ],
      "2026-08-03"
    );
    expect(stats.currentStreak).toBe(3);
    expect(stats.maxStreak).toBe(3);
  });
});

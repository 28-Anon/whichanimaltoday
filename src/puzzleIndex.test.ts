import { describe, it, expect } from "vitest";
import { getTodayPuzzleIndex, getDaysSinceLaunch } from "./puzzleIndex";

describe("getTodayPuzzleIndex", () => {
  const launchDate = new Date("2026-08-01T00:00:00Z");

  it("returns 0 on the launch date itself", () => {
    expect(getTodayPuzzleIndex(launchDate, launchDate, 500)).toBe(0);
  });

  it("increments by 1 each following calendar day", () => {
    const dayAfter = new Date("2026-08-02T00:00:00Z");
    expect(getTodayPuzzleIndex(dayAfter, launchDate, 500)).toBe(1);
  });

  it("wraps around after the full list length", () => {
    const wrapDate = new Date("2026-08-01T00:00:00Z");
    wrapDate.setUTCDate(wrapDate.getUTCDate() + 500);
    expect(getTodayPuzzleIndex(wrapDate, launchDate, 500)).toBe(0);
  });

  it("is stable across different times on the same UTC calendar day", () => {
    const morning = new Date("2026-08-05T01:00:00Z");
    const night = new Date("2026-08-05T23:59:00Z");
    expect(getTodayPuzzleIndex(morning, launchDate, 500)).toBe(
      getTodayPuzzleIndex(night, launchDate, 500)
    );
  });

  it("handles dates before the launch date without a negative index", () => {
    const dayBefore = new Date("2026-07-31T00:00:00Z");
    expect(getTodayPuzzleIndex(dayBefore, launchDate, 500)).toBe(499);
  });

  it("throws when listLength is not positive", () => {
    expect(() => getTodayPuzzleIndex(launchDate, launchDate, 0)).toThrow();
  });
});

describe("getDaysSinceLaunch", () => {
  const launchDate = new Date("2026-08-01T00:00:00Z");

  it("returns 0 on the launch date itself", () => {
    expect(getDaysSinceLaunch(launchDate, launchDate)).toBe(0);
  });

  it("returns 1 the day after launch", () => {
    expect(
      getDaysSinceLaunch(new Date("2026-08-02T00:00:00Z"), launchDate)
    ).toBe(1);
  });

  it("returns a negative number before launch", () => {
    expect(
      getDaysSinceLaunch(new Date("2026-07-31T00:00:00Z"), launchDate)
    ).toBe(-1);
  });
});

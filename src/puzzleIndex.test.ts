import { describe, it, expect } from "vitest";
import {
  getTodayPuzzleIndex,
  getDaysSinceLaunch,
  msUntilNextUtcMidnight,
  formatCountdown,
  selectDailyAnimals,
  type DailyCandidate,
} from "./puzzleIndex";

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

describe("msUntilNextUtcMidnight", () => {
  const HOUR = 60 * 60 * 1000;

  it("returns a full day at exactly UTC midnight, not zero", () => {
    // The puzzle that just rolled over is today's; the next one is a full
    // day away. Returning 0 here would flash "00:00:00" for a whole second.
    expect(msUntilNextUtcMidnight(new Date("2026-08-05T00:00:00Z"))).toBe(
      24 * HOUR
    );
  });

  it("returns one second when one second remains", () => {
    expect(msUntilNextUtcMidnight(new Date("2026-08-05T23:59:59Z"))).toBe(1000);
  });

  it("returns twelve hours at UTC midday", () => {
    expect(msUntilNextUtcMidnight(new Date("2026-08-05T12:00:00Z"))).toBe(
      12 * HOUR
    );
  });

  it("rolls over a month boundary", () => {
    expect(msUntilNextUtcMidnight(new Date("2026-08-31T23:00:00Z"))).toBe(HOUR);
  });

  it("rolls over a year boundary", () => {
    expect(msUntilNextUtcMidnight(new Date("2026-12-31T23:00:00Z"))).toBe(HOUR);
  });

  it("ignores the local timezone and works off UTC only", () => {
    // Same instant, two ways of writing it. A local-midnight implementation
    // would disagree with itself here.
    const viaUtc = msUntilNextUtcMidnight(new Date("2026-08-05T22:30:00Z"));
    const viaOffset = msUntilNextUtcMidnight(
      new Date("2026-08-06T00:30:00+02:00")
    );
    expect(viaUtc).toBe(viaOffset);
    expect(viaUtc).toBe(90 * 60 * 1000);
  });
});

describe("formatCountdown", () => {
  it("formats hours, minutes, and seconds zero-padded", () => {
    expect(formatCountdown(3661 * 1000)).toBe("01:01:01");
  });

  it("formats the largest value it can be handed", () => {
    expect(formatCountdown(24 * 60 * 60 * 1000 - 1000)).toBe("23:59:59");
  });

  it("shows zeros rather than a negative countdown", () => {
    expect(formatCountdown(-5000)).toBe("00:00:00");
  });

  it("floors partial seconds instead of rounding up", () => {
    // 1999ms remaining is 1 second, not 2 — rounding up would show a second
    // that never elapses.
    expect(formatCountdown(1999)).toBe("00:00:01");
  });
});

describe("selectDailyAnimals", () => {
  interface Named extends DailyCandidate {
    commonName: string;
  }

  const record = (name: string, eligible?: boolean): Named => ({
    commonName: name,
    ...(eligible === undefined ? {} : { dailyEligible: eligible }),
  });

  // Absent must mean eligible: the field is only ever written as false, so
  // every existing record and every future one is included by default.
  it("keeps animals with no dailyEligible field", () => {
    expect(selectDailyAnimals([record("Fox")]).map((a) => a.commonName)).toEqual([
      "Fox",
    ]);
  });

  it("drops animals flagged false", () => {
    const kept = selectDailyAnimals([
      record("Fox"),
      record("Chowsingha", false),
      record("Otter", true),
    ]);
    expect(kept.map((a) => a.commonName)).toEqual(["Fox", "Otter"]);
  });

  it("preserves order", () => {
    const kept = selectDailyAnimals([
      record("A"),
      record("B", false),
      record("C"),
      record("D"),
    ]);
    expect(kept.map((a) => a.commonName)).toEqual(["A", "C", "D"]);
  });

  it("does not mutate its input", () => {
    const input = [record("Fox"), record("Chowsingha", false)];
    selectDailyAnimals(input);
    expect(input).toHaveLength(2);
  });

  it("handles an empty list", () => {
    expect(selectDailyAnimals([])).toEqual([]);
  });
});

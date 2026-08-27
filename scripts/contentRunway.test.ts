import { describe, expect, it } from "vitest";
import { computeRunway, type RunwayInput } from "./contentRunway";

const LAUNCH = new Date("2026-08-01T00:00:00Z");

/** `n` animals, all daily-eligible unless the index is listed in `benched`. */
function pool(n: number, benched: number[] = []): RunwayInput[] {
  return Array.from({ length: n }, (_, i) =>
    benched.includes(i) ? { dailyEligible: false } : {}
  );
}

describe("computeRunway", () => {
  it("counts today as the first unseen day, not a spent one", () => {
    // Launch day itself: index 0 is being served now, 77 fresh days follow.
    const runway = computeRunway(pool(78), new Date("2026-08-01T12:00:00Z"), LAUNCH);
    expect(runway.eligible).toBe(78);
    expect(runway.daysRemaining).toBe(78);
    expect(runway.repeatsOn).toBe("2026-10-18");
  });

  /**
   * The live numbers on the day this was written, so a refactor that shifts
   * the calculation by a day fails here rather than on the site in October.
   */
  it("matches the measured live state on 2026-08-27", () => {
    const runway = computeRunway(pool(78), new Date("2026-08-27T19:00:00Z"), LAUNCH);
    expect(runway.daysServed).toBe(27);
    expect(runway.daysRemaining).toBe(52);
    expect(runway.repeatsOn).toBe("2026-10-18");
  });

  /**
   * `selectDailyAnimals` filters these out before indexing, so a benched
   * animal is not a day of content. Counting the raw array instead would
   * overstate the runway by exactly the number of retired records.
   */
  it("ignores animals benched out of the daily rotation", () => {
    const runway = computeRunway(pool(78, [70, 71, 72]), new Date("2026-08-27T19:00:00Z"), LAUNCH);
    expect(runway.eligible).toBe(75);
    expect(runway.daysRemaining).toBe(49);
  });

  it("reports zero, never a negative, once the list has wrapped", () => {
    const runway = computeRunway(pool(10), new Date("2026-09-01T00:00:00Z"), LAUNCH);
    expect(runway.daysRemaining).toBe(0);
    expect(runway.hasWrapped).toBe(true);
  });

  it("is not yet wrapped on the last fresh day", () => {
    // Launch + 77 days is index 77, the final unseen animal of 78.
    const runway = computeRunway(pool(78), new Date("2026-10-17T23:00:00Z"), LAUNCH);
    expect(runway.daysRemaining).toBe(1);
    expect(runway.hasWrapped).toBe(false);
  });

  it("is wrapped on the repeat date itself", () => {
    const runway = computeRunway(pool(78), new Date("2026-10-18T00:30:00Z"), LAUNCH);
    expect(runway.hasWrapped).toBe(true);
  });

  /**
   * Puzzles roll over at UTC midnight, so a late-evening run in a western
   * timezone must not read as tomorrow.
   */
  it("counts UTC days, not local ones", () => {
    const late = computeRunway(pool(78), new Date("2026-08-27T23:59:59Z"), LAUNCH);
    const early = computeRunway(pool(78), new Date("2026-08-27T00:00:01Z"), LAUNCH);
    expect(late.daysRemaining).toBe(early.daysRemaining);
  });

  it("refuses an empty pool rather than reporting infinite runway", () => {
    expect(() => computeRunway([], new Date("2026-08-27T00:00:00Z"), LAUNCH)).toThrow(
      /no daily-eligible animals/i
    );
  });
});

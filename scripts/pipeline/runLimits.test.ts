import { describe, expect, it } from "vitest";
import {
  parseLimit,
  DEFAULT_CANDIDATES,
  DEFAULT_SURVIVORS,
  MAX_CANDIDATES_CAP,
  MAX_SURVIVORS_CAP,
} from "./runLimits";

describe("parseLimit", () => {
  it("falls back when the flag is absent", () => {
    expect(parseLimit([], "candidates", DEFAULT_CANDIDATES, MAX_CANDIDATES_CAP)).toBe(8);
    expect(parseLimit([], "survivors", DEFAULT_SURVIVORS, MAX_SURVIVORS_CAP)).toBe(3);
  });

  it("reads the value when given", () => {
    expect(
      parseLimit(["--candidates=16"], "candidates", DEFAULT_CANDIDATES, MAX_CANDIDATES_CAP)
    ).toBe(16);
  });

  it("ignores an empty value rather than treating it as zero", () => {
    expect(
      parseLimit(["--candidates="], "candidates", DEFAULT_CANDIDATES, MAX_CANDIDATES_CAP)
    ).toBe(8);
  });

  /**
   * Every judgement is a paid API call, so a mistyped flag should fail loudly
   * rather than quietly becoming a bill or a no-op.
   */
  it("refuses a value that is not a whole number of 1 or more", () => {
    for (const bad of ["0", "-3", "2.5", "eight"]) {
      expect(() =>
        parseLimit([`--candidates=${bad}`], "candidates", DEFAULT_CANDIDATES, MAX_CANDIDATES_CAP)
      ).toThrow(/whole number/);
    }
  });

  it("refuses a value above the cap, and says why", () => {
    expect(() =>
      parseLimit(["--candidates=500"], "candidates", DEFAULT_CANDIDATES, MAX_CANDIDATES_CAP)
    ).toThrow(/capped at 24 — each judgement is a paid call/);
  });

  it("allows exactly the cap", () => {
    expect(
      parseLimit(["--candidates=24"], "candidates", DEFAULT_CANDIDATES, MAX_CANDIDATES_CAP)
    ).toBe(24);
  });

  it("reads each flag independently", () => {
    const argv = ["--candidates=16", "--survivors=6"];
    expect(parseLimit(argv, "candidates", DEFAULT_CANDIDATES, MAX_CANDIDATES_CAP)).toBe(16);
    expect(parseLimit(argv, "survivors", DEFAULT_SURVIVORS, MAX_SURVIVORS_CAP)).toBe(6);
  });
});

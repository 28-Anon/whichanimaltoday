import { describe, it, expect } from "vitest";
import { formatUtcDate, getPreviousUtcDay } from "./dateUtils";

describe("formatUtcDate", () => {
  it("formats as YYYY-MM-DD", () => {
    expect(formatUtcDate(new Date("2026-08-05T13:45:00Z"))).toBe(
      "2026-08-05"
    );
  });

  it("pads single-digit months and days", () => {
    expect(formatUtcDate(new Date("2026-01-02T00:00:00Z"))).toBe(
      "2026-01-02"
    );
  });
});

describe("getPreviousUtcDay", () => {
  it("returns the prior calendar day", () => {
    const result = getPreviousUtcDay(new Date("2026-08-05T10:00:00Z"));
    expect(formatUtcDate(result)).toBe("2026-08-04");
  });

  it("crosses a month boundary", () => {
    const result = getPreviousUtcDay(new Date("2026-08-01T00:00:00Z"));
    expect(formatUtcDate(result)).toBe("2026-07-31");
  });

  it("crosses a year boundary", () => {
    const result = getPreviousUtcDay(new Date("2027-01-01T00:00:00Z"));
    expect(formatUtcDate(result)).toBe("2026-12-31");
  });
});

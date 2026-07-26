import { describe, it, expect } from "vitest";
import { buildShareText } from "./shareCard";

describe("buildShareText", () => {
  it("formats a solved result", () => {
    expect(buildShareText(12, "🦒", 2)).toBe("WhichAnimalToday #12 🦒 2/3");
  });

  it("formats a missed result as X/3", () => {
    expect(buildShareText(12, "🦒", null)).toBe("WhichAnimalToday #12 🦒 X/3");
  });

  it("formats a first-guess solve", () => {
    expect(buildShareText(1, "🐘", 1)).toBe("WhichAnimalToday #1 🐘 1/3");
  });
});

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

  it("appends the site URL on its own line when one is given", () => {
    expect(buildShareText(12, "🦒", 2, "https://whichanimaltoday.com")).toBe(
      "WhichAnimalToday #12 🦒 2/3\nhttps://whichanimaltoday.com"
    );
  });

  it("appends the site URL to a missed result too", () => {
    expect(buildShareText(12, "🦒", null, "https://whichanimaltoday.com")).toBe(
      "WhichAnimalToday #12 🦒 X/3\nhttps://whichanimaltoday.com"
    );
  });

  it("omits the URL line when the site URL is an empty string", () => {
    // This is the pre-launch state: the constant exists but isn't set yet, and
    // a trailing blank line in every shared result would be worse than none.
    expect(buildShareText(12, "🦒", 2, "")).toBe("WhichAnimalToday #12 🦒 2/3");
  });

  it("omits the URL line when the site URL is only whitespace", () => {
    expect(buildShareText(12, "🦒", 2, "   ")).toBe(
      "WhichAnimalToday #12 🦒 2/3"
    );
  });

  it("trims surrounding whitespace off the site URL", () => {
    expect(buildShareText(12, "🦒", 2, "  https://a.com  ")).toBe(
      "WhichAnimalToday #12 🦒 2/3\nhttps://a.com"
    );
  });
});

describe("bonus marker", () => {
  it("appends a star on a hit", () => {
    expect(buildShareText(34, "🐾", 2, undefined, "hit")).toBe(
      "WhichAnimalToday #34 🐾 2/3 ⭐"
    );
  });

  it("appends a white square on a miss", () => {
    expect(buildShareText(34, "🐾", 2, undefined, "miss")).toBe(
      "WhichAnimalToday #34 🐾 2/3 ⬜"
    );
  });

  it("appends nothing when the day had no bonus round", () => {
    expect(buildShareText(34, "🐾", 2)).toBe("WhichAnimalToday #34 🐾 2/3");
  });

  it("places the marker before the URL line", () => {
    expect(buildShareText(34, "🐾", 2, "https://whichanimaltoday.com", "hit")).toBe(
      "WhichAnimalToday #34 🐾 2/3 ⭐\nhttps://whichanimaltoday.com"
    );
  });

  it("still marks a loss with no bonus", () => {
    expect(buildShareText(34, "🐾", null)).toBe("WhichAnimalToday #34 🐾 X/3");
  });
});

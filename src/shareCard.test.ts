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

describe("curiosity teaser", () => {
  const HOOK = "I can identify and eat prey faster than the human eye can follow.";

  it("omits the teaser entirely when none is given", () => {
    // Byte-identical to the pre-teaser output. Every existing call site, and
    // anyone who already recognises the format, is unaffected.
    expect(buildShareText(34, "\u{1F43E}", 2, "https://whichanimaltoday.com")).toBe(
      "WhichAnimalToday #34 \u{1F43E} 2/3\nhttps://whichanimaltoday.com"
    );
  });

  it("puts the teaser in quotes between the score and the link", () => {
    expect(
      buildShareText(34, "\u{1F43E}", 2, "https://whichanimaltoday.com", undefined, HOOK)
    ).toBe(
      "WhichAnimalToday #34 \u{1F43E} 2/3\n\n" +
        '"' + HOOK + '"\n\n' +
        "https://whichanimaltoday.com"
    );
  });

  it("works with no site URL", () => {
    expect(buildShareText(34, "\u{1F43E}", 2, undefined, undefined, HOOK)).toBe(
      "WhichAnimalToday #34 \u{1F43E} 2/3\n\n" + '"' + HOOK + '"'
    );
  });

  it("keeps the bonus marker on the score line", () => {
    const text = buildShareText(34, "\u{1F43E}", 2, undefined, "hit", HOOK);
    expect(text.split("\n")[0]).toBe("WhichAnimalToday #34 \u{1F43E} 2/3 ⭐");
  });

  it("carries the teaser on a loss too", () => {
    // A player who failed shares X/3, and the hook arguably works harder
    // there — "I could not get this" invites a friend to try.
    expect(buildShareText(34, "\u{1F43E}", null, undefined, undefined, HOOK)).toContain(HOOK);
  });

  it("truncates a long teaser on a word boundary", () => {
    // Measured across the real 58 animals: median hint1 is 79 characters and
    // only two exceed 140, so the cap trims almost nothing.
    const long =
      "Back when mammoths still roamed, my ancestors grazed steppe stretching " +
      "from the Carpathians clear across to Beringia and my commute has shrunk a bit since then.";
    const quoted = buildShareText(34, "\u{1F43E}", 2, undefined, undefined, long).split("\n")[2];
    expect(quoted.length).toBeLessThanOrEqual(143);
    expect(quoted.endsWith('…"')).toBe(true);
    expect(quoted.endsWith(' …"')).toBe(false);
  });

  it("leaves a teaser under the cap untouched", () => {
    expect(buildShareText(34, "\u{1F43E}", 2, undefined, undefined, HOOK)).toContain(
      '"' + HOOK + '"'
    );
  });

  it("ignores a blank teaser", () => {
    expect(buildShareText(34, "\u{1F43E}", 2, undefined, undefined, "   ")).toBe(
      "WhichAnimalToday #34 \u{1F43E} 2/3"
    );
  });
});

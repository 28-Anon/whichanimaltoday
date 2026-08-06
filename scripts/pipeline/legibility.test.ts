import { describe, expect, it } from "vitest";
import {
  buildLegibilityPrompt,
  matchesExpectedName,
  normalizeName,
  parseLegibilityReply,
  scoreLegibility,
} from "./legibility";

describe("normalizeName", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeName("Red-eyed Leaf Frog")).toBe("red eyed leaf frog");
  });

  it("collapses whitespace", () => {
    expect(normalizeName("  Great   Argus  ")).toBe("great argus");
  });

  it("survives a string with nothing usable in it", () => {
    expect(normalizeName("—!—")).toBe("");
  });
});

describe("matchesExpectedName", () => {
  const narwhal = ["Narwhal", "unicorn of the sea", "Monodon monoceros"];

  it("accepts an exact name regardless of case", () => {
    expect(matchesExpectedName("narwhal", narwhal)).toBe(true);
  });

  it("accepts a less specific guess, because clues narrow it down", () => {
    expect(
      matchesExpectedName("sea turtle", ["Hawksbill Sea Turtle"])
    ).toBe(true);
  });

  it("accepts a more specific guess than the puzzle name", () => {
    expect(matchesExpectedName("Japanese giant salamander", ["Salamander"])).toBe(
      true
    );
  });

  it("matches on an alias or the species name", () => {
    expect(matchesExpectedName("Monodon monoceros", narwhal)).toBe(true);
  });

  // The case this whole module exists for: the animal is a whale, the picture
  // is of whales, and it is still the wrong puzzle image.
  it("rejects a different animal that merely shares a habitat", () => {
    expect(matchesExpectedName("whale", narwhal)).toBe(false);
    expect(matchesExpectedName("beluga", narwhal)).toBe(false);
  });

  // The first real audit run rejected a perfect photograph over this: the
  // judge said "red-eyed tree frog", the record's alias is "Red-eyed Treefrog",
  // and neither string contains the other.
  it("ignores whether a compound name is one word or two", () => {
    expect(
      matchesExpectedName("Red-eyed tree frog", [
        "Red-eyed Leaf frog",
        "Red-eyed Treefrog",
        "Agalychnis callidryas",
      ])
    ).toBe(true);
    expect(matchesExpectedName("seahorse", ["Sea Horse"])).toBe(true);
    expect(matchesExpectedName("blue bird", ["Bluebird"])).toBe(true);
  });

  // Squashing spaces must not start matching animals that merely rhyme.
  it("still rejects a different animal after squashing spaces", () => {
    expect(
      matchesExpectedName("red-eyed tree frog", ["Red-eyed Leaf frog"])
    ).toBe(false);
    expect(matchesExpectedName("black-crowned night heron", ["Boat-billed Heron"]))
      .toBe(false);
  });

  it("rejects UNCLEAR and empty answers", () => {
    expect(matchesExpectedName("UNCLEAR", narwhal)).toBe(false);
    expect(matchesExpectedName("", narwhal)).toBe(false);
    expect(matchesExpectedName("   ", narwhal)).toBe(false);
  });

  it("does not match against an empty expected name", () => {
    expect(matchesExpectedName("narwhal", ["", "  "])).toBe(false);
  });
});

describe("parseLegibilityReply", () => {
  it("reads all three fields", () => {
    const reply = parseLegibilityReply(
      "ANIMAL: Narwhal\nCONFIDENCE: HIGH\nVISIBLE: A mottled body and a long tusk."
    );
    expect(reply).toEqual({
      animal: "Narwhal",
      confidence: "HIGH",
      visible: "A mottled body and a long tusk.",
    });
  });

  it("is case-insensitive about the field names", () => {
    expect(parseLegibilityReply("animal: Koala\nconfidence: low\n").animal).toBe(
      "Koala"
    );
    expect(
      parseLegibilityReply("animal: Koala\nconfidence: low\n").confidence
    ).toBe("LOW");
  });

  // A missing line must not throw: one unparseable reply should cost one
  // image, not the whole audit.
  it("degrades to UNKNOWN rather than throwing on a missing line", () => {
    expect(parseLegibilityReply("ANIMAL: Otter")).toEqual({
      animal: "Otter",
      confidence: "UNKNOWN",
      visible: "",
    });
  });

  it("treats an unrecognised confidence as UNKNOWN", () => {
    expect(parseLegibilityReply("CONFIDENCE: fairly sure").confidence).toBe(
      "UNKNOWN"
    );
  });
});

describe("scoreLegibility", () => {
  const narwhal = ["Narwhal", "Monodon monoceros"];

  it("passes a confident, matching identification", () => {
    const result = scoreLegibility(
      { animal: "Narwhal", confidence: "HIGH", visible: "A long tusk." },
      narwhal
    );
    expect(result.ok).toBe(true);
    expect(result.note).toContain("identifiable at display size");
  });

  it("fails UNCLEAR", () => {
    const result = scoreLegibility(
      { animal: "UNCLEAR", confidence: "LOW", visible: "Blue water." },
      narwhal
    );
    expect(result.ok).toBe(false);
    expect(result.note).toContain("could not name it");
  });

  it("fails when the judge names a different animal", () => {
    const result = scoreLegibility(
      { animal: "a pod of whales", confidence: "MEDIUM", visible: "Dark shapes." },
      narwhal
    );
    expect(result.ok).toBe(false);
    expect(result.note).toContain("a pod of whales");
  });

  // A correct answer arrived at by squinting is a lucky guess, not a legible
  // photograph — and the model knows far more animals than a player does.
  it("fails a matching name given with low confidence", () => {
    const result = scoreLegibility(
      { animal: "Narwhal", confidence: "LOW", visible: "Possibly a tusk." },
      narwhal
    );
    expect(result.ok).toBe(false);
    expect(result.note).toContain("low confidence");
  });

  it("passes MEDIUM confidence", () => {
    expect(
      scoreLegibility(
        { animal: "Narwhal", confidence: "MEDIUM", visible: "A tusk." },
        narwhal
      ).ok
    ).toBe(true);
  });

  it("carries the visible-features sentence into the note", () => {
    expect(
      scoreLegibility(
        { animal: "UNCLEAR", confidence: "LOW", visible: "Only open water." },
        narwhal
      ).note
    ).toContain("Only open water.");
  });
});

describe("buildLegibilityPrompt", () => {
  it("states the exact display size", () => {
    expect(buildLegibilityPrompt(330, 248)).toContain("330x248 pixels");
  });

  // Naming the animal is precisely how the narwhal passed: a judge told the
  // answer will find it in a smudge.
  it("never names the animal it is judging", () => {
    const prompt = buildLegibilityPrompt(330, 248).toLowerCase();
    expect(prompt).toContain("unclear");
    expect(prompt).not.toContain("this image is used as the puzzle");
  });
});

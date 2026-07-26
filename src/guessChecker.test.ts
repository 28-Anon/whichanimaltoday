import { describe, it, expect } from "vitest";
import { normalizeGuess, checkGuess } from "./guessChecker";

describe("normalizeGuess", () => {
  it("lowercases, trims, and strips punctuation", () => {
    expect(normalizeGuess("  Elephant! ")).toBe("elephant");
  });
});

describe("checkGuess", () => {
  it("matches the exact common name, case-insensitively", () => {
    expect(checkGuess("Elephant", "Elephant", [])).toBe(true);
  });

  it("matches an alias", () => {
    expect(checkGuess("cougar", "Puma", ["cougar", "mountain lion"])).toBe(true);
  });

  it("matches simple plurals", () => {
    expect(checkGuess("elephants", "Elephant", [])).toBe(true);
  });

  it("tolerates a small typo on a longer word", () => {
    expect(checkGuess("elefant", "Elephant", [])).toBe(true);
  });

  it("tolerates a one-letter typo on a medium word", () => {
    expect(checkGuess("chetah", "Cheetah", [])).toBe(true);
  });

  it("rejects an unrelated word", () => {
    expect(checkGuess("dog", "Elephant", [])).toBe(false);
  });

  it("rejects a short word with a typo (tolerance is 0 for very short words)", () => {
    expect(checkGuess("bat", "Cat", [])).toBe(false);
  });
});

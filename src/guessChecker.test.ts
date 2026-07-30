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

  it("rejects a very long guess without exhausting memory", () => {
    // Levenshtein allocates a (guess+1) x (candidate+1) matrix. Without the
    // length-difference short-circuit, a pasted megabyte here would allocate
    // millions of cells per candidate and freeze the tab. The distance can
    // never be smaller than the length difference, so this is rejected
    // outright — and must return promptly.
    const huge = "a".repeat(1_000_000);
    const started = Date.now();
    expect(checkGuess(huge, "Elephant", ["african elephant"])).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("rejects a guess longer than the candidate by more than the tolerance", () => {
    // "Elephant" is 8 chars, tolerance 2. "elephanttttt" is 12 — a difference
    // of 4, so no amount of edit-distance generosity can match it.
    expect(checkGuess("elephanttttt", "Elephant", [])).toBe(false);
  });

  it("still matches when the length difference is within the tolerance", () => {
    // 9 vs 8 chars: one insertion, inside tolerance 2. The short-circuit must
    // not reject this.
    expect(checkGuess("elepphant", "Elephant", [])).toBe(true);
  });
});

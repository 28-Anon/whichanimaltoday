import { describe, it, expect } from "vitest";
import { buildSlug } from "./slug";

describe("buildSlug", () => {
  it("lowercases a single-word name", () => {
    expect(buildSlug("Giraffe", 12)).toBe("giraffe-12");
  });

  it("hyphenates multi-word names", () => {
    expect(buildSlug("Mountain Lion", 45)).toBe("mountain-lion-45");
  });

  it("strips punctuation", () => {
    expect(buildSlug("Pauline's Frog", 7)).toBe("paulines-frog-7");
  });

  it("collapses extra whitespace", () => {
    expect(buildSlug("  Red   Panda  ", 3)).toBe("red-panda-3");
  });
});

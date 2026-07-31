import { describe, it, expect } from "vitest";
import { shuffleBonusOptions } from "./bonusRound";

const OPTIONS = ["European Mole", "Eastern Mole", "Star-Nosed Mole", "Hairy-Tailed Mole"];

describe("shuffleBonusOptions", () => {
  it("is deterministic for the same seed", () => {
    const a = shuffleBonusOptions(OPTIONS, 2, 34);
    const b = shuffleBonusOptions(OPTIONS, 2, 34);
    expect(a).toEqual(b);
  });

  it("keeps every option exactly once", () => {
    const result = shuffleBonusOptions(OPTIONS, 2, 34);
    expect([...result.options].sort()).toEqual([...OPTIONS].sort());
  });

  it("moves answerIndex to wherever the answer landed", () => {
    const result = shuffleBonusOptions(OPTIONS, 2, 34);
    expect(result.options[result.answerIndex]).toBe("Star-Nosed Mole");
  });

  it("does not mutate the input array", () => {
    const input = [...OPTIONS];
    shuffleBonusOptions(input, 2, 34);
    expect(input).toEqual(OPTIONS);
  });

  it("produces different orders for different seeds", () => {
    // Across 20 consecutive puzzle numbers the answer must not always land in
    // the same slot — that is the entire point of shuffling.
    const positions = new Set(
      Array.from({ length: 20 }, (_, seed) =>
        shuffleBonusOptions(OPTIONS, 2, seed).answerIndex
      )
    );
    expect(positions.size).toBeGreaterThan(1);
  });
});

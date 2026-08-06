import { describe, expect, it } from "vitest";
import {
  WEEK_PATTERN,
  layOutPuzzles,
  startSlotForTargetWeekday,
  type Difficulty,
  type Orderable,
} from "./puzzleOrder";

/** `e3 m3 h1` → three easy, three medium, one hard, named e1..e3 and so on. */
function pool(spec: Record<Difficulty, number>): Orderable[] {
  const out: Orderable[] = [];
  for (const tier of ["easy", "medium", "hard"] as const) {
    for (let i = 1; i <= spec[tier]; i++) {
      out.push({ commonName: `${tier}-${i}`, difficulty: tier });
    }
  }
  return out;
}

const tiers = (animals: Orderable[]): Difficulty[] =>
  animals.map((animal) => animal.difficulty);

describe("WEEK_PATTERN", () => {
  it("is seven days holding six winnable and one hard", () => {
    expect(WEEK_PATTERN).toHaveLength(7);
    expect(WEEK_PATTERN.filter((slot) => slot === "hard")).toHaveLength(1);
  });
});

describe("layOutPuzzles", () => {
  it("returns every animal exactly once", () => {
    const input = pool({ easy: 9, medium: 9, hard: 3 });
    const output = layOutPuzzles(input, 0);

    expect(output).toHaveLength(input.length);
    expect(new Set(output.map((a) => a.commonName)).size).toBe(input.length);
  });

  it("follows the pattern when every tier has supply", () => {
    // Two full weeks: the pattern needs 3 easy, 3 medium, 1 hard per week.
    const output = layOutPuzzles(pool({ easy: 6, medium: 6, hard: 2 }), 0);

    expect(tiers(output)).toEqual([...WEEK_PATTERN, ...WEEK_PATTERN]);
  });

  it("continues the pattern from the slot it is given", () => {
    // Starting at slot 3 must open on the hard day, not restart the week —
    // this is what keeps the hard day on the same weekday across a reorder
    // that leaves already-played puzzles in place.
    const output = layOutPuzzles(pool({ easy: 3, medium: 3, hard: 1 }), 3);

    expect(tiers(output)[0]).toBe("hard");
    expect(tiers(output).slice(0, 4)).toEqual(WEEK_PATTERN.slice(3, 7));
  });

  const adjacentHardDays = (output: Difficulty[]): number =>
    output.filter(
      (tier, index) => index > 0 && tier === "hard" && output[index - 1] === "hard"
    ).length;

  it("never places two hard days next to each other", () => {
    expect(
      adjacentHardDays(tiers(layOutPuzzles(pool({ easy: 6, medium: 6, hard: 2 }), 0)))
    ).toBe(0);
  });

  // The greedy trap: taking easy and medium first because the pattern asks for
  // them leaves a block of hard days at the end. Eight hard in twenty slots is
  // spaceable, so nothing here excuses doubling up.
  it("spaces out hard days even when they are over-supplied", () => {
    expect(
      adjacentHardDays(tiers(layOutPuzzles(pool({ easy: 6, medium: 6, hard: 8 }), 0)))
    ).toBe(0);
  });

  // Twelve hard days cannot be spaced across twenty slots by anyone. The
  // requirement then is to degrade quietly, not to throw or drop animals.
  it("still emits everything when spacing is arithmetically impossible", () => {
    const output = layOutPuzzles(pool({ easy: 4, medium: 4, hard: 12 }), 0);
    expect(output).toHaveLength(20);
    expect(new Set(output.map((a) => a.commonName)).size).toBe(20);
  });

  it("substitutes the nearest tier instead of throwing when one runs dry", () => {
    // No hard animals at all: every hard slot must still be filled.
    const output = layOutPuzzles(pool({ easy: 6, medium: 6, hard: 0 }), 0);

    expect(output).toHaveLength(12);
    expect(tiers(output)).not.toContain("hard");
  });

  it("falls back from easy to medium before hard", () => {
    const output = layOutPuzzles(pool({ easy: 0, medium: 6, hard: 1 }), 0);

    // Slot 0 wants easy. Medium is the nearer neighbour, so it wins.
    expect(tiers(output)[0]).toBe("medium");
  });

  it("is deterministic", () => {
    const input = pool({ easy: 7, medium: 5, hard: 3 });
    const first = layOutPuzzles(input, 0).map((a) => a.commonName);
    const second = layOutPuzzles(input, 0).map((a) => a.commonName);

    expect(first).toEqual(second);
  });

  it("does not mutate its input", () => {
    const input = pool({ easy: 3, medium: 3, hard: 1 });
    const before = input.map((a) => a.commonName);
    layOutPuzzles(input, 0);

    expect(input.map((a) => a.commonName)).toEqual(before);
  });

  it("handles an empty list", () => {
    expect(layOutPuzzles([], 0)).toEqual([]);
  });

  it("handles a single animal", () => {
    const output = layOutPuzzles(pool({ easy: 0, medium: 0, hard: 1 }), 0);
    expect(output).toHaveLength(1);
  });

  it("normalises a start slot beyond one week", () => {
    const input = pool({ easy: 3, medium: 3, hard: 1 });
    expect(layOutPuzzles(input, 10)).toEqual(layOutPuzzles(input, 3));
  });
});

describe("startSlotForTargetWeekday", () => {
  const SATURDAY = 6;

  // Ample easy/medium and exactly the hard count the pattern asks for, so the
  // layout follows the pattern rather than degrading — this test is about the
  // anchor, not about substitution.
  const fiveWeeks = () => pool({ easy: 15, medium: 15, hard: 5 });

  function hardWeekdays(
    frozenCount: number,
    launchDayOfWeek: number,
    target: number
  ): number[] {
    const slot = startSlotForTargetWeekday(frozenCount, launchDayOfWeek, target);
    return layOutPuzzles(fiveWeeks(), slot)
      .map((animal, i) => ({ animal, dayOfWeek: (launchDayOfWeek + frozenCount + i) % 7 }))
      .filter(({ animal }) => animal.difficulty === "hard")
      .map(({ dayOfWeek }) => dayOfWeek);
  }

  it("puts every hard day on the target weekday", () => {
    expect(hardWeekdays(6, SATURDAY, SATURDAY)).toEqual([
      SATURDAY, SATURDAY, SATURDAY, SATURDAY, SATURDAY,
    ]);
  });

  it("works when the launch date is not a Saturday", () => {
    expect(hardWeekdays(6, 2 /* Tuesday */, SATURDAY)).toEqual([
      SATURDAY, SATURDAY, SATURDAY, SATURDAY, SATURDAY,
    ]);
  });

  it("works for a target other than Saturday", () => {
    expect(hardWeekdays(0, SATURDAY, 1 /* Monday */)).toEqual([1, 1, 1, 1, 1]);
  });

  it("is unaffected by how many puzzles are already frozen", () => {
    for (const frozen of [0, 1, 6, 13, 40]) {
      expect(hardWeekdays(frozen, SATURDAY, SATURDAY)).toEqual([
        SATURDAY, SATURDAY, SATURDAY, SATURDAY, SATURDAY,
      ]);
    }
  });

  it("always returns a slot inside one week", () => {
    for (let frozen = 0; frozen < 20; frozen++) {
      const slot = startSlotForTargetWeekday(frozen, SATURDAY, SATURDAY);
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(WEEK_PATTERN.length);
    }
  });
});

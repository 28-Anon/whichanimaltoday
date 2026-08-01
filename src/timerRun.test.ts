import { describe, it, expect } from "vitest";
import {
  buildQuestion,
  applyAnswer,
  START_MS,
  CORRECT_BONUS_MS,
  WRONG_PENALTY_MS,
  type TimerRun,
} from "./timerRun";

const animals = [
  { commonName: "Giraffe", category: "Mammal" },
  { commonName: "Koala", category: "Mammal" },
  { commonName: "Capybara", category: "Mammal" },
  { commonName: "Aardvark", category: "Mammal" },
  { commonName: "Puffin", category: "Bird" },
  { commonName: "Toucan", category: "Bird" },
  { commonName: "Peacock", category: "Bird" },
  { commonName: "Flamingo", category: "Bird" },
];

function freshRun(): TimerRun {
  return { remainingMs: START_MS, score: 0, askedIndexes: [], missed: [] };
}

describe("buildQuestion", () => {
  it("returns four distinct options containing the answer", () => {
    const q = buildQuestion(animals, [], 1)!;
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options).size).toBe(4);
    expect(q.options[q.answerIndex]).toBe(animals[q.animalIndex].commonName);
  });

  it("prefers decoys from the same category", () => {
    // A bird against three other birds: free difficulty, and it stops the
    // silhouette giving the answer away before the name is read.
    const q = buildQuestion(animals, [], 4)!;
    const categoryOf = (name: string) =>
      animals.find((a) => a.commonName === name)!.category;
    const answerCategory = categoryOf(q.options[q.answerIndex]);
    expect(q.options.every((o) => categoryOf(o) === answerCategory)).toBe(true);
  });

  it("never repeats an animal already asked in this run", () => {
    const asked = [0, 1, 2, 3, 4, 5, 6];
    const q = buildQuestion(animals, asked, 9)!;
    expect(asked).not.toContain(q.animalIndex);
  });

  it("returns null when every animal has been asked", () => {
    expect(buildQuestion(animals, [0, 1, 2, 3, 4, 5, 6, 7], 1)).toBeNull();
  });

  it("is deterministic for the same seed and asked list", () => {
    expect(buildQuestion(animals, [], 7)).toEqual(buildQuestion(animals, [], 7));
  });

  it("falls back to the whole list when a category cannot fill three decoys", () => {
    const thin = [
      { commonName: "Blobfish", category: "Fish" },
      { commonName: "Giraffe", category: "Mammal" },
      { commonName: "Koala", category: "Mammal" },
      { commonName: "Capybara", category: "Mammal" },
    ];
    const q = buildQuestion(thin, [1, 2, 3], 1)!;
    expect(q.animalIndex).toBe(0);
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options).size).toBe(4);
  });

  it("returns null when there are fewer than four animals to choose from", () => {
    expect(buildQuestion(animals.slice(0, 3), [], 1)).toBeNull();
  });
});

describe("applyAnswer", () => {
  const question = { animalIndex: 2, options: ["a", "b", "c", "d"], answerIndex: 0 };

  it("adds time and a point for a correct answer", () => {
    const next = applyAnswer(freshRun(), true, question);
    expect(next.remainingMs).toBe(START_MS + CORRECT_BONUS_MS);
    expect(next.score).toBe(1);
    expect(next.missed).toEqual([]);
  });

  it("subtracts more time than a correct answer adds", () => {
    // Load-bearing: with four options a random tapper hits 25%, so a wrong
    // answer must cost more than a right one gains or the clock never ends.
    expect(WRONG_PENALTY_MS).toBeGreaterThan(CORRECT_BONUS_MS);
  });

  it("records a wrong answer without scoring it", () => {
    const next = applyAnswer(freshRun(), false, question);
    expect(next.remainingMs).toBe(START_MS - WRONG_PENALTY_MS);
    expect(next.score).toBe(0);
    expect(next.missed).toEqual([2]);
  });

  it("records the animal as asked either way", () => {
    expect(applyAnswer(freshRun(), true, question).askedIndexes).toEqual([2]);
    expect(applyAnswer(freshRun(), false, question).askedIndexes).toEqual([2]);
  });

  it("clamps the clock at zero rather than going negative", () => {
    const nearlyOut = { ...freshRun(), remainingMs: 2000 };
    expect(applyAnswer(nearlyOut, false, question).remainingMs).toBe(0);
  });

  it("does not mutate the run it was given", () => {
    const run = freshRun();
    applyAnswer(run, true, question);
    expect(run.score).toBe(0);
    expect(run.askedIndexes).toEqual([]);
  });
});

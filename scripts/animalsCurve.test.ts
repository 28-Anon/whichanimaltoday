import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { selectDailyAnimals } from "../src/puzzleIndex";
import type { Difficulty } from "../src/puzzleOrder";

/**
 * Guards the difficulty curve in the live data file.
 *
 * The list was previously in acceptance order, which put 24 consecutive obscure
 * puzzles from 4 September onwards — fifteen of them obscure birds — because
 * `acceptCandidates.ts` appends and every batch landed as a block. Since a
 * streak only survives a solved day, a run of unwinnable puzzles breaks every
 * active streak at once.
 *
 * These assertions run against `data/animals.json` itself rather than against a
 * fixture, because the failure being prevented is a *content* drift, not a code
 * one. `npm run content:order` fixes anything they catch.
 */
interface Animal {
  commonName: string;
  difficulty: Difficulty;
  dailyEligible?: boolean;
}

const animals = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../data/animals.json", import.meta.url)),
    "utf8"
  )
) as Animal[];

const TIERS: Difficulty[] = ["easy", "medium", "hard"];

/**
 * The seven-slot pattern spends six of every seven days on easy or medium, so a
 * pool much below that ratio cannot fill the calendar and starts substituting
 * hard animals into winnable slots. 70% leaves enough headroom to notice first.
 */
const MIN_WINNABLE_SHARE = 0.7;

describe("data/animals.json difficulty", () => {
  it("gives every animal a valid tier", () => {
    const bad = animals
      .filter((animal) => !TIERS.includes(animal.difficulty))
      .map((animal) => `${animal.commonName}: ${String(animal.difficulty)}`);

    expect(bad).toEqual([]);
  });

  it("only ever writes dailyEligible as false", () => {
    // Absent means eligible. Writing `true` would work but invites someone to
    // start treating absence as ambiguous.
    const bad = animals
      .filter((animal) => animal.dailyEligible !== undefined)
      .filter((animal) => animal.dailyEligible !== false)
      .map((animal) => animal.commonName);

    expect(bad).toEqual([]);
  });
});

describe("data/animals.json calendar", () => {
  const daily = selectDailyAnimals(animals);

  it("keeps the daily pool mostly winnable", () => {
    const winnable = daily.filter((a) => a.difficulty !== "hard").length;
    expect(winnable / daily.length).toBeGreaterThanOrEqual(MIN_WINNABLE_SHARE);
  });

  it("never schedules two hard days in a row", () => {
    const runs = daily
      .map((animal, index) => ({ animal, index }))
      .filter(
        ({ animal, index }) =>
          index > 0 &&
          animal.difficulty === "hard" &&
          daily[index - 1].difficulty === "hard"
      )
      .map(({ animal, index }) => `#${index + 1} ${animal.commonName}`);

    expect(runs).toEqual([]);
  });

  it("puts every excluded animal after every eligible one", () => {
    // The client filters before indexing by day. If an excluded animal sat in
    // the middle, the eligible range would stop being contiguous and the
    // ordering script's frozen-prefix check could pass while the calendar still
    // shifted underneath already-played days.
    const firstExcluded = animals.findIndex((a) => a.dailyEligible === false);
    if (firstExcluded === -1) return;

    const stragglers = animals
      .slice(firstExcluded)
      .filter((animal) => animal.dailyEligible !== false)
      .map((animal) => animal.commonName);

    expect(stragglers).toEqual([]);
  });

  it("still has enough animals to be worth playing daily", () => {
    // Below about a month the repeat cycle becomes obvious to a regular.
    expect(daily.length).toBeGreaterThanOrEqual(30);
  });
});

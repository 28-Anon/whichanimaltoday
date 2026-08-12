import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateAnimalData, type AnimalRecord } from "../src/animalData";

/**
 * The eleven animals nobody can name — Chowsingha, Ibisbill, Saola, Great
 * Argus, Helmeted Hornbill, Horned Screamer, Boat-billed Heron, Mongolian
 * Saiga, Bald Uacari, Hoatzin and Spoon-billed Sandpiper — left
 * `data/animals.json` on 2026-08-12.
 *
 * They had been barred from the daily puzzle since the 2026-08-05 rebalance,
 * because no clue makes a player type "Chowsingha". What changed is that
 * `framer/TimerModeComponent.tsx` draws from the whole file and filters
 * nothing, so they were still answers in Beat the Clock — and played rather
 * than reasoned about, a four-option question does not make an unfamiliar name
 * enjoyable.
 *
 * Retiring rather than deleting keeps their hints, fun facts, bonus rounds and
 * images, so the decision reverses by moving records back. These assertions are
 * what make that promise real: nothing is in both files, and a retired record
 * is still valid enough to return.
 */
const read = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../data/${name}`, import.meta.url)),
      "utf8"
    )
  ) as AnimalRecord[];

const animals = read("animals.json");
const retired = read("retired.json");

describe("data/retired.json", () => {
  it("holds the eleven animals that left the pool", () => {
    expect(retired).toHaveLength(11);
  });

  it("shares no animal with data/animals.json", () => {
    const live = new Set(animals.map((animal) => animal.commonName));
    const both = retired
      .map((animal) => animal.commonName)
      .filter((name) => live.has(name));

    expect(both).toEqual([]);
  });

  it("keeps every retired record valid, so it can be restored", () => {
    expect(validateAnimalData(retired)).toEqual([]);
  });
});

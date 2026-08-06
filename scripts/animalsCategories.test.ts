import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALLOWED_CATEGORIES } from "../src/animalData";

/**
 * Guards the category field in the live data file.
 *
 * `validateAnimalData` lowercases before comparing, so "Mammal", "mammal" and
 * "MAMMAL" all pass it — and on 2026-08-05 the file held all of "Mammal"/
 * "mammal", "Bird"/"bird", "Reptile"/"reptile" and "Amphibian"/"amphibian":
 * eleven distinct values for seven categories, across 58 records.
 *
 * Nothing broke, which is exactly why it survived. Every consumer happens to
 * lowercase first — the share-card emoji lookup in `GameComponent.tsx` and the
 * same-category decoy filter in `TimerModeComponent.tsx`. The damage is latent:
 * anything that *groups* by category rather than comparing it gets "Mammal" and
 * "mammal" as two separate groups, which is what a browsable animal index would
 * do on its first render.
 *
 * So the canonical form is asserted here, case-sensitively, rather than by
 * tightening the validator — a stricter validator would reject a content import
 * whose CSV merely capitalised a column, which is a real annoyance for a fixable
 * detail. This fails loudly in CI instead, and the fix is to lowercase the field.
 */
const animals = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../data/animals.json", import.meta.url)),
    "utf8"
  )
) as { commonName: string; category: string }[];

describe("data/animals.json categories", () => {
  it("uses only the canonical values, in canonical case", () => {
    const offenders = animals
      .filter(
        (animal) =>
          !(ALLOWED_CATEGORIES as readonly string[]).includes(animal.category)
      )
      .map((animal) => `${animal.commonName}: "${animal.category}"`);

    expect(offenders).toEqual([]);
  });

  it("has no two values that differ only by case or whitespace", () => {
    const byNormalised = new Map<string, Set<string>>();
    for (const { category } of animals) {
      const key = category.trim().toLowerCase();
      const seen = byNormalised.get(key) ?? new Set<string>();
      seen.add(category);
      byNormalised.set(key, seen);
    }

    const split = [...byNormalised.entries()]
      .filter(([, variants]) => variants.size > 1)
      .map(([key, variants]) => `${key}: ${[...variants].join(" / ")}`);

    expect(split).toEqual([]);
  });

  it("still covers every animal", () => {
    expect(animals.every((animal) => animal.category.length > 0)).toBe(true);
  });
});

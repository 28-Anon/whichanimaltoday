import { describe, it, expect } from "vitest";
import {
  buildCreditsPage,
  readAnimals,
  readCreditsPage,
} from "./generateCreditsPage";

const normalise = (text: string) => text.replace(/\r\n/g, "\n");

/**
 * The published credits page is how the CC BY and CC BY-SA attribution
 * requirement is met for every photo on the site. Letting it drift is not a
 * documentation problem — an unattributed or misattributed CC work is a
 * licence breach, and under CC 3.0 and 2.0 the licence terminates without an
 * automatic cure period.
 *
 * It drifted once already. Replacing an image edits data/animals.json, and
 * only scripts/acceptCandidates.ts regenerates the credits, so by 2026-08-03
 * thirteen entries credited the photographer of a picture no longer on the
 * site. These tests make that a red suite instead.
 */
describe("credits page", () => {
  it("matches data/animals.json", () => {
    expect(normalise(readCreditsPage())).toBe(
      normalise(buildCreditsPage(readAnimals()))
    );
  });

  it("credits every animal", () => {
    const animals = readAnimals();
    const page = readCreditsPage();
    const uncredited = animals.filter(
      (animal) => !page.includes(`| ${animal.commonName} |`)
    );
    expect(uncredited.map((a) => a.commonName)).toEqual([]);
  });

  it("names a licence for every photo", () => {
    // "Photo: Unsplash" is the shape this catches: a source with no creator
    // and no licence. Unsplash's own licence waives attribution, so it is not
    // an infringement, but it is unverifiable — nothing records which photo it
    // is or where it came from.
    const unlicensed = readAnimals().filter(
      (animal) =>
        !/CC0|CC BY|public domain|Unsplash/i.test(animal.imageAttribution)
    );
    expect(unlicensed.map((a) => a.commonName)).toEqual([]);
  });
});

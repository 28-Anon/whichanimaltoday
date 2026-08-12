import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards the photo licences in the live data file.
 *
 * The advertising makes this substantive rather than a technicality: a CC
 * NonCommercial photograph cannot be used on a page carrying ads, and a
 * NoDerivatives one cannot be resized — and every image is now resized, into
 * `images/display/`, by `scripts/generateDisplayImages.ts`.
 *
 * `isAllowedLicence` in `scripts/pipeline/gates.ts` already rejects both when
 * the pipeline *accepts* an image. This asserts the same thing about what is
 * actually in the file, so a record added or edited by hand cannot bypass that
 * gate. All 89 records passed when this was written on 2026-08-12.
 *
 * The regex is asserted before the data is, because a guard whose pattern has
 * silently stopped matching is worse than no guard: it reports success forever.
 */
export const BLOCKED_LICENCE_IN_DATA =
  /\bnc\b|noncommercial|non-commercial|\bnd\b|noderiv|fair use/i;

const animals = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../data/animals.json", import.meta.url)),
    "utf8"
  )
) as { commonName: string; imageAttribution: string }[];

describe("data/animals.json photo licences", () => {
  it("rejects the licence strings it is meant to reject", () => {
    expect(BLOCKED_LICENCE_IN_DATA.test("CC BY-NC 4.0")).toBe(true);
    expect(BLOCKED_LICENCE_IN_DATA.test("CC BY-ND 4.0")).toBe(true);
    expect(BLOCKED_LICENCE_IN_DATA.test("CC BY-NC-SA 2.0")).toBe(true);
  });

  it("admits the licences the project actually uses", () => {
    expect(BLOCKED_LICENCE_IN_DATA.test("CC BY-SA 4.0")).toBe(false);
    expect(BLOCKED_LICENCE_IN_DATA.test("CC BY 4.0")).toBe(false);
    expect(BLOCKED_LICENCE_IN_DATA.test("CC0 1.0")).toBe(false);
    expect(BLOCKED_LICENCE_IN_DATA.test("Public domain")).toBe(false);
  });

  it("carries no non-commercial or no-derivatives photo", () => {
    const offenders = animals
      .filter((animal) =>
        BLOCKED_LICENCE_IN_DATA.test(animal.imageAttribution ?? "")
      )
      .map((animal) => `${animal.commonName}: ${animal.imageAttribution}`);

    expect(offenders).toEqual([]);
  });
});

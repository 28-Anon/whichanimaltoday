import { describe, expect, it } from "vitest";
import {
  buildObservationsUrl,
  normaliseLicence,
  toCandidates,
} from "./inaturalistQuery";

const observation = (photo: Record<string, unknown>) => ({
  results: [
    {
      taxon: { name: "Vulpes vulpes" },
      photos: [{ id: 1, url: "https://x/photos/1/square.jpg", ...photo }],
    },
  ],
});

const licensed = (extra: Record<string, unknown> = {}) =>
  observation({
    license_code: "cc-by",
    attribution: "(c) Jane Doe, some rights reserved (CC BY)",
    ...extra,
  });

describe("buildObservationsUrl", () => {
  it("asks only for research-grade observations with photos", () => {
    const url = buildObservationsUrl("Vulpes vulpes");
    expect(url).toContain("quality_grade=research");
    expect(url).toContain("photos=true");
    expect(url).toContain("taxon_name=Vulpes+vulpes");
  });

  it("restricts the licence at the API rather than filtering afterwards", () => {
    expect(buildObservationsUrl("Vulpes vulpes")).toContain(
      "photo_license=cc0%2Ccc-by%2Ccc-by-sa"
    );
  });
});

describe("normaliseLicence", () => {
  /**
   * iNaturalist returns hyphenated codes; gates.ts expects the spaced form and
   * fails closed on anything it does not recognise. Without this mapping every
   * usable photograph would be silently rejected — the failure would look like
   * "iNaturalist has nothing for this animal".
   */
  it("maps the permitted codes to the form gates.ts and credits.md use", () => {
    expect(normaliseLicence("cc0")).toBe("CC0 1.0");
    expect(normaliseLicence("cc-by")).toBe("CC BY 4.0");
    expect(normaliseLicence("cc-by-sa")).toBe("CC BY-SA 4.0");
  });

  it("rejects non-commercial, no-derivatives and all-rights-reserved", () => {
    expect(normaliseLicence("cc-by-nc")).toBeNull();
    expect(normaliseLicence("cc-by-nd")).toBeNull();
    expect(normaliseLicence("cc-by-nc-sa")).toBeNull();
    expect(normaliseLicence(null)).toBeNull();
    expect(normaliseLicence(undefined)).toBeNull();
  });
});

describe("toCandidates", () => {
  it("builds a large-size URL from the square one", () => {
    const [candidate] = toCandidates(
      licensed({ original_dimensions: { width: 2048, height: 1536 } })
    );
    expect(candidate.file).toBe("https://x/photos/1/large.jpg");
  });

  /**
   * Measured against the live API on 2026-08-12: an observation reporting
   * original_dimensions 2048x1365 serves 1024x683 from its large.jpg. The
   * candidate must describe the file the pipeline actually fetches, not the
   * original nobody downloads.
   */
  it("reports the size the large derivative actually serves", () => {
    const [candidate] = toCandidates(
      licensed({ original_dimensions: { width: 2048, height: 1365 } })
    );
    expect(candidate.width).toBe(1024);
    expect(candidate.height).toBe(683);
  });

  it("leaves an image already under the cap alone", () => {
    const [candidate] = toCandidates(
      licensed({ original_dimensions: { width: 900, height: 600 } })
    );
    expect(candidate.width).toBe(900);
    expect(candidate.height).toBe(600);
  });

  it("scales on the long side, so a portrait is not overstated", () => {
    const [candidate] = toCandidates(
      licensed({ original_dimensions: { width: 1365, height: 2048 } })
    );
    expect(candidate.height).toBe(1024);
    expect(candidate.width).toBe(683);
  });

  it("extracts the photographer from the attribution string", () => {
    const [candidate] = toCandidates(
      observation({
        license_code: "cc0",
        attribution: "(c) Jane Doe, no rights reserved (CC0)",
      })
    );
    expect(candidate.artist).toBe("Jane Doe");
  });

  it("drops a photo whose licence is not permitted", () => {
    expect(
      toCandidates(
        observation({ license_code: "cc-by-nc", attribution: "(c) Jane Doe" })
      )
    ).toEqual([]);
  });

  it("drops a photo with no licence at all", () => {
    expect(
      toCandidates(
        observation({ license_code: null, attribution: "(c) Jane Doe" })
      )
    ).toEqual([]);
  });

  it("survives a payload with no results", () => {
    expect(toCandidates({})).toEqual([]);
    expect(toCandidates({ results: [] })).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { resolveQuery, queryOverrideError, resolveTargets } from "./searchQuery";

const bat = { commonName: "Bat", species: "Flying fox" };
const axolotl = { commonName: "Axolotl" };

describe("resolveQuery", () => {
  it("prefers the scientific name on the record", () => {
    expect(resolveQuery(bat)).toBe("Flying fox");
  });

  it("falls back to the common name when there is no species", () => {
    expect(resolveQuery(axolotl)).toBe("Axolotl");
  });

  it("lets an override win, which is the whole point", () => {
    expect(resolveQuery(bat, "Pteropus medius")).toBe("Pteropus medius");
  });

  it("ignores an override that is empty or only whitespace", () => {
    expect(resolveQuery(bat, "")).toBe("Flying fox");
    expect(resolveQuery(bat, "   ")).toBe("Flying fox");
  });

  it("trims the override, so a stray quote or space does not become the query", () => {
    expect(resolveQuery(bat, "  Pteropus medius  ")).toBe("Pteropus medius");
  });
});

describe("resolveTargets", () => {
  const animals = [bat, { commonName: "Seal", species: "Grey seal" }];

  it("finds an existing animal, case-insensitively", () => {
    expect(resolveTargets(animals, ["bat"], false)[0]).toEqual(bat);
  });

  it("refuses an unknown name and says how to source one", () => {
    expect(() => resolveTargets(animals, ["Piranha"], false)).toThrow(
      /not in the game yet/
    );
  });

  /**
   * The chicken and egg this exists for: an animal cannot be added to
   * animals.json without an imageUrl, and the imageUrl is what is being sourced.
   */
  it("accepts an unknown name when told the animal is new", () => {
    expect(resolveTargets(animals, ["Piranha"], true)).toEqual([
      { commonName: "Piranha" },
    ]);
  });

  it("prefers the real record even in new mode, so a typo cannot fork an animal", () => {
    expect(resolveTargets(animals, ["Bat"], true)[0]).toEqual(bat);
  });

  it("keeps the order it was given", () => {
    const names = resolveTargets(animals, ["Seal", "Piranha", "Bat"], true).map(
      (a) => a.commonName
    );
    expect(names).toEqual(["Seal", "Piranha", "Bat"]);
  });
});

describe("queryOverrideError", () => {
  it("allows an override for a single animal", () => {
    expect(queryOverrideError(1, "Pteropus medius")).toBeNull();
  });

  it("refuses an override spanning several animals", () => {
    const error = queryOverrideError(3, "Pteropus medius");
    expect(error).toContain("one animal at a time");
    expect(error).toContain("3");
  });

  it("says nothing when no override was given", () => {
    expect(queryOverrideError(3)).toBeNull();
    expect(queryOverrideError(3, "  ")).toBeNull();
  });
});

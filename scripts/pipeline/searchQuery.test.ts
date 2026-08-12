import { describe, expect, it } from "vitest";
import { resolveQuery, queryOverrideError } from "./searchQuery";

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

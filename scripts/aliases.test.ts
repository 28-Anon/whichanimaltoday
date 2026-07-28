import { describe, it, expect } from "vitest";
import { parseAliases } from "./aliases";

describe("parseAliases", () => {
  it("splits a comma-separated list and trims whitespace", () => {
    expect(parseAliases("Giraffa camelopardalis, giraffe")).toEqual([
      "Giraffa camelopardalis",
      "giraffe",
    ]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseAliases("")).toEqual([]);
  });

  it("returns an empty array for whitespace-only input", () => {
    expect(parseAliases("   ")).toEqual([]);
  });

  it("returns a single-item array for one alias with no commas", () => {
    expect(parseAliases("puma")).toEqual(["puma"]);
  });
});

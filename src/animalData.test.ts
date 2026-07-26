import { describe, it, expect } from "vitest";
import { validateAnimalData, type AnimalRecord } from "./animalData";

function makeValidRecord(overrides: Partial<AnimalRecord> = {}): AnimalRecord {
  return {
    commonName: "Elephant",
    aliases: [],
    hint1: "Found on multiple continents.",
    hint2: "Largest living land animal.",
    hint3: "Has the biggest ears of any animal.",
    funFacts: "Elephants can recognize themselves in mirrors.",
    category: "mammal",
    imageAttribution: "Wikimedia Commons, CC BY-SA 4.0",
    ...overrides,
  };
}

describe("validateAnimalData", () => {
  it("returns no errors for a fully valid list", () => {
    expect(validateAnimalData([makeValidRecord()])).toEqual([]);
  });

  it("flags an empty commonName", () => {
    const errors = validateAnimalData([makeValidRecord({ commonName: "" })]);
    expect(errors.some((e) => e.includes("commonName is empty"))).toBe(true);
  });

  it("flags a duplicate commonName", () => {
    const errors = validateAnimalData([makeValidRecord(), makeValidRecord()]);
    expect(errors.some((e) => e.includes("duplicate commonName"))).toBe(true);
  });

  it("flags a missing hint", () => {
    const errors = validateAnimalData([makeValidRecord({ hint2: "" })]);
    expect(errors.some((e) => e.includes("hint2 is empty"))).toBe(true);
  });

  it("flags an invalid category", () => {
    const errors = validateAnimalData([
      makeValidRecord({ category: "dinosaur" }),
    ]);
    expect(errors.some((e) => e.includes('category "dinosaur"'))).toBe(true);
  });
});

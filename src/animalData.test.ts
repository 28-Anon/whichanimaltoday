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
    imageUrl: "https://upload.wikimedia.org/elephant.jpg",
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

  it("accepts a capitalised category", () => {
    // Every one of the 34 curated records writes "Mammal", "Fish", "Marine"
    // and so on. The category list is lowercase, so a case-sensitive
    // comparison rejected 100% of real data — which is why this validator
    // was never wired into the import pipeline.
    expect(validateAnimalData([makeValidRecord({ category: "Mammal" })])).toEqual(
      []
    );
    expect(validateAnimalData([makeValidRecord({ category: "MARINE" })])).toEqual(
      []
    );
  });

  it("flags an empty imageUrl", () => {
    const errors = validateAnimalData([makeValidRecord({ imageUrl: "" })]);
    expect(errors.some((e) => e.includes("imageUrl is empty"))).toBe(true);
  });

  it("flags an imageUrl that isn't https", () => {
    // Plain http would be silently upgraded or blocked depending on the
    // browser, and the URL goes straight into an <img src>.
    const errors = validateAnimalData([
      makeValidRecord({ imageUrl: "http://example.com/x.jpg" }),
    ]);
    expect(errors.some((e) => e.includes("imageUrl must start with https://"))).toBe(
      true
    );
  });

  it("flags a non-http scheme in imageUrl", () => {
    const errors = validateAnimalData([
      makeValidRecord({ imageUrl: "javascript:alert(1)" }),
    ]);
    expect(errors.some((e) => e.includes("imageUrl must start with https://"))).toBe(
      true
    );
  });
});

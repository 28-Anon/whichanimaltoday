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

const validBonus = {
  question: "You found a mole. But which one?",
  options: ["European Mole", "Eastern Mole", "Star-Nosed Mole", "Hairy-Tailed Mole"],
  answerIndex: 2,
};

describe("bonus round validation", () => {
  it("accepts a record with no bonus at all", () => {
    expect(validateAnimalData([makeValidRecord()])).toEqual([]);
  });

  it("accepts a well-formed bonus round", () => {
    const record = makeValidRecord({
      commonName: "Mole",
      species: "Star-Nosed Mole",
      bonus: validBonus,
    });
    expect(validateAnimalData([record])).toEqual([]);
  });

  it("rejects a bonus with an empty question", () => {
    const record = makeValidRecord({
      commonName: "Mole",
      bonus: { ...validBonus, question: "  " },
    });
    expect(validateAnimalData([record])).toContain(
      "Row 1 (Mole): bonus.question is empty"
    );
  });

  it("rejects a bonus that does not have exactly 4 options", () => {
    const record = makeValidRecord({
      commonName: "Mole",
      bonus: { ...validBonus, options: ["a", "b", "c"], answerIndex: 0 },
    });
    expect(validateAnimalData([record])).toContain(
      "Row 1 (Mole): bonus.options must have exactly 4 entries (got 3)"
    );
  });

  it("rejects an empty option", () => {
    const record = makeValidRecord({
      commonName: "Mole",
      bonus: {
        ...validBonus,
        options: ["European Mole", "  ", "Star-Nosed Mole", "Hairy-Tailed Mole"],
      },
    });
    expect(validateAnimalData([record])).toContain(
      "Row 1 (Mole): bonus.options contains an empty entry"
    );
  });

  it("rejects duplicate options, compared case-insensitively", () => {
    const record = makeValidRecord({
      commonName: "Mole",
      bonus: {
        ...validBonus,
        options: ["European Mole", "european mole", "Star-Nosed Mole", "Hairy-Tailed Mole"],
      },
    });
    expect(validateAnimalData([record])).toContain(
      'Row 1 (Mole): bonus.options contains duplicate "european mole"'
    );
  });

  it("rejects an answerIndex outside the options", () => {
    const record = makeValidRecord({
      commonName: "Mole",
      bonus: { ...validBonus, answerIndex: 4 },
    });
    expect(validateAnimalData([record])).toContain(
      "Row 1 (Mole): bonus.answerIndex must be an integer within options (got 4)"
    );
  });

  it("rejects the species being listed as a decoy", () => {
    const record = makeValidRecord({
      commonName: "Mole",
      species: "Star-Nosed Mole",
      bonus: { ...validBonus, answerIndex: 0 },
    });
    expect(validateAnimalData([record])).toContain(
      'Row 1 (Mole): species "Star-Nosed Mole" is listed as a decoy at index 2, but answerIndex is 0'
    );
  });

  it("allows a fact-round bonus on a record that also has a species", () => {
    const record = makeValidRecord({
      commonName: "Mole",
      species: "Star-Nosed Mole",
      bonus: {
        question: "Which of these is true about me?",
        options: ["I glow", "I have 22 nose tentacles", "I fly", "I sing"],
        answerIndex: 1,
      },
    });
    expect(validateAnimalData([record])).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import {
  findUnrepresentableFields,
  checkAnimalsFileOverwrite,
} from "./animalsFileGuard";

const FLAT_RECORD = {
  commonName: "European Mole",
  aliases: ["mole"],
  imageUrl: "https://example.com/mole.jpg",
  hint1: "one",
  hint2: "two",
  hint3: "three",
  funFacts: "facts",
  category: "Mammal",
  imageAttribution: "Photo: Someone",
};

describe("findUnrepresentableFields", () => {
  it("finds nothing in records of the flat shape", () => {
    expect(findUnrepresentableFields([FLAT_RECORD, FLAT_RECORD])).toEqual([]);
  });

  it("finds species", () => {
    expect(
      findUnrepresentableFields([
        FLAT_RECORD,
        { ...FLAT_RECORD, species: "Talpa europaea" },
      ])
    ).toEqual(["species"]);
  });

  it("finds bonus", () => {
    expect(
      findUnrepresentableFields([
        { ...FLAT_RECORD, bonus: { question: "q", options: [], answerIndex: 0 } },
      ])
    ).toEqual(["bonus"]);
  });

  it("reports both, deduplicated and in a stable order", () => {
    expect(
      findUnrepresentableFields([
        { ...FLAT_RECORD, bonus: { question: "q", options: [], answerIndex: 0 } },
        { ...FLAT_RECORD, species: "Talpa europaea" },
        { ...FLAT_RECORD, species: "Scalopus aquaticus" },
      ])
    ).toEqual(["species", "bonus"]);
  });

  it("counts a key that is present but empty", () => {
    // The round-trip would drop the key either way, and an empty species is
    // still a deliberate edit someone made.
    expect(
      findUnrepresentableFields([{ ...FLAT_RECORD, species: "" }])
    ).toEqual(["species"]);
  });

  it("counts an explicitly undefined key", () => {
    expect(
      findUnrepresentableFields([{ ...FLAT_RECORD, species: undefined }])
    ).toEqual(["species"]);
  });

  it("ignores non-array and non-object input rather than throwing", () => {
    expect(findUnrepresentableFields(null)).toEqual([]);
    expect(findUnrepresentableFields({ species: "not an array" })).toEqual([]);
    expect(findUnrepresentableFields(["string", 42, null])).toEqual([]);
  });
});

describe("checkAnimalsFileOverwrite", () => {
  it("allows the write when the file does not exist", () => {
    expect(checkAnimalsFileOverwrite(null)).toEqual({ allowed: true });
  });

  it("allows the write when every record is the flat shape", () => {
    expect(
      checkAnimalsFileOverwrite(JSON.stringify([FLAT_RECORD]))
    ).toEqual({ allowed: true });
  });

  it("allows the write when the file is an empty list", () => {
    expect(checkAnimalsFileOverwrite("[]")).toEqual({ allowed: true });
  });

  it("refuses when a record carries species, naming the field", () => {
    const check = checkAnimalsFileOverwrite(
      JSON.stringify([{ ...FLAT_RECORD, species: "Talpa europaea" }])
    );
    expect(check.allowed).toBe(false);
    expect(check.allowed === false && check.reason).toMatch(/`species`/);
    expect(check.allowed === false && check.reason).toMatch(/destroy/);
  });

  it("refuses when a record carries bonus, naming the field", () => {
    const check = checkAnimalsFileOverwrite(
      JSON.stringify([
        { ...FLAT_RECORD, bonus: { question: "q", options: [], answerIndex: 0 } },
      ])
    );
    expect(check.allowed).toBe(false);
    expect(check.allowed === false && check.reason).toMatch(/`bonus`/);
  });

  it("refuses unparseable contents rather than assuming they are empty", () => {
    const check = checkAnimalsFileOverwrite("{ not json");
    expect(check.allowed).toBe(false);
    expect(check.allowed === false && check.reason).toMatch(/could not be parsed/);
  });
});

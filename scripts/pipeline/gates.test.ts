import { describe, it, expect } from "vitest";
import {
  isAllowedLicence,
  hasBlockedName,
  findAliasCollisions,
  leaksAnswer,
} from "./gates";

describe("isAllowedLicence", () => {
  it.each(["CC0", "CC BY 4.0", "CC BY-SA 3.0", "Public domain", "PD-US"])(
    "allows %s",
    (licence) => {
      expect(isAllowedLicence(licence)).toBe(true);
    }
  );

  // The site carries advertising, so NonCommercial is a substantive problem
  // rather than a technicality; ND is excluded because the pipeline resizes.
  it.each([
    "CC BY-NC 4.0",
    "CC BY-ND 4.0",
    "CC BY-NC-SA 3.0",
    "Fair use",
    "",
    "   ",
  ])("rejects %s", (licence) => {
    expect(isAllowedLicence(licence)).toBe(false);
  });

  it("rejects a licence it does not recognise at all", () => {
    // Fail closed. An unknown licence string is not evidence of permission.
    expect(isAllowedLicence("Some Museum Terms v2")).toBe(false);
  });
});

describe("hasBlockedName", () => {
  it("catches the vandalised common name found during the spike", () => {
    // Homo rhodesiensis is labelled "Cumshot man" on Wikidata, and it clears
    // a 40-language fame floor. Aliases are player-visible.
    expect(hasBlockedName(["Cumshot man"])).toBe("Cumshot man");
  });

  it("returns null for ordinary animal names", () => {
    expect(hasBlockedName(["Star-nosed Mole", "European Mole"])).toBeNull();
  });

  it("is case-insensitive and matches inside a longer string", () => {
    expect(hasBlockedName(["the CUMSHOT bat"])).toBe("the CUMSHOT bat");
  });

  it("does not reject real animal names that embed awkward substrings", () => {
    // A naive profanity list rejects these. They are real species.
    expect(hasBlockedName(["Great Tit"])).toBeNull();
    expect(hasBlockedName(["Sperm Whale"])).toBeNull();
    expect(hasBlockedName(["Horned Screamer"])).toBeNull();
  });
});

describe("findAliasCollisions", () => {
  it("flags a common name shared by two distinct species", () => {
    // Measured in the spike: `beluga` is both a whale and a sturgeon.
    const candidates = [
      { taxonName: "Delphinapterus leucas", commonNames: ["beluga"] },
      { taxonName: "Huso huso", commonNames: ["beluga"] },
    ] as never;
    expect(findAliasCollisions(candidates).get("beluga")).toEqual([
      "Delphinapterus leucas",
      "Huso huso",
    ]);
  });

  it("does not flag a name used by only one species", () => {
    const candidates = [
      { taxonName: "A", commonNames: ["unique"] },
    ] as never;
    expect(findAliasCollisions(candidates).size).toBe(0);
  });

  it("does not flag the same species listing a name twice", () => {
    const candidates = [
      { taxonName: "A", commonNames: ["beluga", "Beluga"] },
    ] as never;
    expect(findAliasCollisions(candidates).size).toBe(0);
  });

  it("compares case-insensitively", () => {
    const candidates = [
      { taxonName: "A", commonNames: ["Beluga"] },
      { taxonName: "B", commonNames: ["beluga"] },
    ] as never;
    expect(findAliasCollisions(candidates).size).toBe(1);
  });
});

describe("leaksAnswer", () => {
  it("catches a hint containing the common name", () => {
    expect(leaksAnswer("I am the tallest giraffe-like animal", ["Giraffe"])).toBe(
      true
    );
  });

  it("catches a word from the species name", () => {
    expect(leaksAnswer("My star nose has 22 tentacles", ["Star-nosed Mole"])).toBe(
      true
    );
  });

  it("allows a hint that describes without naming", () => {
    expect(leaksAnswer("My tongue can be almost 50 cm long", ["Giraffe"])).toBe(
      false
    );
  });

  it("ignores short filler words in the name", () => {
    // "of" and "the" appear in names like "unicorn of the sea" and must not
    // make every hint containing them a false positive.
    expect(
      leaksAnswer("I live in the cold northern sea", ["unicorn of the sea"])
    ).toBe(false);
  });

  it("is case-insensitive and ignores punctuation", () => {
    expect(leaksAnswer("I am a GIRAFFE!", ["giraffe"])).toBe(true);
  });

  it("checks every supplied name, not just the first", () => {
    expect(leaksAnswer("I am a mole", ["Star-nosed Mole", "Condylura"])).toBe(
      true
    );
  });
});

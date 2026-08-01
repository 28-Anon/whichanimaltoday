import { describe, it, expect } from "vitest";
import { deriveFamilyName, collectKnownFamilies } from "./familyName";

describe("deriveFamilyName", () => {
  it("takes the head noun of a multi-word common name", () => {
    expect(deriveFamilyName(["Star-nosed Mole"])).toBe("Mole");
    expect(deriveFamilyName(["Emperor Penguin"])).toBe("Penguin");
    expect(deriveFamilyName(["Brown-throated Three-toed Sloth"])).toBe("Sloth");
  });

  it("returns null for a single-word name, which is already the family", () => {
    expect(deriveFamilyName(["Capybara"])).toBeNull();
    expect(deriveFamilyName(["Narwhal"])).toBeNull();
  });

  it("prefers a variant that is already the bare family", () => {
    expect(deriveFamilyName(["Common Octopus", "Octopus"])).toBe("Octopus");
  });

  it("refuses names where broadening would be factually wrong", () => {
    // A red panda is not a panda. Broadening would make `panda` a winning
    // guess for an animal that is not one.
    expect(deriveFamilyName(["Red Panda"])).toBeNull();
  });

  it("still broadens the lookalike case that IS correct", () => {
    // Sea Otter -> Otter is right, and is indistinguishable from Red Panda
    // -> Panda by any rule. Hence the explicit deny list.
    expect(deriveFamilyName(["Sea Otter"])).toBe("Otter");
  });

  it("returns null for an empty or blank list", () => {
    expect(deriveFamilyName([])).toBeNull();
    expect(deriveFamilyName(["   "])).toBeNull();
  });

  it("capitalises the derived family name", () => {
    expect(deriveFamilyName(["fennec fox"])).toBe("Fox");
  });

  it("ignores a trailing possessive or punctuation on the head noun", () => {
    expect(deriveFamilyName(["Hoffmann's Two-toed Sloth"])).toBe("Sloth");
  });

  it("ignores a single-word variant that is not the head noun of another name", () => {
    // Live data: "Pink Fairy Armadillo" also carries the Spanish name
    // "Pichiciego". Preferring the shortest single word suggested a foreign
    // synonym as the family. The head noun is the family.
    expect(deriveFamilyName(["Pink Fairy Armadillo", "Pichiciego"])).toBe(
      "Armadillo"
    );
  });

  it("still prefers a single-word variant when it IS the head noun", () => {
    expect(deriveFamilyName(["Common Octopus", "Octopus"])).toBe("Octopus");
  });

  it("returns null when the head noun equals the name it came from", () => {
    // "Lion" suggesting "Lion" is noise in the review sheet, not a split.
    expect(deriveFamilyName(["Lion", "African Lion"])).toBeNull();
    expect(deriveFamilyName(["Hippopotamus"])).toBeNull();
  });

  it("returns null when the pool does not corroborate the head noun", () => {
    // Live data: "Cu Lan" is a Vietnamese name for the slow loris, and its
    // head noun "Lan" is meaningless. Nothing else in the pool ends in it.
    const families = new Set(["mole", "otter"]);
    expect(deriveFamilyName(["Cu Lan"], families)).toBeNull();
    expect(deriveFamilyName(["Star-nosed Mole"], families)).toBe("Mole");
  });
});

describe("collectKnownFamilies", () => {
  it("keeps a head noun shared by two or more species", () => {
    const families = collectKnownFamilies([
      ["Star-nosed Mole"],
      ["European Mole"],
      ["Cu Lan"],
    ]);
    expect(families.has("mole")).toBe(true);
    expect(families.has("lan")).toBe(false);
  });

  it("does not let one species corroborate itself", () => {
    // Several variants of the same animal ending in the same word is not
    // evidence that the word names a family.
    const families = collectKnownFamilies([["Cu Lan", "Slow Lan"]]);
    expect(families.has("lan")).toBe(false);
  });

  it("ignores single-word names, which have no head noun", () => {
    expect(collectKnownFamilies([["Capybara"], ["Narwhal"]]).size).toBe(0);
  });
});

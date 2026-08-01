import { describe, it, expect } from "vitest";
import { deriveFamilyName } from "./familyName";

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
});

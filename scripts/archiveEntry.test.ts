import { describe, it, expect } from "vitest";
import { buildArchiveEntry } from "./archiveEntry";
import type { ArchivableAnimal } from "./framerClient";

const animals: ArchivableAnimal[] = [
  {
    commonName: "Elephant",
    imageUrl: "https://example.com/elephant.jpg",
    funFacts: "Elephants can recognize themselves in a mirror.",
    category: "mammal",
    imageAttribution: "Wikimedia Commons - CC BY-SA 4.0",
  },
  {
    commonName: "Axolotl",
    imageUrl: "https://example.com/axolotl.jpg",
    funFacts: "Axolotls can regrow entire limbs.",
    category: "amphibian",
    imageAttribution: "Wikimedia Commons - CC BY-SA 4.0",
  },
];

describe("buildArchiveEntry", () => {
  const launchDate = new Date("2026-08-01T00:00:00Z");

  it("builds puzzle #1 for the launch date", () => {
    const entry = buildArchiveEntry(animals, launchDate, launchDate);
    expect(entry).toEqual({
      puzzleNumber: 1,
      date: "2026-08-01",
      slug: "elephant-1",
      commonName: "Elephant",
      imageUrl: "https://example.com/elephant.jpg",
      funFacts: "Elephants can recognize themselves in a mirror.",
      category: "mammal",
      imageAttribution: "Wikimedia Commons - CC BY-SA 4.0",
    });
  });

  it("builds puzzle #2 for the next day, wrapping to the next animal", () => {
    const dayTwo = new Date("2026-08-02T00:00:00Z");
    const entry = buildArchiveEntry(animals, dayTwo, launchDate);
    expect(entry.puzzleNumber).toBe(2);
    expect(entry.date).toBe("2026-08-02");
    expect(entry.commonName).toBe("Axolotl");
    expect(entry.slug).toBe("axolotl-2");
  });
});

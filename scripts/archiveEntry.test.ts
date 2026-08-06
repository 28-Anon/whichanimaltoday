import { describe, it, expect } from "vitest";
import { buildArchiveEntry } from "./archiveEntry";
import type { ArchivableAnimal } from "./framerClient";

const animals: ArchivableAnimal[] = [
  {
    commonName: "Elephant",
    aliases: [],
    imageUrl: "https://example.com/elephant.jpg",
    hint1: "Hint one.",
    hint2: "Hint two.",
    hint3: "Hint three.",
    funFacts: "Elephants can recognize themselves in a mirror.",
    category: "mammal",
    imageAttribution: "Wikimedia Commons - CC BY-SA 4.0",
  },
  {
    commonName: "Axolotl",
    aliases: ["mexican walking fish"],
    imageUrl: "https://example.com/axolotl.jpg",
    hint1: "Hint one.",
    hint2: "Hint two.",
    hint3: "Hint three.",
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

  it("carries species through to the archive entry", () => {
    const animalsWithSpecies: ArchivableAnimal[] = [
      {
        commonName: "Mole",
        aliases: [],
        imageUrl: "https://example.com/mole.jpg",
        hint1: "h1",
        hint2: "h2",
        hint3: "h3",
        funFacts: "facts",
        category: "Mammal",
        imageAttribution: "Photo: Someone",
        species: "Star-Nosed Mole",
      },
    ];
    const entry = buildArchiveEntry(
      animalsWithSpecies,
      new Date("2026-08-01T00:00:00Z"),
      new Date("2026-08-01T00:00:00Z")
    );
    expect(entry.species).toBe("Star-Nosed Mole");
  });

  it("omits species when the animal has none", () => {
    const animalsWithoutSpecies: ArchivableAnimal[] = [
      {
        commonName: "Capybara",
        aliases: [],
        imageUrl: "https://example.com/capybara.jpg",
        hint1: "h1",
        hint2: "h2",
        hint3: "h3",
        funFacts: "facts",
        category: "Mammal",
        imageAttribution: "Photo: Someone",
      },
    ];
    const entry = buildArchiveEntry(
      animalsWithoutSpecies,
      new Date("2026-08-01T00:00:00Z"),
      new Date("2026-08-01T00:00:00Z")
    );
    expect(entry.species).toBeUndefined();
    expect(Object.hasOwn(entry, "species")).toBe(false);
  });
});

describe("buildArchiveEntry and the daily rotation filter", () => {
  // The archive must record the animal the game actually served. The game
  // filters out dailyEligible: false before indexing, so this has to as well —
  // otherwise the archive and the field journal quietly show a different animal
  // than players were asked to guess.
  const withExcluded: ArchivableAnimal[] = [
    { ...animals[0], commonName: "Giraffe" },
    { ...animals[0], commonName: "Chowsingha", dailyEligible: false },
    { ...animals[0], commonName: "Otter" },
  ];

  it("skips animals excluded from the daily rotation", () => {
    // Day 1 is the second eligible animal, which is Otter once Chowsingha is
    // filtered out — not Chowsingha itself.
    const entry = buildArchiveEntry(
      withExcluded,
      new Date("2026-08-02T00:15:00Z"),
      new Date("2026-08-01T00:00:00Z")
    );

    expect(entry.commonName).toBe("Otter");
  });

  it("wraps over the eligible animals only", () => {
    // Two eligible animals, so day 2 wraps back to the first.
    const entry = buildArchiveEntry(
      withExcluded,
      new Date("2026-08-03T00:15:00Z"),
      new Date("2026-08-01T00:00:00Z")
    );

    expect(entry.commonName).toBe("Giraffe");
  });
});

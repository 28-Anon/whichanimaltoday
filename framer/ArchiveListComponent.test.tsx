// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ArchiveListComponent from "./ArchiveListComponent";
import {
  animalFixture,
  pinClock,
  releaseClock,
  resetEnvironment,
  seedHistory,
  stubFetchByUrl,
} from "./testHarness";

/**
 * Covers the fix for "today's puzzle is missing from the journal until
 * tomorrow", reported on launch day.
 *
 * `buildJournal`'s own tests cover the joining rules. These cover the wiring
 * the pure function cannot see: that the component actually asks for the
 * animal list, works out the right day from it, and survives that request
 * failing.
 */

const ARCHIVE_WITH_YESTERDAY = [
  {
    puzzleNumber: 6,
    date: "2026-08-06",
    slug: "platypus-6",
    commonName: "Platypus",
    imageUrl: "https://x/p.jpg",
    funFacts: "",
    category: "mammal",
    imageAttribution: "",
  },
];

/** Seven animals so day index 6 — 2026-08-07 — lands on the last one. */
const ANIMALS = [
  ...Array.from({ length: 6 }, (_, i) =>
    animalFixture({ commonName: `Filler ${i}` })
  ),
  animalFixture({ commonName: "Otter" }),
];

let restore: (() => void) | undefined;

afterEach(() => {
  cleanup();
  restore?.();
  restore = undefined;
  releaseClock();
  resetEnvironment();
});

describe("today's entry in the field journal", () => {
  it("shows today once it has been solved, before the archive job runs", async () => {
    pinClock("2026-08-07T12:00:00Z");
    seedHistory([
      { date: "2026-08-06", puzzleNumber: 6, solved: true, guessesUsed: 2 },
      { date: "2026-08-07", puzzleNumber: 7, solved: true, guessesUsed: 1 },
    ]);
    restore = stubFetchByUrl({
      "archive.json": ARCHIVE_WITH_YESTERDAY,
      "animals.json": ANIMALS,
    });

    render(<ArchiveListComponent />);

    // The archive knows nothing about 2026-08-07 — the job writes it at 00:15
    // tomorrow — so finding the otter proves the stand-in entry was built.
    expect(await screen.findByText("Otter")).toBeTruthy();
    expect(screen.getByText("Platypus")).toBeTruthy();
  });

  it("sends today's card to the game, not to a detail page that would 404", async () => {
    pinClock("2026-08-07T12:00:00Z");
    seedHistory([
      { date: "2026-08-07", puzzleNumber: 7, solved: true, guessesUsed: 1 },
    ]);
    restore = stubFetchByUrl({
      "archive.json": [],
      "animals.json": ANIMALS,
    });

    render(<ArchiveListComponent />);
    await screen.findByText("Otter");

    const card = screen.getByText("Otter").closest("a");
    expect(card?.getAttribute("href")).toBe("/");
  });

  it("leaves today out while the puzzle is still unfinished", async () => {
    pinClock("2026-08-07T12:00:00Z");
    seedHistory([
      { date: "2026-08-06", puzzleNumber: 6, solved: true, guessesUsed: 2 },
    ]);
    restore = stubFetchByUrl({
      "archive.json": ARCHIVE_WITH_YESTERDAY,
      "animals.json": ANIMALS,
    });

    render(<ArchiveListComponent />);
    await screen.findByText("Platypus");

    // A day in progress is not a day they failed; stamping it "missed" hours
    // early would be worse than leaving it out.
    expect(screen.queryByText("Otter")).toBeNull();
  });

  // The animal list is a second network call to a host with no SLA. A journal
  // missing one day beats a journal that will not load at all.
  it("still renders the journal when the animal list cannot be fetched", async () => {
    pinClock("2026-08-07T12:00:00Z");
    seedHistory([
      { date: "2026-08-06", puzzleNumber: 6, solved: true, guessesUsed: 2 },
      { date: "2026-08-07", puzzleNumber: 7, solved: true, guessesUsed: 1 },
    ]);
    restore = stubFetchByUrl({
      "archive.json": ARCHIVE_WITH_YESTERDAY,
      "animals.json": null,
    });

    render(<ArchiveListComponent />);

    expect(await screen.findByText("Platypus")).toBeTruthy();
    expect(screen.queryByText("Otter")).toBeNull();
  });

  it("shows the error state when the archive itself fails", async () => {
    pinClock("2026-08-07T12:00:00Z");
    restore = stubFetchByUrl({ "archive.json": null, "animals.json": ANIMALS });

    render(<ArchiveListComponent />);

    await waitFor(() =>
      expect(screen.getByText(/Couldn't load the archive/i)).toBeTruthy()
    );
  });
});

import { describe, it, expect } from "vitest";
import { appendArchiveEntryIfMissing } from "./archiveStore";
import type { ArchiveEntry } from "./archiveEntry";

function makeEntry(overrides: Partial<ArchiveEntry> = {}): ArchiveEntry {
  return {
    puzzleNumber: 1,
    date: "2026-08-01",
    slug: "elephant-1",
    commonName: "Elephant",
    imageUrl: "https://example.com/elephant.jpg",
    funFacts: "Elephants can recognize themselves in a mirror.",
    category: "mammal",
    imageAttribution: "Wikimedia Commons - CC BY-SA 4.0",
    ...overrides,
  };
}

describe("appendArchiveEntryIfMissing", () => {
  it("appends to an empty list", () => {
    const result = appendArchiveEntryIfMissing([], makeEntry());
    expect(result).toEqual([makeEntry()]);
  });

  it("appends a new date to an existing list", () => {
    const existing = [makeEntry()];
    const newEntry = makeEntry({ date: "2026-08-02", puzzleNumber: 2 });
    const result = appendArchiveEntryIfMissing(existing, newEntry);
    expect(result).toEqual([makeEntry(), newEntry]);
  });

  it("does not duplicate an existing date", () => {
    const existing = [makeEntry()];
    const result = appendArchiveEntryIfMissing(existing, makeEntry());
    expect(result).toEqual([makeEntry()]);
    expect(result).toHaveLength(1);
  });
});

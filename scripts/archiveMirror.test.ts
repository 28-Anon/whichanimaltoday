import { describe, expect, it } from "vitest";
import { archiveFileFor, hotlinkedEntries, isOurs, type ArchiveEntry } from "./archiveMirror";
import { displayUrlFor, originalUrlFor } from "./displayImages";

const entry = (overrides: Partial<ArchiveEntry> = {}): ArchiveEntry => ({
  puzzleNumber: 2,
  commonName: "Red Panda",
  imageUrl: originalUrlFor("red-panda-2.jpg"),
  ...overrides,
});

describe("isOurs", () => {
  it("accepts both an original and a derivative", () => {
    expect(isOurs(originalUrlFor("giraffe-1.jpg"))).toBe(true);
    expect(isOurs(displayUrlFor("giraffe-1.jpg"))).toBe(true);
  });

  /**
   * The one that matters: puzzle #2 has hotlinked upload.wikimedia.org since
   * 2026-08-02, because archive.json copies imageUrl on the day a puzzle runs
   * and the mirror pass came a day later.
   */
  it("rejects a Commons hotlink", () => {
    expect(
      isOurs("https://upload.wikimedia.org/wikipedia/commons/c/c6/Red_Panda.JPG")
    ).toBe(false);
  });

  it("rejects the Framer CDN, which served puzzle #1 before it was mirrored", () => {
    expect(isOurs("https://framerusercontent.com/images/abc.jpg")).toBe(false);
  });
});

describe("hotlinkedEntries", () => {
  it("returns only the days somebody else serves", () => {
    const found = hotlinkedEntries([
      entry(),
      entry({
        puzzleNumber: 3,
        commonName: "Axolotl",
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/c/c6/X.JPG",
      }),
    ]);
    expect(found.map((e) => e.puzzleNumber)).toEqual([3]);
  });

  it("finds nothing once every day is mirrored", () => {
    expect(hotlinkedEntries([entry()])).toEqual([]);
  });
});

describe("archiveFileFor", () => {
  /**
   * Named for the puzzle, not the animal. images/red-panda-2.jpg already exists
   * and is a *different* photograph — a red panda eating bamboo, where puzzle #2
   * showed one on a rope bridge. Reusing the animal slug would overwrite a live
   * puzzle photo with an archive-only one.
   */
  it("cannot collide with the animal slug for the same name", () => {
    expect(archiveFileFor(entry())).toBe("puzzle-2-red-panda.jpg");
    expect(archiveFileFor(entry())).not.toBe("red-panda-2.jpg");
  });

  it("kebabs a name with punctuation in it", () => {
    expect(
      archiveFileFor(entry({ puzzleNumber: 7, commonName: "Rothschild's Giraffe" }))
    ).toBe("puzzle-7-rothschilds-giraffe.jpg");
  });
});

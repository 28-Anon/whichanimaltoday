import { describe, it, expect } from "vitest";
import {
  originalFileFor,
  displayUrlFor,
  isWorthAdopting,
  REPO,
} from "./displayImages";

const jsdelivr = (path: string) =>
  `https://cdn.jsdelivr.net/gh/${REPO}@master/${path}`;

describe("originalFileFor", () => {
  it("reads the filename out of a jsDelivr images/ URL", () => {
    expect(originalFileFor(jsdelivr("images/seahorse-10.jpg"))).toBe(
      "seahorse-10.jpg"
    );
  });

  it("keeps the number the file actually carries, not the animal's index", () => {
    // starfish is animal 31 of the phase-2 batch but its photo is starfish-88.
    expect(originalFileFor(jsdelivr("images/starfish-88.jpg"))).toBe(
      "starfish-88.jpg"
    );
  });

  it("ignores a display/ URL, so a second run cannot derive from its own output", () => {
    expect(originalFileFor(jsdelivr("images/display/seahorse-10.jpg"))).toBeNull();
  });

  it("ignores a host we do not control", () => {
    expect(
      originalFileFor("https://framerusercontent.com/images/vmKbEL8.jpg")
    ).toBeNull();
    expect(
      originalFileFor("https://commons.wikimedia.org/x/Special:FilePath/a.jpg")
    ).toBeNull();
  });

  it("ignores a jsDelivr URL for another repo", () => {
    expect(
      originalFileFor(
        "https://cdn.jsdelivr.net/gh/someone-else/repo@master/images/a.jpg"
      )
    ).toBeNull();
  });
});

describe("displayUrlFor", () => {
  it("points at the display directory under the same repo and ref", () => {
    expect(displayUrlFor("seahorse-10.jpg")).toBe(
      jsdelivr("images/display/seahorse-10.jpg")
    );
  });

  it("round-trips: its output is not treated as an original", () => {
    expect(originalFileFor(displayUrlFor("seahorse-10.jpg"))).toBeNull();
  });
});

describe("isWorthAdopting", () => {
  it("adopts a derivative that is meaningfully smaller", () => {
    expect(isWorthAdopting(305_000, 60_000)).toBe(true);
  });

  it("rejects one that barely saves anything", () => {
    expect(isWorthAdopting(100_000, 95_000)).toBe(false);
  });

  it("rejects one that grew", () => {
    expect(isWorthAdopting(40_000, 44_000)).toBe(false);
  });

  it("rejects rather than dividing by zero on an empty original", () => {
    expect(isWorthAdopting(0, 0)).toBe(false);
  });
});

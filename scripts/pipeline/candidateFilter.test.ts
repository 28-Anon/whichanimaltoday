import { describe, expect, it } from "vitest";
import { isWorthJudging, type Candidate } from "./candidateFilter";

const good = (overrides: Partial<Candidate> = {}): Candidate => ({
  file: "Ornithorhynchus anatinus swimming.jpg",
  width: 1600,
  height: 1200,
  licence: "CC BY-SA 4.0",
  artist: "Someone",
  ...overrides,
});

describe("isWorthJudging", () => {
  it("keeps an ordinary freely-licensed photograph", () => {
    expect(isWorthJudging(good())).toBe(true);
  });

  // Each of these is a file that really was live on the site, or really was
  // offered as a replacement. They are the reason the filter exists.
  it.each([
    ["the cartoon blobfish, the only PNG of 58", { file: "Blobfish cartoon.png" }],
    ["an engraving that says so", { file: "Chlamyphorus truncatus engraving.jpg" }],
    ["the helmeted hornbill painting", { file: "Helmeted hornbill painting.jpg" }],
    ["the dodo museum case", { file: "Dodo museum mount Oxford.jpg" }],
    ["a giant salamander specimen card", { file: "Andrias davidianus specimen.jpg" }],
    ["a postage stamp", { file: "Stamp of Indonesia - Great Argus.jpeg" }],
    ["a journal figure", { file: "ECE3-9-10070-g001 figure.jpg" }],
    ["a distribution map", { file: "A. davidianus - distribution.jpg" }],
  ])("rejects %s", (_label, overrides) => {
    expect(isWorthJudging(good(overrides))).toBe(false);
  });

  it("rejects a non-commercial licence, which the site cannot use", () => {
    expect(isWorthJudging(good({ licence: "CC BY-NC 2.0" }))).toBe(false);
  });

  it("rejects an unrecognised licence rather than assuming permission", () => {
    expect(isWorthJudging(good({ licence: "" }))).toBe(false);
  });

  it("rejects an image too small to fill a puzzle card", () => {
    expect(isWorthJudging(good({ width: 390 }))).toBe(false);
  });

  // "fig1" means a journal figure; "Fig Parrot" is a bird, and a fig tree is
  // where plenty of animals get photographed. An earlier \bfig\b rejected
  // both.
  it("keeps an animal whose name merely contains the word fig", () => {
    expect(isWorthJudging(good({ file: "Double-eyed Fig Parrot.jpg" }))).toBe(
      true
    );
  });

  it("still rejects a numbered journal figure", () => {
    expect(isWorthJudging(good({ file: "Ece35014-fig-0001-m.jpg" }))).toBe(
      false
    );
  });

  // A known limitation, pinned so it is not mistaken for a gap nobody noticed.
  // The pink fairy armadillo engraving that shipped was called "PSM V21 D613
  // Armadillo chlamyphorus truncatus.jpg" — a Popular Science Monthly plate
  // number, with no word in it that means "engraving". No filename rule
  // catches scans like this; that is what the model pass is for.
  it("cannot tell an old book scan from a photograph by name alone", () => {
    expect(
      isWorthJudging(
        good({ file: "PSM V21 D613 Armadillo chlamyphorus truncatus.jpg" })
      )
    ).toBe(true);
  });
});

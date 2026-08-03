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

  // A real aardvark run spent four paid judgements on these before finding
  // nothing: three photographs of one skull, and a taxidermy mount.
  it.each([
    ["a museum accession number", "Orycteropus afer 01 MWNH 147.JPG"],
    ["a taxidermy mount named as stuffed", "Orycteropus afer stuffed.jpg"],
  ])("rejects %s", (_label, file) => {
    expect(isWorthJudging(good({ file }))).toBe(false);
  });

  // Flickr and camera filenames carry numbers too, and they are most of
  // Commons. The accession rule must not eat them.
  it.each([
    "Red Panda (25193861686).jpg",
    "Toco Toucan (Ramphastos toco) - 48153967707.jpg",
    // A Nikon camera filename. An earlier accession rule without a mandatory
    // separator rejected this, and camera filenames are most of Commons.
    "Four-horned Antelope by Raju Kasambe DSCN3810 01.jpg",
  ])("keeps the ordinary photograph %s", (file) => {
    expect(isWorthJudging(good({ file }))).toBe(true);
  });

  // Category listings, unlike search, are not restricted to bitmaps. A
  // denylist of image formats let "Aardvark.pdf" through.
  it.each([
    ["a PDF from a category listing", "Aardvark.pdf"],
    ["a video", "Chinese giant salamander feeding.webm"],
    ["a preserved foetus", "Foetal Orycteropus afer - 1.jpg"],
  ])("rejects %s", (_label, file) => {
    expect(isWorthJudging(good({ file }))).toBe(false);
  });

  it("keeps a webp, which the API accepts", () => {
    expect(isWorthJudging(good({ file: "Aardvark foraging.webp" }))).toBe(true);
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

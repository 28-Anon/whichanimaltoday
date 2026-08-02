import { describe, it, expect } from "vitest";
import { renderReviewSheet } from "./reviewSheet";

const record = {
  qid: "Q184507",
  commonName: "Mole",
  species: "Star-nosed Mole",
  hint1: "h1",
  hint2: "h2",
  hint3: "h3",
  funFacts: "facts",
  sourceUrl: "https://en.wikipedia.org/wiki/Star-nosed_mole",
  bonus: { question: "Which one?", options: ["a", "b", "c", "d"], answerIndex: 2 },
  image: {
    file: "File:Condylura.jpg",
    author: "US NPS",
    licence: "Public domain",
    descriptionUrl: "https://commons.wikimedia.org/wiki/File:Condylura.jpg",
  },
} as never;

describe("renderReviewSheet", () => {
  it("renders the photo inline so it is visible on GitHub", () => {
    // Special:FilePath resolves a title to the image itself, and GitHub
    // renders that in markdown. Seeing the photograph next to the text is
    // the entire reason review happens in a pull request.
    expect(renderReviewSheet([record])).toContain(
      "![Mole](https://commons.wikimedia.org/wiki/Special:FilePath/Condylura.jpg?width=600)"
    );
  });

  it("gives each record a qid heading, which is what acceptance matches on", () => {
    expect(renderReviewSheet([record])).toContain("## Q184507 — Mole");
  });

  it("links the grounding article for fact-checking", () => {
    expect(renderReviewSheet([record])).toContain(
      "https://en.wikipedia.org/wiki/Star-nosed_mole"
    );
  });

  it("credits the photographer and the licence", () => {
    const sheet = renderReviewSheet([record]);
    expect(sheet).toContain("US NPS");
    expect(sheet).toContain("Public domain");
  });

  it("marks which bonus option is correct", () => {
    expect(renderReviewSheet([record])).toContain("**c** ← correct");
  });

  it("tells the reviewer that deleting a section rejects it", () => {
    expect(renderReviewSheet([record]).toLowerCase()).toContain("delete");
  });

  it("shows all three hints in order", () => {
    const sheet = renderReviewSheet([record]);
    expect(sheet.indexOf("h1")).toBeLessThan(sheet.indexOf("h2"));
    expect(sheet.indexOf("h2")).toBeLessThan(sheet.indexOf("h3"));
  });

  it("omits the species line when there is no split", () => {
    const noSplit = { ...(record as object), species: undefined } as never;
    expect(renderReviewSheet([noSplit])).not.toContain("**Species:**");
  });

  it("escapes underscores in a Commons filename", () => {
    // Commons titles use spaces; the FilePath URL wants underscores.
    const spaced = {
      ...(record as object),
      image: { ...(record as { image: object }).image, file: "File:Red Panda.jpg" },
    } as never;
    expect(renderReviewSheet([spaced])).toContain(
      "Special:FilePath/Red_Panda.jpg?width=600"
    );
  });
});

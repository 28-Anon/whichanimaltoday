import { describe, expect, it } from "vitest";
import { isSpeciesCategory } from "./categoryFilter";

describe("isSpeciesCategory", () => {
  it("keeps the categories this exists to find", () => {
    for (const title of [
      "Category:Vulpes zerda",
      "Category:Orycteropus afer",
      "Category:Ornithorhynchus anatinus",
      "Category:Red pandas",
    ]) {
      expect(isSpeciesCategory(title), title).toBe(true);
    }
  });

  /**
   * `Category:Flying foxes` is a real bat category, and it is the reason the
   * posture rules are written as phrases rather than as bare words. A list
   * containing "flying" would reject the correct answer for an actual animal.
   */
  it("keeps a species whose own name contains a posture word", () => {
    expect(isSpeciesCategory("Category:Flying foxes")).toBe(true);
    expect(isSpeciesCategory("Category:Sleeper sharks")).toBe(true);
  });

  // Each of these actually won the vote on a real run and poisoned the search.
  it.each([
    [
      "the photo competition that returned date-palm sap for White rhinoceros",
      "Category:Wildlife and nature images from Wiki Science Competition 2025",
    ],
    ["the behaviour category that made every bat a silhouette", "Category:Pteropus in flight"],
    ["the posture category that made every fennec fox asleep", "Category:Curled up animals"],
  ])("rejects %s", (_label, title) => {
    expect(isSpeciesCategory(title)).toBe(false);
  });

  it("rejects collections of animals in general, however they are worded", () => {
    for (const title of [
      "Category:Sleeping animals",
      "Category:Animals of Egypt",
      "Category:Animals in art",
    ]) {
      expect(isSpeciesCategory(title), title).toBe(false);
    }
  });

  it("rejects the licence and maintenance categories every file carries", () => {
    for (const title of [
      "Category:CC-BY-SA-3.0",
      "Category:Public domain",
      "Category:Photographs by Someone",
      "Category:Files from Flickr",
      "Category:Quality images",
      "Category:2019",
    ]) {
      expect(isSpeciesCategory(title), title).toBe(false);
    }
  });

  it("rejects an empty title rather than treating it as a category", () => {
    expect(isSpeciesCategory("")).toBe(false);
  });
});

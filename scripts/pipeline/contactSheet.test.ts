import { describe, expect, it } from "vitest";
import { buildContactSheet, type SheetEntry } from "./contactSheet";
import { DISPLAY_WIDTH } from "./imageJudge";

const entry: SheetEntry = {
  commonName: "Sheep",
  candidates: [
    {
      url: "https://x/photos/1/large.jpg",
      licence: "CC BY 4.0",
      artist: "Jane Doe",
      note: "A single sheep in a grass field.",
    },
  ],
};

describe("buildContactSheet", () => {
  it("shows each candidate at the size a player sees it", () => {
    expect(buildContactSheet([entry])).toContain(`width:${DISPLAY_WIDTH}px`);
  });

  it("links the full-resolution image so detail can be confirmed", () => {
    expect(buildContactSheet([entry])).toContain(
      'href="https://x/photos/1/large.jpg"'
    );
  });

  it("shows the licence and photographer, which the credits page needs", () => {
    const html = buildContactSheet([entry]);
    expect(html).toContain("CC BY 4.0");
    expect(html).toContain("Jane Doe");
  });

  it("escapes text so a photographer's name cannot break the page", () => {
    const html = buildContactSheet([
      {
        ...entry,
        candidates: [{ ...entry.candidates[0], artist: 'A <b>"x"</b>' }],
      },
    ]);
    expect(html).toContain("&lt;b&gt;");
    expect(html).not.toContain("<b>");
  });

  it("says so plainly when an animal found nothing", () => {
    const html = buildContactSheet([{ commonName: "Axolotl", candidates: [] }]);
    expect(html).toContain("Axolotl");
    expect(html).toContain("no candidate passed");
  });

  it("keeps every animal in one page, in the order given", () => {
    const html = buildContactSheet([
      { commonName: "Sheep", candidates: [] },
      { commonName: "Goat", candidates: [] },
    ]);
    expect(html.indexOf("Sheep")).toBeLessThan(html.indexOf("Goat"));
  });
});

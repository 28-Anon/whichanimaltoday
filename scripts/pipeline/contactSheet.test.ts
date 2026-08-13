import { describe, expect, it } from "vitest";
import { buildContactSheet, type SheetEntry } from "./contactSheet";
import { DISPLAY_WIDTH } from "./imageJudge";

const entry: SheetEntry = {
  commonName: "Sheep",
  candidates: [
    {
      url: "https://x/photos/1/large.jpg",
      attribution: "Photo: Jane Doe, CC BY 4.0, iNaturalist",
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

  /**
   * The whole line, not its parts: this is the string that gets copied into
   * imageAttribution, and showing it assembled is what stops the person pasting
   * it from composing their own.
   */
  it("shows the credit line exactly as it would be pasted", () => {
    expect(buildContactSheet([entry])).toContain(
      "Photo: Jane Doe, CC BY 4.0, iNaturalist"
    );
  });

  it("escapes text so a photographer's name cannot break the page", () => {
    const html = buildContactSheet([
      {
        ...entry,
        candidates: [{ ...entry.candidates[0], attribution: 'A <b>"x"</b>' }],
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

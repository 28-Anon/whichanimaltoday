import { describe, expect, it } from "vitest";
import {
  buildAttribution,
  decodeEntities,
  isAttributable,
  photographer,
  requiresAttribution,
  stripHtml,
} from "./attribution";

describe("photographer", () => {
  it("reads the name out of an ordinary iNaturalist attribution", () => {
    expect(photographer("(c) Jane Doe, some rights reserved (CC BY)")).toBe(
      "Jane Doe"
    );
  });

  /**
   * The observation that produced this names the same person twice. Where the
   * two disagree the copyright holder is the one the licence asks for — the
   * uploader may be the account that filed the observation rather than whoever
   * took the photograph.
   */
  it("prefers the copyright holder over the uploader", () => {
    expect(
      photographer(
        "(c) Jane Doe, some rights reserved (CC BY-SA), uploaded by An Account"
      )
    ).toBe("Jane Doe");
  });

  it("falls back to the uploader when that is the only name present", () => {
    expect(photographer("no rights reserved, uploaded by Jane Doe")).toBe(
      "Jane Doe"
    );
  });

  /**
   * The cow, 2026-08-12. A CC0 attribution carries no author at all, and the
   * old parser fell back to the whole string — which would have credited "no
   * rights reserved" as a person on the credits page.
   */
  it("names nobody when the string is nothing but a rights phrase", () => {
    expect(photographer("no rights reserved")).toBe("");
    expect(photographer("some rights reserved (CC BY)")).toBe("");
    expect(photographer("")).toBe("");
  });

  it("keeps a messy name rather than discarding it", () => {
    // A credit that needs tidying is still a credit; only boilerplate is
    // dropped.
    expect(photographer("Photograph by the Smith family, 1998")).toBe(
      "Photograph by the Smith family, 1998"
    );
  });

  it("decodes entities in a Commons artist field", () => {
    expect(
      photographer("Marion Schneider &amp; Christoph Aistleitner")
    ).toBe("Marion Schneider & Christoph Aistleitner");
  });

  it("strips the link Commons wraps an artist in", () => {
    expect(
      photographer('<a href="/wiki/User:Someone" title="x">Someone</a>')
    ).toBe("Someone");
  });
});

describe("decodeEntities", () => {
  it("handles the named and numeric forms", () => {
    expect(decodeEntities("a &amp; b")).toBe("a & b");
    expect(decodeEntities("Jane&#39;s photo")).toBe("Jane's photo");
    expect(decodeEntities("&#x41;")).toBe("A");
  });

  /**
   * An unknown entity is left as written rather than guessed at, so it shows up
   * in review as the oddity it is instead of becoming a plausible wrong name.
   */
  it("leaves an entity it does not know alone", () => {
    expect(decodeEntities("a &weird; b")).toBe("a &weird; b");
  });
});

describe("stripHtml", () => {
  it("removes tags, decodes entities and collapses whitespace", () => {
    expect(stripHtml("<b>Jane</b>\n  &amp;  <i>John</i>")).toBe("Jane & John");
  });

  it("cannot be tricked into re-reading a decoded entity as a tag", () => {
    expect(stripHtml("&lt;script&gt;alert(1)&lt;/script&gt;")).toBe(
      "<script>alert(1)</script>"
    );
  });
});

describe("requiresAttribution", () => {
  it("waives it only for the public-domain family", () => {
    expect(requiresAttribution("CC0 1.0")).toBe(false);
    expect(requiresAttribution("Public domain")).toBe(false);
    expect(requiresAttribution("PD-old")).toBe(false);
    expect(requiresAttribution("No restrictions")).toBe(false);
  });

  it("requires it for every CC licence that asks for a credit", () => {
    expect(requiresAttribution("CC BY 4.0")).toBe(true);
    expect(requiresAttribution("CC BY-SA 3.0")).toBe(true);
  });

  /** An unrecognised licence fails towards crediting, not away from it. */
  it("requires it for a licence string nobody anticipated", () => {
    expect(requiresAttribution("Some bespoke museum terms")).toBe(true);
    expect(requiresAttribution("")).toBe(true);
  });
});

describe("isAttributable", () => {
  it("accepts a named photographer under any licence", () => {
    expect(isAttributable({ artist: "Jane Doe", licence: "CC BY-SA 3.0" })).toBe(
      true
    );
  });

  it("accepts an unnamed one under CC0, which asks for no credit", () => {
    expect(isAttributable({ artist: "no rights reserved", licence: "CC0 1.0" })).toBe(
      true
    );
  });

  /**
   * The ladybug candidate, 2026-08-12: Commons held no Artist value, and the
   * suggester offered `Photo: , CC BY-SA 3.0, Wikimedia Commons`. Under CC BY-SA
   * the missing name is the licence breach, not a cosmetic gap.
   */
  it("rejects an unnamed one under a licence that requires a credit", () => {
    expect(isAttributable({ artist: "", licence: "CC BY-SA 3.0" })).toBe(false);
  });
});

describe("buildAttribution", () => {
  it("builds the line the credits page expects", () => {
    expect(
      buildAttribution({
        artist: "(c) Jane Doe, some rights reserved (CC BY)",
        licence: "CC BY 4.0",
        source: "iNaturalist",
      })
    ).toBe("Photo: Jane Doe, CC BY 4.0, iNaturalist");
  });

  /** Exactly the line written by hand for the cow on 2026-08-12. */
  it("drops the empty name slot for an unattributed CC0 photograph", () => {
    expect(
      buildAttribution({
        artist: "no rights reserved",
        licence: "CC0 1.0",
        source: "iNaturalist",
      })
    ).toBe("Photo: CC0 1.0, iNaturalist");
  });

  it("refuses to build a line that credits nobody under CC BY-SA", () => {
    expect(
      buildAttribution({
        artist: "",
        licence: "CC BY-SA 3.0",
        source: "Wikimedia Commons",
      })
    ).toBeNull();
  });
});

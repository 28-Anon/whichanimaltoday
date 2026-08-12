import { describe, expect, it } from "vitest";
import { interleave } from "./interleave";

describe("interleave", () => {
  it("alternates between the sources", () => {
    expect(interleave(["a1", "a2", "a3"], ["b1", "b2", "b3"])).toEqual([
      "a1",
      "b1",
      "a2",
      "b2",
      "a3",
      "b3",
    ]);
  });

  /**
   * The bug this exists for. Commons routinely returns a full category — 121
   * candidates for rhinoceros, 134 for stingray — and the judge only ever looks
   * at the first eight. Concatenating meant iNaturalist was never judged at all.
   */
  it("reaches the short list within the first few positions", () => {
    const commons = Array.from({ length: 130 }, (_, i) => `c${i}`);
    const inat = Array.from({ length: 55 }, (_, i) => `i${i}`);

    const firstEight = interleave(commons, inat).slice(0, 8);

    expect(firstEight.filter((x) => x.startsWith("i"))).toHaveLength(4);
    expect(firstEight.filter((x) => x.startsWith("c"))).toHaveLength(4);
  });

  it("keeps each source's own order, which is its ranking", () => {
    const result = interleave(["a1", "a2"], ["b1", "b2"]);
    expect(result.indexOf("a1")).toBeLessThan(result.indexOf("a2"));
    expect(result.indexOf("b1")).toBeLessThan(result.indexOf("b2"));
  });

  it("appends the remainder when one source is longer", () => {
    expect(interleave(["a1", "a2", "a3"], ["b1"])).toEqual([
      "a1",
      "b1",
      "a2",
      "a3",
    ]);
  });

  it("passes a single source through unchanged", () => {
    expect(interleave(["a1", "a2"], [])).toEqual(["a1", "a2"]);
    expect(interleave([], ["b1", "b2"])).toEqual(["b1", "b2"]);
  });

  it("survives having nothing at all", () => {
    expect(interleave([], [])).toEqual([]);
  });

  it("takes more than two sources, for whenever a third is added", () => {
    expect(interleave(["a1", "a2"], ["b1"], ["c1", "c2"])).toEqual([
      "a1",
      "b1",
      "c1",
      "a2",
      "c2",
    ]);
  });
});

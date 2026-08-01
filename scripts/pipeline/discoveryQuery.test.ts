import { describe, it, expect } from "vitest";
import { buildDiscoveryQuery, mapDiscoveryRows } from "./discoveryQuery";

describe("buildDiscoveryQuery", () => {
  it("filters to species with an image, a common name, an article and a fame floor", () => {
    const q = buildDiscoveryQuery("Q7377", 40);
    expect(q).toContain("wd:Q7377");
    expect(q).toContain("wdt:P18");
    expect(q).toContain("wdt:P1843");
    expect(q).toContain("wdt:P105 wd:Q7432");
    expect(q).toContain("?sitelinks >= 40");
    expect(q).toContain("en.wikipedia.org");
  });

  it("groups so one species yields one row", () => {
    // P1843 returns every English common-name variant; without GROUP BY, one
    // species came back as a dozen near-identical rows during the spike.
    const q = buildDiscoveryQuery("Q7377", 40);
    expect(q).toContain("GROUP BY");
    expect(q).toContain("GROUP_CONCAT");
  });
});

describe("mapDiscoveryRows", () => {
  const row = {
    item: { value: "http://www.wikidata.org/entity/Q184507" },
    taxonName: { value: "Condylura cristata" },
    sitelinks: { value: "42" },
    img: {
      value:
        "http://commons.wikimedia.org/wiki/Special:FilePath/Condylura%20cristata.jpg",
    },
    commonNames: { value: "Star-nosed Mole | star nosed mole" },
    article: { value: "https://en.wikipedia.org/wiki/Star-nosed_mole" },
  };

  it("splits the concatenated common names", () => {
    const [c] = mapDiscoveryRows([row], "mammal");
    expect(c.commonNames).toEqual(["Star-nosed Mole", "star nosed mole"]);
  });

  it("extracts a File: title from the P18 URL, decoded", () => {
    const [c] = mapDiscoveryRows([row], "mammal");
    expect(c.imageFile).toBe("File:Condylura cristata.jpg");
  });

  it("carries the qid, taxon, sitelink count, category and article", () => {
    const [c] = mapDiscoveryRows([row], "mammal");
    expect(c.qid).toBe("Q184507");
    expect(c.taxonName).toBe("Condylura cristata");
    expect(c.sitelinks).toBe(42);
    expect(c.category).toBe("mammal");
    expect(c.articleUrl).toBe("https://en.wikipedia.org/wiki/Star-nosed_mole");
  });

  it("skips a row missing any required binding rather than throwing", () => {
    // One malformed row out of hundreds must not cost the whole run.
    expect(mapDiscoveryRows([{ taxonName: { value: "x" } }], "mammal")).toEqual([]);
  });

  it("decodes underscores in the image title", () => {
    const underscored = {
      ...row,
      img: {
        value:
          "http://commons.wikimedia.org/wiki/Special:FilePath/Red_Panda_(24986761703).jpg",
      },
    };
    const [c] = mapDiscoveryRows([underscored], "mammal");
    expect(c.imageFile).toBe("File:Red Panda (24986761703).jpg");
  });
});

import { describe, it, expect } from "vitest";
import { parseAnimalsCsv } from "./csvToAnimals";

describe("parseAnimalsCsv", () => {
  it("parses a CSV with exact canonical headers", () => {
    const csv =
      "commonName,imageUrl,funFacts,category,imageAttribution\n" +
      '"Giraffe","https://x/giraffe.jpg","Giraffes only need 30 minutes of sleep a day.","mammal","Wikimedia Commons - CC BY-SA 4.0"\n';

    const result = parseAnimalsCsv(csv);

    expect(result).toEqual([
      {
        commonName: "Giraffe",
        imageUrl: "https://x/giraffe.jpg",
        funFacts: "Giraffes only need 30 minutes of sleep a day.",
        category: "mammal",
        imageAttribution: "Wikimedia Commons - CC BY-SA 4.0",
      },
    ]);
  });

  it("matches common alternate header names case-insensitively", () => {
    const csv =
      "Name,Image,Facts,Category,Attribution\n" +
      '"Axolotl","https://x/axolotl.jpg","Can regrow limbs.","amphibian","CC BY-SA 4.0"\n';

    const result = parseAnimalsCsv(csv);

    expect(result[0].commonName).toBe("Axolotl");
    expect(result[0].imageUrl).toBe("https://x/axolotl.jpg");
  });

  it("handles quoted fields containing commas", () => {
    const csv =
      "commonName,imageUrl,funFacts,category,imageAttribution\n" +
      '"Elephant","https://x/elephant.jpg","Elephants are found in Africa, Asia, and zoos worldwide.","mammal","CC BY-SA 4.0"\n';

    const result = parseAnimalsCsv(csv);

    expect(result[0].funFacts).toBe(
      "Elephants are found in Africa, Asia, and zoos worldwide."
    );
  });

  it("parses multiple rows", () => {
    const csv =
      "commonName,imageUrl,funFacts,category,imageAttribution\n" +
      '"Elephant","https://x/e.jpg","Fact one.","mammal","CC BY-SA 4.0"\n' +
      '"Axolotl","https://x/a.jpg","Fact two.","amphibian","CC BY-SA 4.0"\n';

    const result = parseAnimalsCsv(csv);

    expect(result).toHaveLength(2);
    expect(result[1].commonName).toBe("Axolotl");
  });

  it("throws a descriptive error when a required column is missing", () => {
    const csv = "commonName,imageUrl\n" + '"Giraffe","https://x/giraffe.jpg"\n';

    expect(() => parseAnimalsCsv(csv)).toThrow(/funFacts/);
  });
});

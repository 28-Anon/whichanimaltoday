import { describe, it, expect } from "vitest";
import { parseAnimalsCsv } from "./csvToAnimals";

describe("parseAnimalsCsv", () => {
  it("parses a CSV with exact canonical headers", () => {
    const csv =
      "commonName,aliases,imageUrl,hint1,hint2,hint3,funFacts,category,imageAttribution\n" +
      '"Giraffe","Giraffa camelopardalis, giraffe","https://x/giraffe.jpg","Hint one.","Hint two.","Hint three.","Giraffes only need 30 minutes of sleep a day.","mammal","Wikimedia Commons - CC BY-SA 4.0"\n';

    const result = parseAnimalsCsv(csv);

    expect(result).toEqual([
      {
        commonName: "Giraffe",
        aliases: ["Giraffa camelopardalis", "giraffe"],
        imageUrl: "https://x/giraffe.jpg",
        hint1: "Hint one.",
        hint2: "Hint two.",
        hint3: "Hint three.",
        funFacts: "Giraffes only need 30 minutes of sleep a day.",
        category: "mammal",
        imageAttribution: "Wikimedia Commons - CC BY-SA 4.0",
      },
    ]);
  });

  it("parses the real Framer CMS Export column layout", () => {
    const csv =
      '"Slug","Common Name","Aliases","Image","Image:alt","Hint 1","Hint 2","Hint 3","Fun Facts","Category","Image Attribution"\n' +
      '"giraffe","Giraffe","Giraffa camelopardalis, giraffe","https://framerusercontent.com/images/x.jpg","alt text","My tongue can be almost 50 cm long.","I have a one-of-a-kind spot pattern.","I’m the tallest land animal on Earth.","A giraffe’s heart can weigh more than 10 kilograms.","Mammal","Photo: Unsplash"\n';

    const result = parseAnimalsCsv(csv);

    expect(result).toHaveLength(1);
    expect(result[0].commonName).toBe("Giraffe");
    expect(result[0].aliases).toEqual(["Giraffa camelopardalis", "giraffe"]);
    expect(result[0].imageUrl).toBe(
      "https://framerusercontent.com/images/x.jpg"
    );
    expect(result[0].hint1).toBe("My tongue can be almost 50 cm long.");
    expect(result[0].hint2).toBe("I have a one-of-a-kind spot pattern.");
    expect(result[0].hint3).toBe("I’m the tallest land animal on Earth.");
    expect(result[0].category).toBe("Mammal");
    expect(result[0].imageAttribution).toBe("Photo: Unsplash");
  });

  it("handles quoted fields containing commas", () => {
    const csv =
      "commonName,aliases,imageUrl,hint1,hint2,hint3,funFacts,category,imageAttribution\n" +
      '"Elephant","","https://x/elephant.jpg","H1","H2","H3","Elephants are found in Africa, Asia, and zoos worldwide.","mammal","CC BY-SA 4.0"\n';

    const result = parseAnimalsCsv(csv);

    expect(result[0].funFacts).toBe(
      "Elephants are found in Africa, Asia, and zoos worldwide."
    );
    expect(result[0].aliases).toEqual([]);
  });

  it("parses multiple rows", () => {
    const csv =
      "commonName,aliases,imageUrl,hint1,hint2,hint3,funFacts,category,imageAttribution\n" +
      '"Elephant","","https://x/e.jpg","H1","H2","H3","Fact one.","mammal","CC BY-SA 4.0"\n' +
      '"Axolotl","","https://x/a.jpg","H1","H2","H3","Fact two.","amphibian","CC BY-SA 4.0"\n';

    const result = parseAnimalsCsv(csv);

    expect(result).toHaveLength(2);
    expect(result[1].commonName).toBe("Axolotl");
  });

  it("throws a descriptive error when a required column is missing", () => {
    const csv = "commonName,imageUrl\n" + '"Giraffe","https://x/giraffe.jpg"\n';

    expect(() => parseAnimalsCsv(csv)).toThrow(/aliases|hint1/);
  });
});

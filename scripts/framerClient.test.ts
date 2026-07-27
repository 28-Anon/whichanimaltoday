import { describe, it, expect } from "vitest";
import { mapFieldDataToAnimal, remapFieldDataByName } from "./framerClient";

describe("mapFieldDataToAnimal", () => {
  it("maps a plain-value fieldData object", () => {
    const result = mapFieldDataToAnimal({
      commonName: "Giraffe",
      image: "https://example.com/giraffe.jpg",
      funFacts: "Giraffes only need 30 minutes of sleep a day.",
      category: "mammal",
      imageAttribution: "Wikimedia Commons - CC BY-SA 4.0",
    });

    expect(result).toEqual({
      commonName: "Giraffe",
      imageUrl: "https://example.com/giraffe.jpg",
      funFacts: "Giraffes only need 30 minutes of sleep a day.",
      category: "mammal",
      imageAttribution: "Wikimedia Commons - CC BY-SA 4.0",
    });
  });

  it("maps Framer's real field-entry shape ({ type, value })", () => {
    const result = mapFieldDataToAnimal({
      commonName: { type: "string", value: "Giraffe" },
      image: {
        type: "image",
        value: { url: "https://example.com/giraffe.jpg" },
      },
      funFacts: {
        type: "string",
        value: "Giraffes only need 30 minutes of sleep a day.",
      },
      category: { type: "string", value: "mammal" },
      imageAttribution: {
        type: "string",
        value: "Wikimedia Commons - CC BY-SA 4.0",
      },
    });

    expect(result.commonName).toBe("Giraffe");
    expect(result.imageUrl).toBe("https://example.com/giraffe.jpg");
  });
});

describe("remapFieldDataByName", () => {
  it("re-keys ID-keyed field data to name-keyed field data", () => {
    const fields = [
      { id: "f1", name: "commonName" },
      { id: "f2", name: "image" },
    ];
    const fieldData = {
      f1: { type: "string", value: "Giraffe" },
      f2: { type: "image", value: { url: "https://example.com/giraffe.jpg" } },
    };

    expect(remapFieldDataByName(fieldData, fields)).toEqual({
      commonName: { type: "string", value: "Giraffe" },
      image: { type: "image", value: { url: "https://example.com/giraffe.jpg" } },
    });
  });

  it("ignores fields with no matching data", () => {
    const fields = [{ id: "f1", name: "commonName" }];
    expect(remapFieldDataByName({}, fields)).toEqual({});
  });
});

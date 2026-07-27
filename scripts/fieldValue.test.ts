import { describe, it, expect } from "vitest";
import { readTextField, readImageField } from "./fieldValue";

describe("readTextField", () => {
  it("reads a plain string value", () => {
    expect(readTextField({ commonName: "Giraffe" }, "commonName")).toBe(
      "Giraffe"
    );
  });

  it("reads a wrapped { value } string", () => {
    expect(
      readTextField({ commonName: { value: "Giraffe" } }, "commonName")
    ).toBe("Giraffe");
  });

  it("throws on an unrecognized shape", () => {
    expect(() => readTextField({ commonName: 42 }, "commonName")).toThrow(
      /not a recognized text field/
    );
  });

  it("throws when the field is missing", () => {
    expect(() => readTextField({}, "commonName")).toThrow(
      /not a recognized text field/
    );
  });
});

describe("readImageField", () => {
  it("reads a plain string URL", () => {
    expect(readImageField({ image: "https://x/y.jpg" }, "image")).toBe(
      "https://x/y.jpg"
    );
  });

  it("reads a { url } object", () => {
    expect(
      readImageField({ image: { url: "https://x/y.jpg" } }, "image")
    ).toBe("https://x/y.jpg");
  });

  it("reads a wrapped { value: { url } } object", () => {
    expect(
      readImageField(
        { image: { value: { url: "https://x/y.jpg" } } },
        "image"
      )
    ).toBe("https://x/y.jpg");
  });

  it("throws on an unrecognized shape", () => {
    expect(() => readImageField({ image: 42 }, "image")).toThrow(
      /not a recognized image field/
    );
  });
});

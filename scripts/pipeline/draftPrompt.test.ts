import { describe, it, expect } from "vitest";
import { buildDraftPrompt, parseDraftResponse } from "./draftPrompt";

const candidate = {
  qid: "Q184507",
  taxonName: "Condylura cristata",
  commonNames: ["Star-nosed Mole", "star nosed mole"],
  category: "mammal",
} as never;

describe("buildDraftPrompt", () => {
  it("supplies the grounding summary", () => {
    const prompt = buildDraftPrompt(
      candidate,
      "It has 22 fleshy tentacles on its snout."
    );
    expect(prompt).toContain("22 fleshy tentacles");
  });

  it("names every forbidden word so the model can avoid them", () => {
    const prompt = buildDraftPrompt(candidate, "x");
    expect(prompt).toContain("Star-nosed Mole");
    expect(prompt).toContain("Condylura cristata");
  });

  it("asks for first person and a hardest-first ordering", () => {
    const prompt = buildDraftPrompt(candidate, "x").toLowerCase();
    expect(prompt).toContain("first person");
    expect(prompt).toContain("hint1 is the hardest");
  });

  it("forbids inventing species and inventing facts", () => {
    const prompt = buildDraftPrompt(candidate, "x").toLowerCase();
    expect(prompt).toContain("invent a species");
    expect(prompt).toContain("do not invent facts");
  });
});

describe("parseDraftResponse", () => {
  const good = JSON.stringify({
    hint1: "a",
    hint2: "b",
    hint3: "c",
    funFacts: "d",
    bonus: { question: "q", options: ["w", "x", "y", "z"], answerIndex: 1 },
  });

  it("parses a bare JSON object", () => {
    expect(parseDraftResponse(good).hint1).toBe("a");
  });

  it("parses JSON wrapped in a markdown fence", () => {
    // Models add fences even when told not to. Tolerate it rather than
    // discarding an otherwise good draft and paying for it twice.
    expect(parseDraftResponse("```json\n" + good + "\n```").hint2).toBe("b");
  });

  it("throws on a response containing no JSON at all", () => {
    expect(() => parseDraftResponse("I cannot help with that")).toThrow(
      /no JSON/i
    );
  });

  it("throws when a required field is missing", () => {
    expect(() => parseDraftResponse(JSON.stringify({ hint1: "a" }))).toThrow(
      /hint2/
    );
  });

  it("throws when a required field is blank rather than absent", () => {
    const blank = JSON.stringify({
      hint1: "a",
      hint2: "   ",
      hint3: "c",
      funFacts: "d",
      bonus: { question: "q", options: ["w", "x", "y", "z"], answerIndex: 0 },
    });
    expect(() => parseDraftResponse(blank)).toThrow(/hint2/);
  });

  it("throws when bonus.options is not exactly four", () => {
    const bad = JSON.stringify({
      hint1: "a",
      hint2: "b",
      hint3: "c",
      funFacts: "d",
      bonus: { question: "q", options: ["w", "x"], answerIndex: 0 },
    });
    expect(() => parseDraftResponse(bad)).toThrow(/four/i);
  });

  it("throws when answerIndex is out of range", () => {
    const bad = JSON.stringify({
      hint1: "a",
      hint2: "b",
      hint3: "c",
      funFacts: "d",
      bonus: { question: "q", options: ["w", "x", "y", "z"], answerIndex: 9 },
    });
    expect(() => parseDraftResponse(bad)).toThrow(/answerIndex/);
  });
});

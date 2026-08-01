import type { Candidate } from "./discoveryQuery";

export interface DraftedContent {
  hint1: string;
  hint2: string;
  hint3: string;
  funFacts: string;
  bonus: { question: string; options: string[]; answerIndex: number };
}

/**
 * Grounded in the Wikipedia summary, and told every word it must not use.
 *
 * The hint-leak gate rejects violations afterwards regardless — this just
 * reduces how often that costs an API call.
 */
export function buildDraftPrompt(
  candidate: Candidate,
  summary: string
): string {
  const forbidden = [...candidate.commonNames, candidate.taxonName].join(", ");

  return `You are writing one day's puzzle for a daily animal-guessing game.
The player sees a photograph and has three guesses at the animal's name.
After each wrong guess they get one clue.

THE ANIMAL: ${candidate.commonNames[0]} (${candidate.taxonName})

SOURCE — every factual claim you make must be supported by this text:
"""
${summary}
"""

Write, in JSON and nothing else:

- hint1, hint2, hint3: three clues, in FIRST PERSON present tense, playful
  and a little wry. hint1 is the hardest and most oblique; hint3 is the
  easiest and should almost give it away to someone who knows the animal.
- funFacts: one or two sentences of genuinely surprising detail, in third
  person.
- bonus: a four-option follow-up, asked only after the player has already
  won. Either four real species from this animal's family, exactly one of
  which is this animal — or, if the family has no meaningful split, four
  statements of which exactly one is true. answerIndex is the 0-based index
  of the correct option.

HARD RULES:
- No hint may contain any of these words, or any part of them: ${forbidden}
- Every decoy must be a real animal, or a plausible false statement. Never
  invent a species that does not exist.
- Do not invent facts. If the source above does not support it, do not write
  it.

Respond with the JSON object only.`;
}

const REQUIRED = ["hint1", "hint2", "hint3", "funFacts"] as const;

export function parseDraftResponse(text: string): DraftedContent {
  // Models add markdown fences even when told not to. Extracting the object
  // rather than parsing the whole response avoids discarding a good draft —
  // and paying for it a second time.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Draft response contained no JSON");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error("Draft response contained no JSON that parses");
  }

  for (const field of REQUIRED) {
    const value = parsed[field];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`Draft response is missing ${field}`);
    }
  }

  const bonus = parsed.bonus as DraftedContent["bonus"] | undefined;
  if (!bonus || typeof bonus.question !== "string" || !bonus.question.trim()) {
    throw new Error("Draft response is missing bonus.question");
  }
  if (!Array.isArray(bonus.options) || bonus.options.length !== 4) {
    throw new Error("Draft response must supply exactly four bonus options");
  }
  if (
    !Number.isInteger(bonus.answerIndex) ||
    bonus.answerIndex < 0 ||
    bonus.answerIndex > 3
  ) {
    throw new Error("Draft response has an out-of-range bonus.answerIndex");
  }

  return parsed as unknown as DraftedContent;
}

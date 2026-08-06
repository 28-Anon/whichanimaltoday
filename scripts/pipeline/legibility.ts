/**
 * Deciding whether an image is identifiable at the size a player actually sees.
 *
 * The content judge in `imageJudge.ts` looks at the original file, often several
 * thousand pixels wide, and asks "is this the right animal, alone, in natural
 * surroundings". That is necessary and not sufficient. `images/narwhal-5.jpg`
 * satisfied every content rule at full resolution — a real photograph, no
 * man-made objects, one tusk plainly visible — and shipped as a live puzzle in
 * which the animal was four pixels of tusk in a field of blue. The judge was
 * looking at a picture no player would ever see.
 *
 * So this is a second, deliberately different question, asked of a copy scaled
 * to the game's real display box: not "is this a narwhal" but "what animal is
 * this?", with the names withheld. Telling the judge the answer and asking
 * whether it can see it is the failure mode that let the narwhal through; a
 * model shown a blue smudge and told it is a narwhal will find the narwhal.
 *
 * Pure helpers only — the network and the model live in `imageJudge.ts`.
 */

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Whether a blind guess is close enough to count as recognising the animal.
 *
 * Containment in either direction, which is deliberately generous: a player
 * gets three guesses and a clue after each, so "sea turtle" for a hawksbill is
 * a legible image doing its job. What it will not accept is a different animal
 * — "whale" does not contain and is not contained by "narwhal", and that is the
 * case this exists to catch.
 *
 * Anything rejected here is reported with the guess attached, so a human can
 * overrule it rather than re-run the audit to find out what the model said.
 */
export function matchesExpectedName(guess: string, names: string[]): boolean {
  const g = normalizeName(guess);
  if (g === "" || g === "unclear") return false;

  // Compared with spaces removed as well, because English cannot decide whether
  // a compound animal name is one word or two. The first real run rejected a
  // perfect photograph of Agalychnis callidryas: the judge answered "red-eyed
  // tree frog", the record lists the alias "Red-eyed Treefrog", and neither
  // string contains the other. Same trap waiting in seahorse/sea horse and
  // bluebird/blue bird. Squashing cannot create a false match between two
  // different animals — "redeyedtreefrog" and "redeyedleaffrog" still fail —
  // because it only closes a gap that was pure orthography.
  const squash = (value: string): string => value.replace(/ /g, "");
  const gs = squash(g);

  return names.some((name) => {
    const n = normalizeName(name);
    if (n === "") return false;
    if (n === g || n.includes(g) || g.includes(n)) return true;

    const ns = squash(n);
    return ns === gs || ns.includes(gs) || gs.includes(ns);
  });
}

export interface LegibilityReply {
  animal: string;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  visible: string;
}

/**
 * Parses the three-line reply.
 *
 * Missing lines degrade to empty/UNKNOWN rather than throwing: the content
 * judge already had a run where the model answered without its NOTE line, and
 * a parse error there would have cost the whole audit rather than one image.
 */
export function parseLegibilityReply(text: string): LegibilityReply {
  const field = (key: string): string =>
    text.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, "im"))?.[1].trim() ?? "";

  const raw = field("CONFIDENCE").toUpperCase();
  const confidence =
    raw === "HIGH" || raw === "MEDIUM" || raw === "LOW" ? raw : "UNKNOWN";

  return { animal: field("ANIMAL"), confidence, visible: field("VISIBLE") };
}

/**
 * The verdict, given a parsed reply and the names the image is meant to show.
 *
 * LOW confidence fails even when the name matches. A judge that squints at a
 * smear and lands on the right answer is describing a lucky guess, not a
 * legible photograph, and the model has the advantage of an exhaustive mental
 * index of animals that a player does not.
 */
export function scoreLegibility(
  reply: LegibilityReply,
  names: string[]
): { ok: boolean; note: string } {
  const seen = reply.visible ? ` Visible: ${reply.visible}` : "";

  if (!reply.animal || /^unclear$/i.test(reply.animal)) {
    return {
      ok: false,
      note: `unidentifiable at display size — the judge could not name it.${seen}`,
    };
  }

  if (!matchesExpectedName(reply.animal, names)) {
    return {
      ok: false,
      note:
        `at display size this reads as "${reply.animal}", not ` +
        `${names[0] ?? "the expected animal"}.${seen}`,
    };
  }

  if (reply.confidence === "LOW") {
    return {
      ok: false,
      note:
        `named "${reply.animal}" but only with low confidence — too marginal ` +
        `at display size.${seen}`,
    };
  }

  return {
    ok: true,
    note: `identifiable at display size as "${reply.animal}" (${reply.confidence.toLowerCase()} confidence).`,
  };
}

/**
 * The prompt. The names are deliberately absent — see the module comment.
 *
 * The dimensions are stated so the judge grades against the real constraint
 * rather than assuming it was handed a thumbnail of something larger.
 */
export function buildLegibilityPrompt(width: number, height: number): string {
  return `This image is shown to a player at exactly ${width}x${height} pixels. This is not a thumbnail of a larger picture — it is the whole thing, at the size they see it.

Look at it and answer in this exact form and nothing else:
ANIMAL: the most specific common name you can give, or UNCLEAR
CONFIDENCE: HIGH, MEDIUM or LOW
VISIBLE: one short sentence naming the features you can actually make out

Judge only what is discernible at this size. If the animal is small in the
frame, blurred, distant, or one of several, say UNCLEAR rather than inferring
from the setting. A polar seascape is not evidence of a narwhal.

CONFIDENCE is about this image alone, not about what you know the animal
probably is.`;
}

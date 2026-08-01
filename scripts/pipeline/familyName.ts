/**
 * Species names are usually "<modifier> <family>", so the head noun is the
 * family: Star-nosed Mole -> Mole.
 *
 * This is a SUGGESTION for the review sheet, never applied automatically.
 * `Red Panda` -> `Panda` is factually wrong and would make `panda` a winning
 * guess for an animal that is not one, while `Sea Otter` -> `Otter` is
 * correct — and the two are indistinguishable by any rule. The deny list
 * below encodes the cases known to be wrong; a human confirms the rest.
 */
const NEVER_BROADEN = new Set([
  "panda",
  "bear cat",
  "flying fox",
  "koala bear",
  "red panda",
  "sea cow",
]);

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function deriveFamilyName(commonNames: string[]): string | null {
  const cleaned = commonNames.map((name) => name.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;

  // If any variant is already a single word, that IS the family — no need to
  // guess at a head noun. "Common Octopus" / "Octopus" -> "Octopus".
  const bare = cleaned.find((name) => !name.includes(" "));
  if (bare && cleaned.some((name) => name.includes(" "))) {
    return capitalise(bare);
  }

  const shortest = [...cleaned].sort((a, b) => a.length - b.length)[0];
  if (NEVER_BROADEN.has(shortest.toLowerCase())) return null;

  const words = shortest.split(/\s+/);
  if (words.length < 2) return null;

  // Strip a trailing possessive or stray punctuation: "Hoffmann's Two-toed
  // Sloth" must yield "Sloth", not "Sloth" with baggage.
  const head = words[words.length - 1].replace(/[^A-Za-z-]/g, "");
  if (!head) return null;
  if (NEVER_BROADEN.has(head.toLowerCase())) return null;

  return capitalise(head);
}

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

/** The last word, stripped of possessives and stray punctuation. */
function headNoun(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return "";
  return words[words.length - 1].replace(/[^A-Za-z-]/g, "");
}

/**
 * Head nouns shared by at least two species in the pool.
 *
 * This is what separates a real family from a foreign synonym. Many species
 * end in "Mole"; exactly one ends in "Lan" ("Cu Lan", a Vietnamese name for
 * the slow loris), and suggesting "Lan" as a family is noise. Corroboration
 * across the pool is the only signal that distinguishes them without a
 * dictionary.
 */
export function collectKnownFamilies(
  allCommonNames: string[][]
): Set<string> {
  const counts = new Map<string, Set<number>>();

  allCommonNames.forEach((names, index) => {
    for (const name of names) {
      const head = headNoun(name).toLowerCase();
      if (!head) continue;
      if (!counts.has(head)) counts.set(head, new Set());
      // Keyed by species index, so one species with several variants ending
      // in the same word does not corroborate itself.
      counts.get(head)!.add(index);
    }
  });

  const families = new Set<string>();
  for (const [head, species] of counts) {
    if (species.size >= 2) families.add(head);
  }
  return families;
}

export function deriveFamilyName(
  commonNames: string[],
  knownFamilies?: Set<string>
): string | null {
  const cleaned = commonNames.map((name) => name.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;

  const multiWord = cleaned.filter((name) => name.includes(" "));
  if (multiWord.length === 0) return null;

  const shortest = [...multiWord].sort((a, b) => a.length - b.length)[0];
  if (NEVER_BROADEN.has(shortest.toLowerCase())) return null;

  const head = headNoun(shortest);
  if (!head) return null;
  if (NEVER_BROADEN.has(head.toLowerCase())) return null;

  // Redundancy is judged against the PRIMARY name, not the whole set.
  // ["Lion", "African Lion"] and ["Common Octopus", "Octopus"] are the same
  // shape, but the first animal is already called Lion — suggesting "Lion"
  // is noise — while the second is called Common Octopus, so "Octopus" is a
  // real split. The primary name is what stage one would ask for.
  if (cleaned[0].toLowerCase() === head.toLowerCase()) return null;

  // A single-word variant is only the family if it IS the head noun. Live
  // data: "Pink Fairy Armadillo" also carries "Pichiciego", a Spanish
  // synonym — preferring the shortest single word suggested that as the
  // family instead of "Armadillo".
  const bare = cleaned.find(
    (name) => !name.includes(" ") && name.toLowerCase() === head.toLowerCase()
  );
  if (bare) return capitalise(bare);

  // When the caller supplies pool-wide corroboration, a head noun no other
  // species shares is a synonym rather than a family.
  if (knownFamilies && !knownFamilies.has(head.toLowerCase())) return null;

  return capitalise(head);
}

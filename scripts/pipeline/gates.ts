import type { Candidate } from "./discoveryQuery";

const ALLOWED_LICENCE = /^(cc0|cc by(-sa)?(\s|$)|public domain|pd(-|$)|no restrictions)/i;
const BLOCKED_LICENCE = /\bnc\b|noncommercial|non-commercial|\bnd\b|noderiv|fair use/i;

/**
 * Fails closed: an unrecognised licence string is not evidence of permission.
 *
 * NC is rejected because the site carries advertising, which makes
 * non-commercial a substantive problem rather than a technicality. ND is
 * rejected because the pipeline resizes every image it mirrors.
 */
export function isAllowedLicence(shortName: string): boolean {
  const value = (shortName ?? "").trim();
  if (!value) return false;
  if (BLOCKED_LICENCE.test(value)) return false;
  return ALLOWED_LICENCE.test(value);
}

/**
 * P1843 is crowd-sourced free text and contains vandalism — `Homo
 * rhodesiensis` is labelled "Cumshot man" on Wikidata, and it clears a
 * 40-language fame floor. Aliases are player-visible, so this is a hard gate.
 *
 * Deliberately a short explicit list rather than a general profanity library:
 * real animal names contain substrings a naive filter rejects — great tit,
 * sperm whale, horned screamer. Extend this when something actually gets
 * through, not pre-emptively.
 */
const BLOCKED_WORDS = [
  "cumshot",
  "wank",
  "fuck",
  "shit",
  "cunt",
  "nigger",
  "faggot",
  "rape",
];

export function hasBlockedName(names: string[]): string | null {
  for (const name of names) {
    const lower = name.toLowerCase();
    if (BLOCKED_WORDS.some((word) => lower.includes(word))) return name;
  }
  return null;
}

/** Everything under Homo. Neanderthal clears the fame floor. */
export const EXCLUDED_TAXON_PREFIXES = ["Homo "];

/**
 * A common name resolving to more than one species is a guess-checker hazard,
 * not merely a duplicate: `checkGuess` has no way to disambiguate it. Measured
 * in the spike — `beluga` is both a whale (Delphinapterus leucas) and a
 * sturgeon (Huso huso), and 24 such collisions existed in a 719-species pool.
 */
export function findAliasCollisions(
  candidates: Candidate[]
): Map<string, string[]> {
  const byName = new Map<string, Set<string>>();

  for (const candidate of candidates) {
    for (const name of candidate.commonNames) {
      const key = name.toLowerCase().trim();
      if (!byName.has(key)) byName.set(key, new Set());
      // Keyed by taxon, so one species listing a name twice is not a collision.
      byName.get(key)!.add(candidate.taxonName);
    }
  }

  const collisions = new Map<string, string[]>();
  for (const [name, taxa] of byName) {
    if (taxa.size > 1) collisions.set(name, [...taxa].sort());
  }
  return collisions;
}

/**
 * Illustrations, diagrams and logos are almost always PNG or SVG on Commons;
 * photographs are almost always JPEG.
 *
 * This is a cheap heuristic, not a guarantee. It exists because a cartoon
 * blobfish shipped as a live puzzle — the only PNG in a list of 58 — while a
 * JPEG of people in a park labelled "narwhal" sailed through. So the format
 * check catches one failure mode and misses the other entirely; only a human
 * looking at the picture, or a vision check, catches wrong-subject images.
 * See the follow-up in docs/follow-ups.md.
 */
export function looksLikePhotograph(file: string): boolean {
  return /\.jpe?g$/i.test(file.trim());
}

/**
 * Words that carry no identifying power on their own.
 *
 * Grammar words, plus the generic descriptors animal names are built from:
 * colours, compass directions, size words and habitat nouns. Without these,
 * the narwhal's alias "unicorn of the sea" contributes "sea", and every hint
 * mentioning the sea is rejected as leaking the answer.
 *
 * Losing them costs nothing, because the distinctive head noun survives:
 * "Red Panda" still catches "panda", "Sea Otter" still catches "otter", and
 * "unicorn of the sea" still catches "unicorn".
 */
const FILLER = new Set([
  "of", "the", "a", "an", "and", "in", "my", "i",
  "sea", "ocean", "water", "land", "river", "sky", "night", "day",
  "red", "blue", "green", "black", "white", "grey", "gray", "golden", "silver",
  "northern", "southern", "eastern", "western", "arctic", "african", "american",
  "european", "asian", "common", "great", "greater", "lesser", "giant", "dwarf",
  "pygmy", "little", "big",
]);

/**
 * A model asked for a giraffe hint will eventually write "I am the tallest
 * giraffe-like animal." Cheap to check, and it catches the single most
 * puzzle-ruining defect there is.
 *
 * Short and filler words are skipped so a name like "unicorn of the sea"
 * doesn't make every hint containing "the" a false positive.
 */
export function leaksAnswer(hint: string, names: string[]): boolean {
  const words = new Set(
    hint
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
  );

  for (const name of names) {
    const parts = name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !FILLER.has(word));

    if (parts.some((part) => words.has(part))) return true;
  }

  return false;
}

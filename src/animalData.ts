export interface BonusRound {
  question: string;
  /** Exactly 4, all distinct case-insensitively. Enforced by validateAnimalData. */
  options: string[];
  /** Index into `options`, 0-3. */
  answerIndex: number;
}

export interface AnimalRecord {
  commonName: string;
  aliases: string[];
  hint1: string;
  hint2: string;
  hint3: string;
  funFacts: string;
  category: string;
  imageUrl: string;
  imageAttribution: string;
  /** The specific species, when `commonName` is the broader family. Display only. */
  species?: string;
  bonus?: BonusRound;
}

export const ALLOWED_CATEGORIES = [
  "mammal",
  "bird",
  "reptile",
  "fish",
  "insect",
  "amphibian",
  "marine",
] as const;

export function validateAnimalData(records: AnimalRecord[]): string[] {
  const errors: string[] = [];
  const seenNames = new Set<string>();

  records.forEach((record, index) => {
    const label = `Row ${index + 1} (${record.commonName || "unnamed"})`;

    if (!record.commonName.trim()) {
      errors.push(`${label}: commonName is empty`);
    } else {
      const key = record.commonName.trim().toLowerCase();
      if (seenNames.has(key)) {
        errors.push(`${label}: duplicate commonName "${record.commonName}"`);
      }
      seenNames.add(key);
    }

    if (!record.hint1.trim()) errors.push(`${label}: hint1 is empty`);
    if (!record.hint2.trim()) errors.push(`${label}: hint2 is empty`);
    if (!record.hint3.trim()) errors.push(`${label}: hint3 is empty`);
    if (!record.funFacts.trim()) errors.push(`${label}: funFacts is empty`);
    if (!record.imageAttribution.trim())
      errors.push(`${label}: imageAttribution is empty`);

    // The image URL goes straight into an <img src>, so require an explicit
    // https scheme. Plain http is either upgraded or blocked depending on the
    // browser, and anything else — javascript:, data: — has no business here.
    const imageUrl = (record.imageUrl ?? "").trim();
    if (!imageUrl) {
      errors.push(`${label}: imageUrl is empty`);
    } else if (!imageUrl.startsWith("https://")) {
      errors.push(
        `${label}: imageUrl must start with https:// (got "${imageUrl}")`
      );
    }

    // Compared case-insensitively: the curated CSV capitalises categories
    // ("Mammal", "Marine") while this list is lowercase, and a case-sensitive
    // check rejected every real record.
    if (
      !ALLOWED_CATEGORIES.includes(
        record.category.trim().toLowerCase() as (typeof ALLOWED_CATEGORIES)[number]
      )
    ) {
      errors.push(
        `${label}: category "${record.category}" is not one of ${ALLOWED_CATEGORIES.join(", ")}`
      );
    }

    const bonus = record.bonus;
    if (bonus !== undefined) {
      if (!bonus.question?.trim()) {
        errors.push(`${label}: bonus.question is empty`);
      }

      const options = Array.isArray(bonus.options) ? bonus.options : [];
      if (options.length !== 4) {
        errors.push(
          `${label}: bonus.options must have exactly 4 entries (got ${options.length})`
        );
      }
      if (options.some((option) => typeof option !== "string" || !option.trim())) {
        errors.push(`${label}: bonus.options contains an empty entry`);
      }

      // Case-insensitive: two options differing only in case are two correct
      // answers as far as a player is concerned.
      const seen = new Set<string>();
      for (const option of options) {
        const key = String(option).trim().toLowerCase();
        if (seen.has(key)) {
          errors.push(`${label}: bonus.options contains duplicate "${option}"`);
          break;
        }
        seen.add(key);
      }

      if (
        !Number.isInteger(bonus.answerIndex) ||
        bonus.answerIndex < 0 ||
        bonus.answerIndex >= options.length
      ) {
        errors.push(
          `${label}: bonus.answerIndex must be an integer within options (got ${bonus.answerIndex})`
        );
      }

      // The dangerous authoring slip: the true species listed as a decoy makes
      // the round unwinnable and the reveal card self-contradictory. Only
      // checked when the species actually appears among the options, so a
      // fact-round on an animal that happens to have a species is unaffected.
      const species = record.species?.trim();
      if (species) {
        const index = options.findIndex(
          (option) => String(option).trim().toLowerCase() === species.toLowerCase()
        );
        if (index !== -1 && index !== bonus.answerIndex) {
          errors.push(
            `${label}: species "${record.species}" is listed as a decoy at index ${index}, but answerIndex is ${bonus.answerIndex}`
          );
        }
      }
    }
  });

  return errors;
}

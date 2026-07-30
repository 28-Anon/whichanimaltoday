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
  });

  return errors;
}

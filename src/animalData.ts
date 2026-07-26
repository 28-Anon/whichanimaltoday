export interface AnimalRecord {
  commonName: string;
  aliases: string[];
  hint1: string;
  hint2: string;
  hint3: string;
  funFacts: string;
  category: string;
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

    if (
      !ALLOWED_CATEGORIES.includes(
        record.category as (typeof ALLOWED_CATEGORIES)[number]
      )
    ) {
      errors.push(
        `${label}: category "${record.category}" is not one of ${ALLOWED_CATEGORIES.join(", ")}`
      );
    }
  });

  return errors;
}

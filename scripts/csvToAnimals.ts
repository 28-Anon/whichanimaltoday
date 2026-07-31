import { parse } from "csv-parse/sync";
import type { ArchivableAnimal } from "./framerClient";
import { parseAliases } from "./aliases";

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

// "species" is deliberately excluded: the CSV format is a retired Framer CMS
// export that cannot represent the nested fields this feature needs, and
// runtime guards refuse to let these scripts overwrite data containing
// species. Do not "fix" this by adding a CSV header alias for it.
type StringField = Exclude<keyof ArchivableAnimal, "aliases" | "species">;

const STRING_FIELDS: StringField[] = [
  "commonName",
  "imageUrl",
  "hint1",
  "hint2",
  "hint3",
  "funFacts",
  "category",
  "imageAttribution",
];

const FIELD_ALIASES: Record<StringField, string[]> = {
  commonName: ["commonName", "name", "animal"],
  imageUrl: ["imageUrl", "image", "photo"],
  hint1: ["hint1", "hintone"],
  hint2: ["hint2", "hinttwo"],
  hint3: ["hint3", "hintthree"],
  funFacts: ["funFacts", "facts"],
  category: ["category"],
  imageAttribution: ["imageAttribution", "attribution", "credit"],
};

const ALIASES_HEADER_CANDIDATES = ["aliases", "alias"];

function findField(
  normalizedRow: Record<string, string>,
  candidates: string[],
  fieldLabel: string,
  rowIndex: number
): string {
  const normalizedCandidates = candidates.map(normalizeHeader);
  for (const candidate of normalizedCandidates) {
    if (candidate in normalizedRow) {
      return normalizedRow[candidate];
    }
  }
  throw new Error(
    `Row ${rowIndex + 1}: could not find a column for "${fieldLabel}" (tried: ${normalizedCandidates.join(", ")})`
  );
}

export function parseAnimalsCsv(csvContent: string): ArchivableAnimal[] {
  const rows: Array<Record<string, string>> = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });

  return rows.map((row, index) => {
    const normalizedRow: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      normalizedRow[normalizeHeader(key)] = value;
    }

    const animal = {} as ArchivableAnimal;
    for (const field of STRING_FIELDS) {
      animal[field] = findField(
        normalizedRow,
        FIELD_ALIASES[field],
        field,
        index
      );
    }
    animal.aliases = parseAliases(
      findField(normalizedRow, ALIASES_HEADER_CANDIDATES, "aliases", index)
    );
    return animal;
  });
}

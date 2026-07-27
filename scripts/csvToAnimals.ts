import { parse } from "csv-parse/sync";
import type { ArchivableAnimal } from "./framerClient";

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const CANONICAL_FIELDS: Array<keyof ArchivableAnimal> = [
  "commonName",
  "imageUrl",
  "funFacts",
  "category",
  "imageAttribution",
];

const FIELD_ALIASES: Record<keyof ArchivableAnimal, string[]> = {
  commonName: ["commonName", "name", "animal"],
  imageUrl: ["imageUrl", "image", "photo"],
  funFacts: ["funFacts", "facts"],
  category: ["category"],
  imageAttribution: ["imageAttribution", "attribution", "credit"],
};

function findField(
  normalizedRow: Record<string, string>,
  field: keyof ArchivableAnimal,
  rowIndex: number
): string {
  const candidates = FIELD_ALIASES[field].map(normalizeHeader);
  for (const candidate of candidates) {
    if (candidate in normalizedRow) {
      return normalizedRow[candidate];
    }
  }
  throw new Error(
    `Row ${rowIndex + 1}: could not find a column for "${field}" (tried: ${candidates.join(", ")})`
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
    for (const field of CANONICAL_FIELDS) {
      animal[field] = findField(normalizedRow, field, index);
    }
    return animal;
  });
}

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ArchivableAnimal } from "./framerClient";
import { buildArchiveEntry, type ArchiveEntry } from "./archiveEntry";
import { appendArchiveEntryIfMissing } from "./archiveStore";
import { getPreviousUtcDay } from "./dateUtils";

const LAUNCH_DATE = new Date("2026-08-01T00:00:00Z");
const ANIMALS_PATH = fileURLToPath(new URL("../data/animals.json", import.meta.url));
const ARCHIVE_PATH = fileURLToPath(new URL("../data/archive.json", import.meta.url));

function main(): void {
  if (!existsSync(ANIMALS_PATH)) {
    throw new Error(
      "data/animals.json not found. Run `npm run import:animals -- <csv>` " +
        "(or `npm run export:animals` if you have Server API access) first, " +
        "and commit the result."
    );
  }

  const animals: ArchivableAnimal[] = JSON.parse(
    readFileSync(ANIMALS_PATH, "utf-8")
  );
  const dayToArchive = getPreviousUtcDay(new Date());
  const entry = buildArchiveEntry(animals, dayToArchive, LAUNCH_DATE);

  const existing: ArchiveEntry[] = existsSync(ARCHIVE_PATH)
    ? JSON.parse(readFileSync(ARCHIVE_PATH, "utf-8"))
    : [];

  const updated = appendArchiveEntryIfMissing(existing, entry);

  if (updated.length !== existing.length) {
    writeFileSync(ARCHIVE_PATH, JSON.stringify(updated, null, 2) + "\n");
    console.log(
      `Archived puzzle #${entry.puzzleNumber} (${entry.date}): ${entry.commonName}`
    );
  } else {
    console.log(`Entry for ${entry.date} already archived, nothing to do.`);
  }
}

main();

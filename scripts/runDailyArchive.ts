import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchAnimalsFromFramer } from "./framerClient";
import { buildArchiveEntry, type ArchiveEntry } from "./archiveEntry";
import { appendArchiveEntryIfMissing } from "./archiveStore";
import { getPreviousUtcDay } from "./dateUtils";

const LAUNCH_DATE = new Date("2026-08-01T00:00:00Z");
const COLLECTION_NAME = "Animals";
const ARCHIVE_PATH = fileURLToPath(new URL("../data/archive.json", import.meta.url));

async function main(): Promise<void> {
  const projectUrl = process.env.FRAMER_PROJECT_URL;
  const apiKey = process.env.FRAMER_API_KEY;

  if (!projectUrl || !apiKey) {
    throw new Error(
      "FRAMER_PROJECT_URL and FRAMER_API_KEY environment variables must be set"
    );
  }

  const animals = await fetchAnimalsFromFramer(
    projectUrl,
    apiKey,
    COLLECTION_NAME
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import type { ArchiveEntry } from "./archiveEntry";

export function appendArchiveEntryIfMissing(
  existingEntries: ArchiveEntry[],
  newEntry: ArchiveEntry
): ArchiveEntry[] {
  const alreadyExists = existingEntries.some(
    (entry) => entry.date === newEntry.date
  );
  if (alreadyExists) {
    return existingEntries;
  }
  return [...existingEntries, newEntry];
}

import { getTodayPuzzleIndex, getDaysSinceLaunch } from "../src/puzzleIndex";
import { buildSlug } from "./slug";
import { formatUtcDate } from "./dateUtils";
import type { ArchivableAnimal } from "./framerClient";

export interface ArchiveEntry {
  puzzleNumber: number;
  date: string;
  slug: string;
  commonName: string;
  imageUrl: string;
  funFacts: string;
  category: string;
  imageAttribution: string;
}

export function buildArchiveEntry(
  animals: ArchivableAnimal[],
  dayToArchive: Date,
  launchDate: Date
): ArchiveEntry {
  const index = getTodayPuzzleIndex(dayToArchive, launchDate, animals.length);
  const animal = animals[index];
  const puzzleNumber = getDaysSinceLaunch(dayToArchive, launchDate) + 1;

  return {
    puzzleNumber,
    date: formatUtcDate(dayToArchive),
    slug: buildSlug(animal.commonName, puzzleNumber),
    commonName: animal.commonName,
    imageUrl: animal.imageUrl,
    funFacts: animal.funFacts,
    category: animal.category,
    imageAttribution: animal.imageAttribution,
  };
}

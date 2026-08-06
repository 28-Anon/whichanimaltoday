import {
  getTodayPuzzleIndex,
  getDaysSinceLaunch,
  selectDailyAnimals,
} from "../src/puzzleIndex";
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
  species?: string;
}

export function buildArchiveEntry(
  animals: ArchivableAnimal[],
  dayToArchive: Date,
  launchDate: Date
): ArchiveEntry {
  // Must index the same list the game does. The game filters out animals that
  // can never be a daily puzzle before picking, so archiving against the
  // unfiltered list would record a different animal than players were shown —
  // silently, and only in the archive and the field journal.
  const daily = selectDailyAnimals(animals);
  const index = getTodayPuzzleIndex(dayToArchive, launchDate, daily.length);
  const animal = daily[index];
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
    ...(animal.species ? { species: animal.species } : {}),
  };
}

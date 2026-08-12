/**
 * What term the image search actually uses.
 *
 * Normally the record decides: the scientific name if it has one, because a
 * common-name search is what returned a roller coaster called "Dragon Fly".
 *
 * The override exists because the record's term can quietly poison a search in a
 * way nobody sees. Measured 2026-08-12 on Bat, whose species reads "Flying fox":
 * `findSpeciesCategory` settled on `Category:Pteropus in flight`, so every
 * candidate the judge saw was a bat in flight and every survivor was a
 * silhouette against grey sky. Nothing failed — the search simply answered a
 * narrower question than the one being asked, and there was no way to ask again
 * without editing `data/animals.json`, which is production data.
 */
export interface Searchable {
  commonName: string;
  species?: string;
}

export function resolveQuery(animal: Searchable, override?: string): string {
  const chosen = override?.trim();
  if (chosen) return chosen;
  return animal.species ?? animal.commonName;
}

/**
 * A single override cannot serve several animals, and applying one silently
 * would search for the same creature repeatedly while reporting different
 * names — expensive, and wrong in a way the output would not show.
 */
export function queryOverrideError(
  targetCount: number,
  override?: string
): string | null {
  if (!override?.trim()) return null;
  if (targetCount > 1) {
    return `--query applies to one animal at a time, but ${targetCount} were named.`;
  }
  return null;
}

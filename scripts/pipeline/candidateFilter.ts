import { isAllowedLicence } from "./gates";

export interface Candidate {
  file: string;
  width: number;
  height: number;
  licence: string;
  artist: string;
}

/**
 * Filename words that mean the file is not a usable puzzle photograph.
 *
 * Every entry here was learned from an image that actually shipped or was
 * actually offered as a replacement, not guessed in advance:
 *
 * - engraving/lithograph/plate — the Victorian steel engraving of the pink
 *   fairy armadillo, which was live
 * - painting/artwork — the helmeted hornbill, also live
 * - museum/mount/specimen/skeleton/skull — the dodo case, and the Chinese
 *   giant salamander lying beside its caption card
 * - stamp — Commons is full of postage stamps of rare birds
 * - diagram/map/chart/figure — journal figures, which dominate the
 *   categories of critically endangered species
 *
 * `fig` must be followed by a number. A bare word boundary rejected
 * "Double-eyed Fig Parrot", which is a bird, and would also have rejected
 * every animal photographed in a fig tree.
 *
 * This is a cheap pre-filter, not the rule. Its only job is to avoid paying
 * to look at files whose names already say they will fail. Anything it lets
 * through is still judged, and plenty that it lets through still fails —
 * see the known-limitation test for old book scans.
 */
export const BAD_NAME =
  /stamp|drawing|illustration|engraving|lithograph|plate|painting|artwork|diagram|map|logo|skull|skeleton|specimen|museum|mount|distribution|chart|figure|\bfig[\s._-]*\d/i;

/** Below this a photo is too small to fill a puzzle card cleanly. */
export const MIN_WIDTH = 800;

export function isWorthJudging(candidate: Candidate): boolean {
  // Illustrations on Commons are almost always PNG or SVG; photographs are
  // almost always JPEG. This caught the cartoon blobfish, the only PNG in a
  // list of 58.
  if (/\.(png|svg|gif|tiff?)$/i.test(candidate.file)) return false;
  if (BAD_NAME.test(candidate.file)) return false;
  if (!isAllowedLicence(candidate.licence)) return false;
  if (candidate.width < MIN_WIDTH) return false;
  return true;
}

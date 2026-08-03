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
  /stamp|drawing|illustration|engraving|lithograph|plate|painting|artwork|diagram|map|logo|skull|skeleton|specimen|stuffed|taxiderm|foetal|fetal|foetus|fetus|museum|mount|distribution|chart|figure|\bfig[\s._-]*\d/i;

/**
 * Museum accession numbers: an institution code in capitals followed by a
 * catalogue number, as in "Orycteropus afer 01 MWNH 147.JPG".
 *
 * A run on the aardvark spent four judgements on three photographs of the
 * same skull and one taxidermy mount, none of which carried a word meaning
 * "specimen". The accession number is the tell — a photographer naming a
 * living animal has no reason to append one.
 *
 * The separator is mandatory, and that is the whole subtlety. Without it the
 * rule also matched "DSCN3810" — a Nikon camera filename, and most of
 * Commons is camera filenames. Museum codes are written "MWNH 147" with the
 * catalogue number set apart; cameras run the digits straight on.
 *
 * The cost is that an accession written solid, "MWNH147", slips through and
 * gets judged. That is the right way round to be wrong: judging a few extra
 * files wastes pennies, while skipping real photographs wastes the search.
 */
export const ACCESSION_NUMBER = /\b[A-Z]{3,}[\s-]\d{2,}\b/;

/** Below this a photo is too small to fill a puzzle card cleanly. */
export const MIN_WIDTH = 800;

export function isWorthJudging(candidate: Candidate): boolean {
  // An allowlist, not a denylist. Illustrations on Commons are almost always
  // PNG or SVG and photographs are almost always JPEG — that caught the
  // cartoon blobfish, the only PNG of 58 — but naming the formats to reject
  // let "Aardvark.pdf" through from a category listing, which unlike search
  // is not restricted to bitmaps. Naming what is allowed cannot be
  // out-flanked by a format nobody thought of.
  if (!/\.(jpe?g|webp)$/i.test(candidate.file)) return false;
  if (BAD_NAME.test(candidate.file)) return false;
  if (ACCESSION_NUMBER.test(candidate.file)) return false;
  if (!isAllowedLicence(candidate.licence)) return false;
  if (candidate.width < MIN_WIDTH) return false;
  return true;
}

import { kebabCase } from "./slug";
import { CDN_BASE } from "./displayImages";

/**
 * The pure half of `scripts/mirrorArchiveImages.ts` — which archived days are
 * still served by somebody else, and what to call the file once it is ours.
 *
 * `data/archive.json` holds a *copy* of `imageUrl` taken on the day each puzzle
 * ran, which is the point: the archive records what players actually saw. The
 * consequence is that it can outlive the URL. Puzzle #2 was archived on
 * 2026-08-02, before the mirror pass moved animal photos off Commons, so it
 * still points at `upload.wikimedia.org` — the last hotlink anywhere on the
 * site.
 *
 * **The fix is never to repoint an archived day at the animal's current image.**
 * Checked on 2026-08-12: `images/red-panda-2.jpg` is a different photograph from
 * the one puzzle #2 showed — a red panda eating bamboo on a log, where players
 * saw one on a rope bridge. Swapping it would falsify the record. The same
 * photograph has to be mirrored, or nothing does.
 */
export interface ArchiveEntry {
  puzzleNumber: number;
  commonName: string;
  imageUrl: string;
  [key: string]: unknown;
}

/** Whether this repo serves the URL, whatever path under it. */
export function isOurs(imageUrl: string): boolean {
  return (imageUrl ?? "").startsWith(CDN_BASE);
}

export function hotlinkedEntries(archive: ArchiveEntry[]): ArchiveEntry[] {
  return archive.filter((entry) => !isOurs(entry.imageUrl));
}

/**
 * What to call the mirrored file.
 *
 * Named for the puzzle rather than the animal, and that is the whole subtlety.
 * `images/` is keyed by animal slug — `red-panda-2.jpg` is the second animal's
 * photograph, not the second puzzle's — and for the red panda those are two
 * different pictures. A `puzzle-` prefix cannot collide with an animal slug, so
 * an archive-only photograph can never be mistaken for a live one, in either
 * direction.
 */
export function archiveFileFor(entry: ArchiveEntry): string {
  return `puzzle-${entry.puzzleNumber}-${kebabCase(entry.commonName)}.jpg`;
}

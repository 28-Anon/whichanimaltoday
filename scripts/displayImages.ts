/**
 * The pure half of `scripts/generateDisplayImages.ts` — everything that decides
 * *which* files to derive and *what* the resulting URLs are, with no filesystem
 * or image encoding involved, so it can be tested.
 *
 * Background, measured 2026-08-07 across all 89 files in images/: median 305 KB,
 * average 358 KB, largest 1,169 KB, 31 MB in total, rendered into a box a few
 * hundred pixels wide. Beat the Clock is where that hurts — a 45-second run
 * answers around fifteen animals and preloads the next one each time, so one run
 * pulls roughly 5 MB, on the phone-and-mobile-data audience the short-form video
 * plan is meant to bring. See docs/follow-ups.md, "Every image ships roughly ten
 * times the bytes it needs".
 */

/** Must match the repo mirrorCommonsImages.ts writes to. */
export const REPO = "28-Anon/whichanimaltoday";

/**
 * Derivatives go in their own directory rather than alongside the originals
 * under a suffixed name. Either would work; a directory means the whole set can
 * be regenerated at a different size by deleting one folder, and it keeps
 * `images/` readable as what it is — the archive of originals, which is the only
 * copy of each photograph and the thing a future layout change re-derives from.
 *
 * What matters more than the choice is that these are **new paths**. jsDelivr
 * caches `@master` for hours, so overwriting a path it has already served leaves
 * the CDN handing out the old bytes while animals.json points at the new URL —
 * measured on 2026-08-03, when five overwritten paths still served superseded
 * images minutes after the push, including a rejected quetzal that would have
 * gone live. A new path cannot have that problem, so no purge is involved here.
 */
export const DISPLAY_DIR = "images/display";

/**
 * 1000px wide at JPEG quality 80.
 *
 * Not sized for today's 330px box. The redesign brief (2026-08-07) argues for a
 * 450–520px image and is right, so deriving 330px copies now would only have to
 * be redone. 1000px covers a 500px display at 2x for high-density screens, which
 * is the realistic worst case, and still cuts the median by well over half.
 */
export const DISPLAY_WIDTH = 1000;
export const DISPLAY_QUALITY = 80;

/**
 * A derivative is adopted only if it is a real improvement. Re-encoding an
 * already-small photograph can produce a file that is no smaller — or larger —
 * and swapping the URL for one of those spends a paste-free data change on
 * nothing while adding a second file to keep track of.
 */
export const ADOPT_BELOW = 0.9;

/** Everything this repo serves sits under here. */
export const CDN_BASE = `https://cdn.jsdelivr.net/gh/${REPO}@master/`;

const JSDELIVR_IMAGES = `${CDN_BASE}images/`;

/**
 * The filename in images/ that an animal's imageUrl points at, or null if the
 * URL is not one of ours.
 *
 * Deliberately derived from the URL rather than rebuilt with buildSlug: the
 * numeric suffix is the index the animal held *when its photo was added*, and
 * replacement images were given fresh numbers (chinchilla-30, starfish-88), so
 * for several animals buildSlug(commonName, index) names a file that does not
 * exist. The URL is the only reliable source.
 */
export function originalFileFor(imageUrl: string): string | null {
  if (!imageUrl.startsWith(JSDELIVR_IMAGES)) return null;
  const rest = imageUrl.slice(JSDELIVR_IMAGES.length);
  // Anything with a further path segment is not a file directly in images/ —
  // notably a display/ URL, so re-running the script cannot derive from its own
  // output.
  if (rest.includes("/") || rest === "") return null;
  return rest;
}

export function displayUrlFor(file: string): string {
  return `${CDN_BASE}${DISPLAY_DIR}/${file}`;
}

/** The URL for a file in images/ — the original, not a derivative. */
export function originalUrlFor(file: string): string {
  return `${JSDELIVR_IMAGES}${file}`;
}

/** Whether a derived file is enough smaller to be worth adopting. */
export function isWorthAdopting(
  originalBytes: number,
  derivedBytes: number
): boolean {
  if (originalBytes <= 0) return false;
  return derivedBytes / originalBytes < ADOPT_BELOW;
}

export function formatKb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

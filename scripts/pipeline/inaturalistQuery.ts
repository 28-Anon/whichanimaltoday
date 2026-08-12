import type { Candidate } from "./candidateFilter";
import { isAllowedLicence } from "./gates";

/**
 * The pure half of the iNaturalist source: what to ask for, and how to read the
 * answer. No network here, which is the point — the licence handling is the
 * part that must not be got wrong, and this is where it can be tested.
 *
 * Why iNaturalist at all. Research-grade observations carry a community-verified
 * species ID, which is exactly the check that would have caught a roller coaster
 * called Dragon Fly filed as a dragonfly. Phase 2 found the photography better
 * than Commons too, and sourced 31 animals here **by hand**, because no client
 * existed — searching `Bubo bubo` on Commons returned seashells, while
 * iNaturalist had eagle owls.
 *
 * Commons is not replaced by this. It has the deeper archive, and which source
 * wins is animal-dependent: Commons supplied only the pig in phase 2, but it is
 * the only place with a usable wild aardvark.
 */
const API = "https://api.inaturalist.org/v1/observations";

/**
 * Filtered at the API rather than after fetching, so a non-commercial photo
 * never enters the pipeline at all.
 */
export const INAT_PHOTO_LICENCES = "cc0,cc-by,cc-by-sa";

/**
 * iNaturalist reports a hyphenated code; `gates.ts` expects the spaced form
 * used on the credits page and fails closed on anything it does not recognise.
 * `cc-by-sa` fails `isAllowedLicence` on its hyphens, so without this mapping
 * every usable photograph would be rejected — and the failure would present as
 * "iNaturalist has nothing for this animal", which is the kind of wrong answer
 * nobody investigates.
 *
 * The versions are the ones iNaturalist actually issues.
 */
const LICENCE_NAMES: Record<string, string> = {
  cc0: "CC0 1.0",
  "cc-by": "CC BY 4.0",
  "cc-by-sa": "CC BY-SA 4.0",
};

export function buildObservationsUrl(taxonName: string, perPage = 30): string {
  const params = new URLSearchParams({
    taxon_name: taxonName,
    quality_grade: "research",
    photos: "true",
    photo_license: INAT_PHOTO_LICENCES,
    per_page: String(perPage),
    // Votes order the fetch queue and nothing else. Phase 2 found that ranking
    // iNaturalist by votes selects for drama — a herd at a waterhole, an owl
    // with two owlets, a horse with an egret standing on it — so the judge
    // decides what survives, not this parameter.
    order_by: "votes",
    locale: "en",
  });
  return `${API}?${params.toString()}`;
}

export function normaliseLicence(
  code: string | null | undefined
): string | null {
  const name = LICENCE_NAMES[(code ?? "").toLowerCase()];
  if (!name) return null;
  // Belt and braces: the same gate the Commons path goes through, so one
  // rejection rule serves both sources and a careless edit to LICENCE_NAMES
  // cannot let NC through on its own.
  return isAllowedLicence(name) ? name : null;
}

/**
 * "(c) Jane Doe, some rights reserved (CC BY)" -> "Jane Doe".
 *
 * Falls back to the whole string rather than to an empty author: an
 * unattributed photograph on the credits page is a licence breach, so a messy
 * name is strictly better than none.
 */
function photographer(attribution: string): string {
  const match = attribution.match(/^\(c\)\s*([^,]+)/i);
  return (match?.[1] ?? attribution).trim();
}

interface RawPhoto {
  url?: string;
  license_code?: string | null;
  attribution?: string;
  original_dimensions?: { width?: number; height?: number };
}

/**
 * iNaturalist's `url` is the square thumbnail. `large` is the biggest
 * derivative served without asking for the original, capped at 1024 on the long
 * side.
 *
 * When `original_dimensions` is absent the candidate is assumed to be that cap
 * rather than dropped. The width gate exists to reject thumbnails; the real
 * check on whether a photograph is usable is the legibility pass, which judges
 * a copy scaled to the game's 330x248 box.
 */
const LARGE_FALLBACK = 1024;

export function toCandidates(payload: unknown): Candidate[] {
  const results =
    (payload as { results?: { photos?: RawPhoto[] }[] })?.results ?? [];

  const candidates: Candidate[] = [];
  for (const observation of results) {
    for (const photo of observation.photos ?? []) {
      const licence = normaliseLicence(photo.license_code);
      if (!licence || !photo.url) continue;

      candidates.push({
        file: photo.url.replace(/square\.(jpe?g|png)$/i, "large.$1"),
        width: photo.original_dimensions?.width ?? LARGE_FALLBACK,
        height: photo.original_dimensions?.height ?? LARGE_FALLBACK,
        licence,
        artist: photographer(photo.attribution ?? ""),
      });
    }
  }
  return candidates;
}

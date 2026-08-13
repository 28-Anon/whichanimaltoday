/**
 * The credit line, and the parsing that feeds it.
 *
 * Every photograph the pipeline offers arrives with an attribution string
 * written by somebody else — iNaturalist composes one per photo, Commons
 * stores an HTML fragment in `extmetadata.Artist` — and the line that ends up
 * in `data/animals.json` is built from it by hand. The point of the suggester
 * is that its output can be trusted enough to paste, so the parsing belongs
 * here, tested, rather than in each person applying a photograph.
 *
 * Three real failures on 2026-08-12 are why this module exists. None reached
 * the data file, because a human read every line before pasting it:
 *
 * - **"no rights reserved" offered as a photographer's name.** CC0
 *   attributions carry no author at all, and the old parser fell back to the
 *   whole string, so the credits page would have named a licence phrase as a
 *   person. Written out by hand as `Photo: CC0 1.0, iNaturalist` for the cow.
 * - **An empty name**: `Photo: , CC BY-SA 3.0, Wikimedia Commons`, offered for
 *   a ladybug candidate. Cosmetic under CC0; under CC BY-SA it is a licence
 *   breach, because attribution is the thing that licence asks for.
 * - **`&amp;` left undecoded** — "Marion Schneider &amp; Christoph
 *   Aistleitner". Stripping tags is not the same as decoding entities.
 *
 * The rule this settles on: parse the name where there is one, say so plainly
 * where there is not, and never emit a line that credits nobody under a licence
 * that requires a credit. `isAttributable` lets the cheap filter drop those
 * before anybody pays to judge them.
 */

/**
 * The named entities that actually turn up in Commons artist fields, plus the
 * numeric form. Not a full HTML entity table — an unknown entity is left
 * exactly as written rather than guessed at, so it shows up in review as the
 * oddity it is instead of becoming a plausible wrong name.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(value: string): string {
  return (value ?? "").replace(
    /&(#\d+|#x[0-9a-f]+|[a-z]+);/gi,
    (whole, body: string) => {
      if (body.startsWith("#")) {
        const code = body.startsWith("#x") || body.startsWith("#X")
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
    }
  );
}

/**
 * extmetadata values arrive as HTML fragments — the Artist field especially,
 * which is usually a link to the uploader's user page.
 *
 * Entities are decoded after the tags come out, so an `&lt;` written as an
 * entity cannot be re-read as the start of a tag.
 */
export function stripHtml(value: string): string {
  return decodeEntities((value ?? "").replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

/** "some rights reserved (CC BY)", "no rights reserved", "all rights reserved". */
const RIGHTS_PHRASE = /\b(no|some|all)\s+rights\s+reserved\b\s*(\([^)]*\))?/gi;

/**
 * The photographer named in an attribution string, or "" when it names nobody.
 *
 * The forms iNaturalist actually issues, measured 2026-08-12:
 *
 *     (c) Jane Doe, some rights reserved (CC BY)
 *     (c) Jane Doe, some rights reserved (CC BY-SA), uploaded by Jane Doe
 *     no rights reserved, uploaded by Jane Doe
 *     no rights reserved
 *
 * Anything left over after the boilerplate comes out is returned as-is rather
 * than discarded — a messy name is still a credit, and the credits page can be
 * tidied by the person pasting it. Only a string that is *nothing but*
 * boilerplate returns "", which is the honest answer for a CC0 photograph
 * whose observer chose not to be named.
 */
export function photographer(attribution: string): string {
  const value = stripHtml(attribution ?? "");
  if (!value) return "";

  // The copyright holder first, where there is one: that is the person the
  // licence asks to be credited. "uploaded by" can name somebody else — the
  // account that filed the observation rather than whoever took the picture —
  // and is the only name a CC0 string carries at all.
  const copyright = value.match(/^\(c\)\s*([^,]+)/i);
  if (copyright) return copyright[1].trim();

  const uploaded = value.match(/\buploaded by\s+([^,]+)/i);
  if (uploaded) return uploaded[1].trim();

  const remainder = value
    .replace(RIGHTS_PHRASE, "")
    .replace(/^\(c\)\s*/i, "")
    .replace(/[\s,]+$/, "")
    .replace(/^[\s,]+/, "")
    .trim();

  return remainder;
}

/**
 * Licences that ask for no credit at all. Deliberately narrow: anything not
 * named here is treated as requiring attribution, so a licence string nobody
 * anticipated fails towards crediting rather than away from it.
 *
 * Must stay a subset of what `gates.ts` allows — this decides how to credit a
 * photograph, never whether it may be used.
 */
const WAIVES_ATTRIBUTION = /^(cc0|public domain|pd(-|\s|$)|no restrictions)/i;

export function requiresAttribution(licence: string): boolean {
  return !WAIVES_ATTRIBUTION.test((licence ?? "").trim());
}

export interface Attributable {
  artist: string;
  licence: string;
}

/**
 * Whether a credit line can be built at all.
 *
 * A CC BY-SA photograph with no author in its metadata cannot be used on the
 * site, so paying a judgement to look at it is spend on something unusable —
 * which is why `isWorthJudging` asks this before the model sees anything. The
 * author is sometimes recoverable by hand from the Commons file page; that is a
 * deliberate human step, not something to guess at here.
 */
export function isAttributable(candidate: Attributable): boolean {
  if (photographer(candidate.artist).length > 0) return true;
  return !requiresAttribution(candidate.licence);
}

/**
 * The line to paste into `imageAttribution`, or null when none can be built.
 *
 * The no-author CC0 form matches what was written by hand for the cow on
 * 2026-08-12 — `Photo: CC0 1.0, iNaturalist` — so the tool now produces the
 * line a human already decided was right.
 */
export function buildAttribution(candidate: {
  artist: string;
  licence: string;
  source: string;
}): string | null {
  const name = photographer(candidate.artist);
  const licence = (candidate.licence ?? "").trim();

  if (name) return `Photo: ${name}, ${licence}, ${candidate.source}`;
  if (requiresAttribution(licence)) return null;
  return `Photo: ${licence}, ${candidate.source}`;
}

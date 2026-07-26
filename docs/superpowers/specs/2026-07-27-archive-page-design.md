# WhichAnimalToday Archive Feature — Design

**Date:** 2026-07-27
**Status:** Approved, pending implementation plan

## Context

Follow-up to the [game engine MVP spec](2026-07-26-whichanimaltoday-mvp-design.md).
The main game gets most of its traffic from social sharing, which is
inherently one-shot (a visitor plays today's puzzle, leaves). This feature
adds two things Framer's Archive/How-to-Play prompt already sketched
visually: a browsable history of past animals (each with its own
indexable page, for organic search traffic) and more reasons for a
visitor to click around per session (more ad impressions per visit).

**Note on redundant risk:** the main game already loads the entire
"Animals" collection into the page (per the original MVP spec's accepted
risk that all daily answers are technically visible via dev tools/JS
inspection before their day). This feature's separate-data-source design
below isn't primarily about preventing that raw data from being
*available* — it already is. It's about preventing future answers from
becoming *prominently discoverable* (e.g. indexed by Google as
"GiraffeName — Day 45"), which is a much louder spoiler than an obscure
JSON blob a determined visitor could dig up.

## 1. Architecture

- The existing **"Animals" CMS collection** (500 rows, used by the daily
  game) is untouched by this feature.
- A new file, **`data/archive.json`**, in this git repo is the sole data
  source for the Archive feature. It starts as `[]` and gains exactly one
  entry per calendar day, appended by the daily job (Section 2). Nothing
  else writes to it.
- The file is served as a plain static asset via its **raw GitHub content
  URL** (`https://raw.githubusercontent.com/<owner>/<repo>/master/data/archive.json`)
  — public repos serve this with permissive CORS, so no hosting setup
  (e.g. GitHub Pages) is needed beyond the repo being public. *(If CORS
  or caching behavior from raw GitHub content turns out to be a problem
  in practice, GitHub Pages is the fallback — noted here so it isn't a
  surprise if Section 2's implementation needs to pivot.)*
- In Framer, an Archive list view and per-animal detail view (both
  covered by the earlier Framer prompt's visual design) are driven by a
  code component that fetches this public JSON and renders from it
  client-side — no Framer CMS collection, no Framer write API, no
  external credentials of any kind.

**Why this is the safest option:** the only credential involved anywhere
in this feature is GitHub's own auto-scoped `GITHUB_TOKEN`, used by the
daily job to commit to its own repo. There is no Framer API token, no
write-access credential to anything, and no dependency on Framer's write
API (whose existence was never confirmed). The published data is
non-sensitive (already-revealed animal facts), so making it public
static content carries no real exposure.

**Trade-off accepted:** client-side-rendered pages from fetched JSON are
generally indexable by Google but not as reliably/immediately as
Framer's natively CMS-backed pages would be. Given safety was the
explicit priority, this is the right trade.

**Security framing, explicitly:** "safest" here means the live website
ships no API key or credential of any kind to the browser, and exposes
no write-capable endpoint a visitor could hit — the Archive pages only
ever *read* a public static file. The `GITHUB_TOKEN` used by the daily
job (Section 2) exists solely inside GitHub's CI runner and is never
part of the deployed site, so it's not discoverable via dev tools,
view-source, or network inspection. This is distinct from the main
game's already-accepted spoiler risk (all 500 animals' data is loaded
client-side to run the daily picker, so a visitor could see future
answers early) — that's an information-disclosure trade-off already
signed off on in the MVP spec, not a security hole: it grants no write
access, no credential exposure, and no way to affect the site or other
visitors.

## 2. Daily archiving job

A scheduled **GitHub Actions workflow** (cron, once daily shortly after
UTC midnight, e.g. `15 0 * * *`) runs a small Node script that:

1. Computes `dayToArchive` = the UTC calendar day that just ended
   (i.e. "yesterday" relative to the run).
2. Calls `getTodayPuzzleIndex(dayToArchive, LAUNCH_DATE, animals.length)`
   — the same tested function from the game engine — to find which row
   in the "Animals" collection was featured that day.
3. Reads that row's data via Framer's **Server API** — an API key
   generated in Framer's Site Settings, used server-side only (as a
   GitHub Actions secret, never shipped to the browser) with the
   `framer-api` npm package to pull the "Animals" collection as
   structured data. This is read-only usage of that API; the key itself
   is a normal server-to-server credential, not a client-exposed one, so
   it doesn't change the "no credential reaches the browser" security
   framing above. (This same Server API call is also how
   `data/animals.json`, referenced in the main game's
   `docs/framer-integration.md`, gets produced — both jobs share one
   Framer-read module.)
4. Builds an archive entry (Section 3's shape) and appends it to
   `data/archive.json`, **skipping if an entry for that date already
   exists** (idempotent — safe to accidentally run the job twice).
5. Commits and pushes the updated file using the workflow's built-in
   `GITHUB_TOKEN` — no other secret is created or stored.

Step 4's "build the entry and decide whether to append" logic is a pure,
unit-testable function, independent of the actual HTTP/file-write calls
in steps 3 and 5.

## 3. Data model

Each entry in `data/archive.json`:

| Field | Purpose |
|---|---|
| `puzzleNumber` | 1-indexed day count since launch (matches the share-card format from the main game spec) |
| `date` | `YYYY-MM-DD`, the UTC calendar day this animal was featured |
| `slug` | URL-safe identifier for the detail page, e.g. `giraffe-12` (kebab-case name + puzzle number, since names repeat once the 500-animal list cycles after ~16 months) |
| `commonName` | Animal's name |
| `imageUrl` | The photo used that day |
| `funFacts` | Same content shown on the main game's reveal card |
| `category` | Taxonomic group, copied from the Animals collection |
| `imageAttribution` | Source/license credit |

## 4. Archive pages (Framer)

- **List page:** fetches `archive.json`, renders newest-first, one card
  per entry (image thumbnail, name, `#<puzzleNumber> · <date>`) — visual
  design already covered by the earlier Framer prompt.
- **Detail page:** a single dynamic-route Framer page (e.g. `/archive/:slug`)
  rendering the matching entry's full photo, name, and `funFacts`. Framer
  supports defining a dynamic-route page independent of any CMS
  collection, passing the `:slug` segment into the code component as a
  prop — confirmed via Framer's community/reference docs, though not from
  an authoritative first-party page directly, so treat this as
  high-confidence rather than certain. **Fallback if it doesn't behave as
  expected in practice:** a single detail page reading a `?slug=` query
  parameter instead of a clean path segment.
- Neither page ever reads from the "Animals" collection directly — only
  from `archive.json`, so there is no code path by which an unfeatured
  animal could appear here.

## 5. Resolved risks (previously open)

Both risks flagged in the original version of this spec were researched
and resolved before implementation:

1. **Reading the "Animals" collection from the daily job** — resolved:
   Framer's Server API (API key + `framer-api` npm package) supports
   exactly this, server-side only. See Section 2, step 3.
2. **Per-animal detail page routing** — resolved with high (not
   absolute) confidence: Framer supports dynamic-route pages independent
   of CMS collections, passing the URL segment as a prop. See Section 4
   for the documented fallback if this doesn't hold up in practice.

## 6. Related correction to the main game

This research also surfaced that the main game's `docs/framer-integration.md`
(written before this spec) relied on an approach Framer has since
deprecated — code components can no longer read CMS collections directly
at all, not just unreliably. That guide has been corrected to use the
same pattern as this spec: a `data/animals.json` file (produced by the
same Framer Server API read used in Section 2) fetched directly by the
game's code component, rather than any in-Framer CMS access.

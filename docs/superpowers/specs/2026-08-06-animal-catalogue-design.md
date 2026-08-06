# Animal Catalogue — Design

**Date:** 2026-08-06
**Status:** Approved, not implemented.

## Context

The owner asked for "a page of all the animals explaining them and what they
are so people can learn about them before guessing them", reachable "only after
you complete the animal of the day".

Most of the machinery already exists and is doing something adjacent.
`/archive` runs `buildJournal`, joining `data/archive.json` with local history
to show past animals stamped identified, starred or missed.
`/archive-detail?slug=` already shows a photo, name, fun facts and credit.

Two deliberate properties of that page are exactly what the request is not:

- **It hides everything from before the player's first game.** `buildJournal`
  filters to `date >= firstPlayed`, so a newcomer does not meet a wall of grey
  "missed" stamps. Correct for a personal record, wrong for something meant to
  teach — a new player opens it and there is nothing to read.
- **It answers "what did I play", not "what animals are there".**

### The supply problem, stated up front

The only spoiler-safe source is animals already featured. `data/archive.json`
holds six entries today and grows by one a day. A learning page with six animals
is thin, and it stays thin for weeks.

**The eleven `dailyEligible: false` animals fix most of day one.** Chowsingha,
Saola, Ibisbill and the rest can never be a daily answer, so listing them spoils
nothing — and giving them somewhere to be read about is precisely the argument
for keeping them in the file at all. Seventeen entries on day one instead of six.

It is still a thin encyclopedia until roughly the hundred-day mark. That is
accepted, not solved.

## Decisions

### 1. `/archive` becomes two tabs, not a fifth page

**Collection** is the Field Journal exactly as it stands — the player's own
stamps and counts, always visible. **Catalogue** is the new encyclopedia.

One route, one nav entry, one set of detail pages. A fifth nav item on mobile to
host a page that looks much like the fourth is a worse outcome than a tab.

Locking a player out of their own record would be strange, so **only the
Catalogue tab is gated**.

### 2. `data/catalogue.json`, generated, spoiler-safe by construction

A new file written by the existing daily Action alongside `archive.json`, and by
a one-off backfill for what already exists.

It contains exactly two kinds of entry:

- every animal already featured as a daily puzzle, and
- every animal with `dailyEligible: false`.

**The page reads only this file.** It must never fetch `data/animals.json`,
which contains every future answer. That is the whole reason the file exists:
spoiler safety becomes a property of the generator, checked once by a test,
rather than a rule the UI has to keep remembering.

Each entry carries more than `archive.json` does today: `species`, `hint1`,
`hint2`, `hint3`, `aliases` and `bonus`, joined from `animals.json` on
`commonName` at build time. The generator **reports any archive entry it cannot
match** rather than silently emitting a thin record — a rename is the one thing
that breaks the join.

**One entry per animal, not per appearance.** Once the rotation wraps on 18
October an animal recurs on new dates; the catalogue keys by `commonName` and
records `firstFeatured` plus a `timesFeatured` count.

**The featured animals come from `archive.json`, which by construction holds
only days that have finished.** The generator additionally refuses any entry
dated later than the day it runs. That guard is redundant today and is kept
anyway: it is the single assertion standing between a generator bug and handing
players tomorrow's answer.

#### Today's animal is missing until tomorrow, and that is deliberate

`runDailyArchive` writes the *previous* day at 00:15 UTC, so `archive.json`
never contains today. A player therefore solves today's puzzle, unlocks the
catalogue on the strength of it, and does not find today's animal there.

That is unfortunate and it is still the right call. The alternative — writing
today's entry into a public file — would make `catalogue.json` itself a source
of the day's answer for anyone who fetched it without playing, which destroys
the one property this file exists to have.

**It is also the same bug the field journal already has**, recorded under
"Today's puzzle is missing from the journal until tomorrow" in
`docs/follow-ups.md`. The fix proposed there — appending a synthetic entry for
today, client-side, when local history shows a result for today's date — works
for both pages and should be done once, for both, rather than half here. Out of
scope for this spec; noted so it is not rediscovered as a catalogue bug.

### 3. The gate: solved today

The Catalogue unlocks when the player's local history holds an entry for today's
date with `solved: true`. It re-locks at UTC midnight with the new puzzle.

A pure `hasSolvedOn(history, date)` goes in `src/gameState.ts` beside
`hasPlayedToday`, so it is tested and reaches Framer through
`npm run generate:framer` rather than by hand.

**Locked state shows something, not nothing:** the number of animals waiting, a
line explaining the rule, and a button back to today's puzzle.

**Stated risk, accepted by the owner.** Requiring `solved` rather than *played*
means a player who loses is locked out for that day despite having played, and
someone on a losing run stays locked out. This was raised when the option was
chosen and is recorded here so nobody has to rediscover it. The one-line change
if it proves too harsh is to key off "has an entry for today" instead of
`solved`.

### 4. The detail page

`/archive-detail?slug=` gains, in this order: photo, common name, species,
category, **the three hints presented as facts**, the fun fact, "also known as"
from the aliases, the date featured, the player's own result that day when they
played it, and the bonus question replayable as a one-tap quiz. Prev and next
links browse the catalogue without going back to the list.

**The hints are the reason this is cheap.** All 89 animals already have three,
written in first person as statements — "I live year-round in cold Arctic
waters" — and today they are discarded the moment the day ends. No new writing.

### 5. Catalogue list layout

Grouped by category, alphabetical within each group, with a category filter and
a header count reading "17 of 89 discovered". Alphabetical-within-category suits
browsing to learn; the journal keeps its reverse-chronological order because it
is a diary.

The count deliberately reveals the total. It is not a spoiler — it says how many
animals exist, not which — and it tells a new player there is more coming.

**No search.** At seventeen entries, and under a hundred for months, a filter is
enough. Revisit if the catalogue passes a few hundred.

## Components

| Unit | Responsibility |
|---|---|
| `scripts/catalogueEntry.ts` | Pure. Builds entries from animals + archive + today. No I/O. |
| `scripts/buildCatalogue.ts` | Reads the two files, writes `data/catalogue.json`. New `npm run content:catalogue`. |
| `scripts/runDailyArchive.ts` | Also regenerates the catalogue after archiving. |
| `src/gameState.ts` | Add `hasSolvedOn`; reaches Framer via codegen. |
| `framer/ArchiveListComponent.tsx` | Tabs, gate, catalogue list, category filter. |
| `framer/ArchiveDetailComponent.tsx` | The richer detail view and prev/next. |

**`ArchiveListComponent.tsx` is already large** — a generated engine block plus
the journal. Adding a second view will make it larger. The catalogue rendering
stays in its own clearly separated functions with its own types, so the file has
two readable halves rather than one tangle. Splitting it into a second Framer
component is rejected: two components on one page cannot share tab state without
inventing a channel between them.

## Testing

Unit tests on `scripts/catalogueEntry.ts`:

- an animal featured only in the future never appears
- an animal featured today does appear
- all `dailyEligible: false` animals appear regardless of date
- an animal featured twice yields one entry with `timesFeatured: 2` and the
  earlier `firstFeatured`
- an archive entry with no matching animal is reported, not silently thinned
- ordering is deterministic

Unit tests on `hasSolvedOn`: solved today true; played-but-lost today false; a
solved entry for another date false; empty history false.

Data test against `data/catalogue.json`: **no entry has a `firstFeatured` later
than today**, and no entry's `commonName` matches an animal that is
daily-eligible and not yet featured. This is the assertion that matters — every
other failure is cosmetic, this one hands players the answers.

## Out of scope

- **Search.** See §5.
- **Editing the Field Journal's own behaviour**, including the known issue that
  today's puzzle is missing from it until the archive job runs. Tracked
  separately in `docs/follow-ups.md`; fixing it here would tangle two changes.
- **Moving data hosting to Cloudflare.** `catalogue.json` is served from
  `raw.githubusercontent.com` like the other two files and inherits the same
  known weakness.
- **The Beat the Clock leaderboard**, deferred 2026-08-04.

## Consequences

- The archive page fetches a second file. It already tolerates a failed fetch;
  the catalogue tab degrades to an error line without taking the Collection tab
  with it.
- `data/catalogue.json` grows by one entry a day and will pass `animals.json` in
  size only if the animal list stops growing. Neither is near the payload
  threshold in `2026-07-30-per-day-puzzle-payload-design.md`.
- The eleven timer-only animals become publicly readable. They were already in
  a public file; this only makes them legible.

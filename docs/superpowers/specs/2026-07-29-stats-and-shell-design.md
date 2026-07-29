# Stats Modal, Icon Shell & Archive CTA — Design

**Date:** 2026-07-29
**Status:** Approved, pending implementation plan

## Context

Derived from a review of NYT Wordle's UI (settings modal, help dropdown,
stats modal, header CTA slot) as a source of inspiration. Three of the
patterns found there map directly onto WhichAnimalToday's goals and are
scoped together here because they share one container:

1. **A real stats modal** — retention. NYT gates stats behind an account
   signup, which is strong evidence that stats are what bring players
   back daily. WhichAnimalToday currently shows only a current-streak
   badge.
2. **An icon bar + modal shell** — the container the stats panel lives
   in, and the thing that keeps the play area clean (which matters for
   above-the-fold ad placement).
3. **An "Play the Archive" CTA** in the header slot NYT reserves for
   "Subscribe to Games" — repurposed as a pageviews-per-session lever,
   since revenue here is pageviews × RPM.

**Why now rather than post-launch:** the stats in item 1 cannot be
backfilled. `loadState()` in `framer/GameComponent.tsx` currently
persists only `{ lastResult, currentStreak }`. Games played, max streak,
and guess distribution are unrecoverable for any day not recorded at the
time it was played. `LAUNCH_DATE` is 2026-08-01, so widening the storage
schema before launch is close to free; after launch it permanently
costs every existing player their history.

Patterns from the same NYT screenshots that were **deliberately
rejected**, recorded here so they don't get re-litigated:

- **High Contrast / Color Blind Mode** — essential in Wordle because
  green vs. yellow tiles *carry information*. In this game colour is
  decorative; coral vs. moss never encodes a fact the player needs.
- **Onscreen Keyboard Input Only** — solves a problem created by
  Wordle's custom keyboard. This game uses a native `<input>`, so
  speech-recognition input already works.
- **"Create a free account"** — NYT converting stats into subscriptions.
  There is no backend here by design (see MVP design §1) and nothing to
  sell.
- **Hard Mode** — no clean analogue. Three guesses is already tight, and
  an expert variant would fork both the share string and the stats.

Dark theme and an A–Z animal index were identified as valuable but are
**out of scope for this piece of work** (see "Deferred" below).

## 1. Architecture

No change to the MVP architecture: everything stays inside the single
self-contained Framer code component, per `docs/framer-integration.md`.
The game component renders the entire page header — there is no
Framer-native nav bar above it — so the icon bar, the modals, and the
CTA are all rendered by `framer/GameComponent.tsx` and can read game
state and `localStorage` directly with no Framer wiring.

New pure logic goes in `src/stats.ts`, unit-tested in `src/stats.test.ts`,
then hand-copied into the Framer component's inlined engine section in
the same way the existing `src/*.ts` modules are (the component file
already documents this "kept in sync by hand" convention).

## 2. Storage schema

```ts
const SCHEMA_VERSION = 2;

interface StoredState {
  version: 2;
  history: DailyResult[];  // ascending by date, one entry per played day
}
```

`DailyResult` is unchanged from the current implementation: `date`
(`YYYY-MM-DD`, UTC), `puzzleNumber`, `solved`, `guessesUsed`.

Nothing derived is stored. Played counts, win percentage, streaks, and
the guess distribution are all computed from `history` at render time
(§3). This was chosen over storing rolled-up counters because it is the
only shape that does not require a *second* un-backfillable migration
when badges or a "species identified" collection counter are added
later, and because a single source of truth cannot drift the way
duplicated counters can. Size is negligible: roughly 50 bytes per played
day, so a full year is about 18KB against a 5MB `localStorage` budget.

### Migration

`loadState()` handles four cases:

| Stored value | Result |
|---|---|
| No key present | `{ version: 2, history: [] }` |
| Unparseable JSON | `{ version: 2, history: [] }` (matches current swallow-and-reset behaviour) |
| `version === 2` | Used as-is, after confirming `history` is an array |
| No `version`, has `lastResult` (v1) | `{ version: 2, history: lastResult ? [lastResult] : [] }` |

**Accepted loss:** v1's `currentStreak` is not migrated. The number is
known but the days that produced it are not, so it cannot become real
history. The streak therefore recomputes from the single seeded entry.
The alternative — carrying a `legacyStreak` field forward indefinitely —
was rejected as permanent cruft in exchange for preserving a pre-launch
dev-test value.

### Unavailable storage

Storage access must never throw out of `loadState` or `saveState`. Some
browsers raise on storage access rather than returning `null` — Safari
private mode and any "block all cookies" setting make even *reading*
`localStorage` a `SecurityError`, and writes can fail separately on
exceeded quota. Both paths are wrapped:

- **Reads** degrade to an empty history, so the streak and every other
  figure read zero.
- **Writes** silently no-op.

The player therefore gets a fresh game on each load and permanently
zeroed stats — the streak resets, which is the correct outcome when
there is nowhere to record that they played. The accepted cost is that
the day's puzzle becomes replayable. Crashing the game at the moment
someone finishes a puzzle, which is what an unhandled `setItem` throw
would do, is strictly worse.

### Writes

`recordResult` appends to `history`, but is **idempotent by date**: if an
entry for `result.date` already exists it is replaced rather than
appended. This prevents a double-fire of `finishGame` from inflating
`played`.

## 3. Derived stats

New module `src/stats.ts`:

```ts
interface Stats {
  played: number;
  wins: number;
  winPercent: number;                      // integer; 0 when played === 0
  currentStreak: number;
  maxStreak: number;
  distribution: [number, number, number];  // wins on guess 1, 2, 3
}

function computeStats(history: DailyResult[]): Stats
```

- `played` = `history.length`
- `wins` = count of entries where `solved`
- `winPercent` = `played ? Math.round(wins / played * 100) : 0`
- `distribution[i]` = count of solved entries with `guessesUsed === i + 1`
- Streaks walk the date-sorted history, reusing the existing
  `isNextCalendarDay` helper. A run continues across consecutive solved
  entries on consecutive calendar days.
- `maxStreak` = the longest such run anywhere in `history`.
- `currentStreak` = the run ending at the most recent entry, **but only
  if that entry's date is today or yesterday (UTC)**; otherwise `0`.

### Behaviour change (intentional, approved)

The last rule changes observable behaviour. The current
`recordResult` breaks a streak only on a loss or a non-consecutive
*played* day — and since nothing is written on days the player doesn't
show up, a player who won yesterday and then disappeared for a week
would keep seeing a live streak indefinitely. Deriving from history
makes absence break the streak, matching Wordle. Streaks can now
visibly die without the player doing anything.

Knock-on benefit: the header streak badge is fed by `computeStats` as
well, so the badge and the modal cannot disagree. The streak-tracking
logic inside `recordResult` is removed, since streaks are no longer
stored.

## 4. Icon bar

Replaces the current header block. The left side keeps the existing
wordmark and tagline. The right side gains small bordered monospace
"tabs" rendered on the journal paper — deliberately not NYT's bare
glyphs, so the bar reads as field-file tooling and stays consistent with
the specimen-card design signature the component file documents.

Controls, left to right:

- **📊 Stats** — opens the stats modal (§6)
- **❓ How to Play** — opens a modal, **not** a navigation away from the
  page. The rules text is hand-copied from `docs/legal/how-to-play.md`
  into the component as inline strings, following the same
  "kept in sync by hand" convention the component already uses for
  engine logic — it is *not* fetched at runtime. Navigating away from a
  game in progress would be the wrong behaviour, so this stays a modal.
  The standalone Framer How to Play page in the go-live checklist is
  unaffected and remains the indexable version of the same content.
- **🔥 streak badge** — unchanged in meaning, kept visible rather than
  moved into a modal, since it is the daily return hook

The bar must be structured so that adding a third control (⚙️ Settings,
for the deferred dark-theme work) requires no restructuring.

### Accessibility

- Controls are real `<button>` elements with `aria-label`; emoji glyphs
  are `aria-hidden` so the label is what gets announced.
- Modals get `role="dialog"` and `aria-modal="true"`.
- Focus moves into the modal on open and returns to the triggering
  button on close.
- Escape and backdrop-click both close.

## 5. Generic modal

A single `<Modal title open onClose>` component; every panel renders as
its children. Paper-card surface consistent with the existing
`tokens.paperCard` / `tokens.line` treatment, ✕ close control at top
right, body scrolling when taller than the viewport, and a footer line
carrying `FIELD FILE #N` — the same move NYT makes with "#1866" in its
settings footer, using a puzzle number the component already has.

### Known risk: fixed positioning inside Framer

A `position: fixed` overlay rendered *inside* a Framer code component
can be trapped by any ancestor carrying `transform` or
`overflow: hidden` on Framer's canvas, which would clip the modal to the
component's own box. This cannot be verified from this repo and needs
one check in Framer preview.

**Fallback if it clips:** render the panel inline — expanding in place
and pushing subsequent content down — instead of as an overlay. The
implementation plan must carry this fallback rather than leaving it to be
discovered during live verification.

## 6. Stats modal contents

Two blocks:

1. **Summary row** — four figures in monospace numerals with small
   uppercase labels, matching existing `tokens.mono` usage: Played,
   Win %, Current Streak, Max Streak.
2. **GUESS DISTRIBUTION** — three horizontal bars labelled 1, 2, 3. Bar
   width is proportional to the largest count in the distribution; the
   count is printed at the end of each bar.

**Bar highlighting:** the coral highlight applies to the bar matching
today's `guessesUsed` **only when today's puzzle has been played and
solved**. When the modal is opened before playing, or after a loss, no
bar is highlighted and all three render in moss/ink-soft. (Without this
condition there is no "today's result" to highlight.)

**All-zero distribution:** when `played > 0` but `wins === 0` — every
game lost — the largest count is `0` and proportional width would divide
by zero. In that case all three bars render at a fixed minimum width
with a printed count of `0`. The summary row still shows the real
figures, so this is not folded into the empty state.

**Empty state** (`played === 0`): the copy "No specimens identified
yet." replaces both blocks, rather than showing a grid of zeros and
three empty bars.

**Share block:** the existing share postcard and "Copy result" button
are also rendered in this modal, reusing the current implementation with
no new logic. Today they exist only on the reveal card, so a player who
dismisses the reveal loses the ability to share — and sharing is the
primary growth mechanic per MVP design §4. NYT places share in the same
panel.

## 7. Archive CTA

A coral pill button, label **"Play the Archive →"**, linking to
`/archive` (the archive list page established in
`docs/framer-archive-integration.md`; the detail route is
`/archive-detail?slug=<slug>`).

Two placements, both intended:

1. **Header, always visible** — this is the slot NYT reserves for its
   highest-value CTA. Leaving it empty wastes it, and archive clicks are
   the cheapest available way to raise pageviews per session.
2. **A larger card on the reveal screen** — the point of highest intent.
   The player has just finished, has nothing else to do, and the next
   puzzle is up to 24 hours away. This placement is expected to produce
   most of the click-through.

## 8. Testing

`src/stats.test.ts`, following the existing vitest pattern in `src/`:

- `computeStats` on empty history returns all zeros with
  `winPercent === 0` (no division by zero).
- Win-percentage rounding.
- `currentStreak` is live when the most recent entry is yesterday.
- `currentStreak` is `0` when the most recent entry is older than
  yesterday.
- `currentStreak` is `0` when the most recent entry is a loss.
- `maxStreak` correctly spans a gap (two separate runs, longer one wins).
- `distribution` counts land in the right buckets per `guessesUsed`.
- A history of losses only yields `distribution === [0, 0, 0]` with
  `played > 0` — the case §6 renders at fixed minimum bar width rather
  than dividing by zero.
- Migration: all four cases in §2 (absent key, corrupt JSON, v1 shape,
  existing v2 shape).
- `recordResult` called twice for the same date leaves `history.length`
  unchanged and reflects the later result.

The icon bar and modal get no automated tests, consistent with this
project — it has no component tests and relies on the manual Framer
checklist. New manual checks are appended to the checklist in
`docs/framer-integration.md`:

- Stats icon opens the modal; figures match the `localStorage` history.
- Distribution highlights the bar for today's guess count after a solve,
  and highlights nothing when opened before playing.
- Empty state shows on a cleared `localStorage`.
- How to Play icon opens its modal without navigating away, and a game
  in progress is still in progress after closing it.
- Escape, ✕, and backdrop-click all close the modal; focus returns to
  the triggering button.
- **The modal is not clipped by its Framer container** (§5 risk).
- Header CTA and reveal-screen card both navigate to `/archive`.
- A v1 `localStorage` value migrates without a console error and without
  resetting play history.

## Deferred (explicitly not in this work)

Identified as valuable in the same review, to be scoped separately:

- **Dark theme toggle** plus `prefers-color-scheme` support, which needs
  a dark counterpart to the cream field-journal palette (dark
  leather/oilcloth rather than inverted cream). The ⚙️ Settings icon
  slot in §4 is where it lands.
- **An A–Z animal index** — one indexable page per animal, a different
  axis from the date-based archive, and the strongest SEO lever found in
  the review.
- **Badges / a "species identified" collection counter**, e.g.
  "Naturalist's Log: 12/500". Needs no backend, fits the naturalist
  concept better than it fits Wordle, and is stickier than a streak
  because it never resets. The §2 schema is shaped to support this
  without further migration.
- **A countdown to the next specimen.**

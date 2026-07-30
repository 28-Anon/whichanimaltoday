# Known follow-ups

Everything deliberately left undone, with enough context to act on it
without the conversation it came from. Sourced from the code reviews of the
2026-07-29 stats-and-shell work (see
`docs/superpowers/specs/2026-07-29-stats-and-shell-design.md`) plus items
predating it.

Nothing here is a blocker for the code being correct today. The two items
under "Before launch" *are* blockers for launching well.

## Before launch

### The share text contains no link

`buildShareText` now supports an optional site URL, but `SITE_URL` in
`framer/GameComponent.tsx` is still empty, so shared results are just
`WhichAnimalToday #12 🐾 2/3`. A recipient has no way to find the site.
Sharing is the primary growth mechanic per the MVP design §4, and the whole
revenue model depends on traffic — set `SITE_URL` on launch day, at the same
time as `LAUNCH_DATE`.

## Resolved 2026-07-30

Kept because the false leads are instructive.

### Modal clipping — NOT an issue, `position: fixed` works

`styles.modalBackdrop` uses `position: fixed`, and the risk was that an
ancestor with `transform` or `overflow: hidden` on Framer's canvas would trap
the overlay inside the component's own box. This was the one thing the entire
build could not verify without the Framer editor.

**Verified working.** With the component correctly mounted, the backdrop
covers the full viewport, dimming the site nav and footer as intended. No
fallback needed.

An earlier version of this document recorded the opposite, on the strength of
Framer's AI assistant reporting an overlay "trapped inside its component."
That report was about **its own** separate `GameUtilities` component, not this
one — and that component's overlay used the identical `position: fixed`
technique, which is what made the eventual verification predictable. Don't
apply the fallback below on the strength of a second-hand report; check it
directly.

**Fallback, only if fixed positioning ever genuinely fails:** in
`styles.modalBackdrop`, change `position` from `"fixed"` to `"relative"` and
remove `inset`, `zIndex`, and the flex centering. The panel then expands in
place and pushes content below it down. Keep every other behaviour — Escape,
✕, backdrop click, focus handling — exactly as it is. Do **not** try
`createPortal`; Framer's canvas mounting makes the portal target unreliable.

### Divergence between the repo and Framer — resolved

For a period, Framer held the **pre-stats** version of `GameComponent.tsx`,
and Framer's AI assistant had built an independent stats implementation on
top of it, plus a separate `GameUtilities` component holding a stats dialog
and display-preference toggles. Resolved by pasting this repo's version in
and deleting `GameUtilities`. This repo is the source of truth.

The root cause of the whole tangle was the starter-code paste trap now
documented in `docs/framer-integration.md`: the component was never properly
registered, so it never rendered, which presented as "the animal image
doesn't load" — which in turn looked like a data problem. The data URL was
verified reachable and healthy throughout. The lesson: when a Framer code
component appears to do nothing, suspect registration before data.

### Framer's page-level work is unaffected by re-pasting

Responsive nav and footer, the `/terms` route, meta tags, favicon and touch
icon all live outside the code component and survive a re-paste.

### The animal image not loading — resolved, was the paste trap

Cause was the starter-code collision above, not the data. Should it ever
recur, the fastest discriminator is to paste this into the browser console on
the page and read the result:

    fetch("https://raw.githubusercontent.com/28-Anon/whichanimaltoday/master/data/animals.json")
      .then(r => console.log("status", r.status))
      .catch(e => console.log("blocked:", e.message))

`status 200` means the data is fine and the fault is in the component or its
mounting. A network or CORS error means the request is blocked at the preview
layer, in which case check the published page — Framer's preview iframe and
the published site don't always apply the same content policy.

### Puzzle number showing #-1 and an empty archive — not bugs

Both are `LAUNCH_DATE` sitting in the future. `framer/GameComponent.tsx`
derives the puzzle number from days-since-launch, so a launch date two days
out yields `#-1`; and `scripts/runDailyArchive.ts` explicitly refuses to
archive any day before `LAUNCH_DATE`, so `data/archive.json` correctly stays
`[]`. Both resolve themselves once the real launch date passes. Setting
`LAUNCH_DATE` to the actual go-live day — in **both** files — makes that day
puzzle #1.

## Design work not yet started

### Dark theme and a Settings panel

Deferred from the 2026-07-29 design (see its "Deferred" section, alongside an
A–Z animal index, badges, and a countdown). The ⚙️ slot in the icon bar's
`headerControls` row is already structured to take a third control.

A Framer-side prototype existed briefly — a `GameUtilities` component built
by Framer's AI on 2026-07-30 and since removed — and three things from it are
worth carrying forward:

- **`whichanimaltoday_preferences` as the storage key**, separate from
  `whichanimaltoday_state`, so display preferences and game history never
  share a schema or a migration.
- **Dark theme, high contrast, and reduced motion** as the three toggles.
  Reduced motion is a good catch this project hadn't considered — the reveal
  stamp and clue slide-in are both animated.
- **Its central limitation is the lesson.** Its own UI admitted the
  preferences "apply to this game tools area only, until the main game
  component is wired to the same preference key" — because the game never
  read the key. A settings toggle that lives in a sibling component cannot
  theme the game. Whatever gets built has to live inside
  `framer/GameComponent.tsx`, which owns the `tokens` object every style
  reads from.

Also worth avoiding: its preference-writing effect ran on mount with an
unguarded `setItem`, which throws immediately for anyone with cookies
blocked. That is the same class of bug this project has now fixed twice —
any new write to storage needs the same `try`/`catch` treatment as
`saveState`.

### Every visitor downloads all future answers

The game fetches the whole of `data/animals.json` on each page load. At 34
animals that is roughly 22KB; at the 500 the MVP design targets it is
roughly 320KB, including hints and fun facts for animals eleven months
away. The spoiler exposure was an accepted trade-off (MVP design §1); the
payload cost was never discussed and grows with every animal added.

**Designed 2026-07-30, implementation deliberately deferred.** See
`docs/superpowers/specs/2026-07-30-per-day-puzzle-payload-design.md`. The
approach is a per-day `today.json` written by the existing daily Action, with
the current client-side date arithmetic kept as a fallback — because a
pre-generated file alone turns a silent job failure into a site-wide outage,
and the job runs unattended.

**Build it when `data/animals.json` passes roughly 150 animals, or ~100KB.**
At 34 animals the payload is ~22KB and this would be premature. The spec
exists so the reasoning is settled rather than re-derived later.

### Codegen for the duplicated engine

`framer/GameComponent.tsx` hand-duplicates roughly 130 lines of engine logic
(`loadState`, `saveState`, `emptyState`, `dayNumber`, `computeStats`,
`recordResult`) from `src/gameState.ts` and `src/stats.ts`. This is required
— Framer's code editor cannot reliably resolve relative imports across
pasted files, so the component must be one self-contained file. A reviewer
raised it as an Important maintainability finding on 2026-07-30; the owner
ruled the constraint governs and parked it.

Nothing enforces that the two copies stay in sync: no compiler check, no
shared source, and zero test coverage on the `framer/` side. A whole-branch
review verified they are currently identical, function by function.

Two ways forward, and the cheaper one is worth doing regardless:

- **Cheap, available today:** a Vitest file that reads
  `framer/GameComponent.tsx` as text and asserts it contains the
  `computeStats`, `loadState`, `saveState`, and `recordResult` bodies
  verbatim from `src/`. No DOM, no React, no tsconfig change — it converts
  silent drift into a red test.
- **Proper:** generate the component's engine section from `src/`, delimited
  by sentinel comments so the substantial UI in that file survives, plus a
  CI check that fails when the generated region is stale. Two differences
  must survive codegen: `StorageLike` injection collapses to direct
  `window.localStorage` access, and the component's `recordResult` returns
  the whole `Stats` object rather than just the streak number.

### A session crossing UTC midnight records a day that was never played

`finishGame` pairs `todayDateString()` with the `puzzleNumber` and `animal`
loaded *before* midnight. A player who loads the page at 23:58 and finishes
at 00:01 writes a history entry dated the new day, for a puzzle belonging to
the old one. Previously this only skewed a stored counter; now it inflates
`played` and can create a phantom win in the guess distribution. Pre-existing,
predates the stats work, needs its own fix.

## Accessibility and polish

- **No focus trap.** Tab can leave an open modal and reach the page behind
  the backdrop. Disclosed in the manual checklist.
- **Switching panels by keyboard captures the wrong focus target.** The 📊
  and ❓ buttons set `openPanel` directly instead of closing first, so the
  outgoing `Modal`'s cleanup restores focus to its own trigger before the
  incoming one captures `previouslyFocused` — the incoming panel then
  restores focus to the wrong element on close. Reaching the other icon
  requires the missing focus trap above, so the two are worth fixing
  together.
- **`styles.modalCard` sets `outline: "none"`** on a card that receives
  focus programmatically, leaving no focus ring on the container itself.
- **`header` has no `flexWrap`.** On very narrow viewports `headerControls`
  shrinks into a column beside the wordmark rather than the header stacking.
  `headerControls` does wrap, so the failure mode is cramped, not clipped.
- **The reveal-screen archive card has a run-on accessible name** — title
  and body concatenated: "Missed a day? Play the Archive → Every specimen
  featured so far, still playable." A one-line `aria-label` on the `<a>`
  fixes it.
- **Icon order differs from the design doc.** Spec §4 lists 📊, ❓, 🔥
  left to right; the code renders 🔥, 📊, ❓, then the archive pill.
  Harmless, and arguably better, but unrecorded until now.
- **A third archive placement exists** beyond the design doc's stated two:
  the "Browse the Archive →" link in the How to Play panel. Intentional —
  it mirrors the closing line of `docs/legal/how-to-play.md` — but the spec
  says "two placements, both intended."

## Security review, 2026-07-30

The owner ran a security checklist against this project. Most of it targeted a
different application — it referenced `auth.ts`, Expo push tokens, JWTs,
`express.static`, file uploads, profile pictures, and group/habit permissions,
none of which exist here. **This product has no backend**: no server, no API,
no auth, no accounts, no uploads, no email collection, no IP logging. See the
MVP design §1.

Verified during that review:

- No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `srcdoc`,
  or `document.write` anywhere in `src/`, `framer/`, or `scripts/`. All
  dynamic content reaches the DOM as React text nodes, which escape.
- No `express`, `cors`, `jsonwebtoken`, `multer`, or `helmet` in
  `package.json` — there is nothing to configure CORS, HSTS, or rate limits
  *on*.
- External data reaches the DOM at exactly three points, all `<img src>` from
  `imageUrl`, plus one `href` built from `entry.slug`.

### Fixed: unbounded guess input (was real)

`levenshteinDistance` allocates a `(guess+1) x (candidate+1)` matrix and the
guess input had no cap, so a pasted megabyte allocated millions of cells per
candidate — measured at 1,955ms for one 1MB guess against two candidates.
Fixed by short-circuiting on length difference (exact: distance can never be
below the length gap) plus `maxLength={80}` on the input. Same case now 22ms.

### Fixed: the data validator rejected 100% of real data, and never ran

The most consequential finding of the review, and not on the original
checklist. `validateAnimalData` compared categories case-sensitively against a
lowercase `ALLOWED_CATEGORIES`, while every curated record writes `"Mammal"`,
`"Fish"`, `"Marine"`. All 34 records therefore failed validation — which is
almost certainly why the validator had **no production callers at all**: it was
only ever invoked from its own test file, and `scripts/importAnimalsCsv.ts`
wrote `data/animals.json` with no validation whatsoever.

Fixed three ways: the category comparison is now case-insensitive, `imageUrl`
was added to `AnimalRecord` and is required to start with `https://` (it was
not previously part of the validated shape at all), and the validator is now
wired into `importAnimalsCsv.ts`, which refuses to write and exits non-zero if
any record fails. The 34 curated records now validate cleanly.

That last part matters because `data/animals.json` is fetched directly by the
live game — it is production data, and an invalid record there reaches players.

### Fixed: eager archive image loading, and unencoded slug interpolation

`ArchiveListComponent` mapped over every entry with no pagination and no
`loading="lazy"`, so a visitor would eventually request hundreds of images on
one page load. Now lazy-loaded. Pagination or windowing only if that proves
insufficient.

The same component built `href={`/archive-detail?slug=${entry.slug}`}` by raw
interpolation. Not an injection route — the value always lands in a relative
path beginning `/archive-detail?`, so it cannot become a `javascript:` URL —
but `&`, `#`, or a space in a slug would break the query parameter. Now
`encodeURIComponent`.

## Code hygiene

- **`getStats`, `getLastResult`, and `hasPlayedToday` have no production
  callers.** All are exported from `src/index.ts`; `getStats` has no test
  either. The Framer component cannot import them. Keep or prune
  deliberately rather than by accident.
- **`isWellFormedEntry` guards the v2 `history` branch only**, not a
  malformed `lastResult` during v1→v2 migration. Reachable only via
  hand-edited storage.
- **The date comparator `(a, b) => a.date.localeCompare(b.date)` is inlined
  in three places** (`gameState.ts` twice, `stats.ts` once). Worth a shared
  export if a fourth appears.
- **`getLastResult` copy-and-sorts the whole history** to take the maximum
  by date; a linear reduce would avoid it. Irrelevant at one entry per day.
- **The `guessesUsed >= 1 && guessesUsed <= 3` bounds guard in `computeStats`
  is untested.** Worth keeping — it is the only thing standing between a
  hand-edited `guessesUsed: 7` and a fourth element on a
  `[number, number, number]` tuple — but a test would document why.
- **No test covers duplicate same-day entries in `history`.** Unreachable
  through `recordResult`, which filters by date before pushing. For the
  record, a zero-day gap falls through to `run = 1`, so a duplicate would
  silently truncate a streak.

## Content and launch mechanics

- **34 animals** in `data/animals.json`, against the 500 the MVP design
  targets — 34 days before repeats begin.
- **`LAUNCH_DATE` must match exactly** in `framer/GameComponent.tsx` and
  `scripts/runDailyArchive.ts`, or the puzzle number and the archive will
  disagree. Both still hold the `2026-08-01` development placeholder.
- **Open Graph tags and a favicon** are not set; shared links show no
  preview card. Already on `docs/go-live-checklist.md`.
- **`npx tsc --noEmit` does not cover `framer/`** — that directory is
  outside the tsconfig `include`, so a clean run is silence, not
  confirmation, for the component. It has no test coverage either; the
  manual checklist is the only gate.

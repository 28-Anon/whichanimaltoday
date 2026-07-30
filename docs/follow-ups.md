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

### The modal WAS clipped by Framer's canvas — confirmed 2026-07-30

`styles.modalBackdrop` uses `position: fixed`. Inside a Framer code
component, any ancestor with `transform` or `overflow: hidden` on Framer's
canvas traps that overlay inside the component's own box instead of covering
the viewport. This was the one risk the whole build could not verify without
the Framer editor.

**Answer: it was trapped.** Verified in Framer on 2026-07-30, and reportedly
resolved there so the panel is now viewport-covering. Also confirmed: the
game component is constrained to the page content width, not the full
viewport width.

**The two copies are fully divergent — confirmed 2026-07-30.** Searching the
Framer code editor found neither `isWellFormedEntry` nor `modalBackdrop`.
Both were added during the 2026-07-29/30 stats work, `modalBackdrop`
alongside the modal itself, so the component pasted in Framer is the
**pre-stats version**. Framer's own AI assistant then built an independent
implementation of the same feature — its own storage migration, stats panel,
and dialog — on top of that older base.

There are therefore two parallel implementations of the stats feature. This
repo's is unit-tested (93 tests) and passed a per-task review plus a
whole-branch review; the Framer-side one has no test coverage, and Framer's
assistant reported it cannot run browser tests.

**Resolution: paste this repo's version in, replacing the component's code
entirely.** It carries behaviour that is easy to miss and hard to notice when
broken — storage blocked by cookie settings, a corrupt value that would
otherwise brick the game on every load, the all-games-lost chart state, lazy
v1 migration, focus return on close, and stats that populate independently of
the animals fetch. Then check whether the panel is clipped: if the container
fix was made at the Framer *page* level it will not be, and `position: fixed`
here is correct as-is. If it is clipped, apply the fallback below.

Framer's page-level work — responsive nav and footer, the `/terms` route,
meta tags, favicon, touch icon — lives outside the code component and is
unaffected by re-pasting it.

**The documented fallback, if fixed positioning ever fails again:** in
`styles.modalBackdrop`, change `position` from `"fixed"` to `"relative"` and
remove `inset`, `zIndex`, and the flex centering. The panel then expands in
place and pushes content below it down. Keep every other behaviour — Escape,
✕, backdrop click, focus handling — exactly as it is. Do **not** try
`createPortal`; Framer's canvas mounting makes the portal target unreliable.

### The animal image does not load in Framer preview

Reported 2026-07-30. The repo is public and `master` is pushed, so
`ANIMALS_JSON_URL` should resolve. Diagnose by pasting this into the browser
console on the previewed page and reading the result:

    fetch("https://raw.githubusercontent.com/28-Anon/whichanimaltoday/master/data/animals.json")
      .then(r => console.log("status", r.status))
      .catch(e => console.log("blocked:", e.message))

A `status 200` means the data is reachable and the fault is in the pasted
component. A network or CORS error means the request is being blocked at the
preview layer, in which case check the published page rather than the
preview — Framer's preview iframe and the published site do not always apply
the same content policy.

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

# Known follow-ups

Everything deliberately left undone, with enough context to act on it
without the conversation it came from. Sourced from the code reviews of the
2026-07-29 stats-and-shell work (see
`docs/superpowers/specs/2026-07-29-stats-and-shell-design.md`) and of the
2026-07-31 two-stage guessing work (see
`docs/superpowers/specs/2026-07-31-two-stage-guessing-design.md`), plus items
predating both.

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

### Codegen for the duplicated engine — DONE 2026-07-30

Implemented. `framer/GameComponent.tsx`'s engine section is now generated
from `src/` by `scripts/generateFramerEngine.ts` and sits between
`// ===== BEGIN GENERATED ENGINE …` and `// ===== END GENERATED ENGINE =====`.
Run `npm run generate:framer` after touching any of `src/puzzleIndex.ts`,
`src/guessChecker.ts`, `src/shareCard.ts`, `src/stats.ts`, or
`src/gameState.ts`. Both `npm test` and `.github/workflows/ci.yml` fail when
the committed block no longer matches `src/`. Design:
`docs/superpowers/specs/2026-07-30-framer-engine-codegen-design.md`.

Two ways the follow-up that requested this got it wrong, kept because the
corrections are the useful part:

- The duplication was **wider than the 130 lines recorded here**.
  `puzzleIndex.ts`, `guessChecker.ts`, and `shareCard.ts` were inlined too,
  and `getTodayPuzzleIndex` had **already drifted** — it had lost
  `src/puzzleIndex.ts`'s `listLength <= 0` guard. Regenerating restored it.
  The review that raised the original finding had looked at the block that
  was still correct.
- The two "differences that must survive codegen" were **deliberately not
  preserved**. Keeping them would have forced the generator to rewrite code
  rather than copy it, relocating the drift risk instead of removing it.
  Both were absorbed on the component side: a hand-written `browserStorage`
  adapter supplies the `StorageLike`, and `finishGame` reads the figures
  back with `getStats(...)` instead of from `recordResult`'s return value.
  The generated block is a verbatim mirror of `src/`.

The mechanism paid for itself on the merge: three `src/` changes already on
`master` (the `guessChecker` length pre-check, the `shareCard` `siteUrl`
parameter, and `gameState`'s `isWellFormedEntry` filter) reached the
component with no hand-copying at all.

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

### Generator sharp edges, none currently reachable

Found reviewing the codegen work on 2026-07-30. Each was confirmed harmless
against `src/` as it stands, and becomes real only if someone writes the
triggering shape. Loudest consequence first.

- **A trailing same-line comment attaches to the wrong declaration.**
  `statementText` slices from `getFullStart()`, so `const A = 1; // why A`
  emits that comment as *leading* trivia of the next declaration, and a
  trailing comment on a module's last statement is dropped entirely. The
  block still compiles — the mirror is just no longer faithful. Would bite
  the first time someone writes
  `const SCHEMA_VERSION = 2; // bump on breaking change`.
- **The dedupe compares leading comments.** `MS_PER_DAY` genuinely lives in
  both `src/puzzleIndex.ts` and `src/stats.ts`, and only one copy is emitted
  because the two texts are byte-identical. Add a doc comment to one side
  and it throws "declare it differently", sending the reader hunting for a
  body difference that does not exist. Worth extending the message to say
  leading comments are compared too.
- **The collision guard does not see import bindings.** It collects
  function, class, interface, type, enum, and variable names from the
  hand-written region, but not `import { useState, … } from "react"`. A
  future `src/` export named `useState`, `useEffect`, `useRef`,
  `CSSProperties`, or `ReactNode` would splice in silently and collide on
  paste. The fix is confined to `declaredNames` in
  `scripts/framerEngine.ts`.
- **TypeScript overloads throw a self-contradictory message.** The `seen`
  map is not reset per module, so several overload signatures of one
  function in a single file produce `Conflicting declarations of \`f\`:
  src/a.ts and src/a.ts declare it differently.` Loud rather than silent, so
  low severity — but it names the same file twice.
- **Two dedupe blind spots.** The key is `names.join(",")`, so
  `const A = 1, B = 2;` in one module and `const A = 9;` in another both
  emit, duplicating `A`. Destructuring patterns (`const { x, y } = …`) yield
  no names at all and are never deduped. Both produce duplicate bindings
  silently.
- **Blank lines between declarations are normalized.** Statements are joined
  with a fixed blank line, so `SCHEMA_VERSION` and `STORAGE_KEY` — adjacent
  in `src/gameState.ts` — end up separated in the generated block.
  Deterministic, and both sides of the staleness check see the same
  normalization. Recorded only so nobody misreads it as drift.

`export default`, `export = x`, and `import x = require(…)` used to corrupt
the output silently. Those now throw by name and are covered by tests.

### No automated coverage of the generator CLI

`scripts/generateFramerEngine.ts` has no test file, matching the repo's
convention for entry points that call `main()` at import time
(`scripts/runDailyArchive.ts`, `scripts/exportAnimals.ts`). The pure layer
in `scripts/framerEngine.ts` is well covered, and the freshness assertion
covers the end-to-end path, but the CLI's own branches — the `--check` exit
code, the write path, the "already up to date" short-circuit — are guarded
only by the CI step existing. The negative case was verified by hand on
2026-07-30: deliberately corrupting the block made both `npm test` and
`npm run check:framer` fail on the same line, and `git checkout --` restored
it. Forty-five lines, so low priority.

### A session crossing UTC midnight records a day that was never played

`finishGame` pairs `todayDateString()` with the `puzzleNumber` and `animal`
loaded *before* midnight. A player who loads the page at 23:58 and finishes
at 00:01 writes a history entry dated the new day, for a puzzle belonging to
the old one. Previously this only skewed a stored counter; now it inflates
`played` and can create a phantom win in the guess distribution. Pre-existing,
predates the stats work, needs its own fix.

**There is now a second place a date is held across time.** The bonus flow
writes to storage twice — once when the round opens, once when it ends — and
both writes must land on the same date or `recordResult`'s date filter cannot
collapse them into one entry. So `framer/GameComponent.tsx` pins the date in
`pendingDate` when the round opens and reuses it for the second write. That
makes the bonus path *more* correct than the non-bonus path, not merely
different: a bonus round left open across midnight already writes both halves
under the day the player started. The non-bonus path still recomputes the date
at completion and still has the bug above.

Whoever fixes the general midnight bug should fold `pendingDate` into a single
session-date mechanism — one notion of "today", pinned when the puzzle loads —
rather than leave the component holding two. Two is how the pinned one drifts
from the recomputed one and nobody notices.

## Two-stage guessing, 2026-07-31

### The bonus round has no automated coverage

The pure pieces are tested: `shuffleBonusOptions` in `src/bonusRound.ts`, the
`bonusRounds`/`bonusHits` tally in `src/stats.ts`, and the ⭐/⬜ marker in
`src/shareCard.ts`. The parts that only exist in the component are not — the
`playing` → `bonus` → `done` phase transition, the one-shot lock in
`pickBonus`, and the reload-restore path that reads `entry.bonus` back out of
storage. Those are verified only by the manual checklist in
`docs/framer-integration.md`, because `framer/` has no test harness at all:
the directory sits outside the tsconfig `include` and outside vitest's reach,
so the component's own logic is untested by construction, not by oversight.

The cheapest real improvement is a harness for `framer/`, which would pay for
the archive components too. Until then, the checklist is the gate and needs to
be run, not assumed.

### A refresh mid-bonus-round loses the round but not the win

Deliberate. The win is banked the moment the bonus round opens, with no
`bonus` field, so a player who refreshes, closes the tab, or wanders off has
already earned the day and keeps their streak. The in-progress round itself is
not persisted, so reloading lands on the finished reveal reading "solved, no
bonus round completed" — which is exactly what happened.

Persisting the open round would let a player re-roll the bonus by refreshing
before committing, and the moment of commitment is the whole mechanic. If this
ever looks like a bug worth fixing, the thing to preserve is that the bonus can
never cost the win, and that a refresh cannot buy a second attempt.

### The archive pages do not display `species`

`framer/ArchiveListComponent.tsx` and `framer/ArchiveDetailComponent.tsx` each
declare their own local `ArchiveEntry` type, and neither includes `species`.
Once the content pass lands, the daily archive job will write `species` into
`data/archive.json` and both pages will silently drop it — the design doc calls
the specific species the half worth seeing, and the archive is where a player
goes to see it.

Nothing breaks: there is no schema validation anywhere in the archive path, so
the extra field just goes unread. That is precisely why it will not announce
itself. Schedule this alongside the content pass rather than after it, or the
first days of real `species` data ship to an archive that cannot show it.

### The bonus memo checks the shape of `options`, not the type of its contents

`shuffledBonus` in `framer/GameComponent.tsx` guards against the failure that
matters — a non-array `options`, the wrong number of them, or an out-of-range
`answerIndex` — and degrades to `null`, which the component already handles as
"no bonus round today". Two narrower holes remain: `bonus.question` is rendered
unguarded, and the memo does not check that the four options are *strings*, so
an array of four objects passes the guard and then throws when React tries to
render one.

Both throw during render, where the fetch `.catch()` cannot reach them, so both
would take out the whole day's puzzle rather than just the bonus round — the
same class as the bug the guard was added to fix.

Neither is currently reachable. `validateAnimalData` requires a non-empty string
question and four non-empty string options, and CI runs `npm run validate:animals`
on every push against the same committed file the component fetches. So this only
becomes real if something writes `data/animals.json` without passing through that
validator. One `typeof` clause in the same memo closes it, and is worth adding the
next time that file is open — a runtime guard that does not depend on a separate
job having run is strictly better here, because the component fetches over HTTP
from a file it does not control.

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

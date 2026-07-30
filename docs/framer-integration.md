# Wiring the game engine into a Framer code component

This module (`src/index.ts` and its dependencies) is plain, dependency-free
TypeScript. To use it inside Framer:

1. **Don't hand-copy anything.** `framer/GameComponent.tsx` is the file you
   paste, and its engine section is generated from `src/`:

   ```bash
   npm run generate:framer
   ```

   That reads `src/puzzleIndex.ts`, `src/guessChecker.ts`,
   `src/shareCard.ts`, `src/stats.ts`, and `src/gameState.ts`, flattens them
   into one dependency-free block, and splices it into
   `framer/GameComponent.tsx` between:

   ```
   // ===== BEGIN GENERATED ENGINE — do not edit by hand =====
   // ===== END GENERATED ENGINE =====
   ```

   Framer's code component editor does not reliably resolve local relative
   imports across multiple pasted files, which is why the engine is inlined
   at all. Generating it means the copy cannot drift: `npm test` and CI both
   fail when the committed block no longer matches `src/`. To check without
   writing:

   ```bash
   npm run check:framer
   ```

   Edit `src/`, never the generated block. Everything outside the sentinels
   is hand-written and is preserved untouched by the generator — the
   component itself, its styles, and a `Modal` helper that is defined but
   not yet rendered. The icon bar, stats panel, and How to Play panel arrive
   with the stats-and-shell plan.

   Two things the component supplies itself, outside the sentinels:

   - `browserStorage`, a `StorageLike` adapter wrapping
     `window.localStorage` with an SSR guard and a `try`/`catch` for blocked
     cookies. The engine takes an injected storage so it can be unit-tested
     against a fake; this is what supplies the real one.
   - `Animal`, `CATEGORY_EMOJI`, `todayDateString`, and `EMPTY_STATS`, none
     of which exist in `src/`.

   `src/animalData.ts` is a build-time validator with no browser caller and
   is deliberately not part of the generated block.

2. Fetch today's animal. **Important correction from the original version of
   this guide:** Framer has deprecated direct CMS-collection access from code
   components/overrides entirely ("no longer supported" per
   [Framer's own docs](https://www.framer.com/help/articles/issues-with-code-components-accessing-the-cms/)) —
   so this step does **not** read the CMS collection live from the browser.
   Instead:
   - **This repo's `Animals.csv` / `data/animals.json` are the source of
     truth for the animal list, not Framer's CMS.** Framer's "Animals"
     collection still only contains the one row originally entered there
     (Giraffe) — the rest of the list is curated directly in this repo and
     was never round-tripped through Framer. This was a deliberate choice
     (see the 2026-07-29 conversation) to keep content curation fast; it
     means **don't re-run Framer's CMS Export plugin and reimport over
     `Animals.csv`** — doing so would overwrite everything curated here
     with just that one real Framer row. If Framer's CMS ever needs to
     become the live source again, that requires a deliberate one-time
     migration (import this repo's data into Framer), not a casual
     re-export.
   - The `data/animals.json` file itself is still produced the same way
     described below — the difference is only in what feeds `Animals.csv`
     before that conversion:
     - **Current default:** Plugins → "CMS Export" (in the Framer editor) →
       download CSV → `npm run import:animals -- <path-to-csv>`. No API key
       needed — this is what's actually available on this account today
       (the Server API's "API Keys" UI wasn't present when checked).
     - **If Server API access opens up later:** `npm run export:animals`,
       using the `framer-api` npm package + an API key from Site Settings —
       produces the identical `data/animals.json` shape as a drop-in
       alternative.
   - The Framer code component does a plain `fetch()` of that public JSON
     URL — an ordinary external HTTP request, unaffected by the CMS-access
     restriction above, since it never touches Framer's internal CMS API.
   - Once fetched, call `getTodayPuzzleIndex(new Date(), LAUNCH_DATE, allRows.length)`
     to get today's row index, where `LAUNCH_DATE` is a fixed `Date`
     constant set once on launch day and never changed.
   - Read `allRows[index]` as today's animal.

3. On page load, call `getHistory(browserStorage)` and look for an entry
   whose `date` matches today (`new Date().toISOString().slice(0, 10)`)
   to decide whether to show the game or the already-played result.
   Call `computeStats(history, today)` (or equivalently
   `getStats(browserStorage, today)`, which does the same read in one
   call) for the figures shown in the stats panel. `browserStorage` is
   the component's own `StorageLike` adapter around `window.localStorage`
   — every call into the engine passes it as the `storage` argument.

4. On each guess submission, call
   `checkGuess(userInput, todayAnimal.commonName, todayAnimal.aliases)`.
   Reveal `hint1`/`hint2`/`hint3` in order regardless of whether the guess
   was right or wrong, per spec §3. End the game on a correct guess or
   after 3 guesses. The reveal card must also display
   `todayAnimal.imageAttribution` as a visible credit line under the
   photo — not optional decoration, it's the attribution the animal's
   Creative Commons license legally requires wherever the image appears.

5. On game end, call
   `recordResult(browserStorage, { date: todayDateString, puzzleNumber, solved, guessesUsed })`
   to persist the result; it returns just the current streak as a
   `number`, not a `Stats` object. The panel needs every figure, so follow
   it with `getStats(browserStorage, today)` to read the full set back
   rather than relying on `recordResult`'s return value. Then call
   `buildShareText(puzzleNumber, animalEmoji, solved ? guessesUsed : null)`
   to generate the copyable share string. `recordResult` is idempotent by
   date — recording the same day twice replaces the entry rather than
   adding a second one. `puzzleNumber` is
   `getTodayPuzzleIndex(...) `'s underlying day count since launch, e.g.
   `Math.floor((Date.now() - LAUNCH_DATE.getTime()) / 86400000) + 1`.

## Manual verification checklist (do this once wired up in Framer)

Framer's live preview can't be driven by this repo's automated tests, so
verify by hand after pasting the code in:

- [ ] Open the Framer preview: today's image loads immediately on page load.
- [ ] Submit a wrong guess: guess count decrements, hint 1 appears.
- [ ] Submit two more wrong guesses: hint 2, then hint 3 appear; after the
      3rd wrong guess the reveal card shows with the correct `commonName`,
      `funFacts`, and photo `imageAttribution` credit line.
- [ ] Reload the page after finishing: the "already played" result shows
      instead of a fresh game.
- [ ] Check the browser's DevTools → Application → Local Storage: a
      `whichanimaltoday_state` entry exists with `version: 2` and a
      `history` array containing exactly one entry for today, with the
      expected `date`, `solved`, and `guessesUsed` values.
- [ ] Copy the share text and confirm it matches
      `WhichAnimalToday #<n> <emoji> <result>`.

### Generated engine section (added 2026-07-30)

- [ ] Run `npm run generate:framer`, paste the whole of
      `framer/GameComponent.tsx` into Framer, and play a full round: the
      photo loads, three guesses reveal three clues, the reveal card
      appears, and the share string copies. Behaviour must be
      indistinguishable from the previous hand-copied build.
- [ ] Win, then reload and win the next day (or hand-edit the stored
      `history` dates): the "🔥 N days" streak badge shows the same count
      the `history` array in DevTools → Application → Local Storage implies.
      The streak badge is currently the only figure the component surfaces
      — the stats panel arrives with the stats-and-shell plan's Tasks 6-9.
- [ ] **Blocked-storage run.** Block cookies for the site, reload, and play
      to the end. Expect: no console error, the game completes normally,
      the result is not persisted, and **the "🔥 N days" streak badge does
      not appear after a win**. This is the accepted behavioural change
      from the design doc §5: the previous build showed a streak here that
      vanished on the next reload. Once the stats panel lands it will read
      its empty-state copy in this situation for the same reason.
- [ ] Confirm `grep -c "^import" framer/GameComponent.tsx` is still 1. The
      pasted file must import nothing but `react`.

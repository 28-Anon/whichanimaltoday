# Wiring the game engine into a Framer code component

This module (`src/index.ts` and its dependencies) is plain, dependency-free
TypeScript. To use it inside Framer:

1. Copy the contents of `src/puzzleIndex.ts`, `src/guessChecker.ts`,
   `src/shareCard.ts`, `src/gameState.ts`, and `src/animalData.ts` into a
   single Framer code file (Framer's code component editor does not reliably
   resolve local relative imports across multiple pasted files — a single
   combined file is the safe path). Keep `src/index.ts`'s export list as a
   reference for what to expose from that combined file.

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

3. On page load, call `loadState()` and look for an entry in `history`
   whose `date` matches today (`new Date().toISOString().slice(0, 10)`)
   to decide whether to show the game or the already-played result.
   Call `computeStats(history, today)` for the figures shown in the
   header badge and stats modal.

4. On each guess submission, call
   `checkGuess(userInput, todayAnimal.commonName, todayAnimal.aliases)`.
   Reveal `hint1`/`hint2`/`hint3` in order regardless of whether the guess
   was right or wrong, per spec §3. End the game on a correct guess or
   after 3 guesses. The reveal card must also display
   `todayAnimal.imageAttribution` as a visible credit line under the
   photo — not optional decoration, it's the attribution the animal's
   Creative Commons license legally requires wherever the image appears.

5. On game end, call
   `recordResult({ date: todayDateString, puzzleNumber, solved, guessesUsed })`
   to persist the result and get back the updated `Stats` object, and
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

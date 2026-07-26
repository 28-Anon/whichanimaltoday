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
   - The 500 animals are curated in Framer's CMS as before (nice editing UI),
     but a separate script — using Framer's **Server API** (an API key from
     Site Settings + the `framer-api` npm package) — exports the collection
     to a plain public file, **`data/animals.json`**, committed to this repo
     and served via its raw GitHub content URL (same pattern as
     `data/archive.json` in the Archive feature spec). Re-run that export
     whenever the animal list changes.
   - The Framer code component does a plain `fetch()` of that public JSON
     URL — an ordinary external HTTP request, unaffected by the CMS-access
     restriction above, since it never touches Framer's internal CMS API.
   - Once fetched, call `getTodayPuzzleIndex(new Date(), LAUNCH_DATE, allRows.length)`
     to get today's row index, where `LAUNCH_DATE` is a fixed `Date`
     constant set once on launch day and never changed.
   - Read `allRows[index]` as today's animal.

3. On page load, use `hasPlayedToday(localStorage, todayDateString)`
   (where `todayDateString` is `new Date().toISOString().slice(0, 10)`) to
   decide whether to show the game or the already-played result, reading
   the latter from `getLastResult(localStorage)`.

4. On each guess submission, call
   `checkGuess(userInput, todayAnimal.commonName, todayAnimal.aliases)`.
   Reveal `hint1`/`hint2`/`hint3` in order regardless of whether the guess
   was right or wrong, per spec §3. End the game on a correct guess or
   after 3 guesses.

5. On game end, call
   `recordResult(localStorage, { date: todayDateString, puzzleNumber, solved, guessesUsed })`
   to persist the result and get the updated streak, and
   `buildShareText(puzzleNumber, animalEmoji, solved ? guessesUsed : null)`
   to generate the copyable share string. `puzzleNumber` is
   `getTodayPuzzleIndex(...) `'s underlying day count since launch, e.g.
   `Math.floor((Date.now() - LAUNCH_DATE.getTime()) / 86400000) + 1`.

## Manual verification checklist (do this once wired up in Framer)

Framer's live preview can't be driven by this repo's automated tests, so
verify by hand after pasting the code in:

- [ ] Open the Framer preview: today's image loads immediately on page load.
- [ ] Submit a wrong guess: guess count decrements, hint 1 appears.
- [ ] Submit two more wrong guesses: hint 2, then hint 3 appear; after the
      3rd wrong guess the reveal card shows with the correct `commonName`
      and `funFacts`.
- [ ] Reload the page after finishing: the "already played" result shows
      instead of a fresh game.
- [ ] Check the browser's DevTools → Application → Local Storage: a
      `whichanimaltoday_state` entry exists with the expected `date`,
      `solved`, and `currentStreak` values.
- [ ] Copy the share text and confirm it matches
      `WhichAnimalToday #<n> <emoji> <result>`.

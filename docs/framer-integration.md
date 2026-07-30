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

### Stats, panels, and archive CTA (added 2026-07-29)

- [ ] The 📊 icon opens the Statistics panel, and the four figures match
      the `history` array in DevTools → Application → Local Storage.
- [ ] **The panel is not clipped by its Framer container** — the backdrop
      covers the viewport, or the inline fallback from the plan's Task 4
      is in place.
- [ ] Escape, the ✕ button, and a click on the backdrop each close the
      panel, and focus returns to the icon that opened it.
- [ ] After solving today's puzzle, the distribution bar for that guess
      count is highlighted in coral.
- [ ] Opening the panel *before* guessing highlights no bar at all.
- [ ] With `localStorage` cleared, the panel shows "No specimens
      identified yet." rather than zeros and empty bars.
- [ ] The ❓ icon opens How to Play without navigating away: start a
      game, submit one guess, open and close the panel, and confirm the
      revealed clue and remaining guess count are unchanged.
- [ ] The header "Play the Archive →" pill and the reveal-screen archive
      card both land on `/archive`.
- [ ] Seed a v1 value by hand —
      `localStorage.setItem("whichanimaltoday_state", JSON.stringify({ lastResult: { date: "2026-08-01", puzzleNumber: 1, solved: true, guessesUsed: 2 }, currentStreak: 5 }))`
      — reload, and confirm: no console error, the stats panel reports
      Played 1, and the stored value has been rewritten to
      `version: 2` with a one-entry `history`. The old streak of 5 is
      expected to be gone (design doc §2, "Accepted loss").
- [ ] Set the system clock forward three days (or hand-edit the stored
      `history` date backwards) and confirm the header streak badge
      disappears — absence breaks the streak, as
      `docs/legal/how-to-play.md` already promises players.
- [ ] **With storage blocked, the game still works.** Open the live site
      in a private/incognito window with cookies and site data blocked
      (Chrome: Settings → Privacy → "Block all cookies"), then play a full
      puzzle through to the reveal. Expected: no console error, no crash at
      the moment the game ends, the streak badge absent, and the stats
      panel showing "No specimens identified yet." The puzzle becomes
      replayable on reload, which is the accepted cost of having nowhere to
      record the result.
- [ ] The modal card sets `outline: "none"` and receives focus
      programmatically, so confirm there is still an adequate visual
      indication of which element is focused when a panel opens.
- [ ] There is no focus trap: confirm what happens when you press Tab
      repeatedly with a panel open — focus can currently leave the modal
      and reach the page behind the backdrop. Record whether that is
      acceptable.
- [ ] On a narrow mobile viewport (375px wide, via the browser's device
      toolbar), confirm the header's controls row (streak badge, two icon
      buttons, archive pill) wraps legibly rather than being crushed into a
      column beside the wordmark. The `header` style itself has no
      `flexWrap`.
- [ ] With a screen reader, confirm the reveal-screen archive card reads
      acceptably — its accessible name is the title and body text
      concatenated into one long string ("Missed a day? Play the Archive →
      Every specimen featured so far, still playable.").
- [ ] Confirm the guess-distribution bars render legibly in the
      all-games-lost case. Seed via DevTools console:
      `localStorage.setItem("whichanimaltoday_state", JSON.stringify({ version: 2, history: [
      { date: "2026-08-01", puzzleNumber: 1, solved: false, guessesUsed: 3 },
      { date: "2026-08-02", puzzleNumber: 2, solved: false, guessesUsed: 3 },
      { date: "2026-08-03", puzzleNumber: 3, solved: false, guessesUsed: 3 }
      ] }))`
      — reload and open the Statistics panel. Expected: Played 3, Win % 0,
      Current 0, Max 0, and all three distribution bars at the fixed minimum
      width each showing a count of 0. **Not** the "No specimens identified
      yet." empty state, which only appears when nothing has been played at
      all — distinguishing those two states is the point of this check.

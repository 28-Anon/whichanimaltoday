# Field Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the archive page into a personal collection — every animal the player identified stamped in, every one they missed greyed out and named.

**Architecture:** A pure join between `data/archive.json` and the local history, computed in `src/` with tests and mirrored into the archive component by the codegen. No new storage, no migration, no change to the daily game.

**Tech Stack:** TypeScript, Vitest, Node 22. No new dependencies.

**Design doc:** `docs/superpowers/specs/2026-08-01-field-journal-design.md`

## Global Constraints

- **The journal is a READ.** It must never write to `whichanimaltoday_state` and must never touch `SCHEMA_VERSION`. `loadState` maps an unrecognised version to an empty history — a write here could erase the very record the feature exists to display.
- **Never derive the animal from `puzzleNumber`.** `getTodayPuzzleIndex` wraps modulo the list length, so adding one animal re-maps every past day and silently rewrites the journal with wrong creatures. Join on **date**, against `data/archive.json`, which records what actually happened.
- **Never show an animal that has not been featured yet.** `archive.json` only contains past days, so this holds by construction — but any change that reads `animals.json` instead would spoil every upcoming puzzle.
- **No new npm dependencies.** Framer components are pasted single files.
- **Never edit between `BEGIN GENERATED ENGINE` and `END GENERATED ENGINE`.**
- Logic in `src/` gets Vitest coverage. `framer/` has no test harness; verification there is the manual checklist.

## Assumptions taken from the spec's open questions

Both are the owner's call and cheap to change; stated rather than left ambiguous.

1. **Entry point: the header icon bar**, not the reveal card. The reveal card already carries an archive link and will carry a timer-mode link; a third call to action crowds it. The journal is a returning-player destination, not a just-finished-today one.
2. **A new player sees only days from their first play onward.** Twenty greyed-out animals on day one is a bleak first impression, and entries from before someone started aren't gaps they failed to fill. A player with no history at all sees a short "start collecting" message instead of an empty grid.

## Dependency

**Task 2 of this plan is the same work as Task 3 of `2026-08-01-timer-mode.md`** — teaching the codegen to emit into more than one target file. Do it once. If the timer plan has already landed it, skip straight to Task 3 here and just add the archive target.

---

### Task 1: The journal join

**Files:**
- Create: `src/journal.ts`
- Test: `src/journal.test.ts`

**Interfaces:**
- Consumes: `DailyResult` from `src/gameState.ts`.
- Produces: `type JournalState = "starred" | "identified" | "missed"`
- Produces: `interface JournalEntry { date: string; puzzleNumber: number; commonName: string; species?: string; imageUrl: string; slug: string; state: JournalState }`
- Produces: `interface JournalSummary { entries: JournalEntry[]; identified: number; starred: number; total: number }`
- Produces: `buildJournal(archive: ArchivedAnimal[], history: DailyResult[]): JournalSummary`

- [ ] **Step 1: Write the failing tests**

Create `src/journal.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildJournal } from "./journal";
import type { DailyResult } from "./gameState";

const archive = [
  { puzzleNumber: 1, date: "2026-08-01", slug: "giraffe-1", commonName: "Giraffe", imageUrl: "https://x/g.jpg", funFacts: "", category: "Mammal", imageAttribution: "" },
  { puzzleNumber: 2, date: "2026-08-02", slug: "mole-2", commonName: "Mole", species: "Star-Nosed Mole", imageUrl: "https://x/m.jpg", funFacts: "", category: "Mammal", imageAttribution: "" },
  { puzzleNumber: 3, date: "2026-08-03", slug: "koala-3", commonName: "Koala", imageUrl: "https://x/k.jpg", funFacts: "", category: "Mammal", imageAttribution: "" },
];

function played(date: string, solved: boolean, bonus?: "hit" | "miss"): DailyResult {
  return { date, puzzleNumber: 0, solved, guessesUsed: 2, ...(bonus ? { bonus } : {}) };
}

describe("buildJournal", () => {
  it("marks a solved day as identified", () => {
    const { entries } = buildJournal(archive, [played("2026-08-01", true)]);
    expect(entries[0].state).toBe("identified");
  });

  it("marks a solved day with a bonus hit as starred", () => {
    const { entries } = buildJournal(archive, [played("2026-08-02", true, "hit")]);
    expect(entries.find((e) => e.date === "2026-08-02")!.state).toBe("starred");
  });

  it("a bonus miss is still identified, never a downgrade", () => {
    // The bonus is additive by design — losing it must not cost the entry.
    const { entries } = buildJournal(archive, [played("2026-08-02", true, "miss")]);
    expect(entries.find((e) => e.date === "2026-08-02")!.state).toBe("identified");
  });

  it("marks a played-but-lost day as missed", () => {
    const { entries } = buildJournal(archive, [played("2026-08-01", false)]);
    expect(entries[0].state).toBe("missed");
  });

  it("marks a day between plays as missed", () => {
    // They were playing, and did not show up. That is a gap they own.
    const { entries } = buildJournal(archive, [
      played("2026-08-01", true),
      played("2026-08-03", true),
    ]);
    expect(entries.find((e) => e.date === "2026-08-02")!.state).toBe("missed");
  });

  it("hides days before the player's first play", () => {
    // Entries from before someone started are not gaps they failed to fill,
    // and a wall of grey is a bleak first impression.
    const { entries, total } = buildJournal(archive, [played("2026-08-03", true)]);
    expect(entries.map((e) => e.date)).toEqual(["2026-08-03"]);
    expect(total).toBe(1);
  });

  it("returns nothing at all for a player with no history", () => {
    const summary = buildJournal(archive, []);
    expect(summary.entries).toEqual([]);
    expect(summary.total).toBe(0);
    expect(summary.identified).toBe(0);
  });

  it("counts identified and starred, with starred also counting as identified", () => {
    const summary = buildJournal(archive, [
      played("2026-08-01", true),
      played("2026-08-02", true, "hit"),
      played("2026-08-03", false),
    ]);
    expect(summary.total).toBe(3);
    expect(summary.identified).toBe(2);
    expect(summary.starred).toBe(1);
  });

  it("carries species and slug through for display and linking", () => {
    const { entries } = buildJournal(archive, [played("2026-08-02", true)]);
    const entry = entries.find((e) => e.date === "2026-08-02")!;
    expect(entry.species).toBe("Star-Nosed Mole");
    expect(entry.slug).toBe("mole-2");
  });

  it("orders newest first", () => {
    const { entries } = buildJournal(archive, [played("2026-08-01", true)]);
    expect(entries.map((e) => e.date)).toEqual(["2026-08-03", "2026-08-02", "2026-08-01"]);
  });

  it("ignores history for dates the archive does not contain", () => {
    // A stored entry for a day never archived — a job that failed, or a
    // hand-edited value. It must not invent a journal entry.
    const { entries } = buildJournal(archive, [
      played("2026-08-01", true),
      played("2030-01-01", true),
    ]);
    expect(entries.every((e) => e.date <= "2026-08-03")).toBe(true);
  });

  it("does not mutate the archive it was given", () => {
    const copy = JSON.parse(JSON.stringify(archive));
    buildJournal(archive, [played("2026-08-01", true)]);
    expect(archive).toEqual(copy);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/journal.test.ts`
Expected: FAIL — cannot resolve `./journal`.

- [ ] **Step 3: Implement**

Create `src/journal.ts`:

```ts
import type { DailyResult } from "./gameState";

export type JournalState = "starred" | "identified" | "missed";

export interface ArchivedAnimal {
  puzzleNumber: number;
  date: string;
  slug: string;
  commonName: string;
  species?: string;
  imageUrl: string;
}

export interface JournalEntry {
  date: string;
  puzzleNumber: number;
  commonName: string;
  species?: string;
  imageUrl: string;
  slug: string;
  state: JournalState;
}

export interface JournalSummary {
  entries: JournalEntry[];
  /** Includes starred entries — a star is an identification plus extra. */
  identified: number;
  starred: number;
  total: number;
}

/**
 * Joins what was featured (the archive) with what the player solved (local
 * history) on DATE.
 *
 * Date, never `puzzleNumber` arithmetic: `getTodayPuzzleIndex` wraps modulo
 * the animal list length, so adding a single animal would re-map every past
 * day and silently rewrite this journal with the wrong creatures. The archive
 * is a record of what actually happened and stays true as the list grows.
 */
export function buildJournal(
  archive: ArchivedAnimal[],
  history: DailyResult[]
): JournalSummary {
  const empty: JournalSummary = { entries: [], identified: 0, starred: 0, total: 0 };
  if (history.length === 0) return empty;

  const byDate = new Map(history.map((entry) => [entry.date, entry]));

  // Days before the player's first play are not gaps they failed to fill,
  // and a wall of grey is a bleak first impression for a newcomer.
  const firstPlayed = history
    .map((entry) => entry.date)
    .reduce((earliest, date) => (date < earliest ? date : earliest));

  const entries: JournalEntry[] = archive
    .filter((animal) => animal.date >= firstPlayed)
    .map((animal) => {
      const result = byDate.get(animal.date);

      // A bonus miss is still an identification. The bonus is additive by
      // design and must never cost the player the entry.
      const state: JournalState = !result?.solved
        ? "missed"
        : result.bonus === "hit"
          ? "starred"
          : "identified";

      return {
        date: animal.date,
        puzzleNumber: animal.puzzleNumber,
        commonName: animal.commonName,
        ...(animal.species ? { species: animal.species } : {}),
        imageUrl: animal.imageUrl,
        slug: animal.slug,
        state,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    entries,
    identified: entries.filter((e) => e.state !== "missed").length,
    starred: entries.filter((e) => e.state === "starred").length,
    total: entries.length,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/journal.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
npm test && npx tsc --noEmit
git add src/journal.ts src/journal.test.ts
git commit -m "journal: join the archive with local history by date"
```

---

### Task 2: Codegen for a second target

**Skip this task entirely if `2026-08-01-timer-mode.md` Task 3 has already landed** — it is the same work. In that case, only add the archive entry to `ENGINE_TARGETS`.

**Files:**
- Modify: `scripts/framerEngine.ts`, `scripts/generateFramerEngine.ts`
- Test: `scripts/framerEngine.test.ts`

- [ ] **Step 1: Read the generator first**

Read `scripts/framerEngine.ts` in full. It has documented sharp edges — a dedupe keyed on declaration names, a collision guard blind to import bindings, comment-attachment behaviour. `docs/follow-ups.md` lists them. Widen it from one target to a list; do not restructure it.

- [ ] **Step 2: Replace the single-target constants**

```ts
export const ENGINE_TARGETS = [
  {
    path: "framer/GameComponent.tsx",
    modules: [
      "src/puzzleIndex.ts",
      "src/guessChecker.ts",
      "src/bonusRound.ts",
      "src/shareCard.ts",
      "src/stats.ts",
      "src/gameState.ts",
    ],
  },
  {
    path: "framer/ArchiveListComponent.tsx",
    modules: ["src/journal.ts", "src/gameState.ts"],
  },
] as const;
```

The archive needs `gameState.ts` for `getHistory` and `StorageLike`, and nothing else — no guess matching, no streak maths.

- [ ] **Step 3: Loop the generator and the freshness check over targets**

`--check` must fail if **any** target is stale, and name which.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: the freshness test now covers both files and fails until Task 3 regenerates them. That failure is expected.

- [ ] **Step 5: Commit**

```bash
git add scripts/framerEngine.ts scripts/generateFramerEngine.ts scripts/framerEngine.test.ts
git commit -m "codegen: support more than one generated target"
```

---

### Task 3: The archive becomes the journal

**Files:**
- Modify: `framer/ArchiveListComponent.tsx`

No automated coverage — `framer/` is outside the tsconfig `include`.

- [ ] **Step 1: Add the engine block and the storage adapter**

Run `npm run generate:framer` to splice the generated block in. Then copy the `browserStorage` adapter from `framer/GameComponent.tsx` verbatim — the same guards apply, since reading `localStorage` throws outright when cookies are blocked.

- [ ] **Step 2: Build the journal instead of a plain list**

Replace the current "map over every archive entry" render with:

```ts
const summary = buildJournal(archiveEntries, getHistory(browserStorage));
```

Render `summary.entries`. Keep the existing lazy-loading on images — the component already sets `loading="lazy"`, which matters more now that entries accumulate.

- [ ] **Step 3: The three states**

- **starred** — full colour, ⭐ beside the name
- **identified** — full colour, the existing stamp treatment
- **missed** — `filter: grayscale(1)` with reduced opacity, the name shown normally beneath, and a small "not identified" label

**The name is always visible, in all three states.** The player already saw the answer on the reveal card; hiding it is fake mystery. A named gap is the mechanic.

Do not rely on colour alone to distinguish states — the greyed entries carry a text label for the same reason the bonus round carries ✓/✗.

- [ ] **Step 4: The progress header**

Above the grid:

```
17 of 22 identified   ·   6 ⭐
```

One line, prominent. No progress bar, no badges — the fraction is the mechanic.

- [ ] **Step 5: The empty state**

When `summary.total === 0` — a player who has never finished a day — show a short "start collecting" message with a link to today's puzzle, **not** an empty grid and not a wall of grey.

- [ ] **Step 6: Verify**

```bash
npm run generate:framer && npm run check:framer && npm test
npx tsc --noEmit --jsx react-jsx --target es2020 --lib es2022,dom --module esnext --moduleResolution bundler --skipLibCheck framer/ArchiveListComponent.tsx
```

Expected from `tsc`: only `Cannot find module 'react'` — `@types/react` is not a dependency here. **Any `TS1xxx` is a real syntax error and must be fixed.**

- [ ] **Step 7: Commit**

```bash
git add framer/ArchiveListComponent.tsx
git commit -m "ArchiveList: render the archive as a personal field journal"
```

---

### Task 4: The way in

**Files:**
- Modify: `framer/GameComponent.tsx` (hand-written region only)

- [ ] **Step 1: Add a journal control to the header icon bar**

The bar currently renders 🔥, 📊, ❓ and the archive pill. Add a 📔 journal control alongside them, linking to the archive page.

`docs/follow-ups.md` records that the reveal-screen archive card has a run-on accessible name; give this control a single-line `aria-label` and do not repeat that shape.

- [ ] **Step 2: Confirm the daily game is otherwise untouched**

```bash
git diff --stat framer/GameComponent.tsx
```

Expected: one file, a handful of lines. The journal must not change how the daily puzzle plays.

- [ ] **Step 3: Commit**

```bash
git add framer/GameComponent.tsx
git commit -m "GameComponent: link to the field journal from the header"
```

---

### Task 5: Verify and paste

**Files:**
- Modify: `docs/framer-integration.md`, `docs/follow-ups.md`

- [ ] **Step 1: Paste both components**

`ArchiveListComponent.tsx` and `GameComponent.tsx`. For each: click into the editor, **`Ctrl+A`**, then paste. Pasting below the starter code leaves two components exported from one file and Framer silently refuses to register it — no error, the component simply never appears.

- [ ] **Step 2: Walk the checklist on the published page**

1. A player with no history sees the "start collecting" message, not an empty grid.
2. A solved day shows in full colour.
3. A solved day with a bonus hit shows a ⭐.
4. A **bonus miss still shows as identified** — the bonus never costs the entry.
5. A played-and-lost day is greyed, **named**, and labelled "not identified".
6. A day skipped entirely between two played days is greyed the same way.
7. Days before the player's first play do not appear at all.
8. The header count matches the grid.
9. **Animals not yet featured do not appear anywhere.**
10. Opening the journal does not change the daily streak, win count or distribution — check the stats panel before and after.
11. Reload: the journal is unchanged.

Items 9 and 10 are the ones to be fussy about: 9 would spoil every upcoming puzzle, and 10 is the constraint the whole design bends around.

- [ ] **Step 3: Record the coverage gap and the known limitation**

Append to `docs/follow-ups.md` under `## Field journal`:

- `framer/ArchiveListComponent.tsx` has no automated coverage; the three states, the empty state and the header count are verified only by the checklist above.
- **Gaps cannot currently be filled.** Past puzzles are not replayable, so a missed animal is missed permanently. Making archive detail pages playable would close gaps with no change to `src/journal.ts` — a replayed day simply writes a history entry for that date. Recorded as the natural follow-up that turns this record into a true collection.

- [ ] **Step 4: Commit**

```bash
git add docs/framer-integration.md docs/follow-ups.md
git commit -m "docs: field journal checklist and its known limitation"
```

---

## Notes for the implementer

**The journal never writes.** If a change seems to want it writing to `whichanimaltoday_state`, it is wrong — that key holds the record this feature exists to display, and `loadState` erases the history on an unrecognised version.

**Join on date, never on `puzzleNumber`.** The arithmetic looks equivalent and is not: adding one animal shifts the modulo and rewrites the whole journal with wrong creatures. This is the single most likely way to break the feature subtly.

**A bonus miss must never downgrade an entry.** The bonus was designed to be purely additive, and the journal is the second place that promise has to hold.

**Task ordering.** 1 and 2 are independent. 3 needs both. 4 is independent of 3 but pointless without it. 5 is last.

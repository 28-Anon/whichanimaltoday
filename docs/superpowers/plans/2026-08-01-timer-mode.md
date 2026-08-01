# Timer Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A survival mode where the player answers four-option questions against a clock, entirely separate from the daily puzzle and unable to affect it.

**Architecture:** Pure run logic in `src/`, unit-tested and mirrored by the existing codegen into a **new, separate** Framer component. The daily game is not modified except for one link.

**Tech Stack:** TypeScript, Vitest, Node 22. No new dependencies.

**Design doc:** `docs/superpowers/specs/2026-08-01-timer-mode-design.md`

## Global Constraints

- **Timer mode must not touch the daily game's storage.** A third key, `whichanimaltoday_timer`. Never `whichanimaltoday_state`, never `SCHEMA_VERSION`. `loadState` maps an unrecognised version to an empty history, so any schema change reachable from this mode could erase a player's streak.
- **No effect on `solved`, `currentStreak`, `maxStreak`, `played`, or the guess distribution.**
- **No new npm dependencies.** Framer components are pasted single files and cannot import.
- **Clock numbers, exact:** start **45s**, correct **+5s**, wrong **−8s**. The asymmetry is deliberate — with four options a random tapper hits 25%, and if a wrong answer cost the same as a right one gained they would farm the clock indefinitely.
- **Never edit between `BEGIN GENERATED ENGINE` and `END GENERATED ENGINE`** in any component.
- All logic in `src/` gets Vitest coverage. `framer/` has no test harness; verification there is a manual checklist.

## Assumptions taken from the spec's open questions

Both are the owner's call and are cheap to change. Stated here rather than left ambiguous:

1. **Entry point: a button on the daily reveal card.** It catches the player at the moment they have just finished and want more, next to where the archive link already sits.
2. **A wrong answer does not reveal the correct one.** The run moves straight on; missed animals are listed on the end-of-run card. Revealing costs a second of clock at the worst moment, and in a survival run attention is on the timer, not on learning.

---

### Task 1: The run engine

Pure logic: the clock, scoring, and picking each question.

**Files:**
- Create: `src/timerRun.ts`
- Test: `src/timerRun.test.ts`

**Interfaces:**
- Produces: `interface TimerQuestion { animalIndex: number; options: string[]; answerIndex: number }`
- Produces: `interface TimerRun { remainingMs: number; score: number; askedIndexes: number[]; missed: number[] }`
- Produces: `START_MS`, `CORRECT_BONUS_MS`, `WRONG_PENALTY_MS`
- Produces: `buildQuestion(animals: QuizAnimal[], askedIndexes: number[], seed: number): TimerQuestion | null`
- Produces: `applyAnswer(run: TimerRun, correct: boolean, question: TimerQuestion): TimerRun`

- [ ] **Step 1: Write the failing tests**

Create `src/timerRun.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildQuestion,
  applyAnswer,
  START_MS,
  CORRECT_BONUS_MS,
  WRONG_PENALTY_MS,
  type TimerRun,
} from "./timerRun";

const animals = [
  { commonName: "Giraffe", category: "Mammal" },
  { commonName: "Koala", category: "Mammal" },
  { commonName: "Capybara", category: "Mammal" },
  { commonName: "Aardvark", category: "Mammal" },
  { commonName: "Puffin", category: "Bird" },
  { commonName: "Toucan", category: "Bird" },
  { commonName: "Peacock", category: "Bird" },
  { commonName: "Flamingo", category: "Bird" },
];

function freshRun(): TimerRun {
  return { remainingMs: START_MS, score: 0, askedIndexes: [], missed: [] };
}

describe("buildQuestion", () => {
  it("returns four distinct options containing the answer", () => {
    const q = buildQuestion(animals, [], 1)!;
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options).size).toBe(4);
    expect(q.options[q.answerIndex]).toBe(animals[q.animalIndex].commonName);
  });

  it("prefers decoys from the same category", () => {
    // A bird against three other birds: free difficulty, and it stops the
    // silhouette giving the answer away before the name is read.
    const q = buildQuestion(animals, [], 4)!;
    const categoryOf = (name: string) =>
      animals.find((a) => a.commonName === name)!.category;
    const answerCategory = categoryOf(q.options[q.answerIndex]);
    expect(q.options.every((o) => categoryOf(o) === answerCategory)).toBe(true);
  });

  it("never repeats an animal already asked in this run", () => {
    const asked = [0, 1, 2, 3, 4, 5, 6];
    const q = buildQuestion(animals, asked, 9)!;
    expect(asked).not.toContain(q.animalIndex);
  });

  it("returns null when every animal has been asked", () => {
    expect(buildQuestion(animals, [0, 1, 2, 3, 4, 5, 6, 7], 1)).toBeNull();
  });

  it("is deterministic for the same seed and asked list", () => {
    expect(buildQuestion(animals, [], 7)).toEqual(buildQuestion(animals, [], 7));
  });

  it("falls back to the whole list when a category cannot fill three decoys", () => {
    const thin = [
      { commonName: "Blobfish", category: "Fish" },
      { commonName: "Giraffe", category: "Mammal" },
      { commonName: "Koala", category: "Mammal" },
      { commonName: "Capybara", category: "Mammal" },
    ];
    const q = buildQuestion(thin, [1, 2, 3], 1)!;
    expect(q.animalIndex).toBe(0);
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options).size).toBe(4);
  });

  it("returns null when there are fewer than four animals to choose from", () => {
    expect(buildQuestion(animals.slice(0, 3), [], 1)).toBeNull();
  });
});

describe("applyAnswer", () => {
  const question = { animalIndex: 2, options: ["a", "b", "c", "d"], answerIndex: 0 };

  it("adds time and a point for a correct answer", () => {
    const next = applyAnswer(freshRun(), true, question);
    expect(next.remainingMs).toBe(START_MS + CORRECT_BONUS_MS);
    expect(next.score).toBe(1);
    expect(next.missed).toEqual([]);
  });

  it("subtracts more time than a correct answer adds", () => {
    // Load-bearing: with four options a random tapper hits 25%, so a wrong
    // answer must cost more than a right one gains or the clock never ends.
    expect(WRONG_PENALTY_MS).toBeGreaterThan(CORRECT_BONUS_MS);
  });

  it("records a wrong answer without scoring it", () => {
    const next = applyAnswer(freshRun(), false, question);
    expect(next.remainingMs).toBe(START_MS - WRONG_PENALTY_MS);
    expect(next.score).toBe(0);
    expect(next.missed).toEqual([2]);
  });

  it("records the animal as asked either way", () => {
    expect(applyAnswer(freshRun(), true, question).askedIndexes).toEqual([2]);
    expect(applyAnswer(freshRun(), false, question).askedIndexes).toEqual([2]);
  });

  it("clamps the clock at zero rather than going negative", () => {
    const nearlyOut = { ...freshRun(), remainingMs: 2000 };
    expect(applyAnswer(nearlyOut, false, question).remainingMs).toBe(0);
  });

  it("does not mutate the run it was given", () => {
    const run = freshRun();
    applyAnswer(run, true, question);
    expect(run.score).toBe(0);
    expect(run.askedIndexes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/timerRun.test.ts`
Expected: FAIL — cannot resolve `./timerRun`.

- [ ] **Step 3: Implement**

Create `src/timerRun.ts`:

```ts
export const START_MS = 45_000;
export const CORRECT_BONUS_MS = 5_000;
export const WRONG_PENALTY_MS = 8_000;

export interface QuizAnimal {
  commonName: string;
  category: string;
}

export interface TimerQuestion {
  /** Index into the animal list, so the caller can find the image. */
  animalIndex: number;
  options: string[];
  answerIndex: number;
}

export interface TimerRun {
  remainingMs: number;
  score: number;
  askedIndexes: number[];
  /** Animal indexes answered wrongly, listed on the end-of-run card. */
  missed: number[];
}

/** mulberry32, matching src/bonusRound.ts — deterministic, tiny, no deps. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

export function buildQuestion(
  animals: QuizAnimal[],
  askedIndexes: number[],
  seed: number
): TimerQuestion | null {
  // Four options need four distinct names, so a list shorter than that has no
  // valid question regardless of what has been asked.
  if (animals.length < 4) return null;

  const available = animals
    .map((_, index) => index)
    .filter((index) => !askedIndexes.includes(index));
  if (available.length === 0) return null;

  const random = seededRandom(seed);
  const animalIndex = pick(available, random);
  const answer = animals[animalIndex];

  const sameCategory = animals.filter(
    (a) =>
      a.commonName !== answer.commonName &&
      a.category.toLowerCase() === answer.category.toLowerCase()
  );

  // Same-category decoys are the point — a bird against three other birds.
  // But a thin category cannot fill three, and an option repeated is worse
  // than an easy one, so fall back to the whole list.
  const pool =
    sameCategory.length >= 3
      ? sameCategory
      : animals.filter((a) => a.commonName !== answer.commonName);

  const decoys: string[] = [];
  const seen = new Set<string>([answer.commonName]);
  // Bounded so a pool of duplicates cannot spin forever.
  for (let attempt = 0; attempt < 200 && decoys.length < 3; attempt++) {
    const candidate = pick(pool, random).commonName;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    decoys.push(candidate);
  }
  if (decoys.length < 3) return null;

  const options = [...decoys];
  const answerIndex = Math.floor(random() * 4);
  options.splice(answerIndex, 0, answer.commonName);

  return { animalIndex, options, answerIndex };
}

export function applyAnswer(
  run: TimerRun,
  correct: boolean,
  question: TimerQuestion
): TimerRun {
  const delta = correct ? CORRECT_BONUS_MS : -WRONG_PENALTY_MS;

  return {
    // Clamped: a negative clock would render as "-3s" and read as a bug.
    remainingMs: Math.max(0, run.remainingMs + delta),
    score: run.score + (correct ? 1 : 0),
    askedIndexes: [...run.askedIndexes, question.animalIndex],
    missed: correct ? [...run.missed] : [...run.missed, question.animalIndex],
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/timerRun.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/timerRun.ts src/timerRun.test.ts
git commit -m "timerRun: clock, scoring and question selection"
```

---

### Task 2: Timer-mode storage, in its own key

**Files:**
- Create: `src/timerState.ts`
- Test: `src/timerState.test.ts`

**Interfaces:**
- Consumes: `StorageLike` from `src/gameState.ts`.
- Produces: `getBestScore(storage): number`, `recordRun(storage, score): number` (returns the best after recording), `TIMER_STORAGE_KEY`.

- [ ] **Step 1: Write the failing tests**

Create `src/timerState.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getBestScore, recordRun, TIMER_STORAGE_KEY } from "./timerState";
import type { StorageLike } from "./gameState";

function memoryStorage(seed?: Record<string, string>): StorageLike {
  const map = new Map(Object.entries(seed ?? {}));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

describe("timerState", () => {
  it("uses a key separate from the daily game and preferences", () => {
    // The daily streak must be unreachable from timer mode. loadState maps an
    // unrecognised version to an empty history, so sharing a key risks wiping
    // a player's record.
    expect(TIMER_STORAGE_KEY).toBe("whichanimaltoday_timer");
    expect(TIMER_STORAGE_KEY).not.toBe("whichanimaltoday_state");
    expect(TIMER_STORAGE_KEY).not.toBe("whichanimaltoday_preferences");
  });

  it("reports zero before anything is played", () => {
    expect(getBestScore(memoryStorage())).toBe(0);
  });

  it("records a first run as the best", () => {
    const storage = memoryStorage();
    expect(recordRun(storage, 7)).toBe(7);
    expect(getBestScore(storage)).toBe(7);
  });

  it("keeps the higher score", () => {
    const storage = memoryStorage();
    recordRun(storage, 9);
    expect(recordRun(storage, 4)).toBe(9);
    expect(getBestScore(storage)).toBe(9);
  });

  it("survives a corrupt stored value instead of throwing", () => {
    expect(getBestScore(memoryStorage({ [TIMER_STORAGE_KEY]: "not json" }))).toBe(0);
    expect(getBestScore(memoryStorage({ [TIMER_STORAGE_KEY]: '{"best":"x"}' }))).toBe(0);
  });

  it("degrades to zero when storage throws outright", () => {
    // Blocked cookies and Safari private mode make even reading a
    // SecurityError — the same case src/gameState.ts already guards.
    const hostile: StorageLike = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };
    expect(getBestScore(hostile)).toBe(0);
    expect(() => recordRun(hostile, 5)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/timerState.test.ts`

- [ ] **Step 3: Implement**

Create `src/timerState.ts`:

```ts
import type { StorageLike } from "./gameState";

/**
 * Deliberately a third key. Timer mode must never be able to reach the daily
 * history: `loadState` maps an unrecognised version to an empty history, so a
 * shared key means a schema change here could erase a player's streak.
 */
export const TIMER_STORAGE_KEY = "whichanimaltoday_timer";

interface TimerStore {
  best: number;
}

function load(storage: StorageLike): TimerStore {
  let raw: string | null;
  try {
    raw = storage.getItem(TIMER_STORAGE_KEY);
  } catch {
    // Storage can throw rather than return null — blocked cookies, private
    // mode. Degrade to "nothing played" rather than breaking the mode.
    return { best: 0 };
  }
  if (!raw) return { best: 0 };

  try {
    const parsed = JSON.parse(raw) as Partial<TimerStore>;
    return typeof parsed?.best === "number" && Number.isFinite(parsed.best)
      ? { best: parsed.best }
      : { best: 0 };
  } catch {
    return { best: 0 };
  }
}

export function getBestScore(storage: StorageLike): number {
  return load(storage).best;
}

export function recordRun(storage: StorageLike, score: number): number {
  const best = Math.max(load(storage).best, score);
  try {
    storage.setItem(TIMER_STORAGE_KEY, JSON.stringify({ best }));
  } catch {
    // Quota or blocked storage. The run still counts for this session; it
    // just will not survive a reload. Throwing here would end the run.
  }
  return best;
}
```

- [ ] **Step 4: Run, then commit**

```bash
npx vitest run src/timerState.test.ts
git add src/timerState.ts src/timerState.test.ts
git commit -m "timerState: best score in its own storage key"
```

---

### Task 3: Teach the codegen about a second target

The generator writes one file. Timer mode is a separate component and needs its own generated block.

**Files:**
- Modify: `scripts/framerEngine.ts`, `scripts/generateFramerEngine.ts`
- Test: `scripts/framerEngine.test.ts`

**Interfaces:**
- Produces: `ENGINE_TARGETS: { path: string; modules: string[] }[]`, replacing the single `ENGINE_TARGET_PATH` / `ENGINE_MODULE_PATHS` pair.

- [ ] **Step 1: Read the existing generator first**

Read `scripts/framerEngine.ts` in full before changing anything. It has documented sharp edges — a dedupe keyed on declaration names, a collision guard that does not see import bindings, and comment-attachment behaviour. `docs/follow-ups.md` lists them. Do not restructure it; only widen it from one target to a list.

- [ ] **Step 2: Write the failing test**

Append to `scripts/framerEngine.test.ts`:

```ts
import { ENGINE_TARGETS } from "./framerEngine";

describe("engine targets", () => {
  it("declares both components", () => {
    const paths = ENGINE_TARGETS.map((t) => t.path);
    expect(paths).toContain("framer/GameComponent.tsx");
    expect(paths).toContain("framer/TimerModeComponent.tsx");
  });

  it("gives each target only the modules it needs", () => {
    const timer = ENGINE_TARGETS.find((t) => t.path.includes("TimerMode"))!;
    expect(timer.modules).toContain("src/timerRun.ts");
    expect(timer.modules).toContain("src/timerState.ts");
    // The daily game's guess matching and streak maths have no business in
    // timer mode: it is multiple choice and touches no daily state.
    expect(timer.modules).not.toContain("src/guessChecker.ts");
    expect(timer.modules).not.toContain("src/stats.ts");
  });

  it("keeps the daily game's module list unchanged", () => {
    const game = ENGINE_TARGETS.find((t) => t.path.includes("GameComponent"))!;
    expect(game.modules).toEqual([
      "src/puzzleIndex.ts",
      "src/guessChecker.ts",
      "src/bonusRound.ts",
      "src/shareCard.ts",
      "src/stats.ts",
      "src/gameState.ts",
    ]);
  });
});
```

- [ ] **Step 3: Implement**

Replace the two constants with:

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
    path: "framer/TimerModeComponent.tsx",
    modules: ["src/timerRun.ts", "src/timerState.ts", "src/gameState.ts"],
  },
] as const;
```

`src/gameState.ts` appears in both because `StorageLike` lives there. The dedupe is per-target, so that is not a conflict.

Then update `readEngineModules`, `generateFileText` and the freshness assertion to loop over targets. **The `--check` flag must fail if *any* target is stale**, and report which.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: the freshness test now covers both files. `framer/TimerModeComponent.tsx` does not exist yet, so expect a clear failure naming it — Task 4 creates it. Do not stub the file to silence this.

- [ ] **Step 5: Commit**

```bash
git add scripts/framerEngine.ts scripts/generateFramerEngine.ts scripts/framerEngine.test.ts
git commit -m "codegen: support more than one generated target"
```

---

### Task 4: The timer mode component

The largest task, and the one with no automated coverage. `framer/` is outside the tsconfig `include` and has no test harness.

**Files:**
- Create: `framer/TimerModeComponent.tsx`

**Interfaces:**
- Consumes: `buildQuestion`, `applyAnswer`, `START_MS`, `getBestScore`, `recordRun` from the generated block.

- [ ] **Step 1: Copy the shell from an existing component**

Start from `framer/GameComponent.tsx`'s hand-written scaffolding: the `import { useState, type CSSProperties } from "react"` form (never `React.`-namespaced — Framer's editor fails to compile those), the `tokens` object, the `browserStorage` adapter, and the `ANIMALS_JSON_URL` fetch with its `.catch`. Keep the field-journal visual language.

- [ ] **Step 2: Build the phase machine**

```
idle → ready → asking → over
```

- **idle** — a start card showing the best score and a "Start run" button.
- **ready** — the first image is loading. **The clock does not run.** See step 4.
- **asking** — image shown, four buttons, clock ticking.
- **over** — final score, new best if beaten, the list of missed animals, share text, and "Go again".

State: the `TimerRun`, the current `TimerQuestion`, and the phase. Seed each `buildQuestion` call with `Date.now()` — unlike the daily puzzle, runs must differ between players and between attempts.

- [ ] **Step 3: Drive the clock with a deadline, not a countdown**

Do not decrement a counter on every tick. Store the absolute end time and derive the remaining milliseconds from `Date.now()` on each frame or interval. A decrementing counter drifts, and stalls entirely when a mobile browser throttles timers on a backgrounded tab — which would hand players free time by switching apps.

Clear the interval in the effect's cleanup. When remaining time reaches zero, move to `over` and call `recordRun`.

- [ ] **Step 4: Preload the next image, and gate the clock on decode**

This is the requirement most likely to be skipped and most likely to ruin the mode.

```ts
// The clock runs while a photo downloads, so a slow connection silently eats
// seconds and reads as the game cheating — and unlike a wrong answer, the
// player cannot see why. Decode first, then start counting.
function preload(url: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    // Resolve on error too: a broken image must not hang the run forever.
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = url;
  });
}
```

- On entering `ready`, preload the first image, then start the clock and move to `asking`.
- While a question is on screen, preload the *next* animal's image so the following question starts instantly.

- [ ] **Step 5: Answer handling**

On tap: compute `correct`, call `applyAnswer`, then immediately build the next question. **Do not reveal the right answer on a wrong tap** — per the spec's stated assumption, missed animals are listed at the end. Reuse the flash treatment from the daily game: green or red on the tapped button for ~400ms, shorter than the daily game's 900ms because a run has no time to spare.

If `buildQuestion` returns `null`, the player has exhausted the list — end the run as a completed one rather than a timeout, and say so.

- [ ] **Step 6: The end card**

Score, best score, and whether this run beat it. List the missed animals by name so the run teaches something after the fact. A "Go again" button returns to `ready` with a fresh run — **free and unlimited, no gate**.

Share text, distinct from the daily format so the two are never confused:

```
WhichAnimalToday ⏱ 14 in a row
https://whichanimaltoday.com
```

- [ ] **Step 7: Generate and verify**

```bash
npm run generate:framer && npm run check:framer && npm test
```

Then, because nothing here is covered by tests, typecheck the file directly:

```bash
npx tsc --noEmit --jsx react-jsx --target es2020 --lib es2022,dom --module esnext --moduleResolution bundler --skipLibCheck framer/TimerModeComponent.tsx
```

Expected: only `Cannot find module 'react'` errors, which are unavoidable here — `@types/react` is not a dependency and `framer/` was never in the tsconfig. **Any `TS1xxx` error is a real syntax error and must be fixed.**

- [ ] **Step 8: Commit**

```bash
git add framer/TimerModeComponent.tsx
git commit -m "TimerModeComponent: survival mode against the clock"
```

---

### Task 5: The way in

**Files:**
- Modify: `framer/GameComponent.tsx` (hand-written region only)

- [ ] **Step 1: Add the link to the reveal card**

Beside the existing archive card on the reveal, add a link to the timer mode page — the player has just finished the daily puzzle and has nowhere to go, which is the whole reason this mode exists.

Give the `<a>` a single-line `aria-label`; `docs/follow-ups.md` records that the archive card's accessible name currently reads as a run-on of its title and body, so do not repeat that shape.

- [ ] **Step 2: Verify the daily game is otherwise untouched**

```bash
git diff --stat framer/GameComponent.tsx
```

Expected: one file, a handful of added lines, nothing else. Timer mode must not change how the daily puzzle behaves.

- [ ] **Step 3: Commit**

```bash
git add framer/GameComponent.tsx
git commit -m "GameComponent: link to timer mode from the reveal card"
```

---

### Task 6: Manual verification and the Framer paste

**Files:**
- Modify: `docs/framer-integration.md`

- [ ] **Step 1: Paste both components**

`TimerModeComponent.tsx` goes on a new Framer page; `GameComponent.tsx` is re-pasted for the link. For each: click into the editor, **`Ctrl+A`**, then paste. Pasting below the starter code leaves two components exported from one file, and Framer silently refuses to register it — no error, the component simply never appears.

- [ ] **Step 2: Walk the checklist on the published page**

1. Start card shows best score `0` on a fresh browser.
2. The clock **does not start** until the first image is visible.
3. A correct answer adds time and increments the score.
4. A wrong answer subtracts more time than a correct one adds.
5. The same animal never appears twice within one run.
6. Decoys are the same kind of animal as the answer.
7. The clock reaching zero ends the run.
8. Best score persists across a reload.
9. **Playing timer mode does not change the daily streak, win count, or distribution** — check the daily stats panel before and after.
10. Share text uses the ⏱ format, not the daily one.
11. Backgrounding the tab mid-run and returning does **not** hand back free time.
12. On a throttled connection, the clock still does not start before the image.

Items 9 and 11 are the ones worth being fussy about: 9 is the constraint the whole design bends around, and 11 is the exploit players find first.

- [ ] **Step 3: Record what the checklist cannot cover**

Append to `docs/follow-ups.md` under a `## Timer mode` heading: that `framer/TimerModeComponent.tsx` has no automated coverage, and that the clock, preloading and phase machine are verified only by the checklist above.

- [ ] **Step 4: Commit**

```bash
git add docs/framer-integration.md docs/follow-ups.md
git commit -m "docs: timer mode checklist and its coverage gap"
```

---

## Notes for the implementer

**The storage key is the constraint everything bends around.** If a change seems to want timer mode to read or write `whichanimaltoday_state`, stop — it is wrong. The daily streak is the product; this mode is a bonus and must not be able to damage it.

**The clock must be derived from a deadline, not decremented.** Mobile browsers throttle timers in backgrounded tabs, so a decrementing counter hands out free time to anyone who switches apps. That is the first exploit players will find.

**Do not skip the image gate.** A clock that runs while a photo loads is indistinguishable, to the player, from a game that cheats.

**Task ordering.** 1 and 2 are independent. 3 needs both. 4 needs 3. 5 is independent of 4 but pointless without it. 6 is last.

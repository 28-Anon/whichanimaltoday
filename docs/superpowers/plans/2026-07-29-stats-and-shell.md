# Stats Modal, Icon Shell & Archive CTA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `docs/superpowers/specs/2026-07-29-stats-and-shell-design.md` — migrate `localStorage` to a versioned per-day history array, derive full player statistics from it, and surface them through a new icon bar + modal shell in the Framer game component, alongside a "Play the Archive" CTA.

**Architecture:** Two layers. First, pure dependency-free TypeScript in `src/` (`gameState.ts` rewritten for schema v2, plus a new `stats.ts`), fully unit-tested with Vitest against an injected fake storage — this is the layer that carries all the logic and all the risk. Second, the UI in `framer/GameComponent.tsx`, which re-inlines the updated engine functions by hand (the file's existing documented convention) and adds the icon bar, a single generic modal, the stats panel, the How to Play panel, and the CTA. The UI layer has no automated test harness in this project, so it is verified through an extended manual checklist.

**Tech Stack:** TypeScript (strict, ESM), Vitest 4.x, React (via Framer code component). No new dependencies.

## Global Constraints

- Nothing derived is persisted. Played counts, win percentage, streaks, and the guess distribution are computed from `history` at read time. (Spec §2.)
- `DailyResult` keeps its exact existing shape: `date` (`YYYY-MM-DD`, UTC), `puzzleNumber`, `solved`, `guessesUsed`. (Spec §2.)
- `SCHEMA_VERSION = 2`; `STORAGE_KEY = "whichanimaltoday_state"` is unchanged. (Spec §2.)
- v1's `currentStreak` is **not** migrated — the days that produced it are unknown. This is an accepted loss, not a bug to fix. (Spec §2, "Accepted loss".)
- `src/` stays dependency-free and free of any secret or API key — it is what gets pasted into a client-side Framer component. (Existing project constraint, `docs/framer-integration.md`.)
- All new logic added to `src/` must be re-inlined by hand into `framer/GameComponent.tsx`. The two copies must stay identical in behaviour. (Convention documented at the top of that file.)
- Archive list page is `/archive`; the detail route is `/archive-detail?slug=<slug>`. (Spec §7, `docs/framer-archive-integration.md`.)
- Modals must not navigate away from the page — a game in progress must survive opening and closing any panel. (Spec §4.)
- Run tests with `npm test` (`vitest run`).

## Deliberate deviation from the spec

Spec §3 says streak logic should reuse the existing `isNextCalendarDay` helper from `src/gameState.ts`. This plan instead uses a single `dayNumber(date): number` helper in `src/stats.ts` and compares day-number differences.

Reason: the "is the current streak still alive" rule needs gap arithmetic (`today - lastPlayed` being 0 or 1), not a boolean adjacency test. Keeping both helpers would mean two date utilities computing the same thing. `isNextCalendarDay` is private to `gameState.ts` and has no external callers, so removing it breaks nothing. Behaviour is identical.

---

### Task 1: Storage schema v2 and migration

**Files:**
- Modify: `src/gameState.ts:13-30` (replace `StoredState`, `loadState`, `saveState`)
- Test: `src/gameState.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `interface StoredStateV2 { version: 2; history: DailyResult[] }` (module-private); `export function getHistory(storage: StorageLike): DailyResult[]`. `DailyResult` and `StorageLike` keep their current exported shapes.

- [ ] **Step 1: Write the failing migration tests**

Add to `src/gameState.test.ts`. Keep the existing `createFakeStorage` helper and add `getHistory` to the import list at the top of the file.

```typescript
describe("storage schema v2 migration", () => {
  const STORAGE_KEY = "whichanimaltoday_state";

  it("returns empty history when no key is present", () => {
    expect(getHistory(storage)).toEqual([]);
  });

  it("returns empty history when the stored value is not valid JSON", () => {
    storage.setItem(STORAGE_KEY, "{not json");
    expect(getHistory(storage)).toEqual([]);
  });

  it("returns empty history when the stored value is not an object", () => {
    storage.setItem(STORAGE_KEY, "42");
    expect(getHistory(storage)).toEqual([]);
  });

  it("reads a v2 value as-is", () => {
    const entry = {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 2,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, history: [entry] }));
    expect(getHistory(storage)).toEqual([entry]);
  });

  it("returns empty history when a v2 value has a non-array history", () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, history: "nope" }));
    expect(getHistory(storage)).toEqual([]);
  });

  it("migrates a v1 value by seeding history with its lastResult", () => {
    const lastResult = {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 3,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify({ lastResult, currentStreak: 7 }));
    expect(getHistory(storage)).toEqual([lastResult]);
  });

  it("migrates a v1 value with a null lastResult to empty history", () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ lastResult: null, currentStreak: 0 }));
    expect(getHistory(storage)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/gameState.test.ts`
Expected: FAIL — `getHistory` is not exported from `./gameState`.

- [ ] **Step 3: Replace the schema, loader, and saver**

In `src/gameState.ts`, replace the `StoredState` interface, `STORAGE_KEY`, `loadState`, and `saveState` (currently lines 13-30) with:

```typescript
const SCHEMA_VERSION = 2;
const STORAGE_KEY = "whichanimaltoday_state";

interface StoredStateV2 {
  version: 2;
  history: DailyResult[];
}

/** The pre-2026-07-29 shape, read only during migration. */
interface StoredStateV1 {
  lastResult: DailyResult | null;
  currentStreak: number;
}

function emptyState(): StoredStateV2 {
  return { version: SCHEMA_VERSION, history: [] };
}

function loadState(storage: StorageLike): StoredStateV2 {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return emptyState();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyState();
  }
  if (typeof parsed !== "object" || parsed === null) return emptyState();

  const candidate = parsed as Partial<StoredStateV2> & Partial<StoredStateV1>;

  if (candidate.version === SCHEMA_VERSION) {
    return Array.isArray(candidate.history)
      ? { version: SCHEMA_VERSION, history: candidate.history }
      : emptyState();
  }

  // v1 -> v2. `currentStreak` is deliberately dropped: the number is known
  // but the days that produced it are not, so it cannot become real
  // history. See spec §2 "Accepted loss".
  if ("lastResult" in candidate) {
    const last = candidate.lastResult;
    return { version: SCHEMA_VERSION, history: last ? [last] : [] };
  }

  return emptyState();
}

function saveState(storage: StorageLike, state: StoredStateV2): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getHistory(storage: StorageLike): DailyResult[] {
  return loadState(storage).history;
}
```

Leave `isNextCalendarDay`, `getLastResult`, `getCurrentStreak`, `recordResult`, and `hasPlayedToday` alone for now — Task 3 rewrites them. The file will not compile cleanly until then, and the pre-existing `gameState` tests will fail; that is expected and is fixed in Task 3.

- [ ] **Step 4: Run the migration tests to verify they pass**

Run: `npm test -- src/gameState.test.ts -t "storage schema v2 migration"`
Expected: PASS — all 7 tests in that describe block.

- [ ] **Step 5: Commit**

```bash
git add src/gameState.ts src/gameState.test.ts
git commit -m "gameState: versioned v2 history schema with v1 migration"
```

---

### Task 2: Derived statistics

**Files:**
- Create: `src/stats.ts`
- Test: `src/stats.test.ts`

**Interfaces:**
- Consumes: `type DailyResult` from `./gameState` (Task 1). Import it with `import type` — a value import would create a real module cycle once Task 3 makes `gameState.ts` import `computeStats`. A type-only import is erased at compile time, so no cycle exists at runtime.
- Produces: `export interface Stats { played: number; wins: number; winPercent: number; currentStreak: number; maxStreak: number; distribution: [number, number, number] }` and `export function computeStats(history: DailyResult[], today: string): Stats`. `today` is a `YYYY-MM-DD` UTC date string, matching the existing `hasPlayedToday(storage, today)` convention.

- [ ] **Step 1: Write the failing tests**

Create `src/stats.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeStats } from "./stats";
import type { DailyResult } from "./gameState";

function result(
  date: string,
  solved: boolean,
  guessesUsed: number
): DailyResult {
  return { date, puzzleNumber: 1, solved, guessesUsed };
}

describe("computeStats", () => {
  it("returns all zeros for an empty history without dividing by zero", () => {
    const stats = computeStats([], "2026-08-10");
    expect(stats).toEqual({
      played: 0,
      wins: 0,
      winPercent: 0,
      currentStreak: 0,
      maxStreak: 0,
      distribution: [0, 0, 0],
    });
  });

  it("counts played and wins and rounds win percentage", () => {
    // 2 wins out of 3 played = 66.67% -> 67
    const stats = computeStats(
      [
        result("2026-08-01", true, 1),
        result("2026-08-02", false, 3),
        result("2026-08-03", true, 2),
      ],
      "2026-08-03"
    );
    expect(stats.played).toBe(3);
    expect(stats.wins).toBe(2);
    expect(stats.winPercent).toBe(67);
  });

  it("buckets the distribution by guessesUsed and ignores losses", () => {
    const stats = computeStats(
      [
        result("2026-08-01", true, 1),
        result("2026-08-02", true, 3),
        result("2026-08-03", true, 3),
        result("2026-08-04", false, 3),
      ],
      "2026-08-04"
    );
    expect(stats.distribution).toEqual([1, 0, 2]);
  });

  it("reports distribution [0,0,0] with played > 0 when every game was lost", () => {
    const stats = computeStats(
      [result("2026-08-01", false, 3), result("2026-08-02", false, 3)],
      "2026-08-02"
    );
    expect(stats.played).toBe(2);
    expect(stats.wins).toBe(0);
    expect(stats.winPercent).toBe(0);
    expect(stats.distribution).toEqual([0, 0, 0]);
  });

  it("keeps the current streak alive when the last entry is today", () => {
    const stats = computeStats(
      [result("2026-08-01", true, 1), result("2026-08-02", true, 1)],
      "2026-08-02"
    );
    expect(stats.currentStreak).toBe(2);
  });

  it("keeps the current streak alive when the last entry is yesterday", () => {
    const stats = computeStats(
      [result("2026-08-01", true, 1), result("2026-08-02", true, 1)],
      "2026-08-03"
    );
    expect(stats.currentStreak).toBe(2);
  });

  it("kills the current streak when the last entry is older than yesterday", () => {
    const stats = computeStats(
      [result("2026-08-01", true, 1), result("2026-08-02", true, 1)],
      "2026-08-05"
    );
    expect(stats.currentStreak).toBe(0);
    expect(stats.maxStreak).toBe(2);
  });

  it("kills the current streak when the most recent entry is a loss", () => {
    const stats = computeStats(
      [result("2026-08-01", true, 1), result("2026-08-02", false, 3)],
      "2026-08-02"
    );
    expect(stats.currentStreak).toBe(0);
    expect(stats.maxStreak).toBe(1);
  });

  it("breaks a streak across a skipped day", () => {
    const stats = computeStats(
      [result("2026-08-01", true, 1), result("2026-08-03", true, 1)],
      "2026-08-03"
    );
    expect(stats.currentStreak).toBe(1);
    expect(stats.maxStreak).toBe(1);
  });

  it("takes the longest run for maxStreak across a gap", () => {
    const stats = computeStats(
      [
        result("2026-08-01", true, 1),
        result("2026-08-02", true, 1),
        result("2026-08-03", true, 1),
        result("2026-08-05", true, 1),
      ],
      "2026-08-05"
    );
    expect(stats.maxStreak).toBe(3);
    expect(stats.currentStreak).toBe(1);
  });

  it("sorts an out-of-order history before computing streaks", () => {
    const stats = computeStats(
      [
        result("2026-08-03", true, 1),
        result("2026-08-01", true, 1),
        result("2026-08-02", true, 1),
      ],
      "2026-08-03"
    );
    expect(stats.currentStreak).toBe(3);
    expect(stats.maxStreak).toBe(3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/stats.test.ts`
Expected: FAIL — cannot resolve `./stats`.

- [ ] **Step 3: Write the implementation**

Create `src/stats.ts`:

```typescript
import type { DailyResult } from "./gameState";

export interface Stats {
  played: number;
  wins: number;
  /** Integer 0-100. 0 when nothing has been played. */
  winPercent: number;
  currentStreak: number;
  maxStreak: number;
  /** Wins on guess 1, 2, and 3 respectively. */
  distribution: [number, number, number];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days since the epoch for a YYYY-MM-DD UTC date string. */
function dayNumber(date: string): number {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / MS_PER_DAY);
}

export function computeStats(history: DailyResult[], today: string): Stats {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));

  const played = sorted.length;
  const wins = sorted.filter((entry) => entry.solved).length;
  const winPercent = played === 0 ? 0 : Math.round((wins / played) * 100);

  const distribution: [number, number, number] = [0, 0, 0];
  for (const entry of sorted) {
    if (entry.solved && entry.guessesUsed >= 1 && entry.guessesUsed <= 3) {
      distribution[entry.guessesUsed - 1] += 1;
    }
  }

  // Walk the history once, tracking the run of solved entries on
  // consecutive calendar days. `run` ends up holding the streak that
  // terminates at the most recent entry.
  let maxStreak = 0;
  let run = 0;
  let previous: DailyResult | null = null;
  for (const entry of sorted) {
    if (!entry.solved) {
      run = 0;
    } else if (
      previous !== null &&
      previous.solved &&
      dayNumber(entry.date) - dayNumber(previous.date) === 1
    ) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > maxStreak) maxStreak = run;
    previous = entry;
  }

  // A streak is only alive if the player has actually shown up recently.
  // Nothing is written on days they don't play, so absence has to be
  // detected by comparing against today rather than by a stored counter.
  let currentStreak = 0;
  const last = played === 0 ? null : sorted[played - 1];
  if (last !== null && last.solved) {
    const gap = dayNumber(today) - dayNumber(last.date);
    if (gap === 0 || gap === 1) currentStreak = run;
  }

  return { played, wins, winPercent, currentStreak, maxStreak, distribution };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/stats.test.ts`
Expected: PASS — all 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/stats.ts src/stats.test.ts
git commit -m "stats: derive played, win %, streaks, and guess distribution from history"
```

---

### Task 3: Rewire gameState onto derived stats

**Files:**
- Modify: `src/gameState.ts` (remove `isNextCalendarDay`; rewrite `getLastResult`, `getCurrentStreak`, `recordResult`, `hasPlayedToday`)
- Modify: `src/index.ts` (export the new surface)
- Test: `src/gameState.test.ts` (update the existing streak tests for the new signature)

**Interfaces:**
- Consumes: `getHistory` and the v2 loader from Task 1; `computeStats` and `Stats` from Task 2.
- Produces: `getCurrentStreak(storage: StorageLike, today: string): number` — **signature changed**, now takes `today`. `recordResult(storage, result)` keeps its signature and still returns the updated current streak. `getLastResult(storage)` and `hasPlayedToday(storage, today)` keep their signatures.

- [ ] **Step 1: Update the existing tests and add idempotency tests**

In `src/gameState.test.ts`, the existing `describe("gameState")` block calls `getCurrentStreak(storage)` with one argument and asserts streak behaviour that Task 2 now owns. Replace that entire block with:

```typescript
describe("gameState", () => {
  let storage: StorageLike;

  beforeEach(() => {
    storage = createFakeStorage();
  });

  it("returns null/0/false before anything has been recorded", () => {
    expect(getLastResult(storage)).toBeNull();
    expect(getCurrentStreak(storage, "2026-08-01")).toBe(0);
    expect(hasPlayedToday(storage, "2026-08-01")).toBe(false);
  });

  it("records a result and reports a streak of 1", () => {
    const streak = recordResult(storage, {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 2,
    });
    expect(streak).toBe(1);
    expect(hasPlayedToday(storage, "2026-08-01")).toBe(true);
    expect(getHistory(storage)).toHaveLength(1);
  });

  it("increments the streak on a solved result the next calendar day", () => {
    recordResult(storage, {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 2,
    });
    const streak = recordResult(storage, {
      date: "2026-08-02",
      puzzleNumber: 2,
      solved: true,
      guessesUsed: 1,
    });
    expect(streak).toBe(2);
  });

  it("returns the most recent entry from getLastResult", () => {
    recordResult(storage, {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 2,
    });
    recordResult(storage, {
      date: "2026-08-02",
      puzzleNumber: 2,
      solved: false,
      guessesUsed: 3,
    });
    expect(getLastResult(storage)?.date).toBe("2026-08-02");
  });

  it("reports a dead streak when the last played day is older than yesterday", () => {
    recordResult(storage, {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 2,
    });
    expect(getCurrentStreak(storage, "2026-08-02")).toBe(1);
    expect(getCurrentStreak(storage, "2026-08-09")).toBe(0);
  });

  it("is idempotent when the same date is recorded twice", () => {
    recordResult(storage, {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: false,
      guessesUsed: 3,
    });
    const streak = recordResult(storage, {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 2,
    });
    const history = getHistory(storage);
    expect(history).toHaveLength(1);
    expect(history[0].solved).toBe(true);
    expect(history[0].guessesUsed).toBe(2);
    expect(streak).toBe(1);
  });

  it("keeps history sorted by date when results arrive out of order", () => {
    recordResult(storage, {
      date: "2026-08-03",
      puzzleNumber: 3,
      solved: true,
      guessesUsed: 1,
    });
    recordResult(storage, {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 1,
    });
    expect(getHistory(storage).map((e) => e.date)).toEqual([
      "2026-08-01",
      "2026-08-03",
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/gameState.test.ts`
Expected: FAIL — `getCurrentStreak` rejects a second argument (TypeScript), and the idempotency test finds 2 entries because `recordResult` still writes the v1 shape.

- [ ] **Step 3: Rewrite the accessors**

In `src/gameState.ts`, delete `isNextCalendarDay` entirely and replace `getLastResult`, `getCurrentStreak`, `recordResult`, and `hasPlayedToday` with:

```typescript
export function getLastResult(storage: StorageLike): DailyResult | null {
  const history = loadState(storage).history;
  if (history.length === 0) return null;
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  return sorted[sorted.length - 1];
}

export function getCurrentStreak(
  storage: StorageLike,
  today: string
): number {
  return computeStats(loadState(storage).history, today).currentStreak;
}

export function getStats(storage: StorageLike, today: string): Stats {
  return computeStats(loadState(storage).history, today);
}

export function recordResult(
  storage: StorageLike,
  result: DailyResult
): number {
  // Idempotent by date: re-recording the same day replaces that entry
  // rather than appending, so a double-fire can't inflate `played`.
  const history = loadState(storage).history.filter(
    (entry) => entry.date !== result.date
  );
  history.push(result);
  history.sort((a, b) => a.date.localeCompare(b.date));

  saveState(storage, { version: SCHEMA_VERSION, history });

  // The result being recorded is by definition today's.
  return computeStats(history, result.date).currentStreak;
}

export function hasPlayedToday(
  storage: StorageLike,
  today: string
): boolean {
  return loadState(storage).history.some((entry) => entry.date === today);
}
```

Add this import at the top of `src/gameState.ts`:

```typescript
import { computeStats, type Stats } from "./stats";
```

- [ ] **Step 4: Run the full test suite to verify everything passes**

Run: `npm test`
Expected: PASS — all suites, including the pre-existing `puzzleIndex`, `guessChecker`, `shareCard`, `animalData`, and `scripts/` tests, which this task must not break.

- [ ] **Step 5: Update the public export surface**

In `src/index.ts`, replace the `./gameState` export block and add the stats export:

```typescript
export {
  recordResult,
  getLastResult,
  getCurrentStreak,
  getStats,
  getHistory,
  hasPlayedToday,
  type DailyResult,
  type StorageLike,
} from "./gameState";
export { computeStats, type Stats } from "./stats";
```

- [ ] **Step 6: Verify the project typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/gameState.ts src/gameState.test.ts src/index.ts
git commit -m "gameState: derive streaks from history, make recordResult idempotent"
```

---

### Task 4: Sync the engine changes into the Framer component

**Files:**
- Modify: `framer/GameComponent.tsx:136-199` (the inlined state/streak section) and `:240-251, :285-303` (the callers)
- Modify: `docs/framer-integration.md` (steps 3 and 5, which document the changed signatures)

**Interfaces:**
- Consumes: the final implementations from Tasks 1-3.
- Produces: an inlined `computeStats`, `loadState`, `saveState`, `recordResult`, and `getHistory` inside the component, plus a `stats` value in component state that Tasks 6 and 7 render.

No automated tests: this file is a Framer paste target, not part of the Vitest project. Correctness is guaranteed by copying Tasks 1-3 verbatim, and verified by the manual checklist in Task 10.

- [ ] **Step 1: Replace the inlined storage and streak logic**

In `framer/GameComponent.tsx`, replace everything from `const STORAGE_KEY = "whichanimaltoday_state";` (line 136) through the end of `recordResult` (line 182) with the code below. This is Tasks 1-3 with `StorageLike` collapsed to `window.localStorage` and an SSR guard, matching how the file already handles `typeof window === "undefined"`.

```typescript
const STORAGE_KEY = "whichanimaltoday_state";
const SCHEMA_VERSION = 2;

interface StoredStateV2 {
  version: 2;
  history: DailyResult[];
}

interface Stats {
  played: number;
  wins: number;
  winPercent: number;
  currentStreak: number;
  maxStreak: number;
  distribution: [number, number, number];
}

const EMPTY_STATS: Stats = {
  played: 0,
  wins: 0,
  winPercent: 0,
  currentStreak: 0,
  maxStreak: 0,
  distribution: [0, 0, 0],
};

function emptyState(): StoredStateV2 {
  return { version: SCHEMA_VERSION, history: [] };
}

function loadState(): StoredStateV2 {
  if (typeof window === "undefined") return emptyState();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyState();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyState();
  }
  if (typeof parsed !== "object" || parsed === null) return emptyState();

  const candidate = parsed as {
    version?: number;
    history?: unknown;
    lastResult?: DailyResult | null;
  };

  if (candidate.version === SCHEMA_VERSION) {
    return Array.isArray(candidate.history)
      ? { version: SCHEMA_VERSION, history: candidate.history as DailyResult[] }
      : emptyState();
  }

  // v1 -> v2. `currentStreak` is deliberately dropped; see the design doc
  // at docs/superpowers/specs/2026-07-29-stats-and-shell-design.md §2.
  if ("lastResult" in candidate) {
    const last = candidate.lastResult;
    return { version: SCHEMA_VERSION, history: last ? [last] : [] };
  }

  return emptyState();
}

function saveState(state: StoredStateV2): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function dayNumber(date: string): number {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / MS_PER_DAY);
}

function computeStats(history: DailyResult[], today: string): Stats {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));

  const played = sorted.length;
  const wins = sorted.filter((entry) => entry.solved).length;
  const winPercent = played === 0 ? 0 : Math.round((wins / played) * 100);

  const distribution: [number, number, number] = [0, 0, 0];
  for (const entry of sorted) {
    if (entry.solved && entry.guessesUsed >= 1 && entry.guessesUsed <= 3) {
      distribution[entry.guessesUsed - 1] += 1;
    }
  }

  let maxStreak = 0;
  let run = 0;
  let previous: DailyResult | null = null;
  for (const entry of sorted) {
    if (!entry.solved) {
      run = 0;
    } else if (
      previous !== null &&
      previous.solved &&
      dayNumber(entry.date) - dayNumber(previous.date) === 1
    ) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > maxStreak) maxStreak = run;
    previous = entry;
  }

  let currentStreak = 0;
  const last = played === 0 ? null : sorted[played - 1];
  if (last !== null && last.solved) {
    const gap = dayNumber(today) - dayNumber(last.date);
    if (gap === 0 || gap === 1) currentStreak = run;
  }

  return { played, wins, winPercent, currentStreak, maxStreak, distribution };
}

function recordResult(result: DailyResult): Stats {
  const history = loadState().history.filter(
    (entry) => entry.date !== result.date
  );
  history.push(result);
  history.sort((a, b) => a.date.localeCompare(b.date));
  saveState({ version: SCHEMA_VERSION, history });
  return computeStats(history, result.date);
}
```

Note the deliberate difference from `src/`: the component's `recordResult` returns the whole `Stats` object rather than just the streak number, because the component needs all of it for the stats modal. `isNextCalendarDay` is gone — delete it.

- [ ] **Step 2: Replace the `streak` state with a `stats` state**

Change the state declaration (line 213):

```typescript
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
```

...replacing `const [streak, setStreak] = useState(0);`. Then update the three places that used it.

In the load effect, replace the `loadState()` block (lines 240-251) with:

```typescript
        const state = loadState();
        const today8601 = todayDateString();
        setStats(computeStats(state.history, today8601));

        const todayEntry = state.history.find(
          (entry) => entry.date === today8601
        );
        if (todayEntry) {
          setSolved(todayEntry.solved);
          setGuessesLeft(3 - todayEntry.guessesUsed);
          setHintsRevealed(Math.min(todayEntry.guessesUsed, 3));
          setPhase("done");
        } else {
          setPhase("playing");
        }
```

In `finishGame`, replace the `recordResult`/`setStreak` lines with:

```typescript
    const newStats = recordResult({
      date: todayDateString(),
      puzzleNumber,
      solved: didSolve,
      guessesUsed,
    });
    setStats(newStats);
```

- [ ] **Step 3: Verify the component typechecks**

Run: `npx tsc --noEmit`
Expected: no errors. If `tsconfig.json` does not include `framer/`, this step will report nothing for that file — in that case confirm by eye that every former reference to `streak` is gone:

Run: `grep -n "streak" framer/GameComponent.tsx`
Expected: only `stats.currentStreak` / `currentStreak` occurrences, no bare `streak` state variable and no `setStreak`.

- [ ] **Step 4: Update the integration doc**

In `docs/framer-integration.md`, step 3 currently describes reading `getLastResult(localStorage)`. Replace that sentence with:

```markdown
3. On page load, call `loadState()` and look for an entry in `history`
   whose `date` matches today (`new Date().toISOString().slice(0, 10)`)
   to decide whether to show the game or the already-played result.
   Call `computeStats(history, today)` for the figures shown in the
   header badge and stats modal.
```

In step 5, replace the `recordResult` sentence with:

```markdown
5. On game end, call
   `recordResult({ date: todayDateString, puzzleNumber, solved, guessesUsed })`
   to persist the result and get back the updated `Stats` object, and
   `buildShareText(puzzleNumber, animalEmoji, solved ? guessesUsed : null)`
   to generate the copyable share string. `recordResult` is idempotent by
   date — recording the same day twice replaces the entry rather than
   adding a second one.
```

In the manual verification checklist at the bottom of that file, replace the `localStorage` bullet with:

```markdown
- [ ] Check the browser's DevTools → Application → Local Storage: a
      `whichanimaltoday_state` entry exists with `version: 2` and a
      `history` array containing exactly one entry for today, with the
      expected `date`, `solved`, and `guessesUsed` values.
```

- [ ] **Step 5: Commit**

```bash
git add framer/GameComponent.tsx docs/framer-integration.md
git commit -m "GameComponent: sync v2 history schema and derived stats"
```

---

### Task 5: Generic modal

**Files:**
- Modify: `framer/GameComponent.tsx` (add a `Modal` component and its styles)

**Interfaces:**
- Consumes: the `tokens` and `styles` objects already defined at the bottom of the file.
- Produces: `function Modal(props: { title: string; open: boolean; footer?: string; onClose: () => void; children: React.ReactNode })`. Tasks 6-8 render panels inside it.

No automated tests (see Task 4's note). Task 10 carries the manual checks.

- [ ] **Step 1: Add the Modal component**

Insert above `export default function GameComponent()` in `framer/GameComponent.tsx`:

```typescript
function Modal({
  title,
  open,
  footer,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  footer?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Move focus into the panel so keyboard and screen-reader users land
    // here rather than continuing through the page behind it.
    cardRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={styles.modalBackdrop}
      onClick={onClose}
      data-testid="modal-backdrop"
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={styles.modalCard}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>{title}</div>
          <button
            type="button"
            aria-label="Close"
            style={styles.modalClose}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div style={styles.modalBody}>{children}</div>
        {footer && <div style={styles.modalFooter}>{footer}</div>}
      </div>
    </div>
  );
}
```

Update the React import on line 28 to include `useRef`:

```typescript
import { useEffect, useRef, useState } from "react";
```

- [ ] **Step 2: Add the modal styles**

Add these entries to the `styles` object at the bottom of the file:

```typescript
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(43,36,32,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 9999,
  },
  modalCard: {
    background: tokens.paper,
    border: `1px solid ${tokens.line}`,
    borderRadius: 12,
    boxShadow: "0 18px 44px rgba(43,36,32,0.28)",
    width: "100%",
    maxWidth: 400,
    maxHeight: "85vh",
    display: "flex",
    flexDirection: "column",
    outline: "none",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px 10px",
    borderBottom: `1px solid ${tokens.line}`,
  },
  modalTitle: {
    fontFamily: tokens.mono,
    fontSize: 12,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: tokens.ink,
  },
  modalClose: {
    fontFamily: tokens.body,
    fontSize: 16,
    lineHeight: 1,
    color: tokens.inkSoft,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 4,
  },
  modalBody: {
    padding: "16px",
    overflowY: "auto",
  },
  modalFooter: {
    fontFamily: tokens.mono,
    fontSize: 10,
    letterSpacing: "0.1em",
    color: tokens.inkSoft,
    padding: "8px 16px 12px",
    borderTop: `1px solid ${tokens.line}`,
  },
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (If `framer/` is outside the tsconfig include list, this reports nothing for the file — that is acceptable; the Framer editor is the real check.)

- [ ] **Step 4: Handle the fixed-positioning risk**

Per spec §5, a `position: fixed` overlay rendered inside a Framer code component can be clipped by an ancestor carrying `transform` or `overflow: hidden`. Paste the component into Framer and open any modal.

- If the backdrop covers the whole viewport: no change needed, continue.
- If the backdrop is clipped to the component's own box: change `styles.modalBackdrop` from `position: "fixed"` to `position: "relative"`, drop `inset`, `zIndex`, and the flex centering, and render the card inline so it expands in place and pushes content below it down. Keep every other behaviour — Escape, ✕, focus handling — exactly as written. Do not attempt a `createPortal` workaround; Framer's canvas mounting makes the portal target unreliable.

Record which branch was taken in the commit message.

- [ ] **Step 5: Commit**

```bash
git add framer/GameComponent.tsx
git commit -m "GameComponent: add generic accessible modal shell"
```

---

### Task 6: Icon bar

**Files:**
- Modify: `framer/GameComponent.tsx:331-339` (the `<header>` block) and the `styles` object

**Interfaces:**
- Consumes: `Modal` (Task 5), `stats` state (Task 4).
- Produces: `openPanel` state of type `"stats" | "howto" | null`, which Tasks 7 and 8 read to decide which panel renders.

- [ ] **Step 1: Add the panel state**

Add alongside the other `useState` calls in `GameComponent`:

```typescript
  const [openPanel, setOpenPanel] = useState<"stats" | "howto" | null>(null);
```

- [ ] **Step 2: Replace the header**

Replace the existing `<header>` block with:

```tsx
      <header style={styles.header}>
        <div>
          <div style={styles.wordmark}>WhichAnimalToday</div>
          <div style={styles.tagline}>a new specimen every day</div>
        </div>
        <div style={styles.headerControls}>
          {stats.currentStreak > 0 && (
            <div style={styles.streakBadge}>
              🔥 {stats.currentStreak} day{stats.currentStreak === 1 ? "" : "s"}
            </div>
          )}
          <button
            type="button"
            aria-label="Statistics"
            style={styles.iconTab}
            onClick={() => setOpenPanel("stats")}
          >
            <span aria-hidden="true">📊</span>
          </button>
          <button
            type="button"
            aria-label="How to play"
            style={styles.iconTab}
            onClick={() => setOpenPanel("howto")}
          >
            <span aria-hidden="true">❓</span>
          </button>
          <a href="/archive" style={styles.archivePill}>
            Play the Archive →
          </a>
        </div>
      </header>
```

- [ ] **Step 3: Add the styles**

Add to the `styles` object:

```typescript
  headerControls: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  iconTab: {
    fontSize: 14,
    lineHeight: 1,
    background: tokens.paperCard,
    border: `1px solid ${tokens.line}`,
    borderRadius: 6,
    padding: "6px 8px",
    cursor: "pointer",
    color: tokens.ink,
  },
  archivePill: {
    fontFamily: tokens.body,
    fontWeight: 600,
    fontSize: 12,
    color: "#fff",
    background: tokens.coral,
    borderRadius: 999,
    padding: "7px 12px",
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
```

- [ ] **Step 4: Verify no stale references remain**

Run: `grep -n "setStreak\|{streak}" framer/GameComponent.tsx`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add framer/GameComponent.tsx
git commit -m "GameComponent: replace header with icon bar and archive CTA"
```

---

### Task 7: Stats panel

**Files:**
- Modify: `framer/GameComponent.tsx` (add a `StatsPanel` component, render it, add styles)

**Interfaces:**
- Consumes: `Stats` and `stats` (Task 4), `Modal` (Task 5), `openPanel` (Task 6).
- Produces: `function StatsPanel(props: { stats: Stats; todayGuesses: number | null })`, where `todayGuesses` is the guess count to highlight, or `null` for no highlight.

- [ ] **Step 1: Add the StatsPanel component**

Insert above `export default function GameComponent()`:

```tsx
function StatsPanel({
  stats,
  todayGuesses,
}: {
  stats: Stats;
  todayGuesses: number | null;
}) {
  if (stats.played === 0) {
    return <div style={styles.statsEmpty}>No specimens identified yet.</div>;
  }

  const largest = Math.max(...stats.distribution);

  return (
    <>
      <div style={styles.statsRow}>
        {[
          { label: "Played", value: stats.played },
          { label: "Win %", value: stats.winPercent },
          { label: "Current", value: stats.currentStreak },
          { label: "Max", value: stats.maxStreak },
        ].map((figure) => (
          <div key={figure.label} style={styles.statsFigure}>
            <div style={styles.statsValue}>{figure.value}</div>
            <div style={styles.statsLabel}>{figure.label}</div>
          </div>
        ))}
      </div>

      <div style={styles.distTitle}>Guess distribution</div>
      {stats.distribution.map((count, index) => {
        const guessNumber = index + 1;
        // When every game has been lost, `largest` is 0 and a
        // proportional width would divide by zero — fall back to a fixed
        // minimum so the bars still render.
        const width = largest === 0 ? 6 : Math.max(6, (count / largest) * 100);
        const highlighted = todayGuesses === guessNumber;
        return (
          <div key={guessNumber} style={styles.distRow}>
            <span style={styles.distIndex}>{guessNumber}</span>
            <span
              style={{
                ...styles.distBar,
                width: `${width}%`,
                background: highlighted ? tokens.coral : tokens.moss,
              }}
            />
            <span style={styles.distCount}>{count}</span>
          </div>
        );
      })}
    </>
  );
}
```

- [ ] **Step 2: Render the panel**

Inside `GameComponent`'s returned JSX, immediately after the closing `</header>`, add:

```tsx
      <Modal
        title="Statistics"
        open={openPanel === "stats"}
        footer={`FIELD FILE #${puzzleNumber}`}
        onClose={() => setOpenPanel(null)}
      >
        <StatsPanel
          stats={stats}
          todayGuesses={phase === "done" && solved ? 3 - guessesLeft : null}
        />
        {phase === "done" && (
          <>
            <div style={styles.postcard}>
              <div style={styles.postcardText}>{getShareText()}</div>
            </div>
            <button style={styles.shareButton} onClick={copyShareText}>
              {shareCopied ? "Copied!" : "Copy result"}
            </button>
          </>
        )}
      </Modal>
```

The `todayGuesses` expression encodes spec §6: highlight only when today's puzzle is finished *and* solved. Before playing, or after a loss, it is `null` and no bar is highlighted.

- [ ] **Step 3: Add the styles**

Add to the `styles` object:

```typescript
  statsEmpty: {
    fontFamily: tokens.body,
    fontSize: 14,
    color: tokens.inkSoft,
    textAlign: "center",
    padding: "12px 0",
  },
  statsRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 20,
  },
  statsFigure: {
    flex: 1,
    textAlign: "center",
  },
  statsValue: {
    fontFamily: tokens.mono,
    fontSize: 22,
    fontWeight: 700,
    color: tokens.ink,
  },
  statsLabel: {
    fontFamily: tokens.mono,
    fontSize: 9,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: tokens.inkSoft,
    marginTop: 2,
  },
  distTitle: {
    fontFamily: tokens.mono,
    fontSize: 10,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: tokens.inkSoft,
    marginBottom: 8,
  },
  distRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  distIndex: {
    fontFamily: tokens.mono,
    fontSize: 12,
    color: tokens.ink,
    width: 10,
  },
  distBar: {
    height: 18,
    borderRadius: 3,
    display: "inline-block",
    minWidth: 6,
  },
  distCount: {
    fontFamily: tokens.mono,
    fontSize: 11,
    color: tokens.inkSoft,
  },
```

- [ ] **Step 4: Commit**

```bash
git add framer/GameComponent.tsx
git commit -m "GameComponent: add stats panel with guess distribution"
```

---

### Task 8: How to Play panel

**Files:**
- Modify: `framer/GameComponent.tsx` (add `HOW_TO_PLAY` content and render it)

**Interfaces:**
- Consumes: `Modal` (Task 5), `openPanel` (Task 6).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the content constant**

The text below is transcribed from `docs/legal/how-to-play.md` — the repo file stays the source of truth for the standalone Framer page, and this is the hand-copied inline version per spec §4. Insert near the top of the file, under `ANIMALS_JSON_URL`:

```typescript
const HOW_TO_PLAY: { heading: string; body: string }[] = [
  {
    heading: "One animal a day.",
    body:
      "Every day, WhichAnimalToday features one new specimen — a photo, waiting to be identified.",
  },
  {
    heading: "1. Look at the photo.",
    body: "No caption, no name — just the picture. What do you think it is?",
  },
  {
    heading: "2. Take your guess.",
    body:
      "Type an animal name and hit \"Guess →\". Common names, scientific names, and close spellings all count — you don't need to nail the exact wording.",
  },
  {
    heading: "3. Get a clue either way.",
    body:
      "Right or wrong, each guess reveals a new clue — starting tricky, ending almost-a-giveaway. You get 3 guesses total.",
  },
  {
    heading: "4. See the reveal.",
    body:
      "Once you guess it — or run out of guesses — the full answer shows up, along with a fun fact and where the photo came from.",
  },
  {
    heading: "5. Share your result.",
    body:
      "Copy your result and send it to a friend. No spoilers — just your score.",
  },
  {
    heading: "Come back tomorrow",
    body:
      "for a brand new specimen. Miss a day and your streak resets, so try to make it a habit.",
  },
];
```

- [ ] **Step 2: Render the panel**

Immediately after the stats `</Modal>` added in Task 7:

```tsx
      <Modal
        title="How to Play"
        open={openPanel === "howto"}
        footer={`FIELD FILE #${puzzleNumber}`}
        onClose={() => setOpenPanel(null)}
      >
        {HOW_TO_PLAY.map((section) => (
          <div key={section.heading} style={styles.howtoSection}>
            <span style={styles.howtoHeading}>{section.heading}</span>{" "}
            <span style={styles.howtoBody}>{section.body}</span>
          </div>
        ))}
        <a href="/archive" style={styles.howtoLink}>
          Browse the Archive →
        </a>
      </Modal>
```

- [ ] **Step 3: Add the styles**

```typescript
  howtoSection: {
    marginBottom: 12,
    lineHeight: 1.5,
  },
  howtoHeading: {
    fontFamily: tokens.body,
    fontWeight: 700,
    fontSize: 14,
    color: tokens.ink,
  },
  howtoBody: {
    fontFamily: tokens.body,
    fontSize: 14,
    color: tokens.inkSoft,
  },
  howtoLink: {
    fontFamily: tokens.mono,
    fontSize: 12,
    color: tokens.coral,
    textDecoration: "none",
  },
```

- [ ] **Step 4: Commit**

```bash
git add framer/GameComponent.tsx
git commit -m "GameComponent: add How to Play panel"
```

---

### Task 9: Reveal-screen archive card

**Files:**
- Modify: `framer/GameComponent.tsx` (the `phase === "done"` reveal card block, and styles)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace the "come back tomorrow" line with the archive card**

In the reveal card, replace:

```tsx
              <div style={styles.comeback}>Come back tomorrow for a new specimen.</div>
```

with:

```tsx
              <a href="/archive" style={styles.archiveCard}>
                <span style={styles.archiveCardTitle}>
                  Missed a day? Play the Archive →
                </span>
                <span style={styles.archiveCardBody}>
                  Every specimen featured so far, still playable.
                </span>
              </a>
              <div style={styles.comeback}>Come back tomorrow for a new specimen.</div>
```

Per spec §7 this is the higher-intent of the two placements: the player has just finished and the next puzzle is up to 24 hours away.

- [ ] **Step 2: Add the styles**

```typescript
  archiveCard: {
    display: "block",
    background: tokens.paperCard,
    border: `1px solid ${tokens.line}`,
    borderRadius: 8,
    padding: "14px 16px",
    marginTop: 20,
    textDecoration: "none",
    textAlign: "left",
  },
  archiveCardTitle: {
    display: "block",
    fontFamily: tokens.body,
    fontWeight: 600,
    fontSize: 15,
    color: tokens.coral,
    marginBottom: 4,
  },
  archiveCardBody: {
    display: "block",
    fontFamily: tokens.body,
    fontSize: 13,
    color: tokens.inkSoft,
  },
```

- [ ] **Step 3: Commit**

```bash
git add framer/GameComponent.tsx
git commit -m "GameComponent: add archive card to the reveal screen"
```

---

### Task 10: Manual verification checklist

**Files:**
- Modify: `docs/framer-integration.md` (append to the manual verification checklist)

**Interfaces:**
- Consumes: everything from Tasks 4-9.
- Produces: the checklist that stands in for automated UI coverage.

- [ ] **Step 1: Append the new checks**

Add to the end of the "Manual verification checklist" section in `docs/framer-integration.md`:

```markdown
### Stats, panels, and archive CTA (added 2026-07-29)

- [ ] The 📊 icon opens the Statistics panel, and the four figures match
      the `history` array in DevTools → Application → Local Storage.
- [ ] **The panel is not clipped by its Framer container** — the backdrop
      covers the viewport, or the inline fallback from the plan's Task 5
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/framer-integration.md
git commit -m "docs: manual verification checklist for stats, panels, and CTA"
```

---

## Self-review notes

**Spec coverage.** §1 architecture → Tasks 2-4 (logic in `src/`, hand-synced into the component). §2 schema and migration → Task 1, re-inlined in Task 4. §3 derived stats and the streak behaviour change → Tasks 2-3. §4 icon bar and accessibility → Tasks 5-6. §5 generic modal and the fixed-positioning fallback → Task 5. §6 stats contents, highlight rule, all-zero and empty states → Task 7. §7 archive CTA in both placements → Tasks 6 and 9. §8 testing → Tasks 1-3 (unit) and Task 10 (manual). The rejected patterns and deferred items in the spec deliberately have no tasks.

**Known gap, accepted.** Spec §4 lists a ⚙️ Settings slot as a future addition; Task 6's `headerControls` flex row is where it goes, but no task adds it, matching the spec's "Deferred" section.

**Signature change to watch.** `getCurrentStreak(storage)` becomes `getCurrentStreak(storage, today)` in Task 3. `src/index.ts` and `docs/framer-integration.md` are the only consumers and both are updated in the same task; `grep -rn "getCurrentStreak" src scripts docs framer` should return nothing else.

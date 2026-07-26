# WhichAnimalToday Game Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the portable, dependency-free game-logic module (daily puzzle
selection, guess checking, share-card text, streak persistence, animal-data
validation) described in `docs/superpowers/specs/2026-07-26-whichanimaltoday-mvp-design.md`,
so it can be pasted into a Framer code override.

**Architecture:** Five small, independently testable TypeScript modules under
`src/`, each covering one responsibility from the spec, combined into a single
barrel export (`src/index.ts`). No runtime dependencies — this code has to be
portable into Framer's code-component editor, which cannot reliably resolve
arbitrary npm packages.

**Tech Stack:** Node.js, TypeScript, Vitest (dev-only test runner).

## Global Constraints

- Zero runtime (non-dev) npm dependencies in `src/` — must paste cleanly into
  a Framer code component. (Spec §1: "no external backend for the MVP.")
- All date logic operates on UTC calendar days, matching the spec's UTC
  midnight daily reset. (Spec §3.)
- 3 guesses total per puzzle; every guess (right or wrong) reveals the next
  hint. (Spec §3.)
- Share text format is exactly `WhichAnimalToday #<n> <emoji> <result>` where
  `<result>` is `<guessesUsed>/3` or `X/3`. (Spec §4.)
- Streaks and "already played today" state are per-browser only (no
  accounts), backed by an injectable storage interface so the module never
  imports `window`/`localStorage` directly — this keeps it unit-testable in
  Node and framework-agnostic for Framer. (Spec §4.)
- `AnimalRecord.category` must be one of: mammal, bird, reptile, fish,
  insect, amphibian, marine. (Spec §2, §5.)

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: a working `npm test` command that later tasks add tests to

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "whichanimaltoday-engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
dist/
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` created, no errors.

- [ ] **Step 5: Verify test runner works with zero tests**

Run: `npm test`
Expected: Vitest reports "No test files found" (non-zero exit is fine at
this step — there are no tests yet). If Vitest itself fails to start
(e.g. "command not found"), stop and fix the install before continuing.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore
git commit -m "chore: scaffold TypeScript + Vitest project"
```

---

### Task 2: Daily puzzle index

**Files:**
- Create: `src/puzzleIndex.ts`
- Test: `src/puzzleIndex.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `getTodayPuzzleIndex(today: Date, launchDate: Date, listLength: number): number`

- [ ] **Step 1: Write the failing test**

```typescript
// src/puzzleIndex.test.ts
import { describe, it, expect } from "vitest";
import { getTodayPuzzleIndex } from "./puzzleIndex";

describe("getTodayPuzzleIndex", () => {
  const launchDate = new Date("2026-08-01T00:00:00Z");

  it("returns 0 on the launch date itself", () => {
    expect(getTodayPuzzleIndex(launchDate, launchDate, 500)).toBe(0);
  });

  it("increments by 1 each following calendar day", () => {
    const dayAfter = new Date("2026-08-02T00:00:00Z");
    expect(getTodayPuzzleIndex(dayAfter, launchDate, 500)).toBe(1);
  });

  it("wraps around after the full list length", () => {
    const wrapDate = new Date("2026-08-01T00:00:00Z");
    wrapDate.setUTCDate(wrapDate.getUTCDate() + 500);
    expect(getTodayPuzzleIndex(wrapDate, launchDate, 500)).toBe(0);
  });

  it("is stable across different times on the same UTC calendar day", () => {
    const morning = new Date("2026-08-05T01:00:00Z");
    const night = new Date("2026-08-05T23:59:00Z");
    expect(getTodayPuzzleIndex(morning, launchDate, 500)).toBe(
      getTodayPuzzleIndex(night, launchDate, 500)
    );
  });

  it("handles dates before the launch date without a negative index", () => {
    const dayBefore = new Date("2026-07-31T00:00:00Z");
    expect(getTodayPuzzleIndex(dayBefore, launchDate, 500)).toBe(499);
  });

  it("throws when listLength is not positive", () => {
    expect(() => getTodayPuzzleIndex(launchDate, launchDate, 0)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/puzzleIndex.test.ts`
Expected: FAIL — `Cannot find module './puzzleIndex'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/puzzleIndex.ts
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcDayNumber(date: Date): number {
  const utcMidnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  return Math.floor(utcMidnight / MS_PER_DAY);
}

export function getTodayPuzzleIndex(
  today: Date,
  launchDate: Date,
  listLength: number
): number {
  if (listLength <= 0) {
    throw new Error("listLength must be greater than 0");
  }
  const daysSinceLaunch = utcDayNumber(today) - utcDayNumber(launchDate);
  return ((daysSinceLaunch % listLength) + listLength) % listLength;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/puzzleIndex.test.ts`
Expected: PASS (6/6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/puzzleIndex.ts src/puzzleIndex.test.ts
git commit -m "feat: add deterministic daily puzzle index"
```

---

### Task 3: Guess normalization and fuzzy matching

**Files:**
- Create: `src/guessChecker.ts`
- Test: `src/guessChecker.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `normalizeGuess(input: string): string`, `checkGuess(guess: string, commonName: string, aliases: string[]): boolean`

- [ ] **Step 1: Write the failing test**

```typescript
// src/guessChecker.test.ts
import { describe, it, expect } from "vitest";
import { normalizeGuess, checkGuess } from "./guessChecker";

describe("normalizeGuess", () => {
  it("lowercases, trims, and strips punctuation", () => {
    expect(normalizeGuess("  Elephant! ")).toBe("elephant");
  });
});

describe("checkGuess", () => {
  it("matches the exact common name, case-insensitively", () => {
    expect(checkGuess("Elephant", "Elephant", [])).toBe(true);
  });

  it("matches an alias", () => {
    expect(checkGuess("cougar", "Puma", ["cougar", "mountain lion"])).toBe(true);
  });

  it("matches simple plurals", () => {
    expect(checkGuess("elephants", "Elephant", [])).toBe(true);
  });

  it("tolerates a small typo on a longer word", () => {
    expect(checkGuess("elefant", "Elephant", [])).toBe(true);
  });

  it("tolerates a one-letter typo on a medium word", () => {
    expect(checkGuess("chetah", "Cheetah", [])).toBe(true);
  });

  it("rejects an unrelated word", () => {
    expect(checkGuess("dog", "Elephant", [])).toBe(false);
  });

  it("rejects a short word with a typo (tolerance is 0 for very short words)", () => {
    expect(checkGuess("bat", "Cat", [])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/guessChecker.test.ts`
Expected: FAIL — `Cannot find module './guessChecker'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/guessChecker.ts
export function normalizeGuess(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

function stripTrailingS(word: string): string {
  return word.endsWith("s") && word.length > 3 ? word.slice(0, -1) : word;
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    new Array(cols).fill(0)
  );

  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[rows - 1][cols - 1];
}

function fuzzyTolerance(word: string): number {
  if (word.length <= 4) return 0;
  if (word.length <= 7) return 1;
  return 2;
}

function namesMatch(guess: string, candidate: string): boolean {
  const normalizedGuess = stripTrailingS(normalizeGuess(guess));
  const normalizedCandidate = stripTrailingS(normalizeGuess(candidate));

  if (normalizedGuess === normalizedCandidate) return true;

  const distance = levenshteinDistance(normalizedGuess, normalizedCandidate);
  return distance <= fuzzyTolerance(normalizedCandidate);
}

export function checkGuess(
  guess: string,
  commonName: string,
  aliases: string[]
): boolean {
  const candidates = [commonName, ...aliases];
  return candidates.some((candidate) => namesMatch(guess, candidate));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/guessChecker.test.ts`
Expected: PASS (8/8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/guessChecker.ts src/guessChecker.test.ts
git commit -m "feat: add guess normalization and fuzzy matching"
```

---

### Task 4: Share card text

**Files:**
- Create: `src/shareCard.ts`
- Test: `src/shareCard.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `buildShareText(puzzleNumber: number, animalEmoji: string, guessesUsed: number | null): string`

- [ ] **Step 1: Write the failing test**

```typescript
// src/shareCard.test.ts
import { describe, it, expect } from "vitest";
import { buildShareText } from "./shareCard";

describe("buildShareText", () => {
  it("formats a solved result", () => {
    expect(buildShareText(12, "🦒", 2)).toBe("WhichAnimalToday #12 🦒 2/3");
  });

  it("formats a missed result as X/3", () => {
    expect(buildShareText(12, "🦒", null)).toBe("WhichAnimalToday #12 🦒 X/3");
  });

  it("formats a first-guess solve", () => {
    expect(buildShareText(1, "🐘", 1)).toBe("WhichAnimalToday #1 🐘 1/3");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shareCard.test.ts`
Expected: FAIL — `Cannot find module './shareCard'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/shareCard.ts
export function buildShareText(
  puzzleNumber: number,
  animalEmoji: string,
  guessesUsed: number | null
): string {
  const result = guessesUsed === null ? "X/3" : `${guessesUsed}/3`;
  return `WhichAnimalToday #${puzzleNumber} ${animalEmoji} ${result}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shareCard.test.ts`
Expected: PASS (3/3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shareCard.ts src/shareCard.test.ts
git commit -m "feat: add share card text builder"
```

---

### Task 5: Streak and "already played" persistence

**Files:**
- Create: `src/gameState.ts`
- Test: `src/gameState.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `StorageLike` interface, `DailyResult` type, `recordResult(storage, result): number`, `getLastResult(storage): DailyResult | null`, `getCurrentStreak(storage): number`, `hasPlayedToday(storage, today: string): boolean`

- [ ] **Step 1: Write the failing test**

```typescript
// src/gameState.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  recordResult,
  getLastResult,
  getCurrentStreak,
  hasPlayedToday,
  type StorageLike,
} from "./gameState";

function createFakeStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe("gameState", () => {
  let storage: StorageLike;

  beforeEach(() => {
    storage = createFakeStorage();
  });

  it("returns null/0 before anything has been recorded", () => {
    expect(getLastResult(storage)).toBeNull();
    expect(getCurrentStreak(storage)).toBe(0);
    expect(hasPlayedToday(storage, "2026-08-01")).toBe(false);
  });

  it("sets streak to 1 on the first solved result", () => {
    const streak = recordResult(storage, {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 2,
    });
    expect(streak).toBe(1);
    expect(hasPlayedToday(storage, "2026-08-01")).toBe(true);
  });

  it("increments streak on a solved result the next calendar day", () => {
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

  it("resets streak to 1 when a day is skipped", () => {
    recordResult(storage, {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 2,
    });
    const streak = recordResult(storage, {
      date: "2026-08-03",
      puzzleNumber: 3,
      solved: true,
      guessesUsed: 3,
    });
    expect(streak).toBe(1);
  });

  it("resets streak to 0 on a missed result", () => {
    recordResult(storage, {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 2,
    });
    const streak = recordResult(storage, {
      date: "2026-08-02",
      puzzleNumber: 2,
      solved: false,
      guessesUsed: 3,
    });
    expect(streak).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/gameState.test.ts`
Expected: FAIL — `Cannot find module './gameState'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/gameState.ts
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface DailyResult {
  date: string;
  puzzleNumber: number;
  solved: boolean;
  guessesUsed: number;
}

interface StoredState {
  lastResult: DailyResult | null;
  currentStreak: number;
}

const STORAGE_KEY = "whichanimaltoday_state";

function loadState(storage: StorageLike): StoredState {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return { lastResult: null, currentStreak: 0 };
  }
  return JSON.parse(raw) as StoredState;
}

function saveState(storage: StorageLike, state: StoredState): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function isNextCalendarDay(previousDate: string, currentDate: string): boolean {
  const previous = new Date(`${previousDate}T00:00:00Z`);
  const current = new Date(`${currentDate}T00:00:00Z`);
  const diffDays =
    (current.getTime() - previous.getTime()) / (24 * 60 * 60 * 1000);
  return diffDays === 1;
}

export function getLastResult(storage: StorageLike): DailyResult | null {
  return loadState(storage).lastResult;
}

export function getCurrentStreak(storage: StorageLike): number {
  return loadState(storage).currentStreak;
}

export function recordResult(storage: StorageLike, result: DailyResult): number {
  const state = loadState(storage);

  let newStreak: number;
  if (!result.solved) {
    newStreak = 0;
  } else if (
    state.lastResult &&
    state.lastResult.solved &&
    isNextCalendarDay(state.lastResult.date, result.date)
  ) {
    newStreak = state.currentStreak + 1;
  } else {
    newStreak = 1;
  }

  saveState(storage, { lastResult: result, currentStreak: newStreak });
  return newStreak;
}

export function hasPlayedToday(storage: StorageLike, today: string): boolean {
  const lastResult = getLastResult(storage);
  return lastResult !== null && lastResult.date === today;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/gameState.test.ts`
Expected: PASS (5/5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/gameState.ts src/gameState.test.ts
git commit -m "feat: add streak and already-played persistence"
```

---

### Task 6: Animal data types and validation

**Files:**
- Create: `src/animalData.ts`
- Test: `src/animalData.test.ts`
- Create: `data/animals.template.csv`

**Interfaces:**
- Consumes: nothing
- Produces: `AnimalRecord` type, `ALLOWED_CATEGORIES` constant, `validateAnimalData(records: AnimalRecord[]): string[]`

- [ ] **Step 1: Write the failing test**

```typescript
// src/animalData.test.ts
import { describe, it, expect } from "vitest";
import { validateAnimalData, type AnimalRecord } from "./animalData";

function makeValidRecord(overrides: Partial<AnimalRecord> = {}): AnimalRecord {
  return {
    commonName: "Elephant",
    aliases: [],
    hint1: "Found on multiple continents.",
    hint2: "Largest living land animal.",
    hint3: "Has the biggest ears of any animal.",
    funFacts: "Elephants can recognize themselves in mirrors.",
    category: "mammal",
    imageAttribution: "Wikimedia Commons, CC BY-SA 4.0",
    ...overrides,
  };
}

describe("validateAnimalData", () => {
  it("returns no errors for a fully valid list", () => {
    expect(validateAnimalData([makeValidRecord()])).toEqual([]);
  });

  it("flags an empty commonName", () => {
    const errors = validateAnimalData([makeValidRecord({ commonName: "" })]);
    expect(errors.some((e) => e.includes("commonName is empty"))).toBe(true);
  });

  it("flags a duplicate commonName", () => {
    const errors = validateAnimalData([makeValidRecord(), makeValidRecord()]);
    expect(errors.some((e) => e.includes("duplicate commonName"))).toBe(true);
  });

  it("flags a missing hint", () => {
    const errors = validateAnimalData([makeValidRecord({ hint2: "" })]);
    expect(errors.some((e) => e.includes("hint2 is empty"))).toBe(true);
  });

  it("flags an invalid category", () => {
    const errors = validateAnimalData([
      makeValidRecord({ category: "dinosaur" }),
    ]);
    expect(errors.some((e) => e.includes('category "dinosaur"'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/animalData.test.ts`
Expected: FAIL — `Cannot find module './animalData'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/animalData.ts
export interface AnimalRecord {
  commonName: string;
  aliases: string[];
  hint1: string;
  hint2: string;
  hint3: string;
  funFacts: string;
  category: string;
  imageAttribution: string;
}

export const ALLOWED_CATEGORIES = [
  "mammal",
  "bird",
  "reptile",
  "fish",
  "insect",
  "amphibian",
  "marine",
] as const;

export function validateAnimalData(records: AnimalRecord[]): string[] {
  const errors: string[] = [];
  const seenNames = new Set<string>();

  records.forEach((record, index) => {
    const label = `Row ${index + 1} (${record.commonName || "unnamed"})`;

    if (!record.commonName.trim()) {
      errors.push(`${label}: commonName is empty`);
    } else {
      const key = record.commonName.trim().toLowerCase();
      if (seenNames.has(key)) {
        errors.push(`${label}: duplicate commonName "${record.commonName}"`);
      }
      seenNames.add(key);
    }

    if (!record.hint1.trim()) errors.push(`${label}: hint1 is empty`);
    if (!record.hint2.trim()) errors.push(`${label}: hint2 is empty`);
    if (!record.hint3.trim()) errors.push(`${label}: hint3 is empty`);
    if (!record.funFacts.trim()) errors.push(`${label}: funFacts is empty`);
    if (!record.imageAttribution.trim())
      errors.push(`${label}: imageAttribution is empty`);

    if (
      !ALLOWED_CATEGORIES.includes(
        record.category as (typeof ALLOWED_CATEGORIES)[number]
      )
    ) {
      errors.push(
        `${label}: category "${record.category}" is not one of ${ALLOWED_CATEGORIES.join(", ")}`
      );
    }
  });

  return errors;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/animalData.test.ts`
Expected: PASS (5/5 tests).

- [ ] **Step 5: Create the starter data template**

```csv
commonName,aliases,hint1,hint2,hint3,funFacts,category,imageAttribution,imageFilename
Elephant,,Found on multiple continents.,Largest living land animal.,Has the biggest ears of any animal.,Elephants can recognize themselves in a mirror.,mammal,Wikimedia Commons - CC BY-SA 4.0,elephant.jpg
Axolotl,mexican walking fish,Never grows up in the usual sense.,Can regrow entire limbs and even parts of its brain.,Almost always seen with a permanent smile-like face.,Axolotls are critically endangered in the wild but common in captivity.,amphibian,Wikimedia Commons - CC BY-SA 4.0,axolotl.jpg
Cheetah,,Fastest land animal over short distances.,Can accelerate from 0 to 60 mph in about 3 seconds.,Has black "tear mark" streaks running from its eyes to its mouth.,Cheetahs cannot roar - they chirp and purr instead.,mammal,Wikimedia Commons - CC BY-SA 4.0,cheetah.jpg
```

Save this as `data/animals.template.csv`. This is a reference format, not
a full dataset — filling it out to 500 rows (finding open-license photos,
writing hints/facts for each) is manual curation work per spec §5, done in a
spreadsheet before entering rows into the Framer CMS collection. Once a
batch is drafted, convert it to a JSON array of `AnimalRecord` objects and
run it through `validateAnimalData` (Task 6's function) before importing
into Framer, to catch empty fields, duplicate names, or bad categories
early.

- [ ] **Step 6: Commit**

```bash
git add src/animalData.ts src/animalData.test.ts data/animals.template.csv
git commit -m "feat: add animal data model, validation, and starter template"
```

---

### Task 7: Public entry point and Framer integration guide

**Files:**
- Create: `src/index.ts`
- Create: `docs/framer-integration.md`

**Interfaces:**
- Consumes: everything from Tasks 2-6
- Produces: single barrel export for pasting into a Framer code component

- [ ] **Step 1: Create the barrel export**

```typescript
// src/index.ts
export { getTodayPuzzleIndex } from "./puzzleIndex";
export { checkGuess, normalizeGuess } from "./guessChecker";
export { buildShareText } from "./shareCard";
export {
  recordResult,
  getLastResult,
  getCurrentStreak,
  hasPlayedToday,
  type DailyResult,
  type StorageLike,
} from "./gameState";
export {
  validateAnimalData,
  ALLOWED_CATEGORIES,
  type AnimalRecord,
} from "./animalData";
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests from Tasks 2-6 pass (27 tests total).

- [ ] **Step 3: Write the Framer integration guide**

```markdown
<!-- docs/framer-integration.md -->
# Wiring the game engine into a Framer code component

This module (`src/index.ts` and its dependencies) is plain, dependency-free
TypeScript. To use it inside Framer:

1. Copy the contents of `src/puzzleIndex.ts`, `src/guessChecker.ts`,
   `src/shareCard.ts`, `src/gameState.ts`, and `src/animalData.ts` into a
   single Framer code file (Framer's code component editor does not reliably
   resolve local relative imports across multiple pasted files — a single
   combined file is the safe path). Keep `src/index.ts`'s export list as a
   reference for what to expose from that combined file.

2. Fetch today's CMS row. **Confirm the exact current API in Framer's own
   docs before wiring this** (Framer's CMS-in-code data-access hook/import
   changes between Framer versions, so treat this as a placeholder to
   confirm, not a copy-paste API call):
   - Get all rows from the animal CMS collection as an array shaped like
     `AnimalRecord[]` (plus an `image` field per spec §2).
   - Call `getTodayPuzzleIndex(new Date(), LAUNCH_DATE, allRows.length)` to
     get today's row index, where `LAUNCH_DATE` is a fixed `Date` constant
     set once on launch day and never changed.
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
```

- [ ] **Step 4: Commit**

```bash
git add src/index.ts docs/framer-integration.md
git commit -m "docs: add barrel export and Framer integration guide"
```

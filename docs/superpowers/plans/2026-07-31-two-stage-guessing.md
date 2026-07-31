# Two-Stage Guessing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a player names the animal, offer a one-shot four-option bonus round asking which specific species it was — additive only, never risking the streak.

**Architecture:** Two optional fields (`species`, `bonus`) on each animal record drive a new `"bonus"` phase between `"playing"` and `"done"` in the Framer component. All logic lives in `src/` with Vitest tests and is mirrored into `framer/GameComponent.tsx` by the existing codegen. Storage gains one optional field with **no schema version bump**.

**Tech Stack:** TypeScript, Vitest, React (Framer code component), Node 22, no new dependencies.

**Design doc:** `docs/superpowers/specs/2026-07-31-two-stage-guessing-design.md`

## Global Constraints

- **No new npm dependencies.** The Framer component is a single pasted file and cannot import anything.
- **`SCHEMA_VERSION` in `src/gameState.ts` stays `2`.** `loadState` treats an unrecognised version as `emptyState()`, so bumping it wipes every existing player's history.
- **After changing any file in `ENGINE_MODULE_PATHS`, run `npm run generate:framer`.** `npm test` and CI both fail when the generated block in `framer/GameComponent.tsx` is stale.
- **`data/animals.json` is production data.** The live game fetches it over HTTP from `master`. An invalid record there reaches players.
- **The bonus round has exactly 4 options and one shot.** No confirm button, no second attempt.
- **The bonus never affects `solved`, the streak, or the guess distribution.** Solving stage one is the win.
- **Emoji are exact:** `⭐` for a bonus hit, `⬜` for a bonus miss. Nothing appended when the day had no bonus round.
- **`npx tsc --noEmit` does not cover `framer/`.** A clean typecheck is silence, not confirmation, for the component.

---

### Task 1: Make `data/animals.json` the validated source of truth

The two-stage schema is nested (`bonus.options` is an array inside an object). `Animals.csv` is a flat Framer CMS export and cannot hold it. Worse, **two scripts currently overwrite `data/animals.json`** — `importAnimalsCsv.ts` from the CSV and `exportAnimals.ts` from the Framer CMS — so hand-added `species`/`bonus` fields would be silently destroyed by the next run of either.

This task adds a validator entry point that reads `data/animals.json` directly and wires it into CI, then documents both writers as legacy.

**Files:**
- Create: `scripts/validateAnimalsFile.ts`
- Modify: `package.json` (scripts block)
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/framer-integration.md`

**Interfaces:**
- Consumes: `validateAnimalData(records: AnimalRecord[]): string[]` from `src/animalData.ts`
- Produces: `npm run validate:animals` — exits 0 when clean, prints errors and exits 1 otherwise.

- [ ] **Step 1: Write the validator entry point**

Create `scripts/validateAnimalsFile.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateAnimalData, type AnimalRecord } from "../src/animalData";

const ANIMALS_PATH = fileURLToPath(
  new URL("../data/animals.json", import.meta.url)
);

function main(): void {
  const records: AnimalRecord[] = JSON.parse(
    readFileSync(ANIMALS_PATH, "utf-8")
  );

  const errors = validateAnimalData(records);
  if (errors.length > 0) {
    console.error(
      `data/animals.json has ${errors.length} validation ${
        errors.length === 1 ? "error" : "errors"
      }:\n`
    );
    errors.forEach((error) => console.error(`  - ${error}`));
    process.exit(1);
  }

  console.log(`data/animals.json: ${records.length} records, all valid.`);
}

main();
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add to `"scripts"`:

```json
"validate:animals": "tsx scripts/validateAnimalsFile.ts"
```

- [ ] **Step 3: Run it against the current data**

Run: `npm run validate:animals`
Expected: `data/animals.json: 34 records, all valid.` and exit code 0.

- [ ] **Step 4: Add the CI step**

In `.github/workflows/ci.yml`, inside the `check` job's `steps:`, after the existing `npm ci` step, add:

```yaml
      - name: Validate animal data
        run: npm run validate:animals
```

- [ ] **Step 5: Document both writers as legacy**

In `docs/framer-integration.md`, add this section:

```markdown
## The animal data source of truth

`data/animals.json` is edited directly and validated by
`npm run validate:animals`, which CI runs on every push.

Two scripts can overwrite that file and are **retired from the normal
workflow**. Both are kept only for historical reference; running either will
destroy the `species` and `bonus` fields, which their formats cannot
represent:

- `npm run import:animals` — rebuilds the file from `Animals.csv`, a Framer
  CMS export. Framer has deprecated CMS access from code components, so
  nothing feeds that CSV any more.
- `npm run export:animals` — rebuilds the file from the Framer CMS directly.

Do not run either without first confirming the file's current contents are
reproducible from the source you are importing.
```

- [ ] **Step 6: Verify the whole suite still passes**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add scripts/validateAnimalsFile.ts package.json .github/workflows/ci.yml docs/framer-integration.md
git commit -m "data: validate animals.json directly, retire the CSV and CMS writers"
```

---

### Task 2: Add `species` and `bonus` to the record schema

**Files:**
- Modify: `src/animalData.ts`
- Test: `src/animalData.test.ts`

**Interfaces:**
- Produces: `interface BonusRound { question: string; options: string[]; answerIndex: number }`, exported from `src/animalData.ts`. `AnimalRecord` gains optional `species?: string` and `bonus?: BonusRound`.

- [ ] **Step 1: Write the failing tests**

Append to `src/animalData.test.ts`. If the file has a helper that builds a valid record, use it; otherwise add this one at the top of the new block:

```ts
function validRecord(overrides: Partial<AnimalRecord> = {}): AnimalRecord {
  return {
    commonName: "Mole",
    aliases: ["Condylura cristata"],
    hint1: "h1",
    hint2: "h2",
    hint3: "h3",
    funFacts: "facts",
    category: "Mammal",
    imageUrl: "https://example.com/mole.jpg",
    imageAttribution: "Photo: Someone, CC BY-SA 4.0",
    ...overrides,
  };
}

const validBonus = {
  question: "You found a mole. But which one?",
  options: ["European Mole", "Eastern Mole", "Star-Nosed Mole", "Hairy-Tailed Mole"],
  answerIndex: 2,
};

describe("bonus round validation", () => {
  it("accepts a record with no bonus at all", () => {
    expect(validateAnimalData([validRecord()])).toEqual([]);
  });

  it("accepts a well-formed bonus round", () => {
    const record = validRecord({ species: "Star-Nosed Mole", bonus: validBonus });
    expect(validateAnimalData([record])).toEqual([]);
  });

  it("rejects a bonus with an empty question", () => {
    const record = validRecord({ bonus: { ...validBonus, question: "  " } });
    expect(validateAnimalData([record])).toContain(
      "Row 1 (Mole): bonus.question is empty"
    );
  });

  it("rejects a bonus that does not have exactly 4 options", () => {
    const record = validRecord({
      bonus: { ...validBonus, options: ["a", "b", "c"], answerIndex: 0 },
    });
    expect(validateAnimalData([record])).toContain(
      "Row 1 (Mole): bonus.options must have exactly 4 entries (got 3)"
    );
  });

  it("rejects an empty option", () => {
    const record = validRecord({
      bonus: { ...validBonus, options: ["European Mole", "  ", "Star-Nosed Mole", "Hairy-Tailed Mole"] },
    });
    expect(validateAnimalData([record])).toContain(
      "Row 1 (Mole): bonus.options contains an empty entry"
    );
  });

  it("rejects duplicate options, compared case-insensitively", () => {
    const record = validRecord({
      bonus: { ...validBonus, options: ["European Mole", "european mole", "Star-Nosed Mole", "Hairy-Tailed Mole"] },
    });
    expect(validateAnimalData([record])).toContain(
      'Row 1 (Mole): bonus.options contains duplicate "european mole"'
    );
  });

  it("rejects an answerIndex outside the options", () => {
    const record = validRecord({ bonus: { ...validBonus, answerIndex: 4 } });
    expect(validateAnimalData([record])).toContain(
      "Row 1 (Mole): bonus.answerIndex must be an integer within options (got 4)"
    );
  });

  it("rejects the species being listed as a decoy", () => {
    const record = validRecord({
      species: "Star-Nosed Mole",
      bonus: { ...validBonus, answerIndex: 0 },
    });
    expect(validateAnimalData([record])).toContain(
      'Row 1 (Mole): species "Star-Nosed Mole" is listed as a decoy at index 2, but answerIndex is 0'
    );
  });

  it("allows a fact-round bonus on a record that also has a species", () => {
    const record = validRecord({
      species: "Star-Nosed Mole",
      bonus: {
        question: "Which of these is true about me?",
        options: ["I glow", "I have 22 nose tentacles", "I fly", "I sing"],
        answerIndex: 1,
      },
    });
    expect(validateAnimalData([record])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/animalData.test.ts`
Expected: FAIL — TypeScript rejects `species`/`bonus` as unknown properties on `AnimalRecord`.

- [ ] **Step 3: Extend the types**

In `src/animalData.ts`, above `AnimalRecord`:

```ts
export interface BonusRound {
  question: string;
  /** Exactly 4, all distinct case-insensitively. Enforced by validateAnimalData. */
  options: string[];
  /** Index into `options`, 0-3. */
  answerIndex: number;
}
```

Then add to `AnimalRecord`, after `imageAttribution`:

```ts
  /** The specific species, when `commonName` is the broader family. Display only. */
  species?: string;
  bonus?: BonusRound;
```

- [ ] **Step 4: Implement the validation rules**

In `validateAnimalData`, inside the `records.forEach` callback, immediately before the closing `});`:

```ts
    const bonus = record.bonus;
    if (bonus !== undefined) {
      if (!bonus.question?.trim()) {
        errors.push(`${label}: bonus.question is empty`);
      }

      const options = Array.isArray(bonus.options) ? bonus.options : [];
      if (options.length !== 4) {
        errors.push(
          `${label}: bonus.options must have exactly 4 entries (got ${options.length})`
        );
      }
      if (options.some((option) => typeof option !== "string" || !option.trim())) {
        errors.push(`${label}: bonus.options contains an empty entry`);
      }

      // Case-insensitive: two options differing only in case are two correct
      // answers as far as a player is concerned.
      const seen = new Set<string>();
      for (const option of options) {
        const key = String(option).trim().toLowerCase();
        if (seen.has(key)) {
          errors.push(`${label}: bonus.options contains duplicate "${option}"`);
          break;
        }
        seen.add(key);
      }

      if (
        !Number.isInteger(bonus.answerIndex) ||
        bonus.answerIndex < 0 ||
        bonus.answerIndex >= options.length
      ) {
        errors.push(
          `${label}: bonus.answerIndex must be an integer within options (got ${bonus.answerIndex})`
        );
      }

      // The dangerous authoring slip: the true species listed as a decoy makes
      // the round unwinnable and the reveal card self-contradictory. Only
      // checked when the species actually appears among the options, so a
      // fact-round on an animal that happens to have a species is unaffected.
      const species = record.species?.trim();
      if (species) {
        const index = options.findIndex(
          (option) => String(option).trim().toLowerCase() === species.toLowerCase()
        );
        if (index !== -1 && index !== bonus.answerIndex) {
          errors.push(
            `${label}: species "${record.species}" is listed as a decoy at index ${index}, but answerIndex is ${bonus.answerIndex}`
          );
        }
      }
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/animalData.test.ts`
Expected: PASS.

- [ ] **Step 6: Export the new type**

In `src/index.ts`, change the `animalData` export block to:

```ts
export {
  validateAnimalData,
  ALLOWED_CATEGORIES,
  type AnimalRecord,
  type BonusRound,
} from "./animalData";
```

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/animalData.ts src/animalData.test.ts src/index.ts
git commit -m "animalData: add optional species and bonus round, with validation"
```

---

### Task 3: Deterministic bonus option shuffle

Without this, the correct answer sits wherever the author typed it and regulars start feeling the pattern. Seeded by puzzle number so every player sees the same order on the same day.

**Files:**
- Create: `src/bonusRound.ts`
- Test: `src/bonusRound.test.ts`
- Modify: `scripts/framerEngine.ts` (`ENGINE_MODULE_PATHS`)
- Modify: `src/index.ts`

**Interfaces:**
- Produces: `shuffleBonusOptions(options: string[], answerIndex: number, seed: number): ShuffledBonus` where `interface ShuffledBonus { options: string[]; answerIndex: number }`. Both exported from `src/bonusRound.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/bonusRound.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shuffleBonusOptions } from "./bonusRound";

const OPTIONS = ["European Mole", "Eastern Mole", "Star-Nosed Mole", "Hairy-Tailed Mole"];

describe("shuffleBonusOptions", () => {
  it("is deterministic for the same seed", () => {
    const a = shuffleBonusOptions(OPTIONS, 2, 34);
    const b = shuffleBonusOptions(OPTIONS, 2, 34);
    expect(a).toEqual(b);
  });

  it("keeps every option exactly once", () => {
    const result = shuffleBonusOptions(OPTIONS, 2, 34);
    expect([...result.options].sort()).toEqual([...OPTIONS].sort());
  });

  it("moves answerIndex to wherever the answer landed", () => {
    const result = shuffleBonusOptions(OPTIONS, 2, 34);
    expect(result.options[result.answerIndex]).toBe("Star-Nosed Mole");
  });

  it("does not mutate the input array", () => {
    const input = [...OPTIONS];
    shuffleBonusOptions(input, 2, 34);
    expect(input).toEqual(OPTIONS);
  });

  it("produces different orders for different seeds", () => {
    // Across 20 consecutive puzzle numbers the answer must not always land in
    // the same slot — that is the entire point of shuffling.
    const positions = new Set(
      Array.from({ length: 20 }, (_, seed) =>
        shuffleBonusOptions(OPTIONS, 2, seed).answerIndex
      )
    );
    expect(positions.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/bonusRound.test.ts`
Expected: FAIL — cannot resolve `./bonusRound`.

- [ ] **Step 3: Implement the module**

Create `src/bonusRound.ts`:

```ts
export interface ShuffledBonus {
  options: string[];
  answerIndex: number;
}

/**
 * mulberry32 — a small deterministic PRNG. Math.random cannot be used: every
 * player must see the same option order on the same day, or two people
 * comparing results are not talking about the same thing.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates over a copy, seeded by the puzzle number.
 *
 * Relies on options being distinct — `validateAnimalData` enforces that — so
 * `indexOf` finds the answer's new position unambiguously.
 */
export function shuffleBonusOptions(
  options: string[],
  answerIndex: number,
  seed: number
): ShuffledBonus {
  const answer = options[answerIndex];
  const shuffled = [...options];
  const random = seededRandom(seed);

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = swap;
  }

  return { options: shuffled, answerIndex: shuffled.indexOf(answer) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/bonusRound.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the module to the codegen list**

In `scripts/framerEngine.ts`, change `ENGINE_MODULE_PATHS` to:

```ts
export const ENGINE_MODULE_PATHS = [
  "src/puzzleIndex.ts",
  "src/guessChecker.ts",
  "src/bonusRound.ts",
  "src/shareCard.ts",
  "src/stats.ts",
  "src/gameState.ts",
] as const;
```

- [ ] **Step 6: Export from the index**

In `src/index.ts`, add:

```ts
export { shuffleBonusOptions, type ShuffledBonus } from "./bonusRound";
```

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: the engine-freshness test now FAILS, because `framer/GameComponent.tsx` does not yet contain the new module. That is correct and is fixed in Task 6. Every other test passes.

- [ ] **Step 8: Commit**

```bash
git add src/bonusRound.ts src/bonusRound.test.ts src/index.ts scripts/framerEngine.ts
git commit -m "bonusRound: deterministic seeded option shuffle"
```

---

### Task 4: Record the bonus outcome, and tally it in stats

**Files:**
- Modify: `src/gameState.ts`
- Modify: `src/stats.ts`
- Test: `src/gameState.test.ts`, `src/stats.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `DailyResult` gains `bonus?: "hit" | "miss"`. `Stats` gains `bonusRounds: number` and `bonusHits: number`.

- [ ] **Step 1: Write the failing tests**

Append to `src/stats.test.ts`. Use whatever helper the file already has for building a `DailyResult`; if there is none, define:

```ts
function result(
  date: string,
  solved: boolean,
  guessesUsed: number,
  bonus?: "hit" | "miss"
): DailyResult {
  return { date, puzzleNumber: 1, solved, guessesUsed, ...(bonus ? { bonus } : {}) };
}

describe("bonus tallies", () => {
  it("is zero when no entry has a bonus", () => {
    const stats = computeStats([result("2026-08-01", true, 2)], "2026-08-01");
    expect(stats.bonusRounds).toBe(0);
    expect(stats.bonusHits).toBe(0);
  });

  it("counts hits and misses as rounds played, hits separately", () => {
    const stats = computeStats(
      [
        result("2026-08-01", true, 2, "hit"),
        result("2026-08-02", true, 1, "miss"),
        result("2026-08-03", true, 3, "hit"),
        result("2026-08-04", true, 1),
      ],
      "2026-08-04"
    );
    expect(stats.bonusRounds).toBe(3);
    expect(stats.bonusHits).toBe(2);
  });

  it("ignores a bonus value that is neither hit nor miss", () => {
    // Reachable only through hand-edited storage, but it must not inflate
    // the tally or throw.
    const corrupt = { ...result("2026-08-01", true, 2), bonus: "banana" } as unknown as DailyResult;
    const stats = computeStats([corrupt], "2026-08-01");
    expect(stats.bonusRounds).toBe(0);
  });

  it("does not let the bonus affect wins, streak or distribution", () => {
    const stats = computeStats(
      [result("2026-08-01", true, 2, "miss"), result("2026-08-02", true, 2, "miss")],
      "2026-08-02"
    );
    expect(stats.wins).toBe(2);
    expect(stats.currentStreak).toBe(2);
    expect(stats.distribution).toEqual([0, 2, 0]);
  });
});
```

Append to `src/gameState.test.ts`:

```ts
describe("bonus persistence", () => {
  it("round-trips the bonus field through recordResult", () => {
    const storage = createMemoryStorage();
    recordResult(storage, {
      date: "2026-08-01",
      puzzleNumber: 1,
      solved: true,
      guessesUsed: 2,
      bonus: "hit",
    });
    expect(getHistory(storage)[0].bonus).toBe("hit");
  });

  it("loads pre-bonus v2 entries unchanged", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "whichanimaltoday_state",
      JSON.stringify({
        version: 2,
        history: [{ date: "2026-08-01", puzzleNumber: 1, solved: true, guessesUsed: 2 }],
      })
    );
    const history = getHistory(storage);
    expect(history).toHaveLength(1);
    expect(history[0].bonus).toBeUndefined();
  });
});
```

If `src/gameState.test.ts` has no `createMemoryStorage` helper, add:

```ts
function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/stats.test.ts src/gameState.test.ts`
Expected: FAIL — `bonusRounds` does not exist on `Stats`, and `bonus` is not a property of `DailyResult`.

- [ ] **Step 3: Add the storage field**

In `src/gameState.ts`, extend the interface:

```ts
export interface DailyResult {
  date: string;
  puzzleNumber: number;
  solved: boolean;
  guessesUsed: number;
  /**
   * Absent when the day offered no bonus round. Deliberately does NOT bump
   * SCHEMA_VERSION: `loadState` maps an unrecognised version to an empty
   * history, so a bump would wipe every existing player's stats. An optional
   * field is read correctly by the v2 loader, and a pre-bonus entry having no
   * value here is accurate rather than missing.
   */
  bonus?: "hit" | "miss";
}
```

Leave `SCHEMA_VERSION`, `isWellFormedEntry`, `loadState`, and `recordResult` untouched — `recordResult` stores the whole result object, so the field flows through with no change.

- [ ] **Step 4: Add the stats tally**

In `src/stats.ts`, extend the interface:

```ts
export interface Stats {
  played: number;
  wins: number;
  /** Integer 0-100. 0 when nothing has been played. */
  winPercent: number;
  currentStreak: number;
  maxStreak: number;
  /** Wins on guess 1, 2, and 3 respectively. */
  distribution: [number, number, number];
  /** Days that offered a bonus round and were played. */
  bonusRounds: number;
  /** Of those, the ones the player got right. */
  bonusHits: number;
}
```

In `computeStats`, after the `distribution` loop:

```ts
  // Only the two known values count, so a hand-edited storage value can
  // neither inflate the tally nor throw.
  let bonusRounds = 0;
  let bonusHits = 0;
  for (const entry of sorted) {
    if (entry.bonus === "hit") {
      bonusRounds += 1;
      bonusHits += 1;
    } else if (entry.bonus === "miss") {
      bonusRounds += 1;
    }
  }
```

And change the return statement to:

```ts
  return {
    played,
    wins,
    winPercent,
    currentStreak,
    maxStreak,
    distribution,
    bonusRounds,
    bonusHits,
  };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/stats.test.ts src/gameState.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/gameState.ts src/stats.ts src/gameState.test.ts src/stats.test.ts
git commit -m "gameState/stats: record and tally the bonus round outcome"
```

---

### Task 5: Show the bonus outcome in the share text

**Files:**
- Modify: `src/shareCard.ts`
- Test: `src/shareCard.test.ts`

**Interfaces:**
- Produces: `buildShareText(puzzleNumber: number, animalEmoji: string, guessesUsed: number | null, siteUrl?: string, bonus?: "hit" | "miss"): string`. The new parameter is trailing and optional, so every existing call site stays valid.

- [ ] **Step 1: Write the failing tests**

Append to `src/shareCard.test.ts`:

```ts
describe("bonus marker", () => {
  it("appends a star on a hit", () => {
    expect(buildShareText(34, "🐾", 2, undefined, "hit")).toBe(
      "WhichAnimalToday #34 🐾 2/3 ⭐"
    );
  });

  it("appends a white square on a miss", () => {
    expect(buildShareText(34, "🐾", 2, undefined, "miss")).toBe(
      "WhichAnimalToday #34 🐾 2/3 ⬜"
    );
  });

  it("appends nothing when the day had no bonus round", () => {
    expect(buildShareText(34, "🐾", 2)).toBe("WhichAnimalToday #34 🐾 2/3");
  });

  it("places the marker before the URL line", () => {
    expect(buildShareText(34, "🐾", 2, "https://whichanimaltoday.com", "hit")).toBe(
      "WhichAnimalToday #34 🐾 2/3 ⭐\nhttps://whichanimaltoday.com"
    );
  });

  it("still marks a loss with no bonus", () => {
    expect(buildShareText(34, "🐾", null)).toBe("WhichAnimalToday #34 🐾 X/3");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/shareCard.test.ts`
Expected: FAIL — the star is not appended.

- [ ] **Step 3: Implement**

Replace the body of `src/shareCard.ts`:

```ts
export function buildShareText(
  puzzleNumber: number,
  animalEmoji: string,
  guessesUsed: number | null,
  siteUrl?: string,
  bonus?: "hit" | "miss"
): string {
  const result = guessesUsed === null ? "X/3" : `${guessesUsed}/3`;

  // Misses are shown, not hidden. A bare score on a bonus day would be
  // ambiguous — no round today, or one they failed? — and the comparison
  // between a friend's ⭐ and your ⬜ is the thing that drives a click.
  const bonusMark = bonus === "hit" ? " ⭐" : bonus === "miss" ? " ⬜" : "";

  const scoreLine = `WhichAnimalToday #${puzzleNumber} ${animalEmoji} ${result}${bonusMark}`;

  // The URL is what makes a shared result findable — without it a recipient
  // has a score and no way to reach the game. Optional so the pre-launch
  // state (constant present but not yet set) doesn't append a blank line.
  const trimmedUrl = siteUrl?.trim();
  return trimmedUrl ? `${scoreLine}\n${trimmedUrl}` : scoreLine;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/shareCard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shareCard.ts src/shareCard.test.ts
git commit -m "shareCard: mark the bonus round result with a star or a blank"
```

---

### Task 6: Regenerate the Framer engine block

**Files:**
- Modify: `framer/GameComponent.tsx` (generated region only)

**Interfaces:**
- Consumes: every `src/` change from Tasks 3-5.
- Produces: `shuffleBonusOptions`, the updated `Stats` and `DailyResult` shapes, and the updated `buildShareText`, all available to the hand-written half of the component.

- [ ] **Step 1: Regenerate**

Run: `npm run generate:framer`
Expected: reports that `framer/GameComponent.tsx` was updated.

- [ ] **Step 2: Confirm the new module landed**

Run: `grep -c "shuffleBonusOptions" framer/GameComponent.tsx`
Expected: at least `1`.

- [ ] **Step 3: Confirm the block is now fresh**

Run: `npm run check:framer && npm test`
Expected: the check exits 0 and the full suite passes, including the engine-freshness test that failed at the end of Task 3.

- [ ] **Step 4: Commit**

```bash
git add framer/GameComponent.tsx
git commit -m "framer: regenerate the engine block with bonusRound"
```

---

### Task 7: The bonus phase in the component

This is the only task with no automated coverage — `framer/` is outside the tsconfig `include` and has no test harness. Work carefully and verify by hand in Task 10.

**Files:**
- Modify: `framer/GameComponent.tsx` (hand-written region only — never edit between the `BEGIN`/`END GENERATED ENGINE` markers)

**Interfaces:**
- Consumes: `shuffleBonusOptions`, `ShuffledBonus`, `recordResult`, `getStats`, `buildShareText` from the generated block.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Extend the local `Animal` type**

In the "Component-local types and helpers" section, replace the `Animal` interface with:

```ts
interface BonusRound {
  question: string;
  options: string[];
  answerIndex: number;
}

interface Animal {
  commonName: string;
  aliases: string[];
  imageUrl: string;
  hint1: string;
  hint2: string;
  hint3: string;
  funFacts: string;
  category: string;
  imageAttribution: string;
  species?: string;
  bonus?: BonusRound;
}
```

`BonusRound` is redeclared here rather than generated: `src/animalData.ts` is not in `ENGINE_MODULE_PATHS` because the component never needs `validateAnimalData` at runtime.

- [ ] **Step 2: Add the two new `Stats` fields to `EMPTY_STATS`**

```ts
const EMPTY_STATS: Stats = {
  played: 0,
  wins: 0,
  winPercent: 0,
  currentStreak: 0,
  maxStreak: 0,
  distribution: [0, 0, 0],
  bonusRounds: 0,
  bonusHits: 0,
};
```

- [ ] **Step 3: Add the phase and the new state**

Change the `GamePhase` type:

```ts
type GamePhase = "loading" | "error" | "playing" | "bonus" | "done";
```

Inside `GameComponent`, after the `const [shareCopied, setShareCopied] = useState(false);` line, add:

```ts
  const [bonusResult, setBonusResult] = useState<"hit" | "miss" | null>(null);
  const [bonusPick, setBonusPick] = useState<number | null>(null);
  // The guess count is known when the bonus round opens but is not written to
  // storage until the round finishes, so it has to be held across the phase.
  const [pendingGuessesUsed, setPendingGuessesUsed] = useState(0);
```

- [ ] **Step 4: Compute the shuffled options**

Add `useMemo` to the React import at the top of the file if it is not already there, then add this just above the `useEffect` that fetches the animals:

```ts
  const shuffledBonus = useMemo<ShuffledBonus | null>(() => {
    if (!animal?.bonus) return null;
    return shuffleBonusOptions(
      animal.bonus.options,
      animal.bonus.answerIndex,
      puzzleNumber
    );
  }, [animal, puzzleNumber]);
```

- [ ] **Step 5: Restore a completed bonus round on reload**

In the fetch `useEffect`, inside the `if (todayEntry) {` branch, add after `setSolved(todayEntry.solved);`:

```ts
          setBonusResult(todayEntry.bonus ?? null);
```

- [ ] **Step 6: Route a correct guess into the bonus phase**

Replace the `if (correct) {` branch of `submitGuess`:

```ts
    if (correct) {
      if (animal.bonus) {
        setGuessesLeft(3 - newGuessesUsed);
        setPendingGuessesUsed(newGuessesUsed);
        setMessage(null);
        setPhase("bonus");
      } else {
        finishGame(true, newGuessesUsed, null);
      }
    } else if (newGuessesUsed >= 3) {
      finishGame(false, newGuessesUsed, null);
    } else {
```

The bonus is offered **only on a win** — a player who used all three guesses is already being handed the answer on the reveal card.

- [ ] **Step 7: Take the bonus outcome in `finishGame`**

```ts
  function finishGame(
    didSolve: boolean,
    guessesUsed: number,
    bonus: "hit" | "miss" | null
  ) {
    const today = todayDateString();
    // src/'s recordResult returns just the streak number; the stats panel
    // needs every figure, so read the full set back rather than diverging
    // from the generated signature. With storage blocked this reads zeros —
    // see the codegen design doc's "Accepted behavioural change".
    recordResult(browserStorage, {
      date: today,
      puzzleNumber,
      solved: didSolve,
      guessesUsed,
      ...(bonus ? { bonus } : {}),
    });
    setBonusResult(bonus);
    setSolved(didSolve);
    setGuessesLeft(3 - guessesUsed);
    setStats(getStats(browserStorage, today));
    setMessage(null);
    setPhase("done");
  }
```

- [ ] **Step 8: Add the pick handler**

Directly below `finishGame`:

```ts
  function pickBonus(index: number) {
    // One shot: once a pick lands it is locked, and a second click does
    // nothing. There is deliberately no confirm step — the moment of
    // commitment is the whole mechanic.
    if (bonusPick !== null || !shuffledBonus) return;
    setBonusPick(index);
  }
```

- [ ] **Step 9: Pass the bonus into the share text**

```ts
  function getShareText(): string {
    if (!animal) return "";
    const emoji = CATEGORY_EMOJI[animal.category.toLowerCase()] ?? "🐾";
    return buildShareText(
      puzzleNumber,
      emoji,
      solved ? 3 - guessesLeft : null,
      SITE_URL,
      bonusResult ?? undefined
    );
  }
```

- [ ] **Step 10: Render the bonus round**

Immediately after the closing `)}` of the `{phase === "playing" && (` block, insert:

```tsx
          {phase === "bonus" && animal.bonus && shuffledBonus && (
            <div style={styles.bonusCard}>
              <div style={styles.bonusLabel}>── bonus round ──</div>
              <div style={styles.bonusQuestion}>{animal.bonus.question}</div>

              <div style={styles.bonusOptions}>
                {shuffledBonus.options.map((option, index) => {
                  const picked = bonusPick === index;
                  const isAnswer = index === shuffledBonus.answerIndex;
                  const settled = bonusPick !== null;
                  // After a pick, the right answer is always shown — a player
                  // who guessed wrong still learns the species.
                  const background = !settled
                    ? tokens.paper
                    : isAnswer
                      ? tokens.moss
                      : picked
                        ? tokens.coral
                        : tokens.paper;
                  return (
                    <button
                      key={option}
                      style={{ ...styles.bonusOption, background }}
                      disabled={settled}
                      onClick={() => pickBonus(index)}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>

              {bonusPick !== null && (
                <button
                  style={styles.guessButton}
                  onClick={() =>
                    finishGame(
                      true,
                      pendingGuessesUsed,
                      bonusPick === shuffledBonus.answerIndex ? "hit" : "miss"
                    )
                  }
                >
                  See the reveal →
                </button>
              )}
            </div>
          )}
```

The design doc describes "a beat, then the reveal card". This uses an explicit button rather than a timer: it needs no cleanup on unmount, and it lets a player read the answer at their own pace.

- [ ] **Step 11: Add the species line and bonus outcome to the reveal card**

Replace the two lines inside `styles.revealCard` that render the name and facts:

```tsx
              <div style={styles.revealName}>{animal.commonName}</div>
              {animal.species && (
                <div style={styles.revealSpecies}>
                  specifically, a {animal.species}
                </div>
              )}
              {bonusResult && (
                <div style={styles.revealBonus}>
                  {bonusResult === "hit"
                    ? "⭐ Bonus round — you got the species"
                    : "⬜ Bonus round — not that one"}
                </div>
              )}
              <div style={styles.revealFacts}>{animal.funFacts}</div>
```

- [ ] **Step 12: Add the stats line**

In `StatsPanel`, immediately before the closing `</>`:

```tsx
      {stats.bonusRounds > 0 && (
        <div style={styles.bonusTally}>
          Bonus rounds {stats.bonusHits}/{stats.bonusRounds}
        </div>
      )}
```

One line, deliberately. No bonus streak: the round was made streak-safe so it would not become a second thing to fail at, and a second streak counter would put that pressure straight back.

- [ ] **Step 13: Add the styles**

In the `styles` object, alongside the existing entries:

```ts
  bonusCard: {
    marginTop: 18,
    padding: "16px 14px",
    border: `1px dashed ${tokens.ink}`,
    borderRadius: 8,
  },
  bonusLabel: {
    textAlign: "center",
    letterSpacing: 2,
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 10,
  },
  bonusQuestion: {
    fontSize: 16,
    lineHeight: 1.4,
    marginBottom: 14,
    textAlign: "center",
  },
  bonusOptions: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 12,
  },
  bonusOption: {
    padding: "10px 12px",
    borderRadius: 6,
    border: `1px solid ${tokens.ink}`,
    font: "inherit",
    fontSize: 15,
    cursor: "pointer",
    textAlign: "left",
  },
  revealSpecies: {
    fontStyle: "italic",
    opacity: 0.8,
    marginTop: 2,
  },
  revealBonus: {
    marginTop: 8,
    fontSize: 14,
  },
  bonusTally: {
    marginTop: 14,
    fontSize: 14,
    textAlign: "center",
  },
```

If `tokens` has no `paper` key, use the same value the existing `styles.clueCard` uses for its background.

- [ ] **Step 14: Check for stale `finishGame` callers**

Run: `grep -n "finishGame(" framer/GameComponent.tsx`
Expected: exactly four occurrences — the declaration, two in `submitGuess`, one in the reveal button. Every call must pass three arguments.

- [ ] **Step 15: Commit**

```bash
git add framer/GameComponent.tsx
git commit -m "GameComponent: add the bonus round phase, reveal species, share the result"
```

---

### Task 8: Carry `species` into the archive

Without this the archive describes puzzle #34 as "Mole" and loses the half worth seeing.

**Files:**
- Modify: `scripts/archiveEntry.ts`
- Modify: `scripts/framerClient.ts` (`ArchivableAnimal`)
- Test: `scripts/archiveEntry.test.ts`

**Interfaces:**
- Produces: `ArchiveEntry` gains `species?: string`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/archiveEntry.test.ts`, following the existing tests' construction of the `animals` array:

```ts
it("carries species through to the archive entry", () => {
  const animals = [
    {
      commonName: "Mole",
      aliases: [],
      imageUrl: "https://example.com/mole.jpg",
      hint1: "h1",
      hint2: "h2",
      hint3: "h3",
      funFacts: "facts",
      category: "Mammal",
      imageAttribution: "Photo: Someone",
      species: "Star-Nosed Mole",
    },
  ];
  const entry = buildArchiveEntry(
    animals,
    new Date("2026-08-01T00:00:00Z"),
    new Date("2026-08-01T00:00:00Z")
  );
  expect(entry.species).toBe("Star-Nosed Mole");
});

it("omits species when the animal has none", () => {
  const animals = [
    {
      commonName: "Capybara",
      aliases: [],
      imageUrl: "https://example.com/capybara.jpg",
      hint1: "h1",
      hint2: "h2",
      hint3: "h3",
      funFacts: "facts",
      category: "Mammal",
      imageAttribution: "Photo: Someone",
    },
  ];
  const entry = buildArchiveEntry(
    animals,
    new Date("2026-08-01T00:00:00Z"),
    new Date("2026-08-01T00:00:00Z")
  );
  expect(entry.species).toBeUndefined();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/archiveEntry.test.ts`
Expected: FAIL — `species` is not a property of `ArchiveEntry`.

- [ ] **Step 3: Add the field to both interfaces**

In `scripts/framerClient.ts`, add to `ArchivableAnimal` after `imageAttribution`:

```ts
  species?: string;
```

In `scripts/archiveEntry.ts`, add to `ArchiveEntry` after `imageAttribution`:

```ts
  species?: string;
```

- [ ] **Step 4: Pass it through**

In `buildArchiveEntry`'s returned object, after `imageAttribution: animal.imageAttribution,`:

```ts
    ...(animal.species ? { species: animal.species } : {}),
```

Spread conditionally rather than assigning `undefined`, so `data/archive.json` gains no `"species": null` noise for animals without one.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run scripts/archiveEntry.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite and commit**

```bash
npm test
git add scripts/archiveEntry.ts scripts/framerClient.ts scripts/archiveEntry.test.ts
git commit -m "archive: carry species through to archive entries"
```

---

### Task 9: The content pass

**Files:**
- Modify: `data/animals.json`
- Test: `src/guessChecker.test.ts`
- Modify (only if JSON imports are not already enabled): `tsconfig.json`

**Interfaces:**
- Consumes: the schema from Task 2 and `npm run validate:animals` from Task 1.

This task is editorial. The validator is the correctness gate; taste is the owner's, so the output goes to them for review before merging.

- [ ] **Step 1: Split the seven species-level records**

For each of these, `commonName` becomes the family and `species` holds the specific name.

**Critically: the old `commonName` must be added to `aliases`.** The spec requires that typing `star-nosed mole` at stage one still solves the puzzle — the player who knew the exact answer gets the win *and* a free bonus round. Move it, do not drop it. Keep every existing alias, including the broad one added by the launch-day hotfix.

So the mole record's `aliases` goes from `["Condylura cristata", "mole"]` to `["Condylura cristata", "mole", "Star-Nosed Mole"]`, with `commonName: "Mole"` and `species: "Star-Nosed Mole"`.

| Current `commonName` | New `commonName` | New `species` |
|---|---|---|
| Star-Nosed Mole | Mole | Star-Nosed Mole |
| Emperor Penguin | Penguin | Emperor Penguin |
| Fennec Fox | Fox | Fennec Fox |
| Leopard Gecko | Gecko | Leopard Gecko |
| Hawksbill Sea Turtle | Sea Turtle | Hawksbill Sea Turtle |
| Monarch Butterfly | Butterfly | Monarch Butterfly |
| Sea Otter | Otter | Sea Otter |

**Do not apply this pattern anywhere else by search-and-replace.** `Red Panda` must NOT become `Panda` — a red panda is not a panda, and broadening it would make `panda` a winning guess for an animal that is not one. `Sea Otter` → `Otter` is the opposite call and is correct, because a sea otter genuinely is a species of otter. The two look identical to a find-and-replace.

- [ ] **Step 2: Write the species rounds**

Add a `bonus` to each record whose family has a real species split. The seven above, plus: `Chameleon`, `Sloth`, `Seahorse`, `Octopus`, `Flamingo`, `Hedgehog`, `Peacock`, `Toucan`, `Iguana`, `Puffin`, `Clownfish`.

Worked example — the full `bonus` for the mole record:

```json
"species": "Star-Nosed Mole",
"bonus": {
  "question": "You found a mole. But which one?",
  "options": [
    "European Mole",
    "Eastern Mole",
    "Star-Nosed Mole",
    "Hairy-Tailed Mole"
  ],
  "answerIndex": 2
}
```

Rules for decoys:

1. **All four must be real animals in the same family.** An invented species is a lie a player may look up.
2. **Decoys are better when more famous than the answer.** That is the mechanic: a player who merely knows moles exist gets no edge.
3. **The round must be beatable from the photograph.** Someone who looked closely and saw 22 pink tentacles should be able to reason to the star-nosed mole. If nothing in the image distinguishes the answer, write a fact round instead.
4. **Never place the species at a fixed index.** Task 3 shuffles by puzzle number regardless, but do not build in a pattern.

- [ ] **Step 3: Write the fact rounds**

For records with no honest species split — `Capybara`, `Narwhal`, `Axolotl`, `Platypus`, `Koala`, `Aardvark`, `Blobfish`, `Pangolin`, `Giraffe`, `Tarsier`, `Chinchilla`, `Red Panda`, `Jellyfish`, `Pufferfish`, `Ladybug`, `Dragonfly` — write one true statement against three plausible false ones. Set `species` only where a genuine specific name exists; a fact round does not require it.

Example shape:

```json
"bonus": {
  "question": "Which of these is true about me?",
  "options": [
    "My teeth never stop growing",
    "I can hold my breath for an hour",
    "I change colour to match my mood",
    "I have no bones at all"
  ],
  "answerIndex": 0
}
```

Draw the true option from the same research as that record's `funFacts`, and make the false ones specific rather than absurd — an obviously silly decoy is not a decoy.

- [ ] **Step 4: Validate**

Run: `npm run validate:animals`
Expected: `data/animals.json: 34 records, all valid.` Fix every reported error before continuing; the validator refuses records the live game would break on.

- [ ] **Step 5: Confirm the split records still accept both names**

Add a permanent test rather than a one-off command, since this is the exact defect that started the whole feature. Append to `src/guessChecker.test.ts`:

```ts
import animals from "../data/animals.json";

describe("the real animal data accepts both the family and the species", () => {
  const cases: [string, string][] = [
    ["Mole", "star-nosed mole"],
    ["Penguin", "emperor penguin"],
    ["Fox", "fennec fox"],
    ["Gecko", "leopard gecko"],
    ["Sea Turtle", "hawksbill sea turtle"],
    ["Butterfly", "monarch butterfly"],
    ["Otter", "sea otter"],
  ];

  it.each(cases)("%s accepts both its own name and %s", (family, species) => {
    const record = (animals as { commonName: string; aliases: string[] }[]).find(
      (r) => r.commonName === family
    );
    expect(record, `no record with commonName "${family}"`).toBeDefined();
    expect(checkGuess(family, record!.commonName, record!.aliases)).toBe(true);
    expect(checkGuess(species, record!.commonName, record!.aliases)).toBe(true);
  });
});
```

If `vitest.config.ts` or `tsconfig.json` does not already allow importing JSON, set `"resolveJsonModule": true` in `tsconfig.json`.

Run: `npx vitest run src/guessChecker.test.ts`
Expected: PASS, 7 cases. A failure means an alias was lost during the split.

- [ ] **Step 6: Hand to the owner for review**

Do not merge without it. Decoy selection is a taste judgement, and the owner's veto is the point of the review.

- [ ] **Step 7: Commit**

```bash
npm test
git add data/animals.json src/guessChecker.test.ts tsconfig.json
git commit -m "data: split family from species, add bonus rounds"
```

---

### Task 10: Verify and paste into Framer

**Files:**
- Modify: `docs/framer-integration.md` (checklist additions)
- Modify: `docs/follow-ups.md`

- [ ] **Step 1: Check for divergence before pasting**

The live component is a hand-pasted copy and Framer's own AI assistant edits it in place — that caused a real divergence on 2026-07-30 (see `docs/follow-ups.md`). Ask the owner what has changed Framer-side since launch, or have them search the Framer code editor for a string only the current repo version contains.

Resolve any divergence by pasting this repo's version in fresh and re-applying only genuine Framer-side fixes. Do not skip this.

- [ ] **Step 2: Run every gate**

Run: `npm test && npm run check:framer && npm run validate:animals && npx tsc --noEmit`
Expected: all four clean.

- [ ] **Step 3: Paste and verify by hand**

Paste `framer/GameComponent.tsx` into Framer, then walk this checklist on the published page:

1. Win on guess 1 on an animal with a bonus → the bonus round appears.
2. Pick the correct option → it turns green, the others stay neutral, "See the reveal →" appears.
3. Reveal shows the family name, the italic `specifically, a …` line, and `⭐ Bonus round — you got the species`.
4. Share text reads `WhichAnimalToday #N 🐾 1/3 ⭐` followed by the site URL.
5. Reload the page → the reveal still shows the bonus outcome, and the round does not reopen.
6. Repeat 1-5 picking a wrong option: red on the pick, green on the answer, `⬜` in the share text.
7. Lose all three guesses on a bonus animal → **no bonus round**, straight to the reveal, which still shows the species line.
8. Play an animal with no `bonus` field → no bonus round, reveal unchanged from today's behaviour.
9. Stats panel shows `Bonus rounds X/Y`, and the streak is unaffected by a miss.
10. Clicking an option twice registers only the first pick.

- [ ] **Step 4: Record what the manual pass cannot cover**

Append to `docs/follow-ups.md` under "Accessibility and polish":

```markdown
- **The bonus round has no automated coverage.** `shuffleBonusOptions` and the
  stats tally are unit-tested, but the phase transition, the one-shot lock,
  and the reload-restore path are verified only by the manual checklist in
  `docs/framer-integration.md`. Same gap as the rest of `framer/`.
- **A page refresh mid-bonus-round loses the round.** Nothing is written to
  storage until the player presses "See the reveal →", so a refresh during
  the bonus returns them to a fresh game for the day. Matches how an
  in-progress guessing phase already behaves; recorded so it is a known
  property rather than a surprise.
```

- [ ] **Step 5: Commit**

```bash
git add docs/framer-integration.md docs/follow-ups.md
git commit -m "docs: record the two-stage manual checklist and its gaps"
```

---

## Notes for the implementer

**Why the CSV goes first.** Task 1 looks like unrelated housekeeping. It is not: `npm run import:animals` rebuilds `data/animals.json` from a flat CSV that cannot represent `bonus.options`. Run it after Task 9 and the entire content pass is destroyed silently, with a clean exit code.

**Why `SCHEMA_VERSION` stays 2.** It is the single most destructive change available in this codebase. `loadState` maps an unrecognised version to `emptyState()`, so bumping it deletes the stats and streak of every player. The optional `bonus` field is invisible to the v2 loader, which is exactly what is wanted.

**Task ordering.** Tasks 2-5 are independent and can be done in any order; Task 6 must follow all of them; Task 7 must follow Task 6. Task 8 is independent of everything except Task 2. Task 9 needs Tasks 1 and 2. Task 10 is last.

**Expect one intentional red suite.** At the end of Task 3 the engine-freshness test fails by design, because `src/` has moved ahead of the generated block. Task 6 fixes it. Do not "fix" it by editing `framer/GameComponent.tsx` between the generated markers.

# WhichAnimalToday Archive Feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the daily archiving pipeline described in
`docs/superpowers/specs/2026-07-27-archive-page-design.md` — a scheduled
job that reads the "Animals" Framer collection via Framer's Server API and
appends one entry per day to a public `data/archive.json`, plus the
sibling script that exports the full animal list to `data/animals.json`
for the main game (per the corrected `docs/framer-integration.md`).

**Architecture:** Small, independently-testable Node/TypeScript modules
under `scripts/`, composed into two entry-point scripts
(`runDailyArchive.ts`, `exportAnimals.ts`) that a GitHub Actions cron
workflow runs. One genuinely external unknown exists — the exact shape of
Framer's `CollectionItem.fieldData` values — handled by writing a
defensive parser that accepts the two shapes real headless-CMS SDKs
commonly use, plus a manual verification step to catch anything else.

**Tech Stack:** Node.js, TypeScript, Vitest (existing), `framer-api` npm
package (Framer's Server API client), `tsx` (TypeScript script runner),
GitHub Actions.

## Global Constraints

- `FRAMER_API_KEY` and `FRAMER_PROJECT_URL` are read only from environment
  variables (local `.env`, gitignored, or GitHub Actions secrets) — never
  hardcoded, never written into any file under `src/` (which is what gets
  pasted into Framer's client-side code component). (Spec §1, security
  framing.)
- All new date logic reuses the existing UTC-day math already tested in
  `src/puzzleIndex.ts` rather than re-implementing it. (DRY.)
- `data/archive.json` gains exactly one entry per calendar day, and the
  append is idempotent (re-running the job the same day is a no-op).
  (Spec §2, step 4.)
- Every entry in `data/archive.json` matches the exact field shape in
  spec §3: `puzzleNumber`, `date`, `slug`, `commonName`, `imageUrl`,
  `funFacts`, `category`, `imageAttribution`.
- `data/archive.json` and `data/animals.json` are the *only* two files
  used to hand data into Framer — both fetched by Framer code components
  via plain external `fetch()`, never through Framer's own CMS-in-code
  access (confirmed unsupported).

---

### Task 1: Defensive field-value readers

**Files:**
- Create: `scripts/fieldValue.ts`
- Test: `scripts/fieldValue.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `readTextField(fieldData: Record<string, unknown>, fieldName: string): string`, `readImageField(fieldData: Record<string, unknown>, fieldName: string): string`

Framer's own reference docs confirm a `CollectionItem` has a `fieldData`
property ("the fields and corresponding values of the Collection item")
but don't document the exact per-field-type shape. These readers accept
the two shapes real headless-CMS SDKs commonly use (a plain value, or a
`{ value: ... }` wrapper), so the rest of this plan doesn't have to guess.

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/fieldValue.test.ts
import { describe, it, expect } from "vitest";
import { readTextField, readImageField } from "./fieldValue";

describe("readTextField", () => {
  it("reads a plain string value", () => {
    expect(readTextField({ commonName: "Giraffe" }, "commonName")).toBe(
      "Giraffe"
    );
  });

  it("reads a wrapped { value } string", () => {
    expect(
      readTextField({ commonName: { value: "Giraffe" } }, "commonName")
    ).toBe("Giraffe");
  });

  it("throws on an unrecognized shape", () => {
    expect(() => readTextField({ commonName: 42 }, "commonName")).toThrow(
      /not a recognized text field/
    );
  });

  it("throws when the field is missing", () => {
    expect(() => readTextField({}, "commonName")).toThrow(
      /not a recognized text field/
    );
  });
});

describe("readImageField", () => {
  it("reads a plain string URL", () => {
    expect(readImageField({ image: "https://x/y.jpg" }, "image")).toBe(
      "https://x/y.jpg"
    );
  });

  it("reads a { url } object", () => {
    expect(
      readImageField({ image: { url: "https://x/y.jpg" } }, "image")
    ).toBe("https://x/y.jpg");
  });

  it("reads a wrapped { value: { url } } object", () => {
    expect(
      readImageField(
        { image: { value: { url: "https://x/y.jpg" } } },
        "image"
      )
    ).toBe("https://x/y.jpg");
  });

  it("throws on an unrecognized shape", () => {
    expect(() => readImageField({ image: 42 }, "image")).toThrow(
      /not a recognized image field/
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/fieldValue.test.ts`
Expected: FAIL — `Cannot find module './fieldValue'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// scripts/fieldValue.ts
function hasStringValue(raw: unknown): raw is { value: string } {
  return (
    typeof raw === "object" &&
    raw !== null &&
    "value" in raw &&
    typeof (raw as { value: unknown }).value === "string"
  );
}

export function readTextField(
  fieldData: Record<string, unknown>,
  fieldName: string
): string {
  const raw = fieldData[fieldName];
  if (typeof raw === "string") return raw;
  if (hasStringValue(raw)) return raw.value;
  throw new Error(
    `Field "${fieldName}" is not a recognized text field shape: ${JSON.stringify(raw)}`
  );
}

function hasUrlProperty(raw: unknown): raw is { url: string } {
  return (
    typeof raw === "object" &&
    raw !== null &&
    "url" in raw &&
    typeof (raw as { url: unknown }).url === "string"
  );
}

function hasWrappedUrlValue(raw: unknown): raw is { value: { url: string } } {
  return (
    typeof raw === "object" &&
    raw !== null &&
    "value" in raw &&
    hasUrlProperty((raw as { value: unknown }).value)
  );
}

export function readImageField(
  fieldData: Record<string, unknown>,
  fieldName: string
): string {
  const raw = fieldData[fieldName];
  if (typeof raw === "string") return raw;
  if (hasUrlProperty(raw)) return raw.url;
  if (hasWrappedUrlValue(raw)) return raw.value.url;
  throw new Error(
    `Field "${fieldName}" is not a recognized image field shape: ${JSON.stringify(raw)}`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/fieldValue.test.ts`
Expected: PASS (8/8 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/fieldValue.ts scripts/fieldValue.test.ts
git commit -m "feat: add defensive Framer field-value readers"
```

---

### Task 2: Framer Server API client

**Files:**
- Create: `scripts/framerClient.ts`
- Test: `scripts/framerClient.test.ts`
- Modify: `package.json` (add `framer-api` and `tsx` dependencies)
- Create: `.env.example`
- Modify: `.gitignore` (add `.env`)

**Interfaces:**
- Consumes: `readTextField`, `readImageField` from Task 1
- Produces: `ArchivableAnimal` type, `mapFieldDataToAnimal(fieldData: Record<string, unknown>): ArchivableAnimal`, `fetchAnimalsFromFramer(projectUrl: string, apiKey: string, collectionName: string): Promise<ArchivableAnimal[]>`

`mapFieldDataToAnimal` and `remapFieldDataByName` are pure and fully
unit-tested here. `fetchAnimalsFromFramer` calls Framer's real Server API
and cannot be unit-tested without a live Framer project, so it gets a
manual verification step instead.

**Correction after inspecting the installed package's real type
definitions** (`node_modules/framer-api/dist/index.d.ts` — more reliable
than the web docs consulted earlier): `CollectionItem.fieldData` is keyed
by **field ID**, not field name — e.g. `fieldData["a1b2c3"]`, not
`fieldData["commonName"]`. Getting name-keyed data requires a separate
`collection.getFields()` call (each `Field` has `.id` and `.name`) to
build an ID-to-name lookup first. Confirmed exact shapes from the same
file: a text field entry is `{ type: "string", value: string, ... }`;
an image field entry is `{ type: "image", value: { url: string,
thumbnailUrl: string, ... } | undefined }`. Both match the `{ value:
... }` wrapped shape Task 1's readers already handle, so no change is
needed there — only `fetchAnimalsFromFramer` needs the extra
`getFields()` step and a new `remapFieldDataByName` function.

- [ ] **Step 1: Add dependencies**

Replace the full contents of `package.json` with:

```json
{
  "name": "whichanimaltoday-engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "framer-api": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vitest": "^2.0.5",
    "tsx": "^4.16.2"
  }
}
```

Run: `npm install`
Expected: `framer-api` and `tsx` added under `node_modules`, no errors.
(If `framer-api`'s published version differs from `^1.0.0`, install
whatever `npm view framer-api version` reports and use that instead —
this pin is not load-bearing, any current version works.)

- [ ] **Step 2: Add `.env.example` and gitignore `.env`**

```
# scripts/framerClient.ts and the daily job read these at runtime.
# Copy to .env for local runs; never commit the real .env.
FRAMER_PROJECT_URL=https://framer.com/projects/<your-project-id>
FRAMER_API_KEY=<generate in Framer Site Settings>
```

Save as `.env.example`. Then add a line to `.gitignore`:

```
node_modules/
dist/
.env
```

- [ ] **Step 3: Write the failing test for the pure functions**

```typescript
// scripts/framerClient.test.ts
import { describe, it, expect } from "vitest";
import { mapFieldDataToAnimal, remapFieldDataByName } from "./framerClient";

describe("mapFieldDataToAnimal", () => {
  it("maps a plain-value fieldData object", () => {
    const result = mapFieldDataToAnimal({
      commonName: "Giraffe",
      image: "https://example.com/giraffe.jpg",
      funFacts: "Giraffes only need 30 minutes of sleep a day.",
      category: "mammal",
      imageAttribution: "Wikimedia Commons - CC BY-SA 4.0",
    });

    expect(result).toEqual({
      commonName: "Giraffe",
      imageUrl: "https://example.com/giraffe.jpg",
      funFacts: "Giraffes only need 30 minutes of sleep a day.",
      category: "mammal",
      imageAttribution: "Wikimedia Commons - CC BY-SA 4.0",
    });
  });

  it("maps Framer's real field-entry shape ({ type, value })", () => {
    const result = mapFieldDataToAnimal({
      commonName: { type: "string", value: "Giraffe" },
      image: { type: "image", value: { url: "https://example.com/giraffe.jpg" } },
      funFacts: { type: "string", value: "Giraffes only need 30 minutes of sleep a day." },
      category: { type: "string", value: "mammal" },
      imageAttribution: { type: "string", value: "Wikimedia Commons - CC BY-SA 4.0" },
    });

    expect(result.commonName).toBe("Giraffe");
    expect(result.imageUrl).toBe("https://example.com/giraffe.jpg");
  });
});

describe("remapFieldDataByName", () => {
  it("re-keys ID-keyed field data to name-keyed field data", () => {
    const fields = [
      { id: "f1", name: "commonName" },
      { id: "f2", name: "image" },
    ];
    const fieldData = {
      f1: { type: "string", value: "Giraffe" },
      f2: { type: "image", value: { url: "https://example.com/giraffe.jpg" } },
    };

    expect(remapFieldDataByName(fieldData, fields)).toEqual({
      commonName: { type: "string", value: "Giraffe" },
      image: { type: "image", value: { url: "https://example.com/giraffe.jpg" } },
    });
  });

  it("ignores fields with no matching data", () => {
    const fields = [{ id: "f1", name: "commonName" }];
    expect(remapFieldDataByName({}, fields)).toEqual({});
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run scripts/framerClient.test.ts`
Expected: FAIL — `Cannot find module './framerClient'`.

- [ ] **Step 5: Write the implementation**

```typescript
// scripts/framerClient.ts
import { connect } from "framer-api";
import { readTextField, readImageField } from "./fieldValue";

export interface ArchivableAnimal {
  commonName: string;
  imageUrl: string;
  funFacts: string;
  category: string;
  imageAttribution: string;
}

export function mapFieldDataToAnimal(
  fieldData: Record<string, unknown>
): ArchivableAnimal {
  return {
    commonName: readTextField(fieldData, "commonName"),
    imageUrl: readImageField(fieldData, "image"),
    funFacts: readTextField(fieldData, "funFacts"),
    category: readTextField(fieldData, "category"),
    imageAttribution: readTextField(fieldData, "imageAttribution"),
  };
}

export interface FramerField {
  id: string;
  name: string;
}

export function remapFieldDataByName(
  fieldData: Record<string, unknown>,
  fields: FramerField[]
): Record<string, unknown> {
  const byName: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.id in fieldData) {
      byName[field.name] = fieldData[field.id];
    }
  }
  return byName;
}

interface FramerCollection {
  name: string;
  getFields(): Promise<FramerField[]>;
  getItems(): Promise<Array<{ fieldData: Record<string, unknown> }>>;
}

interface FramerConnection {
  getCollections(): Promise<FramerCollection[]>;
}

export async function fetchAnimalsFromFramer(
  projectUrl: string,
  apiKey: string,
  collectionName: string
): Promise<ArchivableAnimal[]> {
  const framer = (await connect(projectUrl, apiKey)) as FramerConnection;
  const collections = await framer.getCollections();
  const collection = collections.find((c) => c.name === collectionName);

  if (!collection) {
    throw new Error(
      `Collection "${collectionName}" not found in this Framer project`
    );
  }

  const fields = await collection.getFields();
  const items = await collection.getItems();

  return items.map((item) => {
    const namedFieldData = remapFieldDataByName(item.fieldData, fields);
    return mapFieldDataToAnimal(namedFieldData);
  });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run scripts/framerClient.test.ts`
Expected: PASS (4/4 tests).

- [ ] **Step 7: Manually verify the live Framer connection**

This step needs a real Framer project with the "Animals" collection and
at least one row, plus an API key from that project's Site Settings.

Create a throwaway file `scripts/_manualCheck.ts`:

```typescript
// scripts/_manualCheck.ts — throwaway, not committed
import { fetchAnimalsFromFramer } from "./framerClient";

const animals = await fetchAnimalsFromFramer(
  process.env.FRAMER_PROJECT_URL!,
  process.env.FRAMER_API_KEY!,
  "Animals"
);
console.log(JSON.stringify(animals, null, 2));
```

Run: `npx tsx scripts/_manualCheck.ts` (with `.env` populated, loaded via
`node --env-file=.env` prefix or a `dotenv` import — either is fine for
this one-off check).

Expected: prints an array of `ArchivableAnimal` objects matching the real
collection's rows. If it throws `Collection "Animals" not found`, log
`collections` directly (`console.log(collections)`) to see the real
identifying property Framer returns and adjust the `c.name ===` filter
in Task 2 Step 5 to match. If field values print as `undefined`, the raw
row's `fieldData` shape didn't match either pattern in Task 1 — log one
raw item's `fieldData` and extend `readTextField`/`readImageField` with
the shape actually observed.

Delete `scripts/_manualCheck.ts` once this checks out — it's a scratch
file, not part of the shipped scripts.

- [ ] **Step 8: Commit**

```bash
git add scripts/framerClient.ts scripts/framerClient.test.ts package.json package-lock.json .env.example .gitignore
git commit -m "feat: add Framer Server API client and animal field mapper"
```

---

### Task 3: Expose day-count math from the puzzle index module

**Files:**
- Modify: `src/puzzleIndex.ts`
- Modify: `src/puzzleIndex.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `getDaysSinceLaunch(today: Date, launchDate: Date): number` (in addition to the existing `getTodayPuzzleIndex`)

The archive job needs the same UTC-day counting the game already uses,
to compute `puzzleNumber`. Exporting it here avoids re-implementing UTC
date math a second time.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `src/puzzleIndex.test.ts` with:

```typescript
// src/puzzleIndex.test.ts
import { describe, it, expect } from "vitest";
import { getTodayPuzzleIndex, getDaysSinceLaunch } from "./puzzleIndex";

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

describe("getDaysSinceLaunch", () => {
  const launchDate = new Date("2026-08-01T00:00:00Z");

  it("returns 0 on the launch date itself", () => {
    expect(getDaysSinceLaunch(launchDate, launchDate)).toBe(0);
  });

  it("returns 1 the day after launch", () => {
    expect(
      getDaysSinceLaunch(new Date("2026-08-02T00:00:00Z"), launchDate)
    ).toBe(1);
  });

  it("returns a negative number before launch", () => {
    expect(
      getDaysSinceLaunch(new Date("2026-07-31T00:00:00Z"), launchDate)
    ).toBe(-1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/puzzleIndex.test.ts`
Expected: FAIL — `getDaysSinceLaunch is not a function` (or similar), 3
new failures, existing 6 tests still passing.

- [ ] **Step 3: Update the implementation**

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

export function getDaysSinceLaunch(today: Date, launchDate: Date): number {
  return utcDayNumber(today) - utcDayNumber(launchDate);
}

export function getTodayPuzzleIndex(
  today: Date,
  launchDate: Date,
  listLength: number
): number {
  if (listLength <= 0) {
    throw new Error("listLength must be greater than 0");
  }
  const daysSinceLaunch = getDaysSinceLaunch(today, launchDate);
  return ((daysSinceLaunch % listLength) + listLength) % listLength;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/puzzleIndex.test.ts`
Expected: PASS (9/9 tests — the original 6 plus 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/puzzleIndex.ts src/puzzleIndex.test.ts
git commit -m "feat: expose getDaysSinceLaunch from the puzzle index module"
```

---

### Task 4: Date utilities for the archive job

**Files:**
- Create: `scripts/dateUtils.ts`
- Test: `scripts/dateUtils.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `formatUtcDate(date: Date): string`, `getPreviousUtcDay(date: Date): Date`

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/dateUtils.test.ts
import { describe, it, expect } from "vitest";
import { formatUtcDate, getPreviousUtcDay } from "./dateUtils";

describe("formatUtcDate", () => {
  it("formats as YYYY-MM-DD", () => {
    expect(formatUtcDate(new Date("2026-08-05T13:45:00Z"))).toBe(
      "2026-08-05"
    );
  });

  it("pads single-digit months and days", () => {
    expect(formatUtcDate(new Date("2026-01-02T00:00:00Z"))).toBe(
      "2026-01-02"
    );
  });
});

describe("getPreviousUtcDay", () => {
  it("returns the prior calendar day", () => {
    const result = getPreviousUtcDay(new Date("2026-08-05T10:00:00Z"));
    expect(formatUtcDate(result)).toBe("2026-08-04");
  });

  it("crosses a month boundary", () => {
    const result = getPreviousUtcDay(new Date("2026-08-01T00:00:00Z"));
    expect(formatUtcDate(result)).toBe("2026-07-31");
  });

  it("crosses a year boundary", () => {
    const result = getPreviousUtcDay(new Date("2027-01-01T00:00:00Z"));
    expect(formatUtcDate(result)).toBe("2026-12-31");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/dateUtils.test.ts`
Expected: FAIL — `Cannot find module './dateUtils'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// scripts/dateUtils.ts
export function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getPreviousUtcDay(date: Date): Date {
  const previous = new Date(date.getTime());
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/dateUtils.test.ts`
Expected: PASS (5/5 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/dateUtils.ts scripts/dateUtils.test.ts
git commit -m "feat: add UTC date utilities for the archive job"
```

---

### Task 5: Slug builder

**Files:**
- Create: `scripts/slug.ts`
- Test: `scripts/slug.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `buildSlug(commonName: string, puzzleNumber: number): string`

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/slug.test.ts
import { describe, it, expect } from "vitest";
import { buildSlug } from "./slug";

describe("buildSlug", () => {
  it("lowercases a single-word name", () => {
    expect(buildSlug("Giraffe", 12)).toBe("giraffe-12");
  });

  it("hyphenates multi-word names", () => {
    expect(buildSlug("Mountain Lion", 45)).toBe("mountain-lion-45");
  });

  it("strips punctuation", () => {
    expect(buildSlug("Pauline's Frog", 7)).toBe("paulines-frog-7");
  });

  it("collapses extra whitespace", () => {
    expect(buildSlug("  Red   Panda  ", 3)).toBe("red-panda-3");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/slug.test.ts`
Expected: FAIL — `Cannot find module './slug'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// scripts/slug.ts
export function buildSlug(commonName: string, puzzleNumber: number): string {
  const kebabName = commonName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
  return `${kebabName}-${puzzleNumber}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/slug.test.ts`
Expected: PASS (4/4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/slug.ts scripts/slug.test.ts
git commit -m "feat: add archive slug builder"
```

---

### Task 6: Archive entry builder

**Files:**
- Create: `scripts/archiveEntry.ts`
- Test: `scripts/archiveEntry.test.ts`

**Interfaces:**
- Consumes: `getTodayPuzzleIndex`, `getDaysSinceLaunch` from `src/puzzleIndex.ts` (Task 3); `buildSlug` from Task 5; `formatUtcDate` from Task 4; `ArchivableAnimal` type from Task 2
- Produces: `ArchiveEntry` type, `buildArchiveEntry(animals: ArchivableAnimal[], dayToArchive: Date, launchDate: Date): ArchiveEntry`

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/archiveEntry.test.ts
import { describe, it, expect } from "vitest";
import { buildArchiveEntry } from "./archiveEntry";
import type { ArchivableAnimal } from "./framerClient";

const animals: ArchivableAnimal[] = [
  {
    commonName: "Elephant",
    imageUrl: "https://example.com/elephant.jpg",
    funFacts: "Elephants can recognize themselves in a mirror.",
    category: "mammal",
    imageAttribution: "Wikimedia Commons - CC BY-SA 4.0",
  },
  {
    commonName: "Axolotl",
    imageUrl: "https://example.com/axolotl.jpg",
    funFacts: "Axolotls can regrow entire limbs.",
    category: "amphibian",
    imageAttribution: "Wikimedia Commons - CC BY-SA 4.0",
  },
];

describe("buildArchiveEntry", () => {
  const launchDate = new Date("2026-08-01T00:00:00Z");

  it("builds puzzle #1 for the launch date", () => {
    const entry = buildArchiveEntry(animals, launchDate, launchDate);
    expect(entry).toEqual({
      puzzleNumber: 1,
      date: "2026-08-01",
      slug: "elephant-1",
      commonName: "Elephant",
      imageUrl: "https://example.com/elephant.jpg",
      funFacts: "Elephants can recognize themselves in a mirror.",
      category: "mammal",
      imageAttribution: "Wikimedia Commons - CC BY-SA 4.0",
    });
  });

  it("builds puzzle #2 for the next day, wrapping to the next animal", () => {
    const dayTwo = new Date("2026-08-02T00:00:00Z");
    const entry = buildArchiveEntry(animals, dayTwo, launchDate);
    expect(entry.puzzleNumber).toBe(2);
    expect(entry.date).toBe("2026-08-02");
    expect(entry.commonName).toBe("Axolotl");
    expect(entry.slug).toBe("axolotl-2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/archiveEntry.test.ts`
Expected: FAIL — `Cannot find module './archiveEntry'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// scripts/archiveEntry.ts
import { getTodayPuzzleIndex, getDaysSinceLaunch } from "../src/puzzleIndex";
import { buildSlug } from "./slug";
import { formatUtcDate } from "./dateUtils";
import type { ArchivableAnimal } from "./framerClient";

export interface ArchiveEntry {
  puzzleNumber: number;
  date: string;
  slug: string;
  commonName: string;
  imageUrl: string;
  funFacts: string;
  category: string;
  imageAttribution: string;
}

export function buildArchiveEntry(
  animals: ArchivableAnimal[],
  dayToArchive: Date,
  launchDate: Date
): ArchiveEntry {
  const index = getTodayPuzzleIndex(dayToArchive, launchDate, animals.length);
  const animal = animals[index];
  const puzzleNumber = getDaysSinceLaunch(dayToArchive, launchDate) + 1;

  return {
    puzzleNumber,
    date: formatUtcDate(dayToArchive),
    slug: buildSlug(animal.commonName, puzzleNumber),
    commonName: animal.commonName,
    imageUrl: animal.imageUrl,
    funFacts: animal.funFacts,
    category: animal.category,
    imageAttribution: animal.imageAttribution,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/archiveEntry.test.ts`
Expected: PASS (2/2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/archiveEntry.ts scripts/archiveEntry.test.ts
git commit -m "feat: add archive entry builder"
```

---

### Task 7: Idempotent archive store + initial data file

**Files:**
- Create: `scripts/archiveStore.ts`
- Test: `scripts/archiveStore.test.ts`
- Create: `data/archive.json`

**Interfaces:**
- Consumes: `ArchiveEntry` type from Task 6
- Produces: `appendArchiveEntryIfMissing(existingEntries: ArchiveEntry[], newEntry: ArchiveEntry): ArchiveEntry[]`

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/archiveStore.test.ts
import { describe, it, expect } from "vitest";
import { appendArchiveEntryIfMissing } from "./archiveStore";
import type { ArchiveEntry } from "./archiveEntry";

function makeEntry(overrides: Partial<ArchiveEntry> = {}): ArchiveEntry {
  return {
    puzzleNumber: 1,
    date: "2026-08-01",
    slug: "elephant-1",
    commonName: "Elephant",
    imageUrl: "https://example.com/elephant.jpg",
    funFacts: "Elephants can recognize themselves in a mirror.",
    category: "mammal",
    imageAttribution: "Wikimedia Commons - CC BY-SA 4.0",
    ...overrides,
  };
}

describe("appendArchiveEntryIfMissing", () => {
  it("appends to an empty list", () => {
    const result = appendArchiveEntryIfMissing([], makeEntry());
    expect(result).toEqual([makeEntry()]);
  });

  it("appends a new date to an existing list", () => {
    const existing = [makeEntry()];
    const newEntry = makeEntry({ date: "2026-08-02", puzzleNumber: 2 });
    const result = appendArchiveEntryIfMissing(existing, newEntry);
    expect(result).toEqual([makeEntry(), newEntry]);
  });

  it("does not duplicate an existing date", () => {
    const existing = [makeEntry()];
    const result = appendArchiveEntryIfMissing(existing, makeEntry());
    expect(result).toEqual([makeEntry()]);
    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/archiveStore.test.ts`
Expected: FAIL — `Cannot find module './archiveStore'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// scripts/archiveStore.ts
import type { ArchiveEntry } from "./archiveEntry";

export function appendArchiveEntryIfMissing(
  existingEntries: ArchiveEntry[],
  newEntry: ArchiveEntry
): ArchiveEntry[] {
  const alreadyExists = existingEntries.some(
    (entry) => entry.date === newEntry.date
  );
  if (alreadyExists) {
    return existingEntries;
  }
  return [...existingEntries, newEntry];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/archiveStore.test.ts`
Expected: PASS (3/3 tests).

- [ ] **Step 5: Create the initial empty archive file**

```json
[]
```

Save as `data/archive.json`.

- [ ] **Step 6: Commit**

```bash
git add scripts/archiveStore.ts scripts/archiveStore.test.ts data/archive.json
git commit -m "feat: add idempotent archive store and seed data/archive.json"
```

---

### Task 8: Daily archive runner script

> **Superseded by Task 12.** As originally written, this task's script
> called `fetchAnimalsFromFramer` live. After discovering the Server
> API's "API Keys" UI isn't available on this account, Task 12 rewrote
> `runDailyArchive.ts` to read the already-committed `data/animals.json`
> instead — no live Framer call at all. The steps below are kept for
> history; the code they describe was replaced, not deleted.

**Files:**
- Create: `scripts/runDailyArchive.ts`
- Modify: `package.json` (add an `archive:run` script)

**Interfaces:**
- Consumes: `fetchAnimalsFromFramer` (Task 2), `buildArchiveEntry` (Task 6), `appendArchiveEntryIfMissing` (Task 7), `getPreviousUtcDay` (Task 4)
- Produces: an executable script, no exports consumed by later tasks

This is a thin composition/IO layer — the logic it calls is already unit
tested, so this task is verified by actually running it rather than unit
tests (mocking `fs` and a live Framer connection for a 20-line glue script
isn't worth the complexity it would add).

- [ ] **Step 1: Write the script**

```typescript
// scripts/runDailyArchive.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchAnimalsFromFramer } from "./framerClient";
import { buildArchiveEntry, type ArchiveEntry } from "./archiveEntry";
import { appendArchiveEntryIfMissing } from "./archiveStore";
import { getPreviousUtcDay } from "./dateUtils";

const LAUNCH_DATE = new Date("2026-08-01T00:00:00Z");
const COLLECTION_NAME = "Animals";
const ARCHIVE_PATH = fileURLToPath(new URL("../data/archive.json", import.meta.url));

async function main(): Promise<void> {
  const projectUrl = process.env.FRAMER_PROJECT_URL;
  const apiKey = process.env.FRAMER_API_KEY;

  if (!projectUrl || !apiKey) {
    throw new Error(
      "FRAMER_PROJECT_URL and FRAMER_API_KEY environment variables must be set"
    );
  }

  const animals = await fetchAnimalsFromFramer(
    projectUrl,
    apiKey,
    COLLECTION_NAME
  );
  const dayToArchive = getPreviousUtcDay(new Date());
  const entry = buildArchiveEntry(animals, dayToArchive, LAUNCH_DATE);

  const existing: ArchiveEntry[] = existsSync(ARCHIVE_PATH)
    ? JSON.parse(readFileSync(ARCHIVE_PATH, "utf-8"))
    : [];

  const updated = appendArchiveEntryIfMissing(existing, entry);

  if (updated.length !== existing.length) {
    writeFileSync(ARCHIVE_PATH, JSON.stringify(updated, null, 2) + "\n");
    console.log(
      `Archived puzzle #${entry.puzzleNumber} (${entry.date}): ${entry.commonName}`
    );
  } else {
    console.log(`Entry for ${entry.date} already archived, nothing to do.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Add a package.json script**

Replace the full contents of `package.json` with:

```json
{
  "name": "whichanimaltoday-engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "archive:run": "tsx scripts/runDailyArchive.ts"
  },
  "dependencies": {
    "framer-api": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vitest": "^2.0.5",
    "tsx": "^4.16.2"
  }
}
```

- [ ] **Step 3: Manually verify with a real Framer project**

With `.env` populated (per Task 2's `.env.example`) and at least one row
in the "Animals" collection:

Run: `npx tsx --env-file=.env scripts/runDailyArchive.ts`
Expected: prints `Archived puzzle #1 (<yesterday's date>): <animal name>`
and `data/archive.json` now contains one entry. Run it a second time
immediately after — expected output: `Entry for <date> already archived,
nothing to do.` and the file is unchanged (confirms idempotency end to
end, not just in the unit-tested `appendArchiveEntryIfMissing`).

- [ ] **Step 4: Commit**

```bash
git add scripts/runDailyArchive.ts package.json
git commit -m "feat: add daily archive runner script"
```

---

### Task 9: GitHub Actions daily cron workflow

> **Revised by Task 12.** The `FRAMER_PROJECT_URL`/`FRAMER_API_KEY`
> secrets and env block originally in this workflow's "Run daily archive
> job" step were removed — the daily job no longer calls Framer live
> (see Task 12), so no secrets are needed for this workflow at all.

**Files:**
- Create: `.github/workflows/daily-archive.yml`

**Interfaces:**
- Consumes: `npm run archive:run` (Task 8, as revised by Task 12)
- Produces: nothing consumed by later tasks

**Prerequisite:** this repo needs a GitHub remote (push it to GitHub if
that hasn't happened yet). No repository secrets are needed for this
workflow — the daily job reads the already-committed
`data/animals.json` rather than calling Framer, and the commit step uses
GitHub's automatically-provided `GITHUB_TOKEN`.

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/daily-archive.yml
name: Daily Archive

on:
  schedule:
    - cron: "15 0 * * *"
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  archive:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - run: npm ci

      - name: Run daily archive job
        run: npm run archive:run
        env:
          FRAMER_PROJECT_URL: ${{ secrets.FRAMER_PROJECT_URL }}
          FRAMER_API_KEY: ${{ secrets.FRAMER_API_KEY }}

      - name: Commit archive.json if it changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/archive.json
          git diff --cached --quiet || git commit -m "chore: archive daily puzzle"
          git push
```

- [ ] **Step 2: Validate the workflow file's syntax**

Run: `npx --yes js-yaml .github/workflows/daily-archive.yml > /dev/null`
Expected: no output, exit code 0 (confirms valid YAML — this does not
verify the workflow's logic, only that it parses; full verification is
manual, per Step 3).

- [ ] **Step 3: Manually verify after pushing to GitHub**

Once this repo has a remote and the two secrets are set: go to the
Actions tab, select "Daily Archive," and click "Run workflow" (the
`workflow_dispatch` trigger added above makes this available on demand,
not just on the schedule). Confirm the run succeeds and either commits a
new `data/archive.json` entry or logs "already archived" if run twice the
same day.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/daily-archive.yml
git commit -m "ci: add daily archive GitHub Actions workflow"
```

---

### Task 10: Export the full animal list for the main game

**Files:**
- Create: `scripts/exportAnimals.ts`
- Modify: `package.json` (add an `export:animals` script)

**Interfaces:**
- Consumes: `fetchAnimalsFromFramer` (Task 2)
- Produces: `data/animals.json` (consumed by the main game's Framer code
  component, per the corrected `docs/framer-integration.md`)

This closes the gap left by correcting `docs/framer-integration.md`
earlier — that guide now assumes `data/animals.json` exists, so this
script is what produces it. Same manual-verification reasoning as Task 8
applies (thin IO glue around already-tested/already-manually-verified
pieces).

- [ ] **Step 1: Write the script**

```typescript
// scripts/exportAnimals.ts
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchAnimalsFromFramer } from "./framerClient";

const COLLECTION_NAME = "Animals";
const OUTPUT_PATH = fileURLToPath(new URL("../data/animals.json", import.meta.url));

async function main(): Promise<void> {
  const projectUrl = process.env.FRAMER_PROJECT_URL;
  const apiKey = process.env.FRAMER_API_KEY;

  if (!projectUrl || !apiKey) {
    throw new Error(
      "FRAMER_PROJECT_URL and FRAMER_API_KEY environment variables must be set"
    );
  }

  const animals = await fetchAnimalsFromFramer(
    projectUrl,
    apiKey,
    COLLECTION_NAME
  );
  writeFileSync(OUTPUT_PATH, JSON.stringify(animals, null, 2) + "\n");
  console.log(`Exported ${animals.length} animals to data/animals.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Add a package.json script**

Replace the full contents of `package.json` with:

```json
{
  "name": "whichanimaltoday-engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "archive:run": "tsx scripts/runDailyArchive.ts",
    "export:animals": "tsx scripts/exportAnimals.ts"
  },
  "dependencies": {
    "framer-api": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vitest": "^2.0.5",
    "tsx": "^4.16.2"
  }
}
```

- [ ] **Step 3: Manually verify with a real Framer project**

Run: `npx tsx --env-file=.env scripts/exportAnimals.ts`
Expected: prints `Exported <N> animals to data/animals.json` and the file
contains the full list. Re-run this manually (not on a schedule) whenever
the Animals collection's content changes — documented in Step 4 below.

- [ ] **Step 4: Commit**

```bash
git add scripts/exportAnimals.ts package.json
git commit -m "feat: add animals.json export script for the main game"
```

Note in the commit or a follow-up: `data/animals.json` itself is not
committed by this task — it's generated locally by whoever curates the
animal list, then committed by them once the 500-animal list is ready
(same file conceptually as `data/archive.json`, but populated on-demand
rather than daily).

---

### Task 11: Framer Archive page integration guide

**Files:**
- Create: `docs/framer-archive-integration.md`

**Interfaces:**
- Consumes: `data/archive.json`'s shape (Task 6/7)
- Produces: documentation only

- [ ] **Step 1: Write the guide**

```markdown
<!-- docs/framer-archive-integration.md -->
# Wiring the Archive pages into Framer

`data/archive.json` (produced by `scripts/runDailyArchive.ts` via the
daily GitHub Actions workflow) is a plain public JSON array, fetched
directly by Framer code components — no Framer CMS collection is
involved for this feature, by design (see
`docs/superpowers/specs/2026-07-27-archive-page-design.md`).

**Public URL:** once this repo is pushed to GitHub and public,
`data/archive.json` is fetchable at:

```
https://raw.githubusercontent.com/<owner>/<repo>/master/data/archive.json
```

## List page

Fetch the URL above, parse the JSON array, sort by `puzzleNumber`
descending (newest first — the file is already append-ordered, but
sorting defensively costs nothing), and render one card per entry using
`imageUrl`, `commonName`, `puzzleNumber`, and `date` — matching the
visual design from the earlier Framer prompt. Each card links to
`/archive/<slug>`.

## Detail page

Create a Framer dynamic-route page at path `/archive/:slug`. Framer
passes the `slug` segment into the page's code component as a prop.
Fetch the same `archive.json` URL, find the entry where `entry.slug`
matches the prop, and render its `imageUrl`, `commonName`, and
`funFacts`.

**If Framer's dynamic-route prop-passing doesn't behave as expected**
(this was confirmed with high but not absolute confidence — see the
spec's Section 4): fall back to a single detail page reading a `slug`
value from `window.location.search` via `URLSearchParams` instead of a
path segment, and link to it as `/archive-detail?slug=<slug>` from the
list page.

## Manual verification checklist

- [ ] List page shows every entry currently in `data/archive.json`,
      newest first.
- [ ] Clicking a card navigates to that animal's detail page.
- [ ] The detail page shows the correct photo, name, and facts for its
      slug (check at least two different entries, not just the first).
- [ ] A slug that doesn't exist in the data shows a reasonable "not
      found" state rather than a blank page or thrown error.
- [ ] Today's not-yet-revealed animal never appears on either page (true
      by construction, since `archive.json` only ever contains past
      days — but worth a final visual confirmation).
```

- [ ] **Step 2: Commit**

```bash
git add docs/framer-archive-integration.md
git commit -m "docs: add Framer Archive page integration guide"
```

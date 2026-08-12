# Animal Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the eleven unnameable animals out of every game surface, teach the image suggester to search iNaturalist and present its findings as a contact sheet, then source 34 everyday animals and nine replacement photographs through it.

**Architecture:** Three independent parts. Retirement is a pure data move — the eleven records leave `data/animals.json` for a new `data/retired.json`, and both game surfaces stop seeing them without a line of component code changing. The tooling extends the existing `scripts/pipeline/` modules: a new iNaturalist source alongside the Commons one, feeding the judging path that already exists, with an HTML contact sheet as its output. The content work is a runbook the owner drives, because it needs an API key this environment deliberately does not have and judgement no test can encode.

**Tech Stack:** TypeScript, `tsx` for scripts, Vitest, `sharp`, the Anthropic SDK, the iNaturalist v1 REST API, Wikimedia Commons API.

**Spec:** `docs/superpowers/specs/2026-08-12-animal-pool-design.md`

## Global Constraints

- **Shell is Windows PowerShell. Use `npm.cmd`, never bare `npm`** — an execution-policy block stops the plain command on this machine.
- **Gate on exit codes, never on grepping output.** A `npm test | grep ... && git commit` chain once committed a red suite because grep succeeded.
- **No `ANTHROPIC_API_KEY` in this environment, deliberately.** Every paid step — `content:suggest`, `content:audit` — is run by the owner. Tasks here must not require one.
- **Never auto-apply an image.** Suggestions are reviewed by eye before anything is written to `data/animals.json`. A cartoon blobfish was once replaced with a painted one because a substitution happened without anybody looking.
- **New image filenames only, never overwrite.** jsDelivr caches `@master` for hours; five overwritten paths served superseded bytes minutes after a push on 2026-08-03.
- **Mutate `data/animals.json` in place, field by field.** A wholesale rewrite once destroyed `species` and `bonus` on existing records, which is why `scripts/animalsFileGuard.ts` exists.
- **Commit messages:** lowercase `area: summary` subject, prose body explaining why, and end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **A test that has never been seen to fail is a test nobody has checked.** Several tasks below include a step that deliberately breaks the assertion and confirms the right failure.

---

## File Structure

**Part A — retirement (no dependency on the tooling):**
- Modify `scripts/animalsCategories.test.ts` — add the per-category floor.
- Create `scripts/animalsLicence.test.ts` — the NC/ND guard over live data.
- Create `data/retired.json` — the eleven records.
- Create `scripts/retiredAnimals.test.ts` — round-trip guard.
- Modify `data/animals.json`, regenerate `docs/legal/credits.md`.

**Part B — tooling:**
- Create `scripts/pipeline/inaturalistQuery.ts` — pure: URL building, response mapping, licence normalisation. All tests live here.
- Create `scripts/pipeline/inaturalistQuery.test.ts`.
- Create `scripts/pipeline/inaturalistClient.ts` — network only, untested by convention (`commonsClient.ts`, `wikidataClient.ts` are the same).
- Create `scripts/pipeline/contactSheet.ts` + `scripts/pipeline/contactSheet.test.ts` — pure HTML builder.
- Modify `scripts/suggestImages.ts` — second source, contact-sheet output.

**Part C — content:** a runbook, not code. See the end of this plan.

---

### Task 1: Per-category floor

`buildQuestion` in `framer/TimerModeComponent.tsx` draws three same-category decoys, so a category with fewer than four animals cannot form a question. Nothing asserts that today.

**Files:**
- Modify: `scripts/animalsCategories.test.ts`

**Interfaces:**
- Consumes: the existing `animals` constant in that file, typed `{ commonName: string; category: string }[]`.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe("data/animals.json categories", ...)` block:

```ts
  /**
   * `buildQuestion` in framer/TimerModeComponent.tsx builds a four-option
   * question from the answer plus three decoys drawn from the same category, so
   * a category holding fewer than four animals cannot produce a question at
   * all. Retirement is what makes this reachable: the thinnest categories sit
   * at six once the eleven leave, and a future retirement could take one under.
   */
  const MIN_PER_CATEGORY = 4;

  it("holds at least four animals in every category", () => {
    const counts = new Map<string, number>();
    for (const animal of animals) {
      counts.set(animal.category, (counts.get(animal.category) ?? 0) + 1);
    }

    const thin = [...counts]
      .filter(([, count]) => count < MIN_PER_CATEGORY)
      .map(([category, count]) => `${category}: ${count}`)
      .sort();

    expect(thin).toEqual([]);
  });
```

- [ ] **Step 2: Run it and confirm it passes against today's data**

Run: `npm.cmd test -- scripts/animalsCategories.test.ts`
Expected: PASS. Every category currently holds six or more.

- [ ] **Step 3: Prove the assertion is not vacuous**

Temporarily change `MIN_PER_CATEGORY` to `7` and re-run the same command.
Expected: FAIL, naming `amphibian: 6` and `fish: 6`.
Then restore it to `4` and re-run — PASS.

This step exists because two tests on this project have already passed while asserting nothing.

- [ ] **Step 4: Commit**

```bash
git add scripts/animalsCategories.test.ts
git commit -m "test: assert every category can still fill a timer question"
```

---

### Task 2: No non-commercial licence in the data file

`isAllowedLicence` gates what the pipeline *accepts*. Nothing stops a hand-added record from carrying an NC photo, and the site runs ads.

**Files:**
- Create: `scripts/animalsLicence.test.ts`

**Interfaces:**
- Consumes: `data/animals.json` directly.
- Produces: exports `BLOCKED_LICENCE_IN_DATA` (a `RegExp`) — nothing else depends on it, but the test asserts the regex itself so it cannot rot into a no-op.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The advertising makes this substantive rather than a technicality: a CC
 * NonCommercial photograph cannot be used on a page carrying ads, and a
 * NoDerivatives one cannot be resized — and every image is resized, into
 * images/display/, by scripts/generateDisplayImages.ts.
 *
 * scripts/pipeline/gates.ts already rejects both when the pipeline *accepts* an
 * image. This asserts the same thing about what is actually in the file, so a
 * record added by hand cannot bypass that gate. All 89 records pass as of
 * 2026-08-12.
 */
export const BLOCKED_LICENCE_IN_DATA =
  /\bnc\b|noncommercial|non-commercial|\bnd\b|noderiv|fair use/i;

const animals = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../data/animals.json", import.meta.url)),
    "utf8"
  )
) as { commonName: string; imageAttribution: string }[];

describe("data/animals.json photo licences", () => {
  it("rejects the licence strings it is meant to reject", () => {
    expect(BLOCKED_LICENCE_IN_DATA.test("CC BY-NC 4.0")).toBe(true);
    expect(BLOCKED_LICENCE_IN_DATA.test("CC BY-ND 4.0")).toBe(true);
    expect(BLOCKED_LICENCE_IN_DATA.test("CC BY-NC-SA 2.0")).toBe(true);
    expect(BLOCKED_LICENCE_IN_DATA.test("CC BY-SA 4.0")).toBe(false);
    expect(BLOCKED_LICENCE_IN_DATA.test("CC0 1.0")).toBe(false);
    expect(BLOCKED_LICENCE_IN_DATA.test("Public domain")).toBe(false);
  });

  it("carries no non-commercial or no-derivatives photo", () => {
    const offenders = animals
      .filter((animal) => BLOCKED_LICENCE_IN_DATA.test(animal.imageAttribution ?? ""))
      .map((animal) => `${animal.commonName}: ${animal.imageAttribution}`);

    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm.cmd test -- scripts/animalsLicence.test.ts`
Expected: PASS on both. The first `it` is what stops the second going vacuous if the regex is ever edited.

- [ ] **Step 3: Commit**

```bash
git add scripts/animalsLicence.test.ts
git commit -m "test: no non-commercial photo licence reaches the data file"
```

---

### Task 3: Retire the eleven to `data/retired.json`

**Files:**
- Create: `data/retired.json`
- Create: `scripts/retiredAnimals.test.ts`
- Modify: `data/animals.json` (eleven records removed)
- Modify: `docs/legal/credits.md` (regenerated)

**Interfaces:**
- Consumes: `validateAnimalData` from `src/animalData.ts`, signature `(records: unknown[]) => string[]` — returns a list of error strings, empty when valid.
- Produces: `data/retired.json`, an array of complete animal records in the same shape as `data/animals.json`.

- [ ] **Step 1: Write the failing test**

Create `scripts/retiredAnimals.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateAnimalData } from "../src/animalData";

/**
 * The eleven animals nobody can name — Chowsingha, Ibisbill, Saola and the rest
 * — left data/animals.json on 2026-08-12 rather than being deleted. They were
 * already barred from the daily puzzle; what changed is that Beat the Clock
 * drew from the whole file and filtered nothing, so they were answers there.
 *
 * Retirement rather than deletion keeps their hints, fun facts, bonus rounds
 * and images, so the decision reverses by moving records back. These two
 * assertions are what make that promise real: nothing is in both files, and a
 * retired record is still valid enough to return.
 */
const read = (name: string) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../data/${name}`, import.meta.url)), "utf8")
  ) as { commonName: string }[];

const animals = read("animals.json");
const retired = read("retired.json");

describe("data/retired.json", () => {
  it("holds the eleven animals that left the pool", () => {
    expect(retired).toHaveLength(11);
  });

  it("shares no animal with data/animals.json", () => {
    const live = new Set(animals.map((animal) => animal.commonName));
    const both = retired
      .map((animal) => animal.commonName)
      .filter((name) => live.has(name));

    expect(both).toEqual([]);
  });

  it("keeps every retired record valid, so it can be restored", () => {
    expect(validateAnimalData(retired)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm.cmd test -- scripts/retiredAnimals.test.ts`
Expected: FAIL — `ENOENT` on `data/retired.json`, which does not exist yet.

- [ ] **Step 3: Move the eleven records**

They are the records carrying `dailyEligible: false`, currently at positions 78–88 — the tail of the array, so nothing before them shifts and no scheduled day changes.

```bash
node -e "
const fs=require('fs');
const all=JSON.parse(fs.readFileSync('data/animals.json','utf8'));
const retired=all.filter(a=>a.dailyEligible===false);
const live=all.filter(a=>a.dailyEligible!==false);
if(retired.length!==11) throw new Error('expected 11, got '+retired.length);
fs.writeFileSync('data/retired.json',JSON.stringify(retired,null,2)+'\n');
fs.writeFileSync('data/animals.json',JSON.stringify(live,null,2)+'\n');
console.log('live',live.length,'retired',retired.length);
"
```

Expected output: `live 78 retired 11`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm.cmd test -- scripts/retiredAnimals.test.ts`
Expected: PASS, all three.

- [ ] **Step 5: Regenerate the credits page and validate**

```bash
npm.cmd run generate:credits
npm.cmd run validate:animals
```

Expected: credits rewritten with 78 records; validator reports `78 records, all valid`. The eleven photographs are no longer used, so their attribution correctly drops out.

- [ ] **Step 6: Run the whole suite**

Run: `npm.cmd test`
Expected: PASS. Watch three in particular — `animalsCurve.test.ts` (the 70% floor: the eleven were never eligible, so the ratio is unchanged), `animalsCategories.test.ts` (thinnest category now six), and `check:credits` if it runs in the suite.

- [ ] **Step 7: Commit**

```bash
git add data/animals.json data/retired.json scripts/retiredAnimals.test.ts docs/legal/credits.md
git commit -m "content: retire the eleven animals nobody can name"
```

---

### Task 4: iNaturalist query layer (pure)

Everything that can be tested without a network call. This is where the licence handling lives, and the reason it is a separate file from the client.

**Files:**
- Create: `scripts/pipeline/inaturalistQuery.ts`
- Create: `scripts/pipeline/inaturalistQuery.test.ts`

**Interfaces:**
- Consumes: `Candidate` from `./candidateFilter`, shape `{ file: string; width: number; height: number; licence: string; artist: string }`. `isAllowedLicence` from `./gates`, signature `(shortName: string) => boolean`.
- Produces:
  - `buildObservationsUrl(taxonName: string, perPage?: number): string`
  - `normaliseLicence(code: string | null | undefined): string | null`
  - `toCandidates(payload: unknown): Candidate[]`
  - `INAT_PHOTO_LICENCES: string` — the comma-separated `photo_license` parameter value.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  buildObservationsUrl,
  normaliseLicence,
  toCandidates,
} from "./inaturalistQuery";

const observation = (photo: Record<string, unknown>) => ({
  results: [
    {
      taxon: { name: "Vulpes vulpes" },
      photos: [{ id: 1, url: "https://x/photos/1/square.jpg", ...photo }],
    },
  ],
});

describe("buildObservationsUrl", () => {
  it("asks only for research-grade observations with photos", () => {
    const url = buildObservationsUrl("Vulpes vulpes");
    expect(url).toContain("quality_grade=research");
    expect(url).toContain("photos=true");
    expect(url).toContain("taxon_name=Vulpes%20vulpes");
  });

  it("restricts the licence at the API rather than filtering afterwards", () => {
    const url = buildObservationsUrl("Vulpes vulpes");
    expect(url).toContain("photo_license=cc0%2Ccc-by%2Ccc-by-sa");
  });
});

describe("normaliseLicence", () => {
  /**
   * iNaturalist returns hyphenated codes; gates.ts expects the spaced form and
   * fails closed on anything it does not recognise. Without this mapping every
   * usable photo would be silently rejected.
   */
  it("maps the permitted codes to the form gates.ts and credits.md use", () => {
    expect(normaliseLicence("cc0")).toBe("CC0 1.0");
    expect(normaliseLicence("cc-by")).toBe("CC BY 4.0");
    expect(normaliseLicence("cc-by-sa")).toBe("CC BY-SA 4.0");
  });

  it("rejects non-commercial, no-derivatives and all-rights-reserved", () => {
    expect(normaliseLicence("cc-by-nc")).toBeNull();
    expect(normaliseLicence("cc-by-nd")).toBeNull();
    expect(normaliseLicence("cc-by-nc-sa")).toBeNull();
    expect(normaliseLicence(null)).toBeNull();
    expect(normaliseLicence(undefined)).toBeNull();
  });
});

describe("toCandidates", () => {
  it("builds a large-size URL from the square one", () => {
    const [candidate] = toCandidates(
      observation({
        license_code: "cc-by",
        attribution: "(c) Jane Doe, some rights reserved (CC BY)",
        original_dimensions: { width: 2048, height: 1536 },
      })
    );
    expect(candidate.file).toBe("https://x/photos/1/large.jpg");
  });

  it("carries the dimensions through so the width gate can use them", () => {
    const [candidate] = toCandidates(
      observation({
        license_code: "cc-by",
        attribution: "(c) Jane Doe, some rights reserved (CC BY)",
        original_dimensions: { width: 2048, height: 1536 },
      })
    );
    expect(candidate.width).toBe(2048);
    expect(candidate.height).toBe(1536);
  });

  it("extracts the photographer from the attribution string", () => {
    const [candidate] = toCandidates(
      observation({
        license_code: "cc0",
        attribution: "(c) Jane Doe, no rights reserved (CC0)",
      })
    );
    expect(candidate.artist).toBe("Jane Doe");
  });

  it("drops a photo whose licence is not permitted", () => {
    expect(
      toCandidates(
        observation({ license_code: "cc-by-nc", attribution: "(c) Jane Doe" })
      )
    ).toEqual([]);
  });

  it("drops a photo with no licence at all", () => {
    expect(
      toCandidates(observation({ license_code: null, attribution: "(c) Jane Doe" }))
    ).toEqual([]);
  });

  it("survives a payload with no results", () => {
    expect(toCandidates({})).toEqual([]);
    expect(toCandidates({ results: [] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm.cmd test -- scripts/pipeline/inaturalistQuery.test.ts`
Expected: FAIL — cannot resolve `./inaturalistQuery`.

- [ ] **Step 3: Write the implementation**

```ts
import type { Candidate } from "./candidateFilter";
import { isAllowedLicence } from "./gates";

/**
 * The pure half of the iNaturalist source: what to ask for, and how to read the
 * answer. No network here, which is the whole point — the licence handling is
 * the part that must not be got wrong, and this is where it can be tested.
 *
 * Why iNaturalist at all: research-grade observations carry a community-verified
 * species ID, which is exactly the check that would have caught a roller
 * coaster called Dragon Fly filed as a dragonfly. Phase 2 found the photography
 * better than Commons too, and sourced 31 animals here by hand because the
 * tooling could not reach it.
 */
const API = "https://api.inaturalist.org/v1/observations";

/**
 * Filtered at the API rather than after fetching, so a non-commercial photo
 * never enters the pipeline at all.
 */
export const INAT_PHOTO_LICENCES = "cc0,cc-by,cc-by-sa";

/**
 * iNaturalist reports a hyphenated code; gates.ts expects the spaced form used
 * on the credits page and fails closed on anything it does not recognise. The
 * versions are the ones iNaturalist actually issues.
 */
const LICENCE_NAMES: Record<string, string> = {
  cc0: "CC0 1.0",
  "cc-by": "CC BY 4.0",
  "cc-by-sa": "CC BY-SA 4.0",
};

export function buildObservationsUrl(taxonName: string, perPage = 30): string {
  const params = new URLSearchParams({
    taxon_name: taxonName,
    quality_grade: "research",
    photos: "true",
    photo_license: INAT_PHOTO_LICENCES,
    per_page: String(perPage),
    order_by: "votes",
    locale: "en",
  });
  return `${API}?${params.toString()}`;
}

export function normaliseLicence(code: string | null | undefined): string | null {
  const name = LICENCE_NAMES[(code ?? "").toLowerCase()];
  if (!name) return null;
  // Belt and braces: the same gate the Commons path goes through, so one
  // rejection rule serves both sources.
  return isAllowedLicence(name) ? name : null;
}

/**
 * "(c) Jane Doe, some rights reserved (CC BY)" -> "Jane Doe".
 *
 * Falls back to the whole string rather than to an empty author: an unattributed
 * photograph on the credits page is a licence breach, so a messy name is
 * strictly better than none.
 */
function photographer(attribution: string): string {
  const match = attribution.match(/^\(c\)\s*([^,]+)/i);
  return (match?.[1] ?? attribution).trim();
}

interface RawPhoto {
  url?: string;
  license_code?: string | null;
  attribution?: string;
  original_dimensions?: { width?: number; height?: number };
}

/**
 * iNaturalist's `url` is the square thumbnail. `large` is the biggest
 * derivative served without asking for the original, capped at 1024 on the long
 * side.
 *
 * When `original_dimensions` is absent the candidate is assumed to be that cap
 * rather than dropped: the width gate exists to reject thumbnails, and the
 * legibility pass — which judges a copy scaled to the game's 330x248 box — is
 * the real check on whether a photograph is usable.
 */
const LARGE_FALLBACK = 1024;

export function toCandidates(payload: unknown): Candidate[] {
  const results =
    (payload as { results?: { photos?: RawPhoto[] }[] })?.results ?? [];

  const candidates: Candidate[] = [];
  for (const observation of results) {
    for (const photo of observation.photos ?? []) {
      const licence = normaliseLicence(photo.license_code);
      if (!licence || !photo.url) continue;

      candidates.push({
        file: photo.url.replace(/square\.(jpe?g|png)$/i, "large.$1"),
        width: photo.original_dimensions?.width ?? LARGE_FALLBACK,
        height: photo.original_dimensions?.height ?? LARGE_FALLBACK,
        licence,
        artist: photographer(photo.attribution ?? ""),
      });
    }
  }
  return candidates;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm.cmd test -- scripts/pipeline/inaturalistQuery.test.ts`
Expected: PASS, all eleven.

- [ ] **Step 5: Prove the licence gate is load-bearing**

Temporarily add `"cc-by-nc": "CC BY-NC 4.0"` to `LICENCE_NAMES` and re-run.
Expected: the "rejects non-commercial" test still FAILS to pass it — because `isAllowedLicence` rejects the string independently. That double rejection is the point; confirm it, then remove the temporary line.

- [ ] **Step 6: Commit**

```bash
git add scripts/pipeline/inaturalistQuery.ts scripts/pipeline/inaturalistQuery.test.ts
git commit -m "pipeline: read iNaturalist observations into candidates"
```

---

### Task 5: iNaturalist client and a second source for the suggester

**Files:**
- Create: `scripts/pipeline/inaturalistClient.ts`
- Modify: `scripts/suggestImages.ts`

**Interfaces:**
- Consumes: `buildObservationsUrl`, `toCandidates` from `./inaturalistQuery`; `USER_AGENT` from `./wikidataClient`; `Candidate` from `./candidateFilter`.
- Produces: `fetchInaturalistCandidates(taxonName: string): Promise<Candidate[]>`.

- [ ] **Step 1: Write the client**

No test file, matching `commonsClient.ts` and `wikidataClient.ts` — the pure layer is tested, the fetch is not.

```ts
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Candidate } from "./candidateFilter";
import { buildObservationsUrl, toCandidates } from "./inaturalistQuery";
import { USER_AGENT } from "./wikidataClient";

/**
 * The network half. Everything worth testing lives in inaturalistQuery.ts.
 *
 * Responses are cached on disk because a sourcing run looks at the same animal
 * repeatedly while a human decides, and iNaturalist asks for no more than one
 * request per second sustained.
 */
const CACHE = fileURLToPath(new URL("../../.cache/inat", import.meta.url));

export async function fetchInaturalistCandidates(
  taxonName: string
): Promise<Candidate[]> {
  mkdirSync(CACHE, { recursive: true });
  const key = createHash("sha256").update(taxonName).digest("hex").slice(0, 16);
  const path = `${CACHE}/${key}.json`;

  if (existsSync(path)) {
    return toCandidates(JSON.parse(readFileSync(path, "utf8")));
  }

  const response = await fetch(buildObservationsUrl(taxonName), {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`iNaturalist: HTTP ${response.status} for "${taxonName}"`);
  }

  const payload = await response.json();
  writeFileSync(path, JSON.stringify(payload));
  return toCandidates(payload);
}
```

- [ ] **Step 2: Wire it into the suggester**

In `scripts/suggestImages.ts`, add the import and a source flag. The existing Commons gathering stays exactly as it is; this adds to the candidate list rather than replacing it.

```ts
import { fetchInaturalistCandidates } from "./pipeline/inaturalistClient";
```

Then, where the Commons candidates are assembled inside `suggestFor`, append:

```ts
  /**
   * Both sources by default. Commons has the deeper archive and iNaturalist the
   * better photographs, and which one wins is animal-dependent — Commons
   * supplied only the pig in phase 2, but it is the only place with a decent
   * wild aardvark.
   *
   * Ordering is deliberately not by source. iNaturalist ranks by votes, which
   * selects for drama: a herd at a waterhole, an owl with two owlets, a horse
   * with an egret standing on it. Votes order the fetch queue and nothing else
   * — the judge decides what survives.
   */
  const source = (process.argv.find((arg) => arg.startsWith("--source="))
    ?.split("=")[1] ?? "both") as "commons" | "inat" | "both";

  if (source !== "commons") {
    const taxon = animal.species ?? animal.commonName;
    try {
      candidates.push(...(await fetchInaturalistCandidates(taxon)));
    } catch (error) {
      // One dead source must not cost the run: the Commons candidates are
      // already gathered and are worth judging on their own.
      console.log(`  iNaturalist unavailable: ${(error as Error).message}`);
    }
  }
```

- [ ] **Step 3: Verify the search half without spending anything**

Run: `npm.cmd run content:suggest -- --dry-run Cow`
Expected: candidates reported from both sources, with no API key needed and no paid call made. Confirm at least one candidate URL contains `inaturalist` or `static.inaturalist`.

- [ ] **Step 4: Verify the licence filter end to end**

Run: `npm.cmd run content:suggest -- --dry-run --source=inat Sheep`
Expected: every candidate reported carries `CC0 1.0`, `CC BY 4.0` or `CC BY-SA 4.0`. If any other string appears, stop — the normalisation is wrong and the whole point of the task has failed.

- [ ] **Step 5: Run the whole suite and commit**

```bash
npm.cmd test
git add scripts/pipeline/inaturalistClient.ts scripts/suggestImages.ts
git commit -m "suggest: search iNaturalist alongside Commons"
```

---

### Task 6: The contact sheet

The output that makes 43 animals reviewable in one sitting: top survivors per animal, shown at the size players see, with the full-resolution image a click away.

**Files:**
- Create: `scripts/pipeline/contactSheet.ts`
- Create: `scripts/pipeline/contactSheet.test.ts`
- Modify: `scripts/suggestImages.ts`

**Interfaces:**
- Consumes: `DISPLAY_WIDTH` (330) and `DISPLAY_HEIGHT` (248) from `./imageJudge`.
- Produces:
  - `interface SheetCandidate { url: string; licence: string; artist: string; note: string; }`
  - `interface SheetEntry { commonName: string; candidates: SheetCandidate[]; }`
  - `buildContactSheet(entries: SheetEntry[]): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildContactSheet, type SheetEntry } from "./contactSheet";
import { DISPLAY_WIDTH } from "./imageJudge";

const entry: SheetEntry = {
  commonName: "Sheep",
  candidates: [
    {
      url: "https://x/photos/1/large.jpg",
      licence: "CC BY 4.0",
      artist: "Jane Doe",
      note: "A single sheep in a grass field.",
    },
  ],
};

describe("buildContactSheet", () => {
  it("shows each candidate at the size a player sees it", () => {
    const html = buildContactSheet([entry]);
    expect(html).toContain(`width:${DISPLAY_WIDTH}px`);
  });

  it("links the full-resolution image so detail can be confirmed", () => {
    const html = buildContactSheet([entry]);
    expect(html).toContain('href="https://x/photos/1/large.jpg"');
  });

  it("shows the licence and photographer, which the credits page needs", () => {
    const html = buildContactSheet([entry]);
    expect(html).toContain("CC BY 4.0");
    expect(html).toContain("Jane Doe");
  });

  it("escapes text so a photographer's name cannot break the page", () => {
    const html = buildContactSheet([
      { ...entry, candidates: [{ ...entry.candidates[0], artist: 'A <b>"x"</b>' }] },
    ]);
    expect(html).toContain("&lt;b&gt;");
    expect(html).not.toContain("<b>");
  });

  it("says so plainly when an animal found nothing", () => {
    const html = buildContactSheet([{ commonName: "Axolotl", candidates: [] }]);
    expect(html).toContain("Axolotl");
    expect(html).toContain("no candidate passed");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm.cmd test -- scripts/pipeline/contactSheet.test.ts`
Expected: FAIL — cannot resolve `./contactSheet`.

- [ ] **Step 3: Write the implementation**

```ts
import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from "./imageJudge";

/**
 * One page showing every survivor, at the size it will actually be played at.
 *
 * The display size is the point rather than a detail. images/narwhal-5.jpg
 * passed a full-resolution check and shipped: sixteen narwhals from the air,
 * unmistakable at 5000 pixels and blue water with smudges in it at 330. A review
 * surface that shows the full image invites exactly that mistake, so the big
 * version is one click away instead — for confirming detail, not for forming the
 * judgement.
 */
export interface SheetCandidate {
  url: string;
  licence: string;
  artist: string;
  note: string;
}

export interface SheetEntry {
  commonName: string;
  candidates: SheetCandidate[];
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderCandidate(candidate: SheetCandidate): string {
  return `      <figure>
        <a href="${escape(candidate.url)}" target="_blank" rel="noreferrer">
          <img src="${escape(candidate.url)}" alt="" loading="lazy"
               style="width:${DISPLAY_WIDTH}px;height:${DISPLAY_HEIGHT}px;object-fit:contain;background:#111">
        </a>
        <figcaption>${escape(candidate.artist)} — ${escape(candidate.licence)}<br>
          ${escape(candidate.note)}</figcaption>
      </figure>`;
}

function renderEntry(entry: SheetEntry): string {
  const body =
    entry.candidates.length === 0
      ? "      <p>no candidate passed — this animal needs a human, or an exception</p>"
      : entry.candidates.map(renderCandidate).join("\n");

  return `    <section>
      <h2>${escape(entry.commonName)}</h2>
${body}
    </section>`;
}

export function buildContactSheet(entries: SheetEntry[]): string {
  return `<!doctype html>
<meta charset="utf-8">
<title>Candidate photographs</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 2rem; background: #fafafa; }
  section { margin-bottom: 2.5rem; }
  section > div, section { display: block; }
  figure { display: inline-block; margin: 0 1rem 1rem 0; max-width: ${DISPLAY_WIDTH}px; vertical-align: top; }
  figcaption { font-size: 12px; color: #444; margin-top: .4rem; }
  h2 { font-size: 16px; margin: 0 0 .75rem; }
</style>
<body>
${entries.map(renderEntry).join("\n")}
</body>`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm.cmd test -- scripts/pipeline/contactSheet.test.ts`
Expected: PASS, all five.

- [ ] **Step 5: Write the sheet out from the suggester**

In `scripts/suggestImages.ts`, collect results across all requested animals and write the file at the end of `main()`:

```ts
import { writeFileSync, mkdirSync } from "node:fs";
import { buildContactSheet, type SheetEntry } from "./pipeline/contactSheet";

// ... inside main(), after the loop over targets:
  if (entries.length > 0) {
    mkdirSync(root(".cache"), { recursive: true });
    const path = root(".cache/contact-sheet.html");
    writeFileSync(path, buildContactSheet(entries));
    console.log(`\nContact sheet: ${path}`);
  }
```

`suggestFor` returns a `SheetEntry` for each animal, built from the candidates that passed judging, using the verdict's `note` as the candidate note.

- [ ] **Step 6: Commit**

```bash
npm.cmd test
git add scripts/pipeline/contactSheet.ts scripts/pipeline/contactSheet.test.ts scripts/suggestImages.ts
git commit -m "suggest: write a contact sheet at the size players see"
```

---

### Task 7: Prove the selector rejects a photograph it should reject

**This task is run by the owner, because it spends money.** It is the check that stops the tooling being trusted on faith.

**Files:** none changed.

- [ ] **Step 1: Run the suggester against a known-bad case**

Stingray's current photograph carries a visible watermark, "Robin White", which the 2026-08-12 audit caught.

```bash
npm.cmd run content:suggest -- Stingray
```

- [ ] **Step 2: Open the contact sheet and check the negative case**

Open `.cache/contact-sheet.html`. Confirm the **watermarked image does not appear among the survivors**. If it does, the judging path is not applying the rule the audit applies, and Tasks 4–6 have shipped a selector that cannot be trusted — stop and fix before sourcing anything.

- [ ] **Step 3: Record the result**

Add a line to `docs/follow-ups.md` under the 2026-08-12 audit entry stating what the sheet showed, and commit. A negative case that was checked once and written down is worth more than the same check repeated from memory later.

---

## Part C — the content runbook

Not agent tasks. Every step needs `ANTHROPIC_API_KEY`, which this environment does not have, and the judgement is the owner's.

**Order matters:** sheep, goat and chicken are sourced under the image rule exactly as it stands. Only if a full search returns nothing for one of them does the livestock contingency in spec §5 come into play.

1. **Replace the nine flagged photographs.** Ladybug, stingray, whale, shark, cow, rhinoceros, bat, komodo dragon, axolotl.
   ```bash
   npm.cmd run content:suggest -- Ladybug Stingray Whale Shark Cow Rhinoceros Bat "Komodo Dragon" Axolotl
   ```
   Review the contact sheet. Two need a decision rather than a pick: **ladybug** may be a naming error rather than a photo problem — the audit says the markings are wrong for a seven-spot, so check whether the record or the picture is wrong. **Axolotl** may have no compliant photograph at all; if the sheet is empty, the choice is an accepted exception or dropping the animal.

2. **Mirror the chosen images to new filenames**, then regenerate derivatives:
   ```bash
   npm.cmd run images:display -- --apply
   ```

3. **Source the 34 new animals** in spec §4, in category batches. Each needs hints, fun facts, a bonus round and an image — the existing `content:draft` and `content:propose` steps cover the text.

4. **Assign `difficulty` by nameability** for each new record, and tier the four A-listers (lion, giant panda, gorilla, penguin) as `easy`.

5. **Recompute the calendar:**
   ```bash
   npm.cmd run content:order
   ```
   The frozen prefix is computed from days since launch, so already-played days cannot move.

6. **Regenerate and verify:**
   ```bash
   npm.cmd run generate:credits
   npm.cmd run validate:animals
   npm.cmd test
   ```

7. **Push.** Cloudflare redeploys `data/` automatically — it took about 90 seconds on 2026-08-12 — and jsDelivr serves the new image paths on demand. No Framer paste is needed for any of this.

8. **Verify live:** confirm `animals.json` on the Workers URL holds 112 records, then play a Beat the Clock run and confirm none of the retired eleven appear.

---

## Self-review notes

- **Spec coverage.** §1 retirement → Task 3. §2 category floor → Task 1. §3 iNaturalist source → Tasks 4–5; contact sheet → Task 6; the display-size and licence-gate bullets are corrections recording work that already exists, so they need no task. §4 phase 3 → Part C steps 3–5. §5 livestock → Part C ordering note. §6 nine images → Part C steps 1–2. Testing section: per-category floor → Task 1, retirement round-trip → Task 3, licence filtering → Task 4, NC/ND data guard → Task 2, the stingray negative case → Task 7.
- **Deliberate omission.** The spec's `domesticated` flag and its `UNREPRESENTABLE_FIELDS` entry are not planned, because §5 makes them contingent on a search that has not happened. If the contingency fires, that is a new task.

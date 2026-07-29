# Framer Engine Codegen — Design

**Date:** 2026-07-30
**Status:** Approved, pending implementation plan

## Context

`framer/GameComponent.tsx` inlines a copy of this repo's engine logic by
hand. The constraint that forces this is real and is not up for
revision: Framer's code editor does not reliably resolve relative
imports across multiple pasted files, so the component must be one
self-contained `.tsx` whose only import is `react`. That is documented at
the top of the component and in `docs/framer-integration.md`.

A code review of the stats-and-shell work flagged the resulting
duplication as an Important maintainability finding. The ruling on
2026-07-30 was that the single-file constraint governs and the finding is
parked as accepted architecture, with a follow-up logged for exactly this
piece of work: generate the component's engine section from `src/` so the
two copies cannot drift.

**Drift is not hypothetical.** Surveying the component before designing
found that the duplication is wider than the review recorded, and that
one of the copies has already diverged:

| `src/` module | inlined at | status |
|---|---|---|
| `puzzleIndex.ts` | `GameComponent.tsx:51-73` | **drifted** — missing the `listLength <= 0` throw (`src/puzzleIndex.ts:21`) |
| `guessChecker.ts` | `GameComponent.tsx:75-125` | in sync |
| `shareCard.ts` | `GameComponent.tsx:127-134` | in sync |
| `gameState.ts` + `stats.ts` | `GameComponent.tsx:136-275` | in sync (the ~130 lines the review named) |

The review looked at the block that was correct and missed the block that
was not. That is the strongest available argument for a mechanical check
rather than a review convention.

`framer/ArchiveListComponent.tsx` and `framer/ArchiveDetailComponent.tsx`
inline nothing from `src/` and are out of scope. `src/animalData.ts` is a
build-time validator with no browser caller and is also out of scope.

**Why now:** `LAUNCH_DATE` is 2026-08-01. Every future engine change has
to be re-inlined by hand until this exists, and the storage schema is the
part of the engine most likely to change.

## 1. Architecture

A generator script, `scripts/generateFramerEngine.ts`, reads five `src/`
modules — the four rows of the table above, with `gameState.ts` and
`stats.ts` counted separately — transforms them into a flat dependency-free block, and splices
that block into `framer/GameComponent.tsx` between two sentinel comment
lines. Everything outside the sentinels — roughly 640 lines of `Modal`,
`StatsPanel`, `HOW_TO_PLAY`, `tokens`, and `styles` — is preserved
byte-for-byte.

The script is structured as pure functions plus a thin CLI so the
transformation is unit-testable without touching the filesystem:

- `renderEngineBlock(modules: EngineModule[]): string` — the whole
  transformation. Takes source text in, returns block text out.
- `extractRegion(fileText: string): string` — the current contents
  between the sentinels.
- `spliceRegion(fileText: string, block: string): string` — a new file
  text with the region replaced.
- The CLI reads and writes files and selects write mode or check mode.

`scripts/` is already inside `tsconfig.json`'s `include`, so the
generator is typechecked and tested like the rest of the repo.

## 2. Scope of the generated region

The generated block contains **all five modules in full**, including
declarations the component never calls (`getDaysSinceLaunch`,
`normalizeGuess`, `getHistory`, `getLastResult`, `getCurrentStreak`,
`hasPlayedToday`). This adds roughly 40 unused lines to the pasted file.

The alternative — walking the component for referenced identifiers and
emitting only their transitive closure — was rejected. It adds a
dependency-graph pass that can silently drop a declaration, and it makes
the generated block something other than a straight mirror of `src/`,
which is what gives the staleness check its meaning. Framer does not
tree-shake a pasted component, so the dead code costs a negligible amount
of bundle size and buys a generator with no analysis in it at all.

This was presented as an open question and left unanswered; it is
recorded here as a decision so it is not re-litigated.

## 3. Transformation rules

Modules are processed in a fixed order chosen so that every declaration
appears before the module that consumed it in `src/`:

```
src/puzzleIndex.ts
src/guessChecker.ts
src/shareCard.ts
src/stats.ts
src/gameState.ts
```

Order is a readability property rather than a correctness one — function
declarations hoist, and none of these modules run code at import time
beyond binding literal constants — but fixing it keeps the output
deterministic.

Each module is parsed with the TypeScript compiler API. `typescript` is
already a devDependency; no regex is used to identify or rewrite code.

1. **Drop** every `ImportDeclaration` and `ExportDeclaration`. This is
   what dissolves the `gameState.ts` ↔ `stats.ts` import pair.
2. For every remaining top-level statement, take `stmt.getText()` and
   remove the `export` modifier by slicing at the modifier's AST
   position. Never string-match the word `export`, which appears inside
   comments and could appear inside a string literal.
3. **Dedupe by declared name.** `MS_PER_DAY` is declared identically in
   both `src/puzzleIndex.ts:1` and `src/stats.ts:14`; a naive
   concatenation is a duplicate-`const` syntax error. Byte-identical
   redeclarations are skipped. A redeclaration with a different body is a
   hard error naming both modules and the identifier — that is a genuine
   conflict the generator must not paper over.
4. **Collision guard.** Parse the target file's statements *outside* the
   sentinels, collect their top-level declared names, and error if the
   generated block would shadow one. This converts a future "someone
   added a `todayDateString` export to `src/`" into a generate-time
   failure rather than a component that breaks on paste.

The emitted block opens with a header comment naming the generator and
the source modules, and each module's statements are preceded by a
`// --- from src/<module>.ts ---` marker.

## 4. Sentinels

Two exact-match lines delimit the region:

```
// ===== BEGIN GENERATED ENGINE — do not edit by hand =====
// ===== END GENERATED ENGINE =====
```

The generator errors if either line is absent, appears more than once, or
appears out of order. Whole-file generation was rejected because the
component's UI is the majority of the file and is not derived from
anything in `src/`.

The existing `// ---------- Engine logic (copied from src/*.ts, kept in
sync by hand) ----------` comment is replaced by the BEGIN sentinel, and
the file's header comment is updated to describe the generated region
rather than the hand-sync convention.

## 5. Collapsing the two deliberate differences

The component's copy differs from `src/` in two ways today:
`StorageLike` injection collapses to direct `window.localStorage` access
behind a `typeof window === "undefined"` guard, and `recordResult`
returns the whole `Stats` object rather than the streak number.

Preserving those differences is what would turn this script from an
inliner into a transformer: it would have to drop a parameter, rewrite
every call site, and swap a return type — either through substantial AST
surgery or by keeping hand-written function bodies in the generator's
configuration, which relocates the drift risk rather than removing it.

**Both differences are instead absorbed on the component side**, outside
the sentinels, so the generated block stays a verbatim mirror of `src/`.

A storage adapter replaces the first difference:

```tsx
// The generated engine takes a StorageLike so it can be unit-tested
// against a fake. In the browser that is window.localStorage — but the
// property access itself throws when cookies are blocked, and the object
// does not exist during SSR, so both are guarded here rather than inside
// the engine.
const browserStorage: StorageLike = {
  getItem(key) {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Quota exceeded, or storage blocked entirely. The game continues;
      // the result just will not survive a reload.
    }
  },
};
```

This is behaviour-preserving. `src/gameState.ts`'s `loadState` already
wraps `storage.getItem` in a `try`/`catch` that returns `emptyState()`;
an adapter returning `null` on throw reaches the same `emptyState()` one
line later. `saveState`'s `try`/`catch` likewise becomes redundant rather
than wrong.

The second difference is absorbed by calling the generated
`getStats(storage, today)`, which already exists in `src/gameState.ts`:

- `loadState().history` becomes `getHistory(browserStorage)`
- `setStats(recordResult(result))` becomes
  `recordResult(browserStorage, result)` followed by
  `setStats(getStats(browserStorage, todayDateString()))`

The hand-written `DailyResult` and `Stats` interfaces are deleted; both
now arrive from the generated block. `EMPTY_STATS`, `Animal`,
`CATEGORY_EMOJI`, and `todayDateString` are component-only and move
outside the sentinels.

### Accepted behavioural change

With storage blocked, today's component computes the post-game stats from
the in-memory history and shows the player "Played 1" for that session.
After this change it re-reads storage, finds nothing, and shows "No
specimens identified yet."

This is accepted. It matches the stats-and-shell plan's own Global
Constraint that blocked storage leaves every stat at zero, and a figure
that vanishes on reload is arguably worse than an honest zero. The only
way to keep the old behaviour is a component-side wrapper duplicating
`recordResult`'s filter/push/sort — reintroducing exactly the class of
duplication this work removes. It is added to the manual verification
checklist so it is observed rather than discovered.

## 6. Staleness detection

The CLI takes two modes:

- **write** (default, `npm run generate:framer`) — regenerates and writes
  the file, reporting whether anything changed.
- **check** (`npm run check:framer`) — regenerates in memory, compares
  against `extractRegion`, and on mismatch prints the first differing
  lines with context plus the command to fix it, then exits non-zero.

A freshness assertion also lives in the Vitest suite, reading the real
`src/` and `framer/` files. The redundancy is deliberate and the two
serve different readers: `npm test` is where a developer already is, so
that is where drift should surface locally; the `check` step names the
failure in the GitHub Actions UI and prints an actionable diff.

## 7. CI

The repo has no test workflow today — `.github/workflows/` contains only
`daily-archive.yml`, so `npm test` has never run on push. A new
`.github/workflows/ci.yml` runs on push to `master` and on pull requests:

```
npm ci
npm test
npx tsc --noEmit
npm run check:framer
```

The staleness check runs last so a stale region cannot mask a real test
failure.

## 8. Testing

`scripts/generateFramerEngine.test.ts` covers the pure functions with
inline fixture sources, plus one test against the real files:

- `import` and `export` are stripped; declaration bodies are untouched
- byte-identical cross-module redeclarations are deduped (`MS_PER_DAY`)
- a same-name, different-body redeclaration throws, naming both modules
- a name declared both in the block and outside the sentinels throws
- a missing, duplicated, or inverted sentinel throws
- content outside the sentinels survives a splice byte-for-byte
- module order in the output is deterministic
- **the committed region matches what the generator produces right now**

The component's UI has no automated harness in this project. Two manual
checks are appended to `docs/framer-integration.md`: a paste of the
regenerated file into Framer behaves identically to the current one, and
a blocked-cookies playthrough shows the empty-stats copy from §5.

## 9. Documentation

`docs/framer-integration.md` step 1 currently instructs the reader to
copy five `src/` files into one Framer file by hand. It is rewritten to
describe running `npm run generate:framer` and pasting the result, with
the sentinel contract and the component-side adapter explained. The
component's header comment is updated to match.

## Rejected

- **Supabase or any hosted store for player stats.** Raised during
  design. `docs/legal/privacy-policy.md:32` promises players that
  progress "never leaves your device and is never sent to us or any
  server we control," and line 71 states there is no account or sign-up;
  moving stats off-device would contradict a published legal document.
  Without accounts a hosted store still needs an anonymous id kept in
  `localStorage`, so it adds a service and a network round trip for the
  same result. It also does not address this work: the duplication is in
  `computeStats`, the streak walk, and the migration — persistence is
  about twenty lines at the edge. An async store would make it worse by
  forcing the same async rewrite into both copies by hand. Global stats,
  leaderboards, and cross-device sync remain plausible *additive*
  features and are unaffected by this design.
- **Whole-file generation of `GameComponent.tsx`.** The UI is the
  majority of the file and derives from nothing in `src/`.
- **Annotating `src/` with codegen directives** (`// @framer-omit` and
  similar). Couples the engine to its consumer and makes `src/` harder to
  read for the benefit of one downstream file.
- **Keeping the two deliberate differences via AST rewriting.** See §5.
- **Typechecking `framer/` in CI.** Would require adding `react` and
  `@types/react` as devDependencies to a repo that currently has neither,
  and would surface a backlog of pre-existing errors across 900 lines of
  never-typechecked JSX. The generated region is already covered by
  `src/` being typechecked; what would be newly covered is the UI, which
  is beyond this work.

## Deferred

- **Fixing the `puzzleIndex` drift as its own commit.** The missing
  `listLength <= 0` guard is corrected as a side effect of the first
  generated output. Recording it here so the behaviour change is
  traceable to a decision rather than looking accidental in the diff.
- **A shared `compareByDate` comparator.** `(a, b) =>
  a.date.localeCompare(b.date)` is inlined in three places across
  `gameState.ts` and `stats.ts` — already logged as a deferred minor in
  the stats-and-shell ledger. Unrelated to codegen.
- **Generating the archive components.** Neither inlines `src/` logic
  today. If either ever does, it reuses the same sentinel contract.

# Field Journal — unresolved: component renders nothing in Framer

**Written 2026-08-01, end of session. This is an open bug, not a design note.**

## Symptom

`framer/ArchiveListComponent.tsx` was pasted into the Archive List component
in Framer. The `/archive` page loads, the component **is on the canvas**, and
it **renders nothing at all** — not even the "Field Journal" header, which is
unconditional and does not depend on any data.

The browser console reports **many errors**. Their text was not captured
before the session ended. **Getting that text is step one — everything below
is ranked guesswork until then.**

## What is already ruled out

Do not spend time re-checking these.

- **Routing.** The Framer page paths are `/archive` and `/archive-detail`,
  confirmed by Framer's own assistant. The page loads; it is not a 404.
- **The component is placed.** It is visibly on the canvas, so this is not
  the "forgot to drag it onto the page" case.
- **The journal logic.** `buildJournal` cannot throw on empty data: it returns
  early when history is empty, and an empty archive yields an empty list. 12
  unit tests cover it.
- **Type correctness.** `npx tsc --noEmit --jsx react-jsx --target es2020
  --lib es2022,dom --module esnext --moduleResolution bundler --skipLibCheck
  framer/ArchiveListComponent.tsx` is clean apart from the unavoidable
  `Cannot find module 'react'`.
- **Staleness.** `npm run check:framer` reports both generated blocks current.
- **The repo suite.** 212 tests pass, project `tsc` clean.

An empty journal is *expected* right now — `data/archive.json` is `[]` until
the daily job first runs — but that should render the "Your journal is empty"
message, not a blank component.

## Ranked candidates

1. **A duplicate top-level declaration.** This component received a generated
   engine block for the first time this session, carrying `src/stats.ts`,
   `src/gameState.ts` and `src/journal.ts`. If any name in that block collides
   with something in the hand-written half, the module fails to evaluate and
   the component renders nothing. `assertNoCollisions` runs on generate and
   passed — but it only inspects the file's own hand-written region, not
   anything Framer injects around a pasted component. A console error reading
   `X has already been declared` confirms this instantly.
2. **The starter-code collision**, one more time. If any of Framer's default
   component code survived above or below the paste, the file exports two
   components. Documented in `docs/framer-integration.md`; it has already cost
   this project an evening. Verify the file's first line in Framer's editor
   reads `// WhichAnimalToday — Archive List (Framer code component)` and that
   there is no `addPropertyControls` block below the paste.
3. **The instance is bound to a different component** than the one that was
   pasted into — e.g. a second "Archive List" component exists and the canvas
   instance points at the old one.
4. **A runtime throw in the fetch or storage path.** `browserStorage.getItem`
   is already wrapped in try/catch, and a failed fetch is caught and sets the
   error state, so this is unlikely — but the console will say.

## What to do first

1. Open the published `/archive` page, open the console, reload, and **copy
   the full error text**. Do not paraphrase it — the exact wording
   discriminates between candidates 1, 2 and 4.
2. If it names a duplicate declaration, compare the generated block's
   top-level names against the hand-written half of
   `framer/ArchiveListComponent.tsx`.
3. If the console is clean, the problem is presentational — check the canvas
   frame's height, since a code component with no explicit size can collapse.

## Rollback, if it needs to be live-clean quickly

The previous archive page worked. `git log --oneline framer/ArchiveListComponent.tsx`
shows the history; the commit before `c38d790` is the last version without the
journal. Reverting only that file and re-pasting restores the old archive
without touching the daily game, which is unaffected and working.

## Related known gap

Two real breakages this session — a missing transitive module, and a mangled
template literal — were caught **only** by running `tsc` directly against a
component. `npm test`, `npm run check:framer` and the project `tsc` all passed
in both cases, because `framer/` sits outside the tsconfig `include`.

Adding the three `framer/` components to a typecheck step is the highest-value
small change available to this repo. It would not have caught the current bug
(which is a runtime problem), but it would have caught both of the others.

## Console output captured — the picture changed

The log is dominated by blocked ad-tracker requests (LinkedIn, Google,
Twitter) on `framer.com` itself. Noise. Two lines are signal:

```
project-icwmpunyhpi3bklgxe5j.framercanvas.com/archive → 404
❌ [web:services] ServiceError.TimedOut: __ModulePreviewSandbox__
```

**The timeout is the failure.** Framer's module preview sandbox never
finished building the component. A component that fails to build renders
nothing and reports nothing inside the page — which is exactly the symptom.

**Nothing in the log implicates the code.** No syntax error, no duplicate
declaration, no failed fetch of `archive.json`, no React error. Candidates 1,
2 and 4 above are unsupported by evidence; do not chase them until there is
a reason to.

**The environment is the prime suspect.** The captured user-agent is
DuckDuckGo, and the log shows heavy tracker blocking. Framer's preview
sandbox runs on the separate `framercanvas.com` origin and needs cross-origin
requests; aggressive blocking starves it, and "TimedOut" is what that looks
like. The `framercanvas.com/archive` 404 also confirms the testing was done
in the editor preview, not on the published site — a divergence this project
has already been bitten by.

**Next steps, in order:**

1. Open the Framer editor in Chrome or Edge and view the archive page.
2. Publish, then visit `whichanimaltoday.com/archive` directly. The published
   site does not use the preview sandbox, so this failure cannot occur there.

Only if it still renders blank in a non-blocking browser on the published
site should the code-side candidates above be investigated.

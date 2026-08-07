# A Test Harness for `framer/` — Design

**Date:** 2026-08-07
**Status:** Approved, not implemented.

## Context

`framer/` holds the four components pasted into Framer, and none of them has any
automated coverage. The directory sits outside `tsconfig.json`'s `include`, so
`npm test`, `npm run check:framer` and `npx tsc --noEmit` **all pass on a broken
component**. The only gate is the manual checklist in
`docs/framer-integration.md`.

This is not a theoretical gap. It has cost real breakages:

- **2026-08-01, twice.** A missing transitive module in a generated block and a
  mangled template literal both shipped, and were caught only by someone running
  `tsc` by hand against the file. The exact command is written out in
  `docs/follow-ups.md` because there was nowhere else to put it.
- **The bonus round** — `playing → bonus → done`, the one-shot lock, and the
  reload-restore path — has never been tested at all.
- **Two fixes in the last two days** (the session-date pinning on 2026-08-07 and
  the focus trap the same day) both shipped with "verified by reading it and
  running tsc" as the entire verification story.

That last point is the trigger. Two consecutive fixes wanting a harness is the
signal that the harness is now cheaper than continuing without it.

### What makes this easier than it looks

The components import **only from `react`**. No `framer` package, no
`addPropertyControls`, nothing to mock. The `@framerSupportedLayoutWidth`
annotations are JSDoc comments. Each component is a plain default export and
makes exactly one `fetch` call. Nothing about Framer needs simulating.

## Decisions

### 1. Two layers, because they catch different failures

**Type checking** catches the breakages that actually shipped — a module that
does not resolve, a literal that does not parse. **Render tests** catch phase
transitions, focus behaviour and storage round-trips, none of which a type
checker can see. Neither substitutes for the other, and the type layer is cheap
enough that skipping it would be perverse.

### 2. `framer/` gets its own tsconfig, not a place in the root one

`tsconfig.framer.json` extends the root config and adds `jsx: "react-jsx"`,
`"DOM"` to `lib`, and `include: ["framer"]`.

**Adding `framer/` to the root `include` instead would be a real regression.**
The root config sets `lib: ["ES2022"]` with no DOM, and that is deliberate:
it is what stops `src/` reaching for `localStorage` or `document` directly
instead of the `StorageLike` abstraction the whole engine is built around.
`src/` is meant to be environment-agnostic so it can be generated into a browser
component *and* run under Node in tests. Widening `lib` globally would dissolve
that boundary silently, and nothing would fail until someone used it.

A `check:types:framer` script runs it, and replaces the hand-typed `npx tsc`
incantation currently recorded in `docs/follow-ups.md`. It goes into CI beside
the existing checks.

### 3. Render tests use jsdom, opted into per file

New devDependencies: `react`, `react-dom`, `@types/react`, `@types/react-dom`,
`@testing-library/react`, `@testing-library/dom`, `jsdom`. **All dev-only** —
Framer supplies React at runtime, so nothing here reaches players or the
component paste.

Each test file opts in with a `// @vitest-environment jsdom` docblock rather
than the environment being set globally. `src/` has 384 fast, DOM-free tests and
they should stay that way; a global jsdom environment would slow every one of
them for the benefit of four files.

Test files sit beside the components — `framer/GameComponent.test.tsx` — which
is how `src/` and `scripts/` already work. Vitest's default include already
picks up `**/*.test.tsx`, so no config change is needed to find them.

### 4. A shared harness module

`framer/testHarness.tsx` provides:

- `renderComponent(node)` — render and return Testing Library queries.
- `stubFetchJson(payload)` — stubs the single `fetch` each component makes,
  and restores it afterwards.
- `seedStorage(entries)` — writes a `whichanimaltoday_state` v2 payload so the
  restore path can be exercised without reaching into the component.
- `atTime(iso, fn)` — runs `fn` with the system clock pinned.

Keeping these in one place matters more than usual here: four components make
the same fetch-and-restore shape, and four copies of the setup would drift.

### 5. Scope: only paths with a history, or newly written and unverified

Not coverage. `GameComponent.tsx` is roughly 2,200 lines and chasing a
percentage would take days and crowd out everything else. The first pass tests
exactly five things:

1. **Session-date pinning.** Advance the clock past UTC midnight mid-session;
   the result must still be filed under the day the puzzle loaded, with a
   matching `puzzleNumber`. Fixed 2026-08-07, currently unverified.
2. **Focus trap.** Tab from the last focusable element wraps to the first;
   Shift+Tab from the first wraps to the last; focus outside the card is pulled
   back in. Added 2026-08-07, currently unverified.
3. **Focus restore across a panel switch.** Open Statistics, switch to How to
   Play, close — focus lands on the How to Play button. This is the bug React's
   effect ordering caused.
4. **Bonus phase transitions.** `playing → bonus → done`, and the win is banked
   *before* the bonus round opens, so the bonus can never cost the day.
5. **Reload restore.** Seed storage with today's result, render, and land on the
   reveal screen rather than a fresh puzzle.

Roughly a dozen tests. The point is to prove the harness on real bugs rather
than on trivia.

## Components

| Unit | Responsibility |
|---|---|
| `tsconfig.framer.json` | Type configuration for the component directory only. |
| `framer/testHarness.tsx` | Render, fetch stub, storage seed, clock pin. |
| `framer/GameComponent.test.tsx` | The five behaviours above. |
| `package.json` | `check:types:framer`; the new devDependencies. |
| `.github/workflows/ci.yml` | Run the new type check. |

## Risks

**Time control is the fiddly part.** The component reads the clock and runs a
countdown on an interval. Fake timers interact badly with React's async
rendering and produce `act()` warnings that are easy to silence and hard to
diagnose. The tests will use `vi.useFakeTimers` with `shouldAdvanceTime` where
an interval must keep running, and pin the clock with `vi.setSystemTime`. If
that proves unstable, the fallback is to stub the `Date` constructor for the
specific assertions rather than globally — noted so the next reader knows a
decision was made rather than stumbled into.

**Integration tests against a large component can be brittle.** Every query goes
through role and accessible name — `getByRole("button", { name: "Statistics" })`
— never through styles, class names or DOM structure. That ties the tests to
behaviour a user can perceive, which is also the thing worth protecting. It has
a happy side effect: a test that cannot find a control by its accessible name
has found an accessibility bug.

**These tests do not prove the paste worked.** They exercise the file in this
repo. A component that is correct here and mis-pasted into Framer, or dropped in
a zero-height frame, still renders nothing — both documented failures. The
manual checklist in `docs/framer-integration.md` remains the gate for *that*,
and this harness does not replace it.

## Out of scope

- **The other three components.** `TimerMode`, `ArchiveList` and
  `ArchiveDetail` get the type-check layer immediately, and render tests when
  something in them next breaks or changes. Writing tests for code nobody is
  touching is how a harness becomes a chore.
- **Visual or snapshot testing.** Snapshots of a 2,200-line component would
  break on every styling change and teach everyone to re-record them without
  looking.
- **The catalogue page**, specced 2026-08-06. It will be written with tests
  because this harness will exist by then.

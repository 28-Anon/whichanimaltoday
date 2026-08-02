# Field Journal — resolved

**Opened and closed 2026-08-01/02. Kept because the false leads are the
useful part.**

## What the problem actually was

The Field Journal component rendered nothing on the `/archive` page. **The
code was never at fault.** Two separate environment problems, in sequence:

1. **The component was not placed on the page.** Pasting code into a Framer
   code component does not put that component on a page — it has to be
   dragged onto the canvas as well. The page rendered its nav and footer with
   an empty gap between, and the browser console was completely clean.
2. **Once placed, it was clipped.** A code component inside a frame with a
   fixed or collapsed height renders into a box with no visible area. No
   error, nothing in the console.

The decisive evidence was Framer's own code-preview panel, which rendered
the component correctly — "Field Journal / EVERY SPECIMEN YOU HAVE
IDENTIFIED" and the empty-state line — while the page showed nothing. That
preview renders the component **in isolation**, so it proves the code works
and says nothing at all about the page.

## Two theories that were wrong, and why

Recorded because both were reasonable and both cost time.

**"A duplicate declaration from the generated block."** The component had
just received a generated engine block for the first time, so a name
collision was the obvious suspect. There was never any evidence for it —
the console showed no `X has already been declared`, and `assertNoCollisions`
passes. Do not reach for this again without an actual error message.

**"Framer's preview sandbox is timing out."** The console did contain
`ServiceError.TimedOut: __ModulePreviewSandbox__`, and the testing was
happening on `framercanvas.com` in a tracker-blocking browser, so this looked
compelling. It was a real message and an irrelevant one: the same blank
render happened on the published site in Chrome with a completely clean
console. **A real error message in the log is not automatically the error
you are chasing.**

## What to check first if a Framer component ever renders nothing again

In this order, because it goes cheapest-first and this is the order that
would have solved it immediately:

1. **Is the component actually on the page?** Open the page on the canvas and
   look at the Layers panel. Not the code editor — the page.
2. **Does the code-preview panel render it?** If yes, the code is fine and the
   problem is placement, sizing or publishing. Stop looking at the code.
3. **Is the frame around it collapsed?** Set the component to fill width and
   give the parent a real height.
4. **Are you on the published site?** The editor preview resolves routes
   differently and has its own failure modes. `framercanvas.com` in the URL
   means you are not testing what your players see.
5. **Only then** read the console for a code-level error.

## The gap this exposed in the repo

`framer/` sits outside the tsconfig `include`, so `npm test`,
`npm run check:framer` and `npx tsc --noEmit` **all pass on a broken
component**. Two genuine breakages during this work — a missing transitive
module in a generated block, and a mangled template literal — were caught
only by running tsc directly against the file:

    npx tsc --noEmit --jsx react-jsx --target es2020 --lib es2022,dom \
      --module esnext --moduleResolution bundler --skipLibCheck framer/X.tsx

Only `Cannot find module 'react'` is expected; any `TS1xxx` is real. Adding
this to a gate remains the highest-value small change available to this repo.
It would not have caught the placement problem above — that was never a code
problem — but it would have caught both of the others.

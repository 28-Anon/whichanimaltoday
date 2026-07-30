# Per-Day Puzzle Payload — Design

**Date:** 2026-07-30
**Status:** Approved in principle, implementation deliberately deferred
(see "When to build this")

## Context

`framer/GameComponent.tsx` fetches the whole of `data/animals.json` on every
page load, then picks the day's animal client-side with
`getTodayPuzzleIndex(new Date(), LAUNCH_DATE, animals.length)`.

Two costs grow with the animal list:

1. **Payload.** 34 animals is roughly 22KB. The 500 the MVP design targets
   is roughly 320KB — hints, fun facts, and attribution for animals up to
   eleven months away, downloaded by every visitor on every load. On mobile,
   on the traffic volumes the AdSense model needs, that is real.
2. **Spoilers.** MVP design §1 accepted that anyone inspecting network
   requests can read the answer. Today they can read *every* answer, for the
   entire cycle.

## What the current design gets right

The client-side date arithmetic is **robust to infrastructure failure**. The
correct animal is derived from the date and the list, so the game shows the
right puzzle even if the daily GitHub Action fails, runs late, is
rate-limited, or never ran. Nothing about serving the day's puzzle depends on
a job having succeeded.

Any pre-generated per-day file gives that up: a failed job means a stale or
missing animal for every visitor until someone notices. That property is the
reason this design keeps a fallback rather than simply switching.

## Decision

Generate a small per-day file, and **keep the client-side computation as a
fallback**.

- Happy path: fetch `data/today.json` — one animal, a few hundred bytes.
- Fallback: if `today.json` is missing, unfetchable, or stale, fetch
  `animals.json` and compute the index exactly as today.

Payload drops by roughly 99% on the happy path, the spoiler surface shrinks
to the current day, and a failed Action degrades to today's behaviour rather
than to a broken game.

### Alternatives considered

- **Per-day file only, no fallback.** Simpler, and the smallest possible
  client. Rejected: it converts a silent job failure into a site-wide
  outage, and the job runs unattended.
- **Chunked list** (e.g. one file per month of puzzles). Cuts payload
  meaningfully with no new failure mode, since chunks are still derived
  client-side from the date. Rejected as strictly worse than the chosen
  option on both payload and spoilers, for similar work.
- **Do nothing.** Legitimate today (see "When to build this"), but the cost
  grows monotonically with content, and content growth is the plan.

## 1. Data model

`data/today.json`, committed by the daily job:

```json
{
  "date": "2026-08-14",
  "puzzleNumber": 14,
  "animal": {
    "commonName": "...",
    "aliases": ["..."],
    "imageUrl": "...",
    "hint1": "...",
    "hint2": "...",
    "hint3": "...",
    "funFacts": "...",
    "category": "...",
    "imageAttribution": "..."
  }
}
```

`animal` is exactly the existing `Animal` shape the component already
consumes, so the render path needs no change. `date` is the UTC calendar day
the file is for, and is what makes staleness detectable. `puzzleNumber` is
precomputed so the client does not need `LAUNCH_DATE` on the happy path —
though it still needs it for the fallback, so the constant stays.

## 2. Generation

Extend the existing daily workflow rather than adding a second one — it
already runs once a day and already commits to the repo.

`scripts/runDailyArchive.ts` currently appends the day's entry to
`archive.json`. It computes the same index the client does, so it already
knows the day's animal. Add a sibling step that writes `today.json` from
that same value, in the same commit.

Requirements:

- **Idempotent.** Re-running on the same day rewrites identical content and
  produces no spurious commit, matching how the archive append already
  behaves.
- **Same `LAUNCH_DATE`.** The existing constraint that `LAUNCH_DATE` must
  match between `scripts/runDailyArchive.ts` and the component still holds,
  and now also governs `puzzleNumber` in this file.
- **Written even when the archive append is a no-op**, so a re-run repairs a
  missing `today.json`.

## 3. Client behaviour

Replace the single fetch with: try `today.json`, validate, fall back.

```
1. fetch today.json
2. if it resolves AND parses AND entry.date === todayDateString()
     -> use entry.animal and entry.puzzleNumber
3. otherwise
     -> fetch animals.json and compute the index as today
4. if that also fails
     -> the existing error phase, unchanged
```

Step 2's date check is the staleness guard and is not optional: a job that
stopped running three days ago serves a valid, parseable, *wrong* file, and
that is the failure this design exists to survive.

The fallback keeps `animals.json` as a published artifact. The payload win
applies to the happy path, which is effectively every load.

**Duplication note.** This logic lands in `framer/GameComponent.tsx`, which
hand-duplicates engine code from `src/` (see `docs/follow-ups.md`). The
fetch-and-fallback decision should live in a pure, testable function in
`src/` — taking the two fetch results as arguments rather than performing
them — so the component holds only the network calls. That keeps the
untestable surface as thin as possible.

## 4. Testing

New pure function in `src/`, unit-tested:

- A valid `today.json` whose `date` matches today is used, and its
  `puzzleNumber` is preferred over a computed one.
- A `today.json` whose `date` is yesterday is rejected as stale.
- A `today.json` whose `date` is in the future is rejected as stale.
- Malformed or missing `animal` is rejected.
- On rejection, the computed-index path is used and yields the same animal
  the current implementation would.

The generation side extends the existing `scripts/` tests: a fresh write, an
idempotent re-run producing byte-identical content, and a run that repairs a
missing file when the archive entry already exists.

The network calls themselves are verified by the manual checklist in
`docs/framer-integration.md`, which gains: today's animal loads normally;
with `today.json` renamed or hand-edited to a stale date, the game still
shows the correct animal via the fallback.

## When to build this

**Not yet.** At 34 animals the payload is ~22KB and this is a solution to a
problem that does not exist — building it now would be premature.

Sensible trigger: when `data/animals.json` passes roughly **150 animals**,
or ~100KB, whichever comes first. The spoiler benefit is available earlier if
that ever becomes a priority on its own.

This document exists so the decision is settled while the reasoning is
fresh, and so whoever picks it up does not have to re-derive why the
client-side fallback is not optional.

# Content Rebalance — Design

**Date:** 2026-08-05
**Status:** Approved, not implemented.

## Context

The puzzle list is 58 animals in acceptance order, which produces a difficulty
cliff with a date on it. Puzzles #1–34 are broadly recognisable — giraffe,
sloth, octopus, penguin, fox. From **#35 on 4 September** there are 24
consecutive puzzles of Mongolian Saiga, Chowsingha, Bald Uacari, Ibisbill,
Spoon-billed Sandpiper and Horned Screamer, fifteen of them obscure birds.

Of 38 everyday animals checked, the list contains **none**. No dog, cat, cow,
rhino, elephant, lion, owl, shark, snake or bee.

This is not an oversight. `scripts/scoreCandidates.ts` scores every candidate
against a rubric that says, verbatim, *"Score DOWN, hard: lion, tiger, wolf,
leopard and anything equally famous"* and *"Score DOWN: … domesticated
animals"*. The pipeline is built to reject exactly these animals. Separately,
`scripts/acceptCandidates.ts` does `animals.push(...)`, so every accepted batch
lands at the end of the array as a contiguous block — which is what turned a
selection bias into a cliff.

So there are three distinct problems: **selection**, **sourcing**, and
**ordering**.

### Why this matters more than it looks

`computeStats` only extends `currentStreak` when the last result has
`solved: true` (`src/stats.ts`). A day nobody can win breaks every active
streak simultaneously. The streak is the retention mechanic, retention is the
revenue model, and sharing — the only free acquisition channel — runs on people
posting wins. A month of guaranteed losses starting 4 September attacks all
three at once.

### The rubric is not wrong, it is one-dimensional

"Lion" genuinely is a weak puzzle: everyone gets it instantly and nobody
screenshots it. The flaw is optimising a single axis (strangeness) when a daily
game needs two — strange enough to be interesting, winnable enough that people
come back. Wordle's answer list is curated common words for this reason.

## The key insight: nameability, not obscurity

The game is free text, three guesses, a clue after each. Two very different
things have been sharing the word "hard":

- **Platypus** is a hard puzzle. Most players won't get it cold, but every clue
  moves them toward a word they can type. Losing is possible; winning is
  earned.
- **Chowsingha** is not a hard puzzle. No clue makes anyone produce that
  string. It is a guaranteed loss wearing a puzzle's clothes.

Difficulty tiers must therefore encode **can an average person produce this
name**, not how strange the animal is.

## Decisions

### 1. Data model

Two new fields on `AnimalRecord`:

- **`difficulty: "easy" | "medium" | "hard"`** — required on every record.
  - `easy` — named instantly from the photo. Fox, owl, cow, penguin.
  - `medium` — recognised on sight, the name needs a clue or two. Pangolin,
    capybara, tapir.
  - `hard` — genuinely tough, but nameable once clued. Platypus, shoebill,
    resplendent quetzal.
- **`dailyEligible?: boolean`** — optional, absent means `true`. Only ever
  written as `false`, so the file stays quiet and the intent reads as "this one
  is excluded" rather than "this one is allowed".

`difficulty` is required rather than optional because an absent tier would
silently default to something, and the whole point is that the tier is a
deliberate judgement.

### 2. The unspellable animals stay, but leave the daily rotation

Roughly twelve records get `dailyEligible: false`: Mongolian Saiga, Chowsingha,
Bald Uacari, Great Argus, Saola, Ibisbill, Spoon-billed Sandpiper, Horned
Screamer, Boat-billed Heron, Hoatzin, Northern Cassowary, Helmeted Hornbill.
The exact list is a judgement call to be confirmed during implementation; the
test is nameability, not obscurity.

**Not all 24 obscure animals go.** Shoebill, Dodo, Resplendent Quetzal,
Blue-footed Booby and Red-eyed Tree Frog are perfectly nameable and stay as
`hard` daily puzzles.

They stay in `data/animals.json` and keep earning their keep:

- **Beat the Clock is multiple choice**, so recognising a Chowsingha among four
  options is a good question and spelling never arises.
- **The archive still shows them**, so the research, photographs, hints, fun
  facts and bonus rounds already paid for are not wasted.

Deleting them would also shrink the timer-mode pool, which is the one place
variety matters most.

### 3. Ordering is computed at build time, not at runtime

A pure function decides the calendar, and a script bakes the result into
`data/animals.json` by rewriting the array in that order.

**This is the load-bearing choice.** The client already indexes the array by
day, so baking the order into the file means `getTodayPuzzleIndex` and the
whole ordering mechanism need no client change at all. Reordering ships as a
data change.

That is not a claim that nothing reaches Framer. The eligibility filter in §5
*is* a client change — one small one, which flows through
`npm run generate:framer` and then has to be pasted once. It is the only paste
this work requires, and it happens once rather than on every future reorder.

The layout targets **six easy-or-medium days and one hard day per seven**, with
**no two hard days adjacent**. A repeating seven-slot pattern —
`easy, medium, easy, hard, medium, easy, medium`, so three easy, three medium
and one hard — achieves this exactly, and is anchored so the hard slot falls on
a Saturday, when players have more time.

**Degrade, never throw.** When a tier runs out of animals the function falls
back to the nearest available tier rather than failing. A content script that
throws on a Saturday because the hard pile is empty is worse than one that
serves a medium.

**Determinism is required**: same input, same output, so the layout is
testable and a re-run cannot silently reshuffle the calendar.

### 4. The already-played prefix is frozen

Puzzle #5 is live today. Only index 5 onward — puzzle #6, tomorrow — may move.
The ordering script **asserts that positions 0..4 are unchanged and exits
non-zero otherwise**. This is not a comment; it is a check, because the failure
is invisible until a player reports that yesterday's animal changed.

This constraint tightens by one position every day, which is why this work is
cheapest now.

### 5. The client filters, so the eligible pool is contiguous

The ordering script writes eligible animals first, in computed order, and
appends the ineligible ones after. A `selectDailyAnimals(animals)` helper in
`src/` filters `dailyEligible !== false`, and the game indexes the filtered
list.

The filter lives in `src/` rather than in the component so it reaches Framer
through `npm run generate:framer` rather than by hand. Timer mode continues to
use the full unfiltered list and needs no change.

None of puzzles #1–5 are ineligible, so filtering does not disturb the frozen
prefix. The ordering script asserts this too.

### 6. Sourcing: hand-curated, not the pipeline

Roughly 30 everyday animals — cow, rhino, owl, shark, elephant, kangaroo,
snake, bee, dolphin, and so on — are chosen by hand and approved by the owner
before entering the pipeline for hints, fun facts and images.

The discovery step exists to surface obscure species from taxonomic databases.
Pointing it at "cow" is the wrong tool, and the candidate pool confirms it:
searching all 1,632 candidates finds no giraffe, shark, chicken or panda, and
the apparent hits for cow, dog and horse are wild species with those words in
their names (African Wild Dog, Bactrian camel). The pool cannot supply what is
needed.

### 7. The rubric stays as it is, and the imbalance becomes loud instead

`scoreCandidates.ts` keeps its bizarreness rubric. It is doing its job for its
purpose, and relaxing it would flood the pool with lions and tigers — the
puzzles the rubric correctly calls boring.

Instead, a test asserts the **eligible pool holds at least 70% easy-or-medium
animals**. The seven-slot pattern consumes six of seven days as easy-or-medium,
so a pool below roughly that ratio cannot fill the calendar and starts
degrading hard animals into medium slots — 70% is the floor with enough
headroom to notice before players do. Future discovery runs will keep adding
obscure species; when they tip the balance, CI fails and says so. This turns a silent drift into a visible
one, which is the same trick the credits-page guard uses.

A comment in the rubric records that it is deliberately not the source of easy
animals, so the next reader does not "fix" it.

## Phasing

The cliff can be removed **without adding a single animal**, and should be,
because sourcing 30 new records is slow and 4 September is not.

**Phase 1 — tier, flag, reorder what exists.** Assign `difficulty` to all 58,
set `dailyEligible: false` on the twelve unspellable ones, build the ordering
function and the script, reorder from index 5. This alone removes the cliff:
the remaining 46 eligible animals get spread across the calendar instead of
arriving as a block, and no daily puzzle is unwinnable. Ships in one sitting
and needs no new content.

Its cost is honest: 46 eligible animals means repeats begin around 16
September rather than 27 September. **A slightly shorter run of winnable
puzzles beats a longer one that stops being playable on 4 September** — and
repeats are far less damaging than losses, because a returning player who
recognises an animal still wins the day and keeps their streak.

**Phase 2 — add the everyday animals.** Curate ~30, run them through the
pipeline, extend the run to roughly 76 days and lift the easy-or-medium ratio.

Phase 1 is the whole urgency. Phase 2 is ordinary content work that can
proceed at whatever pace suits.

## Components

| Unit | Responsibility |
|---|---|
| `src/puzzleOrder.ts` | Pure. Tier partitioning and the seven-slot layout. No I/O. |
| `src/animalData.ts` | Extend `AnimalRecord` and `validateAnimalData` for the two new fields. |
| `src/puzzleIndex.ts` | Add `selectDailyAnimals`; reaches Framer via codegen. |
| `scripts/orderAnimals.ts` | Reads `data/animals.json`, applies the layout, asserts the frozen prefix, writes the file. New `npm run content:order`. |
| `scripts/animalsCategories.test.ts` | Extend, or add a sibling, for the balance and invariant assertions on live data. |

## Testing

Unit tests on `src/puzzleOrder.ts`:

- the seven-slot ratio holds across a full cycle
- no two hard days are adjacent, including across week boundaries
- a tier running dry degrades to the nearest tier instead of throwing
- the same input produces the same output twice
- an empty or single-animal list does not throw

Data tests against `data/animals.json`:

- every record has a valid `difficulty`
- eligible pool is at least 70% easy-or-medium
- no two adjacent eligible entries are both `hard`
- ineligible records all sit after the eligible ones

The ordering script's frozen-prefix assertion is verified by hand once, by
running it against a deliberately corrupted prefix, and recorded in
`docs/follow-ups.md` — matching the repo's convention for entry-point scripts
that call `main()` at import time and therefore have no unit tests.

## Out of scope

- **The catalogue / animals page.** Requested separately, gated behind
  completing the daily. Its own spec.
- **Changing the game mechanic.** Multiple choice on hard days was considered
  and rejected: it makes the core interaction inconsistent day to day.
- **The Beat the Clock leaderboard**, deferred 2026-08-04.
- **Replacing the seven images the audit flagged.** Tracked separately; the
  first of those is 30 days out.

## Consequences worth stating

- The run extends from 58 days to roughly 76 before repeats begin — moving ~12
  animals out of the daily rotation while adding ~30 is a net gain of ~18 days.
- Because the pattern repeats every seven days, each slot always falls on the
  same weekday. This is intentional and gives the week a rhythm, in the way the
  NYT crossword hardens through the week. It is worth knowing rather than
  discovering.
- Adding ~30 animals is real content work: each needs an image passing both
  audit passes, three hints, fun facts and a bonus round.

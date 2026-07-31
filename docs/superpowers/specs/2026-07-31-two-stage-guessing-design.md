# Two-Stage Guessing — Design

**Date:** 2026-07-31
**Status:** Approved. Launch-day hotfix ships 2026-08-01; the feature itself
ships as v1.1, after launch.

## Context

The owner played the live game as a customer and hit puzzle #34. The photo is
a star-nosed mole. They guessed `mole`, which is the correct animal, and lost.

That is not a hard puzzle — it is a data inconsistency. Most records name the
**family** and carry the species as an alias (`Sloth`, with
`three-toed sloth` and `Bradypus variegatus` in `aliases`). A handful name the
**species** with no broad alias at all:

```json
{
  "commonName": "Star-Nosed Mole",
  "aliases": ["Condylura cristata"]
}
```

So `mole` is a loss, while the equivalent guess on a different day is a win.
Seven records have this shape — species-level `commonName`, aliases holding
only the scientific name: `Star-Nosed Mole`, `Emperor Penguin`, `Fennec Fox`,
`Leopard Gecko`, `Hawksbill Sea Turtle`, `Monarch Butterfly`, `Sea Otter`.

The cheap fix is to add the broad names as aliases. That resolves the
unfairness and throws away the interesting half of the specimen — the reason
a star-nosed mole is worth featuring is the star, and "you said mole,
correct, done" never mentions it.

## Decision

Split the guess into two stages.

**Stage one** is the game as it exists: three free-text guesses at the
animal, a clue after each. Its answer becomes the **family** — `mole`.

**Stage two** is a new bonus round, offered only to players who solved stage
one. Four options, one shot, no take-backs: *you found a mole, but which
one?*

Stage two is a **bonus, not a gate**. Solving stage one is the win; it
records the result, protects the streak, and fills the guess distribution
exactly as today. Stage two can only add.

That last point is the design's load-bearing decision. The appeal being
chased here is the near-miss — a player who *almost* had it wants another go
tomorrow. A player whose twenty-day streak was broken by a coin flip on a
puzzle they had already solved feels cheated, and a game that punishes you
for a win it just awarded reads as a bug even when it is deliberate. Gating
the win on stage two converts anticipation into resentment. Making it purely
additive keeps the appeal and removes the failure mode.

### Alternatives considered

- **Widen the aliases and stop there.** One line of data per record, ships
  today, fixes the unfairness completely. Rejected as the whole answer
  because it makes the game *easier* and nothing else — the direction the
  owner wants is more to do, not less. **Adopted as the launch-day hotfix**
  (see below), because it is the correct interim state and carries no risk.
- **Stage two gates the win.** Strongest possible stakes. Rejected: see
  above.
- **Half credit** — animal-only is a partial solve, tracked separately from
  full solves. Honest, but it means two of everything: two streaks, two
  distributions, two numbers in the share text, a crowded stats panel. The
  complexity buys a distinction most players will not notice.
- **A species round on every animal, always.** Rejected: several animals have
  no honest species split, and forcing one turns the round into "pick the
  Latin binomial", which is trivia rather than guessing.

## 1. Schema

Two optional fields on `AnimalRecord`. Optional means every existing record
stays valid and no migration is needed.

```ts
species?: string;              // "Star-Nosed Mole" — display only
bonus?: {
  question: string;            // "You found a mole. But which one?"
  options: string[];           // exactly 4
  answerIndex: number;         // 0–3
};
```

Two kinds of bonus round share this one shape:

- **Species rounds**, where the animal has a real specific answer. Four real
  species from the same family.
- **Fact rounds**, for animals with no honest split (Capybara, Narwhal,
  Axolotl). One true statement against three plausible false ones, drawn
  from the same well as `funFacts`.

There is deliberately **no `kind` field** distinguishing them. The difference
is an authoring convention, not a branch the code takes: both are a question,
four options, and one right answer, and one shape means one renderer and one
code path.

`species` is separate from the bonus answer because the reveal card needs it
on days with no bonus round, and on days the player lost.

### Validation

`validateAnimalData` gains, for any record with a `bonus`:

- exactly 4 options, each non-empty after trimming
- no two options equal (case-insensitively — near-duplicate decoys are an
  authoring error that produces two correct answers)
- `answerIndex` an integer in `0..3`
- **if `species` is set and appears among `options`, it must be the option at
  `answerIndex`**

The last rule is the one that matters. It catches the authoring slip with a
real consequence — the true species listed as a decoy, making the puzzle
unwinnable and the reveal self-contradictory. It is expressed as a
conditional rather than as a `kind` check so that fact rounds on animals that
happen to have a `species` are unaffected.

The validator already gates `scripts/importAnimalsCsv.ts`, which refuses to
write `data/animals.json` on any error. Bonus rounds inherit that gate for
free.

## 2. Option order is shuffled deterministically

A pure function in `src/`, seeded by the puzzle number.

Every player sees the same order on the same day, so two friends comparing
notes are talking about the same thing. But the correct answer does not sit
wherever the author happened to type it — without this, the answer drifts
toward a favoured position across records and regulars start to feel the
pattern before they can articulate it.

Seeded by puzzle number rather than by date so the archive and the live game
agree, and so the shuffle is trivially testable.

## 3. Game flow

```
guessing ──solved & record has bonus──> bonus ──> reveal
    │                                              ▲
    └──────────────lost, or no bonus───────────────┘
```

**The bonus is offered only on a win.** A player who burned all three guesses
is already being handed the answer on the reveal card, so a bonus round for
an animal they just failed to name is consolation rather than reward — and it
devalues the star for everyone who earned it.

Within the round: selecting an option locks it immediately — no confirm
button, because the moment of commitment is where the whole mechanic lives.
A correct pick marks green; a wrong pick marks red **and** highlights the
right answer, so the player always learns the species. Then a beat, then the
reveal card.

Four options rather than three: a 25% base rate is low enough that a hit
feels earned and high enough that a guess feels worth making.

**Decoy quality is the difficulty knob.** Decoys must be real animals from
the same family, and are better when *more* famous than the answer. For the
mole: `European Mole`, `Eastern Mole`, `Star-Nosed Mole`, `Hairy-Tailed
Mole`. A player who merely knows moles exist gets no edge; a player who
looked at the photograph and saw 22 pink tentacles does. The round should be
beatable from the image, never from prior expertise.

## 4. Storage — deliberately not a schema bump

`DailyResult` gains one optional field:

```ts
bonus?: "hit" | "miss";   // absent = no bonus round that day
```

`SCHEMA_VERSION` **stays at 2**. `loadState` treats an unrecognised version
as `emptyState()`, so bumping to 3 would silently wipe the entire history —
stats, streak, distribution — for every player who had been with the game
since launch. An optional field is read correctly by the existing v2 loader,
and `isWellFormedEntry` does not inspect it, so pre-v1.1 entries load
unchanged. Their absent `bonus` is not missing data; it is accurate.

## 5. Stats panel

One line: `Bonus rounds  7/12`.

No bonus streak, no bonus distribution, no separate best run. The bonus was
made streak-safe specifically so it does not become a second thing to fail
at, and a bonus streak counter would reintroduce that pressure through the
back door.

## 6. Share text

```
WhichAnimalToday #34 🐾 2/3 ⭐
https://whichanimaltoday.com
```

`⭐` on a hit, `⬜` on a miss, nothing appended on a day with no bonus round.

**Misses are shared too, deliberately.** A bare `2/3` on a bonus day would be
ambiguous — no round today, or a round they failed? — and ambiguity kills the
comparison. `2/3 ⬜` next to a friend's `2/3 ⭐` is the exchange that pulls a
recipient to the site, and sharing is the primary growth lever the entire
AdSense revenue model depends on (MVP design §4). Wordle shares failures for
the same reason, and `⭐`/`⬜` borrows a vocabulary players already read as a
score.

`buildShareText` takes a new optional trailing parameter, keeping every
existing call site valid.

## 7. Reveal card and the archive

The reveal gains a subtitle — **Mole**, *specifically, a Star-Nosed Mole* —
plus the bonus outcome where there was one.

`scripts/runDailyArchive.ts` must carry `species` into `data/archive.json`,
or the archive will describe puzzle #34 as "Mole" and lose the half worth
seeing.

**No bonus round on the archive detail page.** It is a browse-and-reveal
page, not a playable one — it contains no guess handling at all — so there is
nothing to add there beyond the field pass-through.

## 8. Content pass

Two jobs across all 34 records, both requiring per-record judgement.

**Split broad from specific.** `commonName` becomes the family and `species`
holds the specific, for the seven records listed in Context.

This cannot be batched by rule. **`Red Panda` must not become `Panda`** — a
red panda is not a panda, and broadening it would make `panda` a winning
guess for an animal that is not one. `Sea Otter` → `Otter` is legitimate by
contrast, because a sea otter genuinely is a species of otter. The two look
identical to a find-and-replace and are opposite decisions, which is why
every case gets decided individually and anything uncertain gets flagged
rather than guessed.

**Write the bonus rounds.** Species rounds wherever the family supports one —
`Chameleon`, `Sloth`, `Seahorse`, `Octopus`, `Flamingo`, `Hedgehog`,
`Peacock`, `Toucan`, `Iguana`, `Puffin`, `Clownfish` all do, alongside the
seven split records. Fact rounds for the rest.

Drafted in bulk for the owner's review. Decoy selection is a taste judgement
more than a correctness one, and the owner's veto is the point of the review.

## 9. Testing

Pure logic in `src/` with Vitest, per the project's established split: the
deterministic shuffle, the new validator rules, the `bonus` field on
`DailyResult`, and `buildShareText`'s new parameter. The UI has no automated
harness and is verified through the manual checklists in
`docs/framer-integration.md`.

Then `npm run generate:framer` regenerates the engine block in
`framer/GameComponent.tsx`; both `npm test` and CI fail if the committed
block is stale.

**The paste into Framer is the risk, not the code.** The live component is a
hand-pasted copy, and Framer's own AI assistant edits it in place — that
already caused a divergence on 2026-07-30 (see `docs/follow-ups.md`). Before
pasting v1.1, confirm what has changed Framer-side since launch, so a genuine
Framer-side fix is not overwritten.

## 10. Ship plan

### Launch day, 2026-08-01 — data-only hotfix

Add broad aliases to the seven species-specific records: `mole`, `penguin`,
`fox`, `gecko`, `sea turtle`, `butterfly`, `otter`. Do **not** add `panda` to
`Red Panda`.

`data/animals.json` is fetched over HTTP at runtime, so this ships **without
touching Framer at all** — no re-paste, no component change, no launch-day
risk. It prevents anyone hitting the owner's exact frustration during the
first week, and it is a strict subset of the stage-one behaviour v1.1
introduces, so nothing here is thrown away.

### v1.1, after launch

Everything above, plus the 34 bonus rounds.

Shipping after launch rather than holding the date means the decoys can be
calibrated against real data on how hard stage one actually proves to be —
which is the input that should set how mean they are, and it does not exist
yet.

## Out of scope

- **Multiple images per day / unlimited play for paying subscribers.** The
  owner's stated next ambition. Deferred: it reopens the settled decision to
  fund the site through AdSense rather than subscriptions, it needs a backend
  this product does not have, and it consumes content at a rate the current
  supply cannot meet.
- **Automating image sourcing and attribution.** A real and worthwhile
  project — and a **precondition** for unlimited play, not an optimisation of
  it. At one puzzle a day the 500-animal target is sixteen months of content;
  a player doing ten puzzles in a session burns ten animals. To be
  brainstormed as its own spec next. Note the overlap: taxonomy APIs
  enumerate sibling species, which is exactly the data the species rounds'
  decoys need, so a later pipeline could generate what §8 authors by hand.

## Open questions

None blocking. Two things to confirm during implementation rather than now:

- **What a page refresh mid-bonus-round does.** The round inherits whatever
  the game already does about in-progress state, which is not documented.
  Confirm it cannot be used to re-roll the bonus.
- **The known UTC-midnight bug** (`docs/follow-ups.md`) writes a history entry
  dated the day *after* the puzzle it belongs to. The `bonus` field rides
  along on that entry and is affected identically. Not made worse here, and
  out of scope, but worth knowing the fix touches this record too.

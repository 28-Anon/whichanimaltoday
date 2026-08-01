# Timer Mode — Design

**Date:** 2026-08-01
**Status:** Approved, not implemented.

## Context

The daily puzzle is one animal a day. That is deliberate — scarcity is what
makes it a ritual and what makes the streak worth protecting — but it also
means a player who wants more has nowhere to go. The owner asked for a timed
mode with multiple images, originally gated behind an advert.

**The advert gate is not in this design.** Rewarded video is an AdMob (in-app)
format; AdSense offers nothing equivalent for ordinary websites, and
incentivising ad engagement is squarely the shape its policies prohibit.
Building on that foundation risks the account that carries the entire revenue
model. It is also the wrong product call: the gate lands at the exact moment a
player most wants to continue, converting "one more go" into "I'm done".
Revenue is pageviews times ad density, and a player doing five free rounds
generates five rounds of engagement without the interruption. Revisit only if
a native app ever ships, where AdMob makes rewarded ads legitimate.

## Decision

A survival run: answer as many animals as possible before the clock reaches
zero, by tapping one of four names.

### Survival, not a fixed race

The run always ends just short of where the player wanted, and the score is a
single number that is trivially shareable. A fixed five-animal race has a
ceiling — once it can be cleared comfortably there is nothing left to chase —
and a failed run on animal four reads as wasted time rather than a near miss.

Survival also solves content draw for free: a better player simply sees more
animals.

### Multiple choice, not free text

Under a clock, typing is the enemy. "Hawksbill sea turtle" costs seconds and a
typo costs the run, which punishes spelling rather than knowledge. The fuzzy
matcher in `src/guessChecker.ts` was tuned for a relaxed three-guess puzzle;
under time pressure a rejected near-miss reads as the game cheating.

Multiple choice is also nearly free to build. Decoys come from the other
animals already in the downloaded list, and `shuffleBonusOptions` in
`src/bonusRound.ts` already produces a deterministic ordering. It is
thumb-friendly, which matters because most traffic will be mobile.

### Alternatives considered

- **Fixed race** — five animals, ninety seconds. Cleaner win/lose and a
  completion time to beat. Rejected for the ceiling.
- **Escalating rounds** that shorten the per-animal allowance. Rejected: two
  systems to tune, and difficulty in this game comes from *which animal
  appears*, not from the clock — so an unlucky obscure specimen ends a run
  regardless of skill.
- **Free text**, matching the daily puzzle. Rejected above.
- **Free text with autocomplete.** Removes the spelling penalty but the
  autocomplete list *is* the answer list — it hands over the entire roster,
  making it easier than multiple choice while being fiddlier on a phone.

## 1. The clock

| | |
|---|---|
| Starting time | 45 seconds |
| Correct answer | +5 seconds |
| Wrong answer | −8 seconds |
| Run ends | clock reaches zero |
| Score | number answered correctly |

**The asymmetry is load-bearing.** A wrong answer must cost more than a right
one gains, or a fast tapper farms the clock indefinitely by guessing at random
— four options means a 25% hit rate for free, and any player who taps quickly
enough would never run out. These numbers are a starting point and are
expected to move once someone plays it.

## 2. The question

Four names, one correct. **Decoys are drawn from animals in the same
`category`** — a bird against three other birds. That is free difficulty from
data already present, and it stops the silhouette from giving the answer away
before the name is read.

Where a category has too few members to fill three decoys, fall back to the
whole list rather than repeating an option.

**No animal repeats within a run.** Across runs, repetition is fine and
expected — that is the difference between a practice mode and a daily puzzle.

## 3. Complete separation from the daily game

This is the constraint everything else bends around.

- **A third storage key, `whichanimaltoday_timer`.** Not
  `whichanimaltoday_state`, not `whichanimaltoday_preferences`. Timer mode
  must never be able to touch `SCHEMA_VERSION`, the daily history, or a
  streak. `loadState` maps an unrecognised version to an empty history, so any
  schema change reachable from this mode could erase a player's record.
- **No effect on `solved`, `currentStreak`, `maxStreak`, `played` or the guess
  distribution.** The daily puzzle is the ritual. A practice mode that could
  break a forty-day streak would poison the thing the game is built on.
- Its own best score, its own share line, its own panel. It does **not** appear
  in the daily statistics panel.

Reads and writes wrapped in `try`/`catch`, like `saveState` — storage throws
outright for anyone with cookies blocked.

## 4. Image loading is the thing that will break it

The clock runs while a photograph downloads. On a slow connection that
silently eats seconds and reads as the game cheating — and unlike a wrong
answer, the player cannot see why.

Two rules:

1. **The next animal's image is preloaded while the current question is on
   screen**, so by the time it is needed it is already decoded.
2. **A question's timer does not start until its image has decoded.** The
   first question of a run therefore opens with a brief "get ready" beat
   rather than a clock already draining.

Get this wrong and no other tuning matters.

At 34 animals the whole list is already downloaded, so preloading is a
`new Image()` per question, not a fetch strategy.

## 5. Content supply

Draws from the full animal list, including animals already used as daily
puzzles. **Playable on the current 34.** The content pipeline
(`2026-07-31-content-pipeline-design.md`) makes it better but is not a
prerequisite — which is the opposite of the position the daily puzzle is in,
and is exactly why an endless mode is the right place for repeats to live.

## 6. Sharing

Its own line, distinct from the daily format so the two are never confused:

```
WhichAnimalToday ⏱ 14 in a row
https://whichanimaltoday.com
```

The daily share text is untouched.

## Out of scope

- **No advert gate.** See Context.
- **No leaderboard.** It needs a backend, which this product does not have,
  and it invites cheating in a game whose answers are all in a public JSON
  file.
- **No difficulty settings.** One clock, one set of numbers. A second mode to
  tune before the first is proven is premature.
- **No sound.** Covered by `2026-08-01-sound-effects-design.md`; if that lands
  first, timer mode reuses the same palette rather than defining its own.

## Open questions

Both need the owner's call before implementation; neither blocks writing a
plan for the rest.

- **Where the player enters timer mode from.** Candidates: a button on the
  daily reveal card — which catches players at the moment they have just
  finished and want more, and is where the archive link already sits — the
  header icon bar, or its own Framer page like the archive. The reveal card is
  the strongest for engagement; a separate page is better for sharing a link
  to the mode itself.
- **Whether a wrong answer reveals the correct one.** Honest, and it teaches —
  but it costs a second of clock at the worst possible moment, and in a
  survival run the player's attention is on the timer, not on learning. The
  alternative is to show nothing and move straight to the next animal, with
  the missed ones listed on the end-of-run card instead. That second option is
  the assumption this design proceeds on until told otherwise.

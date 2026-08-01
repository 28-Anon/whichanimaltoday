# Sound Effects — Design

**Date:** 2026-08-01
**Status:** Approved, not implemented.

## Context

The game gives no audible feedback. The owner asked for sound on button
presses and on getting an answer right or wrong, after playing the live game.

Three constraints shape everything below. There is **no backend**, so nothing
can be served that isn't already in the repo. The game ships as **one pasted
Framer component**, so every kilobyte of asset lands in a file a human has to
copy by hand. And browsers **refuse to start audio outside a user gesture**,
so anything that plays automatically on load simply won't.

## Decision

Five short tones, synthesised in the browser with the Web Audio API, **off by
default**, enabled by a toggle in the settings panel.

### Off by default

The game is played on phones, at desks, in bed, and at work. A surprise noise
is the fastest way to close a tab, and it cannot be un-heard — on a
share-driven game that costs the share, not just the session. Wordle and the
NYT puzzle games are silent by default for the same reason.

**The opt-in also solves the autoplay problem rather than working around it.**
An `AudioContext` may only be created or resumed inside a user gesture. Since
the player must click a toggle to enable sound, that click *is* the gesture —
so the context is created there and is unlocked for the rest of the session.
Sound-on-by-default would have needed a separate "first interaction" hook to
achieve the same thing.

### Synthesised, not recorded

Oscillators generate the tones live. No files to host, none to fetch, nothing
to preload, no licensing to track, and **zero latency** — which matters,
because a sound that arrives 200ms after the click reads as a glitch rather
than as feedback. It also cannot fail to load.

The cost is that organic sounds are off the table: no animal calls, no
recorded page-turn. Accepted. The game's register is a quiet paper field
journal, not an arcade.

### Alternatives considered

- **Recorded clips on the CDN**, served from the repo like the mirrored animal
  images. Much richer, but adds a fetch per sound, needs preloading so the
  payoff beat isn't late, has a failure mode when the CDN is slow, and turns
  audio into a second content-sourcing problem with its own licensing.
- **Recorded clips inlined as data URIs.** No hosting and no fetch, but base64
  inflates audio by roughly a third and the component file is already ~60KB.
  Four clips could nearly double the thing the owner pastes by hand.
- **On by default with a prominent mute.** Stronger character and better
  discovery, rejected on first-impression risk.
- **A one-time "turn on sound?" prompt after the first win.** Best discovery,
  rejected because it interrupts the exact beat the bonus round was designed
  to make feel like a reward.

## 1. The palette

| Event | Shape | Intent |
|---|---|---|
| Button press | one 25ms triangle blip, very low gain | texture, not an event |
| Correct guess | two rising notes, C5 → G5 | "you got it" |
| Wrong guess | one soft note bending 220Hz → 180Hz | gentle, not a buzzer |
| Bonus hit | three rising notes, C5 – E5 – G5 | brighter than the main win; this is the rarer thing |
| Bonus miss | two falling notes, G4 → D4, muted | disappointment, not punishment |

Master gain sits low throughout. **Both failure sounds are deliberately
soft.** This is a game you are meant to lose sometimes, and a harsh buzzer on
a daily puzzle is a reason not to come back.

The press sound is quieter and shorter than every outcome, so it reads as
texture and never competes with the payoff.

Every tone uses a quick attack and an exponential decay to silence. A tone cut
off abruptly produces an audible click, which would sound like a defect.

## 2. Where the code lives

Following the split the project already uses for storage:

- **`src/soundPalette.ts`** — the palette as plain data: frequencies,
  durations, gains, envelope shape. Pure, unit-tested, and mirrored into the
  component by the existing codegen. Add it to `ENGINE_MODULE_PATHS`.
- **The component's hand-written half** — the `AudioContext` wiring, exactly
  as `browserStorage` supplies a `StorageLike` to the generated engine.

**Every audio call is wrapped so failure is silent.** If `AudioContext` is
absent, blocked, or throws, the game behaves precisely as it does today. Sound
must never be able to break a puzzle — the same rule `saveState` already
follows for storage.

## 3. The preference

Stored under **`whichanimaltoday_preferences`**, deliberately separate from
`whichanimaltoday_state`, so display preferences and game history never share
a schema or a migration. Reads and writes are wrapped in `try`/`catch`:
touching storage throws outright for anyone with cookies blocked, and an
unguarded write on mount is a bug this project has already fixed twice.

The toggle belongs in the settings panel described in `docs/follow-ups.md` —
the ⚙️ slot in the header icon bar is already structured to take a third
control. **That panel does not exist yet.** Whichever of the two is built
first carries the cost of creating it; sound is not a reason to build a
second, parallel preferences mechanism.

## Out of scope

- **No volume slider.** On or off. A slider is a second preference to store,
  migrate and tune, for a sound lasting 200ms.
- **No sound on the reveal card or on copying share text.** The restrained set
  was chosen deliberately: every additional sound is another thing that can
  grate on the hundredth playthrough.
- **No audio for the archive pages.**

## Open questions

- **Whether the settings panel lands first.** This design assumes a panel to
  live in. If sound is implemented before it, the smallest honest version is a
  🔊 toggle in the header icon bar writing the same preferences key — but that
  is a placement decision, not a data one, and the key must not change.
- **The exact frequencies are a starting point, not a result.** They are
  written down so implementation has something concrete to build, and are
  expected to move once someone hears them in the actual page.

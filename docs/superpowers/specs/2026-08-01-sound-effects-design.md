# Sound Effects — Design

**Date:** 2026-08-01
**Status:** Implemented 2026-08-22, as designed. Implementation notes are at
the foot of this document; the open questions below are now answered.

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

## Open questions — answered

- **Whether the settings panel lands first.** It did not. Sound shipped with
  the fallback this section describes: a toggle in the header icon bar,
  writing `whichanimaltoday_preferences`, exactly the key a panel will read.
  Moving it into a panel later is a JSX move with no data change.
- **The exact frequencies are a starting point, not a result.** Still true.
  They are in `src/soundPalette.ts` as plain numbers with the notes named, and
  the tests assert the *relationships* the design argued for — the press is
  quieter and shorter than every outcome, both failures are softer than their
  success — so the pitches can be retuned by ear without breaking anything.

## Implementation notes

Built as designed, with three decisions worth recording.

**The preference store is shared, not sound-specific.** `src/preferences.ts`
reads and writes the whole `whichanimaltoday_preferences` object and merges on
write, preserving keys it has never heard of. Dark theme, high contrast and
reduced motion are all designed to land in the same object; a newer tab's
setting must not be lost because an older tab wrote `soundEnabled` over the
top. This is the one shared mechanism the design asked for rather than a
second, parallel one.

**The toggle is drawn linework, not the 🔊 the design sketched.** Every other
control in that header is an inline SVG for a reason set out on `Icon` in
`framer/GameComponent.tsx`: emoji render differently on every platform, and
one among five drawn icons reads as decoration that wandered in. The control
is a speaker whose sound waves become a cross when sound is off.

**Turning sound on plays the win sound.** A toggle that makes no sound is
indistinguishable from a broken one, and the press blip is deliberately too
quiet to serve as confirmation. That click is also the gesture the
`AudioContext` is created inside, so the confirmation and the unlock are the
same event.

Where things live:

- `src/soundPalette.ts` — the palette as data, plus `MASTER_GAIN`,
  `ATTACK_SECONDS` and `SILENCE_GAIN`. No DOM types; unit-tested for the
  relationships above.
- `src/preferences.ts` — the storage key, defaults, and a merge-preserving
  write. Every read and write wrapped, as `saveState` already is.
- `framer/GameComponent.tsx` — `playPaletteSound` (oscillators and envelopes)
  and `useSound` (the context, the preference, and a `play` that cannot
  throw), both hand-written; the two `src/` modules arrive through the
  existing codegen.

With no `AudioContext` at all — jsdom, an iframe without the autoplay
permission, a browser that throws on construction — the game behaves exactly
as it does with sound off. `framer/GameComponent.test.tsx` covers that case
directly, because jsdom implements none of the Web Audio API.

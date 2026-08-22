/**
 * The five sounds the game can make, as plain data.
 *
 * Nothing here touches the Web Audio API. The palette is numbers — pitches,
 * durations, gains, envelope shape — so it can be unit-tested for the things
 * that actually matter about it (the press is quieter than every outcome, a
 * "rising" pair really rises) without a browser or an `AudioContext`. The
 * component owns the oscillators; see `docs/superpowers/specs/2026-08-01-sound-effects-design.md`.
 *
 * Tones are synthesised rather than recorded so there is nothing to host,
 * fetch, preload or licence, and so a click makes its sound with zero
 * latency. A sound that lands 200ms late reads as a glitch, not as feedback.
 */

export type SoundName =
  | "press"
  | "correct"
  | "wrong"
  | "bonusHit"
  | "bonusMiss";

/**
 * Deliberately our own union rather than the DOM's `OscillatorType`: this
 * module is mirrored into the Framer component by the codegen, and it should
 * not need DOM lib types to type-check on its own.
 */
export type ToneShape = "sine" | "triangle";

export interface Tone {
  /** Seconds from the start of the sound. Notes in a sequence stagger here. */
  offset: number;
  /** Seconds. The envelope decays to silence across exactly this long. */
  duration: number;
  /** Hz at the note's start. */
  startFrequency: number;
  /** Hz at the note's end. Equal to `startFrequency` for a flat note. */
  endFrequency: number;
  /** Peak gain of this note, before the master gain is applied. 0–1. */
  gain: number;
  shape: ToneShape;
}

/**
 * Everything is multiplied by this on the way out. Low on purpose: the game
 * is played at desks, in bed, and at work, and the sound is meant to be
 * noticed rather than heard.
 */
export const MASTER_GAIN = 0.18;

/**
 * Seconds from silence to a note's peak. Short enough to read as immediate,
 * long enough that the note doesn't start with a click.
 */
export const ATTACK_SECONDS = 0.006;

/**
 * The floor an exponential ramp decays to. `exponentialRampToValueAtTime`
 * throws on a target of zero, so silence is approached rather than reached —
 * this is inaudible, and the note is stopped immediately afterwards anyway.
 */
export const SILENCE_GAIN = 0.0001;

// Equal-temperament pitches, written out so the palette reads as music
// rather than as a list of magic numbers.
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const G4 = 392.0;
const D4 = 293.66;

/**
 * The palette.
 *
 * Both failure sounds are deliberately soft. This is a game you are meant to
 * lose sometimes, and a harsh buzzer on a daily puzzle is a reason not to
 * come back.
 *
 * These frequencies are a starting point, not a result — they are expected to
 * move once someone hears them in the actual page.
 */
export const SOUND_PALETTE: Record<SoundName, readonly Tone[]> = {
  /**
   * Texture, not an event: quieter and shorter than every outcome below, so
   * it never competes with the payoff it precedes.
   */
  press: [
    {
      offset: 0,
      duration: 0.025,
      startFrequency: 330,
      endFrequency: 330,
      gain: 0.12,
      shape: "triangle",
    },
  ],

  /** "You got it" — two rising notes. */
  correct: [
    {
      offset: 0,
      duration: 0.12,
      startFrequency: C5,
      endFrequency: C5,
      gain: 0.5,
      shape: "sine",
    },
    {
      offset: 0.1,
      duration: 0.18,
      startFrequency: G5,
      endFrequency: G5,
      gain: 0.5,
      shape: "sine",
    },
  ],

  /** Gentle, not a buzzer: one soft note bending down a little. */
  wrong: [
    {
      offset: 0,
      duration: 0.22,
      startFrequency: 220,
      endFrequency: 180,
      gain: 0.32,
      shape: "sine",
    },
  ],

  /** Brighter than the main win — this is the rarer thing. */
  bonusHit: [
    {
      offset: 0,
      duration: 0.11,
      startFrequency: C5,
      endFrequency: C5,
      gain: 0.55,
      shape: "sine",
    },
    {
      offset: 0.09,
      duration: 0.11,
      startFrequency: E5,
      endFrequency: E5,
      gain: 0.55,
      shape: "sine",
    },
    {
      offset: 0.18,
      duration: 0.24,
      startFrequency: G5,
      endFrequency: G5,
      gain: 0.6,
      shape: "sine",
    },
  ],

  /** Disappointment, not punishment: two falling notes, muted. */
  bonusMiss: [
    {
      offset: 0,
      duration: 0.14,
      startFrequency: G4,
      endFrequency: G4,
      gain: 0.28,
      shape: "sine",
    },
    {
      offset: 0.12,
      duration: 0.2,
      startFrequency: D4,
      endFrequency: D4,
      gain: 0.26,
      shape: "sine",
    },
  ],
};

/** Every sound the palette knows, in the order the design lists them. */
export const SOUND_NAMES: readonly SoundName[] = [
  "press",
  "correct",
  "wrong",
  "bonusHit",
  "bonusMiss",
];

/**
 * How long a sound lasts, in seconds — the last note's offset plus its
 * duration. Used to size the window a caller has to keep nodes alive for.
 */
export function soundDuration(name: SoundName): number {
  return SOUND_PALETTE[name].reduce(
    (longest, tone) => Math.max(longest, tone.offset + tone.duration),
    0
  );
}

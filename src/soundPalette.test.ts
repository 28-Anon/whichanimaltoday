import { describe, it, expect } from "vitest";
import {
  ATTACK_SECONDS,
  MASTER_GAIN,
  SILENCE_GAIN,
  SOUND_NAMES,
  SOUND_PALETTE,
  soundDuration,
  type SoundName,
  type Tone,
} from "./soundPalette";

const everyTone: Tone[] = SOUND_NAMES.flatMap((name) => [
  ...SOUND_PALETTE[name],
]);

function peakGain(name: SoundName): number {
  return Math.max(...SOUND_PALETTE[name].map((tone) => tone.gain));
}

describe("soundPalette", () => {
  it("covers exactly the five sounds the design names", () => {
    expect([...SOUND_NAMES].sort()).toEqual(
      Object.keys(SOUND_PALETTE).sort()
    );
    expect(SOUND_NAMES).toHaveLength(5);
  });

  it("gives every tone a playable duration, pitch and gain", () => {
    for (const tone of everyTone) {
      expect(tone.duration).toBeGreaterThan(0);
      expect(tone.offset).toBeGreaterThanOrEqual(0);
      expect(tone.startFrequency).toBeGreaterThan(0);
      expect(tone.endFrequency).toBeGreaterThan(0);
      expect(tone.gain).toBeGreaterThan(0);
      expect(tone.gain).toBeLessThanOrEqual(1);
    }
  });

  it("leaves room for the attack inside every note", () => {
    // A note shorter than its own attack never reaches its peak, and the
    // ramp maths in the component would run backwards.
    for (const tone of everyTone) {
      expect(tone.duration).toBeGreaterThan(ATTACK_SECONDS);
    }
  });

  it("orders the notes of a sequence by when they start", () => {
    for (const name of SOUND_NAMES) {
      const offsets = SOUND_PALETTE[name].map((tone) => tone.offset);
      expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    }
  });

  it("keeps the press quieter and shorter than every outcome", () => {
    // The press is texture. If it ever competes with the payoff it precedes,
    // the feedback reads as noise.
    const pressGain = peakGain("press");
    const pressLength = soundDuration("press");

    for (const name of SOUND_NAMES) {
      if (name === "press") continue;
      expect(pressGain).toBeLessThan(peakGain(name));
      expect(pressLength).toBeLessThan(soundDuration(name));
    }
  });

  it("keeps both failure sounds softer than their success counterpart", () => {
    // This is a game you are meant to lose sometimes. A harsh buzzer on a
    // daily puzzle is a reason not to come back.
    expect(peakGain("wrong")).toBeLessThan(peakGain("correct"));
    expect(peakGain("bonusMiss")).toBeLessThan(peakGain("bonusHit"));
  });

  it("makes the bonus win brighter and richer than the main win", () => {
    // The bonus is the rarer thing, so it gets the bigger flourish.
    expect(SOUND_PALETTE.bonusHit.length).toBeGreaterThan(
      SOUND_PALETTE.correct.length
    );
    expect(peakGain("bonusHit")).toBeGreaterThanOrEqual(peakGain("correct"));
  });

  it("rises on a win and falls on a loss", () => {
    const pitches = (name: SoundName) =>
      SOUND_PALETTE[name].map((tone) => tone.startFrequency);

    for (const rising of ["correct", "bonusHit"] as const) {
      const notes = pitches(rising);
      expect(notes).toEqual([...notes].sort((a, b) => a - b));
      expect(notes[notes.length - 1]).toBeGreaterThan(notes[0]);
    }

    const falling = pitches("bonusMiss");
    expect(falling).toEqual([...falling].sort((a, b) => b - a));
    expect(falling[falling.length - 1]).toBeLessThan(falling[0]);

    // The wrong-guess note bends down within a single tone rather than
    // stepping between notes.
    const [wrong] = SOUND_PALETTE.wrong;
    expect(wrong.endFrequency).toBeLessThan(wrong.startFrequency);
  });

  it("keeps every sound short enough to read as feedback", () => {
    // Feedback, not a jingle. Nothing should still be playing while the
    // player is deciding what to do next.
    for (const name of SOUND_NAMES) {
      expect(soundDuration(name)).toBeLessThan(0.6);
    }
  });

  it("measures a sound to the end of its last note", () => {
    const last = SOUND_PALETTE.bonusHit[SOUND_PALETTE.bonusHit.length - 1];
    expect(soundDuration("bonusHit")).toBeCloseTo(last.offset + last.duration);
  });

  it("keeps the master gain low and the silence floor inaudible", () => {
    expect(MASTER_GAIN).toBeGreaterThan(0);
    expect(MASTER_GAIN).toBeLessThanOrEqual(0.25);
    // exponentialRampToValueAtTime throws on a target of zero, so silence is
    // approached rather than reached — but it must be far below any peak.
    expect(SILENCE_GAIN).toBeGreaterThan(0);
    expect(SILENCE_GAIN).toBeLessThan(Math.min(...everyTone.map((t) => t.gain)) / 100);
  });
});

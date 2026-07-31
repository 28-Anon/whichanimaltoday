export interface ShuffledBonus {
  options: string[];
  answerIndex: number;
}

/**
 * mulberry32 — a small deterministic PRNG. Math.random cannot be used: every
 * player must see the same option order on the same day, or two people
 * comparing results are not talking about the same thing.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates over a copy, seeded by the puzzle number.
 *
 * Relies on options being distinct — `validateAnimalData` enforces that — so
 * `indexOf` finds the answer's new position unambiguously.
 */
export function shuffleBonusOptions(
  options: string[],
  answerIndex: number,
  seed: number
): ShuffledBonus {
  const answer = options[answerIndex];
  const shuffled = [...options];
  const random = seededRandom(seed);

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = swap;
  }

  return { options: shuffled, answerIndex: shuffled.indexOf(answer) };
}

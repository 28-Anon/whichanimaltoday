export const START_MS = 45_000;
export const CORRECT_BONUS_MS = 5_000;
export const WRONG_PENALTY_MS = 8_000;

export interface QuizAnimal {
  commonName: string;
  category: string;
}

export interface TimerQuestion {
  /** Index into the animal list, so the caller can find the image. */
  animalIndex: number;
  options: string[];
  answerIndex: number;
}

export interface TimerRun {
  remainingMs: number;
  score: number;
  askedIndexes: number[];
  /** Animal indexes answered wrongly, listed on the end-of-run card. */
  missed: number[];
}

/** mulberry32, matching src/bonusRound.ts — deterministic, tiny, no deps. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

export function buildQuestion(
  animals: QuizAnimal[],
  askedIndexes: number[],
  seed: number
): TimerQuestion | null {
  // Four options need four distinct names, so a list shorter than that has no
  // valid question regardless of what has been asked.
  if (animals.length < 4) return null;

  const available = animals
    .map((_, index) => index)
    .filter((index) => !askedIndexes.includes(index));
  if (available.length === 0) return null;

  const random = seededRandom(seed);
  const animalIndex = pick(available, random);
  const answer = animals[animalIndex];

  const sameCategory = animals.filter(
    (a) =>
      a.commonName !== answer.commonName &&
      a.category.toLowerCase() === answer.category.toLowerCase()
  );

  // Same-category decoys are the point — a bird against three other birds.
  // But a thin category cannot fill three, and a repeated option is worse
  // than an easy one, so fall back to the whole list.
  const pool =
    sameCategory.length >= 3
      ? sameCategory
      : animals.filter((a) => a.commonName !== answer.commonName);

  const decoys: string[] = [];
  const seen = new Set<string>([answer.commonName]);
  // Bounded so a pool of duplicate names cannot spin forever.
  for (let attempt = 0; attempt < 200 && decoys.length < 3; attempt++) {
    const candidate = pick(pool, random).commonName;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    decoys.push(candidate);
  }
  if (decoys.length < 3) return null;

  const options = [...decoys];
  const answerIndex = Math.floor(random() * 4);
  options.splice(answerIndex, 0, answer.commonName);

  return { animalIndex, options, answerIndex };
}

export function applyAnswer(
  run: TimerRun,
  correct: boolean,
  question: TimerQuestion
): TimerRun {
  const delta = correct ? CORRECT_BONUS_MS : -WRONG_PENALTY_MS;

  return {
    // Clamped: a negative clock would render as "-3s" and read as a bug.
    remainingMs: Math.max(0, run.remainingMs + delta),
    score: run.score + (correct ? 1 : 0),
    askedIndexes: [...run.askedIndexes, question.animalIndex],
    missed: correct ? [...run.missed] : [...run.missed, question.animalIndex],
  };
}

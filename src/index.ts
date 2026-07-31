export { getTodayPuzzleIndex } from "./puzzleIndex";
export { checkGuess, normalizeGuess } from "./guessChecker";
export { buildShareText } from "./shareCard";
export {
  recordResult,
  getLastResult,
  getCurrentStreak,
  getStats,
  getHistory,
  hasPlayedToday,
  type DailyResult,
  type StorageLike,
} from "./gameState";
export { computeStats, type Stats } from "./stats";
export {
  validateAnimalData,
  ALLOWED_CATEGORIES,
  type AnimalRecord,
  type BonusRound,
} from "./animalData";

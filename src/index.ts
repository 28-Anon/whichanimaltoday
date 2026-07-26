export { getTodayPuzzleIndex } from "./puzzleIndex";
export { checkGuess, normalizeGuess } from "./guessChecker";
export { buildShareText } from "./shareCard";
export {
  recordResult,
  getLastResult,
  getCurrentStreak,
  hasPlayedToday,
  type DailyResult,
  type StorageLike,
} from "./gameState";
export {
  validateAnimalData,
  ALLOWED_CATEGORIES,
  type AnimalRecord,
} from "./animalData";

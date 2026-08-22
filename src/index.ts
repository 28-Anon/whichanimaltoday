export { getTodayPuzzleIndex } from "./puzzleIndex";
export { checkGuess, normalizeGuess } from "./guessChecker";
export { shuffleBonusOptions, type ShuffledBonus } from "./bonusRound";
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
  SOUND_PALETTE,
  SOUND_NAMES,
  soundDuration,
  MASTER_GAIN,
  ATTACK_SECONDS,
  SILENCE_GAIN,
  type SoundName,
  type Tone,
  type ToneShape,
} from "./soundPalette";
export {
  loadPreferences,
  setPreference,
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  type Preferences,
} from "./preferences";
export {
  validateAnimalData,
  ALLOWED_CATEGORIES,
  type AnimalRecord,
  type BonusRound,
} from "./animalData";

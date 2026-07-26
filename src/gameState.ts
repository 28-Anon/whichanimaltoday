export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface DailyResult {
  date: string;
  puzzleNumber: number;
  solved: boolean;
  guessesUsed: number;
}

interface StoredState {
  lastResult: DailyResult | null;
  currentStreak: number;
}

const STORAGE_KEY = "whichanimaltoday_state";

function loadState(storage: StorageLike): StoredState {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return { lastResult: null, currentStreak: 0 };
  }
  return JSON.parse(raw) as StoredState;
}

function saveState(storage: StorageLike, state: StoredState): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function isNextCalendarDay(previousDate: string, currentDate: string): boolean {
  const previous = new Date(`${previousDate}T00:00:00Z`);
  const current = new Date(`${currentDate}T00:00:00Z`);
  const diffDays =
    (current.getTime() - previous.getTime()) / (24 * 60 * 60 * 1000);
  return diffDays === 1;
}

export function getLastResult(storage: StorageLike): DailyResult | null {
  return loadState(storage).lastResult;
}

export function getCurrentStreak(storage: StorageLike): number {
  return loadState(storage).currentStreak;
}

export function recordResult(storage: StorageLike, result: DailyResult): number {
  const state = loadState(storage);

  let newStreak: number;
  if (!result.solved) {
    newStreak = 0;
  } else if (
    state.lastResult &&
    state.lastResult.solved &&
    isNextCalendarDay(state.lastResult.date, result.date)
  ) {
    newStreak = state.currentStreak + 1;
  } else {
    newStreak = 1;
  }

  saveState(storage, { lastResult: result, currentStreak: newStreak });
  return newStreak;
}

export function hasPlayedToday(storage: StorageLike, today: string): boolean {
  const lastResult = getLastResult(storage);
  return lastResult !== null && lastResult.date === today;
}

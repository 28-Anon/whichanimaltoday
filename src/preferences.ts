import type { StorageLike } from "./gameState";

/**
 * Deliberately separate from `whichanimaltoday_state`, so display
 * preferences and game history never share a schema or a migration. A
 * schema change to one must not be able to erase a player's streak.
 *
 * The key is fixed by design (see the sound-effects and stats-and-shell
 * designs) and must not change: a settings panel built later writes the
 * same key, and a rename silently resets everyone's preferences.
 */
export const PREFERENCES_STORAGE_KEY = "whichanimaltoday_preferences";

export interface Preferences {
  /**
   * Off by default. A surprise noise is the fastest way to close a tab, and
   * it cannot be un-heard. The opt-in also solves autoplay: the click that
   * turns sound on is the user gesture an `AudioContext` needs.
   */
  soundEnabled: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = { soundEnabled: false };

/**
 * The raw stored object, or an empty one.
 *
 * Kept separate from `loadPreferences` so writes can merge into whatever is
 * actually on disk — including keys this version of the code has never heard
 * of. Dark theme, high contrast and reduced motion are all designed to land
 * here later; a player who sets one in a newer tab must not lose it because
 * an older tab wrote `soundEnabled` over the top.
 */
function loadRaw(storage: StorageLike): Record<string, unknown> {
  let raw: string | null;
  try {
    raw = storage.getItem(PREFERENCES_STORAGE_KEY);
  } catch {
    // Reading storage throws outright for anyone with cookies blocked.
    // Degrade to defaults rather than breaking the page.
    return {};
  }
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** The typed view of a raw stored object, with anything unusable defaulted. */
function normalize(stored: Record<string, unknown>): Preferences {
  return {
    soundEnabled:
      typeof stored.soundEnabled === "boolean"
        ? stored.soundEnabled
        : DEFAULT_PREFERENCES.soundEnabled,
  };
}

export function loadPreferences(storage: StorageLike): Preferences {
  return normalize(loadRaw(storage));
}

/**
 * Write one preference, preserving every other key already stored.
 *
 * Returns the preferences as they now read, so a caller can set state from
 * the result rather than re-reading storage — which, with storage blocked,
 * would hand back the default and undo the toggle the player just clicked.
 */
export function setPreference<K extends keyof Preferences>(
  storage: StorageLike,
  key: K,
  value: Preferences[K]
): Preferences {
  const next = { ...loadRaw(storage), [key]: value };
  try {
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota, or storage blocked entirely. The preference still applies for
    // this session; it just will not survive a reload. Throwing here would
    // take the page down over a toggle.
  }
  // Derived from what was written, not re-read: with storage blocked the
  // write is a no-op and a re-read would hand back the default, undoing the
  // toggle the player just clicked.
  return normalize(next);
}

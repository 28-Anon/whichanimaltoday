import { describe, it, expect } from "vitest";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  PREFERENCES_STORAGE_KEY,
  setPreference,
} from "./preferences";
import type { StorageLike } from "./gameState";

function memoryStorage(seed?: Record<string, string>): StorageLike {
  const map = new Map(Object.entries(seed ?? {}));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

describe("preferences", () => {
  it("uses a key separate from the game history and timer mode", () => {
    // A settings panel built later writes this same key. Display preferences
    // and game history must never share a schema or a migration.
    expect(PREFERENCES_STORAGE_KEY).toBe("whichanimaltoday_preferences");
    expect(PREFERENCES_STORAGE_KEY).not.toBe("whichanimaltoday_state");
    expect(PREFERENCES_STORAGE_KEY).not.toBe("whichanimaltoday_timer");
  });

  it("has sound off by default", () => {
    // Off by default is the whole first-impression decision, not a detail.
    expect(DEFAULT_PREFERENCES.soundEnabled).toBe(false);
    expect(loadPreferences(memoryStorage()).soundEnabled).toBe(false);
  });

  it("round-trips a preference through storage", () => {
    const storage = memoryStorage();
    expect(setPreference(storage, "soundEnabled", true).soundEnabled).toBe(true);
    expect(loadPreferences(storage).soundEnabled).toBe(true);
    expect(setPreference(storage, "soundEnabled", false).soundEnabled).toBe(false);
    expect(loadPreferences(storage).soundEnabled).toBe(false);
  });

  it("preserves keys it has never heard of", () => {
    // Dark theme, high contrast and reduced motion are all designed to land
    // in this object later. A newer tab's preference must survive an older
    // tab writing soundEnabled over the top.
    const storage = memoryStorage({
      [PREFERENCES_STORAGE_KEY]: '{"theme":"dark","reducedMotion":true}',
    });
    setPreference(storage, "soundEnabled", true);

    const stored = JSON.parse(storage.getItem(PREFERENCES_STORAGE_KEY) ?? "{}");
    expect(stored).toEqual({
      theme: "dark",
      reducedMotion: true,
      soundEnabled: true,
    });
  });

  it("falls back to defaults for a corrupt or wrongly-typed value", () => {
    const cases = ["not json", "[]", "null", '{"soundEnabled":"yes"}', '"true"'];
    for (const raw of cases) {
      expect(
        loadPreferences(memoryStorage({ [PREFERENCES_STORAGE_KEY]: raw }))
          .soundEnabled
      ).toBe(false);
    }
  });

  it("degrades to defaults when storage throws outright", () => {
    // Blocked cookies and Safari private mode make even reading a
    // SecurityError. A toggle must never be able to take the page down.
    const hostile: StorageLike = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };
    expect(loadPreferences(hostile)).toEqual(DEFAULT_PREFERENCES);
    expect(() => setPreference(hostile, "soundEnabled", true)).not.toThrow();
  });

  it("reports the value it was asked to set even when the write is dropped", () => {
    // Re-reading storage here would hand back the default and visibly undo
    // the toggle the player just clicked.
    const writeOnlyFails: StorageLike = {
      getItem: () => null,
      setItem() {
        throw new Error("quota");
      },
    };
    expect(setPreference(writeOnlyFails, "soundEnabled", true).soundEnabled).toBe(
      true
    );
  });
});

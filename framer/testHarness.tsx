import { render, type RenderResult } from "@testing-library/react";
import { vi } from "vitest";
import type { ReactElement } from "react";

/**
 * Shared setup for testing the pasted Framer components.
 *
 * These components were untestable for a long time not because they are hard
 * to test but because nothing was wired up. They import only from `react` —
 * no `framer` package, no `addPropertyControls` — so all any of them needs is
 * a DOM, a stubbed `fetch`, and control of the clock.
 *
 * Four components share the same fetch-then-restore-from-storage shape, so the
 * setup lives here rather than in four places that would drift.
 *
 * Every test file must opt into jsdom with a `// @vitest-environment jsdom`
 * docblock. `src/` has hundreds of DOM-free tests and setting the environment
 * globally would slow all of them for the benefit of these few.
 */

export const STORAGE_KEY = "whichanimaltoday_state";
export const SCHEMA_VERSION = 2;

export interface StoredResult {
  date: string;
  puzzleNumber: number;
  solved: boolean;
  guessesUsed: number;
  bonus?: "hit" | "miss";
}

/**
 * Stubs the single `fetch` each component makes.
 *
 * Returns a restore function. Tests that forget to call it would leak the stub
 * into the next file, so `stubFetchJson` is normally used through
 * `renderWithData`, which cleans up for them.
 */
export function stubFetchJson(payload: unknown): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  })) as unknown as typeof globalThis.fetch;

  return () => {
    globalThis.fetch = original;
  };
}

/** Makes `fetch` reject, for the components' error paths. */
export function stubFetchFailure(message = "network down"): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = vi.fn(async () => {
    throw new Error(message);
  }) as unknown as typeof globalThis.fetch;

  return () => {
    globalThis.fetch = original;
  };
}

/**
 * Writes a v2 state payload straight into `localStorage`.
 *
 * Deliberately builds the JSON by hand rather than importing the component's
 * own `saveState`: a test that seeds storage using the code under test cannot
 * catch that code writing the wrong shape.
 */
export function seedHistory(history: StoredResult[]): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: SCHEMA_VERSION, history })
  );
}

/** Everything the component has written back, in storage order. */
export function readHistory(): StoredResult[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  return (JSON.parse(raw) as { history?: StoredResult[] }).history ?? [];
}

/**
 * Pins the clock.
 *
 * `shouldAdvanceTime` keeps real timers ticking underneath, because the reveal
 * screen runs a one-second countdown interval and a fully frozen clock leaves
 * React waiting on updates that never arrive.
 */
export function pinClock(iso: string): void {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(iso));
}

export function releaseClock(): void {
  vi.useRealTimers();
}

/** Resets everything a previous test could have left behind. */
export function resetEnvironment(): void {
  window.localStorage.clear();
  document.body.innerHTML = "";
}

export interface Rendered extends RenderResult {
  cleanupFetch: () => void;
}

/** Renders a component with its data request already answered. */
export function renderWithData(
  node: ReactElement,
  payload: unknown
): Rendered {
  const cleanupFetch = stubFetchJson(payload);
  const result = render(node);
  return Object.assign(result, { cleanupFetch });
}

/**
 * A minimal animal record.
 *
 * Only the fields the components actually read. Overriding `bonus: undefined`
 * gives a day with no bonus round.
 */
export function animalFixture(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    commonName: "Otter",
    aliases: ["sea otter"],
    imageUrl: "https://example.test/otter.jpg",
    hint1: "I live near rivers.",
    hint2: "I float on my back.",
    hint3: "I crack shellfish on a stone.",
    funFacts: "Otters hold hands while sleeping so they do not drift apart.",
    category: "mammal",
    imageAttribution: "Photo: nobody, CC0 1.0, test",
    difficulty: "easy",
    bonus: {
      question: "One of these is true. Which?",
      options: ["I have no fur", "I use tools", "I lay eggs", "I cannot swim"],
      answerIndex: 1,
    },
    ...overrides,
  };
}

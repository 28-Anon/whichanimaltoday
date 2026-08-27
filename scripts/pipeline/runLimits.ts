/**
 * The upper bound on what one `content:suggest` run may spend per animal.
 *
 * `suggestImages.ts` owns the defaults and the reasoning for them. This file
 * exists for the half that cannot live there: `main()` runs on import, so
 * anything defined in that module is untestable, and flag parsing that guards
 * a bill is exactly the code that should have a test.
 *
 * Capped rather than unbounded because every judgement is a paid API call.
 * `--candidates=160` is a plausible typo for `--candidates=16` and would bill
 * 160 judgements per animal with no other evidence than the invoice. Upstream
 * already rejects a non-integer and anything below 1 for that reason; a cap is
 * the same argument at the other end of the range.
 */
export const DEFAULT_CANDIDATES = 8;
export const DEFAULT_SURVIVORS = 3;
export const MAX_CANDIDATES_CAP = 24;
export const MAX_SURVIVORS_CAP = 12;

export interface LimitError {
  message: string;
}

export function parseLimit(
  argv: string[],
  flag: string,
  fallback: number,
  cap: number
): number {
  const raw = argv
    .find((arg) => arg.startsWith(`--${flag}=`))
    ?.split("=")[1]
    ?.trim();

  if (raw === undefined || raw === "") return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${flag} must be a whole number of at least 1, got "${raw}"`);
  }
  if (value > cap) {
    throw new Error(
      `--${flag} is capped at ${cap} — each judgement is a paid call. Got ${value}.`
    );
  }
  return value;
}

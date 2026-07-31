import { readFileSync } from "node:fs";

/**
 * Fields that live in `data/animals.json` but have no representation in the
 * flat CSV/Framer-collection round-trip. `scripts/csvToAnimals.ts` builds a
 * record from a fixed list of string columns and `scripts/framerClient.ts`
 * maps a fixed list of collection fields; neither can carry a nested `bonus`
 * object, and neither reads `species`. Anything written by either script
 * therefore comes out without them.
 */
export const UNREPRESENTABLE_FIELDS = ["species", "bonus"] as const;

export type OverwriteCheck =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Which of the unrepresentable fields appear as *keys* on any record.
 *
 * Key presence, not truthiness: a record carrying `species: ""` is still a
 * record the round-trip would silently drop a field from.
 */
export function findUnrepresentableFields(parsed: unknown): string[] {
  if (!Array.isArray(parsed)) return [];

  const found = new Set<string>();
  for (const record of parsed) {
    if (typeof record !== "object" || record === null) continue;
    for (const field of UNREPRESENTABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(record, field)) {
        found.add(field);
      }
    }
  }

  return UNREPRESENTABLE_FIELDS.filter((field) => found.has(field));
}

/**
 * Decide whether a script that can only write the flat shape may overwrite
 * the current `data/animals.json`.
 *
 * `contents` is null when the file does not exist yet — there is nothing to
 * lose, so that is allowed. Unparseable contents are refused rather than
 * assumed empty: the guard cannot tell what is in there, and the failure mode
 * it exists to prevent is exactly "wrote over something valuable". Moving the
 * broken file aside makes the overwrite deliberate.
 */
export function checkAnimalsFileOverwrite(
  contents: string | null
): OverwriteCheck {
  if (contents === null) return { allowed: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return {
      allowed: false,
      reason:
        "The existing data/animals.json could not be parsed as JSON, so this " +
        "script cannot tell whether it holds fields the script cannot " +
        "represent. Move the file aside if you genuinely mean to replace it.",
    };
  }

  const fields = findUnrepresentableFields(parsed);
  if (fields.length === 0) return { allowed: true };

  const list = fields.map((field) => `\`${field}\``).join(" and ");
  return {
    allowed: false,
    reason:
      `The existing data/animals.json contains ${list}, which this script ` +
      "cannot represent — it writes the flat CSV/Framer-collection shape " +
      "only. Overwriting would silently destroy those fields, and they are " +
      "hand-curated content, not something the next run would restore.",
  };
}

/**
 * Refuse-and-exit wrapper for the two scripts that overwrite the file.
 *
 * Both were documented as retired after the two-stage guessing work, but
 * documentation is not a guard: either one still runs clean, exits 0, and
 * leaves no trace of what it removed.
 */
export function guardAnimalsFileOverwrite(
  animalsPath: string,
  scriptLabel: string
): void {
  let contents: string | null;
  try {
    contents = readFileSync(animalsPath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      contents = null;
    } else {
      throw error;
    }
  }

  const check = checkAnimalsFileOverwrite(contents);
  if (check.allowed) return;

  console.error(`Refusing to write: ${scriptLabel} would destroy content.\n`);
  console.error(`  ${check.reason}\n`);
  console.error("data/animals.json is unchanged.");
  process.exit(1);
}

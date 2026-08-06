import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getDaysSinceLaunch } from "../src/puzzleIndex";
import {
  layOutPuzzles,
  startSlotForTargetWeekday,
  type Orderable,
} from "../src/puzzleOrder";

/**
 * Rewrites `data/animals.json` into the order players will see.
 *
 * The order is baked into the file rather than computed in the browser, so the
 * client keeps indexing an array by day and a reordering ships as a data
 * change — nothing to regenerate, nothing to paste into Framer.
 *
 * Three groups, in this order:
 *
 *   1. Already-played puzzles, untouched.
 *   2. Remaining daily-eligible animals, laid out by `layOutPuzzles`.
 *   3. Animals excluded from the daily rotation, appended.
 *
 * Group 3 sits last so the eligible range is contiguous from index 0, which
 * keeps the client's filter and the day arithmetic agreeing with each other.
 */

// Must match framer/GameComponent.tsx and scripts/runDailyArchive.ts.
const LAUNCH_DATE = new Date("2026-08-01T00:00:00Z");

/** Date.getUTCDay() convention: 0 = Sunday. */
const SATURDAY = 6;

const root = (path: string) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));

interface Animal extends Orderable {
  commonName: string;
}

function main(): void {
  const file = root("data/animals.json");
  const raw = readFileSync(file, "utf8");
  const animals = JSON.parse(raw) as Animal[];

  const untiered = animals.filter((animal) => !animal.difficulty);
  if (untiered.length > 0) {
    throw new Error(
      `${untiered.length} animals have no difficulty: ` +
        untiered.map((a) => a.commonName).join(", ")
    );
  }

  // Everything up to and including today has been served. `--frozen N` exists
  // for testing the assertion below; without it the count comes from the
  // calendar, because guessing low here silently rewrites a played day.
  const override = process.argv.find((arg) => arg.startsWith("--frozen="));
  const frozenCount = override
    ? Number(override.split("=")[1])
    : Math.max(0, getDaysSinceLaunch(new Date(), LAUNCH_DATE) + 1);

  if (!Number.isInteger(frozenCount) || frozenCount < 0) {
    throw new Error(`--frozen must be a non-negative integer, got ${frozenCount}`);
  }

  const frozen = animals.slice(0, frozenCount);
  const rest = animals.slice(frozenCount);

  // A played puzzle that is excluded from the rotation would shift every index
  // behind it the moment the client filters, moving animals off the days they
  // were played on.
  const playedButExcluded = frozen.filter((a) => a.dailyEligible === false);
  if (playedButExcluded.length > 0) {
    throw new Error(
      "already-played puzzles cannot be dailyEligible: false — " +
        playedButExcluded.map((a) => a.commonName).join(", ")
    );
  }

  const eligible = rest.filter((animal) => animal.dailyEligible !== false);
  const excluded = rest.filter((animal) => animal.dailyEligible === false);

  // Anchor the hard day to Saturday, when players have more time. Deriving the
  // slot from the frozen count alone would move it to whatever weekday the
  // played prefix happened to end on — the first run landed it on a Tuesday for
  // no better reason than six puzzles having been served.
  const startSlot = startSlotForTargetWeekday(
    frozenCount,
    LAUNCH_DATE.getUTCDay(),
    SATURDAY
  );
  const ordered = [...frozen, ...layOutPuzzles(eligible, startSlot), ...excluded];

  if (ordered.length !== animals.length) {
    throw new Error(
      `ordering produced ${ordered.length} animals from ${animals.length}`
    );
  }

  // The assertion that matters. A reorder that quietly moved a played day would
  // not surface until a player reported yesterday's animal changing.
  for (let index = 0; index < frozenCount; index++) {
    if (ordered[index].commonName !== animals[index].commonName) {
      throw new Error(
        `position ${index} is already played and must not move: ` +
          `${animals[index].commonName} -> ${ordered[index].commonName}`
      );
    }
  }

  writeFileSync(file, JSON.stringify(ordered, null, 2) + "\n", "utf8");

  const tiers = ordered
    .slice(frozenCount)
    .filter((a) => a.dailyEligible !== false)
    .map((a) => a.difficulty);
  console.log(
    `Ordered ${animals.length} animals: ${frozenCount} frozen, ` +
      `${eligible.length} laid out, ${excluded.length} excluded from daily.`
  );
  console.log(
    `  upcoming: ${tiers.filter((t) => t === "easy").length} easy, ` +
      `${tiers.filter((t) => t === "medium").length} medium, ` +
      `${tiers.filter((t) => t === "hard").length} hard`
  );
}

try {
  main();
} catch (error) {
  console.error(`\n${(error as Error).message}`);
  process.exitCode = 1;
}

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { selectDailyAnimals, getDaysSinceLaunch } from "../src/puzzleIndex";

/**
 * How many days of unseen animals the game still has.
 *
 * `getTodayPuzzleIndex` wraps modulo the list length, so running out is not an
 * error and produces no warning anywhere: the game simply serves Giraffe again
 * and every player who has been there since launch sees a rerun. Measured on
 * 2026-08-27 the list repeats on 2026-10-18, which nothing in the repo would
 * have said out loud.
 *
 * This is the number the content pipeline schedules against, and the number CI
 * fails on when it gets too small to source a batch in time.
 */
const LAUNCH_DATE = new Date("2026-08-01T00:00:00Z");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Only the rotation flag matters here; the caller passes whole animals. */
export interface RunwayInput {
  dailyEligible?: boolean;
}

export interface Runway {
  /** Animals actually in the daily rotation — retired ones are not content. */
  eligible: number;
  /** Days served up to and including today. */
  daysServed: number;
  /** Unseen days left, counting today. Never negative. */
  daysRemaining: number;
  /** First date the list repeats, `YYYY-MM-DD`. */
  repeatsOn: string;
  hasWrapped: boolean;
}

export function computeRunway(
  animals: readonly RunwayInput[],
  today: Date,
  launchDate: Date = LAUNCH_DATE
): Runway {
  const eligible = selectDailyAnimals(animals).length;
  if (eligible === 0) {
    throw new Error(
      "data/animals.json has no daily-eligible animals — the game cannot pick a puzzle."
    );
  }

  const daysSinceLaunch = getDaysSinceLaunch(today, launchDate);

  // Today's puzzle is already being served, so it counts as spent; the day it
  // occupies is not runway. Off by one here is a whole day of content, which
  // is why the 2026-08-27 numbers are pinned in the test.
  const daysServed = Math.max(0, daysSinceLaunch + 1);
  const daysRemaining = Math.max(0, eligible - daysSinceLaunch);

  return {
    eligible,
    daysServed,
    daysRemaining,
    repeatsOn: new Date(launchDate.getTime() + eligible * MS_PER_DAY)
      .toISOString()
      .slice(0, 10),
    hasWrapped: daysRemaining === 0,
  };
}

const root = (path: string) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));

/**
 * `--threshold=N` exits 1 when the runway is below N days, which is what makes
 * this usable as a CI gate. `--json` is for the scheduled workflow, which reads
 * `daysRemaining` to decide whether a paid sourcing run is worth starting.
 */
function main(): void {
  const thresholdFlag = process.argv
    .find((arg) => arg.startsWith("--threshold="))
    ?.split("=")[1];
  const threshold = thresholdFlag === undefined ? null : Number(thresholdFlag);

  if (threshold !== null && (!Number.isInteger(threshold) || threshold < 0)) {
    throw new Error(`--threshold must be a non-negative integer, got "${thresholdFlag}".`);
  }

  const animals = JSON.parse(
    readFileSync(root("data/animals.json"), "utf8")
  ) as RunwayInput[];
  const runway = computeRunway(animals, new Date());

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(runway));
  } else {
    console.log(
      `${runway.eligible} animals in rotation, ${runway.daysServed} served.\n` +
        `${runway.daysRemaining} days of unseen content left; ` +
        `the list repeats on ${runway.repeatsOn}.`
    );
  }

  if (threshold !== null && runway.daysRemaining < threshold) {
    console.error(
      `\nRunway is ${runway.daysRemaining} days, below the ${threshold}-day threshold.\n` +
        `Sourcing a batch takes review time and paid API calls, so this fails now\n` +
        `rather than on ${runway.repeatsOn} when players start seeing reruns.\n` +
        `Run: npm run content:discover && npm run content:score && npm run content:draft`
    );
    process.exit(1);
  }
}

// Import-safe: the tests import computeRunway, and must not trigger the CLI.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

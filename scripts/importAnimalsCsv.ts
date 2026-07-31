import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseAnimalsCsv } from "./csvToAnimals";
import { validateAnimalData } from "../src/animalData";
import { guardAnimalsFileOverwrite } from "./animalsFileGuard";

const OUTPUT_PATH = fileURLToPath(new URL("../data/animals.json", import.meta.url));

function main(): void {
  const csvPath = process.argv[2];
  if (!csvPath) {
    throw new Error(
      "Usage: npm run import:animals -- <path-to-exported.csv>"
    );
  }

  // Before anything else: this script writes the flat CSV shape and cannot
  // carry `species` or `bonus`, so running it against a file that has them
  // would delete hand-curated content on a clean exit code.
  guardAnimalsFileOverwrite(OUTPUT_PATH, "npm run import:animals");

  const csvContent = readFileSync(csvPath, "utf-8");
  const animals = parseAnimalsCsv(csvContent);

  // Validate before writing. data/animals.json is fetched directly by the live
  // game, so this file is production data — writing an invalid record here puts
  // it in front of players. Refusing to write is recoverable; a broken puzzle
  // day is not.
  const errors = validateAnimalData(animals);
  if (errors.length > 0) {
    console.error(
      `Refusing to write: ${errors.length} validation ${
        errors.length === 1 ? "error" : "errors"
      } in ${csvPath}\n`
    );
    errors.forEach((error) => console.error(`  - ${error}`));
    console.error("\nFix the CSV and re-run. data/animals.json is unchanged.");
    process.exit(1);
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(animals, null, 2) + "\n");
  console.log(
    `Imported ${animals.length} animals from ${csvPath} to data/animals.json`
  );
}

main();

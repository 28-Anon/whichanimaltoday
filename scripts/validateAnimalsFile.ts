import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateAnimalData, type AnimalRecord } from "../src/animalData";

const ANIMALS_PATH = fileURLToPath(
  new URL("../data/animals.json", import.meta.url)
);

function main(): void {
  const records: AnimalRecord[] = JSON.parse(
    readFileSync(ANIMALS_PATH, "utf-8")
  );

  const errors = validateAnimalData(records);
  if (errors.length > 0) {
    console.error(
      `data/animals.json has ${errors.length} validation ${
        errors.length === 1 ? "error" : "errors"
      }:\n`
    );
    errors.forEach((error) => console.error(`  - ${error}`));
    process.exit(1);
  }

  console.log(`data/animals.json: ${records.length} records, all valid.`);
}

main();

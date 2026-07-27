import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseAnimalsCsv } from "./csvToAnimals";

const OUTPUT_PATH = fileURLToPath(new URL("../data/animals.json", import.meta.url));

function main(): void {
  const csvPath = process.argv[2];
  if (!csvPath) {
    throw new Error(
      "Usage: npm run import:animals -- <path-to-exported.csv>"
    );
  }

  const csvContent = readFileSync(csvPath, "utf-8");
  const animals = parseAnimalsCsv(csvContent);

  writeFileSync(OUTPUT_PATH, JSON.stringify(animals, null, 2) + "\n");
  console.log(
    `Imported ${animals.length} animals from ${csvPath} to data/animals.json`
  );
}

main();

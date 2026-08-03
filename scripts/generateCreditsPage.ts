import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ArchivableAnimal } from "./framerClient";

const ANIMALS_PATH = fileURLToPath(new URL("../data/animals.json", import.meta.url));
const OUTPUT_PATH = fileURLToPath(new URL("../docs/legal/credits.md", import.meta.url));

export function buildCreditsPage(animals: ArchivableAnimal[]): string {
  const sorted = [...animals].sort((a, b) =>
    a.commonName.localeCompare(b.commonName)
  );

  const rows = sorted
    .map((animal) => `| ${animal.commonName} | ${animal.imageAttribution} |`)
    .join("\n");

  return `# Photo Credits

Every animal photo on WhichAnimalToday is used under its original
Creative Commons or public-domain license. This page lists the
photographer and license for each one, satisfying the attribution
requirement those licenses carry — see each license's full terms at
[creativecommons.org](https://creativecommons.org/licenses/).

This page is generated from \`data/animals.json\`; re-run
\`npx tsx scripts/generateCreditsPage.ts\` after adding new animals to
keep it current.

| Animal | Credit |
|---|---|
${rows}
`;
}

export function readAnimals(): ArchivableAnimal[] {
  return JSON.parse(readFileSync(ANIMALS_PATH, "utf-8"));
}

export function readCreditsPage(): string {
  return readFileSync(OUTPUT_PATH, "utf-8");
}

function main(): void {
  const animals = readAnimals();
  const content = buildCreditsPage(animals);

  // --check makes drift a failure instead of a silent difference. Replacing an
  // image edits data/animals.json but does not run this script — only
  // content:accept does — so a swapped photo left the credits page naming the
  // previous photographer. On 2026-08-03 thirteen entries were crediting the
  // wrong person, which is a licence breach rather than a stale document.
  if (process.argv.includes("--check")) {
    const onDisk = readCreditsPage();
    if (onDisk.replace(/\r\n/g, "\n") !== content.replace(/\r\n/g, "\n")) {
      console.error(
        "docs/legal/credits.md is out of date with data/animals.json.\n" +
          "Run: npm run generate:credits"
      );
      process.exit(1);
    }
    console.log(`Credits page matches all ${animals.length} records.`);
    return;
  }

  writeFileSync(OUTPUT_PATH, content);
  console.log(`Generated credits page for ${animals.length} animals.`);
}

// Only when run as a script. The test imports buildCreditsPage, and an
// unguarded main() would rewrite the very file the test is checking.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

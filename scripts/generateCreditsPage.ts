import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ArchivableAnimal } from "./framerClient";

const ANIMALS_PATH = fileURLToPath(new URL("../data/animals.json", import.meta.url));
const OUTPUT_PATH = fileURLToPath(new URL("../docs/legal/credits.md", import.meta.url));

function main(): void {
  const animals: ArchivableAnimal[] = JSON.parse(
    readFileSync(ANIMALS_PATH, "utf-8")
  );

  const sorted = [...animals].sort((a, b) =>
    a.commonName.localeCompare(b.commonName)
  );

  const rows = sorted
    .map((animal) => `| ${animal.commonName} | ${animal.imageAttribution} |`)
    .join("\n");

  const content = `# Photo Credits

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

  writeFileSync(OUTPUT_PATH, content);
  console.log(`Generated credits page for ${animals.length} animals.`);
}

main();

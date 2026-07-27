import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchAnimalsFromFramer } from "./framerClient";

const COLLECTION_NAME = "Animals";
const OUTPUT_PATH = fileURLToPath(new URL("../data/animals.json", import.meta.url));

async function main(): Promise<void> {
  const projectUrl = process.env.FRAMER_PROJECT_URL;
  const apiKey = process.env.FRAMER_API_KEY;

  if (!projectUrl || !apiKey) {
    throw new Error(
      "FRAMER_PROJECT_URL and FRAMER_API_KEY environment variables must be set"
    );
  }

  const animals = await fetchAnimalsFromFramer(
    projectUrl,
    apiKey,
    COLLECTION_NAME
  );
  writeFileSync(OUTPUT_PATH, JSON.stringify(animals, null, 2) + "\n");
  console.log(`Exported ${animals.length} animals to data/animals.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

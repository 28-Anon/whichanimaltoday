import { writeFileSync } from "node:fs";
import {
  ENGINE_TARGET_PATH,
  extractRegion,
  firstDifference,
  generateFileText,
  readEngineModules,
  readTargetFile,
  renderEngineBlock,
  resolveFromRepoRoot,
} from "./framerEngine";

function main(): void {
  const checkOnly = process.argv.includes("--check");
  const modules = readEngineModules();
  const fileText = readTargetFile();

  if (checkOnly) {
    const difference = firstDifference(
      renderEngineBlock(modules),
      extractRegion(fileText)
    );
    if (difference === null) {
      console.log(`${ENGINE_TARGET_PATH}: generated engine is up to date.`);
      return;
    }
    console.error(
      `${ENGINE_TARGET_PATH}: the generated engine block is stale.\n\n` +
        `${difference}\n\n` +
        "Run `npm run generate:framer` and commit the result."
    );
    process.exit(1);
  }

  const nextText = generateFileText(ENGINE_TARGET_PATH, fileText, modules);
  if (nextText === fileText) {
    console.log(`${ENGINE_TARGET_PATH}: already up to date.`);
    return;
  }

  writeFileSync(resolveFromRepoRoot(ENGINE_TARGET_PATH), nextText, "utf8");
  console.log(`${ENGINE_TARGET_PATH}: regenerated the engine block.`);
}

main();

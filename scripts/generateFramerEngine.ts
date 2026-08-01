import { writeFileSync } from "node:fs";
import {
  assertNoCollisions,
  ENGINE_TARGETS,
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

  // Every target is visited before exiting, so one stale component cannot
  // hide another. `--check` then exits non-zero if any of them was stale.
  let stale = 0;

  for (const target of ENGINE_TARGETS) {
    const modules = readEngineModules(target);
    const fileText = readTargetFile(target);

    if (checkOnly) {
      const block = renderEngineBlock(modules);
      // Run even when the region is byte-identical to src/: a hand-written
      // name colliding with the generated block is invisible to the diff
      // below (the region itself hasn't changed), so it needs its own check.
      assertNoCollisions(target.path, fileText, block);

      const difference = firstDifference(block, extractRegion(fileText));
      if (difference === null) {
        console.log(`${target.path}: generated engine is up to date.`);
        continue;
      }
      stale += 1;
      console.error(
        `${target.path}: the generated engine block is stale.\n\n` +
          `${difference}\n\n` +
          "Run `npm run generate:framer` and commit the result."
      );
      continue;
    }

    const nextText = generateFileText(target.path, fileText, modules);
    if (nextText === fileText) {
      console.log(`${target.path}: already up to date.`);
      continue;
    }

    writeFileSync(resolveFromRepoRoot(target.path), nextText, "utf8");
    console.log(`${target.path}: regenerated the engine block.`);
  }

  if (stale > 0) process.exit(1);
}

main();

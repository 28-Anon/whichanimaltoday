import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { renderReviewSheet, type PendingRecord } from "./pipeline/reviewSheet";

const root = (path: string) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function main(): void {
  const pendingPath = root("data/pending.json");
  if (!existsSync(pendingPath)) {
    throw new Error("data/pending.json does not exist. Run content:draft first.");
  }

  const pending = JSON.parse(
    readFileSync(pendingPath, "utf8")
  ) as PendingRecord[];

  if (pending.length === 0) {
    throw new Error("data/pending.json is empty. Run content:draft first.");
  }

  writeFileSync(root("review.md"), renderReviewSheet(pending));

  const branch = `content/batch-${new Date().toISOString().slice(0, 10)}`;
  git("checkout", "-b", branch);

  // review.md and pending.json are both gitignored — force-added because the
  // reviewer needs the sheet, and content:accept needs the exact records the
  // sheet was rendered from.
  git("add", "-f", "review.md", "data/pending.json");
  git("commit", "-m", `content: ${pending.length} candidates for review`);
  git("push", "-u", "origin", branch);

  try {
    execFileSync(
      "gh",
      [
        "pr",
        "create",
        "--fill",
        "--title",
        `Content review: ${pending.length} candidates`,
      ],
      { stdio: "inherit" }
    );
  } catch {
    // gh is optional. Never fail the run over it — the branch is already
    // pushed and the pull request can be opened by hand.
    console.log(`\nBranch pushed: ${branch}`);
    console.log(
      "Open the pull request on GitHub to review with the images rendered."
    );
  }
}

main();

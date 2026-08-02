import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { reconcile } from "./pipeline/reconcile";
import type { PendingRecord } from "./pipeline/reviewSheet";
import { validateAnimalData, type AnimalRecord } from "../src/animalData";
import { buildSlug } from "./slug";
import { USER_AGENT } from "./pipeline/wikidataClient";

const root = (path: string) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));

const REPO = "28-Anon/whichanimaltoday";
const MAX_WIDTH = 1200;

async function mirror(record: PendingRecord, slug: string): Promise<string> {
  const target = root(`images/${slug}.jpg`);

  // Already downloaded: a run that died partway resumes instead of
  // re-fetching everything and hitting the rate limit again immediately.
  if (existsSync(target)) {
    return `https://cdn.jsdelivr.net/gh/${REPO}@master/images/${slug}.jpg`;
  }

  const name = record.image.file.replace(/^File:/, "").replace(/ /g, "_");
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${name}?width=${MAX_WIDTH}`;

  // Downloading full images hits Commons far harder than metadata does. The
  // first real run was rate-limited after 12 files and lost the whole batch.
  let response: Response | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    } catch {
      response = null;
    }
    if (response?.ok) break;
    if (response && response.status !== 429 && response.status < 500) break;
    await new Promise((resolve) => setTimeout(resolve, 3000 * 2 ** attempt));
  }

  if (!response?.ok) {
    throw new Error(
      `image ${response?.status ?? "network error"} for ${record.commonName}`
    );
  }

  mkdirSync(root("images"), { recursive: true });
  writeFileSync(target, Buffer.from(await response.arrayBuffer()));

  // Deliberately slower than the metadata client: these are whole images.
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // jsDelivr fronts GitHub, so the repo is the CDN origin. Pinned to master
  // rather than a tag: the daily job reads whatever master holds.
  return `https://cdn.jsdelivr.net/gh/${REPO}@master/images/${slug}.jpg`;
}

async function main(): Promise<void> {
  const pendingPath = root("data/pending.json");
  const sheetPath = root("review.md");

  if (!existsSync(pendingPath) || !existsSync(sheetPath)) {
    throw new Error(
      "Need both data/pending.json and review.md. Run content:propose first."
    );
  }

  const pending = JSON.parse(
    readFileSync(pendingPath, "utf8")
  ) as PendingRecord[];
  const sheet = readFileSync(sheetPath, "utf8");

  const { accepted, rejected } = reconcile(pending, sheet);
  console.log(`${accepted.length} accepted, ${rejected.length} rejected\n`);

  const animals = JSON.parse(
    readFileSync(root("data/animals.json"), "utf8")
  ) as AnimalRecord[];

  const before = animals.length;

  for (const record of accepted) {
    const slug = buildSlug(record.commonName, animals.length + 1);
    const imageUrl = await mirror(record, slug);

    // The review-only fields must never reach animals.json.
    const { qid, sourceUrl, image, ...rest } = record as PendingRecord &
      Record<string, unknown>;

    animals.push({ ...(rest as unknown as AnimalRecord), imageUrl });
    console.log(`  mirrored ${record.commonName}`);
  }

  const errors = validateAnimalData(animals);
  if (errors.length > 0) {
    console.error(
      `\nRefusing to write — ${errors.length} validation errors:\n`
    );
    errors.forEach((error) => console.error(`  - ${error}`));
    process.exit(1);
  }

  // APPEND, never replace. scripts/animalsFileGuard.ts exists because a
  // wholesale write destroys the species and bonus fields on records already
  // there — the trap the CSV importer set.
  writeFileSync(
    root("data/animals.json"),
    JSON.stringify(animals, null, 2) + "\n"
  );

  const rejectedPath = root("data/rejected.json");
  const priorRejects = existsSync(rejectedPath)
    ? JSON.parse(readFileSync(rejectedPath, "utf8"))
    : [];
  priorRejects.push(
    ...rejected.map((record) => ({
      qid: record.qid,
      commonName: record.commonName,
      reason: "declined at review",
    }))
  );
  writeFileSync(rejectedPath, JSON.stringify(priorRejects, null, 2) + "\n");

  // npx is npx.cmd on Windows, and execFileSync does not consult PATHEXT —
  // so the bare name fails with ENOENT after all the real work is done.
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(npx, ["tsx", "scripts/generateCreditsPage.ts"], {
    stdio: "inherit",
    cwd: root("."),
  });

  rmSync(sheetPath);
  rmSync(pendingPath);

  console.log(
    `\nanimals.json: ${before} -> ${animals.length} records. ` +
      `${priorRejects.length} total rejected.`
  );
}

main();

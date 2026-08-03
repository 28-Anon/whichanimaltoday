import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildSlug } from "./slug";
import { USER_AGENT } from "./pipeline/wikidataClient";

/**
 * Mirrors the animals still hotlinked from Wikimedia Commons into images/, so
 * every puzzle photo is served by the same CDN as the rest.
 *
 * Why this exists: a Commons `Special:FilePath` URL is not an image URL. It is
 * a redirect into MediaWiki's application layer, which redirects again before
 * a browser gets a pixel — three round trips per photo, on the part of
 * Wikimedia's stack least intended to absorb them. Commons tolerates
 * hotlinking; it does not promise to.
 *
 * Deliberately a two-phase script. The default pass downloads to a staging
 * directory and reports; only `--apply` writes into images/ and rewrites
 * data/animals.json. The reason is that images/ already holds files whose
 * slugs collide with animals still pointing at Commons — replacement images
 * that were fetched but never applied. Overwriting those blind would destroy
 * curated work, and adopting them blind would swap a live puzzle photo nobody
 * approved. Both have happened on this project before. Conflicts are reported
 * and skipped; a human looks at the two pictures and decides.
 */
const REPO = "28-Anon/whichanimaltoday";
const STAGING = ".cache/mirror";

const root = (path: string) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));

interface Animal {
  commonName: string;
  imageUrl: string;
  [key: string]: unknown;
}

type Status = "new" | "identical" | "conflict";

interface Result {
  index: number;
  commonName: string;
  slug: string;
  status: Status;
  bytes: number;
}

interface Failure {
  commonName: string;
  reason: string;
}

function digest(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * Rejects anything that is not actually a photograph.
 *
 * Special:FilePath redirects, and a failed redirect hands back an HTML error
 * page with HTTP 200. Written to disk as .jpg it would sail through every
 * later check and only surface as a broken image for players.
 */
function assertJpeg(buffer: Buffer, contentType: string, label: string): void {
  if (!contentType.startsWith("image/")) {
    throw new Error(`${label}: content-type was "${contentType}", not an image`);
  }
  if (buffer.length < 10_000) {
    throw new Error(`${label}: only ${buffer.length} bytes — too small to be a photo`);
  }
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    throw new Error(`${label}: does not begin with JPEG magic bytes`);
  }
}

async function download(url: string, label: string): Promise<Buffer> {
  // Same backoff as scripts/acceptCandidates.ts: whole images hit Commons far
  // harder than metadata, and the first real run there was rate-limited after
  // 12 files.
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
    throw new Error(`${label}: HTTP ${response?.status ?? "network error"}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  assertJpeg(buffer, response.headers.get("content-type") ?? "", label);
  return buffer;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const animalsPath = root("data/animals.json");
  const animals = JSON.parse(readFileSync(animalsPath, "utf8")) as Animal[];

  const targets = animals
    .map((animal, i) => ({ animal, index: i + 1 }))
    .filter(({ animal }) => animal.imageUrl.includes("commons.wikimedia.org"));

  if (targets.length === 0) {
    console.log("Nothing to mirror — no Commons URLs left in animals.json.");
    return;
  }

  console.log(`${targets.length} animals still hotlinked from Commons.\n`);
  mkdirSync(root(STAGING), { recursive: true });
  mkdirSync(root("images"), { recursive: true });

  const results: Result[] = [];
  const failures: Failure[] = [];

  for (const { animal, index } of targets) {
    const slug = buildSlug(animal.commonName, index);
    const staged = root(`${STAGING}/${slug}.jpg`);
    const target = root(`images/${slug}.jpg`);

    if (!existsSync(staged)) {
      // One unusable source must not cost the whole batch: downloads are the
      // slow, rate-limited part, and aborting throws away every file already
      // fetched. Collect and report instead.
      try {
        const buffer = await download(animal.imageUrl, animal.commonName);
        writeFileSync(staged, buffer);
      } catch (error) {
        failures.push({
          commonName: animal.commonName,
          reason: error instanceof Error ? error.message : String(error),
        });
        console.log(`  x ${slug}  FAILED`);
        continue;
      }
      // Deliberately slower than the metadata client: these are whole images.
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    const bytes = readFileSync(staged).length;
    let status: Status = "new";
    if (existsSync(target)) {
      status = digest(target) === digest(staged) ? "identical" : "conflict";
    }

    results.push({ index, commonName: animal.commonName, slug, status, bytes });
    const mark = { new: "+", identical: "=", conflict: "!" }[status];
    console.log(`  ${mark} ${slug}  (${Math.round(bytes / 1024)} KB)`);
  }

  // Adopting a conflict is visually a no-op: the staged file was downloaded
  // from the URL animals.json already points at, so players see the identical
  // photograph either way — only the host changes. What gets overwritten is an
  // orphan in images/ that nothing references, superseded when the image was
  // replaced, and still recoverable from git. Verified on Resplendent Quetzal:
  // the orphan is the rejected female with no tail streamers, the live Commons
  // image the male with them.
  const adoptLive = process.argv.includes("--adopt-live");
  const conflicts = adoptLive
    ? []
    : results.filter((r) => r.status === "conflict");
  const movable = adoptLive
    ? results
    : results.filter((r) => r.status !== "conflict");

  console.log(
    `\n${movable.length} ready to mirror, ${conflicts.length} conflicts, ` +
      `${failures.length} unusable.`
  );

  if (failures.length > 0) {
    console.log(
      "\nUNUSABLE — these stay on Commons and need a replacement image.\n" +
        "Run: npm run content:suggest -- <animal>\n"
    );
    for (const failure of failures) {
      console.log(`  ${failure.commonName}: ${failure.reason}`);
    }
  }

  if (conflicts.length > 0) {
    console.log(
      "\nCONFLICT — images/ already holds a different picture under this name.\n" +
        "Look at both before deciding. Nothing below has been touched:\n"
    );
    for (const conflict of conflicts) {
      console.log(`  ${conflict.commonName}`);
      console.log(`    in repo:  images/${conflict.slug}.jpg`);
      console.log(`    on Commons: ${STAGING}/${conflict.slug}.jpg`);
    }
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to mirror the non-conflicting files.");
    return;
  }

  const overwritten = movable.filter((r) => r.status === "conflict");

  for (const result of movable) {
    copyFileSync(root(`${STAGING}/${result.slug}.jpg`), root(`images/${result.slug}.jpg`));
  }

  // Overwriting a path jsDelivr has already served is the one way this script
  // can put a wrong photograph live. @master is cached for hours, so the CDN
  // keeps handing out the superseded image while animals.json points at the
  // new URL. Measured on 2026-08-03: all five overwritten paths still served
  // the old bytes minutes after the push, including the rejected female
  // quetzal. Purging is not optional, and the push order (images, verify,
  // then URLs) is what makes it safe.
  if (overwritten.length > 0) {
    console.log(`\nPurging jsDelivr for ${overwritten.length} overwritten paths...`);
    for (const result of overwritten) {
      const url = `https://purge.jsdelivr.net/gh/${REPO}@master/images/${result.slug}.jpg`;
      try {
        const response = await fetch(url);
        console.log(`  ${response.ok ? "purged" : `HTTP ${response.status}`}  ${result.slug}`);
      } catch {
        console.log(`  FAILED  ${result.slug} — purge by hand before pushing`);
      }
    }
    console.log(
      "\nConfirm the CDN matches local before pushing data/animals.json:\n" +
        "  compare sha256 of each images/<slug>.jpg against its jsDelivr URL."
    );
  }

  // Mutates imageUrl in place and leaves every other field untouched.
  // scripts/animalsFileGuard.ts exists because a wholesale rewrite once
  // destroyed the species and bonus fields on records already present.
  const mirrored = new Set(movable.map((r) => r.slug));
  let rewritten = 0;
  animals.forEach((animal, i) => {
    const slug = buildSlug(animal.commonName, i + 1);
    if (!mirrored.has(slug)) return;
    animal.imageUrl = `https://cdn.jsdelivr.net/gh/${REPO}@master/images/${slug}.jpg`;
    rewritten++;
  });

  writeFileSync(animalsPath, JSON.stringify(animals, null, 2) + "\n");
  console.log(`\nMirrored ${movable.length} files, rewrote ${rewritten} URLs.`);

  const remaining = animals.filter((a) =>
    a.imageUrl.includes("commons.wikimedia.org")
  ).length;
  console.log(`${remaining} Commons URLs still in animals.json.`);
}

main();

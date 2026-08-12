import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
  rmSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  originalFileFor,
  displayUrlFor,
  isWorthAdopting,
  formatKb,
  DISPLAY_DIR,
  DISPLAY_WIDTH,
  DISPLAY_QUALITY,
} from "./displayImages";

/**
 * Derives display-sized copies of every puzzle photo into images/display/ and
 * points data/animals.json at them.
 *
 * This ships **without a Framer paste**: the URLs live in data/animals.json,
 * which the components fetch at runtime, so pushing this repo is the whole
 * deployment. That is unusual for this backlog and is most of why it is worth
 * doing now.
 *
 * Two-phase like scripts/mirrorCommonsImages.ts — the default pass writes the
 * derivatives and reports what it would adopt, and only `--apply` rewrites
 * animals.json. Deriving files is safe (new paths, nothing references them yet);
 * changing what players fetch is the part worth looking at first.
 *
 * The originals stay in images/ untouched. They are the only copy of each
 * photograph, and the next layout change re-derives from them rather than from
 * a lossy intermediate.
 */
const root = (path: string) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));

interface Animal {
  commonName: string;
  imageUrl: string;
  [key: string]: unknown;
}

interface ArchiveEntry {
  imageUrl: string;
  [key: string]: unknown;
}

interface Derived {
  commonName: string;
  file: string;
  originalBytes: number;
  derivedBytes: number;
  adopt: boolean;
}

interface Skipped {
  commonName: string;
  reason: string;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const animalsPath = root("data/animals.json");
  const animals = JSON.parse(readFileSync(animalsPath, "utf8")) as Animal[];

  mkdirSync(root(DISPLAY_DIR), { recursive: true });

  const derived: Derived[] = [];
  const skipped: Skipped[] = [];

  for (const animal of animals) {
    const file = originalFileFor(animal.imageUrl);
    if (!file) {
      skipped.push({
        commonName: animal.commonName,
        reason: `not served from images/ — ${animal.imageUrl}`,
      });
      continue;
    }

    const source = root(`images/${file}`);
    if (!existsSync(source)) {
      // A URL pointing at a file this repo does not hold means the CDN is
      // serving something git cannot reproduce. Worth reporting loudly rather
      // than skipping quietly.
      skipped.push({
        commonName: animal.commonName,
        reason: `images/${file} is missing from the repo`,
      });
      continue;
    }

    const target = root(`${DISPLAY_DIR}/${file}`);
    // withoutEnlargement: several photos are already narrower than the target,
    // and upscaling one would spend bytes to add nothing but blur.
    await sharp(source)
      .resize({ width: DISPLAY_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: DISPLAY_QUALITY, mozjpeg: true })
      .toFile(target);

    const originalBytes = statSync(source).size;
    const derivedBytes = statSync(target).size;
    derived.push({
      commonName: animal.commonName,
      file,
      originalBytes,
      derivedBytes,
      adopt: isWorthAdopting(originalBytes, derivedBytes),
    });
  }

  const adopted = derived.filter((d) => d.adopt);

  // A derivative nothing will point at is just an orphan in the repo, and an
  // orphan image on this project has a history of being adopted later by
  // someone who assumed it was there for a reason. Delete rather than keep.
  for (const d of derived) {
    if (!d.adopt) rmSync(root(`${DISPLAY_DIR}/${d.file}`), { force: true });
  }
  const before = adopted.reduce((sum, d) => sum + d.originalBytes, 0);
  const after = adopted.reduce((sum, d) => sum + d.derivedBytes, 0);

  console.log(`Derived ${derived.length} files into ${DISPLAY_DIR}/.\n`);

  const worstFirst = [...derived].sort((a, b) => b.originalBytes - a.originalBytes);
  for (const d of worstFirst.slice(0, 5)) {
    console.log(
      `  ${d.file}  ${formatKb(d.originalBytes)} -> ${formatKb(d.derivedBytes)}`
    );
  }
  if (worstFirst.length > 5) console.log(`  ... and ${worstFirst.length - 5} more`);

  const kept = derived.filter((d) => !d.adopt);
  if (kept.length > 0) {
    console.log(
      `\n${kept.length} derivatives saved too little to be worth a second file; ` +
        "those animals keep their original URL:"
    );
    for (const d of kept) {
      console.log(
        `  ${d.file}  ${formatKb(d.originalBytes)} -> ${formatKb(d.derivedBytes)}`
      );
    }
  }

  if (skipped.length > 0) {
    console.log(`\n${skipped.length} skipped:`);
    for (const s of skipped) console.log(`  ${s.commonName}: ${s.reason}`);
  }

  const saved = before - after;
  if (adopted.length === 0) {
    // The steady state once everything has been adopted: every URL already
    // points at display/, so there is nothing left to derive from.
    console.log("\nNothing to adopt — every eligible image is already derived.");
  } else {
    console.log(
      `\n${adopted.length} to adopt: ${formatKb(before)} -> ${formatKb(after)} ` +
        `(${formatKb(saved)} saved, ${Math.round((saved / before) * 100)}%)`
    );
  }

  if (!apply) {
    console.log(
      "\nDry run — derivatives written, no URLs changed. Re-run with --apply."
    );
    return;
  }

  // Mutates imageUrl in place and leaves every other field alone. A wholesale
  // rewrite once destroyed the species and bonus fields on records already
  // present, which is why scripts/animalsFileGuard.ts exists.
  const adoptedFiles = new Map(adopted.map((d) => [d.file, displayUrlFor(d.file)]));
  let rewritten = 0;
  for (const animal of animals) {
    const file = originalFileFor(animal.imageUrl);
    const url = file ? adoptedFiles.get(file) : undefined;
    if (!url) continue;
    animal.imageUrl = url;
    rewritten++;
  }
  writeFileSync(animalsPath, JSON.stringify(animals, null, 2) + "\n");

  // data/archive.json holds a *copy* of imageUrl taken when each day was
  // archived, so already-archived days would go on serving the originals. The
  // archive list renders every past day on one page, which makes it the heaviest
  // page on the site — precisely where this is worth having. Future entries need
  // nothing: scripts/archiveEntry.ts copies whatever animals.json holds.
  const archivePath = root("data/archive.json");
  const archive = JSON.parse(readFileSync(archivePath, "utf8")) as ArchiveEntry[];
  let archiveRewritten = 0;
  for (const entry of archive) {
    const file = originalFileFor(entry.imageUrl);
    const url = file ? adoptedFiles.get(file) : undefined;
    if (!url) continue;
    entry.imageUrl = url;
    archiveRewritten++;
  }
  writeFileSync(archivePath, JSON.stringify(archive, null, 2) + "\n");

  console.log(
    `\nRewrote ${rewritten} URLs in animals.json and ${archiveRewritten} in archive.json.`
  );
  console.log(
    "Push images/display/ before data/, so the CDN has the files by the time " +
      "anything points at them."
  );
}

main();

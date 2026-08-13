import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { download } from "./pipeline/imageDownload";
import {
  archiveFileFor,
  hotlinkedEntries,
  type ArchiveEntry,
} from "./archiveMirror";
import {
  displayUrlFor,
  originalUrlFor,
  isWorthAdopting,
  formatKb,
  DISPLAY_DIR,
  DISPLAY_WIDTH,
  DISPLAY_QUALITY,
} from "./displayImages";

/**
 * Mirrors any archived day still served by somebody else into images/, so no
 * page on the site hotlinks another host.
 *
 * `scripts/mirrorCommonsImages.ts` did this for `data/animals.json` on
 * 2026-08-03. It could not do it for `data/archive.json`, which holds copies of
 * `imageUrl` taken on the day each puzzle ran — puzzle #2 was archived the day
 * before that pass and has pointed at `upload.wikimedia.org` ever since.
 *
 * Same photograph or nothing. The archive records what players actually saw, so
 * an entry is repointed only at a mirror of its own image, never at whatever the
 * animal's record holds today — see scripts/archiveMirror.ts for the red panda
 * that nearly made that swap.
 *
 * Two-phase, like the other two mirrors. The default pass downloads to staging
 * and reports; only `--apply` writes into images/ and rewrites archive.json.
 *
 *   npm run archive:mirror
 *   npm run archive:mirror -- --apply
 *
 * A display copy is derived alongside the original, on the same terms as
 * scripts/generateDisplayImages.ts: the archive list renders every past day on
 * one page, which makes it the heaviest page on the site. That script only
 * knows about files an animal record points at, so this one owns the
 * derivatives for archive-only photographs — if DISPLAY_WIDTH ever changes,
 * re-run both.
 */
const STAGING = ".cache/archive-mirror";

const root = (path: string) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));

function digest(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

interface Mirrored {
  entry: ArchiveEntry;
  file: string;
  staged: string;
  bytes: number;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const archivePath = root("data/archive.json");
  const archive = JSON.parse(readFileSync(archivePath, "utf8")) as ArchiveEntry[];

  const targets = hotlinkedEntries(archive);
  if (targets.length === 0) {
    console.log("Nothing to mirror — every archived day is served from this repo.");
    return;
  }

  console.log(
    `${targets.length} archived ${targets.length === 1 ? "day" : "days"} ` +
      "served by another host:\n"
  );
  mkdirSync(root(STAGING), { recursive: true });

  const mirrored: Mirrored[] = [];
  // The reason already names the day: download() labels its own errors.
  const failures: string[] = [];
  const conflicts: string[] = [];

  for (const entry of targets) {
    const file = archiveFileFor(entry);
    const staged = root(`${STAGING}/${file}`);
    const label = `#${entry.puzzleNumber} ${entry.commonName}`;

    if (!existsSync(staged)) {
      try {
        writeFileSync(staged, await download(entry.imageUrl, label));
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
        console.log(`  x ${file}  FAILED`);
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    // The puzzle- prefix makes this all but impossible, but a name collision
    // here would overwrite a live puzzle photograph, so it is checked rather
    // than reasoned about.
    const target = root(`images/${file}`);
    if (existsSync(target) && digest(target) !== digest(staged)) {
      conflicts.push(file);
      console.log(`  ! ${file}  CONFLICT — images/ holds a different picture`);
      continue;
    }

    const bytes = statSync(staged).size;
    mirrored.push({ entry, file, staged, bytes });
    console.log(`  + ${file}  (${formatKb(bytes)})  ${entry.imageUrl}`);
  }

  if (failures.length > 0) {
    console.log(`\n${failures.length} could not be downloaded:`);
    for (const failure of failures) console.log(`  ${failure}`);
    console.log(
      "\nThese stay hotlinked. The photograph is still on the original host — " +
        "check the URL by hand before assuming it is gone."
    );
  }

  if (conflicts.length > 0) {
    console.log(
      `\n${conflicts.length} conflicts, left untouched. Look at both pictures ` +
        "before deciding: an archived day must keep the photograph it showed."
    );
  }

  if (mirrored.length === 0) return;

  if (!apply) {
    console.log(
      `\nDry run — ${mirrored.length} staged in ${STAGING}/, nothing written. ` +
        "Re-run with --apply."
    );
    return;
  }

  mkdirSync(root("images"), { recursive: true });
  mkdirSync(root(DISPLAY_DIR), { recursive: true });

  for (const { entry, file, staged, bytes } of mirrored) {
    // The original goes into images/ even when the archive ends up serving the
    // derivative: it is the only copy of that photograph now, and the next
    // layout change re-derives from it rather than from a lossy intermediate.
    writeFileSync(root(`images/${file}`), readFileSync(staged));

    const derived = root(`${DISPLAY_DIR}/${file}`);
    await sharp(staged)
      .resize({ width: DISPLAY_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: DISPLAY_QUALITY, mozjpeg: true })
      .toFile(derived);

    const derivedBytes = statSync(derived).size;
    const adopt = isWorthAdopting(bytes, derivedBytes);
    // A derivative nothing points at is an orphan, and an orphan image on this
    // project has a history of being adopted later by someone who assumed it
    // was there for a reason.
    if (!adopt) rmSync(derived, { force: true });

    entry.imageUrl = adopt ? displayUrlFor(file) : originalUrlFor(file);
    console.log(
      `  ${file}  ${formatKb(bytes)} -> ${formatKb(derivedBytes)}` +
        `${adopt ? "" : " (derivative not worth keeping, serving the original)"}`
    );
  }

  writeFileSync(archivePath, JSON.stringify(archive, null, 2) + "\n");

  console.log(
    `\nRewrote ${mirrored.length} ${mirrored.length === 1 ? "URL" : "URLs"} ` +
      "in archive.json.\n" +
      "Push images/ before data/, so the CDN has the files by the time " +
      "anything points at them."
  );
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exitCode = 1;
});

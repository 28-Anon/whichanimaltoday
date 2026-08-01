import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sparql } from "./pipeline/wikidataClient";
import {
  buildDiscoveryQuery,
  mapDiscoveryRows,
  type Candidate,
} from "./pipeline/discoveryQuery";
import { fetchImageMeta, type ImageMeta } from "./pipeline/commonsClient";
import {
  isAllowedLicence,
  hasBlockedName,
  findAliasCollisions,
  EXCLUDED_TAXON_PREFIXES,
} from "./pipeline/gates";
import {
  deriveFamilyName,
  collectKnownFamilies,
} from "./pipeline/familyName";

/**
 * The six classes line up with the game's ALLOWED_CATEGORIES, so `category`
 * falls out of which query produced the row rather than needing inference.
 */
const CLASSES: Record<string, string> = {
  mammal: "Q7377",
  bird: "Q5113",
  reptile: "Q10811",
  amphibian: "Q10908",
  fish: "Q127282",
  insect: "Q1390",
};

const FAME_FLOOR = 40;

/**
 * 360, not the 640 this plan originally specified.
 *
 * File:Condylura.jpg — the star-nosed mole photograph already live in the
 * game — is 603x383. A 640 floor would have rejected an image demonstrably
 * good enough in production. The game renders into a 4:3 contain box roughly
 * 600px wide, so 360 on the short side is the honest minimum.
 */
const MIN_SHORT_SIDE = 360;

const root = (path: string) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));

interface DiscoveredCandidate extends Candidate {
  image: ImageMeta;
  suggestedFamily: string | null;
}

function loadKnownNames(): Set<string> {
  const animals = JSON.parse(
    readFileSync(root("data/animals.json"), "utf8")
  ) as Array<{ commonName: string; aliases: string[]; species?: string }>;

  const known = new Set<string>();
  for (const animal of animals) {
    known.add(animal.commonName.toLowerCase());
    if (animal.species) known.add(animal.species.toLowerCase());
    for (const alias of animal.aliases) known.add(alias.toLowerCase());
  }
  return known;
}

function loadRejectedQids(): Set<string> {
  const path = root("data/rejected.json");
  if (!existsSync(path)) return new Set();
  const rejected = JSON.parse(readFileSync(path, "utf8")) as Array<{
    qid: string;
  }>;
  return new Set(rejected.map((entry) => entry.qid));
}

async function main(): Promise<void> {
  const known = loadKnownNames();
  const rejected = loadRejectedQids();
  const reasons = new Map<string, string>();

  console.log(`Querying ${Object.keys(CLASSES).length} classes at sitelinks >= ${FAME_FLOOR}\n`);

  let pool: Candidate[] = [];
  for (const [category, qid] of Object.entries(CLASSES)) {
    const started = Date.now();
    try {
      const rows = await sparql(buildDiscoveryQuery(qid, FAME_FLOOR));
      const mapped = mapDiscoveryRows(rows, category);
      pool.push(...mapped);
      console.log(
        `  ${category.padEnd(10)} ${String(mapped.length).padStart(5)}  (${Date.now() - started}ms)`
      );
    } catch (error) {
      // Birds, reptiles and insects time out on the transitive closure.
      // Reported, never fatal: a partial pool is still worth reviewing, and
      // mammals plus fish alone measured over 4,000 usable species.
      console.warn(
        `  ${category.padEnd(10)}  SKIPPED — ${(error as Error).message}`
      );
    }
  }

  console.log(`\nRaw pool: ${pool.length}`);

  // Name-level gates first: they are free, and every candidate they remove is
  // one fewer Commons request below.
  pool = pool.filter((candidate) => {
    const blocked = hasBlockedName(candidate.commonNames);
    if (blocked) {
      reasons.set(candidate.qid, `blocked name "${blocked}"`);
      return false;
    }
    if (
      EXCLUDED_TAXON_PREFIXES.some((prefix) =>
        candidate.taxonName.startsWith(prefix)
      )
    ) {
      reasons.set(candidate.qid, "excluded taxon");
      return false;
    }
    if (rejected.has(candidate.qid)) return false;
    if (candidate.commonNames.some((name) => known.has(name.toLowerCase()))) {
      reasons.set(candidate.qid, "already in animals.json");
      return false;
    }
    return true;
  });

  // A colliding alias is dropped, not the candidate: `beluga` is ambiguous,
  // but Delphinapterus leucas is still a perfectly good puzzle under its
  // other names.
  const collisions = findAliasCollisions(pool);
  for (const candidate of pool) {
    candidate.commonNames = candidate.commonNames.filter(
      (name) => !collisions.has(name.toLowerCase())
    );
  }
  pool = pool.filter((candidate) => {
    if (candidate.commonNames.length > 0) return true;
    reasons.set(candidate.qid, "every common name collided");
    return false;
  });

  console.log(`After name gates: ${pool.length}`);
  console.log(`Fetching image metadata for ${pool.length} files…`);

  const meta = await fetchImageMeta(pool.map((c) => c.imageFile));

  // Corroborated across the whole pool: a head noun only names a family if
  // more than one species ends in it. Without this, one-off foreign synonyms
  // become suggestions — "Cu Lan" suggested "Lan".
  const knownFamilies = collectKnownFamilies(pool.map((c) => c.commonNames));

  const discovered: DiscoveredCandidate[] = [];
  for (const candidate of pool) {
    const image = meta.get(candidate.imageFile);
    if (!image) {
      reasons.set(candidate.qid, "no image metadata");
      continue;
    }
    if (!isAllowedLicence(image.licence)) {
      reasons.set(candidate.qid, `licence "${image.licence}"`);
      continue;
    }
    if (Math.min(image.width, image.height) < MIN_SHORT_SIDE) {
      reasons.set(
        candidate.qid,
        `image too small (${image.width}x${image.height})`
      );
      continue;
    }

    discovered.push({
      ...candidate,
      image,
      suggestedFamily: deriveFamilyName(candidate.commonNames, knownFamilies),
    });
  }

  writeFileSync(
    root("data/candidates.json"),
    JSON.stringify(discovered, null, 2) + "\n"
  );

  const tally = new Map<string, number>();
  for (const reason of reasons.values()) {
    const key = reason.replace(/".*"/, "…").replace(/\(.*\)/, "…");
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  console.log(`\n${discovered.length} candidates written to data/candidates.json`);
  console.log(`${reasons.size} gated out:`);
  for (const [reason, count] of [...tally].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(5)}  ${reason}`);
  }
}

main();

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { USER_AGENT } from "./pipeline/wikidataClient";
import { judgeImage } from "./pipeline/imageJudge";
import { isWorthJudging, type Candidate } from "./pipeline/candidateFilter";

/**
 * Finds a replacement photograph for an animal whose current one failed the
 * audit.
 *
 * This is the loop that was being done by hand — search Commons, open the
 * candidates, look at each, keep the first that satisfies the rule — and by
 * hand it took roughly ten minutes and five tool calls per animal. The model
 * applies the same rule the audit does, from the same prompt, so a suggestion
 * cannot be judged more leniently than the check it has to survive.
 *
 * It suggests and never edits data/animals.json. Auto-applying is exactly how
 * a cartoon blobfish got replaced with a painted one: the substitution
 * happened without anybody looking at the result.
 *
 * Usage:
 *   npm run content:suggest -- Platypus "Great Argus"
 *   npm run content:suggest -- --dry-run Platypus
 *
 * --dry-run does the search and the cheap filters and stops before the model,
 * so it costs nothing. Worth running first: if it reports no survivors, the
 * paid pass would have had nothing to look at either.
 */
const MODEL_COST_HINT = "roughly a penny per animal, more if early candidates fail";

const root = (path: string) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));

/** Candidates are judged in order, so the cap is a spend limit per animal. */
const MAX_CANDIDATES = 8;

interface Animal {
  commonName: string;
  species?: string;
  aliases: string[];
  imageUrl: string;
  imageAttribution: string;
}

function stripHtml(value: string): string {
  return (value ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

async function searchCommons(query: string): Promise<Candidate[]> {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query" +
    "&generator=search&gsrnamespace=6&gsrlimit=30" +
    `&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}` +
    "&prop=imageinfo&iiprop=url|size|extmetadata" +
    "&iiextmetadatafilter=LicenseShortName|Artist&format=json";

  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Commons search: HTTP ${response.status}`);

  const pages = ((await response.json()) as {
    query?: { pages?: Record<string, {
      title: string;
      imageinfo?: {
        width: number;
        height: number;
        extmetadata?: Record<string, { value: string }>;
      }[];
    }> };
  }).query?.pages ?? {};

  return Object.values(pages)
    .map((page) => {
      const info = page.imageinfo?.[0];
      if (!info) return null;
      return {
        file: page.title.replace(/^File:/, ""),
        width: info.width,
        height: info.height,
        licence: stripHtml(info.extmetadata?.LicenseShortName?.value ?? ""),
        artist: stripHtml(info.extmetadata?.Artist?.value ?? ""),
      };
    })
    .filter((candidate): candidate is Candidate => candidate !== null);
}

function thumbUrl(file: string): string {
  return (
    "https://commons.wikimedia.org/wiki/Special:FilePath/" +
    `${encodeURIComponent(file)}?width=1200`
  );
}

async function suggestFor(
  client: Anthropic | null,
  animal: Animal
): Promise<void> {
  const names = [animal.commonName, animal.species, ...animal.aliases]
    .filter(Boolean)
    .join(", ");

  // The scientific name first: it is unambiguous, and a common-name search
  // is what returned a roller coaster called "Dragon Fly".
  const query = animal.species ?? animal.commonName;

  console.log(`\n${animal.commonName}`);
  console.log(`  searching Commons for "${query}"`);

  let candidates: Candidate[];
  try {
    candidates = (await searchCommons(query)).filter(isWorthJudging);
  } catch (error) {
    console.log(`  search failed: ${(error as Error).message}`);
    return;
  }

  if (candidates.length === 0) {
    console.log("  nothing survived the cheap filters — search by hand");
    return;
  }

  if (!client) {
    console.log(`  ${candidates.length} survived the free filters:`);
    for (const candidate of candidates.slice(0, MAX_CANDIDATES)) {
      console.log(
        `    ${candidate.file} (${candidate.width}x${candidate.height}, ${candidate.licence})`
      );
    }
    return;
  }

  console.log(`  ${candidates.length} worth judging, trying up to ${MAX_CANDIDATES}`);

  for (const candidate of candidates.slice(0, MAX_CANDIDATES)) {
    const url = thumbUrl(candidate.file);
    let verdict;
    try {
      verdict = await judgeImage(client, url, names);
    } catch (error) {
      console.log(`    skip ${candidate.file} — ${(error as Error).message}`);
      continue;
    }

    if (!verdict.ok) {
      console.log(`    no   ${candidate.file} — ${verdict.note}`);
      continue;
    }

    console.log(`\n  FOUND: ${candidate.file}`);
    console.log(`    ${candidate.width}x${candidate.height}, ${candidate.licence}`);
    console.log(`    ${verdict.note}`);
    console.log(`    url:         ${url}`);
    console.log(
      `    attribution: Photo: ${candidate.artist}, ${candidate.licence}, Wikimedia Commons`
    );
    console.log("\n    Look at it before applying it.");
    return;
  }

  console.log("  no candidate passed — this animal needs a human, or an exception");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !dryRun) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Export it, or pass --dry-run to search " +
        "without judging."
    );
  }

  const animals = JSON.parse(
    readFileSync(root("data/animals.json"), "utf8")
  ) as Animal[];

  const wanted = args.filter((arg) => !arg.startsWith("--"));
  if (wanted.length === 0) {
    console.log("Name the animals to find replacements for:");
    console.log('  npm run content:suggest -- Platypus "Great Argus"');
    console.log(`\nCosts ${MODEL_COST_HINT}.`);
    return;
  }

  const targets = wanted.map((name) => {
    const animal = animals.find(
      (a) => a.commonName.toLowerCase() === name.toLowerCase()
    );
    if (!animal) throw new Error(`No animal named "${name}" in animals.json`);
    return animal;
  });

  const client = dryRun ? null : new Anthropic({ apiKey });
  for (const animal of targets) {
    await suggestFor(client, animal);
  }
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exitCode = 1;
});

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ask } from "./pipeline/claudeClient";

const root = (path: string) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));

const BATCH = 40;

/**
 * The rubric is the whole selection mechanism.
 *
 * Everything upstream selects for FAME — a floor that makes the pool
 * reviewable — and fame is close to the opposite of what this game wants.
 * Nothing else measures whether an animal is strange enough to be worth a
 * day. If a batch comes back reading like a zoo guide, this text is what to
 * fix.
 */
const RUBRIC = `Score each animal 0-10 as a DAILY PHOTO-GUESSING PUZZLE.

10 = visually bizarre and instantly memorable; a player who sees the photo
     will want to tell someone about it (star-nosed mole, aye-aye, pink fairy
     armadillo, naked mole rat, okapi, saiga, proboscis monkey)
5  = recognisable and pleasant but unremarkable in silhouette
0  = indistinguishable from dozens of near-identical species (most bats,
     rodents, antelope, dolphins, generic big cats)

Score DOWN, hard: lion, tiger, wolf, leopard and anything equally famous.
They are boring puzzles however good the photo.
Score DOWN: extinct species, domesticated animals, pest species.

Return one line per animal and nothing else, in this exact form:
<taxonName><TAB><score>`;

interface Scored {
  taxonName: string;
  commonNames: string[];
  score?: number;
}

async function main(): Promise<void> {
  const pool = JSON.parse(
    readFileSync(root("data/candidates.json"), "utf8")
  ) as Scored[];

  const unscored = pool.filter((candidate) => candidate.score === undefined);
  console.log(`${unscored.length} unscored of ${pool.length}`);
  if (unscored.length === 0) return;

  for (let index = 0; index < unscored.length; index += BATCH) {
    const batch = unscored.slice(index, index + BATCH);
    const list = batch
      .map((c) => `${c.taxonName} (${c.commonNames[0]})`)
      .join("\n");

    const reply = await ask(`${RUBRIC}\n\nANIMALS:\n${list}`, 2048);

    const scores = new Map<string, number>();
    for (const line of reply.split("\n")) {
      const [name, value] = line.split("\t");
      const score = Number((value ?? "").trim());
      if (name && Number.isFinite(score)) scores.set(name.trim(), score);
    }

    // A candidate the model skipped keeps `score` undefined and is simply
    // retried on the next run, rather than being silently scored zero and
    // buried at the bottom of the queue forever.
    for (const candidate of batch) {
      const score = scores.get(candidate.taxonName);
      if (score !== undefined) candidate.score = score;
    }

    console.log(
      `  ${index + batch.length}/${unscored.length} — matched ${scores.size}/${batch.length}`
    );

    // Written after every batch: scoring the whole pool is a long run, and
    // losing it to one failure is the mistake the Commons client already made.
    pool.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    writeFileSync(
      root("data/candidates.json"),
      JSON.stringify(pool, null, 2) + "\n"
    );
  }

  const top = pool
    .slice(0, 8)
    .map((c) => `${c.commonNames[0]} ${c.score}`)
    .join(", ");
  console.log(`\nTop scored: ${top}`);
}

main();

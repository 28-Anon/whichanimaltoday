import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ask } from "./pipeline/claudeClient";
import { buildDraftPrompt, parseDraftResponse } from "./pipeline/draftPrompt";
import { leaksAnswer } from "./pipeline/gates";
import { validateAnimalData, type AnimalRecord } from "../src/animalData";
import { USER_AGENT } from "./pipeline/wikidataClient";

const root = (path: string) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));

async function wikipediaSummary(articleUrl: string): Promise<string> {
  const title = articleUrl.split("/wiki/").pop() as string;
  const response = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`,
    { headers: { "User-Agent": USER_AGENT } }
  );
  if (!response.ok) throw new Error(`summary ${response.status}`);

  const json = (await response.json()) as { extract?: string };
  if (!json.extract) throw new Error("summary had no extract");
  return json.extract;
}

async function main(): Promise<void> {
  const countFlag = process.argv.indexOf("--count");
  const count = countFlag === -1 ? 25 : Number(process.argv[countFlag + 1]);

  const pool = JSON.parse(readFileSync(root("data/candidates.json"), "utf8"));
  const pendingPath = root("data/pending.json");
  const pending = existsSync(pendingPath)
    ? JSON.parse(readFileSync(pendingPath, "utf8"))
    : [];

  const alreadyDrafted = new Set(pending.map((r: { qid: string }) => r.qid));

  const queue = pool
    .filter(
      (c: { score?: number; qid: string }) =>
        c.score !== undefined && !alreadyDrafted.has(c.qid)
    )
    .slice(0, count);

  if (queue.length === 0) {
    console.log("Nothing to draft. Run content:score first.");
    return;
  }

  console.log(`Drafting ${queue.length}…\n`);

  for (const candidate of queue) {
    try {
      const summary = await wikipediaSummary(candidate.articleUrl);
      const drafted = parseDraftResponse(
        await ask(buildDraftPrompt(candidate, summary), 1500)
      );

      const names = [...candidate.commonNames, candidate.taxonName];
      const leaked = (["hint1", "hint2", "hint3"] as const).find((key) =>
        leaksAnswer(drafted[key], names)
      );
      if (leaked) {
        console.warn(
          `  SKIP ${candidate.commonNames[0]} — ${leaked} names the answer`
        );
        continue;
      }

      const family = candidate.suggestedFamily ?? candidate.commonNames[0];

      const record: AnimalRecord & Record<string, unknown> = {
        commonName: family,
        aliases: [
          ...new Set([...candidate.commonNames, candidate.taxonName]),
        ].filter((name) => name.toLowerCase() !== family.toLowerCase()),
        hint1: drafted.hint1,
        hint2: drafted.hint2,
        hint3: drafted.hint3,
        funFacts: drafted.funFacts,
        category: candidate.category,
        // Review-only. Task 8 replaces this with the mirrored CDN URL on
        // acceptance; nothing carrying a description URL reaches animals.json.
        imageUrl: candidate.image.descriptionUrl,
        imageAttribution: `Photo: ${candidate.image.author}, ${candidate.image.licence}, Wikimedia Commons`,
        bonus: drafted.bonus,
        ...(candidate.suggestedFamily
          ? { species: candidate.commonNames[0] }
          : {}),
        qid: candidate.qid,
        sourceUrl: candidate.articleUrl,
        image: candidate.image,
      };

      // The same validator that gates production data, run before a human
      // ever sees the record.
      const errors = validateAnimalData([record as AnimalRecord]);
      if (errors.length > 0) {
        console.warn(`  SKIP ${family} — ${errors[0]}`);
        continue;
      }

      pending.push(record);
      console.log(`  ok   ${family}`);
    } catch (error) {
      console.warn(
        `  FAIL ${candidate.commonNames[0]} — ${(error as Error).message}`
      );
    }

    // Written after every candidate. Each one costs an API call, so losing a
    // run to a single failure costs real money as well as time.
    writeFileSync(pendingPath, JSON.stringify(pending, null, 2) + "\n");
  }

  console.log(`\n${pending.length} records pending review.`);
  console.log("Read them before scaling up — this is where quality is set.");
}

main();

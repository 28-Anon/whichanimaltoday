import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Looks at every animal's photograph and asks whether it actually shows that
 * animal.
 *
 * No metadata check can do this. Wikidata's P18 asserts "this is the image
 * for this species" and Commons filenames repeat the species name, but a file
 * called "Narwhal - KB (48754862101).jpg" turned out to be people in a park,
 * and it shipped as a live puzzle. The only things that catch a wrong subject
 * are a human looking at it or a model looking at it.
 *
 * Read-only: it reports and never edits data/animals.json. Replacing an image
 * is a judgement call about what the alternative should be.
 */
const MODEL = "claude-sonnet-5";

const root = (path: string) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));

interface Animal {
  commonName: string;
  species?: string;
  aliases: string[];
  imageUrl: string;
}

interface Verdict {
  ok: boolean;
  note: string;
}

async function judge(client: Anthropic, animal: Animal): Promise<Verdict> {
  const names = [animal.commonName, animal.species, ...animal.aliases]
    .filter(Boolean)
    .join(", ");

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "url", url: animal.imageUrl },
          },
          {
            type: "text",
            text: `This image is used as the puzzle photograph for: ${names}.

Answer in this exact form and nothing else:
VERDICT: PASS or FAIL
NOTE: one short sentence

FAIL if any of these are true:
- it is a drawing, cartoon, diagram, painting or 3D render rather than a photograph
- it does not clearly show the animal named above
- the animal is a museum mount, skeleton, skull or preserved specimen
- it is mostly people, a sign, a logo, a map or a sculpture
- the animal is so small, distant or obscured that it could not be guessed

PASS only if a player could look at this and reasonably identify the animal.`,
          },
        ],
      },
    ],
  });

  const text = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");

  const ok = /VERDICT:\s*PASS/i.test(text);
  const note = (text.match(/NOTE:\s*(.+)/i)?.[1] ?? text).trim();
  return { ok, note };
}

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Export it before running this audit."
    );
  }

  const all = JSON.parse(
    readFileSync(root("data/animals.json"), "utf8")
  ) as Animal[];

  // `npm run content:audit -- 3` checks the first three only. The full run
  // costs real money, so there should be a way to prove the script works
  // before paying for all of it.
  const limit = Number(process.argv[2]);
  const animals =
    Number.isInteger(limit) && limit > 0 ? all.slice(0, limit) : all;

  const client = new Anthropic({ apiKey });
  const failures: { animal: Animal; note: string }[] = [];

  console.log(`Auditing ${animals.length} images…\n`);

  for (const [index, animal] of animals.entries()) {
    try {
      const verdict = await judge(client, animal);
      if (verdict.ok) {
        console.log(`  ok   ${animal.commonName}`);
      } else {
        console.log(`  FAIL ${animal.commonName} — ${verdict.note}`);
        failures.push({ animal, note: verdict.note });
      }
    } catch (error) {
      // A single unreadable image must not end an audit of 58.
      console.warn(
        `  ERR  ${animal.commonName} — ${(error as Error).message.slice(0, 80)}`
      );
    }

    if ((index + 1) % 10 === 0) {
      console.log(`  … ${index + 1}/${animals.length}`);
    }
  }

  console.log(`\n${failures.length} of ${animals.length} flagged:\n`);
  for (const { animal, note } of failures) {
    console.log(`  ${animal.commonName}`);
    console.log(`    ${note}`);
    console.log(`    ${animal.imageUrl}\n`);
  }

  if (failures.length === 0) {
    console.log("  Every image shows its animal.");
  }
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exitCode = 1;
});

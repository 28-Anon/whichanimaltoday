import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { USER_AGENT } from "./pipeline/wikidataClient";

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

/**
 * Images knowingly kept despite failing the rule, keyed by URL.
 *
 * Keyed by URL rather than by animal so the exception cannot outlive the image
 * it was granted for: swap the picture and the exception stops applying, and
 * the new one is judged on its own merits.
 *
 * Keep this list short. It is a record of deliberate decisions, not a way to
 * silence the audit — an animal belongs here only when no image satisfying the
 * rule exists at all.
 */
const ACCEPTED_EXCEPTIONS: Record<string, string> = {
  "https://commons.wikimedia.org/wiki/Special:FilePath/Two_Psychrolutes_marcidus.jpg?width=1200":
    "Owner's call, 2026-08-03. An illustration, but anatomically honest and " +
    "guessable — verified by playing it. Real blobfish photographs are all " +
    "trawled specimens on a deck, which look worse and are no more " +
    "identifiable.",
};

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

type MediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/** The four formats the API accepts, identified by their magic bytes. */
function sniffMediaType(bytes: Buffer): MediaType | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (bytes.subarray(0, 3).toString("latin1") === "GIF") return "image/gif";
  if (
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Fetches the bytes rather than handing the API a URL.
 *
 * Wikimedia returns 403 to any request without a descriptive User-Agent, and
 * the API's own image fetcher does not send one it accepts — so passing a
 * Commons URL straight through fails for every animal except the handful
 * hosted on Framer. Fetching here also follows the Special:FilePath redirect,
 * which is how most of the list is addressed.
 */
async function fetchImage(
  url: string
): Promise<{ data: string; mediaType: MediaType }> {
  // Wikimedia rate-limits a sequential sweep of this list — measured at 40 of
  // 58 before it started returning 429. Retry on 429 and 5xx with widening
  // gaps, the same shape as commonsClient.
  let response: Response | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
    }
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
    });
    if (response.status !== 429 && response.status < 500) break;
  }

  if (!response || !response.ok) {
    throw new Error(`HTTP ${response?.status ?? "no response"} fetching the image`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  // Sniff the bytes rather than trust the header. images/siola-38.jpg is
  // served as image/jpeg by its CDN and is a PNG — the mirror step saved
  // every file with a .jpg extension regardless of what it downloaded. The
  // API validates the declared media type against the actual image and
  // rejects the mismatch, so the header cannot be taken at face value.
  const mediaType = sniffMediaType(bytes);
  if (!mediaType) {
    const header = (response.headers.get("content-type") ?? "unknown")
      .split(";")[0]
      .trim();
    throw new Error(`not a supported image (served as "${header}")`);
  }
  // The API rejects images over 5MB base64-encoded, which is ~3.75MB raw.
  if (bytes.byteLength > 3_500_000) {
    throw new Error(
      `image is ${(bytes.byteLength / 1e6).toFixed(1)}MB, too large to send`
    );
  }

  return { data: bytes.toString("base64"), mediaType };
}

async function judge(client: Anthropic, animal: Animal): Promise<Verdict> {
  const names = [animal.commonName, animal.species, ...animal.aliases]
    .filter(Boolean)
    .join(", ");

  const image = await fetchImage(animal.imageUrl);

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: image.mediaType,
              data: image.data,
            },
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
- any man-made object is visible: a bin, sign, fence, railing, building, vehicle, cage, tank, hand, tool, watermark or caption text
- another animal or a person shares the frame
- the animal is so small, distant or obscured that it could not be guessed
- the feature the animal is named for is not visible

Natural surroundings are fine and expected: grass, branches, leaves, rocks,
water, sand, snow. Only man-made objects and other creatures are grounds to
fail.

PASS only if this is a photograph of the real animal, alone, in natural
surroundings, that a player could look at and reasonably identify.`,
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
  const errors: { animal: Animal; note: string }[] = [];
  const accepted: { animal: Animal; note: string }[] = [];

  console.log(`Auditing ${animals.length} images…\n`);

  for (const [index, animal] of animals.entries()) {
    try {
      const verdict = await judge(client, animal);
      const exception = ACCEPTED_EXCEPTIONS[animal.imageUrl];

      if (verdict.ok) {
        console.log(`  ok   ${animal.commonName}`);
      } else if (exception) {
        // Still judged, still reported — just not counted against the run.
        // An accepted exception is a decision on the record, not a blind spot.
        console.log(`  kept ${animal.commonName} — ${verdict.note}`);
        accepted.push({ animal, note: verdict.note });
      } else {
        console.log(`  FAIL ${animal.commonName} — ${verdict.note}`);
        failures.push({ animal, note: verdict.note });
      }
    } catch (error) {
      // A single unreadable image must not end an audit of 58 — but it must
      // not be mistaken for a pass either. An image that could not be checked
      // is an unknown, and unknowns are reported separately at the end.
      const note = (error as Error).message.replace(/\s+/g, " ").slice(0, 200);
      console.warn(`  ERR  ${animal.commonName} — ${note}`);
      errors.push({ animal, note });
    }

    if ((index + 1) % 10 === 0) {
      console.log(`  … ${index + 1}/${animals.length}`);
    }
  }

  const checked = animals.length - errors.length;
  console.log(
    `\n${failures.length} flagged, ${accepted.length} kept as accepted ` +
      `exceptions, ${checked} of ${animals.length} checked.\n`
  );

  for (const { animal, note } of failures) {
    console.log(`  ${animal.commonName}`);
    console.log(`    ${note}`);
    console.log(`    ${animal.imageUrl}\n`);
  }

  if (failures.length === 0 && errors.length === 0) {
    console.log("  Every image shows its animal.\n");
  }

  if (accepted.length > 0) {
    console.log(`${accepted.length} kept deliberately:\n`);
    for (const { animal, note } of accepted) {
      console.log(`  ${animal.commonName}`);
      console.log(`    audit says:    ${note}`);
      console.log(`    kept because:  ${ACCEPTED_EXCEPTIONS[animal.imageUrl]}\n`);
    }
  }

  if (errors.length > 0) {
    console.log(`${errors.length} could not be checked — still unknown:\n`);
    for (const { animal, note } of errors) {
      console.log(`  ${animal.commonName}`);
      console.log(`    ${note}`);
      console.log(`    ${animal.imageUrl}\n`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exitCode = 1;
});

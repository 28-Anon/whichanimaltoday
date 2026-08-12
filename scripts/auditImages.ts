import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { judgeForPuzzle } from "./pipeline/imageJudge";

/**
 * Looks at every animal's photograph and asks two questions about it.
 *
 * **Does it show the animal?** No metadata check can answer this. Wikidata's
 * P18 asserts "this is the image for this species" and Commons filenames repeat
 * the species name, but a file called "Narwhal - KB (48754862101).jpg" turned
 * out to be people in a park, and it shipped as a live puzzle. The only things
 * that catch a wrong subject are a human looking at it or a model looking at it.
 *
 * **Can it be recognised at the size a player sees it?** Added 2026-08-05,
 * after `images/narwhal-5.jpg` passed the first question and shipped anyway: a
 * genuine aerial photograph of genuine narwhals, no man-made objects, a tusk
 * plainly visible — at 5000 pixels wide. In the game's 330px card it was blue
 * water with smudges in it. The first pass had been judging a picture no player
 * would ever see, so the second one judges the scaled copy, with the animal's
 * name withheld. See `pipeline/legibility.ts`.
 *
 * Both passes are paid API calls, so a clean run now costs roughly twice what
 * it did. Legibility is skipped when the content pass already failed.
 *
 * Read-only: it reports and never edits data/animals.json. Replacing an image
 * is a judgement call about what the alternative should be.
 */
const MODEL = "claude-sonnet-5";

/**
 * The filename an image URL ends in — `narwhal-6.jpg` — which is what the two
 * lists below are keyed by.
 *
 * **Keyed by filename rather than full URL since 2026-08-12, and the reason is
 * a bug this caused.** The lists used to hold whole URLs, and when every image
 * moved to `images/display/` for the byte reduction that same day, all five keys
 * silently stopped matching. Nothing failed: the next paid audit run would
 * simply have re-flagged blobfish, the dodo, the chinchilla and the Chinese
 * giant salamander, and the owner would have paid to re-litigate four decisions
 * already made — with no clue that a URL change was the cause.
 *
 * The filename keeps the property the URL keying was chosen for. A replacement
 * photograph always gets a new filename on this project, precisely because
 * overwriting one is what breaks the jsDelivr cache, so an exception still dies
 * with the picture it was granted for. What it no longer dies with is a change
 * to where that picture is hosted, which was never the point.
 */
function imageKey(imageUrl: string): string {
  return imageUrl.split("/").pop() ?? imageUrl;
}

/**
 * Images knowingly kept despite failing the rule, keyed by filename.
 *
 * Keyed by the file rather than by the animal so the exception cannot outlive
 * the image it was granted for: swap the picture and the exception stops
 * applying, and the new one is judged on its own merits.
 *
 * Keep this list short. It is a record of deliberate decisions, not a way to
 * silence the audit — an animal belongs here only when no image satisfying the
 * rule exists at all.
 *
 * Blobfish's key was rehosted on 2026-08-03 when the remaining Commons
 * hotlinks were mirrored into images/. Carrying an exception across a URL
 * change is normally exactly what the keying is meant to stop; it is correct
 * here only because the mirrored file was downloaded from the old URL and is
 * the identical picture. A new photograph still needs a fresh decision.
 */
/**
 * Verdicts a human looked at and overruled, keyed by filename.
 *
 * Deliberately separate from ACCEPTED_EXCEPTIONS, because the two say opposite
 * things. An exception says "this image breaks the rule and we are keeping it
 * anyway, because no compliant image exists". A disputed verdict says "this
 * image does not break the rule and the judge was wrong". Filing the second
 * kind in the first list would quietly turn a record of deliberate compromises
 * into a list of things that failed for unrelated reasons, and the next person
 * reading it could not tell which was which.
 *
 * Same filename keying, for the same reason: replace the photograph and the
 * dispute dies with it, because the new one has not been looked at.
 *
 * This list should stay very short. Two entries would be a coincidence; five
 * would mean the prompt needs work rather than the images.
 */
const DISPUTED_VERDICTS: Record<string, string> = {
  "narwhal-6.jpg":
    "Human review, 2026-08-05. The audit called this \"a right whale or " +
    "similar species, not a narwhal, and no tusk is visible\". It is a " +
    "narwhal and the tusk is unmistakable: examined at 5x zoom it is long, " +
    "spiralled and tapering, with the twist clearly visible near the tip, " +
    "above a mottled grey-white body with the blowhole showing. No right " +
    "whale has any of that. Kept as photographed.",
};

const ACCEPTED_EXCEPTIONS: Record<string, string> = {
  "blobfish-3.jpg":
    "Owner's call, 2026-08-03. An illustration, but anatomically honest and " +
    "guessable — verified by playing it. Real blobfish photographs are all " +
    "trawled specimens on a deck, which look worse and are no more " +
    "identifiable.",

  "dodo-43.jpg":
    "Owner's call, 2026-08-03. A museum case: skeleton, reconstruction model " +
    "and painted backdrop. The dodo has been extinct since the 1600s, so no " +
    "photograph of a living one exists and no image can satisfy the rule. " +
    "The alternative was dropping the animal, which would shift the puzzle " +
    "rotation for every future date.",

  "chinchilla-30.jpg":
    "Owner's call, 2026-08-05. A pet on the arm of a sofa, so the background " +
    "is man-made — but no photograph satisfying the rule exists. Every " +
    "chinchilla on Commons is a pet or a zoo animal: cage bars and a towel, a " +
    "green plastic cage tray, a leather sofa, an enclosure behind reflecting " +
    "glass, or a Flickr watermark. Searches for wild animals return habitat " +
    "landscapes with no chinchilla in them, which is honest — both species are " +
    "critically endangered and effectively unphotographed in the wild. This " +
    "one at least shows the whole animal in profile, so the ears, the body " +
    "shape and the bushy tail are all legible at display size. It replaced a " +
    "307px thumbnail of a chinchilla sitting on a person's denim-covered knee.",

  "shark-95.jpg":
    "Owner's call, 2026-08-12. A captive great white, and its filename says so " +
    "— but nothing man-made is visible in the frame, and it is instantly " +
    "readable as a great white at display size, which the previous photograph " +
    "(a shark cage bar in shot) was not. The search is what settled it: every " +
    "wild candidate was a cage, a buoy and line, a chumming boat, or a fin in " +
    "splash. Great whites are photographed from cages and boats, so the " +
    "wild-only standard has effectively no candidates here.",

  "axolotl-7.jpg":
    "Owner's call, 2026-08-12. A tank, but no compliant photograph exists. " +
    "The 2026-08-12 search returned only tanks, human hands, a plastic bin, " +
    "and people in boats on the canals; the best alternative was in an " +
    "aquarium *and* had a fish sharing the frame, so it was worse on two " +
    "counts. Wild axolotls number a few hundred in Xochimilco and are " +
    "effectively unphotographed — the same situation as the Chinese giant " +
    "salamander below. This one shows the whole animal with its external " +
    "gills clearly visible, which is the feature it is known for.",

  "chinese-giant-salamander-58.jpg":
    "Owner's call, 2026-08-03. A tank, but the best image that exists. The " +
    "species is critically endangered and effectively unphotographed in the " +
    "wild; every alternative on Commons is worse — a museum specimen beside " +
    "its caption card, two animals in a blue plastic farm crate, or an " +
    "aquarium with carp swimming through the shot. This one at least fills " +
    "the frame with the animal.",
};

const root = (path: string) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));

interface Animal {
  commonName: string;
  species?: string;
  aliases: string[];
  imageUrl: string;
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
  const disputed: { animal: Animal; note: string }[] = [];

  console.log(`Auditing ${animals.length} images…\n`);

  for (const [index, animal] of animals.entries()) {
    try {
      const names = [animal.commonName, animal.species, ...animal.aliases].filter(
        (name): name is string => Boolean(name)
      );
      const verdict = await judgeForPuzzle(client, animal.imageUrl, names);
      const exception = ACCEPTED_EXCEPTIONS[imageKey(animal.imageUrl)];
      const dispute = DISPUTED_VERDICTS[imageKey(animal.imageUrl)];

      if (verdict.ok) {
        console.log(`  ok   ${animal.commonName}`);
      } else if (dispute) {
        // Overruled by a human who looked at the file. Reported every run
        // rather than silenced, so the disagreement stays visible and someone
        // can revisit it — but not counted, because the image is fine.
        console.log(`  DISPUTED ${animal.commonName} — ${verdict.note}`);
        disputed.push({ animal, note: verdict.note });
      } else if (exception) {
        // Still judged, still reported — just not counted against the run.
        // An accepted exception is a decision on the record, not a blind spot.
        console.log(`  kept ${animal.commonName} — ${verdict.note}`);
        accepted.push({ animal, note: verdict.note });
      } else {
        // Which pass rejected it decides what to do about it. A content failure
        // needs a different photograph; a legibility failure often needs the
        // same subject shot closer, and is the one a human reviewing the file
        // at full resolution will disagree with — so say which it was.
        const stage = verdict.legibility && !verdict.legibility.ok
          ? "TOO SMALL"
          : "FAIL";
        console.log(`  ${stage} ${animal.commonName} — ${verdict.note}`);
        failures.push({ animal, note: `[${stage}] ${verdict.note}` });
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
      `exceptions, ${disputed.length} disputed, ${checked} of ` +
      `${animals.length} checked.\n`
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
      console.log(`    kept because:  ${ACCEPTED_EXCEPTIONS[imageKey(animal.imageUrl)]}\n`);
    }
  }

  if (disputed.length > 0) {
    console.log(`${disputed.length} where a human overruled the audit:\n`);
    for (const { animal, note } of disputed) {
      console.log(`  ${animal.commonName}`);
      console.log(`    audit says:    ${note}`);
      console.log(`    overruled:     ${DISPUTED_VERDICTS[imageKey(animal.imageUrl)]}\n`);
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

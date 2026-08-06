import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { USER_AGENT } from "./wikidataClient";
import {
  buildLegibilityPrompt,
  parseLegibilityReply,
  scoreLegibility,
} from "./legibility";

/**
 * Looking at a picture and deciding whether it is usable as a puzzle.
 *
 * Extracted so the audit and the replacement search apply exactly the same
 * standard. Two copies of this prompt would drift, and a suggested
 * replacement judged more leniently than the audit would be rejected the
 * moment it landed.
 */
export const JUDGE_MODEL = "claude-sonnet-5";

/**
 * Room for the reply. Both passes ask for two or three short lines, so this is
 * generous on purpose.
 *
 * It was 200, and the first full run showed why that was too tight: the
 * helmeted hornbill's reason was cut off mid-word — "not visible on this b" —
 * and two other images came back with no NOTE line at all, reported as
 * "(no reason given)". A truncated verdict is worse than an expensive one: it
 * costs a second paid run to find out what the model actually objected to.
 */
export const MAX_REPLY_TOKENS = 400;

/**
 * The box the game renders a photograph into.
 *
 * `styles.photo` in `framer/GameComponent.tsx` sets `width: "100%"`,
 * `aspectRatio: "4 / 3"` and `objectFit: "contain"`, inside a card that is
 * roughly 330px wide on a phone — which is where most of the traffic is. These
 * two numbers are the entire point of the legibility pass, so if that card ever
 * changes width, change them here.
 */
export const DISPLAY_WIDTH = 330;
export const DISPLAY_HEIGHT = 248; // 330 at 4:3, rounded

/**
 * Redraws an image the way the player's browser will.
 *
 * `fit: "contain"` mirrors the CSS `object-fit`, so a portrait photograph is
 * letterboxed here exactly as it is on the page rather than being cropped to
 * fill — cropping would quietly make the subject larger than the player ever
 * sees it, which is the error this whole pass exists to remove.
 */
export async function toDisplaySize(bytes: Buffer): Promise<string> {
  const resized = await sharp(bytes)
    .resize(DISPLAY_WIDTH, DISPLAY_HEIGHT, {
      fit: "contain",
      background: { r: 242, g: 236, b: 228 },
    })
    .jpeg({ quality: 82 })
    .toBuffer();

  return resized.toString("base64");
}

export interface Verdict {
  ok: boolean;
  note: string;
}

type MediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/** The four formats the API accepts, identified by their magic bytes. */
export function sniffMediaType(bytes: Buffer): MediaType | null {
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
 * Retries a call that failed for a reason unrelated to its arguments.
 *
 * 529 "Overloaded", 429 and 5xx are all transient. A 400 is not — retrying a
 * malformed request just spends money to fail again — so only status codes
 * that could succeed unchanged are retried.
 */
export async function withRetry<T>(call: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
    }
    try {
      return await call();
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status !== 429 && status !== 529 && !(status && status >= 500)) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError;
}

/**
 * Fetches the bytes rather than handing the API a URL.
 *
 * Wikimedia returns 403 to any request without a descriptive User-Agent, and
 * the API's own image fetcher does not send one it accepts — so passing a
 * Commons URL straight through fails for every animal except the handful
 * hosted elsewhere. Fetching here also follows the Special:FilePath redirect,
 * which is how most of the list is addressed.
 */
export async function fetchImage(
  url: string
): Promise<{ data: string; mediaType: MediaType; bytes: Buffer }> {
  // Wikimedia rate-limits a sequential sweep of this list — measured at 40 of
  // 58 before it started returning 429. Retry with widening gaps.
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
    throw new Error(
      `HTTP ${response?.status ?? "no response"} fetching the image`
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  // Sniff the bytes rather than trust the header. images/siola-38.jpg is
  // served as image/jpeg and is a PNG — the mirror step saved every file with
  // a .jpg extension regardless of what it downloaded. The API validates the
  // declared media type against the actual image and rejects a mismatch.
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

  // The raw buffer comes back too, so the legibility pass can rescale the same
  // download rather than fetching the file a second time. Wikimedia rate-limits
  // a sweep of this list, and doubling the requests is how a full audit starts
  // returning 429s halfway through.
  return { data: bytes.toString("base64"), mediaType, bytes };
}

/**
 * The rule, in one place.
 *
 * "No man-made object" is deliberately absolute, because the alternative is
 * a judgement about how much clutter is acceptable, and that is not something
 * a model applies consistently across 58 images.
 */
export function buildPrompt(names: string): string {
  return `This image is used as the puzzle photograph for: ${names}.

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
surroundings, that a player could look at and reasonably identify.`;
}

export async function judgeImage(
  client: Anthropic,
  imageUrl: string,
  names: string
): Promise<Verdict> {
  return judgeImageBytes(client, await fetchImage(imageUrl), names);
}

/** The content judgement, against an image that has already been fetched. */
export async function judgeImageBytes(
  client: Anthropic,
  image: { data: string; mediaType: MediaType },
  names: string
): Promise<Verdict> {
  const message = await withRetry(() =>
    client.messages.create({
      model: JUDGE_MODEL,
      max_tokens: MAX_REPLY_TOKENS,
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
            { type: "text", text: buildPrompt(names) },
          ],
        },
      ],
    })
  );

  const text = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");

  const ok = /VERDICT:\s*PASS/i.test(text);

  // Fall back to the whole reply, then to a placeholder. A run printed a bare
  // "FAIL Helmeted Hornbill —" with no reason, because the model answered
  // without a NOTE line. A failure with no stated reason is not actionable.
  const note =
    (text.match(/NOTE:\s*(\S.*)/i)?.[1] ?? text.replace(/VERDICT:\s*\w+/i, ""))
      .trim() || "(no reason given)";

  return { ok, note };
}

/**
 * Asks what the animal is, from a copy scaled to the game's display box.
 *
 * The names are deliberately not passed to the model — see `legibility.ts`.
 * They are used here only to grade the answer it gives back.
 */
export async function judgeLegibility(
  client: Anthropic,
  bytes: Buffer,
  names: string[]
): Promise<Verdict> {
  const data = await toDisplaySize(bytes);

  const message = await withRetry(() =>
    client.messages.create({
      model: JUDGE_MODEL,
      max_tokens: MAX_REPLY_TOKENS,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data },
            },
            {
              type: "text",
              text: buildLegibilityPrompt(DISPLAY_WIDTH, DISPLAY_HEIGHT),
            },
          ],
        },
      ],
    })
  );

  const text = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");

  return scoreLegibility(parseLegibilityReply(text), names);
}

export interface PuzzleVerdict extends Verdict {
  content: Verdict;
  /** Null when the content pass failed, so legibility was never asked. */
  legibility: Verdict | null;
}

/**
 * Both passes, on one download: is it the right animal, and can it be
 * recognised at the size a player sees it.
 *
 * The legibility pass is skipped when the content pass fails, because an image
 * that is already being replaced does not need a second opinion — and each pass
 * is a paid API call. That makes a clean run cost twice what it used to and a
 * failing one cost the same as before.
 */
export async function judgeForPuzzle(
  client: Anthropic,
  imageUrl: string,
  names: string[]
): Promise<PuzzleVerdict> {
  const image = await fetchImage(imageUrl);
  const content = await judgeImageBytes(client, image, names.join(", "));

  if (!content.ok) {
    return { ok: false, note: content.note, content, legibility: null };
  }

  const legibility = await judgeLegibility(client, image.bytes, names);

  return {
    ok: legibility.ok,
    note: legibility.ok ? content.note : legibility.note,
    content,
    legibility,
  };
}

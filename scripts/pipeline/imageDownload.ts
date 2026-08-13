import { USER_AGENT } from "./wikidataClient";

/**
 * Fetching a whole photograph, with the checks that stop a non-photograph from
 * being written to disk as one.
 *
 * Shared by scripts/mirrorCommonsImages.ts (animal photos still hotlinked from
 * Commons) and scripts/mirrorArchiveImages.ts (photographs a past puzzle showed
 * that no animal record points at any more). Both do the same delicate thing —
 * pull an image from a host that never promised to serve it, and prove it is an
 * image before trusting it — so the rules live in one place.
 */

/**
 * Rejects anything that is not actually a photograph.
 *
 * Special:FilePath redirects, and a failed redirect hands back an HTML error
 * page with HTTP 200. Written to disk as .jpg it would sail through every
 * later check and only surface as a broken image for players.
 */
export function assertJpeg(
  buffer: Buffer,
  contentType: string,
  label: string
): void {
  if (!contentType.startsWith("image/")) {
    throw new Error(`${label}: content-type was "${contentType}", not an image`);
  }
  if (buffer.length < 10_000) {
    throw new Error(`${label}: only ${buffer.length} bytes — too small to be a photo`);
  }
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    throw new Error(`${label}: does not begin with JPEG magic bytes`);
  }
}

export async function download(url: string, label: string): Promise<Buffer> {
  // Same backoff as scripts/acceptCandidates.ts: whole images hit Commons far
  // harder than metadata, and the first real run there was rate-limited after
  // 12 files.
  let response: Response | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    } catch {
      response = null;
    }
    if (response?.ok) break;
    if (response && response.status !== 429 && response.status < 500) break;
    await new Promise((resolve) => setTimeout(resolve, 3000 * 2 ** attempt));
  }

  if (!response?.ok) {
    throw new Error(`${label}: HTTP ${response?.status ?? "network error"}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  assertJpeg(buffer, response.headers.get("content-type") ?? "", label);
  return buffer;
}

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { USER_AGENT } from "./wikidataClient";
import { stripHtml } from "./attribution";

const API = "https://commons.wikimedia.org/w/api.php";
const CACHE_DIR = ".cache/pipeline/commons";

export interface ImageMeta {
  file: string;
  author: string;
  licence: string;
  licenceUrl: string;
  descriptionUrl: string;
  width: number;
  height: number;
}

async function request(
  titles: string[],
  attempt = 0
): Promise<Record<string, unknown>> {
  const url = new URL(API);
  const params = {
    format: "json",
    formatversion: "2",
    action: "query",
    prop: "imageinfo",
    iiprop: "extmetadata|size|url",
    titles: titles.join("|"),
  };
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  } catch (error) {
    // A dropped socket must not cost the whole run. Over a hundred sequential
    // requests, one transient network failure is close to certain — the first
    // real run died at UND_ERR_SOCKET after ~2,700 files of work.
    if (attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
      return request(titles, attempt + 1);
    }
    throw error;
  }

  // Measured in the spike: 429 with only 120ms between requests. Backoff is
  // a requirement here, not a defensive nicety.
  if ((response.status === 429 || response.status >= 500) && attempt < 5) {
    await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
    return request(titles, attempt + 1);
  }
  if (!response.ok) throw new Error(`Commons ${response.status}`);

  return response.json() as Promise<Record<string, unknown>>;
}

function cachePath(titles: string[]): string {
  const key = createHash("sha256")
    .update(titles.join("|"))
    .digest("hex")
    .slice(0, 32);
  return `${CACHE_DIR}/${key}.json`;
}

/**
 * Fetches photographer, licence and dimensions for a batch of Commons files.
 *
 * Batched 25 titles per request, which is polite and well inside the API's
 * limits. A file that is missing, or has no imageinfo, is simply absent from
 * the returned map — the caller decides what that means.
 */
export async function fetchImageMeta(
  files: string[]
): Promise<Map<string, ImageMeta>> {
  const out = new Map<string, ImageMeta>();

  for (let index = 0; index < files.length; index += 25) {
    const batch = files.slice(index, index + 25);
    const path = cachePath(batch);

    // Cached per batch, so a run that dies partway resumes instead of
    // repeating every request. At ~110 batches that is the difference
    // between a cheap retry and starting over.
    let json: { query?: { pages?: unknown[] } };
    if (existsSync(path)) {
      json = JSON.parse(readFileSync(path, "utf8"));
    } else {
      json = (await request(batch)) as { query?: { pages?: unknown[] } };
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(path, JSON.stringify(json));
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    for (const page of json.query?.pages ?? []) {
      const entry = page as {
        title: string;
        missing?: boolean;
        imageinfo?: Array<{
          width: number;
          height: number;
          descriptionurl: string;
          extmetadata?: Record<string, { value?: string }>;
        }>;
      };

      if (entry.missing || !entry.imageinfo?.[0]) continue;

      const info = entry.imageinfo[0];
      const meta = info.extmetadata ?? {};

      out.set(entry.title, {
        file: entry.title,
        author: stripHtml(meta.Artist?.value ?? ""),
        licence: stripHtml(meta.LicenseShortName?.value ?? ""),
        licenceUrl: stripHtml(meta.LicenseUrl?.value ?? ""),
        descriptionUrl: info.descriptionurl,
        width: info.width,
        height: info.height,
      });
    }
  }

  return out;
}

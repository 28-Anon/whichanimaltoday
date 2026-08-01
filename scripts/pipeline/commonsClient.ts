import { USER_AGENT } from "./wikidataClient";

const API = "https://commons.wikimedia.org/w/api.php";

export interface ImageMeta {
  file: string;
  author: string;
  licence: string;
  licenceUrl: string;
  descriptionUrl: string;
  width: number;
  height: number;
}

/** extmetadata values arrive as HTML fragments — the Artist field especially. */
function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
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

  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });

  // Measured in the spike: 429 with only 120ms between requests. Backoff is
  // a requirement here, not a defensive nicety.
  if (response.status === 429 && attempt < 5) {
    await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
    return request(titles, attempt + 1);
  }
  if (!response.ok) throw new Error(`Commons ${response.status}`);

  return response.json() as Promise<Record<string, unknown>>;
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
    const json = (await request(files.slice(index, index + 25))) as {
      query?: { pages?: unknown[] };
    };

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

    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  return out;
}

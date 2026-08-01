import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const ENDPOINT = "https://query.wikidata.org/sparql";
const CACHE_DIR = ".cache/pipeline/wdqs";

/**
 * Wikimedia require a descriptive User-Agent identifying the project with a
 * contact address. Requests without one are rejected.
 */
export const USER_AGENT =
  "WhichAnimalToday/1.0 (https://whichanimaltoday.com; salahmissana@icloud.com)";

function cachePath(query: string): string {
  const key = createHash("sha256").update(query).digest("hex").slice(0, 32);
  return `${CACHE_DIR}/${key}.json`;
}

/**
 * Runs a SPARQL query, caching the result to disk.
 *
 * Measured during the 2026-07-31 spike: Wikimedia returned HTTP 429 with only
 * 120ms between requests, and the larger taxonomic classes (birds, reptiles,
 * insects) time out server-side on the transitive-closure query. Caching means
 * iterating on later pipeline stages never re-queries.
 */
export async function sparql(query: string): Promise<unknown[]> {
  const path = cachePath(query);
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf8"));
  }

  let lastError = "";

  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/sparql-results+json",
      },
      body: new URLSearchParams({ query }),
    });

    if (response.ok) {
      const json = (await response.json()) as {
        results: { bindings: unknown[] };
      };
      const rows = json.results.bindings;
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(path, JSON.stringify(rows));
      return rows;
    }

    lastError = `${response.status} ${response.statusText}`;

    // 504 means the query itself was too expensive server-side. Retrying it
    // unchanged will time out again, so surface it immediately rather than
    // burning four attempts and two minutes on a certainty.
    if (response.status === 504) break;

    await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
  }

  throw new Error(`WDQS failed: ${lastError}`);
}

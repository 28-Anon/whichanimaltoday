import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Candidate } from "./candidateFilter";
import { buildObservationsUrl, toCandidates } from "./inaturalistQuery";
import { USER_AGENT } from "./wikidataClient";

/**
 * The network half of the iNaturalist source. Everything worth testing lives in
 * `inaturalistQuery.ts`, matching `commonsClient.ts` and `wikidataClient.ts`,
 * which are untested for the same reason.
 *
 * Responses are cached on disk because a sourcing run looks at the same animal
 * repeatedly while a human decides, and iNaturalist asks for no more than one
 * request per second sustained. The cache also makes a re-run of
 * `content:suggest --dry-run` free, which is the pass that costs nothing and is
 * worth repeating.
 */
const CACHE = fileURLToPath(new URL("../../.cache/inat", import.meta.url));

export async function fetchInaturalistCandidates(
  taxonName: string
): Promise<Candidate[]> {
  mkdirSync(CACHE, { recursive: true });
  const key = createHash("sha256").update(taxonName).digest("hex").slice(0, 16);
  const path = `${CACHE}/${key}.json`;

  if (existsSync(path)) {
    return toCandidates(JSON.parse(readFileSync(path, "utf8")));
  }

  const response = await fetch(buildObservationsUrl(taxonName), {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`iNaturalist: HTTP ${response.status} for "${taxonName}"`);
  }

  const payload = await response.json();
  writeFileSync(path, JSON.stringify(payload));
  return toCandidates(payload);
}

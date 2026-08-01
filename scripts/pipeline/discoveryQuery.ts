export interface Candidate {
  qid: string;
  taxonName: string;
  commonNames: string[];
  /** Commons page title, e.g. "File:Condylura cristata.jpg". */
  imageFile: string;
  /** Language Wikipedias covering the species — the fame signal. */
  sitelinks: number;
  category: string;
  articleUrl: string;
}

/**
 * A candidate needs four things or there is no puzzle: a curated
 * representative photograph (P18), an English common name a player could type
 * (P1843), an English Wikipedia article to ground the drafted text, and enough
 * fame that an ordinary person might name it.
 *
 * The fame floor is a FLOOR, not a ranking. Measured during the 2026-07-31
 * spike: unfiltered the mammal pool is 3,130 species, overwhelmingly bats
 * nobody can name; at 40 language Wikipedias it is 592. But *sorting* by fame
 * puts lion, tiger, wolf and leopard on top, which is the opposite of what
 * this game wants — the scoring stage does the ordering.
 */
export function buildDiscoveryQuery(
  classQid: string,
  minSitelinks: number
): string {
  return `
SELECT ?item ?taxonName ?sitelinks (SAMPLE(?image) AS ?img)
       (GROUP_CONCAT(DISTINCT ?common; separator=" | ") AS ?commonNames)
       (SAMPLE(?a) AS ?article)
WHERE {
  ?item wdt:P171* wd:${classQid} ;
        wdt:P105 wd:Q7432 ;
        wdt:P18 ?image ;
        wdt:P225 ?taxonName ;
        wdt:P1843 ?common ;
        wikibase:sitelinks ?sitelinks .
  FILTER(LANG(?common) = "en")
  FILTER(?sitelinks >= ${minSitelinks})
  ?a schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
}
GROUP BY ?item ?taxonName ?sitelinks
ORDER BY DESC(?sitelinks)`;
}

function binding(
  row: Record<string, { value?: string }>,
  key: string
): string | null {
  const value = row?.[key]?.value;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function mapDiscoveryRows(
  rows: unknown[],
  category: string
): Candidate[] {
  const out: Candidate[] = [];

  for (const raw of rows) {
    const row = raw as Record<string, { value?: string }>;
    const item = binding(row, "item");
    const taxonName = binding(row, "taxonName");
    const img = binding(row, "img");
    const names = binding(row, "commonNames");
    const article = binding(row, "article");
    const sitelinks = binding(row, "sitelinks");

    // A row missing a binding is skipped rather than thrown on: one bad row
    // out of hundreds must not cost the whole run.
    if (!item || !taxonName || !img || !names || !article || !sitelinks) {
      continue;
    }

    out.push({
      qid: item.split("/").pop() as string,
      taxonName,
      commonNames: names
        .split(" | ")
        .map((name) => name.trim())
        .filter(Boolean),
      // P18 values are Special:FilePath URLs, percent-encoded and using
      // underscores for spaces. The Commons API wants "File:Real Title".
      imageFile:
        "File:" +
        decodeURIComponent(img.split("/").pop() as string).replace(/_/g, " "),
      sitelinks: Number(sitelinks),
      category,
      articleUrl: article,
    });
  }

  return out;
}

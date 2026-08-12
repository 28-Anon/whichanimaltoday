/**
 * Round-robin several ranked lists into one, preserving each list's own order.
 *
 * Written for `scripts/suggestImages.ts`, which judges only the first
 * `MAX_CANDIDATES` of whatever it is given because each judgement is a paid API
 * call. Concatenating the sources meant the longer one consumed the entire
 * budget: measured 2026-08-12, Commons returned 121 candidates for rhinoceros
 * and 134 for stingray, so all eight judgements went to Commons and
 * **iNaturalist was never judged at all** — the source added specifically to
 * fix phase 2's sourcing problem was, in practice, unreachable.
 *
 * Interleaving rather than reordering by some quality score is deliberate.
 * Neither source offers a ranking worth trusting: Commons by relevance drags in
 * anything mentioning the word, and iNaturalist by votes selects for drama — a
 * herd at a waterhole, an owl with two owlets. Within a source the existing
 * order is the best guess available, and across sources there is no basis for
 * preferring one, so alternating spends the budget evenly and lets the judge
 * decide.
 */
export function interleave<T>(...lists: T[][]): T[] {
  const longest = Math.max(0, ...lists.map((list) => list.length));
  const result: T[] = [];

  for (let index = 0; index < longest; index++) {
    for (const list of lists) {
      if (index < list.length) result.push(list[index]);
    }
  }

  return result;
}

/**
 * Which Commons categories are worth browsing for a species, and which are
 * traps.
 *
 * `findSpeciesCategory` guesses where an animal lives by asking the search hits
 * what categories they share and taking the one most of them agree on. The
 * guess is silent and it shapes everything downstream: the category is browsed
 * before the search results, so a wrong one spends the entire paid judgement
 * budget before a single relevant photograph is looked at.
 *
 * Every rule here was learned from a real run:
 *
 * - **`Category:Wildlife and nature images from Wiki Science Competition 2025`**
 *   won the vote for "White rhinoceros" on 2026-08-12, and browsing it returned
 *   100 files of date-palm sap, fishing nets and a four o'clock flower.
 * - **`Category:Pteropus in flight`** won for Bat, so every candidate the judge
 *   saw was a silhouette against grey sky. Nothing failed — the search simply
 *   answered a narrower question than the one being asked, and it took three
 *   attempts to see why.
 * - **`Category:Curled up animals`** won for Fennec Fox on 2026-08-13. The
 *   rejects were a black cat, a coati and two raccoon dogs; all three survivors
 *   were fennec foxes asleep with their ears folded down, which is the one
 *   feature the animal is known for. Technically the animal, missing the thing
 *   that makes it recognisable — the cow moose again.
 *
 * The shape they share: a category collecting photographs by **theme, posture
 * or event** rather than by species. Those are large, thematically mixed and
 * shared by thousands of unrelated animals, which is exactly what a species
 * category is not.
 *
 * Grown from incidents rather than guessed at in advance, and deliberately so.
 * A speculative list of behaviour words would reject `Category:Flying foxes`,
 * which is a real animal.
 */

/**
 * Licence, maintenance and provenance categories. Every Commons file carries
 * several, and none of them collect a species.
 */
export const NOT_A_SPECIES =
  /^Category:(CC[ -]|GFDL|PD[ -]|Public domain|Files |File:|Media |Self-published|Uploaded |Images |Photographs |Photos |Taken with|Flickr|Creative Commons|Attribution|License|Unidentified|Pages |Wikipedia|Featured|Quality images|Valued images|All media|Items with|Objects with|\d{4})/i;

/**
 * Collections that the prefix list cannot catch because their titles start with
 * an ordinary word.
 *
 * `animals` as a plural noun is the strongest single signal: a category about
 * animals in general is never a category about one species. It catches
 * "Curled up animals", "Sleeping animals" and "Animals of Egypt" alike.
 *
 * The posture phrases are listed as phrases, not as bare words, because bare
 * words are where this gets dangerous. "flying" would reject
 * `Category:Flying foxes`, which is the correct category for an actual bat;
 * "in flight" cannot, because no species is named that.
 */
export const A_COLLECTION_NOT_A_SPECIES =
  /\b(competition|contest|awards?|wiki loves|wiki science|images from|photos from|pictures from|animals|in flight|curled up|sleeping)\b/i;

/** Whether a category is worth browsing as a species category. */
export function isSpeciesCategory(title: string): boolean {
  if (!title) return false;
  if (NOT_A_SPECIES.test(title)) return false;
  if (A_COLLECTION_NOT_A_SPECIES.test(title)) return false;
  return true;
}

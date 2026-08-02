import type { PendingRecord } from "./reviewSheet";

/**
 * Rejection is deleting the whole `## <qid> — <name>` section from review.md.
 *
 * Matching the heading form rather than a bare qid means a qid mentioned in
 * prose — a link, a note, a comment the reviewer left — cannot accidentally
 * resurrect a record they deleted. Anchored to the start of a line for the
 * same reason.
 */
export function reconcile(
  pending: PendingRecord[],
  reviewMarkdown: string
): { accepted: PendingRecord[]; rejected: PendingRecord[] } {
  const kept = new Set(
    [...reviewMarkdown.matchAll(/^##\s+(Q\d+)\s+—/gm)].map((match) => match[1])
  );

  return {
    accepted: pending.filter((record) => kept.has(record.qid)),
    rejected: pending.filter((record) => !kept.has(record.qid)),
  };
}

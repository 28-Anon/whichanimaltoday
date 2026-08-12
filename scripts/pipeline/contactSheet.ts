import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from "./imageJudge";

/**
 * One page showing every survivor, at the size it will actually be played at.
 *
 * The display size is the point rather than a detail. `images/narwhal-5.jpg`
 * passed a full-resolution check and shipped: sixteen narwhals photographed
 * from the air, unmistakable at 5000 pixels wide and blue water with smudges in
 * it at 330. A review surface that shows the full image invites exactly that
 * mistake, so the big version is one click away instead — for confirming a
 * detail, not for forming the judgement.
 *
 * Read-only by construction. This renders candidates; nothing here writes to
 * data/animals.json, because a substitution made without anybody looking is how
 * a cartoon blobfish was replaced with a painted one.
 */
export interface SheetCandidate {
  url: string;
  licence: string;
  artist: string;
  note: string;
}

export interface SheetEntry {
  commonName: string;
  candidates: SheetCandidate[];
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderCandidate(candidate: SheetCandidate): string {
  return `      <figure>
        <a href="${escape(candidate.url)}" target="_blank" rel="noreferrer">
          <img src="${escape(candidate.url)}" alt="" loading="lazy"
               style="width:${DISPLAY_WIDTH}px;height:${DISPLAY_HEIGHT}px;object-fit:contain;background:#111">
        </a>
        <figcaption><strong>${escape(candidate.artist)}</strong> — ${escape(
          candidate.licence
        )}<br>${escape(candidate.note)}</figcaption>
      </figure>`;
}

function renderEntry(entry: SheetEntry): string {
  const body =
    entry.candidates.length === 0
      ? "      <p class=\"empty\">no candidate passed — this animal needs a human, or an exception</p>"
      : entry.candidates.map(renderCandidate).join("\n");

  return `    <section>
      <h2>${escape(entry.commonName)}</h2>
${body}
    </section>`;
}

export function buildContactSheet(entries: SheetEntry[]): string {
  return `<!doctype html>
<meta charset="utf-8">
<title>Candidate photographs</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 2rem; background: #fafafa; color: #111; }
  section { margin-bottom: 2.5rem; border-top: 1px solid #ddd; padding-top: 1rem; }
  figure { display: inline-block; margin: 0 1rem 1rem 0; max-width: ${DISPLAY_WIDTH}px; vertical-align: top; }
  figcaption { font-size: 12px; color: #444; margin-top: .4rem; }
  h2 { font-size: 16px; margin: 0 0 .75rem; }
  .empty { color: #a00; }
</style>
<body>
${entries.map(renderEntry).join("\n")}
</body>`;
}

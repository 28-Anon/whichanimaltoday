/**
 * Longest teaser that still pastes comfortably into a chat message.
 *
 * Measured across the real 58 animals: hint1 has a median of 79 characters
 * and a maximum of 156. Only two exceed 140, so this cap trims almost
 * nothing — where 120 would have truncated nine.
 */
const MAX_TEASER = 140;

function trimTeaser(teaser: string): string {
  const trimmed = teaser.trim();
  if (trimmed.length <= MAX_TEASER) return trimmed;

  const cut = trimmed.slice(0, MAX_TEASER);
  const lastSpace = cut.lastIndexOf(" ");
  // Cut on a word boundary, then strip trailing punctuation so the result
  // never reads as "word , …".
  const body = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(
    /[\s,;:.\-—]+$/,
    ""
  );
  return `${body}…`;
}

export function buildShareText(
  puzzleNumber: number,
  animalEmoji: string,
  guessesUsed: number | null,
  siteUrl?: string,
  bonus?: "hit" | "miss",
  teaser?: string
): string {
  const result = guessesUsed === null ? "X/3" : `${guessesUsed}/3`;

  // Misses are shown, not hidden. A bare score on a bonus day would be
  // ambiguous — no round today, or one they failed? — and the comparison
  // between a friend's ⭐ and your ⬜ is the thing that drives a click.
  const bonusMark = bonus === "hit" ? " ⭐" : bonus === "miss" ? " ⬜" : "";

  const scoreLine = `WhichAnimalToday #${puzzleNumber} ${animalEmoji} ${result}${bonusMark}`;

  // The URL is what makes a shared result findable — without it a recipient
  // has a score and no way to reach the game. Optional so the pre-launch
  // state (constant present but not yet set) doesn't append a blank line.
  const trimmedUrl = siteUrl?.trim();

  // The curiosity hook. A bare score proves something to people who already
  // play and means nothing to anyone else — this game's differentiator is
  // that the animals are unbelievable, so the share says so without naming
  // or showing the answer.
  const hook = teaser?.trim();

  // Without a teaser the original single-newline layout is kept exactly, so
  // nothing changes for any existing caller or for anyone who already reads
  // the format.
  if (!hook) {
    return trimmedUrl ? `${scoreLine}\n${trimmedUrl}` : scoreLine;
  }

  // With one, the parts are separated by a blank line so the quote reads as
  // its own beat rather than running into the score.
  const lines = [scoreLine, `"${trimTeaser(hook)}"`];
  if (trimmedUrl) lines.push(trimmedUrl);
  return lines.join("\n\n");
}

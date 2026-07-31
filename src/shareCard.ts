export function buildShareText(
  puzzleNumber: number,
  animalEmoji: string,
  guessesUsed: number | null,
  siteUrl?: string,
  bonus?: "hit" | "miss"
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
  return trimmedUrl ? `${scoreLine}\n${trimmedUrl}` : scoreLine;
}

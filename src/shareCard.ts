export function buildShareText(
  puzzleNumber: number,
  animalEmoji: string,
  guessesUsed: number | null,
  siteUrl?: string
): string {
  const result = guessesUsed === null ? "X/3" : `${guessesUsed}/3`;
  const scoreLine = `WhichAnimalToday #${puzzleNumber} ${animalEmoji} ${result}`;

  // The URL is what makes a shared result findable — without it a recipient
  // has a score and no way to reach the game. Optional so the pre-launch
  // state (constant present but not yet set) doesn't append a blank line.
  const trimmedUrl = siteUrl?.trim();
  return trimmedUrl ? `${scoreLine}\n${trimmedUrl}` : scoreLine;
}

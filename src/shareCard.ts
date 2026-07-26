export function buildShareText(
  puzzleNumber: number,
  animalEmoji: string,
  guessesUsed: number | null
): string {
  const result = guessesUsed === null ? "X/3" : `${guessesUsed}/3`;
  return `WhichAnimalToday #${puzzleNumber} ${animalEmoji} ${result}`;
}

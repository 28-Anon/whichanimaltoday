export function normalizeGuess(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

function stripTrailingS(word: string): string {
  return word.endsWith("s") && word.length > 3 ? word.slice(0, -1) : word;
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    new Array(cols).fill(0)
  );

  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[rows - 1][cols - 1];
}

function fuzzyTolerance(word: string): number {
  if (word.length <= 4) return 0;
  if (word.length <= 7) return 1;
  return 2;
}

function namesMatch(guess: string, candidate: string): boolean {
  const normalizedGuess = stripTrailingS(normalizeGuess(guess));
  const normalizedCandidate = stripTrailingS(normalizeGuess(candidate));

  if (normalizedGuess === normalizedCandidate) return true;

  const distance = levenshteinDistance(normalizedGuess, normalizedCandidate);
  return distance <= fuzzyTolerance(normalizedCandidate);
}

export function checkGuess(
  guess: string,
  commonName: string,
  aliases: string[]
): boolean {
  const candidates = [commonName, ...aliases];
  return candidates.some((candidate) => namesMatch(guess, candidate));
}

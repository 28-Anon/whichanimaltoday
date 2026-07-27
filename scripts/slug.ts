export function buildSlug(commonName: string, puzzleNumber: number): string {
  const kebabName = commonName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
  return `${kebabName}-${puzzleNumber}`;
}

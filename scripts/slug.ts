/** A name reduced to the lowercase hyphenated form filenames and URLs use. */
export function kebabCase(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

export function buildSlug(commonName: string, puzzleNumber: number): string {
  return `${kebabCase(commonName)}-${puzzleNumber}`;
}

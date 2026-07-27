export function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getPreviousUtcDay(date: Date): Date {
  const previous = new Date(date.getTime());
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous;
}

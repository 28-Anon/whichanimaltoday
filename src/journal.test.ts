import { describe, it, expect } from "vitest";
import { buildJournal } from "./journal";
import type { DailyResult } from "./gameState";

const archive = [
  { puzzleNumber: 1, date: "2026-08-01", slug: "giraffe-1", commonName: "Giraffe", imageUrl: "https://x/g.jpg" },
  { puzzleNumber: 2, date: "2026-08-02", slug: "mole-2", commonName: "Mole", species: "Star-Nosed Mole", imageUrl: "https://x/m.jpg" },
  { puzzleNumber: 3, date: "2026-08-03", slug: "koala-3", commonName: "Koala", imageUrl: "https://x/k.jpg" },
];

function played(date: string, solved: boolean, bonus?: "hit" | "miss"): DailyResult {
  return { date, puzzleNumber: 0, solved, guessesUsed: 2, ...(bonus ? { bonus } : {}) };
}

describe("buildJournal", () => {
  it("marks a solved day as identified", () => {
    const { entries } = buildJournal(archive, [played("2026-08-01", true)]);
    expect(entries[0].state).toBe("identified");
  });

  it("marks a solved day with a bonus hit as starred", () => {
    const { entries } = buildJournal(archive, [played("2026-08-02", true, "hit")]);
    expect(entries.find((e) => e.date === "2026-08-02")!.state).toBe("starred");
  });

  it("a bonus miss is still identified, never a downgrade", () => {
    // The bonus is additive by design — losing it must not cost the entry.
    const { entries } = buildJournal(archive, [played("2026-08-02", true, "miss")]);
    expect(entries.find((e) => e.date === "2026-08-02")!.state).toBe("identified");
  });

  it("marks a played-but-lost day as missed", () => {
    const { entries } = buildJournal(archive, [played("2026-08-01", false)]);
    expect(entries[0].state).toBe("missed");
  });

  it("marks a day between plays as missed", () => {
    // They were playing, and did not show up. That is a gap they own.
    const { entries } = buildJournal(archive, [
      played("2026-08-01", true),
      played("2026-08-03", true),
    ]);
    expect(entries.find((e) => e.date === "2026-08-02")!.state).toBe("missed");
  });

  it("hides days before the player's first play", () => {
    // Entries from before someone started are not gaps they failed to fill,
    // and a wall of grey is a bleak first impression.
    const { entries, total } = buildJournal(archive, [played("2026-08-03", true)]);
    expect(entries.map((e) => e.date)).toEqual(["2026-08-03"]);
    expect(total).toBe(1);
  });

  it("returns nothing at all for a player with no history", () => {
    const summary = buildJournal(archive, []);
    expect(summary.entries).toEqual([]);
    expect(summary.total).toBe(0);
    expect(summary.identified).toBe(0);
  });

  it("counts identified and starred, with starred also counting as identified", () => {
    const summary = buildJournal(archive, [
      played("2026-08-01", true),
      played("2026-08-02", true, "hit"),
      played("2026-08-03", false),
    ]);
    expect(summary.total).toBe(3);
    expect(summary.identified).toBe(2);
    expect(summary.starred).toBe(1);
  });

  it("carries species and slug through for display and linking", () => {
    const { entries } = buildJournal(archive, [played("2026-08-02", true)]);
    const entry = entries.find((e) => e.date === "2026-08-02")!;
    expect(entry.species).toBe("Star-Nosed Mole");
    expect(entry.slug).toBe("mole-2");
  });

  it("orders newest first", () => {
    const { entries } = buildJournal(archive, [played("2026-08-01", true)]);
    expect(entries.map((e) => e.date)).toEqual(["2026-08-03", "2026-08-02", "2026-08-01"]);
  });

  it("ignores history for dates the archive does not contain", () => {
    // A stored entry for a day never archived — a job that failed, or a
    // hand-edited value. It must not invent a journal entry.
    const { entries } = buildJournal(archive, [
      played("2026-08-01", true),
      played("2030-01-01", true),
    ]);
    expect(entries.every((e) => e.date <= "2026-08-03")).toBe(true);
  });

  it("does not mutate the archive it was given", () => {
    const copy = JSON.parse(JSON.stringify(archive));
    buildJournal(archive, [played("2026-08-01", true)]);
    expect(archive).toEqual(copy);
  });
});

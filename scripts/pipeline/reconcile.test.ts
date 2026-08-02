import { describe, it, expect } from "vitest";
import { reconcile } from "./reconcile";

const a = { qid: "Q1", commonName: "Mole" } as never;
const b = { qid: "Q2", commonName: "Otter" } as never;

describe("reconcile", () => {
  it("accepts records whose section survived", () => {
    const { accepted, rejected } = reconcile(
      [a, b],
      "## Q1 — Mole\n## Q2 — Otter\n"
    );
    expect(accepted).toHaveLength(2);
    expect(rejected).toHaveLength(0);
  });

  it("rejects a record whose section was deleted", () => {
    const { accepted, rejected } = reconcile([a, b], "## Q1 — Mole\n");
    expect(accepted.map((r) => r.qid)).toEqual(["Q1"]);
    expect(rejected.map((r) => r.qid)).toEqual(["Q2"]);
  });

  it("rejects everything when the sheet is emptied", () => {
    expect(reconcile([a, b], "").accepted).toHaveLength(0);
  });

  it("matches the heading form, not a mention in prose", () => {
    // A qid appearing in a link or a note must not resurrect a record the
    // reviewer deleted.
    expect(reconcile([a], "see Q1 for context\n").accepted).toHaveLength(0);
  });

  it("ignores a heading that is not at the start of a line", () => {
    expect(reconcile([a], "text ## Q1 — Mole\n").accepted).toHaveLength(0);
  });

  it("tolerates trailing whitespace after the name", () => {
    expect(reconcile([a], "## Q1 — Mole   \n").accepted).toHaveLength(1);
  });
});

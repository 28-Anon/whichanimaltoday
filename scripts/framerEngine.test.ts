import { describe, it, expect } from "vitest";
import {
  assertNoCollisions,
  BEGIN_SENTINEL,
  END_SENTINEL,
  extractRegion,
  firstDifference,
  generateFileText,
  readEngineModules,
  readTargetFile,
  renderEngineBlock,
  spliceRegion,
  topLevelNames,
} from "./framerEngine";

describe("renderEngineBlock", () => {
  it("drops imports and strips the export keyword", () => {
    const block = renderEngineBlock([
      {
        path: "src/a.ts",
        source: [
          `import type { Thing } from "./b";`,
          ``,
          `export function double(n: number): number {`,
          `  return n * 2;`,
          `}`,
          ``,
        ].join("\n"),
      },
    ]);

    expect(block).not.toContain("import");
    expect(block).toContain("function double(n: number): number {");
    expect(block).not.toContain("export function");
  });

  it("keeps a declaration's leading comment", () => {
    const block = renderEngineBlock([
      {
        path: "src/a.ts",
        source: [
          `/** Doubles it. */`,
          `export function double(n: number): number {`,
          `  return n * 2;`,
          `}`,
          ``,
        ].join("\n"),
      },
    ]);

    expect(block).toContain("/** Doubles it. */\nfunction double");
  });

  it("does not strip the word export from inside a string literal", () => {
    const block = renderEngineBlock([
      {
        path: "src/a.ts",
        source: `const label = "export me";\n`,
      },
    ]);

    expect(block).toContain(`const label = "export me";`);
  });

  it("emits modules in the order given, each under a from-marker", () => {
    const block = renderEngineBlock([
      { path: "src/first.ts", source: `const a = 1;\n` },
      { path: "src/second.ts", source: `const b = 2;\n` },
    ]);

    expect(block.indexOf("// --- from src/first.ts ---")).toBeLessThan(
      block.indexOf("// --- from src/second.ts ---")
    );
    expect(block.indexOf("const a = 1;")).toBeLessThan(
      block.indexOf("const b = 2;")
    );
  });

  it("dedupes a byte-identical declaration shared by two modules", () => {
    const shared = `const MS_PER_DAY = 24 * 60 * 60 * 1000;`;
    const block = renderEngineBlock([
      { path: "src/first.ts", source: `${shared}\n` },
      { path: "src/second.ts", source: `${shared}\n\nconst other = 1;\n` },
    ]);

    expect(block.split(shared)).toHaveLength(2); // one occurrence
    expect(block).toContain("const other = 1;");
  });

  it("throws when two modules declare the same name differently", () => {
    expect(() =>
      renderEngineBlock([
        { path: "src/first.ts", source: `const LIMIT = 1;\n` },
        { path: "src/second.ts", source: `const LIMIT = 2;\n` },
      ])
    ).toThrow(/LIMIT.*src\/first\.ts.*src\/second\.ts/s);
  });

  it("names every source module in the header", () => {
    const block = renderEngineBlock([
      { path: "src/first.ts", source: `const a = 1;\n` },
    ]);

    expect(block).toContain("npm run generate:framer");
    expect(block).toContain("//   src/first.ts");
  });

  it("throws on `export default function ...` naming the module", () => {
    expect(() =>
      renderEngineBlock([
        {
          path: "src/bad.ts",
          source: `export default function foo() { return 1; }\n`,
        },
      ])
    ).toThrow(/src\/bad\.ts/);
  });

  it("throws on `export default <expr>;` naming the module", () => {
    expect(() =>
      renderEngineBlock([
        {
          path: "src/bad.ts",
          source: [`function foo() { return 1; }`, `export default foo;`, ``].join(
            "\n"
          ),
        },
      ])
    ).toThrow(/src\/bad\.ts/);
  });

  it("throws on `import x = require(...)` naming the module", () => {
    expect(() =>
      renderEngineBlock([
        {
          path: "src/bad.ts",
          source: `import fs = require("fs");\n`,
        },
      ])
    ).toThrow(/src\/bad\.ts/);
  });
});

describe("topLevelNames", () => {
  it("collects function, interface, type, and const names", () => {
    const names = topLevelNames(
      "src/a.ts",
      [
        `export interface Shape { size: number }`,
        `type Alias = Shape;`,
        `const VALUE = 1;`,
        `export function go(): void {}`,
      ].join("\n")
    );

    expect(names).toEqual(["Shape", "Alias", "VALUE", "go"]);
  });

  it("parses JSX when the path ends in .tsx", () => {
    const names = topLevelNames(
      "framer/X.tsx",
      `function Badge() {\n  return <div className="x">hi</div>;\n}\n`
    );

    expect(names).toEqual(["Badge"]);
  });
});

function fileWith(regionLines: string[], eol = "\n"): string {
  return [
    `import { useState } from "react";`,
    ``,
    BEGIN_SENTINEL,
    ...regionLines,
    END_SENTINEL,
    ``,
    `function Badge() {`,
    `  return <div>hi</div>;`,
    `}`,
    ``,
  ].join(eol);
}

describe("extractRegion", () => {
  it("returns only the lines between the sentinels", () => {
    expect(extractRegion(fileWith(["const a = 1;", ""]))).toBe("const a = 1;\n");
  });

  it("throws when the begin sentinel is missing", () => {
    const text = fileWith(["const a = 1;"]).replace(BEGIN_SENTINEL, "// gone");
    expect(() => extractRegion(text)).toThrow(/BEGIN/);
  });

  it("throws when the end sentinel is missing", () => {
    const text = fileWith(["const a = 1;"]).replace(END_SENTINEL, "// gone");
    expect(() => extractRegion(text)).toThrow(/END/);
  });

  it("throws when a sentinel appears twice", () => {
    const text = fileWith([BEGIN_SENTINEL, "const a = 1;"]);
    expect(() => extractRegion(text)).toThrow(/exactly once/);
  });

  it("throws when the sentinels are inverted", () => {
    const text = [
      END_SENTINEL,
      "const a = 1;",
      BEGIN_SENTINEL,
      "",
    ].join("\n");
    expect(() => extractRegion(text)).toThrow(/before/);
  });
});

describe("spliceRegion", () => {
  it("replaces the region and leaves everything else byte-for-byte", () => {
    const before = fileWith(["const old = 1;", ""]);
    const after = spliceRegion(before, "const fresh = 2;\n");

    expect(after).toContain("const fresh = 2;");
    expect(after).not.toContain("const old = 1;");
    expect(after).toContain(`import { useState } from "react";`);
    expect(after).toContain("  return <div>hi</div>;");
  });

  it("preserves CRLF line endings", () => {
    const before = fileWith(["const old = 1;", ""], "\r\n");
    const after = spliceRegion(before, "const fresh = 2;\n");

    expect(after).toContain("\r\n");
    expect(after).not.toMatch(/[^\r]\n/);
  });

  it("round-trips: extract after splice returns what was spliced in", () => {
    const after = spliceRegion(fileWith(["old", ""]), "const fresh = 2;\n");
    expect(extractRegion(after)).toBe("const fresh = 2;\n");
  });
});

describe("generateFileText", () => {
  const modules = [{ path: "src/a.ts", source: `export const VALUE = 1;\n` }];

  it("splices a freshly rendered block into the region", () => {
    const result = generateFileText(
      "framer/X.tsx",
      fileWith(["stale", ""]),
      modules
    );
    expect(extractRegion(result)).toBe(renderEngineBlock(modules));
  });

  it("throws when the block would shadow a hand-written declaration", () => {
    const text = [
      BEGIN_SENTINEL,
      END_SENTINEL,
      ``,
      `const VALUE = 99;`,
      ``,
    ].join("\n");

    expect(() => generateFileText("framer/X.tsx", text, modules)).toThrow(
      /VALUE.*by hand/s
    );
  });
});

describe("assertNoCollisions", () => {
  // Finding 1: `--check` mode must reject a hand-written name that shadows
  // the generated block even when the region itself is byte-identical to
  // src/ (the CLI is not unit-tested — see scripts/runDailyArchive.ts — so
  // this exercises the same exported guard the check-mode code path calls).
  const block = `const VALUE = 1;\n`;

  it("throws when a hand-written name outside the region collides with the block", () => {
    const text = [
      BEGIN_SENTINEL,
      END_SENTINEL,
      ``,
      `const VALUE = 99;`,
      ``,
    ].join("\n");

    expect(() => assertNoCollisions("framer/X.tsx", text, block)).toThrow(
      /VALUE.*by hand/s
    );
  });

  it("does not throw when there is no collision", () => {
    const text = [BEGIN_SENTINEL, END_SENTINEL, ``, `const OTHER = 1;`, ``].join(
      "\n"
    );

    expect(() => assertNoCollisions("framer/X.tsx", text, block)).not.toThrow();
  });
});

describe("firstDifference", () => {
  it("returns null when the two texts match", () => {
    expect(firstDifference("a\nb\n", "a\nb\n")).toBeNull();
  });

  it("reports the first differing line number and both sides", () => {
    const difference = firstDifference("a\nb\nc\n", "a\nX\nc\n");
    expect(difference).not.toBeNull();
    expect(difference).toContain("2 |");
    expect(difference).toContain("- 2 | X");
    expect(difference).toContain("+ 2 | b");
  });

  it("reports a length mismatch at the end of the shorter side", () => {
    // No trailing newline on either side: the shorter text must actually run
    // out of lines before the first difference for this branch to fire. With
    // a trailing newline the shorter side has a final "" element, and the
    // difference is reported against that empty line instead.
    const difference = firstDifference("a\nb\nc", "a\nb");
    expect(difference).toContain("- 3 | (end of region)");
    expect(difference).toContain("+ 3 | c");
  });
});

describe("the committed Framer engine block", () => {
  it("matches what the generator produces from src/ right now", () => {
    const difference = firstDifference(
      renderEngineBlock(readEngineModules()),
      extractRegion(readTargetFile())
    );

    expect(
      difference,
      "framer/GameComponent.tsx is stale. Run `npm run generate:framer` " +
        "and commit the result.\n\n" +
        (difference ?? "")
    ).toBeNull();
  });
});

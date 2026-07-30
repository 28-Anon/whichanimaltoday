import { describe, it, expect } from "vitest";
import { renderEngineBlock, topLevelNames } from "./framerEngine";

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

# Framer Engine Codegen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `docs/superpowers/specs/2026-07-30-framer-engine-codegen-design.md` — generate the engine section of `framer/GameComponent.tsx` from `src/` between sentinel comments, and fail `npm test` and CI when the committed region drifts.

**Architecture:** Two files in `scripts/`, following the repo's existing split between a pure, unit-tested module and a thin CLI entry point (compare `scripts/archiveStore.ts` with `scripts/runDailyArchive.ts`). `scripts/framerEngine.ts` holds every transformation as a string-in/string-out function, parsed with the TypeScript compiler API rather than regex. `scripts/generateFramerEngine.ts` reads files, picks write or check mode, and exits non-zero when stale. `framer/GameComponent.tsx` then loses its hand-copied engine and gains two sentinel lines plus a `browserStorage` adapter that absorbs the two differences the component used to encode by hand.

**Tech Stack:** TypeScript 5.5 (strict, ESM), the `typescript` package's compiler API (already a devDependency), Vitest 4.x, tsx, GitHub Actions. No new dependencies.

## Global Constraints

- `framer/GameComponent.tsx` must stay a single self-contained `.tsx` whose only import is `react`. Framer's editor cannot reliably resolve relative imports across pasted files. Never "fix" this by importing from `src/`. (Spec Context; `docs/framer-integration.md` step 1.)
- `src/` stays dependency-free and free of any secret or API key — it is what gets pasted into a client-side component. (Existing project constraint.)
- The generated block is a **verbatim mirror** of `src/`, modulo dropped `import`/`export` lines and cross-module dedupe. No logic is rewritten during generation. (Spec §2, §5.)
- Sentinels are these exact lines, one occurrence each, BEGIN before END:
  - `// ===== BEGIN GENERATED ENGINE — do not edit by hand =====`
  - `// ===== END GENERATED ENGINE =====`
- Module order is fixed: `src/puzzleIndex.ts`, `src/guessChecker.ts`, `src/shareCard.ts`, `src/stats.ts`, `src/gameState.ts`. (Spec §3.)
- Never string-match the word `export` to strip it. Use the AST modifier's position. (Spec §3 rule 2.)
- Working-copy files are **CRLF** (`core.autocrlf=true`, no `.gitattributes`). Splicing must preserve the target file's existing line endings or the first run produces a whole-file diff.
- Run tests with `npm test` (`vitest run`). Typecheck with `npx tsc --noEmit`; `tsconfig.json` includes `src` and `scripts` only — `framer/` is deliberately not typechecked (Spec, Rejected).
- Non-ASCII characters in the sentinels (`—`) and in `src/` comments must survive round-tripping. Read and write files as `utf8`.

---

### Task 1: The engine block renderer

**Files:**
- Create: `scripts/framerEngine.ts`
- Test: `scripts/framerEngine.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `export interface EngineModule { path: string; source: string }`
  - `export function renderEngineBlock(modules: EngineModule[]): string`
  - `export function topLevelNames(path: string, source: string): string[]`

- [ ] **Step 1: Write the failing tests**

Create `scripts/framerEngine.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- scripts/framerEngine.test.ts`
Expected: FAIL — cannot resolve `./framerEngine`.

- [ ] **Step 3: Write the implementation**

Create `scripts/framerEngine.ts`:

```typescript
import ts from "typescript";

export interface EngineModule {
  /** Repo-relative path. Used in from-markers and error messages. */
  path: string;
  source: string;
}

function parse(path: string, source: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.ES2020,
    // Parent pointers are needed so getStart(sourceFile) works on modifiers.
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

/** Every top-level name a statement binds, in source order. */
function declaredNames(statement: ts.Statement): string[] {
  if (
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement)
  ) {
    return statement.name ? [statement.name.text] : [];
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations
      .map((declaration) =>
        ts.isIdentifier(declaration.name) ? declaration.name.text : null
      )
      .filter((name): name is string => name !== null);
  }
  return [];
}

/**
 * The statement's own text, including any leading comment, with the
 * `export` modifier removed by AST position rather than by string match.
 */
function statementText(
  statement: ts.Statement,
  sourceFile: ts.SourceFile
): string {
  const source = sourceFile.text;
  const start = statement.getFullStart();
  const end = statement.getEnd();

  const exportModifier = ts.canHaveModifiers(statement)
    ? ts
        .getModifiers(statement)
        ?.find((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    : undefined;

  if (!exportModifier) return source.slice(start, end).trim();

  const head = source.slice(start, exportModifier.getStart(sourceFile));
  // Only spaces and tabs, so `export` on its own line stays on its own line.
  const tail = source
    .slice(exportModifier.getEnd(), end)
    .replace(/^[ \t]+/, "");
  return (head + tail).trim();
}

export function topLevelNames(path: string, source: string): string[] {
  return parse(path, source).statements.flatMap(declaredNames);
}

export function renderEngineBlock(modules: EngineModule[]): string {
  const seen = new Map<string, { text: string; modulePath: string }>();
  const sections: { path: string; texts: string[] }[] = [];

  for (const module of modules) {
    const sourceFile = parse(module.path, module.source);
    const texts: string[] = [];

    for (const statement of sourceFile.statements) {
      if (
        ts.isImportDeclaration(statement) ||
        ts.isExportDeclaration(statement)
      ) {
        continue;
      }

      const names = declaredNames(statement);
      const text = statementText(statement, sourceFile);

      if (names.length > 0) {
        const key = names.join(",");
        const previous = seen.get(key);
        if (previous) {
          // Identical redeclaration across modules (MS_PER_DAY lives in both
          // src/puzzleIndex.ts and src/stats.ts). Emitting it twice would be
          // a duplicate-const syntax error, so keep the first.
          if (previous.text === text) continue;
          throw new Error(
            `Conflicting declarations of \`${key}\`: ${previous.modulePath} ` +
              `and ${module.path} declare it differently. Reconcile them in ` +
              `src/ before generating.`
          );
        }
        seen.set(key, { text, modulePath: module.path });
      }

      texts.push(text);
    }

    if (texts.length > 0) sections.push({ path: module.path, texts });
  }

  const header = [
    "// Generated by scripts/generateFramerEngine.ts — do not edit by hand.",
    "// Run `npm run generate:framer` after changing any of:",
    ...modules.map((module) => `//   ${module.path}`),
    "// `npm test` and CI both fail when this block drifts from src/.",
  ].join("\n");

  const body = sections
    .map((section) =>
      [`// --- from ${section.path} ---`, ...section.texts].join("\n\n")
    )
    .join("\n\n");

  return `${header}\n\n${body}\n`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- scripts/framerEngine.test.ts`
Expected: PASS — all 9 tests.

- [ ] **Step 5: Verify the project typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/framerEngine.ts scripts/framerEngine.test.ts
git commit -m "framerEngine: render a flat engine block from src/ modules"
```

---

### Task 2: Sentinel region handling and the collision guard

**Files:**
- Modify: `scripts/framerEngine.ts` (append; do not change Task 1's functions)
- Test: `scripts/framerEngine.test.ts` (append)

**Interfaces:**
- Consumes: `renderEngineBlock`, `topLevelNames`, `EngineModule` from Task 1.
- Produces:
  - `export const BEGIN_SENTINEL: string` and `export const END_SENTINEL: string`
  - `export function extractRegion(fileText: string): string`
  - `export function spliceRegion(fileText: string, block: string): string`
  - `export function generateFileText(filePath: string, fileText: string, modules: EngineModule[]): string`
  - `export function firstDifference(expected: string, actual: string): string | null`

- [ ] **Step 1: Write the failing tests**

Append to `scripts/framerEngine.test.ts`, and extend the import at the top of the file to:

```typescript
import {
  BEGIN_SENTINEL,
  END_SENTINEL,
  extractRegion,
  firstDifference,
  generateFileText,
  renderEngineBlock,
  spliceRegion,
  topLevelNames,
} from "./framerEngine";
```

Then append:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- scripts/framerEngine.test.ts`
Expected: FAIL — `BEGIN_SENTINEL`, `extractRegion`, `spliceRegion`, `generateFileText`, and `firstDifference` are not exported.

- [ ] **Step 3: Write the implementation**

Append to `scripts/framerEngine.ts`:

```typescript
export const BEGIN_SENTINEL =
  "// ===== BEGIN GENERATED ENGINE — do not edit by hand =====";
export const END_SENTINEL = "// ===== END GENERATED ENGINE =====";

interface Region {
  /** Index of the BEGIN sentinel line. */
  start: number;
  /** Index of the END sentinel line. */
  end: number;
  lines: string[];
  eol: string;
}

function findRegion(fileText: string): Region {
  // Working copies are CRLF on Windows (core.autocrlf=true). Split on either
  // and rejoin with whatever the file already used, so splicing never
  // rewrites every line.
  const eol = fileText.includes("\r\n") ? "\r\n" : "\n";
  const lines = fileText.split(/\r?\n/);

  const indicesOf = (sentinel: string): number[] =>
    lines.reduce<number[]>((found, line, index) => {
      if (line.trim() === sentinel) found.push(index);
      return found;
    }, []);

  const begins = indicesOf(BEGIN_SENTINEL);
  const ends = indicesOf(END_SENTINEL);

  if (begins.length !== 1) {
    throw new Error(
      `Expected the BEGIN sentinel exactly once, found ${begins.length}. ` +
        `The line must read exactly:\n${BEGIN_SENTINEL}`
    );
  }
  if (ends.length !== 1) {
    throw new Error(
      `Expected the END sentinel exactly once, found ${ends.length}. ` +
        `The line must read exactly:\n${END_SENTINEL}`
    );
  }
  if (ends[0] < begins[0]) {
    throw new Error(
      "The BEGIN sentinel must appear before the END sentinel."
    );
  }

  return { start: begins[0], end: ends[0], lines, eol };
}

export function extractRegion(fileText: string): string {
  const { start, end, lines } = findRegion(fileText);
  return lines.slice(start + 1, end).join("\n");
}

export function spliceRegion(fileText: string, block: string): string {
  const { start, end, lines, eol } = findRegion(fileText);
  const blockLines = block.split(/\r?\n/);
  return [
    ...lines.slice(0, start + 1),
    ...blockLines,
    ...lines.slice(end),
  ].join(eol);
}

export function generateFileText(
  filePath: string,
  fileText: string,
  modules: EngineModule[]
): string {
  const block = renderEngineBlock(modules);

  // A name declared both inside and outside the region is a duplicate
  // identifier the moment the file is pasted into Framer. Catch it here,
  // where the error can say which side to rename.
  const { start, end, lines } = findRegion(fileText);
  const outside = [...lines.slice(0, start), ...lines.slice(end + 1)].join("\n");
  const outsideNames = new Set(topLevelNames(filePath, outside));

  for (const name of topLevelNames(filePath, block)) {
    if (outsideNames.has(name)) {
      throw new Error(
        `\`${name}\` is declared both by the generated engine block and by ` +
          `hand in ${filePath}. Remove or rename the hand-written one.`
      );
    }
  }

  return spliceRegion(fileText, block);
}

/**
 * A short report of the first line where `actual` diverges from `expected`,
 * or null when they match. `-` is what is committed, `+` is what src/ says.
 */
export function firstDifference(
  expected: string,
  actual: string
): string | null {
  const expectedLines = expected.split(/\r?\n/);
  const actualLines = actual.split(/\r?\n/);
  const length = Math.max(expectedLines.length, actualLines.length);

  for (let index = 0; index < length; index++) {
    if (expectedLines[index] === actualLines[index]) continue;

    const from = Math.max(0, index - 2);
    const context = expectedLines
      .slice(from, index)
      .map((line, offset) => `  ${from + offset + 1} | ${line}`);

    return [
      ...context,
      `- ${index + 1} | ${actualLines[index] ?? "(end of region)"}`,
      `+ ${index + 1} | ${expectedLines[index] ?? "(end of region)"}`,
    ].join("\n");
  }

  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- scripts/framerEngine.test.ts`
Expected: PASS — all 22 tests (Task 1's 9 plus these 13).

- [ ] **Step 5: Verify the project typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/framerEngine.ts scripts/framerEngine.test.ts
git commit -m "framerEngine: sentinel region splicing, collision guard, and diff"
```

---

### Task 3: The generator CLI

**Files:**
- Modify: `scripts/framerEngine.ts` (append the path constants and file readers)
- Create: `scripts/generateFramerEngine.ts`
- Modify: `package.json` (two new scripts)

**Interfaces:**
- Consumes: everything from Tasks 1 and 2.
- Produces:
  - `export const ENGINE_MODULE_PATHS: readonly string[]`
  - `export const ENGINE_TARGET_PATH: string`
  - `export function readEngineModules(): EngineModule[]`
  - `export function readTargetFile(): string`
  - npm scripts `generate:framer` and `check:framer`. Task 5's freshness test consumes the four exports above.

No unit tests for `scripts/generateFramerEngine.ts` itself — it is a CLI entry point that calls `main()` at import time, matching `scripts/runDailyArchive.ts` and `scripts/exportAnimals.ts`, neither of which is unit-tested. Everything it does beyond file I/O is already covered by Tasks 1 and 2, and Task 5 adds an end-to-end freshness assertion.

- [ ] **Step 1: Add the path constants and readers**

Append to `scripts/framerEngine.ts`, and add these two imports at the very top of the file, below the existing `import ts from "typescript";`:

```typescript
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
```

Then append at the end of the file:

```typescript
/** Fixed order: every declaration appears before the module that used it. */
export const ENGINE_MODULE_PATHS = [
  "src/puzzleIndex.ts",
  "src/guessChecker.ts",
  "src/shareCard.ts",
  "src/stats.ts",
  "src/gameState.ts",
] as const;

export const ENGINE_TARGET_PATH = "framer/GameComponent.tsx";

/** This file lives in scripts/, so `../` is the repo root. */
export function resolveFromRepoRoot(relativePath: string): string {
  return fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
}

export function readEngineModules(): EngineModule[] {
  return ENGINE_MODULE_PATHS.map((path) => ({
    path,
    source: readFileSync(resolveFromRepoRoot(path), "utf8"),
  }));
}

export function readTargetFile(): string {
  return readFileSync(resolveFromRepoRoot(ENGINE_TARGET_PATH), "utf8");
}
```

- [ ] **Step 2: Write the CLI**

Create `scripts/generateFramerEngine.ts`:

```typescript
import { writeFileSync } from "node:fs";
import {
  ENGINE_TARGET_PATH,
  extractRegion,
  firstDifference,
  generateFileText,
  readEngineModules,
  readTargetFile,
  renderEngineBlock,
  resolveFromRepoRoot,
} from "./framerEngine";

function main(): void {
  const checkOnly = process.argv.includes("--check");
  const modules = readEngineModules();
  const fileText = readTargetFile();

  if (checkOnly) {
    const difference = firstDifference(
      renderEngineBlock(modules),
      extractRegion(fileText)
    );
    if (difference === null) {
      console.log(`${ENGINE_TARGET_PATH}: generated engine is up to date.`);
      return;
    }
    console.error(
      `${ENGINE_TARGET_PATH}: the generated engine block is stale.\n\n` +
        `${difference}\n\n` +
        "Run `npm run generate:framer` and commit the result."
    );
    process.exit(1);
  }

  const nextText = generateFileText(ENGINE_TARGET_PATH, fileText, modules);
  if (nextText === fileText) {
    console.log(`${ENGINE_TARGET_PATH}: already up to date.`);
    return;
  }

  writeFileSync(resolveFromRepoRoot(ENGINE_TARGET_PATH), nextText, "utf8");
  console.log(`${ENGINE_TARGET_PATH}: regenerated the engine block.`);
}

main();
```

- [ ] **Step 3: Add the npm scripts**

In `package.json`, the `scripts` block currently reads:

```json
  "scripts": {
    "test": "vitest run",
    "archive:run": "tsx scripts/runDailyArchive.ts",
    "export:animals": "tsx scripts/exportAnimals.ts",
    "import:animals": "tsx scripts/importAnimalsCsv.ts"
  },
```

Replace it with:

```json
  "scripts": {
    "test": "vitest run",
    "archive:run": "tsx scripts/runDailyArchive.ts",
    "export:animals": "tsx scripts/exportAnimals.ts",
    "import:animals": "tsx scripts/importAnimalsCsv.ts",
    "generate:framer": "tsx scripts/generateFramerEngine.ts",
    "check:framer": "tsx scripts/generateFramerEngine.ts --check"
  },
```

- [ ] **Step 4: Verify the CLI reports the missing sentinels**

`framer/GameComponent.tsx` has no sentinels yet — Task 4 adds them — so this run must fail with the sentinel error, proving the CLI is wired up and reading the right file.

Run: `npm run check:framer`
Expected: FAIL — "Expected the BEGIN sentinel exactly once, found 0."

- [ ] **Step 5: Verify the project typechecks and the suite still passes**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all suites pass (Task 5 adds the freshness test — it does not exist yet).

- [ ] **Step 6: Commit**

```bash
git add scripts/framerEngine.ts scripts/generateFramerEngine.ts package.json
git commit -m "generate:framer: CLI with write and --check modes"
```

---

### Task 4: Convert the Framer component

**Files:**
- Modify: `framer/GameComponent.tsx:1-6` (header comment), `:30-292` (the whole hand-copied engine section), `:397-403` (the load effect), `:446-454` (`finishGame`)

**Interfaces:**
- Consumes: the CLI and npm scripts from Task 3.
- Produces: a `framer/GameComponent.tsx` whose engine section is generated, plus `const browserStorage: StorageLike` for Task 5's manual checks to exercise.

No automated tests: this file is a Framer paste target and is outside `tsconfig.json`'s `include`. Correctness comes from the generated block being a verbatim mirror of the Vitest-covered `src/`, and from the manual checklist in Task 6.

- [ ] **Step 1: Update the file header comment**

Replace `framer/GameComponent.tsx:3-6`:

```typescript
// Paste this whole file into a Framer code component. It's fully
// self-contained (engine logic inlined per docs/framer-integration.md —
// Framer's code editor doesn't reliably resolve relative imports across
// multiple pasted files).
```

with:

```typescript
// Paste this whole file into a Framer code component. It's fully
// self-contained — Framer's code editor doesn't reliably resolve relative
// imports across multiple pasted files, so the engine is inlined rather
// than imported. That inlined section is GENERATED from src/ by
// scripts/generateFramerEngine.ts: edit src/, then run
// `npm run generate:framer`. Editing it here is overwritten, and CI fails
// when it drifts. See docs/framer-integration.md.
```

- [ ] **Step 2: Replace the hand-copied engine section**

Replace everything from line 30 (`// ---------- Engine logic (copied from src/*.ts, kept in sync by hand) ----------`) through line 292 (the closing brace of `todayDateString`) — that is, everything between the `react` import and the `// ---------- Component ----------` marker — with exactly this:

```typescript
// ===== BEGIN GENERATED ENGINE — do not edit by hand =====
// ===== END GENERATED ENGINE =====

// ---------- Component-local types and helpers (not generated) ----------

interface Animal {
  commonName: string;
  aliases: string[];
  imageUrl: string;
  hint1: string;
  hint2: string;
  hint3: string;
  funFacts: string;
  category: string;
  imageAttribution: string;
}

// Rough category → emoji lookup for the share card. Not stored per-animal
// (the data model doesn't have an emoji field) — this is a light touch,
// not meant to spoil the specific species.
const CATEGORY_EMOJI: Record<string, string> = {
  mammal: "🐾",
  bird: "🐦",
  fish: "🐟",
  reptile: "🦎",
  amphibian: "🐸",
  insect: "🐛",
  marine: "🐠",
};

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_STATS: Stats = {
  played: 0,
  wins: 0,
  winPercent: 0,
  currentStreak: 0,
  maxStreak: 0,
  distribution: [0, 0, 0],
};

// The generated engine takes a StorageLike so it can be unit-tested against
// a fake. In the browser that is window.localStorage — but the property
// access itself throws when cookies are blocked, and the object does not
// exist during SSR, so both are guarded here rather than inside the engine.
const browserStorage: StorageLike = {
  getItem(key) {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Quota exceeded, or storage blocked entirely. The game continues; the
      // result just will not survive a reload.
    }
  },
};
```

Everything deleted here is either regenerated in Step 4 (`Animal` excepted — it is not in `src/`) or replaced by the block above. In particular the hand-written `DailyResult`, `Stats`, `StoredStateV2`, `emptyState`, `loadState`, `saveState`, `dayNumber`, `computeStats`, `recordResult`, `MS_PER_DAY`, `utcDayNumber`, `getDaysSinceLaunch`, `getTodayPuzzleIndex`, `normalizeGuess`, `stripTrailingS`, `levenshteinDistance`, `fuzzyTolerance`, `namesMatch`, `checkGuess`, `buildShareText`, and `STORAGE_KEY`/`SCHEMA_VERSION` must all be gone — they come back from `src/`.

- [ ] **Step 3: Update the two call sites**

In the load effect, replace these lines (originally `:397-403`):

```typescript
        const state = loadState();
        const today8601 = todayDateString();
        setStats(computeStats(state.history, today8601));

        const todayEntry = state.history.find(
          (entry) => entry.date === today8601
        );
```

with:

```typescript
        const history = getHistory(browserStorage);
        const today8601 = todayDateString();
        setStats(computeStats(history, today8601));

        const todayEntry = history.find((entry) => entry.date === today8601);
```

Then replace the whole of `finishGame` (originally `:445-457`):

```typescript
  function finishGame(didSolve: boolean, guessesUsed: number) {
    const newStats = recordResult({
      date: todayDateString(),
      puzzleNumber,
      solved: didSolve,
      guessesUsed,
    });
    setSolved(didSolve);
    setGuessesLeft(3 - guessesUsed);
    setStats(newStats);
    setMessage(null);
    setPhase("done");
  }
```

with:

```typescript
  function finishGame(didSolve: boolean, guessesUsed: number) {
    const today = todayDateString();
    // src/'s recordResult returns just the streak number; the panel needs
    // every figure, so read the full set back rather than diverging from
    // the generated signature. With storage blocked this reads zeros — see
    // the design doc's "Accepted behavioural change".
    recordResult(browserStorage, {
      date: today,
      puzzleNumber,
      solved: didSolve,
      guessesUsed,
    });
    setSolved(didSolve);
    setGuessesLeft(3 - guessesUsed);
    setStats(getStats(browserStorage, today));
    setMessage(null);
    setPhase("done");
  }
```

- [ ] **Step 4: Generate the engine block**

Run: `npm run generate:framer`
Expected: `framer/GameComponent.tsx: regenerated the engine block.`

If it instead throws a collision error, a declaration listed in Step 2 was not deleted — the message names it.

- [ ] **Step 5: Verify the check mode now passes and the generator is idempotent**

Run: `npm run check:framer && npm run generate:framer && npm run check:framer`
Expected: "up to date", then "already up to date", then "up to date". A second `generate` that reports a change means the output is not stable.

- [ ] **Step 6: Verify no stale references and no duplicate declarations survive**

Run: `grep -n "loadState()\|saveState(\|recordResult(result\|const state = loadState" framer/GameComponent.tsx`
Expected: no matches. (`loadState(` with a storage argument does not appear in the component; the generated block's own internal calls use `storage`.)

Run: `grep -c "interface Stats" framer/GameComponent.tsx`
Expected: `1`.

Run: `grep -c "const MS_PER_DAY" framer/GameComponent.tsx`
Expected: `1`.

- [ ] **Step 7: Confirm the puzzleIndex drift is now fixed**

The component's hand-copied `getTodayPuzzleIndex` was missing `src/puzzleIndex.ts`'s guard. The generated copy restores it.

Run: `grep -n "listLength must be greater than 0" framer/GameComponent.tsx`
Expected: one match.

- [ ] **Step 8: Confirm the file is still self-contained**

Run: `grep -n "^import" framer/GameComponent.tsx`
Expected: exactly one line — `import { useEffect, useRef, useState } from "react";`

- [ ] **Step 9: Commit**

```bash
git add framer/GameComponent.tsx
git commit -m "GameComponent: generate the engine section from src/

Replaces the hand-copied engine with a sentinel-delimited generated block
and a browserStorage adapter. Restores the listLength guard that the
hand-copied getTodayPuzzleIndex had lost."
```

---

### Task 5: Freshness test and CI

**Files:**
- Modify: `scripts/framerEngine.test.ts` (append one describe block)
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `readEngineModules`, `readTargetFile`, `extractRegion`, `renderEngineBlock` from Tasks 1-3; the converted component from Task 4.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the freshness test**

Extend the import at the top of `scripts/framerEngine.test.ts` to also pull in the two readers:

```typescript
import {
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
```

Append this describe block:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `npm test -- scripts/framerEngine.test.ts`
Expected: PASS — 23 tests. The new one passes because Task 4 already generated the block.

- [ ] **Step 3: Prove the test actually catches drift**

Temporarily corrupt the region, confirm the failure, then restore.

```bash
node -e "const f='framer/GameComponent.tsx',s=require('fs');s.writeFileSync(f,s.readFileSync(f,'utf8').replace('function fuzzyTolerance','function fuzzyToleranceX'))"
```

Run: `npm test -- scripts/framerEngine.test.ts`
Expected: FAIL — one test fails with the "is stale" message and the differing line.

Run: `npm run check:framer`
Expected: FAIL, exit code 1, with the same differing line and the fix command.

Restore:

```bash
git checkout -- framer/GameComponent.tsx
```

Run: `npm test -- scripts/framerEngine.test.ts`
Expected: PASS — 23 tests.

- [ ] **Step 4: Add the CI workflow**

There is no test workflow today; `.github/workflows/` contains only `daily-archive.yml`. Create `.github/workflows/ci.yml`:

```yaml
# Runs the unit suite, the typechecker, and the Framer codegen staleness
# check on every push to master and every pull request.
name: CI

on:
  push:
    branches: [master]
  pull_request: {}

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - run: npm ci

      - name: Unit tests
        run: npm test

      - name: Typecheck
        run: npx tsc --noEmit

      # Last, so a stale generated block cannot mask a real test failure.
      # Redundant with the freshness test above on purpose: this step names
      # the failure in the Actions UI and prints the fix command.
      - name: Framer engine is in sync with src/
        run: npm run check:framer
```

- [ ] **Step 5: Run the full CI sequence locally**

Run: `npm test && npx tsc --noEmit && npm run check:framer`
Expected: all three pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/framerEngine.test.ts .github/workflows/ci.yml
git commit -m "ci: fail when the Framer engine block drifts from src/"
```

---

### Task 6: Documentation

**Files:**
- Modify: `docs/framer-integration.md` (step 1, and the manual verification checklist)

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Rewrite step 1 of the integration guide**

`docs/framer-integration.md:6-11` currently reads:

```markdown
1. Copy the contents of `src/puzzleIndex.ts`, `src/guessChecker.ts`,
   `src/shareCard.ts`, `src/gameState.ts`, and `src/animalData.ts` into a
   single Framer code file (Framer's code component editor does not reliably
   resolve local relative imports across multiple pasted files — a single
   combined file is the safe path). Keep `src/index.ts`'s export list as a
   reference for what to expose from that combined file.
```

Replace it with:

```markdown
1. **Don't hand-copy anything.** `framer/GameComponent.tsx` is the file you
   paste, and its engine section is generated from `src/`:

   ```bash
   npm run generate:framer
   ```

   That reads `src/puzzleIndex.ts`, `src/guessChecker.ts`,
   `src/shareCard.ts`, `src/stats.ts`, and `src/gameState.ts`, flattens them
   into one dependency-free block, and splices it into
   `framer/GameComponent.tsx` between:

   ```
   // ===== BEGIN GENERATED ENGINE — do not edit by hand =====
   // ===== END GENERATED ENGINE =====
   ```

   Framer's code component editor does not reliably resolve local relative
   imports across multiple pasted files, which is why the engine is inlined
   at all. Generating it means the copy cannot drift: `npm test` and CI both
   fail when the committed block no longer matches `src/`. To check without
   writing:

   ```bash
   npm run check:framer
   ```

   Edit `src/`, never the generated block. Everything outside the sentinels
   — the modal, the icon bar, the stats and How to Play panels, the styles —
   is hand-written and is preserved untouched by the generator.

   Two things the component supplies itself, outside the sentinels:

   - `browserStorage`, a `StorageLike` adapter wrapping
     `window.localStorage` with an SSR guard and a `try`/`catch` for blocked
     cookies. The engine takes an injected storage so it can be unit-tested
     against a fake; this is what supplies the real one.
   - `Animal`, `CATEGORY_EMOJI`, `todayDateString`, and `EMPTY_STATS`, none
     of which exist in `src/`.

   `src/animalData.ts` is a build-time validator with no browser caller and
   is deliberately not part of the generated block.
```

- [ ] **Step 2: Add the manual checks**

Append to the end of the "Manual verification checklist" section in `docs/framer-integration.md`:

```markdown
### Generated engine section (added 2026-07-30)

- [ ] Run `npm run generate:framer`, paste the whole of
      `framer/GameComponent.tsx` into Framer, and play a full round: the
      photo loads, three guesses reveal three clues, the reveal card
      appears, and the share string copies. Behaviour must be
      indistinguishable from the previous hand-copied build.
- [ ] Open the 📊 panel after finishing: Played, Win %, Current, Max, and
      the highlighted distribution bar all match the `history` array in
      DevTools → Application → Local Storage.
- [ ] **Blocked-storage run.** Block cookies for the site, reload, and play
      to the end. Expect: no console error, the game completes normally,
      and the stats panel reads "No specimens identified yet." rather than
      "Played 1". This is the accepted behavioural change from the design
      doc §5 — the previous build showed a figure here that vanished on the
      next reload.
- [ ] Confirm `grep -c "^import" framer/GameComponent.tsx` is still 1. The
      pasted file must import nothing but `react`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/framer-integration.md
git commit -m "docs: describe the generated engine section and its workflow"
```

---

## Self-review notes

**Spec coverage.** Context's drift table → Task 4 Step 7 verifies the
`listLength` guard is restored. §1 architecture (pure module + thin CLI) →
Tasks 1-3. §2 whole-modules scope → Task 3's `ENGINE_MODULE_PATHS`, with no
reachability pass anywhere in the plan. §3 transformation rules 1-4 →
Task 1 (drop/strip/dedupe/conflict) and Task 2 (collision guard). §4
sentinels → Task 2's `findRegion` plus Task 4 Step 2. §5 collapsing both
differences → Task 4 Steps 2-3, with the accepted behavioural change
commented at the call site and checked in Task 6 Step 2. §6 write and check
modes → Task 3 Step 2; the Vitest freshness assertion → Task 5 Step 1. §7
CI → Task 5 Step 4. §8 testing → Tasks 1, 2, and 5, one test per listed
bullet. §9 documentation → Task 6. The Rejected and Deferred sections
correctly have no tasks.

**Deliberate ordering choice.** Task 3 ends with `npm run check:framer`
*failing* on the missing sentinels, because Task 4 is what adds them. That
is the one task boundary that does not end fully green, and it is the
cheapest way to prove the CLI is reading the right file before the
component is touched. Task 4 Step 5 closes it. Every other task boundary
ends with a passing suite.

**Type consistency check.** `EngineModule` is used with the same `{ path,
source }` shape in Tasks 1, 2, and 3. `firstDifference(expected, actual)`
is called with `(generated, committed)` in both the CLI (Task 3) and the
freshness test (Task 5). `generateFileText(filePath, fileText, modules)`
keeps its three-argument order in Task 2's tests and Task 3's CLI.
`extractRegion` and `renderEngineBlock` both produce `\n`-joined text, so
comparing them never trips over the CRLF working copy; only `spliceRegion`
touches the file's real line endings.

**Prototype validation.** Tasks 1 and 2's implementation code was run
against the real `src/` files before this plan was written, rather than
being reasoned about on paper. Confirmed empirically:

- The block renders at 308 lines with **0** occurrences of `export` and
  **0** of `import`, and `MS_PER_DAY` appears exactly **once** — the
  cross-module dedupe works on the real conflict.
- The block **typechecks clean standalone** under `--strict`
  (`tsc --noEmit --strict --target ES2020`).
- All 29 expected top-level names are present, JSDoc and inline comments
  are preserved, and `getTodayPuzzleIndex` comes through *with* the
  `listLength` guard the hand-copy had lost.
- Every sentinel error path, the CRLF-preserving splice, and the
  extract/splice round-trip behave as specified.
- **The collision guard reports zero collisions** between the generated
  block and the component's surviving top-level names (`LAUNCH_DATE`,
  `ANIMALS_JSON_URL`, `Modal`, `GamePhase`, `GameComponent`, `tokens`,
  `css`, `styles`), which independently confirms Task 4 Step 2's deletion
  list is complete.

One bug was found and fixed this way: `firstDifference`'s
`(end of region)` branch is unreachable when the shorter text ends in a
newline, because `split` leaves a trailing `""` element that compares as a
real (empty) line. Task 2's test input is written without trailing
newlines so the branch is actually exercised.

**Known gap, accepted.** Nothing verifies that the regenerated component
still compiles as TSX — `framer/` is outside `tsconfig.json` and adding
`react` plus `@types/react` was rejected in the spec. The generated block
is covered by `src/` being typechecked; the hand-written adapter and the
two edited call sites are covered only by Task 6's manual checklist.

import ts from "typescript";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

      // `export default ...` and `import x = require(...)` are not handled
      // by the plain `export`-stripping below: an `ExportAssignment` (the
      // `export default foo;` form) would pass through verbatim, word
      // "export" included, and a function/class carrying the `default`
      // modifier would emit as `default function foo() {}` — both are
      // syntax errors once pasted into Framer. Fail loudly here, at
      // generate time, rather than let the corruption reach Framer, since
      // nothing else in the repo type-checks this generated block.
      if (ts.isExportAssignment(statement)) {
        throw new Error(
          `${module.path}: \`export default <expr>;\` is not supported by ` +
            "the Framer engine generator. Restructure this module to use a " +
            "named export instead."
        );
      }
      if (ts.isImportEqualsDeclaration(statement)) {
        throw new Error(
          `${module.path}: \`import ... = require(...)\` is not supported ` +
            "by the Framer engine generator. Restructure this module to " +
            "use a standard ES import instead."
        );
      }
      if (
        ts.canHaveModifiers(statement) &&
        ts
          .getModifiers(statement)
          ?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
      ) {
        throw new Error(
          `${module.path}: \`export default ...\` is not supported by the ` +
            "Framer engine generator (the `default` modifier would survive " +
            "export-stripping and produce invalid output). Restructure " +
            "this module to use a named export instead."
        );
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

/**
 * A name declared both inside the generated region and by hand outside it is
 * a duplicate identifier the moment the file is pasted into Framer. This
 * must run in both write mode and `--check` mode: a collision introduced on
 * the hand-written side leaves the region itself byte-identical to src/, so
 * the freshness check alone would report "up to date" and miss it.
 */
export function assertNoCollisions(
  filePath: string,
  fileText: string,
  block: string
): void {
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
}

export function generateFileText(
  filePath: string,
  fileText: string,
  modules: EngineModule[]
): string {
  const block = renderEngineBlock(modules);
  assertNoCollisions(filePath, fileText, block);
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

export interface EngineTarget {
  /** Repo-relative path of the component the block is spliced into. */
  path: string;
  /**
   * Fixed order: every declaration appears before the module that used it.
   * Each target gets only the modules it actually needs — an unused module
   * would still be emitted, and the collision guard would have to reason
   * about names the component never references.
   */
  modules: readonly string[];
}

export const ENGINE_TARGETS: readonly EngineTarget[] = [
  {
    path: "framer/GameComponent.tsx",
    modules: [
      "src/puzzleIndex.ts",
      "src/guessChecker.ts",
      "src/bonusRound.ts",
      "src/shareCard.ts",
      "src/stats.ts",
      "src/gameState.ts",
    ],
  },
];

/** This file lives in scripts/, so `../` is the repo root. */
export function resolveFromRepoRoot(relativePath: string): string {
  return fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
}

export function readEngineModules(target: EngineTarget): EngineModule[] {
  return target.modules.map((path) => ({
    path,
    source: readFileSync(resolveFromRepoRoot(path), "utf8"),
  }));
}

export function readTargetFile(target: EngineTarget): string {
  return readFileSync(resolveFromRepoRoot(target.path), "utf8");
}

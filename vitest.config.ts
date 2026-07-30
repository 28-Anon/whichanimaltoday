import { defaultExclude, defineConfig } from "vitest/config";

// Without this file, `vitest run` (via `npm test`) has no config and
// globs the whole repo — including the owner's live git worktree under
// `.claude/worktrees/`, which duplicates every test file it contains and
// inflates the reported totals. Vitest's defaults already exclude
// `node_modules`; this adds `.claude` on top of those defaults rather
// than replacing them.
export default defineConfig({
  test: {
    exclude: [...defaultExclude, "**/.claude/**"],
  },
});

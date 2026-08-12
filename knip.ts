import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    ".": {
      entry: [],
      project: [],
    },
    "packages/core": {
      entry: [],
      project: [],
    },
    "packages/wolfram-core": {
      entry: ["test/*.test.ts"],
      project: ["test/**"],
    },
    "packages/maude": {
      // session-worker is spawned via `new Worker(new URL(...))`, not
      // imported statically.
      entry: ["src/session-worker.ts", "test/*.test.ts"],
      project: ["src/**", "test/**"],
    },
    "packages/demo": {
      entry: ["src/worker.ts", "test/*.test.ts"],
      project: ["src/**", "test/**"],
    },
  },
  // Chapters are MDX; surface their import statements so components used
  // only from MDX (e.g. ApiSnippet) count as used.
  compilers: {
    mdx: (text: string) =>
      [...text.matchAll(/^import[^\n]+$/gm)].map((m) => m[0]).join("\n"),
  },
};

export default config;

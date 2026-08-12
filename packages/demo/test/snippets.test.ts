import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runMaude } from "maude-wasm";
import { describe, expect, it } from "vitest";

// Every ```maude fence in the tutorial must run cleanly against the real
// engine — no parse warnings, no errors, and actual output. This keeps
// the chapters honest as Maude or the tutorial evolve.

const chaptersDir = join(__dirname, "../src/chapters");
const chapterFiles = readdirSync(chaptersDir)
  .filter((f) => f.endsWith(".mdx"))
  .sort();

interface Fence {
  file: string;
  index: number;
  code: string;
}

const fences: Fence[] = chapterFiles.flatMap((file) => {
  const source = readFileSync(join(chaptersDir, file), "utf8");
  return [...source.matchAll(/```maude\n([\s\S]*?)```/g)].map((m, index) => ({
    file,
    index,
    code: m[1],
  }));
});

describe("tutorial snippets", () => {
  it("found runnable snippets", () => {
    expect(fences.length).toBeGreaterThan(20);
  });

  it.each(fences.map((f) => [`${f.file} #${f.index}`, f] as const))(
    "%s runs cleanly",
    async (_label, fence) => {
      const result = await runMaude(fence.code);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toMatch(/Warning|Error/);
      expect(result.stdout.trim().length).toBeGreaterThan(0);
    },
  );
});

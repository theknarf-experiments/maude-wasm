import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runMaude } from "maude-wasm";
import { describe, expect, it } from "vitest";

const wlSource = readFileSync(join(__dirname, "../src/wl.maude"), "utf8");

async function wl(command: string): Promise<string> {
  const result = await runMaude(
    `load /wl.maude\nreduce in WL-EVAL : ${command} .`,
    {
      files: { "/wl.maude": wlSource },
    },
  );
  expect(result.stderr).not.toMatch(/Warning|Error/);
  const match = /^result [^:]+: (.*)$/m.exec(result.stdout);
  expect(match, result.stdout).not.toBeNull();
  return (match as RegExpExecArray)[1];
}

describe("WL/M phase 0", () => {
  it("folds integer arithmetic", async () => {
    expect(await wl("run(ap(s('Plus), 1 :: ap(s('Times), 2 :: 3)))")).toBe("7");
    expect(await wl("run(ap(s('Power), 2 :: 10))")).toBe("1024");
  });

  it("applies SetDelayed definitions with substitution", async () => {
    expect(
      await wl(`run(
        ap(s('SetDelayed), ap(s('f), ? 'x) :: ap(s('Plus), s('x) :: 1)) ::
        ap(s('f), 41))`),
    ).toBe("42");
  });

  it("splices sequence patterns", async () => {
    expect(
      await wl(`run(
        ap(s('SetDelayed), ap(s('g), ? 'x :: ?? 'r) ::
          ap(s('List), s('x) :: s('x) :: s('r))) ::
        ap(s('g), 1 :: 2 :: 3))`),
    ).toBe("ap(s('List), 1 :: 1 :: 2 :: 3)");
  });

  it("evaluates memoized fibonacci through runtime Set", async () => {
    expect(
      await wl(`run(
        ap(s('Set), ap(s('fib), 0) :: 0) ::
        ap(s('Set), ap(s('fib), 1) :: 1) ::
        ap(s('SetDelayed), ap(s('fib), ? 'n) ::
          ap(s('Set), ap(s('fib), s('n)) ::
            ap(s('Plus),
              ap(s('fib), ap(s('Plus), s('n) :: -1)) ::
              ap(s('fib), ap(s('Plus), s('n) :: -2))))) ::
        ap(s('fib), 30))`),
    ).toBe("832040");
  });

  it("branches If with held branches", async () => {
    expect(
      await wl(`run(
        ap(s('SetDelayed), ap(s('fb), ? 'n) ::
          ap(s('If), ap(s('Less), s('n) :: 2) ::
            s('n) ::
            ap(s('Plus),
              ap(s('fb), ap(s('Plus), s('n) :: -1)) ::
              ap(s('fb), ap(s('Plus), s('n) :: -2))))) ::
        ap(s('fb), 15))`),
    ).toBe("610");
  });

  it("replaces into subterms and re-evaluates", async () => {
    expect(
      await wl(`run(ap(s('ReplaceAll),
        ap(s('List), ap(s('f), 1) :: ap(s('f), 2) :: s('other)) ::
        ap(s('Rule), ap(s('f), ? 'x) :: ap(s('Times), s('x) :: 10))))`),
    ).toBe("ap(s('List), 10 :: 20 :: s('other))");
  });

  it("holds Hold arguments", async () => {
    expect(await wl("run(ap(s('Hold), ap(s('Plus), 1 :: 2)))")).toBe(
      "ap(s('Hold), ap(s('Plus), 1 :: 2))",
    );
  });

  it("enforces non-linear patterns and definition order", async () => {
    expect(
      await wl(`run(
        ap(s('SetDelayed), ap(s('eqq), ? 'x :: ? 'x) :: str("same")) ::
        ap(s('SetDelayed), ap(s('eqq), ? 'x :: ? 'y) :: str("diff")) ::
        ap(s('List), ap(s('eqq), 3 :: 3) :: ap(s('eqq), 3 :: 4)))`),
    ).toBe('ap(s(\'List), str("same") :: str("diff"))');
  });

  it("redefines same-lhs definitions and introspects", async () => {
    expect(
      await wl(`run(
        ap(s('Set), ap(s('c), 1) :: 10) ::
        ap(s('Set), ap(s('c), 1) :: 20) ::
        ap(s('List), ap(s('c), 1) :: ap(s('Head), ap(s('c), 2)) ::
          ap(s('Length), ap(s('List), 1 :: 2 :: 3))))`),
    ).toBe("ap(s('List), 20 :: s('c) :: 3)");
  });
});

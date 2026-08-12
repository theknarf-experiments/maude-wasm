import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runMaude } from "maude-wasm";
import { describe, expect, it } from "vitest";

const wlSource = readFileSync(join(__dirname, "../src/wl.maude"), "utf8");

async function wl(program: string): Promise<string> {
  const result = await runMaude(
    `load /wl.maude\nreduce in WL-EVAL : run(${program}) .`,
    { files: { "/wl.maude": wlSource } },
  );
  expect(result.stderr).not.toMatch(/Warning|Error/);
  const match = /^result [^:]+: (.*)$/m.exec(result.stdout);
  expect(match, result.stdout).not.toBeNull();
  return (match as RegExpExecArray)[1];
}

// Conformance table: [name, program (core syntax), expected result].
// Keep entries WL-faithful unless the plan documents a divergence.
const cases: Array<[string, string, string]> = [
  // -- phase 0: evaluator core -----------------------------------------
  ["integer folding", "ap(s('Plus), 1 :: ap(s('Times), 2 :: 3))", "7"],
  ["integer power", "ap(s('Power), 2 :: 10)", "1024"],
  [
    "SetDelayed + substitution",
    `ap(s('SetDelayed), ap(s('f), ? 'x) :: ap(s('Plus), s('x) :: 1)) ::
     ap(s('f), 41)`,
    "42",
  ],
  [
    "sequence pattern splicing",
    `ap(s('SetDelayed), ap(s('g), ? 'x :: ?? 'r) ::
       ap(s('List), s('x) :: s('x) :: s('r))) ::
     ap(s('g), 1 :: 2 :: 3)`,
    "ap(s('List), 1 :: 1 :: 2 :: 3)",
  ],
  [
    "memoized fibonacci via runtime Set",
    `ap(s('Set), ap(s('fib), 0) :: 0) ::
     ap(s('Set), ap(s('fib), 1) :: 1) ::
     ap(s('SetDelayed), ap(s('fib), ? 'n) ::
       ap(s('Set), ap(s('fib), s('n)) ::
         ap(s('Plus),
           ap(s('fib), ap(s('Plus), s('n) :: -1)) ::
           ap(s('fib), ap(s('Plus), s('n) :: -2))))) ::
     ap(s('fib), 30)`,
    "832040",
  ],
  [
    "If with held branches",
    `ap(s('SetDelayed), ap(s('fb), ? 'n) ::
       ap(s('If), ap(s('Less), s('n) :: 2) ::
         s('n) ::
         ap(s('Plus),
           ap(s('fb), ap(s('Plus), s('n) :: -1)) ::
           ap(s('fb), ap(s('Plus), s('n) :: -2))))) ::
     ap(s('fb), 15)`,
    "610",
  ],
  [
    "ReplaceAll into subterms, re-evaluated",
    `ap(s('ReplaceAll),
       ap(s('List), ap(s('f), 1) :: ap(s('f), 2) :: s('other)) ::
       ap(s('Rule), ap(s('f), ? 'x) :: ap(s('Times), s('x) :: 10)))`,
    "ap(s('List), 10 :: 20 :: s('other))",
  ],
  [
    "Hold keeps arguments unevaluated",
    "ap(s('Hold), ap(s('Plus), 1 :: 2))",
    "ap(s('Hold), ap(s('Plus), 1 :: 2))",
  ],
  [
    "non-linear patterns",
    `ap(s('SetDelayed), ap(s('eqq), ? 'x :: ? 'x) :: str("same")) ::
     ap(s('SetDelayed), ap(s('eqq), ? 'x :: ? 'y) :: str("diff")) ::
     ap(s('List), ap(s('eqq), 3 :: 3) :: ap(s('eqq), 3 :: 4))`,
    'ap(s(\'List), str("same") :: str("diff"))',
  ],
  [
    "same-lhs redefinition",
    `ap(s('Set), ap(s('c), 1) :: 10) ::
     ap(s('Set), ap(s('c), 1) :: 20) ::
     ap(s('c), 1)`,
    "20",
  ],
  // -- phase 1: attributes and normalization ---------------------------
  [
    "symbolic Plus canonicalization",
    "ap(s('Plus), s('x) :: 1 :: 2)",
    "ap(s('Plus), 3 :: s('x))",
  ],
  [
    "Flat flattening of nested Plus",
    "ap(s('Plus), s('x) :: ap(s('Plus), s('y) :: 2) :: 3)",
    "ap(s('Plus), 5 :: s('x) :: s('y))",
  ],
  [
    "Orderless canonical order",
    "ap(s('Plus), s('b) :: s('a))",
    "ap(s('Plus), s('a) :: s('b))",
  ],
  ["Times zero absorbs", "ap(s('Times), 0 :: s('x))", "0"],
  [
    "Sequence splices into argument lists",
    "ap(s('List), 1 :: ap(s('Sequence), 2 :: 3) :: 4)",
    "ap(s('List), 1 :: 2 :: 3 :: 4)",
  ],
  [
    "user HoldAll with Evaluate override",
    `ap(s('SetAttributes), s('keep) :: s('HoldAll)) ::
     ap(s('keep), ap(s('Plus), 1 :: 2) :: ap(s('Evaluate), ap(s('Plus), 1 :: 2)))`,
    "ap(s('keep), ap(s('Plus), 1 :: 2) :: 3)",
  ],
  [
    "Attributes introspection",
    "ap(s('Attributes), s('Plus))",
    "ap(s('List), s('Flat) :: s('OneIdentity) :: s('Orderless))",
  ],
  [
    "ClearAttributes",
    `ap(s('SetAttributes), s('k) :: s('HoldAll)) ::
     ap(s('ClearAttributes), s('k) :: s('HoldAll)) ::
     ap(s('Attributes), s('k))`,
    "ap(s('List), nilA)",
  ],
  [
    "specificity: later ground definition beats earlier pattern",
    `ap(s('SetDelayed), ap(s('f), ? 'x) :: str("generic")) ::
     ap(s('Set), ap(s('f), 5) :: str("five")) ::
     ap(s('List), ap(s('f), 5) :: ap(s('f), 6))`,
    'ap(s(\'List), str("five") :: str("generic"))',
  ],
];

describe("WL/M conformance", () => {
  it.each(cases)("%s", async (_name, program, expected) => {
    expect(await wl(program)).toBe(expected);
  });
});

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
  // -- phase 2: pattern language ---------------------------------------
  [
    "head-typed blanks dispatch by head",
    `ap(s('SetDelayed), ap(s('f), ?h('x, 'Integer)) :: str("int")) ::
     ap(s('SetDelayed), ap(s('f), ?h('x, 'String)) :: s('x)) ::
     ap(s('SetDelayed), ap(s('f), ?h('x, 'List)) :: ap(s('Length), s('x))) ::
     ap(s('SetDelayed), ap(s('f), ? 'x) :: str("other")) ::
     ap(s('List),
       ap(s('f), 5) ::
       ap(s('f), str("hello")) ::
       ap(s('f), ap(s('List), 1 :: 2 :: 3)) ::
       ap(s('f), s('sym)))`,
    'ap(s(\'List), str("int") :: str("hello") :: 3 :: str("other"))',
  ],
  [
    "Symbol-typed blank binds the symbol",
    `ap(s('SetDelayed), ap(s('g), ?h('x, 'Symbol)) :: ap(s('List), s('x) :: s('x))) ::
     ap(s('g), s('a))`,
    "ap(s('List), s('a) :: s('a))",
  ],
  [
    "rhs conditions select among equal-specificity definitions",
    `ap(s('SetDelayed), ap(s('abs), ? 'x) ::
       ap(s('Condition), ap(s('Times), -1 :: s('x)) :: ap(s('Less), s('x) :: 0))) ::
     ap(s('SetDelayed), ap(s('abs), ? 'x) ::
       ap(s('Condition), s('x) :: ap(s('GreaterEqual), s('x) :: 0))) ::
     ap(s('List), ap(s('abs), -5) :: ap(s('abs), 3) :: ap(s('abs), 0))`,
    "ap(s('List), 5 :: 3 :: 0)",
  ],
  [
    "lhs Condition is hoisted and kept in definition identity",
    `ap(s('SetDelayed),
       ap(s('big), ap(s('Condition), ? 'x :: ap(s('Greater), s('x) :: 10))) ::
       str("big")) ::
     ap(s('SetDelayed), ap(s('big), ? 'x) :: str("small")) ::
     ap(s('List), ap(s('big), 42) :: ap(s('big), 5))`,
    'ap(s(\'List), str("big") :: str("small"))',
  ],
  [
    "PatternTest with fall-through",
    `ap(s('SetDelayed), ap(s('par), ap(s('PatternTest), ? 'x :: s('EvenQ))) :: str("even")) ::
     ap(s('SetDelayed), ap(s('par), ? 'x) :: str("odd")) ::
     ap(s('List), ap(s('par), 4) :: ap(s('par), 7))`,
    'ap(s(\'List), str("even") :: str("odd"))',
  ],
  [
    "failing condition on symbolic argument leaves expression inert",
    `ap(s('SetDelayed), ap(s('p), ap(s('PatternTest), ? 'x :: s('EvenQ))) :: str("even")) ::
     ap(s('p), s('y))`,
    "ap(s('p), s('y))",
  ],
  [
    "ReplaceRepeated reaches a fixed point (classic pair-sum)",
    `ap(s('ReplaceRepeated),
       ap(s('List), ap(s('List), 1 :: 2) :: ap(s('List), 3 :: 4)) ::
       ap(s('RuleDelayed), ap(s('List), ? 'x :: ? 'y) :: ap(s('Plus), s('x) :: s('y))))`,
    "10",
  ],
  [
    "MatchQ / FreeQ",
    `ap(s('List),
       ap(s('MatchQ), ap(s('f), 1) :: ap(s('f), ?h('x, 'Integer))) ::
       ap(s('MatchQ), ap(s('f), s('a)) :: ap(s('f), ?h('x, 'Integer))) ::
       ap(s('FreeQ), ap(s('g), ap(s('f), 1) :: 2) :: ap(s('f), ? 'x)) ::
       ap(s('FreeQ), ap(s('g), s('a) :: 2) :: ap(s('f), ? 'x)))`,
    "ap(s('List), s('True) :: s('False) :: s('False) :: s('True))",
  ],
  [
    "Cases and Count with typed-blank patterns",
    `ap(s('List),
       ap(s('Cases), ap(s('List), 1 :: s('a) :: 2 :: str("x") :: 3) :: ?h('n, 'Integer)) ::
       ap(s('Count), ap(s('List), 1 :: s('a) :: 2 :: str("x") :: 3) :: ?h('n, 'Integer)))`,
    "ap(s('List), ap(s('List), 1 :: 2 :: 3) :: 3)",
  ],
  [
    "Alternatives expand to per-branch definitions",
    `ap(s('SetDelayed),
       ap(s('resp), ap(s('Alternatives), str("yes") :: str("y"))) :: str("affirmative")) ::
     ap(s('SetDelayed), ap(s('resp), ? 'x) :: str("other")) ::
     ap(s('List),
       ap(s('resp), str("yes")) :: ap(s('resp), str("y")) :: ap(s('resp), str("no")))`,
    'ap(s(\'List), str("affirmative") :: str("affirmative") :: str("other"))',
  ],
  [
    "Alternatives of typed blanks bind per branch",
    `ap(s('SetDelayed),
       ap(s('num), ap(s('Alternatives), ?h('x, 'Integer) :: ?h('x, 'String))) :: s('x)) ::
     ap(s('List), ap(s('num), 7) :: ap(s('num), str("s")) :: ap(s('num), s('sym)))`,
    "ap(s('List), 7 :: str(\"s\") :: ap(s('num), s('sym)))",
  ],
  [
    "nested Alternatives inside structure",
    `ap(s('SetDelayed),
       ap(s('pair), ap(s('List), ap(s('Alternatives), 1 :: 2) :: ? 'y)) :: s('y)) ::
     ap(s('List),
       ap(s('pair), ap(s('List), 1 :: str("a"))) ::
       ap(s('pair), ap(s('List), 3 :: str("c"))))`,
    'ap(s(\'List), str("a") :: ap(s(\'pair), ap(s(\'List), 3 :: str("c"))))',
  ],
  [
    "Pattern naming: alias, ground pre-binding, named alternatives",
    `ap(s('SetDelayed), ap(s('g), ap(s('Pattern), s('x) :: ?h('y, 'Integer))) ::
       ap(s('Times), s('x) :: 2)) ::
     ap(s('SetDelayed), ap(s('f), ap(s('Pattern), s('x) :: 5)) :: ap(s('Plus), s('x) :: 1)) ::
     ap(s('SetDelayed),
       ap(s('resp), ap(s('Pattern), s('x) ::
         ap(s('Alternatives), str("yes") :: str("y")))) :: s('x)) ::
     ap(s('List), ap(s('g), 21) :: ap(s('f), 5) :: ap(s('resp), str("y")))`,
    'ap(s(\'List), 42 :: 6 :: str("y"))',
  ],
  [
    "Except: unnamed, named, and multiple independent",
    `ap(s('SetDelayed), ap(s('h), ap(s('Except), 0)) :: str("nonzero")) ::
     ap(s('SetDelayed), ap(s('h), ? 'x) :: str("zero")) ::
     ap(s('SetDelayed), ap(s('inv), ap(s('Pattern), s('x) :: ap(s('Except), 0))) :: s('x)) ::
     ap(s('SetDelayed),
       ap(s('k), ap(s('Except), 1) :: ap(s('Except), 2)) :: str("ok")) ::
     ap(s('List),
       ap(s('h), 7) :: ap(s('h), 0) :: ap(s('inv), 5) ::
       ap(s('k), 2 :: 1) :: ap(s('k), 1 :: 3))`,
    'ap(s(\'List), str("nonzero") :: str("zero") :: 5 :: str("ok") :: ap(s(\'k), 1 :: 3))',
  ],
  // -- phase 3/5: functions and structural builtins --------------------
  [
    "Function with named parameters and with slots",
    `ap(s('List),
       ap(ap(s('Function), ap(s('List), s('x)) :: ap(s('Plus), s('x) :: 1)), 41) ::
       ap(ap(s('Function), ap(s('Times), ap(s('Slot), 1) :: 2)), 21))`,
    "ap(s('List), 42 :: 42)",
  ],
  [
    "Map with a slot function over Range",
    `ap(s('Map),
       ap(s('Function), ap(s('List), s('n)) :: ap(s('Power), s('n) :: 2)) ::
       ap(s('Range), 4))`,
    "ap(s('List), 1 :: 4 :: 9 :: 16)",
  ],
  [
    "Apply / First / Rest / Total",
    `ap(s('List),
       ap(s('Apply), s('Plus) :: ap(s('List), 1 :: 2 :: 3)) ::
       ap(s('First), ap(s('List), 7 :: 8 :: 9)) ::
       ap(s('Rest), ap(s('List), 7 :: 8 :: 9)) ::
       ap(s('Total), ap(s('List), 1 :: 2 :: 3 :: 4)))`,
    "ap(s('List), 6 :: 7 :: ap(s('List), 8 :: 9) :: 10)",
  ],
  [
    "own-values + While with mutable state",
    `ap(s('Set), s('i) :: 0) ::
     ap(s('Set), s('total) :: 0) ::
     ap(s('While), ap(s('Less), s('i) :: 5) ::
       ap(s('Set), s('total) :: ap(s('Plus), s('total) :: s('i))) ::
       ap(s('Set), s('i) :: ap(s('Plus), s('i) :: 1))) ::
     s('total)`,
    "10",
  ],
  [
    "Do iterator and Table",
    `ap(s('Set), s('acc) :: 0) ::
     ap(s('Do), ap(s('Set), s('acc) :: ap(s('Plus), s('acc) :: s('k))) ::
       ap(s('List), s('k) :: 4)) ::
     ap(s('List), s('acc) ::
       ap(s('Table), ap(s('Power), s('n) :: 2) :: ap(s('List), s('n) :: 4)))`,
    "ap(s('List), 10 :: ap(s('List), 1 :: 4 :: 9 :: 16))",
  ],
  [
    "Fold, Nest, NestList",
    `ap(s('List),
       ap(s('Fold), s('Plus) :: 0 :: ap(s('List), 1 :: 2 :: 3 :: 4)) ::
       ap(s('Nest), ap(s('Function), ap(s('Times), ap(s('Slot), 1) :: 2)) :: 1 :: 10) ::
       ap(s('NestList), ap(s('Function), ap(s('Times), ap(s('Slot), 1) :: 2)) :: 1 :: 3))`,
    "ap(s('List), 10 :: 1024 :: ap(s('List), 1 :: 2 :: 4 :: 8))",
  ],
  [
    "Select, Flatten, Join",
    `ap(s('List),
       ap(s('Select), ap(s('Range), 6) :: s('EvenQ)) ::
       ap(s('Flatten), ap(s('List), 1 :: ap(s('List), 2 :: ap(s('List), 3 :: 4)) :: 5)) ::
       ap(s('Join), ap(s('List), 1 :: 2) :: ap(s('List), 3 :: 4)))`,
    "ap(s('List), ap(s('List), 2 :: 4 :: 6) :: ap(s('List), 1 :: 2 :: 3 :: 4 :: 5) :: ap(s('List), 1 :: 2 :: 3 :: 4))",
  ],
  [
    "up-value sugar dispatches on inner head",
    `ap(s('UpSetDelayed), ap(s('area), ap(s('disk), ? 'r)) ::
       ap(s('Times), ap(s('Power), s('r) :: 2) :: s('Pi))) ::
     ap(s('area), ap(s('disk), 3))`,
    "ap(s('Times), 9 :: s('Pi))",
  ],
  [
    "Module scoping: locals isolated, nesting collision-free",
    `ap(s('Set), s('x) :: 100) ::
     ap(s('Module), ap(s('List), ap(s('Set), s('x) :: 1)) ::
       ap(s('Set), s('x) :: ap(s('Plus), s('x) :: 5))) ::
     ap(s('List), s('x) ::
       ap(s('Module), ap(s('List), ap(s('Set), s('a) :: 2)) ::
         ap(s('Module), ap(s('List), ap(s('Set), s('a) :: 3)) ::
           ap(s('Times), s('a) :: 10))))`,
    "ap(s('List), 100 :: 30)",
  ],
  [
    "With substitutes evaluated initializers",
    `ap(s('With), ap(s('List), ap(s('Set), s('y) :: ap(s('Plus), 2 :: 3))) ::
       ap(s('Times), s('y) :: s('y)))`,
    "25",
  ],
  [
    "Which and Switch",
    `ap(s('List),
       ap(s('Which), s('False) :: 1 :: s('True) :: 2 :: s('True) :: 3) ::
       ap(s('Switch), ap(s('List), 1 :: 2) ::
         ?h('x, 'Integer) :: str("int") ::
         ap(s('List), ?? 'r) :: str("list") ::
         ? 'x :: str("other")))`,
    'ap(s(\'List), 2 :: str("list"))',
  ],
  [
    "For loop computes a factorial",
    `ap(s('For),
       ap(s('Set), s('j) :: 1) ::
       ap(s('LessEqual), s('j) :: 4) ::
       ap(s('Set), s('j) :: ap(s('Plus), s('j) :: 1)) ::
       ap(s('Set), s('f4) :: ap(s('Times),
         ap(s('If), ap(s('Equal), s('j) :: 1) :: 1 :: s('f4)) :: s('j)))) ::
     s('f4)`,
    "24",
  ],
  [
    "Unset removes one definition; Clear removes all for a symbol",
    `ap(s('Set), ap(s('g), 1) :: 10) ::
     ap(s('Set), ap(s('g), 2) :: 20) ::
     ap(s('Unset), ap(s('g), 1)) ::
     ap(s('SetDelayed), ap(s('h), ? 'x) :: 99) ::
     ap(s('Clear), s('h)) ::
     ap(s('List), ap(s('g), 1) :: ap(s('g), 2) :: ap(s('h), 5))`,
    "ap(s('List), ap(s('g), 1) :: 20 :: ap(s('h), 5))",
  ],
  [
    "FoldList and FixedPoint",
    `ap(s('List),
       ap(s('FoldList), s('Plus) :: 0 :: ap(s('List), 1 :: 2 :: 3)) ::
       ap(s('FixedPoint), ap(s('Function), ap(s('If),
         ap(s('Greater), ap(s('Slot), 1) :: 10) ::
         ap(s('Slot), 1) ::
         ap(s('Times), ap(s('Slot), 1) :: 2))) :: 1))`,
    "ap(s('List), ap(s('List), 0 :: 1 :: 3 :: 6) :: 16)",
  ],
  // -- phase 4: numerics -----------------------------------------------
  [
    "exact rational arithmetic",
    `ap(s('List),
       ap(s('Plus), 1/2 :: 1/3) ::
       ap(s('Power), 2 :: -1) ::
       ap(s('Times), 5 :: ap(s('Power), 3 :: -1)) ::
       ap(s('Divide), 5 :: 3) ::
       ap(s('Numerator), 6/4) ::
       ap(s('Less), 1/3 :: 1/2))`,
    "ap(s('List), 5/6 :: 1/2 :: 5/3 :: 5/3 :: 3 :: s('True))",
  ],
  [
    "Part, Last, Sort, Partition, Transpose",
    `ap(s('List),
       ap(s('Part), ap(s('List), 10 :: 20 :: 30) :: 2) ::
       ap(s('Part), ap(s('foo), 1 :: 2) :: 0) ::
       ap(s('Last), ap(s('List), 1 :: 2 :: 3)) ::
       ap(s('Sort), ap(s('List), 3 :: 1 :: 2)) ::
       ap(s('Partition), ap(s('List), 1 :: 2 :: 3 :: 4 :: 5) :: 2) ::
       ap(s('Transpose), ap(s('List),
         ap(s('List), 1 :: 2) :: ap(s('List), 3 :: 4))))`,
    "ap(s('List), 20 :: s('foo) :: 3 :: ap(s('List), 1 :: 2 :: 3) :: ap(s('List), ap(s('List), 1 :: 2) :: ap(s('List), 3 :: 4)) :: ap(s('List), ap(s('List), 1 :: 3) :: ap(s('List), 2 :: 4)))",
  ],
  [
    "Block dynamic scoping: body sees inner value, outer restored",
    `ap(s('Set), s('v) :: 10) ::
     ap(s('SetDelayed), ap(s('getv), nilA) :: s('v)) ::
     ap(s('List),
       ap(s('Block), ap(s('List), ap(s('Set), s('v) :: 99)) :: ap(s('getv), nilA)) ::
       s('v))`,
    "ap(s('List), 99 :: 10)",
  ],
];

describe("WL/M conformance", () => {
  it.each(cases)("%s", async (_name, program, expected) => {
    expect(await wl(program)).toBe(expected);
  });
});

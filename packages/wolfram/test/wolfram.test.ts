import { describe, expect, it } from "vitest";
import { compileProgram, evaluateWL } from "../src/index.js";

describe("parser", () => {
  it("compiles definitions and arithmetic", () => {
    expect(compileProgram("f[x_] := x + 1")).toBe(
      "ap(s('SetDelayed), ap(s('f), ? 'x) :: ap(s('Plus), s('x) :: 1))",
    );
  });

  it("compiles division and subtraction through Times/Power", () => {
    expect(compileProgram("a/b")).toBe(
      "ap(s('Times), s('a) :: ap(s('Power), s('b) :: -1))",
    );
    expect(compileProgram("n - 1")).toBe(
      "ap(s('Plus), s('n) :: ap(s('Times), -1 :: 1))",
    );
  });

  it("compiles patterns, conditions, rules", () => {
    expect(compileProgram("x_Integer")).toBe("?h('x, 'Integer)");
    expect(compileProgram("abs[x_] := -x /; x < 0")).toBe(
      "ap(s('SetDelayed), ap(s('abs), ? 'x) :: ap(s('Condition), ap(s('Times), -1 :: s('x)) :: ap(s('Less), s('x) :: 0)))",
    );
    expect(compileProgram("{1, 2} /. x_ -> x * 10")).toBe(
      "ap(s('ReplaceAll), ap(s('List), 1 :: 2) :: ap(s('Rule), ? 'x :: ap(s('Times), s('x) :: 10)))",
    );
  });

  it("compiles slots and postfix Function", () => {
    expect(compileProgram("#^2 &")).toBe(
      "ap(s('Function), ap(s('Power), ap(s('Slot), 1) :: 2))",
    );
  });
});

// End-to-end: real Wolfram notation through parser, engine, formatter.
const cases: Array<[string, string]> = [
  ["1 + 2 * 3", "7"],
  ["f[x_] := x + 1; f[41]", "42"],
  [
    "fib[0] = 0; fib[1] = 1; fib[n_] := fib[n] = fib[n - 1] + fib[n - 2]; fib[30]",
    "832040",
  ],
  ["1/2 + 1/3", "5/6"],
  ["Map[#^2 &, Range[5]]", "{1, 4, 9, 16, 25}"],
  ["Select[Range[10], EvenQ]", "{2, 4, 6, 8, 10}"],
  ["{{1, 2}, {3, 4}} //. {x_, y_} :> x + y", "10"],
  ["x = 100; Module[{x = 1}, x = x + 5]; x", "100"],
  ["Fold[Plus, 0, Range[100]]", "5050"],
  [
    "abs[x_] := -x /; x < 0; abs[x_] := x /; x >= 0; {abs[-5], abs[7]}",
    "{5, 7}",
  ],
  ['resp[x : ("yes" | "y")] := x; resp["y"]', '"y"'],
  ["i = 0; While[i < 5, i = i + 1]; i", "5"],
  ["Table[n^2, {n, 4}]", "{1, 4, 9, 16}"],
  ['Cases[{1, a, 2, "x", 3}, _Integer]', "{1, 2, 3}"],
  ['h[Except[0]] := "nonzero"; {h[7], h[0]}', '{"nonzero", h[0]}'],
  ["expand[n_] := n * (x + 1); expand[3]", "3*(1 + x)"],
  ["{10, 20, 30}[[2]]", "20"],
  [
    'f[x_] := (If[x > 10, Return["big"]]; "small"); {f[20], f[1]}',
    '{"big", "small"}',
  ],
  ["i = 0; While[True, i = i + 1; If[i >= 3, Break[]]]; i", "3"],
  ["Catch[Do[If[k > 3, Throw[k]], {k, 10}]]", "4"],
  [
    '{Factorial[5], Mod[-7, 3], Quotient[-7, 3], Binomial[5, 2], Min[3, 1/2, 2], StringJoin["foo", "bar"], 3 != 4}',
    '{120, 2, -3, 10, 1/2, "foobar", True}',
  ],
  // -- the stdlib: symbolic calculus written in WL/M itself ------------
  ["D[x^3 + 2*x, x]", "2 + 3*x^2"],
  ["D[x*y, x]", "y"],
  ["D[3*x^2 + x*y + 7, x]", "y + 6*x"],
  ["Integrate[x^2 + 3*x + 5, x]", "1/3*x^3 + 3/2*x^2 + 5*x"],
  ["D[Integrate[x^2, x], x]", "x^2"],
  ["Integrate[7, x]", "7*x"],
  ["2*x + 3*x", "5*x"],
  ["x*y + -1*x*y", "0"],
  ["x^2 * x^3", "x^5"],
  ["Expand[(x + 1)^3]", "1 + 3*x + 3*x^2 + x^3"],
  ["Expand[(x + y)*(x - y)]", "x^2 - y^2"],
  ["D[Sin[x^2], x]", "2*x*Cos[x^2]"],
  ["D[Exp[2*x] + Sin[x]*Cos[x], x]", "Cos[x]^2 - Sin[x]^2 + 2*Exp[2*x]"],
  ["Integrate[(x + 1)^2, x]", "x + x^2 + 1/3*x^3"],
  ["Integrate[Sin[x] + Cos[x], x]", "Sin[x] - Cos[x]"],
  ["Integrate[x^-1, x]", "Log[x]"],
  ["Coefficient[(x + 2)^3, x, 2]", "6"],
  ["Sin[0] + Cos[0]", "1"],
  ["D[Sin[x]^2, x]", "2*Cos[x]*Sin[x]"],
  // sequence blanks: __ is 1+, ___ is 0+, both take head types
  ['g[x__] := "some"; g[x___] := "none"; {g[], g[1]}', '{"none", "some"}'],
  ["f[x__Integer] := Plus[x]; f[1, 2, 3]", "6"],
  [
    'f[x__Integer] := "ints"; f[x___] := "other"; {f[1, 2], f[1, "a"]}',
    '{"ints", "other"}',
  ],
  // Optional defaults, both spellings
  ["h[x_, y_ : 10] := x + y; {h[1], h[1, 2]}", "{11, 3}"],
  ["k[Optional[x_Integer, 5]] := x * 2; {k[], k[3]}", "{10, 6}"],
  // PatternSequence splices; Repeated checks every element
  ["ps[PatternSequence[x_, y_], z_] := {x, y, z}; ps[1, 2, 3]", "{1, 2, 3}"],
  ["rep[x : Repeated[_Integer]] := Plus[x]; rep[1, 2, 3]", "6"],
  [
    "MatchQ[{1, 1, 1}, {Repeated[1]}] && !MatchQ[{1, 2}, {Repeated[1]}]",
    "True",
  ],
  ["MatchQ[{}, {RepeatedNull[1]}] && !MatchQ[{}, {__Integer}]", "True"],
  ['MatchQ[{1, 2}, {__Integer}] && !MatchQ[{1, "a"}, {__Integer}]', "True"],
  // MatchQ evaluates hoisted pattern conditions
  ["MatchQ[4, x_ /; x > 3] && !MatchQ[2, x_ /; x > 3]", "True"],
  // Listable threading with scalar broadcast
  ["{1, 2, 3} + 10", "{11, 12, 13}"],
  ["{1, 2} * {3, 4}", "{3, 8}"],
  ["Sin[{0, 0}]", "{0, 0}"],
  ["EvenQ[{1, 2}]", "{False, True}"],
  ["Thread[f[{1, 2}, 9]]", "{f[1, 9], f[2, 9]}"],
  ["MapThread[Plus, {{1, 2}, {3, 4}}]", "{4, 6}"],
  // list utilities
  ["NestWhile[Function[x, x / 2], 128, EvenQ]", "1"],
  ["Sort[{3, 1, 2}, Greater]", "{3, 2, 1}"],
  ["Riffle[{1, 2, 3}, 0]", "{1, 0, 2, 0, 3}"],
  ["Tuples[{0, 1}, 2]", "{{0, 0}, {0, 1}, {1, 0}, {1, 1}}"],
  ["Table[i * j, {i, 2}, {j, 3}]", "{{1, 2, 3}, {2, 4, 6}}"],
  ["Table[i, {i, 3, 5}]", "{3, 4, 5}"],
  ["{{1, 2}, {3, 4}}[[2, 1]]", "3"],
  ["Total[{{1, 2}, {3, 4}}]", "{4, 6}"],
];

describe("end-to-end Wolfram notation", () => {
  it.each(cases)("%s", async (program, expected) => {
    const { output } = await evaluateWL(program);
    expect(output).toBe(expected);
  });
});

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
];

describe("end-to-end Wolfram notation", () => {
  it.each(cases)("%s", async (program, expected) => {
    const { output } = await evaluateWL(program);
    expect(output).toBe(expected);
  });
});

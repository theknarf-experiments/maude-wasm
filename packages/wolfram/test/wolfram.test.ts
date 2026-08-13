import { describe, expect, it } from "vitest";
import { formatCore } from "../src/format.js";
import { compileProgram, evaluateWL, WolframSession } from "../src/index.js";
import { parse, toCore } from "../src/parser.js";

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
    expect(compileProgram("n - 1")).toBe("ap(s('Plus), s('n) :: -1)");
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
  // numeric coefficients distribute over sums, as in WL
  ["expand[n_] := n * (x + 1); expand[3]", "3 + 3*x"],
  ["-1*(x + y)", "-x - y"],
  ["Expand[(x + y)^5] - Expand[(x + y)^5]", "0"],
  ["Expand[(x + y)^8] /. {x -> 1, y -> 1}", "256"],
  ["Integrate[1/((x + 1)*(x + 2)), x]", "Log[1 + x] - Log[2 + x]"],
  ["GroupBy[Range[6], EvenQ]", "<|False -> {1, 3, 5}, True -> {2, 4, 6}|>"],
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
  ["Integrate[(x + 1)^2, x]", "1/3*(1 + x)^3"],
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
  // tagged Throw/Catch; unwinds propagate out of argument lists
  ["Catch[Throw[1, tag], tag]", "1"],
  ["Catch[Catch[Throw[1, a], b], a]", "1"],
  ["Catch[2 + Catch[Throw[7, deep], shallow], deep]", "7"],
  // protection and ClearAll
  ["SetAttributes[g, Protected]; r = (g = 5); {r, g}", "{$Failed, g}"],
  ["Protect[p]; Unprotect[p]; p = 3; p", "3"],
  [
    "cf[x_] := 1; SetAttributes[cf, Flat]; ClearAll[cf]; {cf[2], Attributes[cf]}",
    "{cf[2], {}}",
  ],
  // Unevaluated and slot sequences
  ["Length[Unevaluated[1 + 2]]", "2"],
  ["Plus[##, 10] & [1, 2]", "13"],
  ["gg[##2] & [1, 2, 3]", "gg[2, 3]"],
  // strings
  ['Characters["abc"]', '{"a", "b", "c"}'],
  ['{StringTake["hello", 2], StringTake["hello", -2]}', '{"he", "lo"}'],
  ['{StringTake["hello", {2, 4}], StringDrop["hello", 2]}', '{"ell", "llo"}'],
  ["ToString[foo]", '"foo"'],
  // conditions and sequence constraints inside replacement rules
  ["{1, 5, 2, 8} /. x_ /; x > 3 -> big", "{1, big, 2, big}"],
  ["{1, 5, 2, 8} /. x_?EvenQ :> x * 10", "{1, 5, 20, 80}"],
  ["{1, 2, 3} /. {x__Integer} :> Plus[x]", "6"],
  // Replace with level specs; default level {0}
  ["Replace[x + y, x + y -> done]", "done"],
  ["{Replace[{x, y}, x -> 0], Replace[{x, y}, x -> 0, 1]}", "{{x, y}, {0, y}}"],
  ["Replace[{{a}, a}, a -> 0, {2}]", "{{0}, a}"],
  // Cases level specs and Position
  ["Cases[{1, {2, {3}}}, _Integer, Infinity]", "{1, 2, 3}"],
  ["Cases[{1, {2, {3}}}, _Integer, {2}]", "{2}"],
  ["Position[{a, {b, a}}, a]", "{{1}, {2, 2}}"],
  ["Position[f[g[1], 2], _Integer]", "{{1, 1}, {2}}"],
  // machine reals with contagion
  ["1.5 + 2.5", "4."],
  ["{1/2 + 0.25, 2^0.5}", "{0.75, 1.4142135623730951}"],
  ["{N[1/3], N[Sqrt[2]], N[Exp[1]]}[[2]]", "1.4142135623730951"],
  [
    "{1.5 < 2, 2 == 2.0, Head[1.5], IntegerQ[1.5]}",
    "{True, True, Real, False}",
  ],
  ["f[x_Real] := real; {f[1.5], f[2]}", "{real, f[2]}"],
  ["2.0 * x + 1.5 * x", "3.5*x"],
  ["N[{1/2, 1/4}]", "{0.5, 0.25}"],
  // Association
  [
    'a = <|"x" -> 1, "y" -> 2|>; {Keys[a], Values[a], a["y"]}',
    '{{"x", "y"}, {1, 2}, 2}',
  ],
  [
    'a = <|"x" -> 1|>; {Lookup[a, "x"], Lookup[a, "z", 99], Lookup[a, "z"]}',
    '{1, 99, Missing["KeyAbsent", "z"]}',
  ],
  ['<|"x" -> 1, "x" -> 5|>', '<|"x" -> 5|>'],
  ['Association[{"a" -> 1}, <|"b" -> 2|>]', '<|"a" -> 1, "b" -> 2|>'],
  [
    'a = <|"x" -> 1|>; AssociateTo[a, "y" -> 2]; KeyDropFrom[a, "x"]; a',
    '<|"y" -> 2|>',
  ],
  [
    '{KeyExistsQ[<|"x" -> 1|>, "x"], Normal[<|"x" -> 1|>], AssociationQ[{1}]}',
    '{True, {"x" -> 1}, False}',
  ],
  // Append/Prepend and mutation sugar
  ["l = {1}; AppendTo[l, 2]; PrependTo[l, 0]; l", "{0, 1, 2}"],
  // messages as state
  ["Message[f::bad]; $MessageList", '{HoldForm[MessageName[f, "bad"]]}'],
  ["Quiet[(Message[f::bad]; 7)]; Length[$MessageList]", "0"],
  ["Check[(Message[f::bad]; 1), fallback]", "fallback"],
  ["Check[1 + 1, fallback]", "2"],
  // complex numbers
  ["I^2", "-1"],
  ["(1 + 2*I) * (3 - I)", "Complex[5, 5]"],
  ["(1 + I) + (1 - I)", "2"],
  ["{Re[3 + 4*I], Im[3 + 4*I], Conjugate[2 + 3*I]}", "{3, 4, Complex[2, -3]}"],
  // Exponent / Collect / Together
  ["Exponent[3*x^4 + x + 1, x]", "4"],
  ["Collect[a*x + b*x + c, x]", "c + x*(a + b)"],
  ["Together[1/x + 1/y]", "(x + y)/(x*y)"],
  ["Together[a/b + c/d]", "(a*d + b*c)/(b*d)"],
  // linear-substitution integration (Rubi rules) + division printing
  ["Integrate[(2*x + 5)^3, x]", "1/8*(5 + 2*x)^4"],
  ["Integrate[1/(2*x + 3), x]", "1/2*Log[3 + 2*x]"],
  ["Integrate[Sin[2*x], x]", "-1/2*Cos[2*x]"],
  ["Integrate[x/(x + 1), x]", "x - Log[1 + x]"],
  ["{x/(1 + x), 1/x, x^-2}", "{x/(1 + x), 1/x, 1/x^2}"],
];

// The Rubi-style corpus is self-checking: differentiating each
// antiderivative must give back the integrand. Together combines the
// rational terms over a common denominator and Expand cancels the
// polynomial numerator, so the difference reduces to literal 0.
const integrands = [
  "x^5",
  "(x + 1)^2",
  "3*x^2 + 2*x + 1",
  "x^-2",
  "1/(x + 2)",
  "1/(2*x + 3)",
  "(2*x + 5)^3",
  "(x + 1)*(x + 2)",
  "Sin[2*x]",
  "Cos[3*x]",
  "Exp[2*x]",
  "Sin[x] + Cos[x]",
  "Sin[x + 1]",
  "Exp[3*x + 2]",
  "x/(x + 1)",
  "x/(2*x + 1)",
  "1/((x + 1)*(x + 2))",
];

describe("WolframSession", () => {
  it("persists definitions with In/Out history", async () => {
    const s = await WolframSession.create();
    try {
      expect((await s.evaluate("f[x_] := x^2")).output).toBe("Null");
      expect((await s.evaluate("f[12]")).output).toBe("144");
      expect((await s.evaluate("% + 1")).output).toBe("145");
      expect((await s.evaluate("Out[2] * 2")).output).toBe("288");
      expect(s.history).toHaveLength(4);
      expect(s.history[1]).toMatchObject({ input: "f[12]", output: "144" });
    } finally {
      s.close();
    }
  });

  it("survives a bad cell and keeps prior state", async () => {
    const s = await WolframSession.create();
    try {
      await s.evaluate("v = 41");
      await expect(s.evaluate("1 +")).rejects.toThrow();
      expect((await s.evaluate("v + 1")).output).toBe("42");
      expect(s.history).toHaveLength(2);
    } finally {
      s.close();
    }
  });

  it("evaluates incrementally via the prefix memo", async () => {
    const s = await WolframSession.create();
    try {
      await s.evaluate(
        "fib[0] = 0; fib[1] = 1; fib[n_] := fib[n] = fib[n - 1] + fib[n - 2]; fib[25]",
      );
      const t = Date.now();
      expect((await s.evaluate("1 + 1")).output).toBe("2");
      // A replaying session would redo the fib cell (~1s); the memoized
      // prefix makes follow-up cells near-instant.
      expect(Date.now() - t).toBeLessThan(500);
    } finally {
      s.close();
    }
  });
});

describe("integration corpus: D[Integrate[f, x], x] == f", () => {
  it.each(integrands.map((f) => [f] as [string]))("%s", async (f) => {
    const { output } = await evaluateWL(
      `Expand[Together[D[Integrate[${f}, x], x] - (${f})]]`,
    );
    expect(output).toBe("0");
  });
});

describe("end-to-end Wolfram notation", () => {
  it.each(cases)("%s", async (program, expected) => {
    const { output } = await evaluateWL(program);
    expect(output).toBe(expected);
  });
});

// Round-trip property over the whole corpus: parsing the formatter's
// InputForm output must reproduce the same core term. Fresh unnamed
// blanks get new counter suffixes on re-parse, so those normalize.
const normBlanks = (core: string) => core.replace(/\$b\d+/g, "$b");

describe("format/parse round-trip", () => {
  it.each(cases.map(([src]) => [src] as [string]))("%s", (src) => {
    for (const ast of parse(src)) {
      const core = toCore(ast);
      const reparsed = parse(formatCore(core));
      expect(reparsed).toHaveLength(1);
      expect(normBlanks(toCore(reparsed[0]))).toBe(normBlanks(core));
    }
  });
});

// Fuzzing (plan task 7.4): a seeded random expression generator with
// two properties — the format→parse round-trip is stable, and the
// evaluator terminates without crashing on arbitrary well-formed
// input. Deterministic seeds keep failures reproducible.
import { describe, expect, it } from "vitest";
import { formatCore } from "../src/format.js";
import { evaluateWL } from "../src/index.js";
import { type Ast, parse, toCore } from "../src/parser.js";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HEADS = ["f", "g", "Plus", "Times", "List", "Sin", "Max"];
const SYMBOLS = ["x", "y", "z", "a"];

function genAst(rnd: () => number, depth: number): Ast {
  const r = rnd();
  if (depth <= 0 || r < 0.35) {
    if (r < 0.15) {
      return { kind: "int", value: String(Math.floor(rnd() * 200) - 100) };
    }
    if (r < 0.25) {
      return {
        kind: "symbol",
        name: SYMBOLS[Math.floor(rnd() * SYMBOLS.length)],
      };
    }
    if (r < 0.3) return { kind: "string", value: "s" };
    return {
      kind: "blank",
      name: SYMBOLS[Math.floor(rnd() * SYMBOLS.length)],
      head: rnd() < 0.3 ? "Integer" : null,
      depth: rnd() < 0.7 ? 1 : rnd() < 0.5 ? 2 : 3,
    };
  }
  const head: Ast =
    rnd() < 0.8
      ? { kind: "symbol", name: HEADS[Math.floor(rnd() * HEADS.length)] }
      : genAst(rnd, 0);
  const argCount = 1 + Math.floor(rnd() * 3);
  const args: Ast[] = [];
  for (let i = 0; i < argCount; i++) args.push(genAst(rnd, depth - 1));
  // Flat heads never carry a nested copy of themselves after
  // evaluation, and the parser re-flattens them; keep the generator
  // inside that canonical space.
  if (
    head.kind === "symbol" &&
    (head.name === "Plus" || head.name === "Times")
  ) {
    const flat = args.flatMap((a) =>
      a.kind === "apply" &&
      a.head.kind === "symbol" &&
      a.head.name === head.name
        ? a.args
        : [a],
    );
    return { kind: "apply", head, args: flat };
  }
  return { kind: "apply", head, args };
}

const normBlanks = (core: string) => core.replace(/\$b\d+/g, "$b");

describe("fuzz: format/parse round-trip", () => {
  it("holds for 200 seeded random expressions", () => {
    const rnd = mulberry32(20260813);
    for (let i = 0; i < 200; i++) {
      const core = toCore(genAst(rnd, 3));
      const printed = formatCore(core);
      const reparsed = parse(printed);
      expect(reparsed, printed).toHaveLength(1);
      expect(normBlanks(toCore(reparsed[0])), printed).toBe(normBlanks(core));
    }
  });
});

describe("fuzz: evaluator terminates on random input", () => {
  it("evaluates a batch of 25 random expressions without crashing", async () => {
    const rnd = mulberry32(424243);
    const exprs: string[] = [];
    for (let i = 0; i < 25; i++) exprs.push(formatCore(toCore(genAst(rnd, 3))));
    // One program, each expression a top-level statement; the result of
    // the last one must come back — anything else is a crash or hang.
    const { output } = await evaluateWL(exprs.join(";\n"));
    expect(typeof output).toBe("string");
  });
});

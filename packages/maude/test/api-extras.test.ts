import { describe, expect, it } from "vitest";
import { Maude, runMaude } from "../src/index.js";

const VENDING = `
mod VENDING is
  sorts Coin Item Marking .
  subsorts Coin Item < Marking .
  op __ : Marking Marking -> Marking [assoc comm id: null] .
  op null : -> Marking .
  ops $ q : -> Coin [ctor] .
  ops apple cake : -> Item [ctor] .
  rl [buy-cake] : $ => cake .
  rl [buy-apple] : $ => apple q .
  rl [change] : q q q q => $ .
endm
`;

const EXCL = `
fmod EXCL is
  sort E .
  ops a b c : -> E [ctor] .
  op f : E -> E .
  eq f(a) = a [variant] .
endfm
`;

describe("srewrite", () => {
  it("returns all solutions a strategy allows", async () => {
    const m = new Maude();
    await m.load(VENDING);
    const result = await m.srewrite("$ $", "buy-apple !");
    expect(result.complete).toBe(true);
    expect(result.solutions).toHaveLength(1);
    expect(result.solutions[0].term).toBe("q q apple apple");
    expect(result.solutions[0].sort).toBe("Marking");
  });

  it("supports strategy combinators and bounds", async () => {
    const m = new Maude();
    await m.load(VENDING);
    const result = await m.srewrite("$ $ q", "(buy-cake | buy-apple) !", {
      bound: 2,
    });
    expect(result.solutions.length).toBeLessThanOrEqual(2);
    expect(result.solutions.length).toBeGreaterThan(0);
  });
});

describe("variantUnify", () => {
  it("unifies modulo [variant] equations", async () => {
    const m = new Maude();
    await m.load(EXCL);
    const result = await m.variantUnify("f(X:E) =? Y:E");
    expect(result.unifiers.length).toBe(2);
    const collapsed = result.unifiers.find((u) => u["X:E"] === "a");
    expect(collapsed?.["Y:E"]).toBe("a");
  });
});

describe("vuNarrow", () => {
  it("finds instantiations reaching the target", async () => {
    const m = new Maude();
    await m.load(`
      mod NARROW is
        sorts E St .
        ops a b c : -> E [ctor] .
        op f : E -> St [ctor] .
        op done : -> St [ctor] .
        rl [go] : f(b) => done [narrowing] .
      endm
    `);
    const result = await m.vuNarrow("f(X:E)", "done");
    expect(result.complete).toBe(true);
    expect(result.solutions).toHaveLength(1);
    expect(result.solutions[0].state).toBe("done");
    expect(result.solutions[0].substitution["X:E"]).toBe("b");
  });
});

describe("erewrite", () => {
  it("rewrites configurations fairly", async () => {
    const m = new Maude();
    await m.load(VENDING);
    const result = await m.erewrite("$ $ q");
    expect(result.sort).toBe("Marking");
  });
});

describe("streaming output", () => {
  it("delivers lines before the run completes", async () => {
    const seen: string[] = [];
    const result = await runMaude("reduce in NAT : 1 + 2 .", {
      onOutput: (line, stream) => stream === "out" && seen.push(line),
    });
    expect(seen).toContain("result NzNat: 3");
    expect(result.stdout).toContain("result NzNat: 3");
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { Maude } from "../src/index.js";

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

describe("Maude interpreter", () => {
  describe("reduce / rewrite / parse", () => {
    const m = new Maude();

    it("reduces with structured result", async () => {
      const result = await m.reduce("3 * 4 + 1", { module: "NAT" });
      expect(result.sort).toBe("NzNat");
      expect(result.term).toBe("13");
      expect(result.stats?.rewrites).toBeGreaterThan(0);
    });

    it("rewrites with a bound", async () => {
      await m.load(VENDING);
      const result = await m.rewrite("$ $ q", { bound: 1 });
      expect(result.sort).toBe("Marking");
    });

    it("parses without rewriting", async () => {
      const result = await m.parse("1 + 2", { module: "NAT" });
      expect(result.sort).toBe("NzNat");
      expect(result.term).toBe("1 + 2");
    });

    it("throws MaudeCommandError on nonsense", async () => {
      await expect(m.reduce("]] nonsense [[", { module: "NAT" })).rejects.toThrow(
        /no result/,
      );
    });
  });

  describe("search", () => {
    const m = new Maude();
    beforeAll(async () => {
      await m.load(VENDING);
    });

    it("finds terminal states with substitutions", async () => {
      const result = await m.search("$ q q q", "apple cake M:Marking", {
        arrow: "=>!",
      });
      expect(result.complete).toBe(true);
      expect(result.solutions.length).toBeGreaterThan(0);
      expect(result.solutions[0].substitution["M:Marking"]).toBe("null");
      expect(result.solutions[0].state).not.toBeNull();
    });

    it("respects solution bounds", async () => {
      const result = await m.search("$ $ $", "M:Marking", { bound: 2 });
      expect(result.solutions).toHaveLength(2);
      expect(result.complete).toBe(false);
    });

    it("returns no solutions for unreachable patterns", async () => {
      const result = await m.search("q", "apple X:Marking", { arrow: "=>!" });
      expect(result.solutions).toHaveLength(0);
      expect(result.complete).toBe(true);
    });
  });

  describe("match and unify", () => {
    const m = new Maude();
    beforeAll(async () => {
      await m.load(VENDING);
    });

    it("matches modulo assoc/comm", async () => {
      const result = await m.match("$ M:Marking", "$ q q");
      expect(result.matchers.length).toBeGreaterThan(0);
      expect(result.matchers[0]["M:Marking"]).toBe("q q");
    });

    it("returns empty matchers when there is no match", async () => {
      const result = await m.match("apple M:Marking", "$ q");
      expect(result.matchers).toHaveLength(0);
    });

    it("unifies terms with fresh variables", async () => {
      const result = await m.unify("X:Nat + 1 =? Y:Nat + 2", {
        module: "NAT",
      });
      expect(result.unifiers.length).toBeGreaterThan(0);
      const ground = result.unifiers.find((u) => u["X:Nat"] === "2");
      expect(ground?.["Y:Nat"]).toBe("1");
    });
  });

  describe("variants", () => {
    it("generates variants from [variant] equations", async () => {
      const m = new Maude();
      await m.load(`
        fmod EXCL is
          sort E .
          ops a b c : -> E [ctor] .
          op f : E -> E .
          eq f(a) = a [variant] .
        endfm
      `);
      const result = await m.variants("f(X:E)");
      expect(result.complete).toBe(true);
      expect(result.variants.length).toBe(2);
      expect(result.variants.map((v) => v.term)).toContain("a");
    });
  });

  describe("model checking", () => {
    const m = new Maude();
    beforeAll(async () => {
      await m.loadFile("model-checker");
      await m.load(`
        mod TRAFFIC is
          including MODEL-CHECKER .
          ops green yellow red : -> State [ctor] .
          rl green => yellow .
          rl yellow => red .
          rl red => green .
          op is-green : -> Prop [ctor] .
          var S : State .
          eq green |= is-green = true .
          eq S |= is-green = false [owise] .
        endm
      `);
    });

    it("proves an LTL property", async () => {
      const result = await m.modelCheck("green", "[] <> is-green");
      expect(result.holds).toBe(true);
      expect(result.counterexample).toBeNull();
    });

    it("produces a counterexample for a false property", async () => {
      const result = await m.modelCheck("green", "[] is-green");
      expect(result.holds).toBe(false);
      expect(result.counterexample).toContain("counterexample");
    });
  });

  describe("meta-level and introspection", () => {
    const m = new Maude();

    it("runs meta-level reductions", async () => {
      const result = await m.reduce(
        "metaReduce(upModule('NAT, false), '_+_['s_^3['0.Zero], 's_^4['0.Zero]])",
        { module: "META-LEVEL" },
      );
      expect(result.term).toContain("s_^7");
    });

    it("shows module listings", async () => {
      await m.load(VENDING);
      const listing = await m.show("module VENDING");
      expect(listing).toContain("[buy-cake]");
      expect(listing).toContain("$ => cake");
    });

    it("supports raw commands via exec", async () => {
      const { output } = await m.exec("show sorts .");
      expect(output).toContain("Marking");
    });
  });
});

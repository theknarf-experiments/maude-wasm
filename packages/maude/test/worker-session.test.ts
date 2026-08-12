import { afterAll, describe, expect, it } from "vitest";
// Import from dist: the worker entry (session-worker.js) only exists as
// compiled output, and the worker URL resolves relative to the module.
import { MaudeWorkerSession } from "../dist/index.js";
import { VENDING } from "./fixtures.js";

describe("MaudeWorkerSession", () => {
  const sessionPromise = MaudeWorkerSession.create();
  afterAll(async () => {
    (await sessionPromise).close();
  });

  it("runs commands against a live interpreter", async () => {
    const s = await sessionPromise;
    const result = await s.reduce("3 * 4 + 1", { module: "NAT" });
    expect(result.sort).toBe("NzNat");
    expect(result.term).toBe("13");
  });

  it("keeps loaded modules alive across calls", async () => {
    const s = await sessionPromise;
    await s.load(VENDING);
    const result = await s.search("$ q q q", "apple cake M:Marking", {
      arrow: "=>!",
    });
    expect(result.solutions[0]?.substitution["M:Marking"]).toBe("null");
    expect(result.complete).toBe(true);
  });

  it("does not replay: later calls reuse state without re-loading", async () => {
    const s = await sessionPromise;
    // VENDING was loaded in the previous test on the same live session.
    const result = await s.rewrite("$ $ q", { bound: 1 });
    expect(result.sort).toBe("Marking");
  });

  it("is fast per call once warm", async () => {
    const s = await sessionPromise;
    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      await s.reduce(`${i} + ${i}`, { module: "NAT" });
    }
    const perCall = (performance.now() - start) / 10;
    // Replay-based calls cost a full interpreter boot (~20ms+); live
    // session calls should be well under that.
    expect(perCall).toBeLessThan(15);
  });

  it("serializes concurrent commands", async () => {
    const s = await sessionPromise;
    const [a, b] = await Promise.all([
      s.reduce("1 + 1", { module: "NAT" }),
      s.reduce("2 + 2", { module: "NAT" }),
    ]);
    expect(a.term).toBe("2");
    expect(b.term).toBe("4");
  });

  it("captures warnings on stderr", async () => {
    const s = await sessionPromise;
    const { stderr } = await s.exec("reduce in NAT : 1 + .");
    expect(stderr.length).toBeGreaterThan(0);
  });
});

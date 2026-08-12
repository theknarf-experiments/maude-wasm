import { describe, expect, it } from "vitest";
import { runMaude } from "../src/index.js";

describe("runMaude", () => {
  it("reduces arithmetic in NAT", async () => {
    const result = await runMaude("reduce in NAT : 1 + 2 .");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("result NzNat: 3");
  });

  it("supports user-defined modules", async () => {
    const result = await runMaude(`
      fmod PEANO is
        sort Nat .
        op zero : -> Nat [ctor] .
        op s_ : Nat -> Nat [ctor] .
        op _plus_ : Nat Nat -> Nat .
        vars N M : Nat .
        eq zero plus N = N .
        eq (s N) plus M = s (N plus M) .
      endfm
      reduce (s s zero) plus (s zero) .
    `);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("s s s zero");
  });

  it("captures warnings on stderr", async () => {
    const result = await runMaude("reduce in NAT : 1 + .");
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  it("loads extra files from the virtual filesystem", async () => {
    const result = await runMaude(
      'load "/extra.maude"\nreduce in EXTRA : answer .',
      {
        files: {
          "/extra.maude": `
          fmod EXTRA is
            protecting NAT .
            op answer : -> Nat .
            eq answer = 42 .
          endfm
        `,
        },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("result NzNat: 42");
  });

  it("isolates runs from each other", async () => {
    await runMaude("fmod LEAK is sort S . endfm");
    const result = await runMaude("reduce in LEAK : 1 .");
    expect(result.stderr).toContain("LEAK");
  });
});

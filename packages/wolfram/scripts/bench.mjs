// WL/M benchmark suite (plan task 7.1). Run with `pnpm bench` after
// `pnpm build`; times include parsing and formatting but not process
// startup. Each entry runs in a fresh interpreter except the session
// block, which measures incremental cell latency.
import { evaluateWL, WolframSession } from "../dist/index.js";

const oneShot = [
  ["baseline", "1 + 1"],
  [
    "fib[20] memoized",
    "fib[0] = 0; fib[1] = 1; fib[n_] := fib[n] = fib[n - 1] + fib[n - 2]; fib[20]",
  ],
  [
    "fib[15] naive",
    "nf[0] = 0; nf[1] = 1; nf[n_] := nf[n - 1] + nf[n - 2]; nf[15]",
  ],
  ["Expand[(x + y)^8]", "Expand[(x + y)^8]"],
  ["D of nested trig", "D[Sin[Cos[Exp[x^2]]], x]"],
  ["Integrate rational", "Integrate[1/((x + 1)*(x + 2)), x]"],
  ["Map over Range[200]", "Total[Map[#^2 &, Range[200]]]"],
  ["ReplaceRepeated", "{{1, 2}, {3, 4}} //. {x_, y_} :> x + y"],
];

console.log("one-shot (fresh interpreter per run):");
for (const [name, src] of oneShot) {
  const t = performance.now();
  const { output } = await evaluateWL(src);
  console.log(
    `  ${name.padEnd(24)} ${(performance.now() - t).toFixed(0).padStart(6)}ms  => ${output.slice(0, 40)}`,
  );
}

console.log("session (persistent interpreter):");
{
  const t0 = performance.now();
  const s = await WolframSession.create();
  console.log(
    `  ${"create + stdlib".padEnd(24)} ${(performance.now() - t0).toFixed(0).padStart(6)}ms`,
  );
  await s.evaluate(
    "fib[0] = 0; fib[1] = 1; fib[n_] := fib[n] = fib[n - 1] + fib[n - 2]; fib[25]",
  );
  for (const src of ["1 + 1", "fib[25]", "Expand[(x + y)^5]"]) {
    const t = performance.now();
    const { output } = await s.evaluate(src);
    console.log(
      `  ${`cell: ${src}`.padEnd(24)} ${(performance.now() - t).toFixed(0).padStart(6)}ms  => ${output.slice(0, 40)}`,
    );
  }
  s.close();
}

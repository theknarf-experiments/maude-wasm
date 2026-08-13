import { runMaude } from "maude-wasm";
import { formatCore } from "./format.js";
import { compileProgram } from "./parser.js";
import { stdlib } from "./stdlib.js";
import { wlSource } from "./wl-source.js";

export { formatCore } from "./format.js";
export { type Ast, compileProgram, parse, toCore, tokenize } from "./parser.js";
export {
  type WolframCell,
  WolframSession,
  type WolframSessionOptions,
} from "./session.js";
export { stdlib } from "./stdlib.js";

export interface WlResult {
  /** The result formatted as Wolfram InputForm. */
  output: string;
  /** The raw WL/M core term. */
  core: string;
  /** Warnings from the underlying engine, if any. */
  stderr: string;
}

/**
 * Parse and evaluate a Wolfram Language program in a fresh interpreter,
 * returning the last expression's value.
 *
 * ```ts
 * const { output } = await evaluateWL("f[x_] := x + 1; f[41]");
 * // output === "42"
 * ```
 */
export async function evaluateWL(source: string): Promise<WlResult> {
  const program = compileProgram(`${stdlib};\n${source}`);
  const result = await runMaude(
    `load /wl.maude\nreduce in WL-EVAL : run(${program}) .`,
    { files: { "/wl.maude": wlSource() } },
  );
  const match = /^result [^:]+: (.*)$/m.exec(result.stdout);
  if (!match) {
    throw new Error(`evaluation failed:\n${result.stdout}\n${result.stderr}`);
  }
  return {
    output: formatCore(match[1]),
    core: match[1],
    stderr: result.stderr,
  };
}

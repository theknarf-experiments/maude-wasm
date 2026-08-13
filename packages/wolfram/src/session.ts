import { MaudeWorkerSession, type WorkerSessionOptions } from "maude-wasm";
import { formatCore } from "./format.js";
import type { WlResult } from "./index.js";
import { parse, toCore } from "./parser.js";
import { stdlib } from "./stdlib.js";
import { wlSource } from "./wl-source.js";

export interface WolframSessionOptions extends WorkerSessionOptions {}

export interface WolframCell extends WlResult {
  /** The cell's source as given to evaluate(). */
  input: string;
}

/**
 * A persistent Wolfram session on one live Maude interpreter.
 *
 * Definitions persist across evaluate() calls without replaying: the
 * engine's `runPrefix` chain is memoized inside the interpreter, so
 * each call only evaluates the newly added expressions. Results are
 * recorded as `Out[n]`, and `%` refers to the previous output.
 *
 * ```ts
 * const s = await WolframSession.create();
 * await s.evaluate("f[x_] := x^2");
 * const { output } = await s.evaluate("f[12]"); // "144"
 * s.close();
 * ```
 */
export class WolframSession {
  /** In/Out history, one entry per evaluate() call. */
  readonly history: WolframCell[] = [];
  private prefixCores: string[];

  private constructor(private readonly session: MaudeWorkerSession) {
    this.prefixCores = parse(stdlib).map(toCore);
  }

  static async create(
    options: WolframSessionOptions = {},
  ): Promise<WolframSession> {
    // The sentinel must run inside WL-EVAL: Maude clears a module's
    // memo tables whenever a command runs in another module, which
    // would defeat the runStep prefix cache.
    const session = await MaudeWorkerSession.create({
      ...options,
      sentinelModule: options.sentinelModule ?? "WL-EVAL",
    });
    await session.exec(wlSource());
    const ws = new WolframSession(session);
    // Warm the prefix memo with the stdlib so the first cell is fast.
    await session.exec(
      `reduce in WL-EVAL : primed(runPrefix(${ws.prefixCores.join(" :: ")})) .`,
    );
    return ws;
  }

  /** Evaluate one cell; returns the last expression's value. */
  async evaluate(source: string): Promise<WlResult> {
    const n = this.history.length + 1;
    const cores = parse(source)
      .map(toCore)
      .map((c) => c.replaceAll("ap(s('Out), nilA)", `ap(s('Out), ${n - 1})`));
    if (cores.length === 0) throw new Error("empty program");
    const all = [...this.prefixCores, ...cores];
    const result = await this.session.exec(
      `reduce in WL-EVAL : runCell(${all.join(" :: ")}) .`,
    );
    const match = /^result [^:]+: ([\s\S]*)$/m.exec(result.output);
    if (!match) {
      throw new Error(`evaluation failed:\n${result.output}\n${result.stderr}`);
    }
    const core = match[1].replace(/\s+/g, " ").trim();
    const output = formatCore(core);
    // Record the value as Out[n] in the session state for later cells.
    this.prefixCores = [...all, `ap(s('Set), ap(s('Out), ${n}) :: (${core}))`];
    this.history.push({ input: source, output, core, stderr: result.stderr });
    return { output, core, stderr: result.stderr };
  }

  /** Terminate the interpreter. The session is unusable afterwards. */
  close(): void {
    this.session.close();
  }
}

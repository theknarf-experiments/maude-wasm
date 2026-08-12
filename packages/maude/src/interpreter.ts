import {
  type ExecResult,
  MaudeCommands,
  SENTINEL_COMMAND,
  SENTINEL_OUTPUT,
} from "./commands.js";
import { type MaudeOptions, runMaude } from "./run.js";

export * from "./commands.js";

/**
 * A stateful, structured interface to a Maude interpreter.
 *
 * Definitions accumulate via `load()`; every query replays them in a
 * fresh underlying interpreter (wasm `main()` is single-shot), then
 * parses the command's textual answer into structured data. Queries are
 * fully isolated from each other; for long-lived sessions with many
 * definitions, `MaudeWorkerSession` avoids the replay cost.
 *
 * ```ts
 * const m = new Maude();
 * await m.load("mod COUNTER is ... endm");
 * const { solutions } = await m.search("init", "done", { arrow: "=>!" });
 * ```
 */
export class Maude extends MaudeCommands {
  private history: string[] = [];

  constructor(private readonly options: MaudeOptions = {}) {
    super();
  }

  protected override remember(code: string): void {
    this.history.push(code);
  }

  async exec(command: string): Promise<ExecResult> {
    const parts = [...this.history, SENTINEL_COMMAND];
    if (this.currentModule) parts.push(`select ${this.currentModule} .`);
    parts.push(command);
    const input = parts.join("\n");
    const result = await runMaude(input, this.options);
    const at = result.stdout.lastIndexOf(SENTINEL_OUTPUT);
    let output =
      at === -1
        ? result.stdout
        : result.stdout.slice(at + SENTINEL_OUTPUT.length);
    output = output.replace(/\nBye\.\s*$/, "").trim();
    return { output, stderr: result.stderr };
  }
}

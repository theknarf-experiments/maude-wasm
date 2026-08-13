export interface CommandOptions {
  /** Module to evaluate in, e.g. "NAT". Defaults to the last one defined. */
  module?: string;
}

export interface RewriteOptions extends CommandOptions {
  /** Maximum number of rule applications. */
  bound?: number;
}

export interface SearchOptions extends CommandOptions {
  /**
   * Search arrow: "=>1" (one step), "=>+" (one or more), "=>*" (zero or
   * more), "=>!" (terminal states only). Defaults to "=>*".
   */
  arrow?: "=>1" | "=>+" | "=>*" | "=>!";
  /** Maximum number of solutions. */
  bound?: number;
  /** Maximum search depth. */
  depth?: number;
  /** Extra condition, e.g. "X > 2" (rendered as `such that ...`). */
  suchThat?: string;
}

export interface MatchOptions extends CommandOptions {
  /** Maximum number of matchers. */
  bound?: number;
  /** Use `xmatch` (matching with extension, for assoc/comm operators). */
  extension?: boolean;
}

export interface SrewriteOptions extends CommandOptions {
  /** Maximum number of solutions. */
  bound?: number;
  /** Use depth-first `dsrewrite` instead of fair `srewrite`. */
  depthFirst?: boolean;
}

export interface VariantUnifyOptions extends CommandOptions {
  /** Maximum number of unifiers. */
  bound?: number;
  /** Use `filtered variant unify` (most-general unifiers only). */
  filtered?: boolean;
}

export interface NarrowOptions extends CommandOptions {
  arrow?: "=>1" | "=>+" | "=>*" | "=>!";
  bound?: number;
  depth?: number;
  /** `{fold} vu-narrow`: fold the narrowing tree into a graph. */
  fold?: boolean;
}

/** Variable bindings, e.g. { "M:Marking": "q q" }. */
export type Substitution = Record<string, string>;

export interface SrewriteSolution {
  index: number;
  sort: string;
  term: string;
}

export interface SrewriteResult {
  solutions: SrewriteSolution[];
  complete: boolean;
  raw: string;
}

export interface NarrowSolution {
  index: number;
  /** The reached (possibly symbolic) state. */
  state: string;
  /** Accumulated substitution for the subject's variables. */
  substitution: Substitution;
}

export interface NarrowResult {
  solutions: NarrowSolution[];
  complete: boolean;
  raw: string;
}

export interface RunStats {
  rewrites: number;
  cpuMs: number;
  realMs: number;
}

export interface ReduceResult {
  /** Result sort (kinds appear in brackets, e.g. "[Nat]"). */
  sort: string;
  term: string;
  stats: RunStats | null;
  raw: string;
}

export interface SearchSolution {
  index: number;
  state: number | null;
  substitution: Substitution;
}

export interface SearchResult {
  solutions: SearchSolution[];
  /** True when Maude reported "No more solutions." (search exhausted). */
  complete: boolean;
  raw: string;
}

export interface MatchResult {
  matchers: Substitution[];
  raw: string;
}

export interface UnifyResult {
  unifiers: Substitution[];
  raw: string;
}

export interface Variant {
  index: number;
  sort: string;
  term: string;
  substitution: Substitution;
}

export interface VariantsResult {
  variants: Variant[];
  /** True when Maude reported "No more variants." */
  complete: boolean;
  raw: string;
}

export interface ModelCheckResult {
  holds: boolean;
  /** Textual counterexample term when the property fails. */
  counterexample: string | null;
  raw: string;
}

export interface ExecResult {
  /** Output produced by this command alone. */
  output: string;
  /** Full stderr of the underlying run (warnings, advisories). */
  stderr: string;
}

/** Thrown when Maude produced no parseable answer for a command. */
export class MaudeCommandError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly output: string,
    public readonly stderr: string,
  ) {
    super(`${message}\ncommand: ${command}\nstderr: ${stderr.trim()}`);
  }
}

// Delimits per-command output. Some commands (parse, show) are not echoed
// with Maude's "====" banner, so instead we emit a sentinel `parse`
// command around the target command and use its (deterministic,
// single-line) output as a marker.
const SENTINEL = 424243;
/**
 * Sentinel command scoped to a module. Maude clears a module's memo
 * tables whenever a command runs in a *different* module, so sessions
 * that rely on `[memo]` operators must keep the sentinel in their
 * working module (it needs NAT imported so the number parses).
 */
export function sentinelCommand(module: string): string {
  return `parse in ${module} : ${SENTINEL} .`;
}
export const SENTINEL_COMMAND = sentinelCommand("NAT");
export const SENTINEL_OUTPUT = `NzNat: ${SENTINEL}`;

/**
 * The structured Maude command surface: builds command text and parses
 * Maude's textual answers into data. Concrete subclasses decide how a
 * command is executed (`Maude` replays history in a fresh interpreter;
 * `MaudeWorkerSession` talks to a persistent one).
 */
export abstract class MaudeCommands {
  protected currentModule: string | null = null;

  /** Run one raw command and return its (un-parsed) output. */
  abstract exec(command: string): Promise<ExecResult>;

  /** Hook for subclasses that need to persist loaded definitions. */
  protected remember(_code: string): void {}

  /**
   * Add definitions (modules, views, `load` commands, `set` options) to
   * the session. Returns warnings/errors that the input produced.
   */
  async load(code: string): Promise<ExecResult> {
    const result = await this.exec(code);
    this.remember(code);
    // Track the module that Maude will treat as current, so exec() can
    // restore it after the sentinel command (an `in MOD :` clause makes
    // MOD current for all subsequent commands).
    for (const m of code.matchAll(
      /(?:^|\s)(?:fmod|mod|omod|smod|fth|oth|th)\s+(\S+)|(?:^|\s)select\s+(\S+)\s*\./g,
    )) {
      this.currentModule = m[1] ?? m[2] ?? this.currentModule;
    }
    return result;
  }

  /** `load <name>` — e.g. `loadFile("model-checker")` before using LTL. */
  loadFile(name: string): Promise<ExecResult> {
    return this.load(`load ${name}`);
  }

  /** `reduce` — equational simplification. */
  reduce(term: string, opts: CommandOptions = {}): Promise<ReduceResult> {
    return this.runResultCommand(`reduce ${inModule(opts)}${term} .`);
  }

  /** `rewrite` — default rule rewriting strategy. */
  rewrite(term: string, opts: RewriteOptions = {}): Promise<ReduceResult> {
    return this.runResultCommand(
      `rewrite ${bracket(opts.bound)}${inModule(opts)}${term} .`,
    );
  }

  /** `frewrite` — position-fair rule rewriting. */
  frewrite(term: string, opts: RewriteOptions = {}): Promise<ReduceResult> {
    return this.runResultCommand(
      `frewrite ${bracket(opts.bound)}${inModule(opts)}${term} .`,
    );
  }

  /** `parse` — parse a term and report its least sort without rewriting. */
  async parse(term: string, opts: CommandOptions = {}): Promise<ReduceResult> {
    const command = `parse ${inModule(opts)}${term} .`;
    const { output, stderr } = await this.exec(command);
    const m = /^([^\n]+?): (.*)$/s.exec(output);
    if (!m) {
      throw new MaudeCommandError(
        "term did not parse",
        command,
        output,
        stderr,
      );
    }
    return { sort: m[1], term: m[2].trim(), stats: null, raw: output };
  }

  /** `search` — breadth-first reachability with pattern + substitutions. */
  async search(
    subject: string,
    pattern: string,
    opts: SearchOptions = {},
  ): Promise<SearchResult> {
    const bounds =
      opts.bound !== undefined || opts.depth !== undefined
        ? `[${opts.bound ?? ""}${opts.depth !== undefined ? `, ${opts.depth}` : ""}] `
        : "";
    const cond = opts.suchThat ? ` such that ${opts.suchThat}` : "";
    const command = `search ${bounds}${inModule(opts)}${subject} ${opts.arrow ?? "=>*"} ${pattern}${cond} .`;
    const { output, stderr } = await this.exec(command);
    if (
      /No parse|bad token/.test(stderr) &&
      !/Solution|No solution/.test(output)
    ) {
      throw new MaudeCommandError(
        "search did not parse",
        command,
        output,
        stderr,
      );
    }
    const solutions: SearchSolution[] = [];
    for (const block of output.split(/\n\n+/)) {
      const header = /^Solution (\d+)(?: \(state (\d+)\))?/.exec(block);
      if (!header) continue;
      solutions.push({
        index: Number(header[1]),
        state: header[2] !== undefined ? Number(header[2]) : null,
        substitution: parseBindings(block),
      });
    }
    return {
      solutions,
      complete: /No (more )?solution/.test(output),
      raw: output,
    };
  }

  /** `match` / `xmatch` — pattern matching against a subject term. */
  async match(
    pattern: string,
    subject: string,
    opts: MatchOptions = {},
  ): Promise<MatchResult> {
    const verb = opts.extension ? "xmatch" : "match";
    const command = `${verb} ${bracket(opts.bound)}${inModule(opts)}${pattern} <=? ${subject} .`;
    const { output, stderr } = await this.exec(command);
    if (!/Matcher|No match/.test(output)) {
      throw new MaudeCommandError(
        "match did not parse",
        command,
        output,
        stderr,
      );
    }
    const matchers = output
      .split(/\n\n+/)
      .filter((block) => /^(Portion|Matcher )/m.test(block))
      .map(parseBindings);
    return { matchers, raw: output };
  }

  /** `unify` — order-sorted unification; `problem` like "t1 =? t2". */
  async unify(
    problem: string,
    opts: CommandOptions = {},
  ): Promise<UnifyResult> {
    const command = `unify ${inModule(opts)}${problem} .`;
    const { output, stderr } = await this.exec(command);
    if (!/Unifier|No unifier/.test(output)) {
      throw new MaudeCommandError(
        "unify did not parse",
        command,
        output,
        stderr,
      );
    }
    const unifiers = output
      .split(/\n\n+/)
      .filter((block) => /^Unifier \d/m.test(block))
      .map(parseBindings);
    return { unifiers, raw: output };
  }

  /** `get variants` — folding variant narrowing (needs `[variant]` eqs). */
  async variants(
    term: string,
    opts: CommandOptions = {},
  ): Promise<VariantsResult> {
    const command = `get variants ${inModule(opts)}${term} .`;
    const { output, stderr } = await this.exec(command);
    if (!/Variant|No variants/.test(output)) {
      throw new MaudeCommandError(
        "get variants failed",
        command,
        output,
        stderr,
      );
    }
    const variants: Variant[] = [];
    for (const block of output.split(/\n\n+/)) {
      const header = /^Variant #?(\d+)/.exec(block);
      if (!header) continue;
      const termLine = /^([^\n]+?): (.*)$/m.exec(
        block.replace(/^Variant.*\n/, "").replace(/^rewrites:.*\n/m, ""),
      );
      variants.push({
        index: Number(header[1]),
        sort: termLine?.[1] ?? "",
        term: termLine?.[2] ?? "",
        substitution: parseBindings(block),
      });
    }
    return {
      variants,
      complete: /No more variants/.test(output),
      raw: output,
    };
  }

  /**
   * LTL model checking. The session must have `loadFile("model-checker")`
   * before defining a module that includes MODEL-CHECKER.
   */
  async modelCheck(
    initial: string,
    formula: string,
    opts: CommandOptions = {},
  ): Promise<ModelCheckResult> {
    const result = await this.runResultCommand(
      `reduce ${inModule(opts)}modelCheck(${initial}, ${formula}) .`,
    );
    return {
      holds: result.sort === "Bool" && result.term === "true",
      counterexample: result.term.startsWith("counterexample")
        ? result.term
        : null,
      raw: result.raw,
    };
  }

  /** `erewrite` — object-message fair rewriting for configurations. */
  erewrite(term: string, opts: RewriteOptions = {}): Promise<ReduceResult> {
    return this.runResultCommand(
      `erewrite ${bracket(opts.bound)}${inModule(opts)}${term} .`,
    );
  }

  /** `srewrite` — rewrite under a strategy expression. */
  async srewrite(
    term: string,
    strategy: string,
    opts: SrewriteOptions = {},
  ): Promise<SrewriteResult> {
    const verb = opts.depthFirst ? "dsrewrite" : "srewrite";
    const command = `${verb} ${bracket(opts.bound)}${inModule(opts)}${term} using ${strategy} .`;
    const { output, stderr } = await this.exec(command);
    if (!/Solution|No solution/.test(output)) {
      throw new MaudeCommandError(
        "srewrite did not parse",
        command,
        output,
        stderr,
      );
    }
    const solutions: SrewriteSolution[] = [];
    for (const block of output.split(/\n\n+/)) {
      const header = /^Solution (\d+)/.exec(block);
      const result = /^result ([^\n:]+): (.*)$/m.exec(block);
      if (!header || !result) continue;
      solutions.push({
        index: Number(header[1]),
        sort: result[1],
        term: result[2].trim(),
      });
    }
    return {
      solutions,
      complete: /No (more )?solution/.test(output),
      raw: output,
    };
  }

  /** `variant unify` — unification modulo `[variant]` equations. */
  async variantUnify(
    problem: string,
    opts: VariantUnifyOptions = {},
  ): Promise<UnifyResult> {
    const filtered = opts.filtered ? "filtered " : "";
    const command = `${filtered}variant unify ${bracket(opts.bound)}${inModule(opts)}${problem} .`;
    const { output, stderr } = await this.exec(command);
    if (!/Unifier|No unifier/.test(output)) {
      throw new MaudeCommandError(
        "variant unify did not parse",
        command,
        output,
        stderr,
      );
    }
    const unifiers = output
      .split(/\n\n+/)
      .filter((block) => /^Unifier #?\d/m.test(block))
      .map(parseBindings);
    return { unifiers, raw: output };
  }

  /**
   * `vu-narrow` — symbolic reachability: which instances of `subject`
   * (a term with variables) can reach `target`. Rules must carry the
   * `[narrowing]` attribute.
   */
  async vuNarrow(
    subject: string,
    target: string,
    opts: NarrowOptions = {},
  ): Promise<NarrowResult> {
    const fold = opts.fold ? "{fold} " : "";
    const bounds =
      opts.bound !== undefined || opts.depth !== undefined
        ? `[${opts.bound ?? ""}${opts.depth !== undefined ? `, ${opts.depth}` : ""}] `
        : "";
    const command = `${fold}vu-narrow ${bounds}${inModule(opts)}${subject} ${opts.arrow ?? "=>*"} ${target} .`;
    const { output, stderr } = await this.exec(command);
    if (!/Solution|No solution/.test(output)) {
      throw new MaudeCommandError(
        "vu-narrow did not parse",
        command,
        output,
        stderr,
      );
    }
    const solutions: NarrowSolution[] = [];
    for (const block of output.split(/\n\n+/)) {
      const header = /^Solution (\d+)/.exec(block);
      const state = /^state: (.*)$/m.exec(block);
      if (!header || !state) continue;
      // Bindings after "variant unifier:" belong to internal unifiers,
      // not the accumulated substitution.
      const accumulated = block.split(/^variant unifier:/m)[0];
      solutions.push({
        index: Number(header[1]),
        state: state[1].trim(),
        substitution: parseBindings(accumulated),
      });
    }
    return {
      solutions,
      complete: /No (more )?solution/.test(output),
      raw: output,
    };
  }

  /** `show` — introspection, e.g. show("module"), show("sorts"). */
  async show(what: string): Promise<string> {
    const { output } = await this.exec(`show ${what} .`);
    return output;
  }

  private async runResultCommand(command: string): Promise<ReduceResult> {
    const { output, stderr } = await this.exec(command);
    const m = /^result ([^\n:]+): (.*)$/ms.exec(output);
    if (!m) {
      throw new MaudeCommandError("no result", command, output, stderr);
    }
    return {
      sort: m[1],
      term: m[2].trim(),
      stats: parseStats(output),
      raw: output,
    };
  }
}

function inModule(opts: CommandOptions): string {
  return opts.module ? `in ${opts.module} : ` : "";
}

function bracket(bound: number | undefined): string {
  return bound !== undefined ? `[${bound}] ` : "";
}

function parseBindings(block: string): Substitution {
  const bindings: Substitution = {};
  for (const m of block.matchAll(/^(\S+) --> (.*)$/gm)) {
    bindings[m[1]] = m[2];
  }
  return bindings;
}

function parseStats(output: string): RunStats | null {
  const m = /rewrites: (\d+) in (\d+)ms cpu \((\d+)ms real\)/.exec(output);
  if (!m) return null;
  return { rewrites: Number(m[1]), cpuMs: Number(m[2]), realMs: Number(m[3]) };
}

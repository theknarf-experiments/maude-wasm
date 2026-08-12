import createMaudeModule, { type MaudeModule } from "@maude-wasm/core";

export interface MaudeResult {
  /** Everything Maude printed to stdout. */
  stdout: string;
  /** Everything Maude printed to stderr (warnings, advisories). */
  stderr: string;
  /** Process exit code (0 on success). */
  exitCode: number;
}

export interface MaudeOptions {
  /**
   * Extra files to place in the virtual filesystem before running,
   * e.g. modules that the input `load`s. Keys are absolute paths.
   */
  files?: Record<string, string>;
  /**
   * Override where the .wasm binary is loaded from (useful with bundlers).
   * Receives the filename ("maude.wasm") and should return a URL/path.
   */
  locateFile?: (file: string) => string;
  /**
   * Called for every output line as it is produced, before the run
   * completes — useful for progress display on long searches.
   */
  onOutput?: (line: string, stream: "out" | "err") => void;
}

const INPUT_PATH = "/input.maude";

/**
 * Run a batch of Maude commands/modules and return the captured output.
 *
 * Each call creates a fresh Maude instance (the prelude is embedded in the
 * wasm binary), so runs are fully isolated from each other.
 *
 * ```ts
 * const { stdout } = await runMaude("reduce in NAT : 1 + 2 .");
 * ```
 */
export async function runMaude(
  input: string,
  options: MaudeOptions = {},
): Promise<MaudeResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const module = await createMaudeModule({
    noInitialRun: true,
    print: (line: string) => {
      stdout.push(line);
      options.onOutput?.(line, "out");
    },
    printErr: (line: string) => {
      stderr.push(line);
      options.onOutput?.(line, "err");
    },
    locateFile: options.locateFile,
    preRun: [
      (mod: MaudeModule) => {
        // MAUDE_LIB tells Maude where to find prelude.maude, which the
        // core build embeds at the virtual filesystem root.
        mod.ENV.MAUDE_LIB = "/";
        for (const [path, contents] of Object.entries(options.files ?? {})) {
          mod.FS.writeFile(path, contents);
        }
        mod.FS.writeFile(INPUT_PATH, ensureQuit(input));
      },
    ],
  });

  let exitCode = 0;
  try {
    exitCode = module.callMain([
      "-no-banner",
      "-no-wrap",
      "-no-ansi-color",
      "-batch",
      INPUT_PATH,
    ]);
  } catch (err) {
    // Emscripten throws ExitStatus when main() calls exit(); anything else
    // is a real failure.
    if (err && typeof err === "object" && "status" in err) {
      exitCode = (err as { status: number }).status;
    } else {
      throw err;
    }
  }

  return {
    stdout: stdout.join("\n"),
    stderr: stderr.join("\n"),
    exitCode,
  };
}

function ensureQuit(input: string): string {
  const trimmed = input.trimEnd();
  return trimmed.endsWith("quit .") || trimmed.endsWith("quit")
    ? `${trimmed}\n`
    : `${trimmed}\nquit .\n`;
}

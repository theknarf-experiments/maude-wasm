import {
  type ExecResult,
  MaudeCommands,
  SENTINEL_OUTPUT,
  sentinelCommand,
} from "./commands.js";

export interface WorkerSessionOptions {
  /**
   * Explicit URL for maude.wasm, for bundlers (e.g. Vite's
   * `import wasmUrl from "@maude-wasm/core/maude.wasm?url"`).
   */
  wasmUrl?: string;
  /**
   * Module the output-delimiter command runs in (default `NAT`).
   * Maude clears a module's memo tables when a command runs in a
   * different module, so sessions that rely on `[memo]` operators
   * should set this to their working module (which must import NAT).
   */
  sentinelModule?: string;
}

interface WorkerLike {
  postMessage(msg: unknown): void;
  terminate(): void;
}

type WorkerMessage =
  | { type: "ready" }
  | { type: "line"; stream: "out" | "err"; line: string }
  | { type: "exit"; code: number }
  | { type: "error"; message: string };

const DATA_CAPACITY = 1 << 16;

/**
 * A structured Maude session backed by one persistent interpreter in a
 * worker thread. Unlike `Maude` (which replays all definitions per
 * query), commands run incrementally against live interpreter state, so
 * large sessions stay fast.
 *
 * Requires `SharedArrayBuffer`: always available in Node; in browsers
 * only on cross-origin-isolated pages (COOP/COEP headers).
 *
 * ```ts
 * const s = await MaudeWorkerSession.create();
 * await s.load("mod VENDING is ... endm");
 * await s.search("$ q q q", "M:Marking", { arrow: "=>!" });
 * s.close();
 * ```
 */
export class MaudeWorkerSession extends MaudeCommands {
  private queue: Promise<unknown> = Promise.resolve();
  private collector: ((msg: WorkerMessage) => void) | null = null;
  private exited = false;

  private constructor(
    private readonly worker: WorkerLike,
    private readonly ctrl: Int32Array,
    private readonly data: Uint8Array,
    private readonly sentinelCmd: string,
  ) {
    super();
  }

  static async create(
    options: WorkerSessionOptions = {},
  ): Promise<MaudeWorkerSession> {
    if (typeof SharedArrayBuffer === "undefined") {
      throw new Error(
        "MaudeWorkerSession needs SharedArrayBuffer (in browsers this requires a cross-origin-isolated page); use the Maude class instead",
      );
    }
    const sab = new SharedArrayBuffer(8 + DATA_CAPACITY);
    const workerUrl = new URL("./session-worker.js", import.meta.url);

    let worker: WorkerLike;
    let onMessage: (handler: (msg: WorkerMessage) => void) => void;
    let onError: (handler: (err: Error) => void) => void;
    if (typeof Worker !== "undefined") {
      const w = new Worker(workerUrl, { type: "module" });
      worker = w;
      onMessage = (handler) => (w.onmessage = (e) => handler(e.data));
      onError = (handler) =>
        (w.onerror = (e) => handler(new Error(e.message ?? "worker error")));
    } else {
      const { Worker: NodeWorker } = await import(
        /* @vite-ignore */ "node:worker_threads"
      );
      const w = new NodeWorker(workerUrl);
      w.unref();
      worker = {
        postMessage: (msg) => w.postMessage(msg),
        terminate: () => void w.terminate(),
      };
      onMessage = (handler) => w.on("message", handler);
      onError = (handler) => w.on("error", handler);
    }

    const session = new MaudeWorkerSession(
      worker,
      new Int32Array(sab, 0, 2),
      new Uint8Array(sab, 8),
      sentinelCommand(options.sentinelModule ?? "NAT"),
    );
    const ready = new Promise<void>((resolve, reject) => {
      onMessage((msg) => {
        if (msg.type === "ready") resolve();
        else if (msg.type === "error") reject(new Error(msg.message));
        else if (msg.type === "exit") session.exited = true;
        session.collector?.(msg);
      });
      onError((err) => {
        session.exited = true;
        reject(err);
        session.collector?.({ type: "error", message: String(err) });
      });
    });
    worker.postMessage({ type: "init", sab, wasmUrl: options.wasmUrl });
    await ready;
    return session;
  }

  /** Run one raw command against the live interpreter. */
  exec(command: string): Promise<ExecResult> {
    const run = this.queue.then(() => this.execNow(command));
    this.queue = run.catch(() => {});
    return run;
  }

  /** Terminate the interpreter. The session is unusable afterwards. */
  close(): void {
    this.exited = true;
    this.worker.terminate();
  }

  private async execNow(command: string): Promise<ExecResult> {
    if (this.exited) throw new Error("session is closed");
    const stdout: string[] = [];
    const stderr: string[] = [];

    const done = new Promise<void>((resolve, reject) => {
      this.collector = (msg) => {
        if (msg.type === "line") {
          if (msg.stream === "err") {
            stderr.push(msg.line);
            return;
          }
          // The REPL prompt is written without a newline, so it prefixes
          // the next printed line.
          const line = msg.line.replace(/^(Maude> )+/, "");
          if (line.trim() === SENTINEL_OUTPUT) resolve();
          else if (line.trim() === this.sentinelCmd)
            return; // echo of the sentinel
          else stdout.push(line);
        } else if (msg.type === "exit") {
          reject(new Error(`Maude exited with code ${msg.code}`));
        } else if (msg.type === "error") {
          reject(new Error(msg.message));
        }
      };
    });

    const input =
      (this.currentModule ? `select ${this.currentModule} .\n` : "") +
      command +
      "\n" +
      this.sentinelCmd +
      "\n";
    await this.write(input);
    try {
      await done;
    } finally {
      this.collector = null;
    }
    return { output: stdout.join("\n").trim(), stderr: stderr.join("\n") };
  }

  private async write(text: string): Promise<void> {
    const bytes = new TextEncoder().encode(text);
    for (let offset = 0; offset < bytes.length; offset += DATA_CAPACITY) {
      const chunk = bytes.subarray(offset, offset + DATA_CAPACITY);
      // Wait until the worker has consumed the previous chunk. The
      // worker resets state to 0 and notifies when it drains the buffer.
      while (Atomics.load(this.ctrl, 0) === 1) {
        const wait = Atomics.waitAsync?.(this.ctrl, 0, 1, 50);
        if (wait?.async) await wait.value;
        else await new Promise((r) => setTimeout(r, 1));
      }
      this.data.set(chunk);
      Atomics.store(this.ctrl, 1, chunk.length);
      Atomics.store(this.ctrl, 0, 1);
      Atomics.notify(this.ctrl, 0);
    }
  }
}

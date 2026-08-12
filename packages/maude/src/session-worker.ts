// Worker entry for MaudeWorkerSession: runs one long-lived Maude
// interpreter whose stdin blocks on a SharedArrayBuffer until the main
// thread supplies more input. Works both as a Web Worker (module type)
// and as a Node worker_threads worker.
//
// fd 0 must stay a TTY (not a custom device): Maude's flex lexer only
// reads character-by-character — instead of block-filling its buffer,
// which would deadlock against a blocking stdin — when isatty(0) holds.
// So we patch the TTY's get_char rather than passing Module.stdin.
import createMaudeModule from "@maude-wasm/core";

interface InitMessage {
  type: "init";
  sab: SharedArrayBuffer;
  wasmUrl?: string;
}

const isWebWorker =
  typeof self !== "undefined" &&
  typeof (self as { postMessage?: unknown }).postMessage === "function";

async function channel(): Promise<{
  post: (msg: unknown) => void;
  onMessage: (handler: (msg: InitMessage) => void) => void;
}> {
  if (isWebWorker) {
    return {
      post: (msg) => (self as unknown as Worker).postMessage(msg),
      onMessage: (handler) =>
        ((self as unknown as Worker).onmessage = (e: MessageEvent) =>
          handler(e.data as InitMessage)),
    };
  }
  const { parentPort } = await import(/* @vite-ignore */ "node:worker_threads");
  if (!parentPort) throw new Error("no parentPort");
  return {
    post: (msg) => parentPort.postMessage(msg),
    onMessage: (handler) => parentPort.on("message", handler),
  };
}

const { post, onMessage } = await channel();

onMessage((msg) => {
  if (msg.type === "init") void start(msg);
});

async function start(init: InitMessage): Promise<void> {
  const wasmUrl = init.wasmUrl;
  // Layout: ctrl[0] = state (0 empty, 1 data ready), ctrl[1] = length,
  // followed by the utf-8 payload bytes.
  const ctrl = new Int32Array(init.sab, 0, 2);
  const data = new Uint8Array(init.sab, 8);

  let buffer: Uint8Array = new Uint8Array(0);
  let position = 0;
  let mayBlock = true;

  const getChar = (): number | undefined => {
    if (position < buffer.length) return buffer[position++];
    if (!mayBlock) {
      // End the current read() with a short read; the next call (a new
      // read) is allowed to block again.
      mayBlock = true;
      return undefined;
    }
    // Block this worker thread until the main thread writes input.
    Atomics.wait(ctrl, 0, 0);
    const length = Atomics.load(ctrl, 1);
    buffer = data.slice(0, length);
    position = 0;
    Atomics.store(ctrl, 0, 0);
    Atomics.notify(ctrl, 0);
    mayBlock = false;
    return buffer[position++];
  };

  try {
    const module = await createMaudeModule({
      noInitialRun: true,
      print: (line: string) => post({ type: "line", stream: "out", line }),
      printErr: (line: string) => post({ type: "line", stream: "err", line }),
      locateFile: wasmUrl
        ? (file: string) => (file.endsWith(".wasm") ? wasmUrl : file)
        : undefined,
      preRun: [
        (mod: { ENV: Record<string, string> }) => {
          mod.ENV.MAUDE_LIB = "/";
        },
      ],
    });
    const stdinStream = (
      module.FS as unknown as {
        streams: Array<{ tty?: { ops: Record<string, unknown> } }>;
      }
    ).streams[0];
    if (!stdinStream?.tty) throw new Error("fd 0 is not a tty");
    stdinStream.tty.ops = {
      ...stdinStream.tty.ops,
      get_char: () => getChar(),
    };
    post({ type: "ready" });
    const code = module.callMain([
      "-no-banner",
      "-no-wrap",
      "-no-ansi-color",
      "-batch",
    ]);
    post({ type: "exit", code });
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      post({ type: "exit", code: (err as { status: number }).status });
    } else {
      post({ type: "error", message: String(err) });
    }
  }
}

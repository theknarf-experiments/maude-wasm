/// <reference lib="webworker" />
import { Maude, runMaude, type MaudeOptions } from "maude-wasm";
import wasmUrl from "@maude-wasm/core/maude.wasm?url";
import type { Op, WorkerRequest, WorkerResponse } from "./protocol";

const options: MaudeOptions = {
  locateFile: (file) => (file.endsWith(".wasm") ? wasmUrl : file),
};

async function runOp(m: Maude, op: Op): Promise<unknown> {
  switch (op.method) {
    case "reduce":
      return m.reduce(op.term, { module: op.module });
    case "parse":
      return m.parse(op.term, { module: op.module });
    case "rewrite":
      return m.rewrite(op.term, { module: op.module, bound: op.bound });
    case "frewrite":
      return m.frewrite(op.term, { module: op.module, bound: op.bound });
    case "search":
      return m.search(op.subject, op.pattern, {
        module: op.module,
        arrow: op.arrow,
        bound: op.bound,
        depth: op.depth,
        suchThat: op.suchThat,
      });
    case "match":
      return m.match(op.pattern, op.subject, {
        module: op.module,
        extension: op.extension,
      });
    case "unify":
      return m.unify(op.problem, { module: op.module });
    case "variants":
      return m.variants(op.term, { module: op.module });
    case "modelCheck":
      return m.modelCheck(op.initial, op.formula, { module: op.module });
    case "show":
      return m.show(op.what);
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    let result: unknown;
    if (req.kind === "raw") {
      result = await runMaude(req.code, options);
    } else {
      const m = new Maude(options);
      if (req.setup.trim()) await m.load(req.setup);
      result = await runOp(m, req.op);
    }
    self.postMessage({ id: req.id, result } satisfies WorkerResponse);
  } catch (err) {
    self.postMessage({
      id: req.id,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse);
  }
};

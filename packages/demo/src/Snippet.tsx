import { javascript } from "@codemirror/lang-javascript";
import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import type { MaudeResult } from "maude-wasm";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { maudeLanguage } from "./maude-language";
import type { Op } from "./protocol";
import { CancelledError, type useMaude } from "./useMaude";
import { wlLanguage } from "./wl-language";

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

export type Runner = ReturnType<typeof useMaude>;

/** Provides the shared worker-backed runner to snippets inside MDX. */
export const MaudeContext = createContext<Runner | null>(null);

function useRunner(): Runner {
  const runner = useContext(MaudeContext);
  if (!runner) throw new Error("MaudeContext missing");
  return runner;
}

/** An editable, runnable Maude snippet with its own output pane. */
export function Snippet({ code }: { code: string }) {
  const maude = useRunner();
  const [value, setValue] = useState(code);
  const [result, setResult] = useState<MaudeResult | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const valueRef = useRef(value);
  valueRef.current = value;

  const run = useCallback(async () => {
    const start = performance.now();
    try {
      const res = await maude.call<MaudeResult>({
        kind: "raw",
        code: valueRef.current,
      });
      setResult(res);
      setElapsed(performance.now() - start);
    } catch (err) {
      if (err instanceof CancelledError) return;
      setResult({ stdout: "", stderr: String(err), exitCode: -1 });
      setElapsed(null);
    }
  }, [maude]);

  const runKeymap = Prec.highest(
    keymap.of([
      {
        key: "Mod-Enter",
        run: () => {
          void run();
          return true;
        },
      },
    ]),
  );

  return (
    <div className="snippet">
      <CodeMirror
        className="editor snippet-editor"
        value={value}
        onChange={setValue}
        extensions={[maudeLanguage, runKeymap]}
        theme={prefersDark ? "dark" : "light"}
        basicSetup={{ foldGutter: false, lineNumbers: true }}
      />
      <div className="snippet-bar">
        <button type="button" onClick={run} disabled={maude.running}>
          {maude.running ? "Running…" : "Run ▶"}
        </button>
        {maude.running && (
          <button type="button" className="cancel" onClick={maude.cancel}>
            Cancel
          </button>
        )}
        {elapsed !== null && !maude.running && (
          <span className="elapsed">{elapsed.toFixed(0)} ms</span>
        )}
      </div>
      {result !== null && (
        <div className="snippet-output">
          {result.stdout && <pre>{stripBye(result.stdout)}</pre>}
          {result.stderr && <pre className="stderr">{result.stderr}</pre>}
        </div>
      )}
    </div>
  );
}

function stripBye(stdout: string): string {
  return stdout.replace(/\nBye\.\s*$/, "").replace(/^Bye\.\s*$/, "");
}

/** An editable Wolfram-notation cell evaluated by the WL/M engine. */
export function WlSnippet({ code }: { code: string }) {
  const maude = useRunner();
  const [value, setValue] = useState(code);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const valueRef = useRef(value);
  valueRef.current = value;

  const run = useCallback(async () => {
    try {
      setError(null);
      const res = await maude.call<{ output: string }>({
        kind: "wolfram",
        source: valueRef.current,
      });
      setOutput(res.output);
    } catch (err) {
      if (err instanceof CancelledError) return;
      setOutput(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [maude]);

  const runKeymap = Prec.highest(
    keymap.of([
      {
        key: "Mod-Enter",
        run: () => {
          void run();
          return true;
        },
      },
    ]),
  );

  return (
    <div className="snippet">
      <CodeMirror
        className="editor snippet-editor"
        value={value}
        onChange={setValue}
        extensions={[wlLanguage, runKeymap]}
        theme={prefersDark ? "dark" : "light"}
        basicSetup={{ foldGutter: false, lineNumbers: true }}
      />
      <div className="snippet-bar">
        <button type="button" onClick={run} disabled={maude.running}>
          {maude.running ? "Running…" : "Run ▶"}
        </button>
        {maude.running && (
          <button type="button" className="cancel" onClick={maude.cancel}>
            Cancel
          </button>
        )}
      </div>
      {output !== null && (
        <div className="snippet-output">
          <pre>{output}</pre>
        </div>
      )}
      {error !== null && (
        <div className="snippet-output">
          <pre className="stderr">{error}</pre>
        </div>
      )}
    </div>
  );
}

/** A read-only, syntax-highlighted TypeScript listing. */
export function TsListing({
  code,
  attached,
}: {
  code: string;
  attached?: boolean;
}) {
  return (
    <CodeMirror
      className={`editor listing-editor${attached ? " attached" : ""}`}
      value={code}
      editable={false}
      basicSetup={{
        foldGutter: false,
        lineNumbers: true,
        highlightActiveLine: false,
      }}
      extensions={[javascript({ typescript: true })]}
      theme={prefersDark ? "dark" : "light"}
    />
  );
}

/**
 * A live TypeScript listing: Run sends the operation through the
 * structured Maude API in the worker and shows the parsed object that
 * the library call actually returns.
 */
export function ApiSnippet({
  listing,
  setup,
  op,
}: {
  listing: string;
  setup: string;
  op: Op;
}) {
  const maude = useRunner();
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    try {
      setError(null);
      const res = await maude.call<Record<string, unknown>>({
        kind: "capability",
        setup,
        op,
      });
      // The `raw` field (Maude's full textual output) is noise here —
      // the point is the structured data.
      const { raw: _raw, ...structured } = res;
      setResult(structured);
    } catch (err) {
      if (err instanceof CancelledError) return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [maude, setup, op]);

  return (
    <div className="snippet">
      <TsListing code={listing} attached />
      <div className="snippet-bar">
        <button type="button" onClick={run} disabled={maude.running}>
          {maude.running ? "Running…" : "Run ▶"}
        </button>
        {maude.running && (
          <button type="button" className="cancel" onClick={maude.cancel}>
            Cancel
          </button>
        )}
        <span className="elapsed">returns…</span>
      </div>
      {error !== null && (
        <div className="snippet-output">
          <pre className="stderr">{error}</pre>
        </div>
      )}
      {result !== null && (
        <div className="snippet-output">
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useRef, useState } from "react";
import type { Runner } from "./Snippet";
import { CancelledError } from "./useMaude";
import { wlLanguage } from "./wl-language";

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

interface Cell {
  input: string;
  output: string | null;
  error: string | null;
}

const INITIAL: Cell[] = [
  {
    input:
      "fib[0] = 0; fib[1] = 1;\nfib[n_] := fib[n] = fib[n - 1] + fib[n - 2];\nfib[30]",
    output: null,
    error: null,
  },
];

/**
 * A notebook over WL/M: cells share one session by replaying every cell
 * up to the evaluated one in a fresh interpreter (the wasm engine is
 * single-shot; replay keeps cells consistent after edits).
 */
export function WolframNotebook({ maude }: { maude: Runner }) {
  const [cells, setCells] = useState<Cell[]>(INITIAL);
  const cellsRef = useRef(cells);
  cellsRef.current = cells;

  const evaluate = useCallback(
    async (index: number) => {
      const current = cellsRef.current;
      const source = current
        .slice(0, index + 1)
        .map((c) => c.input.trim().replace(/;+\s*$/, ""))
        .filter((text) => text.length > 0)
        .join(";\n");
      if (!source) return;
      try {
        const { output } = await maude.call<{ output: string }>({
          kind: "wolfram",
          source,
        });
        setCells((cs) =>
          cs.map((c, i) => (i === index ? { ...c, output, error: null } : c)),
        );
      } catch (err) {
        if (err instanceof CancelledError) return;
        const message = err instanceof Error ? err.message : String(err);
        setCells((cs) =>
          cs.map((c, i) =>
            i === index ? { ...c, output: null, error: message } : c,
          ),
        );
      }
    },
    [maude],
  );

  return (
    <div className="notebook">
      <h2>Wolfram notebook</h2>
      <p className="blurb">
        A{" "}
        <a href="https://github.com/theknarf-experiments/maude-wasm/blob/main/docs/wolfram-on-maude.md">
          Wolfram-Language core implemented on Maude
        </a>
        , running in your browser. Cells share definitions (each evaluation
        replays the cells above it). Shift-Enter evaluates.
      </p>
      {cells.map((cell, i) => (
        <div
          className="cell"
          key={`cell-${i /* index identity: cells are positional */}`}
        >
          <div className="cell-label">In[{i + 1}]:=</div>
          <div className="cell-body">
            <CodeMirror
              className="editor snippet-editor"
              value={cell.input}
              onChange={(value) =>
                setCells((cs) =>
                  cs.map((c, j) => (j === i ? { ...c, input: value } : c)),
                )
              }
              extensions={[
                wlLanguage,
                Prec.highest(
                  keymap.of([
                    {
                      key: "Shift-Enter",
                      run: () => {
                        void evaluate(i);
                        return true;
                      },
                    },
                  ]),
                ),
              ]}
              theme={prefersDark ? "dark" : "light"}
              basicSetup={{ foldGutter: false, lineNumbers: false }}
            />
            <div className="snippet-bar">
              <button
                type="button"
                onClick={() => evaluate(i)}
                disabled={maude.running}
              >
                {maude.running ? "Running…" : "Run ▶"}
              </button>
              {maude.running && (
                <button type="button" className="cancel" onClick={maude.cancel}>
                  Cancel
                </button>
              )}
            </div>
            {cell.output !== null && (
              <div className="snippet-output">
                <div className="cell-label out">Out[{i + 1}]=</div>
                <pre>{cell.output}</pre>
              </div>
            )}
            {cell.error !== null && (
              <div className="snippet-output">
                <pre className="stderr">{cell.error}</pre>
              </div>
            )}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="add-cell"
        onClick={() =>
          setCells((cs) => [...cs, { input: "", output: null, error: null }])
        }
      >
        + Add cell
      </button>
    </div>
  );
}

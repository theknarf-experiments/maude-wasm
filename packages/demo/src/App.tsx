import {
  isValidElement,
  useCallback,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import type { MaudeResult } from "maude-wasm";
import type { MDXComponents } from "mdx/types";
import CodeMirror from "@uiw/react-codemirror";
import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { Link, Navigate, NavLink, Route, Routes, useParams } from "react-router";
import { chapters } from "./chapters";
import { examples } from "./examples";
import { maudeLanguage } from "./maude-language";
import { MaudeContext, Snippet, TsListing, type Runner } from "./Snippet";
import { CancelledError, useMaude } from "./useMaude";

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

const GithubMark = () => (
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden focusable="false">
    <path
      fill="currentColor"
      d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"
    />
  </svg>
);

export default function App() {
  const maude = useMaude();

  return (
    <MaudeContext.Provider value={maude}>
      <div className="layout">
      <aside className="sidebar">
        <h1>
          Maude <span className="accent">tutorial</span>
        </h1>
        <p className="tagline">
          Learn the{" "}
          <a href="https://maude.cs.illinois.edu/">Maude term rewriting system</a>{" "}
          with live examples — every snippet runs a real Maude interpreter,
          compiled to WebAssembly, right in your tab.
        </p>
        <nav>
          {chapters.map((ch, i) => (
            <NavLink key={ch.id} to={i === 0 ? "/" : `/${ch.id}`} end={i === 0}>
              <span className="chapter-no">{i + 1}.</span> {ch.title}
            </NavLink>
          ))}
          <NavLink to="/playground" className="playground-link">
            <span className="chapter-no" /> Playground
          </NavLink>
        </nav>
        {/* Set at build time (e.g. by the Pages workflow), so the deployed
            site links back to its source. Absent locally. */}
        {import.meta.env.VITE_REPO_URL && (
          <a
            className="repo-link"
            href={import.meta.env.VITE_REPO_URL}
            target="_blank"
            rel="noreferrer"
            title="Source on GitHub"
          >
            <GithubMark />
            GitHub
          </a>
        )}
      </aside>

        <main>
          <Routes>
            <Route path="/" element={<ChapterPage index={0} />} />
            <Route path="/playground" element={<Playground maude={maude} />} />
            <Route path="/:id" element={<ChapterRoute />} />
          </Routes>
        </main>
      </div>
    </MaudeContext.Provider>
  );
}

function ChapterRoute() {
  const { id } = useParams();
  const index = chapters.findIndex((ch) => ch.id === id);
  if (index === -1) return <Navigate to="/" replace />;
  return <ChapterPage index={index} />;
}

/**
 * Maps MDX fenced code blocks to components: ```maude becomes a runnable
 * snippet, other languages a read-only highlighted listing.
 */
const mdxComponents: MDXComponents = {
  pre: (props: { children?: ReactNode }) => {
    const child = props.children;
    if (isValidElement(child)) {
      const { className = "", children } = (
        child as ReactElement<{ className?: string; children?: ReactNode }>
      ).props;
      const code = typeof children === "string" ? children.trimEnd() : "";
      if (className.includes("language-maude")) {
        return <Snippet code={code} />;
      }
      return <TsListing code={code} />;
    }
    return <pre>{props.children}</pre>;
  },
};

function ChapterPage({ index }: { index: number }) {
  const chapter = chapters[index];
  const prev = index > 0 ? chapters[index - 1] : null;
  const next = index < chapters.length - 1 ? chapters[index + 1] : null;

  return (
    <article key={chapter.id} className="chapter">
      <p className="chapter-count">
        Chapter {index + 1} of {chapters.length}
      </p>
      <h2>{chapter.title}</h2>
      <chapter.Component components={mdxComponents} />
      <nav className="pager">
        {prev ? (
          <Link to={index - 1 === 0 ? "/" : `/${prev.id}`}>← {prev.title}</Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={`/${next.id}`}>{next.title} →</Link>
        ) : (
          <Link to="/playground">Playground →</Link>
        )}
      </nav>
    </article>
  );
}

function Playground({ maude }: { maude: Runner }) {
  const [code, setCode] = useState(examples[0].code);
  const [result, setResult] = useState<MaudeResult | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const codeRef = useRef(code);
  codeRef.current = code;

  const run = useCallback(async () => {
    const start = performance.now();
    try {
      const res = await maude.call<MaudeResult>({
        kind: "raw",
        code: codeRef.current,
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
    <div className="playground">
      <h2>Playground</h2>
      <div className="toolbar">
        <label>
          Example{" "}
          <select
            onChange={(e) => {
              const ex = examples.find((x) => x.name === e.target.value);
              if (ex) {
                setCode(ex.code);
                setResult(null);
                setElapsed(null);
              }
            }}
          >
            {examples.map((ex) => (
              <option key={ex.name}>{ex.name}</option>
            ))}
          </select>
        </label>
        <button onClick={run} disabled={maude.running}>
          {maude.running ? "Running…" : "Run ▶"}
        </button>
        {maude.running && (
          <button className="cancel" onClick={maude.cancel}>
            Cancel
          </button>
        )}
        {elapsed !== null && !maude.running && (
          <span className="elapsed">{elapsed.toFixed(0)} ms</span>
        )}
      </div>

      <div className="panes">
        <CodeMirror
          className="editor"
          value={code}
          onChange={setCode}
          extensions={[maudeLanguage, runKeymap]}
          theme={prefersDark ? "dark" : "light"}
          basicSetup={{ foldGutter: false }}
        />
        <div className="output">
          {result === null ? (
            <span className="placeholder">
              Press Run (or ⌘⏎) to rewrite some terms.
            </span>
          ) : (
            <>
              {result.stdout && <pre>{result.stdout}</pre>}
              {result.stderr && <pre className="stderr">{result.stderr}</pre>}
              {result.exitCode !== 0 && (
                <pre className="stderr">exit code {result.exitCode}</pre>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

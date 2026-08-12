# maude-wasm

[Maude](https://maude.cs.illinois.edu/) (the term rewriting system) compiled
to WebAssembly, with a TypeScript wrapper for Node and the browser.

## Layout

- `packages/core` — cross-compiles Maude 3.5 (+ GMP, BuDDy) with
  Emscripten into an ES module with the prelude embedded.
- `packages/maude` — TypeScript wrapper: raw `runMaude` plus a
  structured `Maude` session API.
- `packages/demo` — interactive Maude tutorial (Vite + React, MDX
  chapters with runnable snippets, executed in a Web Worker).

## Setup

```sh
mise install   # pinned toolchain: node, pnpm, emsdk, cmake
pnpm install
```

## Develop

```sh
pnpm dev   # mprocs: demo dev server (localhost:5173) + wrapper tsc --watch
```

## Build & test

```sh
pnpm build
pnpm test
```

The first build compiles GMP, BuDDy, and Maude from source and takes a
while; afterwards the wasm step is skipped
(`pnpm --filter @maude-wasm/core rebuild-wasm` forces it). See
`packages/core/scripts/build.sh` for the porting details.

## Usage

```ts
import { runMaude, Maude } from "maude-wasm";

const { stdout } = await runMaude("reduce in NAT : 1 + 2 .");

const m = new Maude();
await m.load(`mod VENDING is ... endm`);
await m.search("$ q q q", "apple cake M:Marking", { arrow: "=>!" });
// { solutions: [{ state: 4, substitution: { "M:Marking": "null" } }], complete: true }
```

The `Maude` class also provides `reduce`, `rewrite`, `frewrite`,
`erewrite`, `srewrite`, `match`, `unify`, `variantUnify`, `variants`,
`vuNarrow`, `modelCheck`, `parse`, `show`, and a raw `exec` escape
hatch — answers are parsed into data. `MaudeWorkerSession` offers the
same API against one persistent interpreter (fast for long sessions;
needs `SharedArrayBuffer`). In the browser, run Maude in a Web Worker
and pass `locateFile` for the wasm URL (see `packages/demo` for the
pattern, including cancellation).

Not available in the wasm build: SMT, external objects (sockets,
processes), and the interactive debugger.

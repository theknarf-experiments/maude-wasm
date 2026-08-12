# WL/M: A Wolfram-Language core on Maude — implementation plan

Goal: a principled, faithful-in-spirit implementation of the Wolfram
Language *core* (evaluator, pattern language, attributes, scoping, basic
standard library) as a Maude meta-interpreter, running on this repo's
wasm stack, with a notebook-style browser frontend. Explicit non-goals:
bug-for-bug Mathematica compatibility, CAS parity (`Integrate`, `Solve`,
`NDSolve`), the notebook document format.

Guiding facts (see git history / tutorial for evidence):

- WL *is* a term rewriting language; Maude's ACU matching already
  implements the hardest part of a WL kernel (`Flat`/`Orderless`
  matching, sequence patterns via associative argument lists).
- WL's runtime-mutable global rulebase maps to a **meta-module term**
  manipulated through `META-LEVEL` — the Full Maude technique.
- Writing the evaluator as an explicit meta-interpreter (not raw
  `reduce`) is what makes `Hold*`, definition ordering, `Sequence`
  splicing, and scoping controllable.

Package layout (this monorepo):

```
packages/wolfram-core    Maude sources (.maude files) for the interpreter
packages/wolfram         TypeScript wrapper: parser + session API
packages/demo            gains a /wolfram notebook page
```

Estimated effort: Phases 0–2 ≈ 2–3 months to a convincing prototype;
Phases 3–6 ≈ a person-year to "genuinely usable".

---

## Phase 0 — Proof of concept (de-risk the core loop) — **DONE**

Implemented in `packages/wolfram-core/src/wl.maude` with 9 TypeScript
end-to-end tests (`packages/wolfram-core/test/wl.test.ts`).

The smallest end-to-end slice: `f[x_] := x + 1; f[2]` evaluates to `3`
through the wasm stack. Everything here is throwaway-allowed.

- [x] **0.1 Expression representation.** One Maude module `WL-SYNTAX`:
      sort `Expr`; atoms (integers via `INT`, symbols via `Qid`, strings
      via `STRING`); application `_[_]` of an `Expr` head to an argument
      list; `ArgList` as an assoc-with-identity constructor (`,` with
      `noArgs` id). Decide kind story (single sort vs. `[Expr]` for
      errors). Acceptance: `parse` shows `'Plus['x, 1]`-style terms
      round-tripping.
- [x] **0.2 Rulebase as data.** Represent the global state as a term:
      `state(defs, attrs)` where `defs` is a list of
      `def(lhs-pattern, rhs, kind)` (kind: own/down/up-value) and
      `attrs` maps symbols to attribute sets. No meta-modules yet —
      patterns interpreted by our own matcher-driver (0.3).
- [x] **0.3 Matching via the metalevel.** Translate WL patterns to Maude
      meta-patterns: `Blank[]` → fresh `Expr` variable, typed blanks →
      sort/head test, `BlankSequence`/`BlankNullSequence` → `ArgList`
      variables (assoc matching gives the sequence semantics).
      Implement `wlMatch(subject, pattern) : MaybeSubst` with
      `metaMatch` against a synthesized meta-module. Acceptance: unit
      tests for `f[x_]`, `f[x_, y__]`, `f[___, 3, ___]`.
- [x] **0.4 Evaluator loop.** `eval(state, expr)`: evaluate head, then
      args (left-to-right), then try up-values, down-values, built-ins,
      repeat until fixed point with an iteration limit. Plain recursive
      equations; no attributes yet.
- [x] **0.5 `Set`/`SetDelayed`/`Clear`.** Definitions extend `defs`;
      `Set` evaluates the RHS at definition time, `SetDelayed` doesn't.
      Memoization idiom (`f[n_] := f[n] = ...`) must work.
- [x] **0.6 Ten builtins.** `Plus`, `Times`, `Power` (integer cases),
      `List`, `If`, `Equal`, `Less`, `Head`, `Length`, `ReplaceAll`.
      Numeric folding over `INT`/`RAT`.
- [x] **0.7 Wire into the wasm stack.** A `wolfram.maude` loadable by the
      existing `Maude`/`MaudeWorkerSession` classes; a TS smoke test
      running fibonacci-with-memoization end-to-end. Acceptance:
      `fib[30]` returns in interactive time.
- [x] **0.8 Write-up.** Document what leaked (evaluation-order
      surprises, metalevel overhead measurements) before Phase 1
      commits to the architecture.

### Phase 0 write-up (task 0.8)

What leaked, and the decisions it forced:

- **No pretty core syntax.** `_[_]` and `_,_` *are* META-TERM's syntax;
  declaring them in any module that meets META-LEVEL is an unpatchable
  clash. Core terms are `ap(s('f), 1 :: 2)`; the human-facing syntax is
  the Phase 6 parser's job. (Settles part of ADR-1.)
- **`upTerm` retyping.** In a META-LEVEL-importing module, qid atoms
  metarepresent as `''q.Sort` (`Sort < Qid` there), which is ill-typed
  for `metaMatch` against WL-SYNTAX — both patterns and subjects go
  through a retyping pass (`nm`/`p2m`) first. Cost one debugging hour;
  now structural.
- **The matching-condition idiom.** `Sb := metaMatch(...)` with `Sb` of
  sort `Substitution` fails the condition on `noMatch`, giving
  "first definition that matches, else fall through" with no explicit
  case analysis. The whole dispatcher is three equations.
- **Sequence splicing is free.** Bindings substitute into the
  associative `_::_` argument list, so `x___` splicing needs no code.
- **Measurements** (wasm, Apple Silicon): the full test battery —
  interpreter load, memoized `fib[30]`, naive `fib[15]` (~2000 rule
  applications, >10k `metaMatch` calls) — runs in ~300 ms. The linear
  definition scan is nowhere near being the bottleneck at this scale;
  revisit at 7.3.
- **State threading (ADR-3):** pure `st(defs, fuel)` threading through
  `ev` was clean; no need for configuration-style state yet. Fuel gives
  a crude `$IterationLimit` until 1.7.
- **Confirmed WL quirk:** `expr /. x_ -> rhs` rewrites the *whole*
  expression (outermost) — our implementation agrees with real WL here
  by construction.

## Phase 1 — Faithful evaluator semantics — **mostly done**

Implemented in `wl.maude` (WL-ORDER + attribute-aware WL-EVAL); the
conformance table in `test/wl.test.ts` covers each item below.

- [x] **1.1 Attributes table** with WL names: `Flat`, `Orderless`,
      `OneIdentity`, `HoldAll/HoldFirst/HoldRest`, `Listable`,
      `SequenceHold`, `Protected`. `Attributes[f]`, `SetAttributes`,
      `ClearAttributes`.
- [~] **1.2 Flat/Orderless.** *Done:* evaluation-time flattening,
      canonical ordering (our order: rank then structural), Plus/Times
      partial numeric folding over the canonical form, OneIdentity-style
      single-argument collapse as Plus/Times builtin rules. *Pending
      (1.2b):* matching modulo Flat/Orderless axioms via a synthesized
      meta-module with `assoc`/`comm` operators per attributed symbol.
      Original task: When a symbol is
      `Flat`/`Orderless`, synthesize the meta-operator with
      `assoc`/`comm` so Maude's matcher does the work; canonical
      ordering of `Orderless` args on evaluation (define and document
      our canonical order; it will differ from WL's).
- [~] **1.3 Hold semantics.** *Done:* HoldAll/HoldFirst/HoldRest via
      the attribute table, `Hold`/`HoldForm` inert, `Evaluate` override
      in held positions. *Pending:* `Unevaluated` splicing semantics.
      Original task: Skip argument evaluation per `Hold*`;
      implement `Hold`, `HoldForm`, `Unevaluated` (argument splicing
      semantics), `Evaluate` override.
- [x] **1.4 `Sequence` splicing** into argument lists (and its
      interaction with `SequenceHold` and `Hold*`).
- [x] **1.5 Definition ordering.** (Specificity = non-variable node
      count of the compiled pattern, descending; ties keep definition
      order. Cruder than WL's ordering but stable and monotonic.)
      Original task: WL's specificity order for
      down-values (more specific patterns tried first, ties by
      definition order). Implement the specificity comparator; property
      test: reordering definition entry never changes which rule fires
      when specificities differ.
- [ ] **1.6 Up-values** (`f /: g[f[x_]] := ...`) and the evaluation
      sequence (up-values of args before down-values of head).
- [~] **1.7 Iteration/recursion limits** (fuel bound with `$Aborted`
      exists; WL-style `Hold` truncation and `$RecursionLimit` split
      pending). Original task: (`$IterationLimit`,
      `$RecursionLimit`) with WL-style `Hold` truncation on overflow.
- [x] **1.8 Conformance harness.** (Table-driven in
      `test/wl.test.ts`; external reference comparison not wired.)
      Original task: A table-driven test suite
      (input WL expr → expected InputForm) that runs against both WL/M
      and, optionally, a reference implementation (Mathics or WolframScript
      if present on the dev machine) to triage divergences into
      "intentional" vs "bug".

## Phase 2 — Full pattern language

- [~] **2.1 Head-typed blanks.** *Done:* `x_h` for atoms
      (Integer/String/Symbol map to sort-typed meta-variables) and user
      heads (compiled to `ap(s(h), name$ap$h:ArgList)` with the binding
      rebuilt as the whole expression); specificity scoring makes typed
      blanks dispatch before plain blanks automatically. *Pending:*
      sequence-typed `x__h`/`x___h`. Original task: `x_h`, `x__h`, `x___h`.
- [ ] **2.2 Conditions** `patt /; cond` and `PatternTest` (`x_?f`) —
      requires calling back into `eval` during matching (matcher and
      evaluator become mutually recursive; design the state threading).
- [ ] **2.3 `Alternatives`, `Except`, `Repeated`, `PatternSequence`,
      `Optional` (with `Default` values), `Longest`/`Shortest`.**
      Decide per-construct: translate to Maude meta-patterns where
      possible, fall back to our own matcher-driver where not.
- [ ] **2.4 Rule application operators**: `Rule`, `RuleDelayed`,
      `ReplaceAll`, `ReplaceRepeated`, `Replace` with level specs.
- [ ] **2.5 `Cases`, `Position`, `MatchQ`, `FreeQ`, `Count`** with level
      specifications.
- [ ] **2.6 Flat/OneIdentity pattern pathologies.** Decide and document
      semantics for the known dark corners (e.g. `f[x_]` matching `a`
      when `f` is `Flat`+`OneIdentity`); conformance tests either way.

## Phase 3 — Scoping, control flow, state

- [ ] **3.1 `Module`** (lexical, renaming with fresh symbols — capture
      avoidance machinery at the metalevel), **`Block`** (dynamic),
      **`With`** (substitution).
- [ ] **3.2 `Function`** (`&`, named-parameter, and `Function[{x}, ...]`
      forms), slot semantics `#`, `##`.
- [ ] **3.3 Control flow**: `CompoundExpression`, `While`, `Do`, `For`,
      `Switch`, `Which`, `Return`, `Break`, `Continue`.
- [ ] **3.4 `Throw`/`Catch`** with tags — likely the strategy language
      or an explicit evaluator continuation encoding; pick after a
      spike.
- [ ] **3.5 Symbol state**: own-values, `Unset`, `Clear` vs
      `ClearAll`, `Protected` enforcement, contexts as Qid prefixes
      (`` System` ``, `` Global` ``) with `$Context`/`$ContextPath`
      resolution (minimal version).
- [ ] **3.6 Messages**: `Message`, `Quiet`, `Check`, message name
      resolution — plumb through the evaluator as effects in the state
      term.

## Phase 4 — Numerics & data types

- [ ] **4.1 Exact numerics**: `Integer`/`Rational` on GMP (free),
      `Complex` over exact parts, `GCD`, `Factorial`, `Binomial`, etc.
- [ ] **4.2 Machine reals** on Maude `FLOAT`; numeric contagion rules
      (exact + inexact → inexact).
- [ ] **4.3 Arbitrary-precision reals.** Scaled-integer bigfloats with
      WL-style precision tracking (`N[expr, 50]`, `Precision`). This is
      the largest pure-library item in the plan; consider deferring
      behind a "machine precision only" milestone.
- [ ] **4.4 Strings**: the `String` head over Maude `STRING`;
      `StringJoin`, `StringLength`, `Characters`, `StringTake`; decide
      how far to chase `StringExpression` patterns (likely: not far).
- [ ] **4.5 `Association`** (as ACU map term), `Keys`, `Values`,
      `Lookup`, `KeyDropFrom` etc. — modern WL code is unusable
      without it.

## Phase 5 — Standard library (written in WL/M itself where possible)

- [ ] **5.1 Structural**: `Map`, `Apply`, `MapThread`, `Thread`,
      `Fold`/`FoldList`, `Nest`/`NestList`/`NestWhile`, `FixedPoint`,
      `Select`, `Sort` (with ordering functions), `GroupBy`, `Flatten`
      (with levels), `Partition`, `Transpose`, `Range`, `Table`,
      `Total`, `Join`, `Riffle`, `Tuples`.
- [ ] **5.2 `Listable` threading** over lists (and mixed list/scalar).
- [ ] **5.3 Symbolic basics**: `Expand`, `Together` (polynomial-level),
      `D` (differentiation is a small rule set), `Collect`,
      `Coefficient` — explicitly *not* `Simplify`/`Integrate`/`Solve`.
- [ ] **5.4 Bootstrap file format**: `init.wl` parsed and loaded at
      session start; as much of 5.1/5.3 as possible written in WL/M,
      making the library its own test suite.
- [ ] **5.5 Flagship: port a Rubi slice.** Rubi's rule-based
      integration (pure rewrite rules) — port one chapter (e.g. rational
      functions) with its test cases. This is the "not a toy" proof and
      will stress patterns, conditions, and performance like nothing
      else.

## Phase 6 — Parser & frontend

- [ ] **6.1 WL parser in TypeScript** (`packages/wolfram`): full-form
      target (`a+b` → `Plus[a, b]`); operator precedence table for the
      practical subset (arithmetic, `->`, `:>`, `/.`, `//.`, `:=`, `=`,
      `/;`, `&`, `@`, `//`, `@@`, `/@`, `[[...]]`, comparison and
      logic operators, `;`). Property test: parse→FullForm→parse
      round-trip.
- [ ] **6.2 Formatter**: `InputForm`/`FullForm` output from result
      terms; precedence-aware infix printing back to WL syntax.
- [ ] **6.3 Session API**: `WolframSession` on top of
      `MaudeWorkerSession` — `evaluate(input) → {result, messages}`;
      In/Out history (`%`, `%%`, `Out[n]`).
- [ ] **6.4 Notebook page in the demo**: cell-based UI (reuse
      CodeMirror/worker/cancel infra), Shift-Enter evaluation, In/Out
      labels; a WL CodeMirror mode.
- [ ] **6.5 Tutorial chapter** ("Building a language on Maude") telling
      the story with live cells.

## Phase 7 — Performance & robustness

- [ ] **7.1 Benchmark suite**: fib (memoized and not), symbolic expand,
      Rubi integrals, pattern-heavy dispatch; track vs. Mathics as the
      honesty baseline.
- [ ] **7.2 Meta-module caching.** Rebuild the synthesized meta-module
      only when definitions change (generation counter); measure
      definition-churn workloads.
- [ ] **7.3 Dispatch indexing**: bucket down-values by head and argument
      count before specificity search.
- [ ] **7.4 Fuzzing**: random expression generator + differential
      testing against the reference implementation; crash/hang triage
      (`$IterationLimit` interactions).
- [ ] **7.5 Worker/session hardening**: long evaluations vs.
      cancellation (worker terminate leaves state gone — decide
      checkpoint/restore story, e.g. replaying the definition log).

## Cross-cutting decisions to make early (write ADRs)

- [ ] **ADR-1**: Single-sort `Expr` vs. richer sort hierarchy for atoms
      (affects every pattern translation; leaning single-sort +
      head predicates).
- [ ] **ADR-2**: Which pattern constructs go through Maude's matcher vs.
      our own driver (performance vs. fidelity trade per construct).
- [ ] **ADR-3**: Evaluation state threading — pure `state × expr → state
      × expr` equations vs. object/configuration style (affects 3.4,
      3.6, 7.5).
- [ ] **ADR-4**: Canonical `Orderless` order (document divergence from
      WL's).
- [ ] **ADR-5**: How much of the library is written in WL/M vs. Maude
      builtins (dog-fooding vs. speed).

## Known risks

| Risk | Mitigation |
| --- | --- |
| Metalevel overhead makes definition-heavy code crawl | 7.2 caching; Phase 0.8 measures before we commit |
| WL semantic dark corners consume unbounded time | Conformance harness with an explicit "intentional divergence" list; Mathics as tie-breaker |
| Bigfloat precision tracking balloons (4.3) | Ship machine-precision-only first; 4.3 behind a milestone |
| Pattern constructs that don't map to ACU matching (2.3) | Own matcher-driver fallback is in the architecture from 0.3 |
| Scope creep toward CAS features | Non-goals stated at top; Rubi is the only symbolic flagship |

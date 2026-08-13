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
- [x] **1.3 Hold semantics.** *Done:* HoldAll/HoldFirst/HoldRest via
      the attribute table, `Hold`/`HoldForm` inert, `Evaluate` override
      in held positions, and `Unevaluated[e]` (HoldAll wrapper stripped
      after argument evaluation, before dispatch, so
      `Length[Unevaluated[1 + 2]]` is 2). Divergence: the wrapper does
      not reappear when the outer expression fails to evaluate.
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
- [~] **1.6 Up-values.** *Done as sugar:* `TagSetDelayed`/
      `UpSetDelayed` add to the shared rulebase; because definitions
      dispatch before builtins, up-value behavior (overriding the outer
      head for specific inner heads) falls out. *Pending:* per-symbol
      storage, the exact up-before-down trial order against competing
      down-values, `Protected` interaction.
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

- [x] **2.1 Head-typed blanks.** *Done:* `x_h` for atoms
      (Integer/String/Symbol map to sort-typed meta-variables) and user
      heads (compiled to `ap(s(h), name$ap$h:ArgList)` with the binding
      rebuilt as the whole expression); specificity scoring makes typed
      blanks dispatch before plain blanks automatically. *Also done:*
      sequence blanks with real WL arities — `x__` (1+) vs `x___` (0+)
      and typed `x__h`/`x___h`: all compile to one associative
      `ArgList` meta-variable with the 1+/element-head constraints
      hoisted into definition conditions (`Length[{x}] >= 1`,
      `$AllHeadQ`). Inside ReplaceAll rules (no hoisting) they degrade
      to 0+ untyped sequences — documented divergence until rule
      conditions land.
- [x] **2.2 Conditions** `patt /; cond` and `PatternTest` (`x_?f`).
      Implemented WL-style: conditions live in the rhs as
      `Condition[rhs, cond]` (lhs-side `/;` and `_?test` are hoisted at
      definition time); `tryDefs` evaluates the condition with the
      matched bindings and falls through to later definitions unless it
      yields True. Definition identity is (pattern, condition), so
      equal-pattern conditional definitions coexist. PatternTest is
      supported on blanks/typed blanks; arbitrary subpattern tests
      pending. Also added: And/Or/Not, EvenQ/OddQ/IntegerQ.
- [~] **2.3 Pattern constructs.** *Done:* `Alternatives` — expanded at
      definition time into one definition per branch (cartesian across
      occurrences), so each branch is a plain metaMatch pattern and
      per-branch variable bindings come free. *Also done:* `Except`
      (hoisted to a fresh-named blank plus `Not[MatchQ[...]]`, counter
      threaded so multiple unnamed Excepts stay independent) and
      `Pattern` naming — blank aliases rename the meta-variable, ground
      patterns pre-bind into the rhs at definition time (which composes
      with Alternatives expansion for free: `x : ("yes"|"y")` binds per
      branch). *Also done:* `Optional[x_, d]` / `x_ : d` (expanded like
      Alternatives into a with-arg branch and an absent branch whose
      default pre-binds into the rhs), `PatternSequence` (definition-time
      splice into the argument list), and `Repeated`/`RepeatedNull`
      (fresh sequence variable + hoisted every-element-matches
      condition; the element pattern must itself be condition-free).
      MatchQ now hoists its pattern like a definition and evaluates the
      hoisted conditions per match solution, so `MatchQ[4, x_ /; x > 3]`
      and sequence/Repeated patterns work at runtime too. *Pending:*
      `Longest`/`Shortest`, naming of structured sub-patterns with
      inner blanks. Gotchas recorded: a `(` as the first token after
      `***` opens Maude's balanced block comment; ops must be declared
      before the statements that use them.
- [x] **2.4 Rule application operators.** *Done:* `Rule`,
      `RuleDelayed` (HoldRest), `ReplaceAll`, `ReplaceRepeated`
      (fixed-point with evaluation between passes). *Also done:* rules
      now compile exactly like definitions (lhs `Condition` /
      `PatternTest` / sequence constraints hoist into an rhs
      `Condition`), and the replacement walk is state-aware — rule
      conditions evaluate per match solution with backtracking, so
      `l /. x_ /; x > 3 -> big` and `l /. {x__Integer} :> Plus[x]`
      work. `Replace[e, rules, levelspec]` supports the standard specs
      `n` / `{n}` / `{a, b}` / `Infinity` (default `{0}`). Fixed en
      route: attribute-driven HoldRest double-prepended the first
      argument (If/Set are special-cased, so RuleDelayed was the first
      real exerciser).
- [x] **2.5 Pattern predicates.** *Done:* `MatchQ`, `FreeQ` (full
      recursive), `Cases`/`Count` at level 1, `Cases` with level specs
      (pre-order, matched nodes not descended), and `Position` (index
      paths, all levels, heads not visited). Position/Cases/FreeQ match
      via the pure matcher, so conditions inside *their* patterns are
      not evaluated — MatchQ and rule application do evaluate them.
- [ ] **2.6 Flat/OneIdentity pattern pathologies.** Decide and document
      semantics for the known dark corners (e.g. `f[x_]` matching `a`
      when `f` is `Flat`+`OneIdentity`); conformance tests either way.

## Phase 3 — Scoping, control flow, state

- [~] **3.1 Scoping.** *Done:* `Module` (lexical — locals renamed to
      fresh symbols suffixed with the self-decremented fuel value, so
      nesting and recursion are collision-free; initializers evaluate
      outside the scope) and `With` (evaluated-initializer
      substitution). *Also done:* `Block` (dynamic scoping via save/restore of
      own-value definitions around the body — verified through a
      function call observing the inner value). Module locals persist
      as leaked temporaries like WL's Temporary symbols but are never
      garbage-collected.
- [~] **3.2 `Function`.** *Done:* `Function[{vars}, body][args]`
      (binding via the substitution machinery) and `Function[body]` with
      `Slot[n]` (slots do not reach into nested Function bodies, per
      WL). *Also done:* `Function[x, body]` single-variable form and
      `##`/`##n` slot sequences (they become `Sequence[...]` and splice
      in normalization). *Pending:* `Function` attributes.
- [~] **3.3 Control flow.** *Done:* `CompoundExpression`, `While`
      (fuel-bounded), `Do` (count + single-iterator forms), plus
      iteration combinators `Table`/`Nest`/`NestList`/`Fold`.
      *Also done:* `For`, `Switch` (via MatchQ), `Which`.
      *Also done:* `Return`/`Break`/`Continue` and `Throw`/`Catch` via an
      `unw(kind, payload)` expression marker propagated
      continuation-style through argument evaluation and sequencing;
      rule application and `Function` boundaries absorb `Return`, loops
      absorb `Break`/`Continue`, `Catch` absorbs `Throw`. Hard-won
      lesson recorded: guard-paired ceqs whose conditions both call
      `ev(...)` make Maude re-run the whole sub-evaluation when the
      first guard fails — exponential blowup on recursion; dispatch on
      the evaluated value in a helper op instead.
- [x] **3.4 `Throw`/`Catch` with tags.** Every throw carries a
      `$TT(value, tag)` pair through the `unw` marker (tag `None` when
      absent — as in WL, `_` matches it); `Catch[e]` absorbs only
      untagged throws, `Catch[e, form]` pattern-matches the tag and
      re-propagates on mismatch. Fixed en route: an unwind surfacing in
      a *non-first* argument used to be consed into the argument list
      instead of propagating (`2 + Throw[7]` left a naked marker).
- [~] **3.5 Symbol state.** *Done:* own-values (`x = 5` — symbols
      evaluate through the rulebase; imperative `While` loops over
      mutable symbols work). *Also done:* `Unset` (single definition) and `Clear` (all
      definitions of a symbol, matched on the compiled pattern head).
      *Also done:* `ClearAll` (definitions + attributes) and
      `Protected` enforcement — Set/SetDelayed/Clear/ClearAll refuse
      with `$Failed` on protected symbols; `Protect`/`Unprotect` live
      in the stdlib. Builtins ship unprotected on purpose: the stdlib
      itself extends `Sin`, `Integrate` &c. *Pending:* contexts.
- [x] **3.6 Messages** — written in the stdlib over the state the
      evaluator already threads: raised messages accumulate as
      `HoldForm[MessageName[...]]` in the `$MessageList` own-value;
      `Quiet` saves/restores it around its body, `Check` compares its
      length. The parser gained `f::tag` (`MessageName`, tag stored as
      a string). Divergence: nothing prints — messages are data, not
      console output.

## Phase 4 — Numerics & data types

- [~] **4.1 Exact numerics.** *Done:* `Integer`/`Rational` on Maude's
      RAT (atoms are now `Rat < Expr`): exact folding in Plus/Times,
      negative powers (`2^-1` -> `1/2`, handled manually since RAT's
      `^` wants a Nat exponent), `Divide`, `Numerator`/`Denominator`
      (by matching the canonical `NzInt / NzNat` form), rational
      comparisons. Division works through the parser form
      `Times[a, Power[b, -1]]`. *Also done:* `GCD`, `Factorial`, `Binomial`, `Abs`, `Min`/`Max`,
      `Mod`/`Quotient` (WL floor-division sign semantics), `Unequal`,
      `SameQ`, and `Complex` — written entirely in the stdlib: `I` is
      an own-value for `Complex[0, 1]`; Plus/Times rules with *two*
      sequence variables fold Complex pairs wherever they sit in the
      flattened argument list (guarded against the identity elements
      they produce, which otherwise loop); `Re`/`Im`/`Conjugate`,
      integer powers via `Nest`.
- [x] **4.2 Machine reals** on Maude `FLOAT` (`fl` atom): contagion in
      Plus/Times/Power (any float makes the numeric part float, like-term
      collection carries float coefficients), mixed-mode comparisons,
      `N[expr]` (deep Rat→Float + re-evaluate), `_Real` typed blanks,
      `Head` → `Real`, and float `Sin`/`Cos`/`Exp`/`Log`/`Sqrt`/`Abs`.
      Divergences: machine zero/one identities collapse in sums and
      products (WL keeps `0. + x`); output prints the full float repr,
      not WL's 6-digit display.
- [ ] **4.3 Arbitrary-precision reals.** Scaled-integer bigfloats with
      WL-style precision tracking (`N[expr, 50]`, `Precision`). This is
      the largest pure-library item in the plan; consider deferring
      behind a "machine precision only" milestone.
- [~] **4.4 Strings.** *Done:* `StringJoin`, `StringLength`,
      `ToString` (integers/strings/symbols), `Characters`,
      `StringTake` (positive/negative/`{a, b}` specs), `StringDrop`.
      *Pending:* `StringExpression`.
- [x] **4.5 `Association`** — ordered like WL's (not an ACU map: WL
      preserves insertion order), later duplicate keys win, nested
      Lists/Associations flatten on construction. `<|...|>` syntax in
      parser and formatter; `Keys`, `Values`, `Lookup` (with default /
      `Missing["KeyAbsent", k]`), `assoc[key]` application,
      `KeyExistsQ`, `KeyDrop`, `Normal`, `AssociationQ`, plus
      `Append`/`Prepend` and the HoldFirst mutation sugar
      `AppendTo`/`PrependTo`/`AssociateTo`/`KeyDropFrom` in the stdlib.

## Phase 5 — Standard library (written in WL/M itself where possible)

- [~] **5.1 Structural.** *Done:* `Map`, `Apply`, `Range`, `First`,
      `Rest`, `Total`, `Fold`, `Nest`, `NestList`, `Select`, `Flatten`
      (all levels), `Join`, `Table` (single iterator). *Also done:* `FoldList`,
      `FixedPoint`, `Part` (level 1 + Part 0 = Head), `Last`, `Sort`
      (canonical order), `Partition`, `Transpose`. *Also done:*
      `Thread`, `MapThread`, `NestWhile` (bounded), `Sort` with an
      ordering function (stateful insertion sort), `Riffle` (stdlib),
      `Tuples` (both forms), multi-iterator and `{i, min, max}`
      `Table`/`Do`, nested `Part` specs (`m[[2, 1]]`), and
      `Function[x, body]` single-variable functions. *Pending:*
      `GroupBy` (wants Association, 4.5).
- [x] **5.2 `Listable` threading** over lists and mixed list/scalar
      arguments: a hook before dispatch threads any Listable head
      elementwise, broadcasting scalars; mismatched lengths stay
      inert. Plus/Times/Power/Abs/Sin/Cos/Exp/Log/Factorial/Mod/
      Quotient/GCD/EvenQ/OddQ ship Listable; `Thread` reuses the same
      row machinery.
- [~] **5.3 Symbolic basics.** *Done:* `D` (sum/product/power rules,
      chain rules for Sin/Cos/Exp/Log) and `Expand` (distribution +
      integer powers) in the bootstrap library;
      `D[Integrate[x^2, x], x] == x^2` holds and
      `Expand[(x+y)*(x-y)]` cancels to `x^2 - y^2`. The engine's Plus
      now collects like terms by symbolic part (2x + 3x -> 5x, exact
      rational coefficients) and Times collects powers by base
      (x * x^2 -> x^3) — WL's automatic arithmetic canonicalization.
      *Also done:* `Coefficient[e, x, n]`
      (over the expanded form) and special values (`Sin[0]`, `Cos[0]`,
      `Exp[0]`, `Log[1]`). The formatter prints subtractions
      (`x^2 - y^2`, not `x^2 + -1*y^2`) and negative powers as
      division (`x/(1 + x)`, `1/x^2`). *Also done:* `Exponent`,
      `Collect` (via `Table` over `Coefficient` — iterator bounds now
      evaluate under Table's HoldAll), and `Together` (structural
      `num`/`den` split of each term, pairwise combination over a
      common denominator, expanded numerator) — all in the stdlib.
- [x] **5.4 Bootstrap library**: `packages/wolfram/src/stdlib.ts`
      holds WL-notation definitions parsed and evaluated at session
      start (evaluateWL and the notebook worker both prepend it); the
      e2e suite exercises it. Sequence blanks + `Plus[r]`/`Times[r]`
      OneIdentity collapse stand in for matching modulo Flat (1.2b).
- [~] **5.5 Flagship: Rubi-style integration.** *Started:* a
      five-rule slice (constants, powers, linearity, constant factors)
      in the bootstrap library handles polynomial integration with
      exact rational coefficients. *Grown:* trig/exp/log antiderivatives,
      `x^-1 -> Log[x]`, and the Rubi-signature expand-and-retry
      fallback rule (`Integrate[e_, x_] := Integrate[Expand[e], x] /;
      !(e === Expand[e])`). *Grown again:* the linear-substitution
      chapter — `(b + a x)^n` (including `n = -1` → `Log`), `Sin`/
      `Cos`/`Exp` of linear arguments (each rule in both canonical
      argument orders, since matching is not modulo Orderless), and
      simple rational forms `x/(b + a x)` via polynomial division.
      The test corpus is *self-checking*: for each integrand,
      `Expand[Together[D[Integrate[f, x], x] - f]]` must be literal 0,
      which exercises D, the chain rules, Together and Expand in one
      loop. *Pending:* partial fractions for general rational
      functions.

## Phase 6 — Parser & frontend

- [~] **6.1 WL parser in TypeScript** (`packages/wolfram`). *Done:*
      tokenizer + Pratt parser covering numbers, strings, symbols,
      blanks (`x_`, `x__`, `x___`, `_Integer`, `x__Integer`…), slots/`&`,
      `{...}`/`f[...]`, `e[[...]]` Part syntax, `x_ : d` Optional,
      `<|...|>` associations, real literals, `f::tag`, `%`,
      and the operator table (`; = := ^:= // /. //. -> :> /; : | || &&
      == != < > <= >= /@ @@ + - * / ^ @ !`), with `a/b` and `a-b`
      compiling through `Times`/`Power`/`Plus`, plus `x_?test` and
      `##`/`##n`. *Divergences:* no implicit multiplication.
      *Also done:* format→parse round-trip property test over the whole
      e2e corpus (caught a real divergence: `a - b*c` must fold the -1
      into the Times, as WL does).
- [x] **6.2 Formatter**: core result terms print as InputForm with
      precedence-aware parenthesization (`3*(1 + x)`), lists as
      `{...}`, slots/`&`, blanks, strings.
- [x] **6.3 Session API.** *Done:* one-shot `evaluateWL(source)` →
      `{output, core, stderr}` through parser → engine → formatter.
      *Also done:* persistent `WolframSession` on `MaudeWorkerSession`
      with In/Out history, `Out[n]` recorded in the session state and
      `%` for the previous result. Incrementality comes from a
      memoized `runStep` prefix chain *inside the interpreter*: each
      cell only evaluates the newly appended expressions (≈10ms/cell
      after a 1s cell, vs. full replay). Hard-won lesson: Maude wipes
      a module's memo tables whenever a command runs in a *different*
      module — the session's output-delimiter sentinel had to move
      into WL-EVAL (`sentinelModule` option on `MaudeWorkerSession`).
- [x] **6.4 Notebook page in the demo** (`/wolfram`): cell-based UI
      with In/Out labels, Shift-Enter evaluation, add-cell, cancel; a
      minimal WL CodeMirror mode; parsing/formatting run in the worker
      (browser-safe `./parser` and `./format` subpath exports). Cells
      share a session by replaying the cells above the evaluated one —
      GitHub Pages lacks the cross-origin-isolation headers a
      persistent MaudeWorkerSession would need.
- [x] **6.5 Tutorial chapter** — chapter 18, "Building a language on
      Maude": the architecture story (expressions as terms, rulebase as
      data, metaMatch dispatch, the stdlib dog-fooding the language)
      told with live `WlSnippet` cells, ending on the self-checking
      `D`∘`Integrate` identity.

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

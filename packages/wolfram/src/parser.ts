// Wolfram Language surface syntax -> WL/M core term strings.
//
// Deliberate divergences (documented in docs/wolfram-on-maude.md):
// no implicit multiplication (write `2 * x`), no `%` history refs,
// simplified operator precedence for rarely-mixed combinations.

export type Ast =
  | { kind: "int"; value: string }
  | { kind: "real"; value: string }
  | { kind: "string"; value: string }
  | { kind: "symbol"; name: string }
  | {
      kind: "blank";
      name: string | null;
      head: string | null;
      /** 1 = Blank (_), 2 = BlankSequence (__), 3 = BlankNullSequence (___) */
      depth: 1 | 2 | 3;
    }
  | { kind: "slot"; index: number }
  | { kind: "slotseq"; index: number }
  | { kind: "apply"; head: Ast; args: Ast[] };

interface Token {
  type: "num" | "real" | "str" | "sym" | "blank" | "slot" | "slotseq" | "op";
  text: string;
  name?: string | null;
  head?: string | null;
  depth?: 1 | 2 | 3;
}

const OPS = [
  "<|",
  "|>",
  "^:=",
  "//.",
  "===",
  "/;",
  ":=",
  "->",
  ":>",
  "/.",
  "<=",
  ">=",
  "==",
  "!=",
  "&&",
  "||",
  "/@",
  "@@",
  "//",
  ";",
  "=",
  "|",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "^",
  "&",
  "@",
  ":",
  "!",
  "?",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  ",",
];

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const src = source;
  outer: while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (src.startsWith("(*", i)) {
      const end = src.indexOf("*)", i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9]/.test(src[j])) j++;
      // real literal: 1.5, 2., 3.2e-4 (but not Part's `[[`-adjacent dots)
      if (src[j] === "." && src[j + 1] !== ".") {
        j++;
        while (j < src.length && /[0-9]/.test(src[j])) j++;
        if (src[j] === "e" || src[j] === "E") {
          let k = j + 1;
          if (src[k] === "-" || src[k] === "+") k++;
          if (/[0-9]/.test(src[k] ?? "")) {
            k++;
            while (k < src.length && /[0-9]/.test(src[k])) k++;
            j = k;
          }
        }
        tokens.push({ type: "real", text: src.slice(i, j) });
        i = j;
        continue;
      }
      tokens.push({ type: "num", text: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let out = "";
      while (j < src.length && src[j] !== '"') {
        if (src[j] === "\\") {
          out += src[j + 1];
          j += 2;
        } else {
          out += src[j];
          j++;
        }
      }
      tokens.push({ type: "str", text: out });
      i = j + 1;
      continue;
    }
    if (c === "#") {
      const seq = src[i + 1] === "#";
      let j = i + (seq ? 2 : 1);
      const start = j;
      while (j < src.length && /[0-9]/.test(src[j])) j++;
      tokens.push({
        type: seq ? "slotseq" : "slot",
        text: src.slice(start, j) || "1",
      });
      i = j;
      continue;
    }
    if (/[A-Za-z$]/.test(c) || c === "_") {
      let name: string | null = null;
      let j = i;
      if (/[A-Za-z$]/.test(c)) {
        while (j < src.length && /[A-Za-z0-9$]/.test(src[j])) j++;
        name = src.slice(i, j);
      }
      // blank suffix: _  __  ___  optionally followed by a head symbol
      if (src[j] === "_") {
        let underscores = 0;
        while (src[j + underscores] === "_") underscores++;
        let k = j + underscores;
        let head: string | null = null;
        if (k < src.length && /[A-Za-z$]/.test(src[k])) {
          const start = k;
          while (k < src.length && /[A-Za-z0-9$]/.test(src[k])) k++;
          head = src.slice(start, k);
        }
        tokens.push({
          type: "blank",
          text: src.slice(i, k),
          name,
          head,
          depth: Math.min(underscores, 3) as 1 | 2 | 3,
        });
        i = k;
        continue;
      }
      if (name !== null) {
        tokens.push({ type: "sym", text: name });
        i = j;
        continue;
      }
    }
    for (const op of OPS) {
      if (src.startsWith(op, i)) {
        tokens.push({ type: "op", text: op });
        i += op.length;
        continue outer;
      }
    }
    throw new Error(`unexpected character '${c}' at ${i}`);
  }
  return tokens;
}

// Binding powers: [left, right]; right < left = right-assoc.
const INFIX: Record<string, [number, number, string]> = {
  ";": [10, 11, "CompoundExpression"],
  "=": [21, 20, "Set"],
  ":=": [21, 20, "SetDelayed"],
  "^:=": [21, 20, "UpSetDelayed"],
  "//": [23, 24, "$Postfix"],
  "/.": [30, 31, "ReplaceAll"],
  "//.": [30, 31, "ReplaceRepeated"],
  "->": [36, 35, "Rule"],
  ":>": [36, 35, "RuleDelayed"],
  "/;": [45, 46, "Condition"],
  ":": [48, 47, "Pattern"],
  "|": [50, 51, "Alternatives"],
  "||": [55, 56, "Or"],
  "&&": [60, 61, "And"],
  "==": [70, 71, "Equal"],
  "!=": [70, 71, "Unequal"],
  "===": [70, 71, "SameQ"],
  "<": [70, 71, "Less"],
  ">": [70, 71, "Greater"],
  "<=": [70, 71, "LessEqual"],
  ">=": [70, 71, "GreaterEqual"],
  "/@": [75, 76, "Map"],
  "@@": [75, 76, "Apply"],
  "+": [80, 81, "Plus"],
  "-": [80, 81, "$Minus"],
  "*": [90, 91, "Times"],
  "/": [90, 91, "$Divide"],
  "^": [101, 100, "Power"],
  "@": [96, 95, "$Prefix"],
  "?": [120, 121, "PatternTest"],
};

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private next(): Token {
    const t = this.tokens[this.pos++];
    if (!t) throw new Error("unexpected end of input");
    return t;
  }
  private expect(text: string): void {
    const t = this.next();
    if (t.type !== "op" || t.text !== text) {
      throw new Error(`expected '${text}', got '${t.text}'`);
    }
  }

  parseProgram(): Ast[] {
    const exprs: Ast[] = [];
    while (this.peek()) {
      exprs.push(this.parseExpr(0));
      const t = this.peek();
      if (t && t.type === "op" && t.text === ";") {
        this.next();
      } else if (this.peek()) {
        throw new Error(`unexpected '${this.next().text}'`);
      }
    }
    return exprs;
  }

  parseExpr(minBp: number): Ast {
    let lhs = this.parseUnary(minBp);
    for (;;) {
      const t = this.peek();
      if (t?.type !== "op") break;
      // postfix Function
      if (t.text === "&") {
        if (25 < minBp) break;
        this.next();
        lhs = { kind: "apply", head: sym("Function"), args: [lhs] };
        continue;
      }
      // Part: expr[[...]]
      if (t.text === "[" && this.tokens[this.pos + 1]?.text === "[") {
        this.next();
        this.next();
        const args = this.parseArgs("]");
        this.expect("]");
        lhs = { kind: "apply", head: sym("Part"), args: [lhs, ...args] };
        continue;
      }
      // application f[...]
      if (t.text === "[") {
        this.next();
        const args = this.parseArgs("]");
        lhs = { kind: "apply", head: lhs, args };
        continue;
      }
      const info = INFIX[t.text];
      if (!info || info[0] < minBp) break;
      // `;` only continues an expression when something follows
      if (t.text === ";") {
        const after = this.tokens[this.pos + 1];
        if (!after) break;
      }
      this.next();
      const [, rbp, opName] = info;
      const rhs = this.parseExpr(rbp);
      lhs = mkInfix(opName, lhs, rhs);
    }
    return lhs;
  }

  private parseUnary(minBp: number): Ast {
    const t = this.peek();
    if (t && t.type === "op" && t.text === "-") {
      this.next();
      const operand = this.parseExpr(92);
      if (operand.kind === "int" || operand.kind === "real") {
        return { ...operand, value: `-${operand.value}` };
      }
      return { kind: "apply", head: sym("Times"), args: [int("-1"), operand] };
    }
    if (t && t.type === "op" && t.text === "!") {
      this.next();
      return { kind: "apply", head: sym("Not"), args: [this.parseExpr(65)] };
    }
    return this.parsePrimary(minBp);
  }

  private parsePrimary(_minBp: number): Ast {
    const t = this.next();
    if (t.type === "num") return int(t.text);
    if (t.type === "real") return { kind: "real", value: t.text };
    if (t.type === "str") return { kind: "string", value: t.text };
    if (t.type === "sym") return sym(t.text);
    if (t.type === "slot") return { kind: "slot", index: Number(t.text) };
    if (t.type === "slotseq") return { kind: "slotseq", index: Number(t.text) };
    if (t.type === "blank") {
      return {
        kind: "blank",
        name: t.name ?? null,
        head: t.head ?? null,
        depth: t.depth ?? 1,
      };
    }
    if (t.type === "op" && t.text === "(") {
      const e = this.parseExpr(0);
      this.expect(")");
      return e;
    }
    if (t.type === "op" && t.text === "{") {
      const args = this.parseArgs("}");
      return { kind: "apply", head: sym("List"), args };
    }
    if (t.type === "op" && t.text === "<|") {
      const args = this.parseArgs("|>");
      return { kind: "apply", head: sym("Association"), args };
    }
    throw new Error(`unexpected '${t.text}'`);
  }

  private parseArgs(close: string): Ast[] {
    const args: Ast[] = [];
    const t = this.peek();
    if (t && t.type === "op" && t.text === close) {
      this.next();
      return args;
    }
    for (;;) {
      args.push(this.parseExpr(0));
      const n = this.next();
      if (n.type === "op" && n.text === close) return args;
      if (!(n.type === "op" && n.text === ",")) {
        throw new Error(`expected ',' or '${close}', got '${n.text}'`);
      }
    }
  }
}

function sym(name: string): Ast {
  return { kind: "symbol", name };
}
function int(value: string): Ast {
  return { kind: "int", value };
}

function mkInfix(op: string, lhs: Ast, rhs: Ast): Ast {
  switch (op) {
    // `x_ : d` is Optional-with-default; `x : patt` is Pattern naming
    case "Pattern":
      if (lhs.kind === "blank") {
        return { kind: "apply", head: sym("Optional"), args: [lhs, rhs] };
      }
      return { kind: "apply", head: sym("Pattern"), args: [lhs, rhs] };
    case "$Minus": {
      // -1 folds into an existing Times, as in WL: a - b*c
      // parses to Plus[a, Times[-1, b, c]]
      const negArgs =
        rhs.kind === "apply" &&
        rhs.head.kind === "symbol" &&
        rhs.head.name === "Times"
          ? [int("-1"), ...rhs.args]
          : [int("-1"), rhs];
      return {
        kind: "apply",
        head: sym("Plus"),
        args: [lhs, { kind: "apply", head: sym("Times"), args: negArgs }],
      };
    }
    case "$Divide":
      return {
        kind: "apply",
        head: sym("Times"),
        args: [
          lhs,
          { kind: "apply", head: sym("Power"), args: [rhs, int("-1")] },
        ],
      };
    case "$Prefix":
      return { kind: "apply", head: lhs, args: [rhs] };
    case "$Postfix":
      return { kind: "apply", head: rhs, args: [lhs] };
    case "CompoundExpression":
      if (
        lhs.kind === "apply" &&
        lhs.head.kind === "symbol" &&
        lhs.head.name === "CompoundExpression"
      ) {
        return { kind: "apply", head: lhs.head, args: [...lhs.args, rhs] };
      }
      return {
        kind: "apply",
        head: sym("CompoundExpression"),
        args: [lhs, rhs],
      };
    default: {
      // flatten variadic operators the parser would otherwise nest
      if (
        (op === "Plus" ||
          op === "Times" ||
          op === "Alternatives" ||
          op === "And" ||
          op === "Or") &&
        lhs.kind === "apply" &&
        lhs.head.kind === "symbol" &&
        lhs.head.name === op
      ) {
        return { kind: "apply", head: lhs.head, args: [...lhs.args, rhs] };
      }
      return { kind: "apply", head: sym(op), args: [lhs, rhs] };
    }
  }
}

export function parse(source: string): Ast[] {
  return new Parser(tokenize(source)).parseProgram();
}

// ---------------------------------------------------------------- core

let freshBlank = 0;

/** Render an AST as a WL/M core term (Maude syntax). */
export function toCore(ast: Ast): string {
  switch (ast.kind) {
    case "int":
      return ast.value;
    case "real": {
      // Maude float literals need a digit on both sides of the dot
      let v = ast.value;
      if (v.endsWith(".")) v += "0";
      v = v.replace(/\.e/i, ".0e");
      return `fl(${v})`;
    }
    case "string":
      return `str("${ast.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`;
    case "symbol":
      return `s('${ast.name})`;
    case "slot":
      return `ap(s('Slot), ${ast.index})`;
    case "slotseq":
      return `ap(s('SlotSequence), ${ast.index})`;
    case "blank": {
      const name = ast.name ?? `$b${++freshBlank}`;
      if (ast.head) {
        if (ast.depth === 2) return `?sh('${name}, '${ast.head})`;
        if (ast.depth === 3) return `??h('${name}, '${ast.head})`;
        return `?h('${name}, '${ast.head})`;
      }
      if (ast.depth === 2) return `?s '${name}`;
      if (ast.depth === 3) return `?? '${name}`;
      return `? '${name}`;
    }
    case "apply": {
      const head = toCore(ast.head);
      if (ast.args.length === 0) return `ap(${head}, nilA)`;
      return `ap(${head}, ${ast.args.map(toCore).join(" :: ")})`;
    }
  }
}

/** Compile a WL program to a single core ArgList for `run(...)`. */
export function compileProgram(source: string): string {
  const exprs = parse(source);
  if (exprs.length === 0) throw new Error("empty program");
  return exprs.map(toCore).join(" :: ");
}

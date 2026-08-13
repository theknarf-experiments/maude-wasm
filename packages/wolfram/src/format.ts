// WL/M core result terms -> Wolfram InputForm strings.

type Core =
  | { kind: "num"; value: string }
  | { kind: "real"; value: string }
  | { kind: "string"; value: string }
  | { kind: "symbol"; name: string }
  | { kind: "blank"; name: string; head: string | null; depth: 1 | 2 | 3 }
  | { kind: "apply"; head: Core; args: Core[] };

class CoreParser {
  private pos = 0;
  constructor(private src: string) {}

  private ws(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos]))
      this.pos++;
  }
  private lit(text: string): boolean {
    this.ws();
    if (this.src.startsWith(text, this.pos)) {
      this.pos += text.length;
      return true;
    }
    return false;
  }
  private expect(text: string): void {
    if (!this.lit(text)) {
      throw new Error(
        `expected '${text}' at ${this.pos}: ${this.src.slice(this.pos, this.pos + 30)}`,
      );
    }
  }
  private qid(): string {
    this.ws();
    this.expect("'");
    const m = /^[A-Za-z0-9$]+/.exec(this.src.slice(this.pos));
    if (!m) throw new Error(`bad qid at ${this.pos}`);
    this.pos += m[0].length;
    return m[0];
  }

  parseArgList(): Core[] {
    const items: Core[] = [this.parseExpr()];
    while (this.lit("::")) items.push(this.parseExpr());
    return items;
  }

  parseExpr(): Core {
    this.ws();
    const rest = this.src.slice(this.pos);
    const num = /^-?[0-9]+(\/[0-9]+)?/.exec(rest);
    if (num) {
      this.pos += num[0].length;
      return { kind: "num", value: num[0] };
    }
    if (this.lit("fl(")) {
      this.ws();
      const m = /^-?(Infinity|NaN|[0-9]+(\.[0-9]*)?([eE][+-]?[0-9]+)?)/.exec(
        this.src.slice(this.pos),
      );
      if (!m) throw new Error(`bad float at ${this.pos}`);
      this.pos += m[0].length;
      this.expect(")");
      return { kind: "real", value: m[0] };
    }
    if (this.lit("ap(")) {
      const head = this.parseExpr();
      this.expect(",");
      let args: Core[] = [];
      if (!this.lit("nilA")) args = this.parseArgList();
      this.expect(")");
      return { kind: "apply", head, args };
    }
    if (this.lit("s(")) {
      const name = this.qid();
      this.expect(")");
      return { kind: "symbol", name };
    }
    if (this.lit("str(")) {
      this.ws();
      this.expect('"');
      let out = "";
      while (this.src[this.pos] !== '"') {
        if (this.src[this.pos] === "\\") {
          out += this.src[this.pos + 1];
          this.pos += 2;
        } else {
          out += this.src[this.pos++];
        }
      }
      this.pos++;
      this.expect(")");
      return { kind: "string", value: out };
    }
    if (this.lit("?h(") || this.lit("?sh(") || this.lit("??h(")) {
      const depth = rest.startsWith("?sh") ? 2 : rest.startsWith("??h") ? 3 : 1;
      const name = this.qid();
      this.expect(",");
      const head = this.qid();
      this.expect(")");
      return { kind: "blank", name, head, depth: depth as 1 | 2 | 3 };
    }
    if (this.lit("?s")) {
      return { kind: "blank", name: this.qid(), head: null, depth: 2 };
    }
    if (this.lit("??")) {
      return { kind: "blank", name: this.qid(), head: null, depth: 3 };
    }
    if (this.lit("?")) {
      return { kind: "blank", name: this.qid(), head: null, depth: 1 };
    }
    throw new Error(
      `cannot parse core term at ${this.pos}: ${rest.slice(0, 40)}`,
    );
  }
}

const INFIX_FORMS: Record<string, { op: string; prec: number }> = {
  Plus: { op: " + ", prec: 80 },
  Times: { op: "*", prec: 90 },
  Power: { op: "^", prec: 100 },
  Rule: { op: " -> ", prec: 35 },
  RuleDelayed: { op: " :> ", prec: 35 },
  Equal: { op: " == ", prec: 70 },
  Less: { op: " < ", prec: 70 },
  Greater: { op: " > ", prec: 70 },
  LessEqual: { op: " <= ", prec: 70 },
  GreaterEqual: { op: " >= ", prec: 70 },
  And: { op: " && ", prec: 60 },
  Or: { op: " || ", prec: 55 },
  Alternatives: { op: " | ", prec: 50 },
  Condition: { op: " /; ", prec: 45 },
};

function fmt(core: Core, parentPrec: number): string {
  switch (core.kind) {
    case "num":
    case "symbol":
      return core.kind === "num" ? core.value : core.name;
    case "real": {
      const s = String(Number(core.value));
      return /[.e]/.test(s) ? s : `${s}.`;
    }
    case "string":
      return `"${core.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    case "blank": {
      const shownName = core.name.startsWith("$b") ? "" : core.name;
      const bar = "_".repeat(core.depth);
      return `${shownName}${bar}${core.head ?? ""}`;
    }
    case "apply": {
      const headSym = core.head.kind === "symbol" ? core.head.name : null;
      if (headSym === "Part" && core.args.length >= 2) {
        const [subject, ...idx] = core.args;
        return `${fmt(subject, 200)}[[${idx.map((a) => fmt(a, 0)).join(", ")}]]`;
      }
      if (headSym === "List") {
        return `{${core.args.map((a) => fmt(a, 0)).join(", ")}}`;
      }
      if (headSym === "Association") {
        return `<|${core.args.map((a) => fmt(a, 0)).join(", ")}|>`;
      }
      if (
        headSym === "Slot" &&
        core.args.length === 1 &&
        core.args[0].kind === "num"
      ) {
        return core.args[0].value === "1" ? "#" : `#${core.args[0].value}`;
      }
      if (
        headSym === "SlotSequence" &&
        core.args.length === 1 &&
        core.args[0].kind === "num"
      ) {
        return core.args[0].value === "1" ? "##" : `##${core.args[0].value}`;
      }
      if (headSym === "Function" && core.args.length === 1) {
        return `${fmt(core.args[0], 26)} &`;
      }
      // half powers print as Sqrt, as in WL InputForm
      if (
        headSym === "Power" &&
        core.args.length === 2 &&
        core.args[1].kind === "num" &&
        core.args[1].value === "1/2"
      ) {
        return `Sqrt[${fmt(core.args[0], 0)}]`;
      }
      // a bare negative power prints as a reciprocal: x^-2 becomes 1/x^2
      if (
        headSym === "Power" &&
        core.args.length === 2 &&
        core.args[1].kind === "num" &&
        core.args[1].value.startsWith("-")
      ) {
        const e = core.args[1].value.slice(1);
        const denCore: Core =
          e === "1"
            ? core.args[0]
            : {
                kind: "apply",
                head: core.head,
                args: [core.args[0], { kind: "num", value: e }],
              };
        const body = `1/${fmt(denCore, 92)}`;
        return parentPrec > 90 ? `(${body})` : body;
      }
      // negative-exponent factors print as division: x*(1 + x)^-1
      // becomes x/(1 + x)
      if (headSym === "Times" && core.args.length >= 2) {
        const num: Core[] = [];
        const den: Core[] = [];
        for (const a of core.args) {
          if (
            a.kind === "apply" &&
            a.head.kind === "symbol" &&
            a.head.name === "Power" &&
            a.args.length === 2 &&
            a.args[0] !== undefined &&
            a.args[1].kind === "num" &&
            a.args[1].value.startsWith("-")
          ) {
            const e = a.args[1].value.slice(1);
            den.push(
              e === "1"
                ? a.args[0]
                : {
                    kind: "apply",
                    head: a.head,
                    args: [a.args[0], { kind: "num", value: e }],
                  },
            );
          } else {
            num.push(a);
          }
        }
        if (den.length > 0) {
          const one: Core = { kind: "num", value: "1" };
          const wrap = (parts: Core[]): Core =>
            parts.length === 1
              ? parts[0]
              : {
                  kind: "apply",
                  head: { kind: "symbol", name: "Times" },
                  args: parts,
                };
          // a rational coefficient splits across the bar: 1/2 * 1/x
          // prints as 1/(2*x), as in WL
          if (
            num.length === 1 &&
            num[0].kind === "num" &&
            num[0].value.includes("/")
          ) {
            const [p, q] = num[0].value.split("/");
            num[0] = { kind: "num", value: p };
            den.unshift({ kind: "num", value: q });
          }
          const numCore = num.length === 0 ? one : wrap(num);
          const body = `${fmt(numCore, 90)}/${fmt(wrap(den), 92)}`;
          return parentPrec > 90 ? `(${body})` : body;
        }
      }
      if (headSym === "Plus" && core.args.length >= 2) {
        const prec = INFIX_FORMS.Plus.prec;
        let body = "";
        for (let i = 0; i < core.args.length; i++) {
          const { neg, term } = negSplit(core.args[i]);
          const text = fmt(term, prec + 1);
          if (i === 0) body = neg ? `-${text}` : text;
          else body += neg ? ` - ${text}` : ` + ${text}`;
        }
        return parentPrec > prec ? `(${body})` : body;
      }
      if (headSym && INFIX_FORMS[headSym] && core.args.length >= 2) {
        const { op, prec } = INFIX_FORMS[headSym];
        const body = core.args.map((a) => fmt(a, prec + 1)).join(op);
        return parentPrec > prec ? `(${body})` : body;
      }
      const head =
        core.head.kind === "symbol" || core.head.kind === "apply"
          ? fmt(core.head, 200)
          : `(${fmt(core.head, 0)})`;
      return `${head}[${core.args.map((a) => fmt(a, 0)).join(", ")}]`;
    }
  }
}

/** Split a Plus term into sign and magnitude for pretty printing. */
function negSplit(core: Core): { neg: boolean; term: Core } {
  if (
    (core.kind === "num" || core.kind === "real") &&
    core.value.startsWith("-")
  ) {
    return { neg: true, term: { ...core, value: core.value.slice(1) } };
  }
  if (
    core.kind === "apply" &&
    core.head.kind === "symbol" &&
    core.head.name === "Times" &&
    core.args.length >= 2 &&
    core.args[0].kind === "num" &&
    core.args[0].value.startsWith("-")
  ) {
    const abs = core.args[0].value.slice(1);
    const rest = core.args.slice(1);
    const factors: Core[] =
      abs === "1" ? rest : [{ kind: "num", value: abs }, ...rest];
    const term: Core =
      factors.length === 1
        ? factors[0]
        : { kind: "apply", head: core.head, args: factors };
    return { neg: true, term };
  }
  return { neg: false, term: core };
}

/** Format a WL/M core result term as Wolfram InputForm. */
export function formatCore(coreTerm: string): string {
  const parser = new CoreParser(coreTerm.trim());
  const items = parser.parseArgList();
  if (items.length === 1) return fmt(items[0], 0);
  return items.map((c) => fmt(c, 0)).join(", ");
}

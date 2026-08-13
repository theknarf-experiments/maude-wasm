// WL/M core result terms -> Wolfram InputForm strings.

type Core =
  | { kind: "num"; value: string }
  | { kind: "string"; value: string }
  | { kind: "symbol"; name: string }
  | { kind: "blank"; name: string; head: string | null; sequence: boolean }
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
    if (this.lit("?h(")) {
      const name = this.qid();
      this.expect(",");
      const head = this.qid();
      this.expect(")");
      return { kind: "blank", name, head, sequence: false };
    }
    if (this.lit("??")) {
      return { kind: "blank", name: this.qid(), head: null, sequence: true };
    }
    if (this.lit("?")) {
      return { kind: "blank", name: this.qid(), head: null, sequence: false };
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
    case "string":
      return `"${core.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    case "blank": {
      const shownName = core.name.startsWith("$b") ? "" : core.name;
      const bar = core.sequence ? "___" : "_";
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
      if (
        headSym === "Slot" &&
        core.args.length === 1 &&
        core.args[0].kind === "num"
      ) {
        return core.args[0].value === "1" ? "#" : `#${core.args[0].value}`;
      }
      if (headSym === "Function" && core.args.length === 1) {
        return `${fmt(core.args[0], 26)} &`;
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

/** Format a WL/M core result term as Wolfram InputForm. */
export function formatCore(coreTerm: string): string {
  const parser = new CoreParser(coreTerm.trim());
  const items = parser.parseArgList();
  if (items.length === 1) return fmt(items[0], 0);
  return items.map((c) => fmt(c, 0)).join(", ");
}

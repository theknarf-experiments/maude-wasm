import { StreamLanguage, type StringStream } from "@codemirror/language";

// A lightweight CodeMirror mode for Maude. There is no official grammar
// for editors, so this covers the common surface syntax: module frames,
// declarations, statement keywords, operator attributes, comments
// (`***`/`---` line comments and balanced `***( ... )` block comments),
// strings, numbers, and sort-like capitalized identifiers.

const declarationKeywords = new Set([
  "fmod", "endfm", "mod", "endm", "omod", "endom", "smod", "endsm",
  "fth", "endfth", "th", "endth", "oth", "endoth", "view", "endv",
  "is", "sort", "sorts", "subsort", "subsorts", "class", "subclass",
  "op", "ops", "var", "vars", "eq", "ceq", "rl", "crl", "mb", "cmb",
  "msg", "msgs", "if", "protecting", "pr", "extending", "ex",
  "including", "inc",
]);

const commandKeywords = new Set([
  "reduce", "red", "rewrite", "rew", "frewrite", "frew", "erewrite",
  "erew", "search", "match", "xmatch", "unify", "parse", "load", "sload",
  "in", "quit", "eof", "set", "show", "continue", "cont", "select",
  "trace", "debug",
]);

const attributeKeywords = new Set([
  "ctor", "assoc", "associative", "comm", "commutative", "idem",
  "idempotent", "iter", "id:", "left", "right", "prec", "gather",
  "format", "metadata", "label", "nonexec", "owise", "otherwise",
  "memo", "frozen", "poly", "strat", "special", "config", "obj",
  "such", "that",
]);

interface MaudeState {
  commentDepth: number;
}

function tokenComment(stream: StringStream, state: MaudeState): string {
  while (!stream.eol()) {
    const ch = stream.next();
    if (ch === "(") state.commentDepth++;
    else if (ch === ")") {
      state.commentDepth--;
      if (state.commentDepth === 0) break;
    }
  }
  return "comment";
}

export const maudeLanguage = StreamLanguage.define<MaudeState>({
  name: "maude",
  startState: () => ({ commentDepth: 0 }),
  token(stream, state) {
    if (state.commentDepth > 0) return tokenComment(stream, state);
    if (stream.eatSpace()) return null;

    if (stream.match(/^(\*\*\*|---)\(/)) {
      state.commentDepth = 1;
      return tokenComment(stream, state);
    }
    if (stream.match(/^(\*\*\*|---)/)) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/^"([^"\\]|\\.)*"/)) return "string";
    if (stream.match(/^\d+(\.\d+)?/)) return "number";
    if (stream.match(/^[()[\]{}]/)) return "bracket";
    if (stream.match(/^(=>[!*+1]?|->|~>|:=|[=,.:])(?=\s|$)/)) return "operator";

    // A Maude token: anything up to whitespace or special punctuation.
    if (stream.match(/^[^\s()[\]{},]+/)) {
      const word = stream.current();
      if (declarationKeywords.has(word)) return "keyword";
      if (commandKeywords.has(word)) return "keyword";
      if (attributeKeywords.has(word)) return "atom";
      if (/^[A-Z]/.test(word)) return "typeName";
      return null;
    }

    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "***" },
  },
});

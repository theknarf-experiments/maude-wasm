import { StreamLanguage } from "@codemirror/language";

// A minimal CodeMirror mode for Wolfram Language surface syntax.

const builtins = new Set([
  "Set",
  "SetDelayed",
  "If",
  "While",
  "Do",
  "For",
  "Which",
  "Switch",
  "Module",
  "Block",
  "With",
  "Function",
  "Map",
  "Apply",
  "Select",
  "Fold",
  "FoldList",
  "Nest",
  "NestList",
  "FixedPoint",
  "Table",
  "Range",
  "List",
  "Plus",
  "Times",
  "Power",
  "Rule",
  "RuleDelayed",
  "ReplaceAll",
  "ReplaceRepeated",
  "MatchQ",
  "FreeQ",
  "Cases",
  "Count",
  "Head",
  "Length",
  "First",
  "Rest",
  "Last",
  "Part",
  "Sort",
  "Partition",
  "Transpose",
  "Flatten",
  "Join",
  "Total",
  "True",
  "False",
  "Null",
  "Condition",
  "PatternTest",
  "Alternatives",
  "Except",
  "Pattern",
  "Hold",
  "Evaluate",
  "EvenQ",
  "OddQ",
  "IntegerQ",
  "Clear",
  "Unset",
  "Attributes",
  "SetAttributes",
  "ClearAttributes",
]);

export const wlLanguage = StreamLanguage.define({
  name: "wolfram",
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match("(*")) {
      while (!stream.eol()) {
        if (stream.match("*)")) return "comment";
        stream.next();
      }
      return "comment";
    }
    if (stream.match(/^"([^"\\]|\\.)*"/)) return "string";
    if (stream.match(/^[0-9]+/)) return "number";
    if (stream.match(/^[A-Za-z$][A-Za-z0-9$]*_+[A-Za-z0-9$]*/))
      return "variableName";
    if (stream.match(/^_+[A-Za-z0-9$]*/)) return "variableName";
    if (stream.match(/^#[0-9]*/)) return "variableName";
    if (stream.match(/^[A-Za-z$][A-Za-z0-9$]*/)) {
      const word = stream.current();
      return builtins.has(word) ? "keyword" : null;
    }
    if (
      stream.match(
        /^(:=|\^:=|->|:>|\/\.|\/\/\.|\/;|==|!=|<=|>=|&&|\|\||\/@|@@|\/\/)/,
      )
    ) {
      return "operator";
    }
    if (stream.match(/^[()[\]{},]/)) return "bracket";
    stream.next();
    return null;
  },
  languageData: { commentTokens: { block: { open: "(*", close: "*)" } } },
});

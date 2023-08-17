import { parser } from "./syntax.grammar"
import {LRLanguage, LanguageSupport, foldNodeProp } from "@codemirror/language"
import { SyntaxNode } from "@lezer/common"
import { styleTags, tags as t } from "@lezer/highlight"

function foldDDNetConfig(node: SyntaxNode): {
    from: number;
    to: number;
} | null {
  const from = node.firstChild?.firstChild?.to // end of HeaderTok
  const to = node.to - 1 // before newline
  if (from) {
    return { from, to }
  } else {
    return null
  }
}

export const DDNetRulesLanguage = LRLanguage.define({
  parser: parser.configure({
    props: [
      foldNodeProp.add({
        Config: foldDDNetConfig
      }),
      styleTags({
        Header: t.heading,
        Int: t.integer,
        Float: t.float,
        Comment: t.lineComment,
        EndLine: t.invalid,
        "NewRun": t.keyword,
        "Index": t.keyword,
        "Pos": t.keyword,
        "Random": t.keyword,
        "NoDefaultRule": t.keyword,
        "NoLayerCopy": t.keyword,
        "XFLIP": t.modifier,
        "YFLIP": t.modifier,
        "ROTATE": t.modifier,
        "INDEX": t.modifier,
        "NOTINDEX": t.modifier,
        "EMPTY": t.modifier,
        "FULL": t.modifier,
        "OR": t.modifier,
      })
    ]
  }),
  languageData: {
    commentTokens: {line: "#"}
  }
})

export function DDNetRules() {
  return new LanguageSupport(DDNetRulesLanguage)
}

import { parser } from "./syntax.grammar"
import {LRLanguage, LanguageSupport, foldNodeProp } from "@codemirror/language"
import { SyntaxNode } from "@lezer/common"
import { styleTags, tags as t } from "@lezer/highlight"

function foldRppConfig(node: SyntaxNode): {
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

export const RppLanguage = LRLanguage.define({
  parser: parser.configure({
    props: [
      foldNodeProp.add({
        Config: foldRppConfig
      }),
      styleTags({
        LineComment: t.lineComment,
        String: t.string,
        Preprocessor: t.meta,
        Rotation: t.keyword,
        Literal: t.number,
        Keyword: t.keyword,
        Ident: t.variableName,
        Type: t.typeName,
        Function: t.definition(t.variableName), // not really but I want colors
      })
    ]
  }),
  languageData: {
    commentTokens: {line: "#"}
  }
})

export function Rpp() {
  return new LanguageSupport(RppLanguage)
}

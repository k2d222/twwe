import { syntaxTree } from "@codemirror/language"
import { linter} from "@codemirror/lint"

import {
  lint as lintAutomapper,
  LintLevel,
} from '../../../twmap/automap'

export const DDNetRulesLinter = linter(view => {
  const str = view.state.doc.toString()
  const lints = lintAutomapper(str)

  return lints.map(l => {
    const line = view.state.doc.line(l.line + 1)
    const severity = l.level === LintLevel.Warning ? 'warning' : 'error'
    let message = l.reason
    if (l.note) message += ' (' + l.note + ')'

    return {
      from: line.from + l.range[0],
      to: line.from + l.range[1],
      severity,
      message,
    }
  })
})
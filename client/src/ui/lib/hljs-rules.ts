import type { HLJSApi, Language } from 'highlight.js'

export default function(hljs: HLJSApi): Language {
  return {
    name: 'ddnet automapper rules',
    keywords: {
      keyword: 'NewRun Index Pos NoDefaultRule NoLayerCopy, Random',
      literal: 'XFLIP YFLIP ROTATE EMPTY FULL INDEX NOTINDEX NONE OR'
    },
    contains: [
      hljs.COMMENT('#', '\n'),
      {
        scope: 'number',
        begin: /[\+\-]?\d+/, // scanf("%d")
      }
    ]
  }
}

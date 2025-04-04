import { LRParser } from '@lezer/lr'
import { LRLanguage, foldNodeProp, LanguageSupport } from '@codemirror/language'
import { styleTags, tags } from '@lezer/highlight'

// This file was generated by lezer-generator. You probably shouldn't edit it.
const spec_Ident = {
  __proto__: null,
  anchor: 32,
  and: 34,
  assert: 36,
  automapper: 38,
  break: 40,
  continue: 42,
  count: 44,
  empty: 46,
  end: 48,
  error: 50,
  false: 52,
  for: 54,
  full: 56,
  function: 58,
  group: 60,
  if: 62,
  index: 64,
  insert: 66,
  invoke: 68,
  last: 70,
  nested: 72,
  newrule: 74,
  newrun: 76,
  nocopy: 78,
  nodefault: 80,
  not: 82,
  notindex: 84,
  null: 86,
  operator: 88,
  or: 90,
  pos: 92,
  preset: 94,
  random: 96,
  return: 98,
  rotate: 100,
  rule: 102,
  to: 104,
  true: 106,
  type: 108,
  warning: 110,
  array: 112,
  bool: 114,
  coord: 116,
  float: 118,
  int: 120,
  object: 122,
  range: 124,
  string: 126,
  N: 128,
  V: 130,
  H: 132,
  R: 134,
  VR: 136,
  VH: 138,
  HR: 140,
  VHR: 142,
}
const parser = LRParser.deserialize({
  version: 14,
  states: "!QQYQPOOOOQO'#Cb'#CbOOQO'#Cd'#CdOOQO'#Ce'#CeOOQO'#Ck'#CkOOQO'#Cg'#CgQYQPOOOOQO-E6e-E6e",
  stateData:
    '%Z~O^OSPOS~ORSOSSOTSOVSOYSO`POaPObPOcPOdPOePOfPOgPOhPOiPOjPOkPOlPOmPOnPOoPOpPOqPOrPOsPOtPOuPOvPOwPOxPOyPOzPO{PO|PO}PO!OPO!PPO!QPO!RPO!SPO!TPO!UPO!VPO!WPO!XPO!YQO!ZQO![QO!]QO!^QO!_QO!`QO!aQO!bRO!cRO!dRO!eRO!fRO!gRO!hRO!iRO~O',
  goto: 'o`PPPPPPaPaaPePPPkTSOUQUORVUTTOU',
  nodeNames: '⚠ LineComment file Preprocessor Literal String Keyword Ident Type Rotation Function',
  maxTerm: 71,
  skippedNodes: [0, 1],
  repeatNodeCount: 1,
  tokenData:
    "'g~RdX^!apq!ars#Ust$|{|%h}!O%h!O!P%q!P!Q&[!Q![&P![!]&y!c!}'X#T#o&y#y#z!a$f$g!a#BY#BZ!a$IS$I_!a$I|$JO!a$JT$JU!a$KV$KW!a&FU&FV!a~!fY^~X^!apq!a#y#z!a$f$g!a#BY#BZ!a$IS$I_!a$I|$JO!a$JT$JU!a$KV$KW!a&FU&FV!a~#ZWT~OY#UZr#Urs#ss#O#U#O#P#x#P;'S#U;'S;=`$v<%lO#U~#xOT~~#{RO;'S#U;'S;=`$U;=`O#U~$ZXT~OY#UZr#Urs#ss#O#U#O#P#x#P;'S#U;'S;=`$v;=`<%l#U<%lO#U~$yP;=`<%l#U~%RTR~OY$|Zr$|s;'S$|;'S;=`%b<%lO$|~%eP;=`<%l$|~%kQ!O!P%q!Q![&P~%tP!Q![%w~%|PS~!Q![%w~&UQS~!O!P%w!Q![&P~&_P!P!Q&b~&gSP~OY&bZ;'S&b;'S;=`&s<%lO&b~&vP;=`<%l&b~'ORV~![!]&y!c!}&y#T#o&y~'^RY~![!]'X!c!}'X#T#o'X",
  tokenizers: [0],
  topRules: { file: [0, 2] },
  specialized: [{ term: 7, get: value => spec_Ident[value] || -1 }],
  tokenPrec: 0,
})

function foldRppConfig(node) {
  var _a, _b
  const from =
    (_b = (_a = node.firstChild) === null || _a === void 0 ? void 0 : _a.firstChild) === null ||
    _b === void 0
      ? void 0
      : _b.to // end of HeaderTok
  const to = node.to - 1 // before newline
  if (from) {
    return { from, to }
  } else {
    return null
  }
}
const RppLanguage = LRLanguage.define({
  parser: parser.configure({
    props: [
      foldNodeProp.add({
        Config: foldRppConfig,
      }),
      styleTags({
        LineComment: tags.lineComment,
        String: tags.string,
        Preprocessor: tags.meta,
        Rotation: tags.keyword,
        Literal: tags.number,
        Keyword: tags.keyword,
        Ident: tags.variableName,
        Type: tags.typeName,
        Function: tags.definition(tags.variableName), // not really but I want colors
      }),
    ],
  }),
  languageData: {
    commentTokens: { line: '#' },
  },
})
function Rpp() {
  return new LanguageSupport(RppLanguage)
}

export { Rpp, RppLanguage }

import { TilesLayer } from './tilesLayer'
import * as Info from './types'

/// This file contains parsing and linting of automapper files, and application to tileslayers.

export type Automapper = Config[]

export class Config {
  name: string
  runs: Run[]
}

export interface Run {
  layerCopy: boolean
  indexRules: IndexRule[]
}

export interface IndexRule {
  tile: Info.Tile
  rules: Rule[]
}

export type Rule = PosRule | RandomRule

export interface PosRule {
  offset: Info.Coord
  states: TileState[]
  invert: boolean // whether to invert state matches, e.g. state.id = 0 will match all tiles with id != 0. (NOTINDEX)
}

export const defaultPosRule: PosRule = {
  offset: { x: 0, y: 0 },
  states: [{ id: 0 }],
  invert: true,
}

export interface TileState {
  id: number
  vFlip?: boolean
  hFlip?: boolean
  rotate?: boolean
}

export interface RandomRule {
  coef: number
}

// monadic result type à la rust.

type Result<T, E> =
  | {
      success: true
      content: T
    }
  | {
      success: false
      content: E
    }

function ok<T>(content: T): Result<T, any> {
  return { success: true, content }
}

function err<T>(content: T): Result<any, T> {
  return { success: false, content }
}

/// lexer

// range of characters in a line.
// range delimits space between characters:
//  - range [0, 0] is an empty range at the start of the line
//  - range [0, 1] contains the first character
type Range = [number, number]

enum TokenErrorKind {
  MissingToken,
  InvalidNumber,
  InvalidHeader,
}

interface TokenError {
  range: Range
  line: number
  reason: TokenErrorKind
  note?: string
}

function tokError(reason: TokenErrorKind, line: number, range: Range, note?: string): TokenError {
  return { range, line, reason, note }
}

// export enum Keyword {
//   NewRun,
//   Index,
//   XFLIP, YFLIP, ROTATE,
//   Pos,
//   EMPTY, FULL,
//   INDEX, NOTINDEX,
//   NONE, OR,
//   Random,
//   NoDefaultRule,
//   NoLayerCopy,
// }

type Token = { line: number; range: Range } & (
  | { word: string }
  | { header: string }
  | { float: number }
  | { int: number }
)

class FileReader {
  state: {
    line: number
    token: number
  }
  lines: string[]

  constructor(content: string) {
    this.state = {
      line: -1, // call to nextline() follows
      token: 0,
    }
    this.lines = content.split(/\r?\n/)

    this.nextLine()
  }

  nextLine() {
    this.state.line++
    this.state.token = 0

    // ignore comments, newlines etc.
    while (this.state.line < this.lines.length) {
      const line = this.lines[this.state.line]
      if (line === '' || /^\s*#/.test(line) || /^\s+$/.test(line)) this.state.line++
      else break
    }
  }

  token(): Result<Token, TokenError> {
    if (this.state.line >= this.lines.length) {
      return err(tokError(TokenErrorKind.MissingToken, this.state.line, [0, 0]))
    }

    const line = this.lines[this.state.line].substring(this.state.token)

    if (line === '' || /^\s*#/.test(line)) {
      const range: Range = [this.state.token, this.state.token]
      return err(tokError(TokenErrorKind.MissingToken, this.state.line, range))
    } else if (line[0] === '[') {
      const end = line.indexOf(']')

      if (end === -1) {
        const range: Range = [this.state.token, this.state.token + line.length]
        this.state.token = range[1]
        return err(
          tokError(
            TokenErrorKind.InvalidHeader,
            this.state.line,
            range,
            'Missing closing bracket "]"'
          )
        )
      } else {
        const range: Range = [this.state.token, this.state.token + end + 1]
        this.state.token = range[1]
        return ok({ header: line.substring(1, end), line: this.state.line, range })
      }
    } else if (/^[-+]?[\d\.]+%?/.test(line)) {
      let str = line.split(/\s/)[0]
      const range: Range = [this.state.token, this.state.token + str.length]
      this.state.token = range[1] + 1 // add a single space

      if (str[str.length - 1] === '%') {
        const num = Number(str.substring(0, str.length - 1))
        if (isNaN(num)) return err(tokError(TokenErrorKind.InvalidNumber, this.state.line, range))
        else return ok({ float: num / 100.0, line: this.state.line, range })
      } else {
        const num = Number(str)
        if (isNaN(num)) return err(tokError(TokenErrorKind.InvalidNumber, this.state.line, range))
        else if (str.indexOf('.') === -1) return ok({ int: num, line: this.state.line, range })
        else return ok({ float: num, line: this.state.line, range })
      }
    } else {
      const word = line.split(/\s/)[0]
      const range: Range = [this.state.token, this.state.token + word.length]
      this.state.token = range[1] + 1 // add a single space
      return ok({ range, line: this.state.line, word })
    }
  }

  peek() {
    const tok = this.state.token
    const res = this.token()
    this.state.token = tok
    return res
  }

  lineEmpty() {
    const tok = this.peek()
    return tok.success === false && tok.content.reason === TokenErrorKind.MissingToken
  }

  empty() {
    return (
      this.state.line >= this.lines.length ||
      (this.state.line === this.lines.length - 1 &&
        this.lines[this.state.line].length <= this.state.token)
    )
  }
}

/// linting

export enum LintLevel {
  Warning,
  Error,
}

export interface Lint {
  line: number
  range: Range
  level: LintLevel
  reason: string
  note?: string
}

function lintWarn(reason: string, line: number, range: Range, note?: string): Lint {
  return { level: LintLevel.Warning, line, range, reason, note }
}

function lintErr(reason: string, line: number, range: Range, note?: string): Lint {
  return { level: LintLevel.Error, line, range, reason, note }
}

// linter functions
// linter functions expect reader to be at the start of the line and return the reader
// after the last consumed token.

function lintHeader(reader: FileReader): Lint[] {
  const errs: Lint[] = []
  const tok = reader.token()

  if (!tok.success || !('header' in tok.content))
    errs.push(
      lintErr(
        'Expected a configuration name',
        reader.state.line,
        tok.content.range,
        'Configuration name are written in square brackets, e.g. "[my config]"'
      )
    )

  return errs
}

function lintIndex(reader: FileReader): Lint[] {
  const errs: Lint[] = []
  let tok = reader.token()

  if (!tok.success || !('word' in tok.content) || tok.content.word !== 'Index') {
    errs.push(lintErr('Expected "Index"', reader.state.line, tok.content.range))
    return errs
  }

  tok = reader.token()
  if (!tok.success || !('int' in tok.content)) {
    errs.push(lintErr('Expected a tile id', reader.state.line, tok.content.range))
    return errs
  }

  let xflip = false,
    yflip = false,
    rotate = false

  while (!reader.lineEmpty()) {
    tok = reader.token()
    const validToks = ['XFLIP', 'YFLIP', 'ROTATE']

    if (!tok.success || !('word' in tok.content) || !validToks.includes(tok.content.word)) {
      errs.push(
        lintErr(
          'Unexpected token',
          reader.state.line,
          tok.content.range,
          'Expected one of ' + validToks.map(t => '"' + t + '"').join(', ')
        )
      )
    } else if (tok.content.word === 'XFLIP') {
      if (xflip) errs.push(lintWarn('Duplicate "XFLIP"', reader.state.line, tok.content.range))
      else xflip = true
    } else if (tok.content.word === 'YFLIP') {
      if (yflip) errs.push(lintWarn('Duplicate "YFLIP"', reader.state.line, tok.content.range))
      else yflip = true
    } else if (tok.content.word === 'ROTATE') {
      if (rotate) errs.push(lintWarn('Duplicate "ROTATE"', reader.state.line, tok.content.range))
      else rotate = true
    }
  }

  return errs
}

function lintPos(reader: FileReader): Lint[] {
  const errs: Lint[] = []

  let tok = reader.token()
  if (!tok.success || !('word' in tok.content) || tok.content.word !== 'Pos') {
    errs.push(lintErr('Expected "Pos"', reader.state.line, tok.content.range))
    return errs
  }

  // offset
  tok = reader.token()
  if (!tok.success || !('int' in tok.content))
    errs.push(
      lintErr(
        'Expected position x-offset',
        reader.state.line,
        tok.content.range,
        '"Pos" must be followed by a x-offset, then a y-offset, e.g. "Pos -1 1"'
      )
    )
  tok = reader.token()
  if (!tok.success || !('int' in tok.content))
    errs.push(
      lintErr(
        'Expected position y-offset',
        reader.state.line,
        tok.content.range,
        '"Pos" must be followed by a x-offset, then a y-offset, e.g. "Pos -1 1"'
      )
    )

  // rule
  tok = reader.token()
  const validToks = ['EMPTY', 'FULL', 'INDEX', 'NOTINDEX']

  if (!tok.success || !('word' in tok.content) || !validToks.includes(tok.content.word))
    errs.push(
      lintErr(
        'Unexpected token',
        reader.state.line,
        tok.content.range,
        'Expected one of ' + validToks.map(t => '"' + t + '"').join(', ')
      )
    )
  else if (tok.content.word === 'INDEX' || tok.content.word === 'NOTINDEX') {
    tok = reader.token()
    if (!tok.success || !('int' in tok.content))
      errs.push(
        lintErr(
          'Expected a tile index',
          reader.state.line,
          tok.content.range,
          '"INDEX" or "NOTINDEX" must be followed by a tile index, e.g. "INDEX 10"'
        )
      )

    let none = false,
      xflip = false,
      yflip = false,
      rotate = false

    while (!reader.lineEmpty()) {
      tok = reader.token()
      const validToks = ['XFLIP', 'YFLIP', 'ROTATE', 'OR', 'NONE']

      if (!tok.success || !('word' in tok.content) || !validToks.includes(tok.content.word)) {
        errs.push(
          lintErr(
            'Unexpected token',
            reader.state.line,
            tok.content.range,
            'Expected one of ' + validToks.map(t => '"' + t + '"').join(', ')
          )
        )
      } else if (tok.content.word === 'XFLIP') {
        if (xflip) errs.push(lintWarn('Duplicate "XFLIP"', reader.state.line, tok.content.range))
        else if (none)
          errs.push(
            lintWarn(
              '"ROTATE" after a "NONE"',
              reader.state.line,
              tok.content.range,
              '"NONE" conflicts with other flags'
            )
          )
        xflip = true
      } else if (tok.content.word === 'YFLIP') {
        if (yflip) errs.push(lintWarn('Duplicate "YFLIP"', reader.state.line, tok.content.range))
        else if (none)
          errs.push(
            lintWarn(
              '"ROTATE" after a "NONE"',
              reader.state.line,
              tok.content.range,
              '"NONE" conflicts with other flags'
            )
          )
        yflip = true
      } else if (tok.content.word === 'ROTATE') {
        if (rotate) errs.push(lintWarn('Duplicate "ROTATE"', reader.state.line, tok.content.range))
        else if (none)
          errs.push(
            lintWarn(
              '"ROTATE" after a "NONE"',
              reader.state.line,
              tok.content.range,
              '"NONE" conflicts with other flags'
            )
          )
        rotate = true
      } else if (tok.content.word === 'NONE') {
        if (none) errs.push(lintWarn('Duplicate "NONE"', reader.state.line, tok.content.range))
        else if (xflip || yflip || rotate)
          errs.push(
            lintWarn(
              '"NONE" preceded by a "XFLIP", "YFLIP" or "ROTATE"',
              reader.state.line,
              tok.content.range,
              '"NONE" conflicts with the previous flags'
            )
          )
        none = true
        xflip = yflip = rotate = false
      } else if (tok.content.word === 'OR') {
        tok = reader.token()
        if (!tok.success || !('int' in tok.content))
          errs.push(
            lintErr(
              'Expected a tile index',
              reader.state.line,
              tok.content.range,
              '"OR" must be followed by a tile index, e.g. "INDEX 3 OR 4"'
            )
          )
        xflip = yflip = rotate = none = false
      }
    }
  }

  return errs
}

function lintRandom(reader: FileReader): Lint[] {
  const errs: Lint[] = []

  let tok = reader.token()
  if (!tok.success || !('word' in tok.content) || tok.content.word !== 'Random') {
    errs.push(lintErr('Expected "Random"', reader.state.line, tok.content.range))
    return errs
  }

  tok = reader.token()
  if (!tok.success || (!('int' in tok.content) && !('float' in tok.content))) {
    errs.push(lintErr('Expected a number', reader.state.line, tok.content.range))
    return errs
  }

  return errs
}

function lintAutomapper(reader: FileReader): Lint[] {
  const errs = lintHeader(reader)

  if (!reader.lineEmpty()) {
    const range: Range = [reader.state.token, reader.lines[reader.state.line].length]
    console.log(reader.lines[reader.state.line], reader.lines[reader.state.line])
    errs.push(lintWarn('Expected end of line', reader.state.line, range))
  }
  reader.nextLine()

  let noLayerCopy = false
  let noDefaultRule = false
  let indexRule = false

  while (!reader.empty()) {
    let tok = reader.token()

    if (tok.success && 'header' in tok.content) {
      // finished config
      if (!indexRule)
        errs.push(lintWarn('Previous config is empty', reader.state.line, tok.content.range))
      reader.state.token = 0
      return errs
    }

    const validToks = ['NoLayerCopy', 'Index']
    if (indexRule) validToks.push('NewRun', 'Pos', 'Random', 'NoDefaultRule')

    if (!tok.success || !('word' in tok.content) || !validToks.includes(tok.content.word))
      errs.push(
        lintErr(
          'Unexpected token',
          reader.state.line,
          tok.content.range,
          'Expected one of ' + validToks.map(t => '"' + t + '"').join(', ')
        )
      )
    else if (tok.content.word === 'NoLayerCopy') {
      if (noLayerCopy)
        errs.push(lintWarn('Duplicate "NoLayerCopy"', reader.state.line, tok.content.range))
      else noLayerCopy = true
    } else if (tok.content.word === 'Index') {
      reader.state.token = 0
      errs.push(...lintIndex(reader))
      indexRule = true
    } else if (tok.content.word === 'NewRun') {
      // TODO
    } else if (tok.content.word === 'Pos') {
      reader.state.token = 0
      errs.push(...lintPos(reader))
    } else if (tok.content.word === 'Random') {
      reader.state.token = 0
      errs.push(...lintRandom(reader))
    } else if (tok.content.word === 'NoDefaultRule') {
      if (noDefaultRule)
        errs.push(lintWarn('Duplicate "NoDefaultRule"', reader.state.line, tok.content.range))
      else noDefaultRule = true
    }

    if (!reader.lineEmpty()) {
      const range: Range = [reader.state.token, reader.lines[reader.state.line].length]
      errs.push(lintWarn('Expected end of line', reader.state.line, range))
    }
    reader.nextLine()
  }

  return errs
}

export function lint(content: string): Lint[] {
  const reader = new FileReader(content)
  const errs: Lint[] = []

  while (!reader.empty()) {
    errs.push(...lintAutomapper(reader))
  }

  return errs
}

export function lintToString(lint: Lint): string {
  const level = lint.level === LintLevel.Error ? 'error' : 'warning'
  let str = `[${level}] line ${lint.line + 1}, chars ${lint.range[0]}-${lint.range[1]}: ${lint.reason}.`
  if (lint.note)
    str += ` Note: ${lint.note}`
  return str
}

/// parsing

export function parse(content: string): Config[] | null {
  const reader = new FileReader(content)

  const automappers: Config[] = []
  let automapper: Config | null = null
  let run: Run | null = null
  let indexRule: IndexRule | null = null
  let defaultRule = true

  function finishIndexRule() {
    if (indexRule && defaultRule) {
      indexRule.rules.push(defaultPosRule)
    }
    indexRule = null
    defaultRule = true
  }

  function newIndexRule(tile: Info.Tile) {
    finishIndexRule()
    indexRule = { tile, rules: [] }
    run.indexRules.push(indexRule)
  }

  function newRun() {
    finishIndexRule()
    run = { layerCopy: true, indexRules: [] }
    automapper.runs.push(run)
  }

  function newConfig(name: string) {
    automapper = { name, runs: [] }
    automappers.push(automapper)
    newRun()
  }

  while (!reader.empty()) {
    let tok = reader.token()

    if ('header' in tok.content) {
      const name = tok.content.header
      newConfig(name)
    }
    
    else if (!('word' in tok.content) || !automapper) {
      // invalid line, skip
      continue
    }
    
    else if (tok.content.word === 'NewRun') {
      newRun()
    }
    
    else if (tok.content.word === 'Index') {
      // id
      tok = reader.token()
      if (!tok.success || !('int' in tok.content)) return null
      const id = tok.content.int

      // flags
      let flags = 0
      do {
        tok = reader.token()
        if (tok.success && 'word' in tok.content) {
          if (tok.content.word === 'XFLIP') flags |= Info.TileFlags.VFLIP
          else if (tok.content.word === 'YFLIP') flags |= Info.TileFlags.HFLIP
          else if (tok.content.word === 'ROTATE') flags |= Info.TileFlags.ROTATE
        }
      } while (tok.success)

      const tile: Info.Tile = { id, flags }
      newIndexRule(tile)
    }
    
    else if (indexRule !== null && tok.content.word === 'Pos') {
      // offset
      tok = reader.token()
      if (!tok.success || !('int' in tok.content)) return null
      const x = tok.content.int
      tok = reader.token()
      if (!tok.success || !('int' in tok.content)) return null
      const y = tok.content.int
      const offset = { x, y }

      if (x === 0 && y === 0) {
        defaultRule = false
      }

      // rule
      tok = reader.token()
      if (!tok.success || !('word' in tok.content)) return null

      if (['EMPTY', 'FULL'].includes(tok.content.word)) {
        const rule: PosRule = {
          offset: { x, y },
          states: [{ id: 0 }],
          invert: tok.content.word === 'FULL',
        }

        indexRule.rules.push(rule)
      }

      else if (['INDEX', 'NOTINDEX'].includes(tok.content.word)) {
        const invert = tok.content.word === 'NOTINDEX'

        // id
        tok = reader.token()
        if (!tok.success || !('int' in tok.content)) return null
        const id = tok.content.int

        let state: TileState = { id }
        const states = [state]

        // flags
        do {
          tok = reader.token()
          if (tok.success && 'word' in tok.content) {
            if (tok.content.word === 'XFLIP') {
              state.vFlip = true
              if (!('hFlip' in state)) state.hFlip = false
              if (!('rotate' in state)) state.rotate = false
            } else if (tok.content.word === 'YFLIP') {
              if (!('vFlip' in state)) state.vFlip = false
              state.hFlip = true
              if (!('rotate' in state)) state.rotate = false
            } else if (tok.content.word === 'ROTATE') {
              if (!('vFlip' in state)) state.vFlip = false
              if (!('hFlip' in state)) state.hFlip = false
              state.rotate = true
            } else if (tok.content.word === 'NONE') {
              state.vFlip = false
              state.hFlip = false
              state.rotate = false
            } else if (tok.content.word === 'OR') {
              // id
              tok = reader.token()
              if (!tok.success || !('int' in tok.content)) return null
              const id = tok.content.int
              state = { id }
              states.push(state)
            }
          }
        } while (tok.success)

        const rule: PosRule = { offset, states, invert }
        indexRule.rules.push(rule)
      }
    }
    
    else if (indexRule !== null && tok.content.word === 'Random') {
      tok = reader.token()
      let coef = 1.0
      if (tok.success && 'float' in tok.content) coef = tok.content.float
      else if (tok.success && 'int' in tok.content) coef = 1.0 / tok.content.int
      const rule: RandomRule = { coef }
      indexRule.rules.push(rule)
    }
    
    else if (indexRule !== null && tok.content.word === 'NoDefaultRule') {
      defaultRule = false
    }
    
    else if (run !== null && tok.content.word === 'NoLayerCopy') {
      run.layerCopy = false
    }

    reader.nextLine()
  }

  finishIndexRule()

  return automappers
}

/// apply automapper

// implementation taken from ddnet source code and adpted to js.
// Based on triple32inc from https://github.com/skeeto/hash-prospector/tree/79a6074062a84907df6e45b756134b74e2956760
function hashUint32(num: number) {
  num++
  num ^= num >> 17
  num *= 0xed5ad4bb
  num ^= num >> 11
  num *= 0xac4c1b51
  num ^= num >> 15
  num *= 0x31848bab
  num ^= num >> 14
  return num
}

const HASH_MAX = 65536
const RAND_MAX = 2147483647

// implementation taken from ddnet source code and adpted to js.
function hashLocation(seed: number, run: number, rule: number, x: number, y: number) {
  const prime = 31
  let hash = 1
  hash = hash * prime + hashUint32(seed)
  hash = hash * prime + hashUint32(run)
  hash = hash * prime + hashUint32(rule)
  hash = hash * prime + hashUint32(x)
  hash = hash * prime + hashUint32(y)
  hash = hashUint32(hash * prime) // Just to double-check that values are well-distributed
  return hash % HASH_MAX
}

function cloneLayer(layer: TilesLayer) {
  const clone = new TilesLayer()
  clone.init(layer.width, layer.height, i => TilesLayer.cloneTile(layer.tiles[i]))
  return clone
}

function tileMatches(tile: Info.Tile, test: TileState) {
  if (tile.id !== test.id) return false
  const vFlip = (tile.flags & Info.TileFlags.VFLIP) !== 0
  const hFlip = (tile.flags & Info.TileFlags.HFLIP) !== 0
  const rotate = (tile.flags & Info.TileFlags.ROTATE) !== 0
  if ('vFlip' in test && test.vFlip !== vFlip) return false
  else if ('hFlip' in test && test.hFlip !== hFlip) return false
  else if ('rotate' in test && test.rotate !== rotate) return false
  return true
}

function inBounds(x: number, y: number, w: number, h: number) {
  return x >= 0 && y >= 0 && x < w && y < h
}

const outTile: Info.Tile = {
  id: -1,
  flags: 0,
}

function posRuleMatches(rule: PosRule, layer: TilesLayer, x: number, y: number) {
  const xx = x + rule.offset.x
  const yy = y + rule.offset.y

  const tile = inBounds(xx, yy, layer.width, layer.height)
    ? layer.getTile(xx, yy)
    : outTile

  return rule.invert
    ? rule.states.every(s => !tileMatches(tile, s))
    : rule.states.some(s => tileMatches(tile, s))
}

export function automap(layer: TilesLayer, automapper: Config, seed: number) {
  if (seed === 0) seed = Math.floor(Math.random() * RAND_MAX)

  let r1 = 0
  for (const run of automapper.runs) {
    let srcLayer = run.layerCopy ? cloneLayer(layer) : layer

    for (let y = 0; y < layer.height; y++) {
      for (let x = 0; x < layer.height; x++) {
        let r2 = 0
        for (const irule of run.indexRules) {
          let match = true

          for (const rule of irule.rules) {
            if ('coef' in rule) {
              match = hashLocation(seed, r1, r2, x, y) < HASH_MAX * rule.coef
            } else {
              match = posRuleMatches(rule, srcLayer, x, y)
            }
            if (!match)
              break
          }

          if (match) {
            layer.setTile(x, y, TilesLayer.cloneTile(irule.tile))
          }

          r2++
        }
      }
    }
    r1++
  }
}

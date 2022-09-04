import { TilesLayer } from "./tilesLayer"
import * as Info from "./types"


/// This file contains parsing and linting of automapper files, and application to tileslayers.

export class Automapper {
  name: string
  runs: Run[]
}

export interface Run {
  layerCopy: boolean
  indexRules: IndexRule[]
}

export interface IndexRule {
  tile: Info.Tile,
  rules: Rule[],
  defaultRule: boolean,
}

export type Rule = PosRule | RandomRule

export interface PosRule {
  offset: Info.Coord,
  states: TileState[],
  invert: boolean, // whether to invert state matches, e.g. state.id = 0 will match all tiles with id != 0.
}

export const defaultPosRule: PosRule = {
  offset: { x: 0, y: 0 },
  states: [{ id: 0 }],
  invert: true
}

export interface TileState {
  id: number,
  vFlip?: boolean,
  hFlip?: boolean,
  rotate?: boolean,
}

export interface RandomRule {
  coef: number
}

// monadic result type à la rust.

type Result<T, E> = {
  success: true,
  content: T,
} | {
  success: false,
  content: E,
}

function ok<T>(content: T): Result<T, any> {
  return { success: true, content }
}

function err<T>(content: T): Result<any, T> {
  return { success: false, content }
}

/// lexer

type Range = [number, number]

enum TokenErrorKind {
  MissingToken,
  InvalidNumber,
  InvalidHeader,
}

interface TokenError {
  range: Range,
  reason: TokenErrorKind,
  note?: string,
}

function tokError(reason: TokenErrorKind, range: Range, note?: string): TokenError {
  return { range, reason, note }
}
  
// export enum Keyword {
//   NewRun,
//   XFLIP, YFLIP, ROTATE,
//   Pos,
//   EMPTY, FULL, 
//   INDEX, NOTINDEX,
//   NONE, OR,
//   NoDefaultRule,
//   NoLayerCopy,
// }

type Token = { range: Range } & ({ word: string } | { header: string } | { float: number } | { int: number })

class FileReader {
  state: {
    line: number,
    token: number,
  }
  lines: string[]

  constructor(content: string) {
    this.state = {
      line: 0,
      token: 0,
    }
    this.lines = content
      .split('\n')
      .filter(l => l.length !== 0)
  }
  
  nextLine() {
    this.state.line++
    this.state.token = 0
  }
  
  token(): Result<Token, TokenError> {
    if (this.state.line >= this.lines.length)
      return null

    const line = this.lines[this.state.line].substring(this.state.token)
    
    if (line === '') {
      const range: Range = [this.state.token, this.state.token + 1]
      return err(tokError(TokenErrorKind.MissingToken, range))
    }
    
    // lexing

    if (line[0] === '[') {
      const end = line.indexOf(']')

      if (end === -1) {
        const range: Range = [this.state.token, this.state.token + line.length]
        this.state.token = range[1]
        return err(tokError(TokenErrorKind.InvalidHeader, range, 'Missing closing bracket "]"'))
      }
      else {
        const range: Range = [this.state.token, this.state.token + end]
        this.state.token = range[1]
        return ok({ header: line.substring(1, end), range })
      }
    }
    
    else if ('0' <= line[0] && line[0] <= '9') {
      let str = line.split(' ')[0]
      const range: Range = [this.state.token, this.state.token + str.length]
      this.state.token = range[1]
      
      if (/^\d+$/.test(str)) {
        const num = Number(str)
        if (isNaN(num))
          return err(tokError(TokenErrorKind.InvalidNumber, range))
        else
          return ok({ int: num / 100.0, range })
      }
      if (str[str.length - 1] === '%') {
        const num = Number(str.substring(0, str.length - 1))
        if (isNaN(num))
          return err(tokError(TokenErrorKind.InvalidNumber, range))
        else
          return ok({ float: num / 100.0, range })
      }
      else {
        const num = Number(str)
        if (isNaN(num))
          return err(tokError(TokenErrorKind.InvalidNumber, range))
        else
          return ok({ float: 1.0 / num, range })
      }
    }
    
    else {
      const word = line.split(' ')[0]
      const range: Range = [this.state.token, this.state.token + word.length]
      this.state.token = range[1]
      return ok({ range, word })
    }
  }
  
  lineEmpty() {
    return this.state.line < this.lines.length
        && this.lines[this.state.line].length <= this.state.token
  }
  
  empty() {
    return this.state.line >= this.lines.length
        || this.state.line === this.lines.length - 1
        && this.lines[this.state.line].length <= this.state.token
  }
}

/// linting

// export enum LintLevel { Warning, Error }

// export interface Lint {
//   range: Range,
//   level: LintLevel,
//   reason: string,
//   note?: string,
// }

// function lintWarn(reason: string, range: Range, note?: string): Lint {
//   return { level: LintLevel.Warning, range, reason, note }
// }

// function lintErr(reason: string, range: Range, note?: string): Lint {
//   return { level: LintLevel.Error, range, reason, note }
// }

// linter functions
// linter functions expect reader to be at the start of the line and return the reader at
// the start of the following line.

// function lintHeader(reader: FileReader): Lint[] {
//   const errs: Lint[] = []
//   const tok = reader.token()

//   if (!tok.success || !('header' in tok.content))
//     errs.push(lintErr('Expected a configuration name', tok.content.range, 'Configuration name are written in square brackets, e.g. "[my config]"'))

//   if (!reader.lineEmpty()) {
//     const range: Range = [reader.state.token, reader.lines[reader.state.line].length]
//     errs.push(lintWarn('Expected end of line', range))
//   }

//   reader.nextLine()
//   return errs
// }

// function lintAutomapper(reader: FileReader): Lint[] {
//   const errs = lintHeader(reader)
//   let noLayerCopy = false

//   {
//     const validToks = ['NoLayerCopy', 'Index']
//     const tok = reader.token()

//     if (!tok.success || !('word' in tok.content) || !validToks.includes(tok.content.word))
//       errs.push(lintErr('Unexpected token', tok.content.range, 'Expected one of ' + validToks.map(t => '"' + t + '"').join(', ')))

//     else if (tok.content.word === 'NoLayerCopy') {
//       noLayerCopy = true
//       errs.push(lintInfo('Duplicate "NoLayerCopy"'))
//     }
//   }
//   {
//     const validToks = ['NoLayerCopy', 'Index']
//     const tok = reader.token()

//     if (!tok.success || !('word' in tok.content) || !validToks.includes(tok.content.word))
//       errs.push(lintErr('Unexpected token', tok.content.range, 'Expected one of ' + validToks.map(t => '"' + t + '"').join(', ')))
//   }


//   return errs
// }

// export function lint(content: string): Lint[] {
//   const reader = new FileReader(content)
//   const errs: Lint[] = []
  
//   while(!reader.empty()) {
//     errs.push(...lintAutomapper(reader))
//   }
  
//   return errs
// }

/// parsing

export function parse(content: string): Automapper[] {
  const reader = new FileReader(content)
  
  const automappers: Automapper[] = []
  let automapper: Automapper | null = null
  let run: Run | null = null 
  let indexRule: IndexRule | null = null
  
  let tok = reader.token()
  while (tok.success) {
    if ('header' in tok.content) {
      let tok = reader.token()
      if (!tok.success || !('header' in tok.content))
        return null
      const name = tok.content.header
      
      indexRule = null
      run = { layerCopy: true, indexRules: [] }
      automapper = { name, runs: [run] }
    }
    else if (!('word' in tok.content) || !automapper) { // invalid line, skip
      continue
    }
    else if (tok.content.word === 'NewRun') {
      run = { layerCopy: true, indexRules: [] }
      automapper.runs.push(run)
      indexRule = null
    }
    else if (tok.content.word === 'Index') {
      // id
      tok = reader.token()
      if (!tok.success || !('int' in tok.content))
        return null
      const id = tok.content.int

      // flags
      let flags = 0
      do {
        tok = reader.token()
        if (tok.success && 'word' in tok.content) {
          if (tok.content.word === 'XFLIP') flags &= Info.TileFlags.VFLIP
          else if (tok.content.word === 'YFLIP') flags &= Info.TileFlags.HFLIP
          else if (tok.content.word === 'ROTATE') flags &= Info.TileFlags.ROTATE
        }
      } while (tok.success)
      
      const tile: Info.Tile = { id, flags }
      indexRule = { tile, rules: [], defaultRule: true }
      run.indexRules.push(indexRule)
    }
    else if (indexRule !== null && tok.content.word === 'Pos') {
      // offset
      tok = reader.token()
      if (!tok.success || !('int' in tok.content))
        return null
      const x = tok.content.int
      tok = reader.token()
      if (!tok.success || !('int' in tok.content))
        return null
      const y = tok.content.int
      const offset = { x, y }
  
      // rule
      tok = reader.token()
      if (!tok.success || !('word' in tok.content))
        return null

      if (['EMPTY', 'FULL'].includes(tok.content.word)) {
        const rule: PosRule = {
          offset: { x, y },
          states: [{ id: 0 }],
          invert: tok.content.word === 'FULL'
        }
        indexRule.rules.push(rule)
      }
      else if (['INDEX', 'NOTINDEX'].includes(tok.content.word)) {
        const invert = tok.content.word === 'NOTINDEX'

        // id
        tok = reader.token()
        if (!tok.success || !('int' in tok.content))
          return null
        const id = tok.content.int
    
        let state: TileState = { id }
        const states = [ state ]
    
        // flags
        do {
          tok = reader.token()
          if (tok.success && 'word' in tok.content) {
            if (tok.content.word === 'XFLIP') {
              state.vFlip = true
              if (!('hFlip' in state)) state.hFlip = false
              if (!('rotate' in state)) state.rotate = false
            }
            else if (tok.content.word === 'YFLIP') {
              if (!('vFlip' in state)) state.vFlip = false
              state.hFlip = true
              if (!('rotate' in state)) state.rotate = false
            }
            else if (tok.content.word === 'ROTATE') {
              if (!('vFlip' in state)) state.vFlip = false
              if (!('hFlip' in state)) state.hFlip = false
              state.rotate = true
            }
            else if (tok.content.word === 'NONE') {
              state.vFlip = false
              state.hFlip = false
              state.rotate = false
            }
            else if (tok.content.word === 'OR') {
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
      if (tok.success && 'float' in tok.content)
        coef = tok.content.float
      else if (tok.success && 'int' in tok.content)
        coef = tok.content.int
      const rule: RandomRule = { coef }
      indexRule.rules.push(rule)
    }
    else if (indexRule !== null && tok.content.word === 'NoDefaultRule') {
      indexRule.defaultRule = false
    }
    else if (run !== null && tok.content.word === 'NoLayerCopy') {
      run.layerCopy = false
    }

    reader.nextLine()
  }
  
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
  clone.init(layer.width, layer.height, (i) => TilesLayer.cloneTile(layer.tiles[i]))
  return clone
}

function tileMatches(tile: Info.Tile, test: TileState) {
  if (tile.id !== test.id) return false
  const vFlip = (tile.flags & Info.TileFlags.VFLIP) !== 0
  const hFlip = (tile.flags & Info.TileFlags.HFLIP) !== 0
  const rotate = (tile.flags & Info.TileFlags.ROTATE) !== 0
  if (('vFlip' in test) && test.vFlip !== vFlip) return false
  else if (('hFlip' in test) && test.hFlip !== hFlip) return false
  else if (('rotate' in test) && test.rotate !== rotate) return false
  return true
}

function posRuleMatches(rule: PosRule, layer: TilesLayer, x: number, y: number) {
  const tile = layer.getTile(x + rule.offset.x, y + rule.offset.y)
  return rule.invert
    ? rule.states.every(s => !tileMatches(tile, s))
    : rule.states.some(s => tileMatches(tile, s))
}

export function automap(layer: TilesLayer, automapper: Automapper, seed: number) {
  if (seed === 0)
    seed = Math.floor(Math.random() * RAND_MAX)
  
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
              match = match && hashLocation(seed, r1, r2, x, y) < HASH_MAX * rule.coef
            }
            else {
              match = match && posRuleMatches(rule, srcLayer, x, y)
            }
          }
          
          if (match) {
            layer.setTile(x, y, irule.tile)
          }
          
          r2++
        }
        
      }
    }
    r1++
  }
}

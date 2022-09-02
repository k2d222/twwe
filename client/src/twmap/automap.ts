import type * as Info from "./types"

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
}

export type Rule = PosRule | RandomRule

export interface PosRule {
  offset: Info.Coord,
  state: TileState,
  invert: boolean,
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

export class FileReader {
  state: {
    line: number,
    token: number,
  }
  lines: string[][]
  
  constructor(content: string) {
    this.state = {
      line: 0,
      token: 0,
    }
    this.lines = content
      .split('\n')
      .map(this.tokenize)
      .filter(l => l.length !== 0)
  }
  
  private tokenize(content: string): string[] {
    return content
      .split(' ')
  }
  
  nextLine() {
    this.state.line++
    this.state.token = 0
  }
  
  token(): string | null {
    if (this.state.line >= this.lines.length)
      return null

    const line = this.lines[this.state.line]
    
    if (this.state.token >= line.length)
      return null
    
    return line[this.state.token]
  }
}



export function parseFile(content: string): Automapper[] {
  let lines = content.split('\n')
  const res = []
  
  while (lines.length) {
    
  }
  
  return res
}
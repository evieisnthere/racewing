// Puzzle levels: tile maps parsed into walls and gimmicks, plus keys, gates, switches, barriers, checkpoints and a goal.
import { Course, region, type Segment } from './course';

export const TILE = 48;

/**
 * Map legend
 *   #  wall            .  floor            _  low wall (jump it)    ~  pit
 *   S  start           G  goal             +  checkpoint
 *   a b c  keys        A B C  gates (open with the matching key)
 *   *  switch (toggles every barrier)      =  barrier, closed at start     :  barrier, open at start
 *   > < ^ v  ramps (launch direction)
 *   i ice   m mud   t turbo   f control flip
 *   n e s w  gravity current pushing north/east/south/west
 *   O attractor well   X repulsor
 *   p/q, u/y  one-way portals (enter p, exit q)
 *   R spinning bar   H bar sliding horizontally   V bar sliding vertically
 */
export interface LevelDef {
  id: string;
  name: string;
  blurb: string;
  color: number;
  map: string[];
  /** Start heading in degrees (0 = east, 90 = south). */
  startAngle?: number;
  /** Waypoints in tile coordinates for the route bot (solvability check and medal times). */
  route: [number, number][];
}

export interface Key { x: number; y: number; id: string; taken: boolean }
export interface Gate { id: string; c: number; r: number }
export interface Switch { x: number; y: number; on: boolean }
export interface Barrier { c: number; r: number; closedAtStart: boolean }
export interface Checkpoint { x: number; y: number; angle: number; reached: boolean }

const SOLID = new Set(['#']);
const KEY_COLORS: Record<string, number> = { a: 0xffe14d, b: 0x2ef2ff, c: 0xff3df2 };
export const keyColor = (id: string): number => KEY_COLORS[id] ?? 0xffffff;

export class Level extends Course {
  readonly def: LevelDef;
  readonly cols: number;
  readonly rows: number;
  readonly keys: Key[] = [];
  readonly gates: Gate[] = [];
  readonly switches: Switch[] = [];
  readonly barriers: Barrier[] = [];
  readonly checkpoints: Checkpoint[] = [];
  readonly lowTiles: [number, number][] = [];
  readonly floor: [number, number][] = [];
  start = { x: 0, y: 0, angle: 0 };
  goal = { x: 0, y: 0, r: 26 };
  /** Barriers flip state each time a switch is hit. */
  toggled = false;
  readonly held = new Set<string>();

  constructor(def: LevelDef) {
    super();
    this.def = def;
    this.rows = def.map.length;
    this.cols = Math.max(...def.map.map((r) => r.length));
    const at = (c: number, r: number) => (r < 0 || r >= this.rows || c < 0 || c >= this.cols ? '#' : def.map[r][c] ?? '#');
    const cx = (c: number) => (c + 0.5) * TILE, cy = (r: number) => (r + 0.5) * TILE;
    const ang = ((def.startAngle ?? 0) * Math.PI) / 180;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const ch = at(c, r);
        if (ch === '#') continue;
        if (ch !== '_') this.floor.push([c, r]);
        const x = cx(c), y = cy(r);
        const rect = (x0 = c * TILE, y0 = r * TILE, w = TILE, h = TILE) => region([x0, y0, x0 + w, y0, x0 + w, y0 + h, x0, y0 + h]);
        switch (ch) {
          case 'S': this.start = { x, y, angle: ang }; break;
          case 'G': this.goal = { x, y, r: 26 }; break;
          case '+': this.checkpoints.push({ x, y, angle: 0, reached: false }); break;
          case 'a': case 'b': case 'c': this.keys.push({ x, y, id: ch, taken: false }); break;
          case 'A': case 'B': case 'C': this.gates.push({ id: ch.toLowerCase(), c, r }); break;
          case '*': this.switches.push({ x, y, on: false }); break;
          case '=': this.barriers.push({ c, r, closedAtStart: true }); break;
          case ':': this.barriers.push({ c, r, closedAtStart: false }); break;
          case '~': this.pits.push(rect()); break;
          case '_': this.lowTiles.push([c, r]); break;
          case 'i': this.surfaces.push({ ...rect(), kind: 'ice' }); break;
          case 'm': this.surfaces.push({ ...rect(), kind: 'mud' }); break;
          case 't': this.surfaces.push({ ...rect(), kind: 'turbo' }); break;
          case 'f': this.surfaces.push({ ...rect(), kind: 'flip' }); break;
          case '>': this.ramps.push({ ...rect(), dx: 1, dy: 0 }); break;
          case '<': this.ramps.push({ ...rect(), dx: -1, dy: 0 }); break;
          case '^': this.ramps.push({ ...rect(), dx: 0, dy: -1 }); break;
          case 'v': this.ramps.push({ ...rect(), dx: 0, dy: 1 }); break;
          case 'n': this.currents.push({ ...rect(), dx: 0, dy: -1, strength: 420 }); break;
          case 'e': this.currents.push({ ...rect(), dx: 1, dy: 0, strength: 420 }); break;
          case 's': this.currents.push({ ...rect(), dx: 0, dy: 1, strength: 420 }); break;
          case 'w': this.currents.push({ ...rect(), dx: -1, dy: 0, strength: 420 }); break;
          case 'O': this.wells.push({ x, y, radius: TILE * 3.4, strength: 400 }); break;
          case 'X': this.wells.push({ x, y, radius: TILE * 2.2, strength: -560 }); break;
          case 'R': this.hazards.push({ kind: 'spin', cx: x, cy: y, len: TILE * 2.6, speed: 1.3, phase: (c + r) * 0.7, arms: 1 }); break;
          case 'H': this.hazards.push({ kind: 'slide', cx: x, cy: y, len: TILE * 1.2, speed: 0.35, phase: c, ux: 1, uy: 0, amp: TILE * 1.4 }); break;
          case 'V': this.hazards.push({ kind: 'slide', cx: x, cy: y, len: TILE * 1.2, speed: 0.35, phase: r, ux: 0, uy: 1, amp: TILE * 1.4 }); break;
        }
      }
    }
    for (const [a, b] of [['p', 'q'], ['u', 'y']]) {
      const pa = this.find(a), pb = this.find(b);
      if (pa && pb) this.portals.push({ ax: cx(pa[0]), ay: cy(pa[1]), aAngle: 0, bx: cx(pb[0]), by: cy(pb[1]), bAngle: 0, r: 22, twoWay: false, color: a === 'p' ? 0x5ad1ff : 0xb06bff });
    }

    // Wall edges between solid ('#') or low ('_') tiles and open tiles, merged into runs.
    const kind = (c: number, r: number) => {
      const ch = at(c, r);
      return SOLID.has(ch) ? 2 : ch === '_' ? 1 : 0;
    };
    // Horizontal edges (between row r-1 and r).
    for (let r = 0; r <= this.rows; r++) {
      let run: { c0: number; up: boolean; low: boolean } | null = null;
      const flush = (c1: number) => {
        if (!run) return;
        const y = r * TILE;
        // Normal points into the open tile.
        this.addSegment({ ax: run.c0 * TILE, ay: y, bx: c1 * TILE, by: y, nx: 0, ny: run.up ? -1 : 1, low: run.low });
        run = null;
      };
      for (let c = 0; c <= this.cols; c++) {
        const above = c < this.cols ? kind(c, r - 1) : 0, below = c < this.cols ? kind(c, r) : 0;
        let edge: { up: boolean; low: boolean } | null = null;
        if (above > 0 && below === 0) edge = { up: false, low: above === 1 };
        else if (below > 0 && above === 0) edge = { up: true, low: below === 1 };
        if (run && (!edge || edge.up !== run.up || edge.low !== run.low)) flush(c);
        if (edge && !run) run = { c0: c, ...edge };
      }
    }
    for (let c = 0; c <= this.cols; c++) {
      let run: { r0: number; left: boolean; low: boolean } | null = null;
      const flush = (r1: number) => {
        if (!run) return;
        const x = c * TILE;
        this.addSegment({ ax: x, ay: run.r0 * TILE, bx: x, by: r1 * TILE, nx: run.left ? -1 : 1, ny: 0, low: run.low });
        run = null;
      };
      for (let r = 0; r <= this.rows; r++) {
        const lft = r < this.rows ? kind(c - 1, r) : 0, rgt = r < this.rows ? kind(c, r) : 0;
        let edge: { left: boolean; low: boolean } | null = null;
        if (lft > 0 && rgt === 0) edge = { left: false, low: lft === 1 };
        else if (rgt > 0 && lft === 0) edge = { left: true, low: rgt === 1 };
        if (run && (!edge || edge.left !== run.left || edge.low !== run.low)) flush(r);
        if (edge && !run) run = { r0: r, ...edge };
      }
    }
    this.finalizeGrid();
    this.reset();
  }

  private find(ch: string): [number, number] | null {
    for (let r = 0; r < this.rows; r++) {
      const c = this.def.map[r].indexOf(ch);
      if (c >= 0) return [c, r];
    }
    return null;
  }

  reset(): void {
    this.toggled = false;
    this.held.clear();
    for (const k of this.keys) k.taken = false;
    for (const s of this.switches) s.on = false;
    for (const cp of this.checkpoints) cp.reached = false;
    this.update(0);
  }

  barrierClosed(b: Barrier): boolean {
    return b.closedAtStart !== this.toggled;
  }

  gateClosed(g: Gate): boolean {
    return !this.held.has(g.id);
  }

  /** Closed gates and barriers are solid tile boxes. */
  protected extraDynamic(out: Segment[]): void {
    const box = (c: number, r: number) => {
      const x0 = c * TILE, y0 = r * TILE, x1 = x0 + TILE, y1 = y0 + TILE;
      out.push({ ax: x0, ay: y0, bx: x1, by: y0, nx: 0, ny: -1 });
      out.push({ ax: x1, ay: y0, bx: x1, by: y1, nx: 1, ny: 0 });
      out.push({ ax: x1, ay: y1, bx: x0, by: y1, nx: 0, ny: 1 });
      out.push({ ax: x0, ay: y1, bx: x0, by: y0, nx: -1, ny: 0 });
    };
    for (const g of this.gates ?? []) if (this.gateClosed(g)) box(g.c, g.r);
    for (const b of this.barriers ?? []) if (this.barrierClosed(b)) box(b.c, b.r);
  }

  /** Tile coordinates to world centre. */
  static at(c: number, r: number): [number, number] {
    return [(c + 0.5) * TILE, (r + 0.5) * TILE];
  }
}

// Shared world geometry for circuits (Track) and puzzle levels (Level): static wall segments in a spatial grid,
// moving/toggleable segments, and region-based gimmicks.

export interface Segment {
  ax: number; ay: number; bx: number; by: number;
  /** Normal pointing into the drivable side. Ignored for two-sided segments. */
  nx: number; ny: number;
  /** Low curb: airborne ships fly over it. */
  low?: boolean;
  /** Thin bar that collides from both sides (hazards). */
  twoSided?: boolean;
}

export interface Well { x: number; y: number; radius: number; strength: number }

export interface Region { poly: number[]; minX: number; minY: number; maxX: number; maxY: number }
export type SurfaceKind = 'ice' | 'mud' | 'turbo' | 'flip';
export interface Surface extends Region { kind: SurfaceKind }
/** Launches ships moving along (dx, dy) into the air. */
export interface Ramp extends Region { dx: number; dy: number }
/** World-space gravity current. */
export interface Current extends Region { dx: number; dy: number; strength: number }
export type Pit = Region;

export interface Portal {
  ax: number; ay: number; aAngle: number;
  bx: number; by: number; bAngle: number;
  r: number;
  twoWay: boolean;
  color: number;
}

export interface Hazard {
  kind: 'spin' | 'slide';
  cx: number; cy: number;
  /** Bar length. */
  len: number;
  /** spin: rad/s. slide: cycles/s. */
  speed: number;
  phase: number;
  /** slide: travel direction (unit) and half-travel distance; bar lies perpendicular to it. */
  ux?: number; uy?: number; amp?: number;
  arms?: number;
}

/** A snake-mode pickup that grows the tail. */
export interface Orb { x: number; y: number; cooldown: number }

const CELL = 96;

export interface RespawnInfo { idx: number; checkX: number; checkY: number; checkAngle: number }

export function region(poly: number[]): Region {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < poly.length; i += 2) {
    minX = Math.min(minX, poly[i]); maxX = Math.max(maxX, poly[i]);
    minY = Math.min(minY, poly[i + 1]); maxY = Math.max(maxY, poly[i + 1]);
  }
  return { poly, minX, minY, maxX, maxY };
}

export function inRegion(r: Region, x: number, y: number): boolean {
  if (x < r.minX || x > r.maxX || y < r.minY || y > r.maxY) return false;
  const p = r.poly;
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const yi = p[i + 1], yj = p[j + 1];
    if (yi > y !== yj > y && x < ((p[j] - p[i]) * (y - yi)) / (yj - yi) + p[i]) inside = !inside;
  }
  return inside;
}

/** Hazard bar endpoints at a given time: [ax, ay, bx, by] per arm. */
export function hazardBars(h: Hazard, time: number): number[][] {
  const out: number[][] = [];
  if (h.kind === 'spin') {
    const arms = h.arms ?? 1;
    for (let k = 0; k < arms; k++) {
      const a = h.phase + time * h.speed + (k * Math.PI) / arms;
      const dx = (Math.cos(a) * h.len) / 2, dy = (Math.sin(a) * h.len) / 2;
      out.push([h.cx - dx, h.cy - dy, h.cx + dx, h.cy + dy]);
    }
  } else {
    const ux = h.ux ?? 1, uy = h.uy ?? 0;
    const o = Math.sin(h.phase + time * h.speed * Math.PI * 2) * (h.amp ?? 100);
    const cx = h.cx + ux * o, cy = h.cy + uy * o;
    const px = (-uy * h.len) / 2, py = (ux * h.len) / 2;
    out.push([cx - px, cy - py, cx + px, cy + py]);
  }
  return out;
}

export class Course {
  readonly segments: Segment[] = [];
  readonly bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  readonly wells: Well[] = [];
  readonly surfaces: Surface[] = [];
  readonly ramps: Ramp[] = [];
  readonly currents: Current[] = [];
  readonly pits: Pit[] = [];
  readonly portals: Portal[] = [];
  readonly hazards: Hazard[] = [];
  readonly orbs: Orb[] = [];
  /** Moving or toggleable segments for the current time (rebuilt by update()). */
  dynamic: Segment[] = [];
  time = 0;
  private grid = new Map<number, number[]>();
  private stamp = new Uint32Array(0);
  private stampId = 0;
  private queryOut: number[] = [];

  protected addSegment(seg: Segment): void {
    const id = this.segments.length;
    this.segments.push(seg);
    const x0 = Math.floor(Math.min(seg.ax, seg.bx) / CELL), x1 = Math.floor(Math.max(seg.ax, seg.bx) / CELL);
    const y0 = Math.floor(Math.min(seg.ay, seg.by) / CELL), y1 = Math.floor(Math.max(seg.ay, seg.by) / CELL);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const key = this.cellKey(gx, gy);
        let list = this.grid.get(key);
        if (!list) this.grid.set(key, (list = []));
        list.push(id);
      }
    }
    const b = this.bounds;
    for (const [x, y] of [[seg.ax, seg.ay], [seg.bx, seg.by]]) {
      b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x);
      b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y);
    }
  }

  /** Call after all static segments are added. */
  protected finalizeGrid(): void {
    this.stamp = new Uint32Array(this.segments.length);
  }

  private cellKey(gx: number, gy: number): number {
    return (gx + 32768) * 65536 + (gy + 32768);
  }

  /** Unique static segment ids near a point (3x3 cells). The returned array is reused. */
  query(x: number, y: number): number[] {
    const out = this.queryOut;
    out.length = 0;
    const id = ++this.stampId;
    const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const list = this.grid.get(this.cellKey(gx + ox, gy + oy));
        if (!list) continue;
        for (const s of list) {
          if (this.stamp[s] === id) continue;
          this.stamp[s] = id;
          out.push(s);
        }
      }
    }
    return out;
  }

  /** Advance moving parts to `time` and rebuild the dynamic segment list. */
  update(time: number): void {
    this.time = time;
    this.dynamic = [];
    for (const h of this.hazards) {
      for (const [ax, ay, bx, by] of hazardBars(h, time)) this.dynamic.push({ ax, ay, bx, by, nx: 0, ny: 0, twoSided: true });
    }
    this.extraDynamic(this.dynamic);
  }

  /** Subclasses add gates/barriers here. */
  protected extraDynamic(_out: Segment[]): void {}

  surfaceAt(x: number, y: number): Surface | null {
    for (const s of this.surfaces) if (inRegion(s, x, y)) return s;
    return null;
  }

  /** Where a ship that fell in a pit comes back. */
  respawnPoint(s: RespawnInfo): { x: number; y: number; angle: number } {
    return { x: s.checkX, y: s.checkY, angle: s.checkAngle };
  }
}

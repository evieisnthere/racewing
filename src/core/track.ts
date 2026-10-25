import { Course, region, type Hazard, type RespawnInfo, type SurfaceKind } from './course';
import { clamp } from './math';

export type { Segment, Well } from './course';

/** Directional gravity over a stretch of track. Fractions are of a lap; angle is degrees relative to the track tangent (0 = forward, 90 = toward the right wall). */
export interface GravityZoneDef { from: number; to: number; angle: number; strength: number }
/** Point attractor (strength > 0) or repulsor (< 0). `offset` is across the track in half-widths: -1 left wall, +1 right wall, beyond 1 is off-track. */
export interface WellDef { at: number; offset: number; radius: number; strength: number; /** Absolute position, overriding at/offset. */ x?: number; y?: number }
export interface PadDef { at: number; offset: number; length?: number; width?: number }
/** One-way portal: entering near `from` (fraction, offset in half-widths) exits at `to`. */
export interface PortalDef { from: number; to: number; offset?: number; toOffset?: number; radius?: number }
export interface HazardDef { at: number; offset?: number; kind: 'spin' | 'slide'; len?: number; speed?: number; arms?: number; phase?: number }
export interface SurfaceDef { from: number; to: number; kind: SurfaceKind; side?: 'left' | 'right' | 'full' }
/** Ramp at `at` then a full-width pit `gap` units long. */
export interface JumpDef { at: number; gap?: number }

export interface TrackDef {
  id: string;
  name: string;
  blurb: string;
  color: number;
  accent: number;
  /** Default full width. */
  width: number;
  /** Multiplier applied to control points (and absolute well positions), not widths. */
  scale?: number;
  /** Closed loop of control points: [x, y, width?]. The first point is the start line; the track runs toward the second. */
  points: number[][];
  gravity?: GravityZoneDef[];
  wells?: WellDef[];
  pads?: PadDef[];
  portals?: PortalDef[];
  hazards?: HazardDef[];
  surfaces?: SurfaceDef[];
  jumps?: JumpDef[];
}

export interface Zone { i0: number; i1: number; angle: number; strength: number }
export interface Pad { i0: number; i1: number; lat: number; halfWidth: number }

export const SPACING = 10;
/**
 * Track definitions are authored at a larger scale; everything is shrunk to Data Wing proportions on load
 * (tracks ~4-5 ships wide). Positions and lengths use WORLD, track widths use WIDTH.
 */
export const WORLD = 0.5;
export const WIDTH = 0.55;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function centripetal(p0: number[], p1: number[], p2: number[], p3: number[], t: number, out: number[]): void {
  const d = (a: number[], b: number[]) => Math.max(1e-3, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  for (let k = 0; k < 2; k++) {
    const a1 = ((t1 - tt) * p0[k] + (tt - t0) * p1[k]) / (t1 - t0);
    const a2 = ((t2 - tt) * p1[k] + (tt - t1) * p2[k]) / (t2 - t1);
    const a3 = ((t3 - tt) * p2[k] + (tt - t2) * p3[k]) / (t3 - t2);
    const b1 = ((t2 - tt) * a1 + (tt - t0) * a2) / (t2 - t0);
    const b2 = ((t3 - tt) * a2 + (tt - t1) * a3) / (t3 - t1);
    out[k] = ((t2 - tt) * b1 + (tt - t1) * b2) / (t2 - t1);
  }
}

/** Menger curvature through points i-k, i, i+k of a closed polyline. */
function curvature(xs: Float64Array, ys: Float64Array, k: number): Float64Array {
  const n = xs.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - k + n) % n, c = (i + k) % n;
    const abx = xs[i] - xs[a], aby = ys[i] - ys[a];
    const bcx = xs[c] - xs[i], bcy = ys[c] - ys[i];
    const acx = xs[c] - xs[a], acy = ys[c] - ys[a];
    const cross = abx * bcy - aby * bcx;
    const denom = Math.hypot(abx, aby) * Math.hypot(bcx, bcy) * Math.hypot(acx, acy);
    out[i] = denom > 0 ? (2 * cross) / denom : 0;
  }
  return out;
}

export class Track extends Course {
  readonly def: TrackDef;
  /** id plus a hash of the definition, so records and ghosts from an older layout are not reused. */
  readonly key: string;
  readonly n: number;
  readonly length: number;
  readonly cx: Float64Array; readonly cy: Float64Array;
  readonly tx: Float64Array; readonly ty: Float64Array;
  /** Right-hand normal (toward the right wall). */
  readonly nx: Float64Array; readonly ny: Float64Array;
  readonly hw: Float64Array;
  readonly lx: Float64Array; readonly ly: Float64Array;
  readonly rx: Float64Array; readonly ry: Float64Array;
  /** Signed centreline curvature (positive = right turn). */
  readonly curv: Float64Array;
  /** Racing-line lateral offset, and its signed curvature. */
  readonly lineOff: Float64Array;
  readonly lineCurv: Float64Array;
  readonly zones: Zone[] = [];
  readonly pads: Pad[] = [];
  /** Sample ranges covered by pits (respawn goes to just before them). */
  readonly pitSpans: [number, number][] = [];

  constructor(def: TrackDef) {
    super();
    this.def = def;
    this.key = def.id + '@' + hash(JSON.stringify(def)).toString(36);
    const raw: number[][] = [];
    const sc = (def.scale ?? 1) * WORLD;
    const P = def.points.map((p) => [p[0] * sc, p[1] * sc, (p[2] ?? def.width) * WIDTH]);
    const m = P.length;
    const steps = 48;
    const tmp = [0, 0];
    for (let i = 0; i < m; i++) {
      const p0 = P[(i - 1 + m) % m], p1 = P[i], p2 = P[(i + 1) % m], p3 = P[(i + 2) % m];
      const w1 = p1[2], w2 = p2[2];
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        centripetal(p0, p1, p2, p3, t, tmp);
        raw.push([tmp[0], tmp[1], w1 + (w2 - w1) * t * t * (3 - 2 * t)]);
      }
    }
    // Resample at even arclength.
    const cum = [0];
    for (let i = 1; i <= raw.length; i++) {
      const a = raw[i - 1], b = raw[i % raw.length];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const total = cum[raw.length];
    const n = Math.round(total / SPACING);
    this.n = n;
    this.length = total;
    const alloc = () => new Float64Array(n);
    this.cx = alloc(); this.cy = alloc(); this.tx = alloc(); this.ty = alloc();
    this.nx = alloc(); this.ny = alloc(); this.hw = alloc();
    this.lx = alloc(); this.ly = alloc(); this.rx = alloc(); this.ry = alloc();
    let j = 0;
    for (let i = 0; i < n; i++) {
      const s = (i / n) * total;
      while (cum[j + 1] < s) j++;
      const a = raw[j], b = raw[(j + 1) % raw.length];
      const f = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
      this.cx[i] = a[0] + (b[0] - a[0]) * f;
      this.cy[i] = a[1] + (b[1] - a[1]) * f;
      this.hw[i] = (a[2] + (b[2] - a[2]) * f) / 2;
    }
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n, b = (i + 1) % n;
      const dx = this.cx[b] - this.cx[a], dy = this.cy[b] - this.cy[a];
      const l = Math.hypot(dx, dy) || 1;
      this.tx[i] = dx / l; this.ty[i] = dy / l;
      this.nx[i] = -this.ty[i]; this.ny[i] = this.tx[i];
    }
    this.curv = curvature(this.cx, this.cy, 3);
    // Keep the inner wall from folding over itself on tight corners, then smooth the width.
    for (let i = 0; i < n; i++) {
      const k = Math.abs(this.curv[i]);
      if (k > 0) this.hw[i] = Math.min(this.hw[i], 0.8 / k);
    }
    for (let pass = 0; pass < 6; pass++) {
      const copy = Float64Array.from(this.hw);
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let k = -3; k <= 3; k++) sum += copy[(i + k + n) % n];
        this.hw[i] = Math.min(copy[i], sum / 7);
      }
    }
    for (let i = 0; i < n; i++) {
      this.lx[i] = this.cx[i] - this.nx[i] * this.hw[i];
      this.ly[i] = this.cy[i] - this.ny[i] * this.hw[i];
      this.rx[i] = this.cx[i] + this.nx[i] * this.hw[i];
      this.ry[i] = this.cy[i] + this.ny[i] * this.hw[i];
    }
    this.buildSegments();
    this.lineOff = this.buildRacingLine(9);
    const lx = alloc(), ly = alloc();
    for (let i = 0; i < n; i++) {
      lx[i] = this.cx[i] + this.nx[i] * this.lineOff[i];
      ly[i] = this.cy[i] + this.ny[i] * this.lineOff[i];
    }
    this.lineCurv = curvature(lx, ly, 3);
    this.finalizeGrid();

    const idx = (f: number) => ((Math.round(f * n) % n) + n) % n;
    for (const z of def.gravity ?? []) {
      this.zones.push({ i0: idx(z.from), i1: idx(z.to), angle: (z.angle * Math.PI) / 180, strength: z.strength });
    }
    for (const w of def.wells ?? []) {
      const i = idx(w.at);
      this.wells.push({
        x: w.x !== undefined ? w.x * sc : this.cx[i] + this.nx[i] * this.hw[i] * w.offset,
        y: w.y !== undefined ? w.y * sc : this.cy[i] + this.ny[i] * this.hw[i] * w.offset,
        radius: w.radius * WORLD,
        strength: w.strength,
      });
    }
    for (const p of def.pads ?? []) {
      const i0 = idx(p.at);
      const len = Math.max(1, Math.round(((p.length ?? 128) * WORLD) / SPACING));
      this.pads.push({ i0, i1: (i0 + len) % n, lat: p.offset * this.hw[i0], halfWidth: ((p.width ?? 56) * WORLD) / 2 });
    }
    this.buildGimmicks(idx);
  }

  /** Polygon covering samples i0..i1, between lateral fractions f0..f1 (-1 left wall, +1 right wall). */
  spanPoly(i0: number, i1: number, f0 = -1, f1 = 1): number[] {
    const left: number[] = [], right: number[] = [];
    for (let i = i0; ; i = (i + 1) % this.n) {
      left.push(this.cx[i] + this.nx[i] * this.hw[i] * f0, this.cy[i] + this.ny[i] * this.hw[i] * f0);
      right.push(this.cx[i] + this.nx[i] * this.hw[i] * f1, this.cy[i] + this.ny[i] * this.hw[i] * f1);
      if (i === i1) break;
    }
    const out = left;
    for (let k = right.length - 2; k >= 0; k -= 2) out.push(right[k], right[k + 1]);
    return out;
  }

  private buildGimmicks(idx: (f: number) => number): void {
    const def = this.def;
    const at = (i: number, off: number) => [this.cx[i] + this.nx[i] * this.hw[i] * off, this.cy[i] + this.ny[i] * this.hw[i] * off];
    const ang = (i: number) => Math.atan2(this.ty[i], this.tx[i]);
    for (const p of def.portals ?? []) {
      const a = idx(p.from), b = idx(p.to);
      const [ax, ay] = at(a, p.offset ?? 0), [bx, by] = at(b, p.toOffset ?? p.offset ?? 0);
      this.portals.push({ ax, ay, aAngle: ang(a), bx, by, bAngle: ang(b), r: (p.radius ?? 46) * 0.6, twoWay: false, color: 0x5ad1ff });
    }
    for (const h of def.hazards ?? []) {
      const i = idx(h.at);
      const [cx, cy] = at(i, h.offset ?? 0);
      const hz: Hazard = { kind: h.kind, cx, cy, len: h.len !== undefined ? h.len * WORLD : this.hw[i] * 1.3, speed: h.speed ?? (h.kind === 'spin' ? 1.4 : 0.35), phase: h.phase ?? 0, arms: h.arms };
      if (h.kind === 'slide') {
        // Slides across the track; the bar lies along the track direction.
        hz.ux = this.nx[i]; hz.uy = this.ny[i]; hz.amp = this.hw[i] * 0.55; hz.len = (h.len ?? 90) * WORLD;
      }
      this.hazards.push(hz);
    }
    for (const sf of def.surfaces ?? []) {
      const [f0, f1] = sf.side === 'left' ? [-1, 0] : sf.side === 'right' ? [0, 1] : [-1, 1];
      this.surfaces.push({ ...region(this.spanPoly(idx(sf.from), idx(sf.to), f0, f1)), kind: sf.kind });
    }
    for (const j of def.jumps ?? []) {
      const i0 = idx(j.at);
      const i1 = this.wrap(i0 + 4);
      const p0 = this.wrap(i1 + 3);
      const p1 = this.wrap(p0 + Math.round(((j.gap ?? 170) * WORLD) / SPACING));
      this.ramps.push({ ...region(this.spanPoly(i0, i1)), dx: this.tx[i0], dy: this.ty[i0] });
      this.pits.push(region(this.spanPoly(p0, p1, -1.05, 1.05)));
      this.pitSpans.push([i0, p1]);
    }
  }

  /** After a pit fall: back on the centreline a little before the jump, facing forward. */
  respawnPoint(s: RespawnInfo): { x: number; y: number; angle: number } {
    let i = s.idx;
    for (const [a, b] of this.pitSpans) if (this.inRange(i, a, b)) i = this.wrap(a - 40);
    return { x: this.cx[i], y: this.cy[i], angle: Math.atan2(this.ty[i], this.tx[i]) };
  }

  private buildSegments(): void {
    const n = this.n;
    const add = (ax: number, ay: number, bx: number, by: number, inwardRight: boolean) => {
      const dx = bx - ax, dy = by - ay;
      const l = Math.hypot(dx, dy) || 1;
      this.addSegment({ ax, ay, bx, by, nx: inwardRight ? -dy / l : dy / l, ny: inwardRight ? dx / l : -dx / l });
    };
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      add(this.lx[i], this.ly[i], this.lx[k], this.ly[k], true);
      add(this.rx[i], this.ry[i], this.rx[k], this.ry[k], false);
    }
  }

  /** Minimum-curvature line by iterative relaxation, coarse to fine. */
  private buildRacingLine(margin: number): Float64Array {
    const n = this.n;
    const off = new Float64Array(n);
    for (const step of [24, 12, 6, 3, 1]) {
      for (let iter = 0; iter < 120; iter++) {
        for (let i = 0; i < n; i++) {
          const a = (i - step + n) % n, b = (i + step) % n;
          const px = (this.cx[a] + this.nx[a] * off[a] + this.cx[b] + this.nx[b] * off[b]) / 2;
          const py = (this.cy[a] + this.ny[a] * off[a] + this.cy[b] + this.ny[b] * off[b]) / 2;
          const o = (px - this.cx[i]) * this.nx[i] + (py - this.cy[i]) * this.ny[i];
          const lim = Math.max(0, this.hw[i] - margin);
          off[i] = clamp(off[i] + (o - off[i]) * 0.7, -lim, lim);
        }
      }
    }
    return off;
  }

  /** Nearest centreline sample, searching near `hint` first. */
  nearest(x: number, y: number, hint = -1, window = 20): number {
    const n = this.n;
    let best = -1, bestD = Infinity;
    if (hint >= 0) {
      for (let k = -window; k <= window; k++) {
        const i = (hint + k + n) % n;
        const d = (x - this.cx[i]) ** 2 + (y - this.cy[i]) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      const lim = this.hw[best] + 80;
      if (bestD <= lim * lim) return best;
    }
    for (let i = 0; i < n; i++) {
      const d = (x - this.cx[i]) ** 2 + (y - this.cy[i]) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /** Pairs of far-apart samples whose walls come too close (overlapping or touching track sections). */
  clearanceIssues(gap = 30): { i: number; j: number; d: number }[] {
    const out: { i: number; j: number; d: number }[] = [];
    const n = this.n;
    const skip = Math.ceil(450 / SPACING);
    for (let i = 0; i < n; i += 2) {
      for (let j = i + skip; j < n; j += 2) {
        if (n - (j - i) < skip) continue;
        const d = Math.hypot(this.cx[i] - this.cx[j], this.cy[i] - this.cy[j]);
        if (d < this.hw[i] + this.hw[j] + gap) { out.push({ i, j, d }); i += 10; break; }
      }
    }
    return out;
  }

  lateral(x: number, y: number, i: number): number {
    return (x - this.cx[i]) * this.nx[i] + (y - this.cy[i]) * this.ny[i];
  }

  /** Is sample i within [i0, i1] going forward (wrapping)? */
  inRange(i: number, i0: number, i1: number): boolean {
    return i0 <= i1 ? i >= i0 && i <= i1 : i >= i0 || i <= i1;
  }

  wrap(i: number): number {
    return ((i % this.n) + this.n) % this.n;
  }
}

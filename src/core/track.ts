import { clamp } from './math';

/** Directional gravity over a stretch of track. Fractions are of a lap; angle is degrees relative to the track tangent (0 = forward, 90 = toward the right wall). */
export interface GravityZoneDef { from: number; to: number; angle: number; strength: number }
/** Point attractor (strength > 0) or repulsor (< 0). `offset` is across the track in half-widths: -1 left wall, +1 right wall, beyond 1 is off-track. */
export interface WellDef { at: number; offset: number; radius: number; strength: number; /** Absolute position, overriding at/offset. */ x?: number; y?: number }
export interface PadDef { at: number; offset: number; length?: number; width?: number }

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
}

export interface Segment { ax: number; ay: number; bx: number; by: number; nx: number; ny: number }
export interface Zone { i0: number; i1: number; angle: number; strength: number }
export interface Well { x: number; y: number; radius: number; strength: number }
export interface Pad { i0: number; i1: number; lat: number; halfWidth: number }

export const SPACING = 16;
const CELL = 96;

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

export class Track {
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
  readonly segments: Segment[] = [];
  readonly zones: Zone[] = [];
  readonly wells: Well[] = [];
  readonly pads: Pad[] = [];
  readonly bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  private grid = new Map<number, number[]>();
  private stamp: Uint32Array;
  private stampId = 0;
  private queryOut: number[] = [];

  constructor(def: TrackDef) {
    this.def = def;
    this.key = def.id + '@' + hash(JSON.stringify(def)).toString(36);
    const raw: number[][] = [];
    const sc = def.scale ?? 1;
    const P = def.points.map((p) => [p[0] * sc, p[1] * sc, p[2] ?? def.width]);
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
    this.lineOff = this.buildRacingLine(16);
    const lx = alloc(), ly = alloc();
    for (let i = 0; i < n; i++) {
      lx[i] = this.cx[i] + this.nx[i] * this.lineOff[i];
      ly[i] = this.cy[i] + this.ny[i] * this.lineOff[i];
    }
    this.lineCurv = curvature(lx, ly, 3);
    this.stamp = new Uint32Array(this.segments.length);

    const idx = (f: number) => ((Math.round(f * n) % n) + n) % n;
    for (const z of def.gravity ?? []) {
      this.zones.push({ i0: idx(z.from), i1: idx(z.to), angle: (z.angle * Math.PI) / 180, strength: z.strength });
    }
    for (const w of def.wells ?? []) {
      const i = idx(w.at);
      this.wells.push({
        x: w.x !== undefined ? w.x * sc : this.cx[i] + this.nx[i] * this.hw[i] * w.offset,
        y: w.y !== undefined ? w.y * sc : this.cy[i] + this.ny[i] * this.hw[i] * w.offset,
        radius: w.radius,
        strength: w.strength,
      });
    }
    for (const p of def.pads ?? []) {
      const i0 = idx(p.at);
      const len = Math.max(1, Math.round((p.length ?? 128) / SPACING));
      this.pads.push({ i0, i1: (i0 + len) % n, lat: p.offset * this.hw[i0], halfWidth: (p.width ?? 56) / 2 });
    }
  }

  private buildSegments(): void {
    const n = this.n;
    const add = (ax: number, ay: number, bx: number, by: number, inwardRight: boolean) => {
      const dx = bx - ax, dy = by - ay;
      const l = Math.hypot(dx, dy) || 1;
      const nx = inwardRight ? -dy / l : dy / l;
      const ny = inwardRight ? dx / l : -dx / l;
      const id = this.segments.length;
      this.segments.push({ ax, ay, bx, by, nx, ny });
      const x0 = Math.floor(Math.min(ax, bx) / CELL), x1 = Math.floor(Math.max(ax, bx) / CELL);
      const y0 = Math.floor(Math.min(ay, by) / CELL), y1 = Math.floor(Math.max(ay, by) / CELL);
      for (let gx = x0; gx <= x1; gx++) {
        for (let gy = y0; gy <= y1; gy++) {
          const key = this.cellKey(gx, gy);
          let list = this.grid.get(key);
          if (!list) this.grid.set(key, (list = []));
          list.push(id);
        }
      }
      const b = this.bounds;
      b.minX = Math.min(b.minX, ax); b.maxX = Math.max(b.maxX, ax);
      b.minY = Math.min(b.minY, ay); b.maxY = Math.max(b.maxY, ay);
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

  private cellKey(gx: number, gy: number): number {
    return (gx + 32768) * 65536 + (gy + 32768);
  }

  /** Unique wall segment ids near a point (3x3 cells). The returned array is reused. */
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
  clearanceIssues(gap = 60): { i: number; j: number; d: number }[] {
    const out: { i: number; j: number; d: number }[] = [];
    const n = this.n;
    const skip = Math.ceil(900 / SPACING);
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

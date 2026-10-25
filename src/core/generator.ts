// Seeded procedural circuits: a guaranteed-valid closed loop (no overlapping sections, a Medium bot can lap it)
// with fields, pads and gimmicks placed along it.
import { mulberry32 } from './math';
import { Race } from './race';
import { Track, type TrackDef } from './track';

export interface GenParams {
  /** 1..5: lap length. */
  length: number;
  /** 1..5: how wiggly and pinched the loop is. */
  twist: number;
  /** 1..5: track width. */
  width: number;
  /** 0..5: gravity zones, wells and pads. */
  features: number;
  /** 0..5: portals, hazards, jumps and surfaces. */
  gimmicks: number;
}

export const DEFAULT_PARAMS: GenParams = { length: 3, twist: 3, width: 3, features: 3, gimmicks: 2 };

const ADJ = ['Neon', 'Velvet', 'Static', 'Hollow', 'Crimson', 'Quiet', 'Feral', 'Glass', 'Ion', 'Solar', 'Drift', 'Echo', 'Phantom', 'Cobalt', 'Lumen'];
const NOUN = ['Spiral', 'Reach', 'Coil', 'Harbor', 'Fault', 'Ribbon', 'Orbit', 'Gate', 'Hollow', 'Vein', 'Loop', 'Rift', 'Arc', 'Delta', 'Run'];
const PALETTES: [number, number][] = [
  [0x2ef2ff, 0xff3df2], [0xff7a3d, 0xffe14d], [0xb06bff, 0x3dff9a], [0x3dff9a, 0x2ef2ff],
  [0xff3df2, 0xffe14d], [0x5ad1ff, 0xffffff], [0xffd23d, 0xff4d6d], [0xff5a8a, 0x5ad1ff],
];

const clampP = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

export function normalize(p: Partial<GenParams>): GenParams {
  const d = DEFAULT_PARAMS;
  return {
    length: clampP(p.length ?? d.length, 1, 5), twist: clampP(p.twist ?? d.twist, 1, 5), width: clampP(p.width ?? d.width, 1, 5),
    features: clampP(p.features ?? d.features, 0, 5), gimmicks: clampP(p.gimmicks ?? d.gimmicks, 0, 5),
  };
}

/** Share code: "G" + seed in base 36 + "." + five parameter digits, e.g. "G1k3x.33332". */
export function genCode(seed: number, p: GenParams): string {
  return `G${(seed >>> 0).toString(36)}.${p.length}${p.twist}${p.width}${p.features}${p.gimmicks}`;
}

export function parseCode(code: string): { seed: number; params: GenParams } | null {
  const m = /^G([0-9a-z]+)\.([1-5])([1-5])([1-5])([0-5])([0-5])$/i.exec(code.trim());
  if (!m) return null;
  return { seed: parseInt(m[1], 36) >>> 0, params: { length: +m[2], twist: +m[3], width: +m[4], features: +m[5], gimmicks: +m[6] } };
}

export function dailySeed(d = new Date()): number {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

function hull(pts: number[][]): number[][] {
  const P = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: number[][] = [], upper: number[][] = [];
  for (const p of P) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...P].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * Convex hull of random points, then rounds of midpoint displacement (in or out) that carve bays,
 * S-bends and hairpins. Twist controls the displacement size and the number of rounds.
 */
function shape(rand: () => number, p: GenParams): number[][] {
  const count = 10 + Math.floor(rand() * 10);
  const aspect = 1 + rand() * 0.8;
  const raw: number[][] = [];
  for (let i = 0; i < count; i++) raw.push([(rand() - 0.5) * 2 * aspect, (rand() - 0.5) * 2]);
  let pts = hull(raw);
  const rounds = p.twist >= 4 ? 2 : 1;
  for (let r = 0; r < rounds; r++) {
    const out: number[][] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      out.push(a);
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      if (len < 0.25) continue;
      // Perpendicular offset; mostly inward (negative), which makes bays and hairpins.
      const amt = (rand() - 0.62) * len * (0.25 + p.twist * 0.17);
      const nx = dy / len, ny = -dx / len;
      const t = 0.35 + rand() * 0.3;
      out.push([a[0] + dx * t + nx * amt, a[1] + dy * t + ny * amt]);
    }
    pts = out;
  }
  // Drop points that crowd each other, which would make kinks.
  const clean: number[][] = [];
  for (const q of pts) if (!clean.length || Math.hypot(q[0] - clean[clean.length - 1][0], q[1] - clean[clean.length - 1][1]) > 0.12) clean.push(q);
  return clean;
}

interface Placed { from: number; to: number }

function gimmickify(t: Track, rand: () => number, p: GenParams, def: TrackDef): void {
  const n = t.n;
  const used: Placed[] = [{ from: 0.94, to: 1 }, { from: 0, to: 0.05 }];
  const free = (from: number, to: number) => from >= 0 && to < 1 && used.every((u) => to + 0.02 < u.from || from - 0.02 > u.to);
  const absCurv = (f: number) => Math.abs(t.curv[Math.floor(f * n) % n]);
  const straightAt = (f: number, len: number) => {
    for (let x = f; x <= f + len; x += 0.004) if (absCurv(x) > 1 / 900) return false;
    return true;
  };
  const place = (len: number, want: (f: number) => boolean, tries = 60): number | null => {
    for (let k = 0; k < tries; k++) {
      const f = 0.05 + rand() * (0.89 - len);
      if (free(f, f + len) && want(f)) { used.push({ from: f, to: f + len }); return f; }
    }
    return null;
  };
  def.pads = []; def.gravity = []; def.wells = [];
  def.surfaces = []; def.jumps = []; def.hazards = []; def.portals = [];

  for (let i = 0; i < Math.ceil(p.features / 2); i++) {
    const f = place(0.02, (x) => straightAt(x, 0.02));
    if (f !== null) def.pads.push({ at: f, offset: (rand() - 0.5) * 0.8 });
  }
  for (let i = 0; i < Math.floor(p.features / 2); i++) {
    const len = 0.04 + rand() * 0.04;
    const f = place(len, () => true);
    if (f !== null) def.gravity.push({ from: f, to: f + len, angle: [0, 180, 90, -90][Math.floor(rand() * 4)], strength: 160 + rand() * 120 });
  }
  for (let i = 0; i < Math.floor((p.features + 1) / 2); i++) {
    const f = place(0.03, (x) => absCurv(x + 0.015) > 1 / 700);
    if (f === null) continue;
    const c = t.curv[Math.floor((f + 0.015) * n) % n];
    const attract = rand() < 0.65;
    // Attractors sit inside the turn (pulling you round); repulsors outside (pushing you in).
    const side = Math.sign(c) * (attract ? 1 : -1);
    def.wells.push({ at: f + 0.015, offset: side * (1.9 + rand() * 0.8), radius: 420 + rand() * 250, strength: attract ? 260 + rand() * 160 : -(380 + rand() * 200) });
  }

  const kinds = ['ice', 'mud', 'turbo', 'flip', 'jump', 'spin', 'slide', 'portal'] as const;
  for (let i = 0; i < p.gimmicks; i++) {
    const kind = kinds[Math.floor(rand() * kinds.length)];
    if (kind === 'jump') {
      const f = place(0.05, (x) => straightAt(x, 0.05));
      if (f !== null) def.jumps.push({ at: f, gap: 110 + rand() * 50 });
    } else if (kind === 'spin' || kind === 'slide') {
      const f = place(0.02, () => true);
      if (f !== null) def.hazards.push({ at: f + 0.01, kind, speed: kind === 'spin' ? 1 + rand() * 0.8 : 0.25 + rand() * 0.15, phase: rand() * 6 });
    } else if (kind === 'portal') {
      const len = 0.08 + rand() * 0.1;
      const f = place(len, () => true);
      if (f !== null) def.portals.push({ from: f, to: f + len, offset: (rand() < 0.5 ? -1 : 1) * (0.4 + rand() * 0.25), radius: 40 });
    } else {
      const len = 0.03 + rand() * 0.04;
      const f = place(len, () => true);
      const side = kind === 'mud' ? (rand() < 0.5 ? 'left' : 'right') : 'full';
      if (f !== null) def.surfaces.push({ from: f, to: f + len, kind, side });
    }
  }
}

/** Build a track for (seed, params). Deterministic: the same inputs always give the same track. */
export function generate(seed: number, params: Partial<GenParams> = {}, validate = true): TrackDef {
  const p = normalize(params);
  const code = genCode(seed, p);
  const targetLen = 9000 + p.length * 2600;
  const width = 160 + p.width * 22;
  let fallback: TrackDef | null = null;
  for (let attempt = 0; attempt < 200; attempt++) {
    const rand = mulberry32(seed * 7919 + attempt * 104729 + 13);
    const pts = shape(rand, p);
    let perim = 0;
    for (let i = 0; i < pts.length; i++) { const q = pts[(i + 1) % pts.length]; perim += Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]); }
    const scale = targetLen / (perim * 1.03);
    // Cheap reject before building a full Track: non-adjacent control edges must stay well apart.
    if (!polygonClear(pts.map(([x, y]) => [x * scale, y * scale]), width * 1.9)) continue;
    const [color, accent] = PALETTES[Math.floor(rand() * PALETTES.length)];
    const def: TrackDef = {
      id: 'gen:' + code,
      name: `${ADJ[Math.floor(rand() * ADJ.length)]} ${NOUN[Math.floor(rand() * NOUN.length)]}`,
      blurb: `Generated from code ${code}.`,
      color, accent, width, scale, points: pts,
    };
    const plain = new Track(def);
    if (plain.clearanceIssues(80).length) continue;
    let minHw = Infinity, maxCurv = 0;
    for (let i = 0; i < plain.n; i++) { minHw = Math.min(minHw, plain.hw[i]); maxCurv = Math.max(maxCurv, Math.abs(plain.curv[i])); }
    if (minHw < width * 0.55 * 0.3 || maxCurv > 1 / 55) continue;
    gimmickify(plain, rand, p, def);
    fallback ??= def;
    if (!validate || lapsCleanly(def)) return def;
  }
  return fallback ?? generate(seed + 1, p, validate);
}

function segDist(a: number[], b: number[], c: number[], d: number[]): number {
  const pt = (p: number[], s0: number[], s1: number[]) => {
    const ex = s1[0] - s0[0], ey = s1[1] - s0[1];
    const l2 = ex * ex + ey * ey || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - s0[0]) * ex + (p[1] - s0[1]) * ey) / l2));
    return Math.hypot(p[0] - s0[0] - ex * t, p[1] - s0[1] - ey * t);
  };
  const cr = (o: number[], p: number[], q: number[]) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  if (cr(a, b, c) * cr(a, b, d) < 0 && cr(c, d, a) * cr(c, d, b) < 0) return 0;
  return Math.min(pt(a, c, d), pt(b, c, d), pt(c, a, b), pt(d, a, b));
}

function polygonClear(pts: number[][], minGap: number): boolean {
  const m = pts.length;
  for (let i = 0; i < m; i++) {
    for (let j = i + 2; j < m; j++) {
      if (i === 0 && j === m - 1) continue;
      if (segDist(pts[i], pts[(i + 1) % m], pts[j], pts[(j + 1) % m]) < minGap) return false;
    }
  }
  return true;
}

/** An Easy bot must be able to complete a lap in reasonable time. */
function lapsCleanly(def: TrackDef): boolean {
  const track = new Track(def);
  const race = new Race({ track, laps: 1, racers: [{ name: '', color: 0, kind: 'bot', tier: 'easy' }], scheme: 'thrust', rubberBand: false, collisions: false, seed: 1 });
  const limit = track.length / 90;
  const r = race.racers[0];
  let best = -1, bestAt = 0;
  while (race.state !== 'finished' && race.time < limit) {
    race.step([]);
    const prog = r.progress(track.n);
    if (prog > best + 5) { best = prog; bestAt = race.time; }
    // Stuck: no forward progress for a few seconds.
    if (race.time - bestAt > 5) return false;
  }
  return race.state === 'finished';
}

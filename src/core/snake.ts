// Snake tails: a verlet chain hanging off the back of a ship. Turning swings it; a fast swing (a "flick")
// slams whatever it hits with the tail's own velocity. Orbs grow it; hard wall hits shed a segment.
import type { Course } from './course';
import { inRegion } from './course';
import { PHYS, type Ship } from './physics';

export const SNAKE = {
  /** Distance between tail nodes. */
  seg: 7,
  nodeR: 4.5,
  start: 6,
  min: 3,
  max: 18,
  /** Velocity kept per 240 Hz step (lower = floppier tail). */
  damping: 0.988,
  /** How much of the tail's closing speed is passed to a ship it hits. */
  push: 0.75,
  /** Largest velocity change one tail hit can deal (a clean flick). */
  maxImpulse: 240,
  /** Extra drag per tail node (a long tail is heavy). */
  dragPer: 0.012,
  orbRadius: 14,
  orbRespawn: 8,
};

export interface Tail {
  xs: Float64Array; ys: Float64Array;
  pxs: Float64Array; pys: Float64Array;
  /** Active nodes. */
  n: number;
  /** Seconds before another hard hit can shed a node. */
  shedCd: number;
}

export function makeTail(s: Ship, n = SNAKE.start): Tail {
  const t: Tail = {
    xs: new Float64Array(SNAKE.max), ys: new Float64Array(SNAKE.max),
    pxs: new Float64Array(SNAKE.max), pys: new Float64Array(SNAKE.max),
    n, shedCd: 0,
  };
  const hx = Math.cos(s.angle), hy = Math.sin(s.angle);
  for (let k = 0; k < SNAKE.max; k++) {
    const d = PHYS.radius + k * SNAKE.seg;
    t.xs[k] = t.pxs[k] = s.x - hx * d;
    t.ys[k] = t.pys[k] = s.y - hy * d;
  }
  return t;
}

/** Re-lay the tail straight behind the ship (after a respawn or teleport). */
export function resetTail(t: Tail, s: Ship): void {
  const hx = Math.cos(s.angle), hy = Math.sin(s.angle);
  for (let k = 0; k < SNAKE.max; k++) {
    const d = PHYS.radius + k * SNAKE.seg;
    t.xs[k] = t.pxs[k] = s.x - hx * d;
    t.ys[k] = t.pys[k] = s.y - hy * d;
  }
}

export function grow(t: Tail, s: Ship): void {
  if (t.n >= SNAKE.max) return;
  // New node appears just behind the current last one.
  const k = t.n;
  const ax = t.xs[k - 1], ay = t.ys[k - 1];
  const bx = k >= 2 ? t.xs[k - 2] : s.x, by = k >= 2 ? t.ys[k - 2] : s.y;
  const d = Math.hypot(ax - bx, ay - by) || 1;
  t.xs[k] = t.pxs[k] = ax + ((ax - bx) / d) * SNAKE.seg;
  t.ys[k] = t.pys[k] = ay + ((ay - by) / d) * SNAKE.seg;
  t.n++;
}

export function shed(t: Tail): boolean {
  if (t.n <= SNAKE.min || t.shedCd > 0) return false;
  t.n--;
  t.shedCd = 1;
  return true;
}

/** Advance the chain one step: verlet, distance constraints, and keep nodes off walls. */
export function stepTail(t: Tail, s: Ship, course: Course, dt: number): void {
  t.shedCd -= dt;
  if (s.fall > 0 || s.warped > 0.33) { resetTail(t, s); return; }
  const hx = Math.cos(s.angle), hy = Math.sin(s.angle);
  t.xs[0] = s.x - hx * PHYS.radius;
  t.ys[0] = s.y - hy * PHYS.radius;
  t.pxs[0] = t.xs[0]; t.pys[0] = t.ys[0];
  for (let k = 1; k < t.n; k++) {
    const vx = (t.xs[k] - t.pxs[k]) * SNAKE.damping, vy = (t.ys[k] - t.pys[k]) * SNAKE.damping;
    t.pxs[k] = t.xs[k]; t.pys[k] = t.ys[k];
    t.xs[k] += vx; t.ys[k] += vy;
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let k = 1; k < t.n; k++) {
      const dx = t.xs[k] - t.xs[k - 1], dy = t.ys[k] - t.ys[k - 1];
      const d = Math.hypot(dx, dy) || 1e-6;
      const diff = (d - SNAKE.seg) / d;
      // The node nearer the ship is held (the ship is far heavier than its tail).
      if (k === 1) { t.xs[k] -= dx * diff; t.ys[k] -= dy * diff; }
      else {
        t.xs[k] -= dx * diff * 0.5; t.ys[k] -= dy * diff * 0.5;
        t.xs[k - 1] += dx * diff * 0.5; t.ys[k - 1] += dy * diff * 0.5;
      }
    }
  }
  if (s.air > 0) return;
  // Walls: push nodes back to the open side (static segments only, cheap enough for short chains).
  const r = SNAKE.nodeR;
  for (let k = 1; k < t.n; k += 1) {
    for (const id of course.query(t.xs[k], t.ys[k])) {
      const g = course.segments[id];
      if (g.low) continue;
      const ex = g.bx - g.ax, ey = g.by - g.ay;
      const l2 = ex * ex + ey * ey || 1;
      const u = Math.max(0, Math.min(1, ((t.xs[k] - g.ax) * ex + (t.ys[k] - g.ay) * ey) / l2));
      const qx = g.ax + ex * u, qy = g.ay + ey * u;
      const side = (t.xs[k] - g.ax) * g.nx + (t.ys[k] - g.ay) * g.ny;
      const d = Math.hypot(t.xs[k] - qx, t.ys[k] - qy);
      if (side >= 0 && d >= r) continue;
      const push = side < 0 ? r - side : r - d;
      t.xs[k] += g.nx * push; t.ys[k] += g.ny * push;
    }
  }
}

/**
 * Tail vs another ship: overlapping nodes push the ship out and hand it the tail's closing speed.
 * Returns the strongest impulse dealt (for effects and sound).
 */
export function tailHits(t: Tail, other: Ship, dt: number): number {
  if (other.fall > 0 || other.air > 0) return 0;
  const R = SNAKE.nodeR + PHYS.radius;
  let best = 0;
  for (let k = 2; k < t.n; k++) {
    const dx = other.x - t.xs[k], dy = other.y - t.ys[k];
    const d2 = dx * dx + dy * dy;
    if (d2 >= R * R) continue;
    const d = Math.sqrt(d2) || 1e-6;
    const nx = dx / d, ny = dy / d;
    other.x += nx * (R - d); other.y += ny * (R - d);
    const nvx = (t.xs[k] - t.pxs[k]) / dt, nvy = (t.ys[k] - t.pys[k]) / dt;
    const close = nvx * nx + nvy * ny - (other.vx * nx + other.vy * ny);
    if (close > 0) {
      // Longer tails hit harder at the tip; the whole thing is capped so a flick shoves rather than launches.
      const reach = 0.6 + 0.4 * (k / Math.max(1, t.n - 1));
      const j = Math.min(SNAKE.maxImpulse, close * SNAKE.push * reach);
      other.vx += nx * j; other.vy += ny * j;
      best = Math.max(best, j);
    }
  }
  if (best > 60) { other.hit = Math.max(other.hit, best); other.hitX = other.x; other.hitY = other.y; }
  return best;
}

/** Extra drag a tail adds to its ship. */
export function tailDrag(t: Tail, s: Ship, dt: number): void {
  const k = Math.exp(-SNAKE.dragPer * t.n * dt);
  s.vx *= k; s.vy *= k;
}

/** Scatter orbs over the course's open floor. `points` are candidate positions; avoids pits. */
export function placeOrbs(course: Course, points: [number, number][], count: number, rand: () => number): void {
  course.orbs.length = 0;
  const pool = points.filter(([x, y]) => !course.pits.some((p) => inRegion(p, x, y)));
  for (let i = 0; i < count && pool.length; i++) {
    const k = Math.floor(rand() * pool.length);
    const [x, y] = pool.splice(k, 1)[0];
    course.orbs.push({ x, y, cooldown: 0 });
  }
}

/** Tick orb respawn timers; returns true if this ship collected one. */
export function collectOrb(course: Course, s: Ship): boolean {
  if (s.fall > 0) return false;
  const r2 = (SNAKE.orbRadius + PHYS.radius) ** 2;
  for (const o of course.orbs) {
    if (o.cooldown > 0) continue;
    if ((o.x - s.x) ** 2 + (o.y - s.y) ** 2 < r2) { o.cooldown = SNAKE.orbRespawn; return true; }
  }
  return false;
}

export function tickOrbs(course: Course, dt: number): void {
  for (const o of course.orbs) if (o.cooldown > 0) o.cooldown -= dt;
}

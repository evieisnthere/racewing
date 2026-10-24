import { clamp, smoothstep, wrapAngle } from './math';
import type { Track } from './track';

export const PHYS = {
  thrust: 600,
  drag: 1.0,
  /** Lateral velocity decay rate; some of the bled speed is fed forward. */
  grip: 4.5,
  gripConvert: 0.3,
  turnRate: 3.3,
  turnAccel: 30,
  brake: 1000,
  reverse: 300,
  maxReverse: 180,
  radius: 9,
  /** sin(impact angle) below which wall contact is a slide rather than a hit. */
  scrapeAngle: 0.42,
  /** Speed lost per second while sliding along a wall nose-first. */
  wallFriction: 0.5,
  /** Grinding: tail (engine flame) at the wall, nose angled away from it. */
  grindReach: 12,
  grindMinAngle: 0.03,
  scrapeAccel: 380,
  restitution: 0.35,
  hitLoss: 0.5,
  padBoost: 260,
  padMax: 1000,
  padCooldown: 0.5,
  shipBounce: 0.6,
};

export interface Intent { turn: number; throttle: number }

export interface Ship {
  x: number; y: number; vx: number; vy: number;
  angle: number; angVel: number;
  idx: number;
  /** Seconds of scrape contact remaining (boost active while > 0). */
  scrape: number;
  scrapeX: number; scrapeY: number; scrapeNx: number; scrapeNy: number;
  /** Most recent hard-impact speed, decays. */
  hit: number;
  hitX: number; hitY: number;
  boost: number;
  padCd: number;
  thrustMul: number;
  throttle: number;
  turn: number;
  inField: boolean;
}

export function makeShip(x: number, y: number, angle: number, idx: number): Ship {
  return {
    x, y, vx: 0, vy: 0, angle, angVel: 0, idx,
    scrape: 0, scrapeX: 0, scrapeY: 0, scrapeNx: 0, scrapeNy: 0,
    hit: 0, hitX: 0, hitY: 0, boost: 0, padCd: 0, thrustMul: 1, throttle: 0, turn: 0, inField: false,
  };
}

/** Two-button mapping. 'thrust': always thrust, single button turns, both brakes then reverses. 'classic': single turns while coasting, both thrusts. */
export type Scheme = 'thrust' | 'classic';

export function intentFrom(left: boolean, right: boolean, scheme: Scheme): Intent {
  if (scheme === 'classic') {
    if (left && right) return { turn: 0, throttle: 1 };
    return { turn: left ? -1 : right ? 1 : 0, throttle: 0 };
  }
  if (left && right) return { turn: 0, throttle: -1 };
  return { turn: left ? -1 : right ? 1 : 0, throttle: 1 };
}

export function speedOf(s: Ship): number {
  return Math.hypot(s.vx, s.vy);
}

export function stepShip(s: Ship, intent: Intent, track: Track, dt: number): void {
  s.throttle = intent.throttle;
  s.turn = intent.turn;
  const targetW = intent.turn * PHYS.turnRate;
  const maxDw = PHYS.turnAccel * dt;
  s.angVel += clamp(targetW - s.angVel, -maxDw, maxDw);
  s.angle = wrapAngle(s.angle + s.angVel * dt);
  const hx = Math.cos(s.angle), hy = Math.sin(s.angle);

  const fwd = s.vx * hx + s.vy * hy;
  if (intent.throttle > 0) {
    const a = PHYS.thrust * s.thrustMul * intent.throttle * dt;
    s.vx += hx * a; s.vy += hy * a;
  } else if (intent.throttle < 0) {
    if (fwd > 20) {
      const d = Math.min(PHYS.brake * dt, fwd);
      s.vx -= hx * d; s.vy -= hy * d;
    } else if (fwd > -PHYS.maxReverse) {
      s.vx -= hx * PHYS.reverse * dt; s.vy -= hy * PHYS.reverse * dt;
    }
  }

  // Lateral grip: bleed sideways velocity, feeding part of it forward so carving a turn isn't a dead loss.
  const px = -hy, py = hx;
  const lat = s.vx * px + s.vy * py;
  const dl = lat * (1 - Math.exp(-PHYS.grip * dt));
  s.vx -= px * dl; s.vy -= py * dl;
  const gain = Math.abs(dl) * PHYS.gripConvert * Math.sign(fwd);
  s.vx += hx * gain; s.vy += hy * gain;

  const drag = Math.exp(-PHYS.drag * dt);
  s.vx *= drag; s.vy *= drag;

  // Fields
  s.inField = false;
  for (const z of track.zones) {
    if (!track.inRange(s.idx, z.i0, z.i1)) continue;
    const base = Math.atan2(track.ty[s.idx], track.tx[s.idx]) + z.angle;
    s.vx += Math.cos(base) * z.strength * dt;
    s.vy += Math.sin(base) * z.strength * dt;
    s.inField = true;
  }
  for (const w of track.wells) {
    const dx = w.x - s.x, dy = w.y - s.y;
    const d = Math.hypot(dx, dy);
    if (d >= w.radius || d < 1) continue;
    const f = w.strength * (1 - d / w.radius) * dt;
    s.vx += (dx / d) * f; s.vy += (dy / d) * f;
    s.inField = true;
  }
  s.padCd -= dt;
  if (s.padCd <= 0) {
    const latPos = track.lateral(s.x, s.y, s.idx);
    for (const p of track.pads) {
      if (!track.inRange(s.idx, p.i0, p.i1) || Math.abs(latPos - p.lat) > p.halfWidth) continue;
      const f = s.vx * hx + s.vy * hy;
      const add = Math.max(0, Math.min(PHYS.padBoost, PHYS.padMax - f));
      s.vx += hx * add; s.vy += hy * add;
      s.padCd = PHYS.padCooldown;
      s.boost = 0.6;
      break;
    }
  }

  if (s.scrape > 0) {
    const sp = Math.hypot(s.vx, s.vy);
    if (sp > 1) {
      s.vx += (s.vx / sp) * PHYS.scrapeAccel * dt;
      s.vy += (s.vy / sp) * PHYS.scrapeAccel * dt;
    }
  }
  s.scrape -= dt;
  s.hit *= Math.exp(-6 * dt);
  s.boost -= dt;

  s.x += s.vx * dt;
  s.y += s.vy * dt;
  collideWalls(s, track);
  s.idx = track.nearest(s.x, s.y, s.idx);
  contain(s, track);
  grind(s, track);
}

function collideWalls(s: Ship, track: Track): void {
  const r = PHYS.radius;
  for (const id of track.query(s.x, s.y)) {
    const g = track.segments[id];
    const ex = g.bx - g.ax, ey = g.by - g.ay;
    const l2 = ex * ex + ey * ey;
    const t = l2 > 0 ? clamp(((s.x - g.ax) * ex + (s.y - g.ay) * ey) / l2, 0, 1) : 0;
    const qx = g.ax + ex * t, qy = g.ay + ey * t;
    const dx = s.x - qx, dy = s.y - qy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    const side = (s.x - g.ax) * g.nx + (s.y - g.ay) * g.ny;
    let nx: number, ny: number, push: number;
    const d = Math.sqrt(d2);
    if (side < 0 || d < 1e-6) {
      nx = g.nx; ny = g.ny; push = r - side;
    } else {
      nx = dx / d; ny = dy / d; push = r - d;
    }
    s.x += nx * push; s.y += ny * push;
    respond(s, nx, ny, qx, qy);
  }
}

function respond(s: Ship, nx: number, ny: number, cx: number, cy: number): void {
  const vn = s.vx * nx + s.vy * ny;
  const sp = Math.hypot(s.vx, s.vy);
  if (vn >= 0) return;
  const ratio = -vn / Math.max(sp, 1);
  const tx = s.vx - vn * nx, ty = s.vy - vn * ny;
  if (ratio < PHYS.scrapeAngle) {
    // Nose-first slide: rub off a little speed. Boost only comes from grinding (see grind()).
    const keep = 1 - PHYS.wallFriction / 240;
    s.vx = tx * keep; s.vy = ty * keep;
  } else {
    const loss = smoothstep(PHYS.scrapeAngle, 1, ratio) * PHYS.hitLoss;
    s.vx = tx * (1 - loss) - vn * nx * PHYS.restitution;
    s.vy = ty * (1 - loss) - vn * ny * PHYS.restitution;
    if (-vn > s.hit) { s.hit = -vn; s.hitX = cx; s.hitY = cy; }
  }
}

/**
 * Grinding: the tail (where the engine flame is) is touching the wall and the nose points away from it,
 * so the exhaust is aimed at the wall. That's the only wall contact that boosts.
 */
function grind(s: Ship, track: Track): void {
  const hx = Math.cos(s.angle), hy = Math.sin(s.angle);
  const sp = Math.hypot(s.vx, s.vy);
  if (sp < 120 || (s.vx * hx + s.vy * hy) < 0) return;
  const tailX = s.x - hx * PHYS.radius, tailY = s.y - hy * PHYS.radius;
  const reach = PHYS.grindReach;
  let best = reach * reach, bx = 0, by = 0, bnx = 0, bny = 0;
  for (const id of track.query(tailX, tailY)) {
    const g = track.segments[id];
    const ex = g.bx - g.ax, ey = g.by - g.ay;
    const l2 = ex * ex + ey * ey;
    const t = l2 > 0 ? clamp(((tailX - g.ax) * ex + (tailY - g.ay) * ey) / l2, 0, 1) : 0;
    const qx = g.ax + ex * t, qy = g.ay + ey * t;
    const d2 = (tailX - qx) ** 2 + (tailY - qy) ** 2;
    if (d2 < best) { best = d2; bx = qx; by = qy; bnx = g.nx; bny = g.ny; }
  }
  if (best >= reach * reach) return;
  if (hx * bnx + hy * bny < PHYS.grindMinAngle) return;
  s.scrape = 0.06;
  s.scrapeX = bx; s.scrapeY = by; s.scrapeNx = bnx; s.scrapeNy = bny;
}

/** Fallback if a ship ever tunnels through a wall: put it back on the track. */
function contain(s: Ship, track: Track): void {
  const i = s.idx;
  const lat = track.lateral(s.x, s.y, i);
  const lim = track.hw[i] - PHYS.radius * 0.5;
  if (Math.abs(lat) <= lim + PHYS.radius) return;
  const sign = Math.sign(lat);
  const back = lat - sign * (lim - 1);
  s.x -= track.nx[i] * back; s.y -= track.ny[i] * back;
  const vn = (s.vx * track.nx[i] + s.vy * track.ny[i]) * sign;
  if (vn > 0) { s.vx -= track.nx[i] * vn * sign; s.vy -= track.ny[i] * vn * sign; }
}

export function collideShips(a: Ship, b: Ship): boolean {
  const r = PHYS.radius * 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r || d2 < 1e-6) return false;
  const d = Math.sqrt(d2);
  const nx = dx / d, ny = dy / d;
  const push = (r - d) / 2;
  a.x -= nx * push; a.y -= ny * push;
  b.x += nx * push; b.y += ny * push;
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel < 0) {
    const j = (-(1 + PHYS.shipBounce) * rel) / 2;
    a.vx -= nx * j; a.vy -= ny * j;
    b.vx += nx * j; b.vy += ny * j;
  }
  return true;
}

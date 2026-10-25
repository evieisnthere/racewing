import { clamp, smoothstep, wrapAngle } from './math';
import { inRegion, type Course, type Segment } from './course';
import { Track } from './track';

// Data Wing-scale world: a ship is ~28 units long, tracks are ~4-5 ships wide.
// Motion model: velocity keeps its magnitude and swings toward the heading (drift), losing speed only in
// proportion to how sideways you're sliding. A weak engine and low drag mean momentum does the work;
// grinding a wall with your engine flame adds roughly +50% on top of cruise speed.
export const PHYS = {
  thrust: 165,
  drag: 0.55,
  /** How fast velocity swings toward the heading (1/s): lower = longer drifts. */
  align: 2.4,
  /** Speed lost per second at a full 90-degree slide. */
  slipLoss: 0.7,
  turnRate: 3.0,
  turnAccel: 26,
  brake: 420,
  reverse: 120,
  maxReverse: 90,
  radius: 9,
  /** sin(impact angle) below which wall contact is a slide rather than a hit. */
  scrapeAngle: 0.45,
  /** Speed lost per second while sliding along a wall nose-first. */
  wallFriction: 0.4,
  /** Grinding: tail (engine flame) within reach of the wall, nose angled away from it or near-parallel. */
  grindReach: 13,
  /** sin of the angle between nose and wall; slightly negative lets a near-parallel nose still count. */
  grindMinAngle: -0.15,
  scrapeAccel: 80,
  /** Pull toward the wall while grinding, so you can ride it through corners. */
  grindHold: 150,
  /** Scales every gravity zone and well. */
  fieldScale: 0.42,
  restitution: 0.3,
  hitLoss: 0.45,
  padBoost: 110,
  padMax: 430,
  padCooldown: 0.5,
  shipBounce: 0.6,
  /** Extra shove from moving hazard bars. */
  hazardKick: 160,
  portalCooldown: 0.6,
  fallTime: 0.8,
};

export interface Intent { turn: number; throttle: number }

export interface Ship {
  x: number; y: number; vx: number; vy: number;
  angle: number; angVel: number;
  /** Nearest centreline sample (circuits only; 0 elsewhere). */
  idx: number;
  /** Seconds of grind contact remaining (boost active while > 0). */
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
  /** Airborne seconds remaining, and the jump's total airtime. */
  air: number;
  airMax: number;
  /** Falling into a pit: seconds until respawn. */
  fall: number;
  portalCd: number;
  /** Portal exit the ship arrived at; it can't re-enter until it has left that circle. */
  lockX: number; lockY: number; lockR: number;
  /** Set when a portal fired this step (for effects). */
  warped: number;
  flipped: boolean;
  surface: string;
  /** Respawn point for pits in puzzle levels. */
  checkX: number; checkY: number; checkAngle: number;
}

export function makeShip(x: number, y: number, angle: number, idx: number): Ship {
  return {
    x, y, vx: 0, vy: 0, angle, angVel: 0, idx,
    scrape: 0, scrapeX: 0, scrapeY: 0, scrapeNx: 0, scrapeNy: 0,
    hit: 0, hitX: 0, hitY: 0, boost: 0, padCd: 0, thrustMul: 1, throttle: 0, turn: 0, inField: false,
    air: 0, airMax: 0, fall: 0, portalCd: 0, lockX: 0, lockY: 0, lockR: 0, warped: 0, flipped: false, surface: '',
    checkX: x, checkY: y, checkAngle: angle,
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

/** Is the ship over a flip zone? (Bots use this to undo the flip on their own inputs.) */
export function inFlip(s: Ship, course: Course): boolean {
  for (const sf of course.surfaces) if (sf.kind === 'flip' && inRegion(sf, s.x, s.y)) return true;
  return false;
}

export function stepShip(s: Ship, intent: Intent, course: Course, dt: number): void {
  const track = course instanceof Track ? course : null;
  s.warped = Math.max(0, s.warped - dt);
  s.hit *= Math.exp(-6 * dt);
  s.boost -= dt;
  s.scrape -= dt;
  s.portalCd -= dt;
  s.padCd -= dt;

  if (s.fall > 0) {
    s.fall -= dt;
    s.vx = 0; s.vy = 0;
    if (s.fall <= 0) {
      const p = course.respawnPoint(s);
      s.x = p.x; s.y = p.y; s.angle = p.angle; s.angVel = 0;
      s.vx = Math.cos(p.angle) * 60; s.vy = Math.sin(p.angle) * 60;
      if (track) s.idx = track.nearest(s.x, s.y, -1);
    }
    return;
  }

  const sf = s.air > 0 ? null : course.surfaceAt(s.x, s.y);
  s.surface = sf?.kind ?? '';
  s.flipped = sf?.kind === 'flip';
  const turn = s.flipped ? -intent.turn : intent.turn;
  s.throttle = intent.throttle;
  s.turn = turn;

  if (s.air > 0) {
    // Airborne: no steering or thrust, just momentum.
    s.air -= dt;
    s.angVel *= Math.exp(-3 * dt);
    s.angle = wrapAngle(s.angle + s.angVel * dt);
    const drag = Math.exp(-0.3 * dt);
    s.vx *= drag; s.vy *= drag;
  } else {
    const targetW = turn * PHYS.turnRate;
    const maxDw = PHYS.turnAccel * dt;
    s.angVel += clamp(targetW - s.angVel, -maxDw, maxDw);
    s.angle = wrapAngle(s.angle + s.angVel * dt);
    const hx = Math.cos(s.angle), hy = Math.sin(s.angle);
    const thrustMul = sf?.kind === 'turbo' ? 1.8 : 1;
    const fwd = s.vx * hx + s.vy * hy;
    if (intent.throttle > 0) {
      const a = PHYS.thrust * s.thrustMul * thrustMul * intent.throttle * dt;
      s.vx += hx * a; s.vy += hy * a;
    } else if (intent.throttle < 0) {
      if (fwd > 10) {
        const sp = Math.hypot(s.vx, s.vy);
        const k = Math.max(0, sp - PHYS.brake * dt) / sp;
        s.vx *= k; s.vy *= k;
      } else if (fwd > -PHYS.maxReverse) {
        s.vx -= hx * PHYS.reverse * dt; s.vy -= hy * PHYS.reverse * dt;
      }
    }

    // Drift: velocity keeps its speed and swings toward the nose; sliding sideways costs a little speed.
    const sp = Math.hypot(s.vx, s.vy);
    if (sp > 1 && fwd > -5) {
      const ice = sf?.kind === 'ice';
      const va = Math.atan2(s.vy, s.vx);
      const slip = wrapAngle(s.angle - va);
      const swing = slip * (1 - Math.exp(-(ice ? PHYS.align * 0.15 : PHYS.align) * dt));
      const loss = Math.abs(Math.sin(slip)) * (ice ? 0.1 : PHYS.slipLoss) * dt;
      const ns = sp * (1 - loss);
      s.vx = Math.cos(va + swing) * ns;
      s.vy = Math.sin(va + swing) * ns;
    }

    const dragK = sf?.kind === 'ice' ? PHYS.drag * 0.4 : sf?.kind === 'mud' ? PHYS.drag + 2.2 : PHYS.drag;
    const drag = Math.exp(-dragK * dt);
    s.vx *= drag; s.vy *= drag;

    // Fields
    s.inField = false;
    if (track) {
      for (const z of track.zones) {
        if (!track.inRange(s.idx, z.i0, z.i1)) continue;
        const base = Math.atan2(track.ty[s.idx], track.tx[s.idx]) + z.angle;
        s.vx += Math.cos(base) * z.strength * PHYS.fieldScale * dt;
        s.vy += Math.sin(base) * z.strength * PHYS.fieldScale * dt;
        s.inField = true;
      }
      if (s.padCd <= 0) {
        const latPos = track.lateral(s.x, s.y, s.idx);
        for (const p of track.pads) {
          if (!track.inRange(s.idx, p.i0, p.i1) || Math.abs(latPos - p.lat) > p.halfWidth) continue;
          padBoost(s, hx, hy);
          break;
        }
      }
    }
    for (const c of course.currents) {
      if (!inRegion(c, s.x, s.y)) continue;
      s.vx += c.dx * c.strength * PHYS.fieldScale * dt;
      s.vy += c.dy * c.strength * PHYS.fieldScale * dt;
      s.inField = true;
    }
    for (const w of course.wells) {
      const dx = w.x - s.x, dy = w.y - s.y;
      const d = Math.hypot(dx, dy);
      if (d >= w.radius || d < 1) continue;
      const f = w.strength * PHYS.fieldScale * (1 - d / w.radius) * dt;
      s.vx += (dx / d) * f; s.vy += (dy / d) * f;
      s.inField = true;
    }

    if (s.scrape > 0) {
      const v = Math.hypot(s.vx, s.vy);
      if (v > 1) {
        s.vx += (s.vx / v) * PHYS.scrapeAccel * dt;
        s.vy += (s.vy / v) * PHYS.scrapeAccel * dt;
      }
      // Hold against the wall (the normal points away from it).
      s.vx -= s.scrapeNx * PHYS.grindHold * dt;
      s.vy -= s.scrapeNy * PHYS.grindHold * dt;
    }

    for (const r of course.ramps) {
      if (!inRegion(r, s.x, s.y)) continue;
      const along = s.vx * r.dx + s.vy * r.dy;
      if (along > 60) {
        s.air = s.airMax = clamp(0.45 + along / 400, 0.6, 1.2);
        s.angVel = 0;
      }
      break;
    }
  }

  s.x += s.vx * dt;
  s.y += s.vy * dt;
  collideWalls(s, course);
  if (track) {
    s.idx = track.nearest(s.x, s.y, s.idx);
    contain(s, track);
  }
  if (s.air <= 0) {
    grind(s, course);
    for (const pit of course.pits) {
      if (inRegion(pit, s.x, s.y)) { s.fall = PHYS.fallTime; s.scrape = 0; break; }
    }
  }
  warp(s, course, track);
}

/** Boost along the ship's heading (pads). */
export function padBoost(s: Ship, hx: number, hy: number): void {
  const f = s.vx * hx + s.vy * hy;
  const add = Math.max(0, Math.min(PHYS.padBoost, PHYS.padMax - f));
  s.vx += hx * add; s.vy += hy * add;
  s.padCd = PHYS.padCooldown;
  s.boost = 0.6;
}

function warp(s: Ship, course: Course, track: Track | null): void {
  if (s.lockR > 0 && (s.x - s.lockX) ** 2 + (s.y - s.lockY) ** 2 > s.lockR * s.lockR) s.lockR = 0;
  if (s.portalCd > 0) return;
  for (const p of course.portals) {
    for (const forward of p.twoWay ? [true, false] : [true]) {
      const [fx, fy, fa, tx, ty, ta] = forward ? [p.ax, p.ay, p.aAngle, p.bx, p.by, p.bAngle] : [p.bx, p.by, p.bAngle, p.ax, p.ay, p.aAngle];
      if ((s.x - fx) ** 2 + (s.y - fy) ** 2 > p.r * p.r) continue;
      if (s.lockR > 0 && fx === s.lockX && fy === s.lockY) continue;
      // Keep speed; rotate velocity and heading by the difference between the portal orientations.
      const rot = ta - fa;
      const c = Math.cos(rot), sn = Math.sin(rot);
      const vx = s.vx * c - s.vy * sn, vy = s.vx * sn + s.vy * c;
      s.vx = vx; s.vy = vy;
      s.angle = wrapAngle(s.angle + rot);
      const sp = Math.hypot(vx, vy) || 1;
      s.x = tx + (vx / sp) * (p.r + 14);
      s.y = ty + (vy / sp) * (p.r + 14);
      s.portalCd = PHYS.portalCooldown;
      s.lockX = tx; s.lockY = ty; s.lockR = p.r + 60;
      s.warped = 0.35;
      if (track) s.idx = track.nearest(s.x, s.y, -1);
      return;
    }
  }
}

function collideSeg(s: Ship, g: Segment): void {
  const r = PHYS.radius;
  const ex = g.bx - g.ax, ey = g.by - g.ay;
  const l2 = ex * ex + ey * ey;
  const t = l2 > 0 ? clamp(((s.x - g.ax) * ex + (s.y - g.ay) * ey) / l2, 0, 1) : 0;
  const qx = g.ax + ex * t, qy = g.ay + ey * t;
  const dx = s.x - qx, dy = s.y - qy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return;
  const d = Math.sqrt(d2);
  let nx: number, ny: number, push: number;
  if (g.twoSided) {
    if (d < 1e-6) { nx = -ey / Math.sqrt(l2); ny = ex / Math.sqrt(l2); } else { nx = dx / d; ny = dy / d; }
    push = r - d;
    s.x += nx * push; s.y += ny * push;
    respond(s, nx, ny, qx, qy);
    s.vx += nx * PHYS.hazardKick * 0.016; s.vy += ny * PHYS.hazardKick * 0.016;
    s.hit = Math.max(s.hit, 300); s.hitX = qx; s.hitY = qy;
    return;
  }
  const side = (s.x - g.ax) * g.nx + (s.y - g.ay) * g.ny;
  if (side < 0 || d < 1e-6) {
    nx = g.nx; ny = g.ny; push = r - side;
  } else {
    nx = dx / d; ny = dy / d; push = r - d;
  }
  s.x += nx * push; s.y += ny * push;
  respond(s, nx, ny, qx, qy);
}

function collideWalls(s: Ship, course: Course): void {
  const airborne = s.air > 0;
  for (const id of course.query(s.x, s.y)) {
    const g = course.segments[id];
    if (airborne && g.low) continue;
    collideSeg(s, g);
  }
  for (const g of course.dynamic) {
    if (airborne && g.low) continue;
    collideSeg(s, g);
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
 * Grinding: the tail (where the engine flame is) is at the wall and the nose points away from it (or near-parallel),
 * so the exhaust is aimed at the wall. That's the only wall contact that boosts.
 */
function grind(s: Ship, course: Course): void {
  const hx = Math.cos(s.angle), hy = Math.sin(s.angle);
  const sp = Math.hypot(s.vx, s.vy);
  if (sp < 60 || (s.vx * hx + s.vy * hy) < 0) return;
  const tailX = s.x - hx * PHYS.radius, tailY = s.y - hy * PHYS.radius;
  const reach = PHYS.grindReach;
  let best = reach * reach, bx = 0, by = 0, bnx = 0, bny = 0;
  for (const id of course.query(tailX, tailY)) {
    const g = course.segments[id];
    if (g.low) continue;
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

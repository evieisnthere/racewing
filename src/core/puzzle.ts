// A single-player run through a puzzle Level: keys, gates, switches, checkpoints, goal and the clock.
import { Level, TILE, type LevelDef } from './level';
import { mulberry32, wrapAngle } from './math';
import { inFlip, intentFrom, makeShip, PHYS, stepShip, type Scheme, type Ship } from './physics';
import { Racer, STEP, type Buttons, type RacerSpec } from './race';

export type PuzzleEvent =
  | { type: 'go' }
  | { type: 'key'; id: string }
  | { type: 'switch' }
  | { type: 'checkpoint' }
  | { type: 'fall' }
  | { type: 'goal'; time: number };

/** Steers through tile-coordinate waypoints with the same two buttons a player has. */
export class RouteBot {
  private i = 0;
  private timer = 0;
  private left = false;
  private right = false;
  private rand = mulberry32(5);
  readonly pts: [number, number][];

  constructor(route: [number, number][]) {
    this.pts = route.map(([c, r]) => [(c + 0.5) * TILE, (r + 0.5) * TILE]);
  }

  get index(): number { return this.i; }

  /** After a warp or respawn: jump to the closest waypoint (searching forward after a warp, backward after a respawn). */
  resync(x: number, y: number, forward: boolean): void {
    let best = this.i, bestD = Infinity;
    const [a, b] = forward ? [this.i, this.pts.length - 1] : [0, this.i];
    for (let k = a; k <= b; k++) {
      const d = Math.hypot(this.pts[k][0] - x, this.pts[k][1] - y);
      if (d < bestD) { bestD = d; best = k; }
    }
    this.i = best;
  }

  think(s: Ship, dt: number): Buttons {
    if (s.warped > 0.3) this.resync(s.x, s.y, true);
    this.timer -= dt;
    if (this.timer > 0) return { left: this.left, right: this.right };
    this.timer = 0.02;
    let [tx, ty] = this.pts[this.i];
    let dist = Math.hypot(tx - s.x, ty - s.y);
    while (dist < 20 && this.i < this.pts.length - 1) {
      this.i++;
      [tx, ty] = this.pts[this.i];
      dist = Math.hypot(tx - s.x, ty - s.y);
    }
    const speed = Math.hypot(s.vx, s.vy);
    const desired = Math.atan2(ty - s.y, tx - s.x);
    let aim = desired;
    if (speed > 40) aim = desired + wrapAngle(desired - Math.atan2(s.vy, s.vx)) * 0.9;
    const err = wrapAngle(aim - s.angle);
    // Corner speed from the turn at the upcoming waypoint.
    let allowed = 450;
    if (this.i < this.pts.length - 1) {
      const [nx, ny] = this.pts[this.i + 1];
      const turn = Math.abs(wrapAngle(Math.atan2(ny - ty, nx - tx) - desired));
      allowed = 260 - turn * 65;
    }
    const brakeDist = Math.max(0, (speed * speed - allowed * allowed) / (2 * PHYS.brake * 0.6));
    if ((speed > allowed && dist < brakeDist + 35) || (Math.abs(err) > 1.4 && speed > 75)) return this.set(true, true);
    const dz = 0.05 + this.rand() * 0.02;
    return this.set(err < -dz, err > dz);
  }

  private set(left: boolean, right: boolean): Buttons {
    this.left = left; this.right = right;
    return { left, right };
  }
}

export class PuzzleRun {
  readonly course: Level;
  readonly racers: Racer[];
  readonly events: PuzzleEvent[] = [];
  time = -3;
  state: 'countdown' | 'racing' | 'finished' = 'countdown';
  finishedAt = Infinity;
  private onSwitch = false;
  falls = 0;

  constructor(def: LevelDef | Level, spec: RacerSpec, readonly scheme: Scheme, public autopilot: RouteBot | null = null) {
    this.course = def instanceof Level ? def : new Level(def);
    this.course.reset();
    const st = this.course.start;
    const ship = makeShip(st.x, st.y, st.angle, 0);
    this.racers = [new Racer(spec, ship, 1)];
  }

  get me(): Racer { return this.racers[0]; }

  step(input: Buttons[]): void {
    const dt = STEP;
    this.time += dt;
    if (this.state === 'countdown') {
      if (this.time >= 0) { this.state = 'racing'; this.time = 0; this.events.push({ type: 'go' }); }
      else return;
    }
    const lv = this.course;
    lv.update(this.time);
    const r = this.me;
    const s = r.ship;
    let b = input[0] ?? { left: false, right: false };
    if (this.state === 'finished') b = { left: true, right: true };
    else if (this.autopilot) {
      b = this.autopilot.think(s, dt);
      if (inFlip(s, lv)) b = { left: b.right, right: b.left };
    }
    r.left = b.left; r.right = b.right;
    const wasFalling = s.fall > 0;
    stepShip(s, intentFrom(b.left, b.right, this.scheme), lv, dt);
    if (!wasFalling && s.fall > 0) { this.falls++; this.events.push({ type: 'fall' }); }
    if (wasFalling && s.fall <= 0 && this.autopilot) this.autopilot.resync(s.x, s.y, false);
    if (s.fall > 0 || this.state === 'finished') return;
    this.escapeLowTiles(s);

    for (const k of lv.keys) {
      if (!k.taken && (s.x - k.x) ** 2 + (s.y - k.y) ** 2 < 26 * 26) {
        k.taken = true;
        lv.held.add(k.id);
        this.events.push({ type: 'key', id: k.id });
      }
    }
    // Switches re-arm only once the ship is well clear of them, so drifting across the edge can't double-toggle.
    let touching = false, near = false;
    for (const sw of lv.switches) {
      const d2 = (s.x - sw.x) ** 2 + (s.y - sw.y) ** 2;
      if (d2 < 24 * 24) touching = true;
      if (d2 < 55 * 55) near = true;
    }
    if (touching && !this.onSwitch && s.air <= 0) {
      lv.toggled = !lv.toggled;
      for (const sw of lv.switches) sw.on = lv.toggled;
      this.events.push({ type: 'switch' });
      this.onSwitch = true;
    }
    if (!near) this.onSwitch = false;
    for (const cp of lv.checkpoints) {
      if ((s.x - cp.x) ** 2 + (s.y - cp.y) ** 2 < 28 * 28) {
        s.checkX = cp.x; s.checkY = cp.y; s.checkAngle = s.angle;
        if (!cp.reached) { cp.reached = true; this.events.push({ type: 'checkpoint' }); }
      }
    }
    const g = lv.goal;
    if ((s.x - g.x) ** 2 + (s.y - g.y) ** 2 < g.r * g.r) {
      this.state = 'finished';
      this.finishedAt = this.time;
      r.finished = true;
      r.finishTime = this.time;
      this.events.push({ type: 'goal', time: this.time });
    }
  }

  /** A grounded ship that landed inside a low-wall tile is nudged out along its direction of travel. */
  private escapeLowTiles(s: Ship): void {
    if (s.air > 0) return;
    for (const [c, r] of this.course.lowTiles) {
      const x0 = c * TILE, y0 = r * TILE;
      if (s.x < x0 || s.x > x0 + TILE || s.y < y0 || s.y > y0 + TILE) continue;
      const sp = Math.hypot(s.vx, s.vy) || 1;
      const ux = s.vx / sp, uy = s.vy / sp;
      for (let k = 0; k < 60; k++) {
        s.x += ux * 2; s.y += uy * 2;
        if (s.x < x0 - PHYS.radius || s.x > x0 + TILE + PHYS.radius || s.y < y0 - PHYS.radius || s.y > y0 + TILE + PHYS.radius) break;
      }
    }
  }
}

/** Run the route bot headlessly; returns its finish time or null if it never reached the goal. */
export function routeTime(def: LevelDef, limit = 240): number | null {
  const run = new PuzzleRun(def, { name: 'bot', color: 0, kind: 'human', slot: 0 }, 'thrust', new RouteBot(def.route));
  while (run.state !== 'finished' && run.time < limit) run.step([]);
  return run.state === 'finished' ? run.finishedAt : null;
}

const medalCache = new Map<string, [number, number, number]>();

/** Bronze/silver/gold times from the route bot (gold is a little slower than the bot's clean run). */
export function puzzleTargets(def: LevelDef): [number, number, number] {
  let m = medalCache.get(def.id);
  if (!m) {
    const t = routeTime(def) ?? 120;
    m = [Math.ceil(t * 1.7), Math.ceil(t * 1.3), Math.ceil(t * 1.06)];
    medalCache.set(def.id, m);
  }
  return m;
}

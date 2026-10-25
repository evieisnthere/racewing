// Snake Battle: ships with tails in a pit arena. Fall in and you lose a life; last ship flying wins.
import type { Tier } from './ai';
import { inRegion } from './course';
import { Level, TILE, type LevelDef } from './level';
import { mulberry32, wrapAngle } from './math';
import { collideShips, intentFrom, makeShip, stepShip, type Scheme, type Ship } from './physics';
import { Racer, STEP, type Buttons, type RacerSpec } from './race';
import { collectOrb, grow, makeTail, placeOrbs, resetTail, shed, stepTail, tailDrag, tailHits, tickOrbs } from './snake';

export interface BattleConfig {
  arena: LevelDef;
  racers: RacerSpec[];
  lives: number;
  /** Seconds; when it runs out, most lives (then longest tail) wins. */
  timeLimit: number;
  scheme: Scheme;
  seed?: number;
}

export type BattleEvent =
  | { type: 'go' }
  | { type: 'fall'; racer: Racer; by: Racer | null }
  | { type: 'out'; racer: Racer; place: number }
  | { type: 'orb'; racer: Racer }
  | { type: 'whip'; racer: Racer; target: Racer; power: number }
  | { type: 'win'; racer: Racer | null };

/** Seconds of protection after a respawn. */
const SHIELD = 2;

interface Skill { react: number; look: number; aggro: number; flickCd: number; cap: number }
const ARENA_SKILL: Record<Tier, Skill> = {
  easy: { react: 0.12, look: 0.3, aggro: 0.4, flickCd: 1.8, cap: 150 },
  medium: { react: 0.08, look: 0.45, aggro: 0.6, flickCd: 1.3, cap: 165 },
  hard: { react: 0.05, look: 0.6, aggro: 0.8, flickCd: 0.9, cap: 180 },
  insane: { react: 0.03, look: 0.75, aggro: 1, flickCd: 0.6, cap: 195 },
};

/** Arena AI: stay off the edges, hunt the nearest rival, and flick the tail into them. */
export class ArenaBot {
  private k: Skill;
  private timer = 0;
  private cur: Buttons = { left: false, right: false };
  private flick = 0;
  private flickDir = 0;
  private flickCd = 1;
  private rand: () => number;

  constructor(tier: Tier, seed: number) {
    this.k = ARENA_SKILL[tier];
    this.rand = mulberry32(seed);
  }

  think(me: Racer, all: Racer[], run: BattleRun, dt: number): Buttons {
    this.timer -= dt;
    this.flickCd -= dt;
    if (this.flick > 0) {
      this.flick -= dt;
      return { left: this.flickDir < 0, right: this.flickDir > 0, thrust: true };
    }
    if (this.timer > 0) return this.cur;
    this.timer = this.k.react * (0.7 + this.rand() * 0.6);
    const s = me.ship;
    const lv = run.course;
    const speed = Math.hypot(s.vx, s.vy);

    // Danger: will our current slide carry us into a pit?
    let danger = false;
    for (const t of [0.12, 0.25, this.k.look]) {
      if (run.inPit(s.x + s.vx * t, s.y + s.vy * t)) { danger = true; break; }
    }
    // Slow creeps count too: something solid must sit just ahead of the slide.
    if (!danger && speed > 8 && run.inPit(s.x + (s.vx / speed) * 18, s.y + (s.vy / speed) * 18)) danger = true;
    if (danger) {
      // Thrust to cancel the slide toward open floor rather than just pointing at it.
      const [ex, ey] = run.escape(s.x, s.y, s.vx, s.vy);
      const aim = Math.atan2(ey * 90 - s.vy, ex * 90 - s.vx);
      const err = wrapAngle(aim - s.angle);
      this.cur = { left: err < -0.08, right: err > 0.08, thrust: Math.abs(err) < 0.7, brake: Math.abs(err) > 2.2 && speed > 60 };
      return this.cur;
    }
    let tx: number, ty: number;
    {
      const foe = all.filter((o) => o !== me && !o.out && o.ship.fall <= 0)
        .sort((a, b) => Math.hypot(a.ship.x - s.x, a.ship.y - s.y) - Math.hypot(b.ship.x - s.x, b.ship.y - s.y))[0];
      const orb = me.tail && me.tail.n < 10 ? lv.orbs.filter((o) => o.cooldown <= 0)
        .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0] : undefined;
      const foeD = foe ? Math.hypot(foe.ship.x - s.x, foe.ship.y - s.y) : Infinity;
      if (orb && (Math.hypot(orb.x - s.x, orb.y - s.y) < 140 || foeD > 260) && this.rand() > this.k.aggro * 0.5) {
        tx = orb.x; ty = orb.y;
      } else if (foe) {
        // Close: whip the tail across them (turn away from the side they're on).
        if (foeD < 46 && this.flickCd <= 0) {
          const hx = Math.cos(s.angle), hy = Math.sin(s.angle);
          const side = Math.sign(hx * (foe.ship.y - s.y) - hy * (foe.ship.x - s.x)) || 1;
          this.flickDir = -side;
          this.flick = 0.18;
          this.flickCd = this.k.flickCd;
          return { left: this.flickDir < 0, right: this.flickDir > 0, thrust: true };
        }
        // Approach from the side away from the nearest pit, so a shove sends them in.
        const lead = 0.35;
        tx = foe.ship.x + foe.ship.vx * lead;
        ty = foe.ship.y + foe.ship.vy * lead;
        const [cx, cy] = run.safeTowards(foe.ship.x, foe.ship.y);
        const ax = foe.ship.x - cx, ay = foe.ship.y - cy;
        const al = Math.hypot(ax, ay) || 1;
        tx -= (ax / al) * 26 * this.k.aggro; ty -= (ay / al) * 26 * this.k.aggro;
      } else {
        [tx, ty] = run.safeTowards(s.x, s.y);
      }
    }
    let desired = Math.atan2(ty - s.y, tx - s.x);
    // Don't drive across a pit to get there: swing the heading until the way ahead is floor.
    const reach = Math.min(70, Math.hypot(tx - s.x, ty - s.y));
    const blocked = (a: number) => [0.3, 0.6, 1].some((f) => run.inPit(s.x + Math.cos(a) * reach * f, s.y + Math.sin(a) * reach * f));
    if (blocked(desired)) {
      for (const off of [0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.7, -1.7, 2.4, -2.4]) {
        if (!blocked(desired + off)) { desired += off; break; }
      }
    }
    const want = Math.max(speed, 140);
    let aim = Math.atan2(Math.sin(desired) * want - s.vy, Math.cos(desired) * want - s.vx);
    const lean = wrapAngle(aim - desired);
    if (Math.abs(lean) > 0.5) aim = desired + Math.sign(lean) * 0.5;
    const err = wrapAngle(aim - s.angle);
    const dist = Math.hypot(tx - s.x, ty - s.y);
    const brake = danger && speed > 120 && Math.abs(wrapAngle(Math.atan2(s.vy, s.vx) - desired)) > 1.2;
    this.cur = {
      left: err < -0.08, right: err > 0.08,
      // Arenas are small: cruise at a speed we can still stop from, faster when closing for a hit.
      thrust: !brake && Math.abs(err) < 0.9 && dist > 30 && speed < (dist < 90 ? this.k.cap + 50 : this.k.cap),
      brake,
    };
    return this.cur;
  }
}

export class BattleRun {
  readonly course: Level;
  readonly racers: Racer[] = [];
  readonly lives: number[];
  readonly bots: (ArenaBot | null)[] = [];
  readonly events: BattleEvent[] = [];
  time = -3;
  state: 'countdown' | 'racing' | 'finished' = 'countdown';
  finishedAt = Infinity;
  private lastHitBy: (Racer | null)[] = [];
  private lastHitAt: number[] = [];
  private outCount = 0;
  private cx = 0;
  private cy = 0;

  constructor(readonly config: BattleConfig) {
    this.course = new Level(config.arena);
    const lv = this.course;
    const sp = lv.spawns.filter(Boolean);
    this.cx = sp.reduce((a, p) => a + p.x, 0) / sp.length;
    this.cy = sp.reduce((a, p) => a + p.y, 0) / sp.length;
    const seed = config.seed ?? 1;
    config.racers.forEach((spec, i) => {
      const p = sp[i % sp.length];
      const angle = Math.atan2(this.cy - p.y, this.cx - p.x);
      const ship = makeShip(p.x, p.y, angle, 0);
      const r = new Racer({ ...spec, kind: spec.kind }, ship, seed + i);
      r.tail = makeTail(ship);
      this.racers.push(r);
      this.bots.push(spec.kind === 'bot' ? new ArenaBot(spec.tier ?? 'medium', seed * 17 + i) : null);
      this.lastHitBy.push(null);
      this.lastHitAt.push(-99);
    });
    this.lives = config.racers.map(() => config.lives);
    const floorPts: [number, number][] = lv.floor.map(([c, r]) => [(c + 0.5) * TILE, (r + 0.5) * TILE]);
    placeOrbs(lv, floorPts, Math.max(4, Math.round(lv.floor.length / 30)), mulberry32(seed * 7 + 3));
  }

  get humans(): Racer[] { return this.racers.filter((r) => r.human); }

  inPit(x: number, y: number): boolean {
    return this.course.pits.some((p) => inRegion(p, x, y));
  }

  /** Unit direction from (x, y) with clear floor ahead, preferring one that kills the current slide. */
  escape(x: number, y: number, vx: number, vy: number): [number, number] {
    const v = Math.hypot(vx, vy) || 1;
    const dx = this.cx - x, dy = this.cy - y;
    const dc = Math.hypot(dx, dy) || 1;
    let best: [number, number] = [dx / dc, dy / dc], bestScore = -Infinity;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const ux = Math.cos(a), uy = Math.sin(a);
      let clear = 0;
      for (const d of [16, 32, 48, 64, 80]) { if (this.inPit(x + ux * d, y + uy * d)) break; clear++; }
      const score = clear * 2 - (ux * vx + uy * vy) / v * 1.5 + (ux * dx + uy * dy) / dc * 0.5;
      if (score > bestScore) { bestScore = score; best = [ux, uy]; }
    }
    return best;
  }

  /** A point on solid floor toward the arena centre from (x, y). */
  safeTowards(x: number, y: number): [number, number] {
    const dx = this.cx - x, dy = this.cy - y;
    const d = Math.hypot(dx, dy) || 1;
    for (const step of [70, 120, 40, 180]) {
      const px = x + (dx / d) * Math.min(step, d), py = y + (dy / d) * Math.min(step, d);
      if (!this.inPit(px, py)) return [px, py];
    }
    return [this.cx, this.cy];
  }

  step(input: Buttons[]): void {
    const dt = STEP;
    this.time += dt;
    if (this.state === 'countdown') {
      if (this.time >= 0) { this.state = 'racing'; this.time = 0; this.events.push({ type: 'go' }); }
      else return;
    }
    const lv = this.course;
    lv.update(this.time);
    tickOrbs(lv, dt);
    const live = this.racers.filter((r) => !r.out);
    this.racers.forEach((r, i) => {
      if (r.out) return;
      const s = r.ship;
      let b: Buttons;
      const bot = this.bots[i];
      if (this.state === 'finished') b = { left: false, right: false, brake: true };
      else if (bot) b = bot.think(r, this.racers, this, dt);
      else b = input[r.spec.slot ?? 0] ?? { left: false, right: false };
      r.left = b.left; r.right = b.right;
      if (s.fall <= 0) r.shield = Math.max(0, r.shield - dt);
      const wasFalling = s.fall > 0;
      stepShip(s, intentFrom(b, bot ? 'manual' : this.config.scheme), lv, dt);
      if (!wasFalling && s.fall > 0) this.onFall(r, i);
      if (wasFalling && s.fall <= 0) { r.shield = SHIELD; if (r.tail) resetTail(r.tail, s); }
      if (r.tail) {
        stepTail(r.tail, s, lv, dt);
        tailDrag(r.tail, s, dt);
        if (collectOrb(lv, s)) { grow(r.tail, s); this.events.push({ type: 'orb', racer: r }); }
        if (s.hit > 200) shed(r.tail);
      }
    });
    for (let a = 0; a < live.length; a++) {
      const A = live[a];
      for (let b = 0; b < live.length; b++) {
        if (a === b) continue;
        const B = live[b];
        if (A.shield > 0 || B.shield > 0) continue;
        if (A.tail) {
          const power = tailHits(A.tail, B.ship, dt);
          if (power > 40) this.credit(B, A);
          if (power > 90) this.events.push({ type: 'whip', racer: A, target: B, power });
        }
        if (b > a && A.ship.fall <= 0 && B.ship.fall <= 0 && collideShips(A.ship, B.ship)) {
          this.credit(A, B); this.credit(B, A);
        }
      }
    }
    if (this.state === 'racing') this.checkEnd();
  }

  private credit(victim: Racer, by: Racer): void {
    const i = this.racers.indexOf(victim);
    this.lastHitBy[i] = by;
    this.lastHitAt[i] = this.time;
  }

  private onFall(r: Racer, i: number): void {
    const by = this.time - this.lastHitAt[i] < 2.5 ? this.lastHitBy[i] : null;
    this.lives[i]--;
    this.events.push({ type: 'fall', racer: r, by });
    if (this.lives[i] <= 0) {
      r.out = true;
      r.outTime = this.time;
      r.place = this.racers.length - this.outCount++;
      this.events.push({ type: 'out', racer: r, place: r.place });
      return;
    }
    // Respawn at the spawn point furthest from everyone else.
    const s = r.ship;
    let best = this.course.spawns[0], bestD = -1;
    for (const p of this.course.spawns.filter(Boolean)) {
      const d = Math.min(...this.racers.filter((o) => o !== r && !o.out).map((o) => Math.hypot(o.ship.x - p.x, o.ship.y - p.y)), 1e9);
      if (d > bestD) { bestD = d; best = p; }
    }
    s.checkX = best.x; s.checkY = best.y;
    s.checkAngle = Math.atan2(this.cy - best.y, this.cx - best.x);
  }

  private checkEnd(): void {
    const alive = this.racers.filter((r) => !r.out);
    const humansOut = this.humans.length > 0 && this.humans.every((h) => h.out);
    const timeUp = this.time >= this.config.timeLimit;
    if (alive.length > 1 && !humansOut && !timeUp) return;
    // Rank the survivors: most lives, then longest tail.
    alive.sort((a, b) => this.lives[this.racers.indexOf(b)] - this.lives[this.racers.indexOf(a)] || (b.tail?.n ?? 0) - (a.tail?.n ?? 0));
    alive.forEach((r, k) => { r.place = k + 1; });
    const winner = alive[0] ?? null;
    if (winner) { winner.finished = true; winner.finishTime = this.time; }
    this.state = 'finished';
    this.finishedAt = this.time;
    this.events.push({ type: 'win', racer: winner });
  }

  livesOf(r: Racer): number {
    return this.lives[this.racers.indexOf(r)];
  }

  shipOf(i: number): Ship { return this.racers[i].ship; }
}

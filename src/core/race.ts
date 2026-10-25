import { Bot, type Tier } from './ai';
import { GhostRecorder, type Ghost } from './ghost';
import { collideShips, inFlip, intentFrom, makeShip, stepShip, type Scheme, type Ship } from './physics';
import { Track } from './track';
import { collectOrb, grow, makeTail, placeOrbs, shed, stepTail, tailDrag, tailHits, tickOrbs, type Tail } from './snake';
import { mulberry32 } from './math';

export interface RacerSpec {
  name: string;
  color: number;
  kind: 'human' | 'bot';
  /** Hull id (see ships.ts); cosmetic only. */
  hull?: string;
  /** Character id, for portraits and taunts. */
  who?: string;
  /** Human input slot (0 or 1). */
  slot?: number;
  tier?: Tier;
}

export interface RaceConfig {
  track: Track;
  /** 0 = endless (time trial). */
  laps: number;
  racers: RacerSpec[];
  scheme: Scheme;
  rubberBand: boolean;
  collisions: boolean;
  /** Last place is knocked out each time the leader starts a new lap; runs until one ship remains. */
  elimination?: boolean;
  /** Snake tails: every ship drags a physical tail that shoves others; orbs on track grow it. */
  snake?: boolean;
  seed?: number;
}

export type RaceEvent =
  | { type: 'lap'; racer: Racer; lap: number; time: number; best: boolean; ghost: Ghost | null }
  | { type: 'finish'; racer: Racer; place: number }
  | { type: 'out'; racer: Racer; place: number }
  | { type: 'go' }
  | { type: 'orb'; racer: Racer }
  | { type: 'whip'; racer: Racer; target: Racer; power: number };

/** A player's inputs: two steering buttons, plus optional thrust/brake keys for the 'manual' scheme. */
export interface Buttons { left: boolean; right: boolean; thrust?: boolean; brake?: boolean }

export class Racer {
  readonly ship: Ship;
  lap = 0;
  maxLap = 0;
  lapStart = 0;
  lapTimes: number[] = [];
  bestLap = Infinity;
  finished = false;
  finishTime = Infinity;
  /** Knocked out in an elimination race. */
  out = false;
  outTime = Infinity;
  /** Seconds of respawn protection left (Snake Battle): can't be shoved or collided with. */
  shield = 0;
  place = 0;
  readonly bot: Bot | null;
  /** Takes over a human's ship after they finish. */
  autopilot: Bot | null = null;
  readonly recorder: GhostRecorder | null;
  left = false;
  right = false;
  tail: Tail | null = null;
  /** Bot tail flick: seconds left and direction (-1 left, 1 right). */
  flick = 0;
  flickDir = 0;
  flickCd = 0;

  constructor(readonly spec: RacerSpec, ship: Ship, seed: number) {
    this.ship = ship;
    this.bot = spec.kind === 'bot' ? new Bot(spec.tier ?? 'medium', seed) : null;
    this.recorder = spec.kind === 'human' ? new GhostRecorder() : null;
  }

  get human(): boolean { return this.spec.kind === 'human'; }

  progress(n: number): number { return this.lap * n + this.ship.idx; }
}

export const STEP = 1 / 240;
const COUNTDOWN = 3;

export class Race {
  readonly track: Track;
  readonly racers: Racer[] = [];
  readonly events: RaceEvent[] = [];
  /** Race clock; negative during the countdown. */
  time = -COUNTDOWN;
  state: 'countdown' | 'racing' | 'finished' = 'countdown';
  finishedAt = Infinity;
  private finishCount = 0;
  private leaderLap = 1;

  constructor(readonly config: RaceConfig) {
    this.track = config.track;
    const t = this.track;
    const seed = config.seed ?? 1;
    config.racers.forEach((spec, i) => {
      const row = Math.floor(i / 2), col = i % 2;
      const idx = t.wrap(-3 - row * 4);
      const lat = (col === 0 ? -0.4 : 0.4) * t.hw[idx];
      const x = t.cx[idx] + t.nx[idx] * lat;
      const y = t.cy[idx] + t.ny[idx] * lat;
      const angle = Math.atan2(t.ty[idx], t.tx[idx]);
      this.racers.push(new Racer(spec, makeShip(x, y, angle, idx), seed * 101 + i * 7919));
    });
    this.rank();
    if (config.snake) {
      for (const r of this.racers) r.tail = makeTail(r.ship);
      const rand = mulberry32(seed * 31 + 7);
      const pts: [number, number][] = [];
      for (let i = 40; i < t.n - 20; i += 7) {
        const off = (rand() - 0.5) * 1.4 * t.hw[i];
        pts.push([t.cx[i] + t.nx[i] * off, t.cy[i] + t.ny[i] * off]);
      }
      placeOrbs(t, pts, Math.round(t.length / 300), rand);
    }
  }

  get humans(): Racer[] { return this.racers.filter((r) => r.human); }

  get course(): Track { return this.track; }

  /** Advance one fixed step. `input[slot]` is that human's buttons. */
  step(input: Buttons[]): void {
    const dt = STEP;
    const t = this.track;
    const prevTime = this.time;
    this.time += dt;
    if (this.state === 'countdown') {
      if (this.time >= 0) { this.state = 'racing'; this.events.push({ type: 'go' }); }
      else return;
    }
    if (prevTime < 0) this.time = Math.max(this.time, 0);

    this.applyRubberBand();
    t.update(this.time);
    for (const r of this.racers) {
      if (r.out) continue;
      let b: Buttons;
      if (r.autopilot || r.bot) {
        b = (r.autopilot ?? r.bot)!.think(r.ship, t, dt, this.time);
        if (r.tail && r.bot) b = this.botFlick(r, b, dt);
        // Bots know about flip zones and pre-swap their inputs.
        if (inFlip(r.ship, t)) b = { left: b.right, right: b.left };
      } else b = input[r.spec.slot ?? 0] ?? { left: false, right: false };
      r.left = b.left; r.right = b.right;
      const scheme = r.human && !r.autopilot ? this.config.scheme : 'thrust';
      const prev = r.ship.idx;
      stepShip(r.ship, intentFrom(b, scheme), t, dt);
      this.trackLaps(r, prev);
      if (r.recorder && !r.finished) r.recorder.sample(r.ship, this.time - r.lapStart);
      if (r.tail) {
        stepTail(r.tail, r.ship, t, dt);
        tailDrag(r.tail, r.ship, dt);
        if (collectOrb(t, r.ship)) { grow(r.tail, r.ship); this.events.push({ type: 'orb', racer: r }); }
        if (r.ship.hit > 200) shed(r.tail);
      }
    }
    if (this.config.snake) {
      tickOrbs(t, dt);
      for (const a of this.racers) {
        if (!a.tail || a.out) continue;
        for (const b of this.racers) {
          if (a === b || b.out) continue;
          const power = tailHits(a.tail, b.ship, dt);
          if (power > 90) this.events.push({ type: 'whip', racer: a, target: b, power });
        }
      }
    }
    if (this.config.collisions) {
      const live = this.racers.filter((r) => !r.out && r.ship.fall <= 0 && r.ship.air <= 0);
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) collideShips(live[i].ship, live[j].ship);
      }
    }
    this.rank();
    if (this.config.elimination) this.eliminate();
    if (this.state === 'racing' && (this.config.laps > 0 || this.config.elimination)) {
      const waitingOn = this.humans.length ? this.humans : this.racers;
      if (waitingOn.every((r) => r.finished || r.out)) { this.state = 'finished'; this.finishedAt = this.time; }
    }
  }

  private trackLaps(r: Racer, prev: number): void {
    const n = this.track.n;
    const idx = r.ship.idx;
    if (prev > n * 0.75 && idx < n * 0.25) {
      r.lap++;
      if (r.lap > r.maxLap) {
        r.maxLap = r.lap;
        if (r.lap >= 2) {
          const lapTime = this.time - r.lapStart;
          r.lapTimes.push(lapTime);
          const best = lapTime < r.bestLap;
          if (best) r.bestLap = lapTime;
          const ghost = r.recorder && best ? r.recorder.finish(this.track.key, lapTime, r.spec.name) : null;
          this.events.push({ type: 'lap', racer: r, lap: r.lap - 1, time: lapTime, best, ghost });
        }
        r.lapStart = this.time;
        r.recorder?.reset();
        if (this.config.laps > 0 && r.lap > this.config.laps && !r.finished) {
          r.finished = true;
          r.finishTime = this.time;
          r.place = ++this.finishCount;
          if (r.human) r.autopilot = new Bot('medium', 99);
          this.events.push({ type: 'finish', racer: r, place: r.place });
        }
      }
    } else if (prev < n * 0.25 && idx > n * 0.75) {
      r.lap--;
    }
  }

  /** A bot with a tail snaps its nose toward a rival alongside, swinging the tail into them. */
  private botFlick(r: Racer, b: Buttons, dt: number): Buttons {
    r.flickCd -= dt;
    if (r.flick > 0) {
      r.flick -= dt;
      return { left: r.flickDir < 0, right: r.flickDir > 0 };
    }
    if (r.flickCd > 0) return b;
    const s = r.ship;
    const hx = Math.cos(s.angle), hy = Math.sin(s.angle);
    for (const o of this.racers) {
      if (o === r || o.out || o.ship.fall > 0) continue;
      const dx = o.ship.x - s.x, dy = o.ship.y - s.y;
      const d = Math.hypot(dx, dy);
      if (d > 48 || d < 8) continue;
      const along = (dx * hx + dy * hy) / d;
      if (along > 0.2) continue; // only rivals beside or behind
      const side = Math.sign(hx * dy - hy * dx) || 1;
      // Turning away from the rival swings the tail toward them.
      r.flickDir = -side;
      r.flick = 0.16 + (r.bot!.skill.lineBlend * 0.08);
      r.flickCd = 1.4 - r.bot!.skill.lineBlend * 0.6;
      return { left: r.flickDir < 0, right: r.flickDir > 0 };
    }
    return b;
  }

  private eliminate(): void {
    const live = this.racers.filter((r) => !r.out && !r.finished);
    const lead = Math.max(...live.map((r) => r.maxLap));
    if (lead <= this.leaderLap) return;
    this.leaderLap = lead;
    if (live.length > 1) {
      const last = live.reduce((a, b) => (a.place > b.place ? a : b));
      last.out = true;
      last.outTime = this.time;
      last.place = live.length;
      this.events.push({ type: 'out', racer: last, place: last.place });
    }
    const left = live.filter((r) => !r.out);
    if (left.length === 1) {
      const w = left[0];
      w.finished = true;
      w.finishTime = this.time;
      w.place = 1;
      if (w.human) w.autopilot = new Bot('medium', 99);
      this.events.push({ type: 'finish', racer: w, place: 1 });
    }
  }

  private applyRubberBand(): void {
    const humans = this.humans;
    if (!this.config.rubberBand || humans.length === 0) {
      for (const r of this.racers) r.ship.thrustMul = r.bot ? r.bot.skill.power : 1;
      return;
    }
    const n = this.track.n;
    const lead = Math.max(...humans.map((h) => h.progress(n)));
    for (const r of this.racers) {
      if (!r.bot) continue;
      const diff = ((r.progress(n) - lead) * this.track.length) / n;
      const target = diff > 0 ? 1 - Math.min(0.18, (diff / 2500) * 0.18) : 1 + Math.min(0.12, (-diff / 2500) * 0.12);
      r.ship.thrustMul += (target * r.bot.skill.power - r.ship.thrustMul) * 0.01;
    }
  }

  private rank(): void {
    const n = this.track.n;
    const group = (r: Racer) => (r.finished ? 0 : r.out ? 2 : 1);
    const order = [...this.racers].sort((a, b) => {
      const ga = group(a), gb = group(b);
      if (ga !== gb) return ga - gb;
      if (ga === 0) return a.finishTime - b.finishTime;
      if (ga === 2) return b.outTime - a.outTime;
      return b.progress(n) - a.progress(n);
    });
    order.forEach((r, i) => { r.place = i + 1; });
  }

  /** Put a ship back on the centreline facing forward (manual reset). */
  respawn(r: Racer): void {
    const t = this.track;
    const i = r.ship.idx;
    const s = r.ship;
    s.x = t.cx[i]; s.y = t.cy[i];
    s.vx = 0; s.vy = 0; s.angVel = 0;
    s.angle = Math.atan2(t.ty[i], t.tx[i]);
  }
}

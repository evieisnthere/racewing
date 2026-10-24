import { Bot, type Tier } from './ai';
import { GhostRecorder, type Ghost } from './ghost';
import { collideShips, intentFrom, makeShip, stepShip, type Scheme, type Ship } from './physics';
import { Track } from './track';

export interface RacerSpec {
  name: string;
  color: number;
  kind: 'human' | 'bot';
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
  seed?: number;
}

export type RaceEvent =
  | { type: 'lap'; racer: Racer; lap: number; time: number; best: boolean; ghost: Ghost | null }
  | { type: 'finish'; racer: Racer; place: number }
  | { type: 'go' };

export interface Buttons { left: boolean; right: boolean }

export class Racer {
  readonly ship: Ship;
  lap = 0;
  maxLap = 0;
  lapStart = 0;
  lapTimes: number[] = [];
  bestLap = Infinity;
  finished = false;
  finishTime = Infinity;
  place = 0;
  readonly bot: Bot | null;
  /** Takes over a human's ship after they finish. */
  autopilot: Bot | null = null;
  readonly recorder: GhostRecorder | null;
  left = false;
  right = false;

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
  }

  get humans(): Racer[] { return this.racers.filter((r) => r.human); }

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
    for (const r of this.racers) {
      let b: Buttons;
      if (r.autopilot) b = r.autopilot.think(r.ship, t, dt, this.time);
      else if (r.bot) b = r.bot.think(r.ship, t, dt, this.time);
      else b = input[r.spec.slot ?? 0] ?? { left: false, right: false };
      r.left = b.left; r.right = b.right;
      const scheme = r.human && !r.autopilot ? this.config.scheme : 'thrust';
      const prev = r.ship.idx;
      stepShip(r.ship, intentFrom(b.left, b.right, scheme), t, dt);
      this.trackLaps(r, prev);
      if (r.recorder && !r.finished) r.recorder.sample(r.ship, this.time - r.lapStart);
    }
    if (this.config.collisions) {
      for (let i = 0; i < this.racers.length; i++) {
        for (let j = i + 1; j < this.racers.length; j++) collideShips(this.racers[i].ship, this.racers[j].ship);
      }
    }
    this.rank();
    if (this.state === 'racing' && this.config.laps > 0) {
      const waitingOn = this.humans.length ? this.humans : this.racers;
      if (waitingOn.every((r) => r.finished)) { this.state = 'finished'; this.finishedAt = this.time; }
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
          const ghost = r.recorder && best ? r.recorder.finish(this.track.def.id, lapTime, r.spec.name) : null;
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

  private applyRubberBand(): void {
    const humans = this.humans;
    if (!this.config.rubberBand || humans.length === 0) {
      for (const r of this.racers) r.ship.thrustMul = 1;
      return;
    }
    const n = this.track.n;
    const lead = Math.max(...humans.map((h) => h.progress(n)));
    for (const r of this.racers) {
      if (!r.bot) continue;
      const diff = ((r.progress(n) - lead) * this.track.length) / n;
      const target = diff > 0 ? 1 - Math.min(0.18, (diff / 2500) * 0.18) : 1 + Math.min(0.12, (-diff / 2500) * 0.12);
      r.ship.thrustMul += (target - r.ship.thrustMul) * 0.01;
    }
  }

  private rank(): void {
    const n = this.track.n;
    const order = [...this.racers].sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished) return a.finishTime - b.finishTime;
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

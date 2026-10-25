import { mulberry32, wrapAngle } from './math';
import { PHYS, type Ship } from './physics';
import { SPACING, type Track } from './track';

export type Tier = 'easy' | 'medium' | 'hard' | 'insane';

export interface Skill {
  /** Seconds between steering decisions. */
  react: number;
  /** Heading error (rad) tolerated before steering. */
  deadzone: number;
  /** Lookahead seconds at speed. */
  lookahead: number;
  /** Cornering acceleration the bot believes it can hold. */
  latAccel: number;
  /** 0 = drive the centreline, 1 = full racing line. */
  lineBlend: number;
  /** Distance kept from the walls, on top of the racing line's own margin. */
  margin: number;
  /** Lateral wander, in half-widths. */
  noise: number;
  /** Chance per decision of a small mistake (a missed input). */
  mistake: number;
  /** How hard the bot steers for boost pads (0..1). */
  padSeek: number;
  /** Engine power multiplier. */
  power: number;
}

export const SKILLS: Record<Tier, Skill> = {
  easy: { react: 0.11, deadzone: 0.14, lookahead: 0.42, latAccel: 600, lineBlend: 0.35, margin: 20, noise: 0.35, mistake: 0.05, padSeek: 0, power: 0.86 },
  medium: { react: 0.07, deadzone: 0.09, lookahead: 0.36, latAccel: 840, lineBlend: 0.65, margin: 13, noise: 0.2, mistake: 0.02, padSeek: 0.5, power: 0.93 },
  hard: { react: 0.04, deadzone: 0.06, lookahead: 0.32, latAccel: 1080, lineBlend: 0.9, margin: 6, noise: 0.1, mistake: 0.006, padSeek: 1, power: 0.98 },
  insane: { react: 0.02, deadzone: 0.035, lookahead: 0.3, latAccel: 1320, lineBlend: 1, margin: 1, noise: 0.04, mistake: 0, padSeek: 1, power: 1.02 },
};

export const TIER_NAMES: Record<Tier, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', insane: 'Insane' };

/**
 * Bots press the same two buttons a player does (always-thrust mapping): one button turns, both brake.
 */
export class Bot {
  readonly skill: Skill;
  private rand: () => number;
  private timer = 0;
  private left = false;
  private right = false;
  private phase: number;
  private stuck = 0;
  private reversing = 0;

  constructor(readonly tier: Tier, seed: number) {
    this.skill = SKILLS[tier];
    this.rand = mulberry32(seed);
    this.phase = this.rand() * 100;
  }

  think(s: Ship, track: Track, dt: number, time: number): { left: boolean; right: boolean } {
    this.timer -= dt;
    if (this.timer > 0) return { left: this.left, right: this.right };
    const k = this.skill;
    this.timer = k.react * (0.7 + this.rand() * 0.6);

    const speed = Math.hypot(s.vx, s.vy);
    const hx = Math.cos(s.angle), hy = Math.sin(s.angle);
    const fwd = s.vx * hx + s.vy * hy;

    if (this.reversing > 0) {
      this.reversing -= k.react;
      return this.set(true, true);
    }
    if (speed < 30) this.stuck += k.react; else this.stuck = 0;

    const look = 25 + Math.max(0, fwd) * k.lookahead;
    const ti = track.wrap(s.idx + Math.round(look / SPACING));
    const wander = Math.sin(time * 0.6 + this.phase) * k.noise;
    const lim = Math.max(0, track.hw[ti] - PHYS.radius - k.margin);
    let off = track.lineOff[ti] * k.lineBlend + wander * track.hw[ti];
    for (const p of track.pads) {
      const ahead = track.wrap(p.i0 - s.idx) * SPACING;
      if (k.padSeek > 0 && ahead > 0 && ahead < look + 250) off += (p.lat - off) * k.padSeek;
    }
    off = Math.max(-lim, Math.min(lim, off));
    const tx = track.cx[ti] + track.nx[ti] * off;
    const ty = track.cy[ti] + track.ny[ti] * off;

    const desired = Math.atan2(ty - s.y, tx - s.x);
    let aim = desired;
    if (speed > 150) {
      // Counter-steer the drift: point the nose past the target by the slip angle.
      const va = Math.atan2(s.vy, s.vx);
      aim = desired + wrapAngle(desired - va) * 0.7;
    }
    const err = wrapAngle(aim - s.angle);

    if (this.stuck > 1.2 && Math.abs(err) > 1.2) {
      this.stuck = 0;
      this.reversing = 0.5;
      return this.set(true, true);
    }

    // Never brake on the run-up to a jump: speed is what clears the pit.
    const jumpAhead = track.pitSpans.some(([a, b]) => {
      const d = track.wrap(a - s.idx);
      return d < 45 || track.inRange(s.idx, a, b);
    });
    // Brake if any upcoming corner within stopping distance needs less speed.
    if (fwd > 100 && Math.abs(err) < 1.2 && !jumpAhead) {
      const reach = (fwd * fwd) / (2 * PHYS.brake) + fwd * 0.15 + 30;
      const steps = Math.min(track.n >> 1, Math.ceil(reach / SPACING));
      for (let j = 2; j <= steps; j += 2) {
        const i = track.wrap(s.idx + j);
        const c = Math.abs(track.lineCurv[i] * k.lineBlend + track.curv[i] * (1 - k.lineBlend));
        const vmax = Math.sqrt(k.latAccel / Math.max(c, 1e-5));
        const dist = j * SPACING;
        const allowed = Math.sqrt(vmax * vmax + 2 * PHYS.brake * 0.8 * Math.max(0, dist - fwd * k.react));
        if (fwd > allowed) return this.set(true, true);
      }
    }

    let left = err < -k.deadzone;
    let right = err > k.deadzone;
    if (k.mistake > 0 && this.rand() < k.mistake) { left = false; right = false; }
    return this.set(left, right);
  }

  private set(left: boolean, right: boolean) {
    this.left = left; this.right = right;
    return { left, right };
  }
}

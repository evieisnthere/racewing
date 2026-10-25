import type { Buttons } from './core/race';

const P1 = { left: ['KeyA'], right: ['KeyD'], thrust: ['KeyW'], brake: ['KeyS'] };
const P2 = { left: ['ArrowLeft'], right: ['ArrowRight'], thrust: ['ArrowUp'], brake: ['ArrowDown'] };

/** Keyboard, touch and gamepad, folded into per-player left/right buttons. */
export class Input {
  private keys = new Set<string>();
  private touches = new Map<number, 'L' | 'R'>();
  private onPause: () => void = () => {};
  private onReset: (slot: number) => void = () => {};
  private padPause = false;
  private padReset = [false, false];
  touchSeen = false;

  constructor(target: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPause();
      if (e.code === 'KeyR') this.onReset(0);
      if (e.code === 'Backspace' || e.code === 'Enter') this.onReset(1);
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.touches.clear(); });

    const update = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      this.touchSeen = true;
      this.touches.set(e.pointerId, e.clientX < innerWidth / 2 ? 'L' : 'R');
      e.preventDefault();
    };
    target.addEventListener('pointerdown', update);
    target.addEventListener('pointermove', (e) => { if (this.touches.has(e.pointerId)) update(e); });
    const end = (e: PointerEvent) => this.touches.delete(e.pointerId);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  handlers(onPause: () => void, onReset: (slot: number) => void): void {
    this.onPause = onPause;
    this.onReset = onReset;
  }

  clear(): void {
    this.touches.clear();
  }

  private any(codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  private pad(i: number): Buttons {
    const pads = navigator.getGamepads?.() ?? [];
    const p = pads[i];
    if (!p) return { left: false, right: false };
    const b = (k: number) => !!p.buttons[k]?.pressed;
    const x = p.axes[0] ?? 0;
    // Steer: bumpers, d-pad, left stick. Thrust: A or right trigger. Brake: B or left trigger.
    const left = b(4) || b(14) || x < -0.5;
    const right = b(5) || b(15) || x > 0.5;
    const thrust = b(0) || b(7);
    const brake = b(1) || b(6);
    const start = b(9);
    if (start && !this.padPause) this.onPause();
    this.padPause = start;
    const reset = b(3);
    if (reset && !this.padReset[i]) this.onReset(i);
    this.padReset[i] = reset;
    return { left, right, thrust, brake };
  }

  /** Which screen halves are currently touched (for on-screen feedback). */
  touchSides(): { left: boolean; right: boolean } {
    let left = false, right = false;
    for (const side of this.touches.values()) { if (side === 'L') left = true; else right = true; }
    return { left, right };
  }

  private keysFor(m: typeof P1): Buttons {
    return { left: this.any(m.left), right: this.any(m.right), thrust: this.any(m.thrust), brake: this.any(m.brake) };
  }

  /** Buttons for each human slot. In single-player, every device drives player 1. */
  read(players: number): Buttons[] {
    const g0 = this.pad(0), g1 = this.pad(1);
    if (players <= 1) {
      let tl = false, tr = false;
      for (const side of this.touches.values()) { if (side === 'L') tl = true; else tr = true; }
      const all = [this.keysFor(P1), this.keysFor(P2), g0, g1];
      return [{
        left: tl || all.some((b) => b.left),
        right: tr || all.some((b) => b.right),
        thrust: all.some((b) => b.thrust),
        brake: all.some((b) => b.brake),
      }];
    }
    const or = (a: Buttons, b: Buttons): Buttons => ({ left: a.left || b.left, right: a.right || b.right, thrust: a.thrust || b.thrust, brake: a.brake || b.brake });
    return [or(this.keysFor(P1), g0), or(this.keysFor(P2), g1)];
  }
}

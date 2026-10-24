import type { Buttons } from './core/race';

const P1_LEFT = ['KeyA'], P1_RIGHT = ['KeyD'];
const P2_LEFT = ['ArrowLeft'], P2_RIGHT = ['ArrowRight'];

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
    // Bumpers, triggers, d-pad, left stick; X/B as face-button alternatives.
    const left = b(4) || b(6) || b(14) || b(2) || x < -0.5;
    const right = b(5) || b(7) || b(15) || b(1) || x > 0.5;
    const start = b(9);
    if (start && !this.padPause) this.onPause();
    this.padPause = start;
    const reset = b(3);
    if (reset && !this.padReset[i]) this.onReset(i);
    this.padReset[i] = reset;
    return { left, right };
  }

  /** Buttons for each human slot. In single-player, every device drives player 1. */
  read(players: number): Buttons[] {
    const g0 = this.pad(0), g1 = this.pad(1);
    if (players <= 1) {
      let tl = false, tr = false;
      for (const side of this.touches.values()) { if (side === 'L') tl = true; else tr = true; }
      return [{
        left: this.any(P1_LEFT) || this.any(P2_LEFT) || tl || g0.left || g1.left,
        right: this.any(P1_RIGHT) || this.any(P2_RIGHT) || tr || g0.right || g1.right,
      }];
    }
    return [
      { left: this.any(P1_LEFT) || g0.left, right: this.any(P1_RIGHT) || g0.right },
      { left: this.any(P2_LEFT) || g1.left, right: this.any(P2_RIGHT) || g1.right },
    ];
  }
}

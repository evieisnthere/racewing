import { keyColor } from '../core/level';
import { formatTime } from '../core/math';
import type { PuzzleRun } from '../core/puzzle';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** HUD for puzzle levels: clock, medal targets, keys held, countdown and flashes. */
export class PuzzleHud {
  readonly el = document.createElement('div');
  private time: HTMLElement;
  private keys: HTMLElement;
  private flashEl: HTMLElement;
  private count: HTMLElement;
  private speed: HTMLElement;
  private flashTimer = 0;
  private heat = 0;
  private heatEl!: HTMLElement;
  private lastKeys = '';

  constructor(parent: HTMLElement, private run: PuzzleRun, targets: [number, number, number], color: number) {
    this.el.className = 'hud';
    this.el.style.setProperty('--racer', hex(color));
    this.el.innerHTML = `
      <div class="hud-tl">
        <div class="hud-lap">${run.course.def.name.toUpperCase()}</div>
        <div class="hud-keys"></div>
      </div>
      <div class="hud-tc">
        <div class="hud-time"></div>
        <div class="hud-info"><span class="medal b"></span>${formatTime(targets[0])}<span class="medal s"></span>${formatTime(targets[1])}<span class="medal g"></span>${formatTime(targets[2])}</div>
      </div>
      <div class="hud-speed"><div></div></div>
      <div class="hud-heat"></div>
      <div class="hud-flash"></div>
      <div class="hud-count"></div>`;
    const q = (s: string) => this.el.querySelector(s) as HTMLElement;
    this.time = q('.hud-time'); this.keys = q('.hud-keys'); this.flashEl = q('.hud-flash'); this.count = q('.hud-count'); this.speed = q('.hud-speed > div');
    this.heatEl = this.el.querySelector('.hud-heat') as HTMLElement;
    parent.appendChild(this.el);
  }

  layout(w: number, h: number): void {
    Object.assign(this.el.style, { left: '0px', top: '0px', width: w + 'px', height: h + 'px' });
    this.el.classList.toggle('compact', Math.min(w, h) < 520);
  }

  flash(text: string, cls = ''): void {
    this.flashEl.textContent = text;
    this.flashEl.className = 'hud-flash show ' + cls;
    this.flashTimer = 1.4;
  }

  update(dt: number): void {
    const run = this.run;
    const t = run.state === 'finished' ? run.finishedAt : Math.max(0, run.time);
    this.time.textContent = formatTime(t);
    const lv = run.course;
    const ids = [...new Set(lv.keys.map((k) => k.id))];
    const keyState = ids.map((id) => id + (lv.held.has(id) ? '1' : '0')).join('');
    if (keyState !== this.lastKeys) {
      this.lastKeys = keyState;
      this.keys.innerHTML = ids.map((id) => `<i class="key ${lv.held.has(id) ? 'got' : ''}" style="--k:${hex(keyColor(id))}"></i>`).join('');
    }
    const s = run.me.ship;
    this.speed.style.width = Math.min(100, (Math.hypot(s.vx, s.vy) / 450) * 100).toFixed(1) + '%';
    this.heat += ((s.scrape > 0 ? 1 : 0) - this.heat) * Math.min(1, dt * (s.scrape > 0 ? 8 : 3));
    this.heatEl.style.opacity = this.heat.toFixed(2);
    if (run.time < 0) {
      this.count.textContent = String(Math.ceil(-run.time));
      this.count.className = 'hud-count show';
    } else if (run.time < 0.8 && run.state === 'racing') {
      this.count.textContent = 'GO';
      this.count.className = 'hud-count show go';
    } else this.count.className = 'hud-count';
    this.flashTimer -= dt;
    if (this.flashTimer <= 0) this.flashEl.classList.remove('show');
  }

  destroy(): void {
    this.el.remove();
  }
}

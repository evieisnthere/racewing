import type { BattleRun } from '../core/battle';
import { formatTime } from '../core/math';
import type { Racer } from '../core/race';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** HUD for Snake Battle: time left, every ship's lives, your tail length, countdown and flashes. */
export class BattleHud {
  readonly el = document.createElement('div');
  private time: HTMLElement;
  private board: HTMLElement;
  private tail: HTMLElement;
  private flashEl: HTMLElement;
  private count: HTMLElement;
  private flashTimer = 0;
  private lastBoard = '';

  constructor(parent: HTMLElement, private run: BattleRun, private me: Racer) {
    this.el.className = 'hud';
    this.el.style.setProperty('--racer', hex(me.spec.color));
    this.el.innerHTML = `
      <div class="hud-tl">
        <div class="hud-lap">${esc(run.config.arena.name.toUpperCase())}</div>
        <div class="hud-board"></div>
      </div>
      <div class="hud-tc">
        <div class="hud-time"></div>
        <div class="hud-info hud-tail"></div>
      </div>
      <div class="hud-flash"></div>
      <div class="hud-count"></div>`;
    const q = (s: string) => this.el.querySelector(s) as HTMLElement;
    this.time = q('.hud-time'); this.board = q('.hud-board'); this.tail = q('.hud-tail');
    this.flashEl = q('.hud-flash'); this.count = q('.hud-count');
    parent.appendChild(this.el);
  }

  layout(x: number, y: number, w: number, h: number): void {
    Object.assign(this.el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
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
    this.time.textContent = formatTime(Math.max(0, run.config.timeLimit - t));
    const board = run.racers.map((r) => `${r.out ? 'x' : run.livesOf(r)}`).join(',');
    if (board !== this.lastBoard) {
      this.lastBoard = board;
      this.board.innerHTML = run.racers.map((r) => {
        const lives = run.livesOf(r);
        return `<div class="b-row ${r.out ? 'out' : ''} ${r === this.me ? 'me' : ''}"><i style="background:${hex(r.spec.color)}"></i>${esc(r.spec.name)}<span>${r.out ? 'OUT' : '♦'.repeat(Math.max(0, lives))}</span></div>`;
      }).join('');
    }
    this.tail.textContent = `tail ${this.me.tail?.n ?? 0}`;
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

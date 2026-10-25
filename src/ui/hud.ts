import { formatTime } from '../core/math';
import type { Race, Racer } from '../core/race';

const ordinal = (n: number) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

export class Hud {
  readonly el = document.createElement('div');
  private pos: HTMLElement;
  private lap: HTMLElement;
  private time: HTMLElement;
  private best: HTMLElement;
  private delta: HTMLElement;
  private speed: HTMLElement;
  private flashEl: HTMLElement;
  private count: HTMLElement;
  private infoEl: HTMLElement;
  private radioEl: HTMLElement;
  private radioTimer = 0;
  private flashTimer = 0;
  private cache = new Map<HTMLElement, string>();

  constructor(parent: HTMLElement, private race: Race, private racer: Racer, private timeTrial: boolean) {
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="hud-tl">
        <div class="hud-pos"></div>
        <div class="hud-lap"></div>
      </div>
      <div class="hud-tc">
        <div class="hud-time"></div>
        <div class="hud-delta"></div>
        <div class="hud-best"></div>
        <div class="hud-info"></div>
      </div>
      <div class="hud-speed"><div></div></div>
      <div class="hud-flash"></div>
      <div class="hud-radio"></div>
      <div class="hud-count"></div>`;
    const q = (s: string) => this.el.querySelector(s) as HTMLElement;
    this.pos = q('.hud-pos'); this.lap = q('.hud-lap'); this.time = q('.hud-time'); this.best = q('.hud-best');
    this.delta = q('.hud-delta'); this.speed = q('.hud-speed > div'); this.flashEl = q('.hud-flash'); this.count = q('.hud-count');
    this.infoEl = q('.hud-info');
    this.radioEl = q('.hud-radio');
    this.el.style.setProperty('--racer', '#' + racer.spec.color.toString(16).padStart(6, '0'));
    parent.appendChild(this.el);
  }

  layout(x: number, y: number, w: number, h: number): void {
    Object.assign(this.el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    this.el.classList.toggle('compact', Math.min(w, h) < 520);
  }

  info(html: string): void {
    this.infoEl.innerHTML = html;
  }

  /** Show a radio message (portrait SVG, speaker, line) for a few seconds. */
  radio(face: string, name: string, html: string, color: number): void {
    this.radioEl.innerHTML = `${face}<div><b>${name}</b><p>${html}</p></div>`;
    this.radioEl.style.setProperty('--c', '#' + color.toString(16).padStart(6, '0'));
    this.radioEl.classList.add('show');
    this.radioTimer = 3.2;
  }

  flash(text: string, cls = ''): void {
    this.flashEl.textContent = text;
    this.flashEl.className = 'hud-flash show ' + cls;
    this.flashTimer = 1.6;
  }

  private text(el: HTMLElement, s: string): void {
    if (this.cache.get(el) === s) return;
    this.cache.set(el, s);
    el.textContent = s;
  }

  update(dt: number, ghostDelta: number | null): void {
    const r = this.racer, race = this.race;
    const laps = race.config.laps;
    if (this.timeTrial) {
      this.text(this.pos, r.lap < 1 ? 'TIME TRIAL' : `LAP ${r.lap}`);
      this.text(this.lap, r.lapTimes.length ? `last ${formatTime(r.lapTimes[r.lapTimes.length - 1])}` : '');
    } else if (race.config.elimination) {
      const alive = race.racers.filter((x) => !x.out).length;
      this.text(this.pos, `${ordinal(r.place)}`);
      this.pos.dataset.of = `/${race.racers.length}`;
      this.text(this.lap, r.out ? 'KNOCKED OUT' : r.finished ? 'WINNER' : `LAP ${Math.max(1, r.lap)} · ${alive} LEFT`);
    } else {
      this.text(this.pos, `${ordinal(r.place)}`);
      this.pos.dataset.of = `/${race.racers.length}`;
      this.text(this.lap, r.finished ? 'FINISHED' : `LAP ${Math.max(1, Math.min(r.lap, laps))}/${laps}`);
    }
    const lapTime = r.lap >= 1 && !r.finished ? Math.max(0, race.time - r.lapStart) : 0;
    const end = r.finished ? r.finishTime : r.out ? r.outTime : NaN;
    this.text(this.time, !isNaN(end) ? formatTime(end) : this.timeTrial ? formatTime(lapTime) : formatTime(Math.max(0, race.time)));
    this.text(this.best, isFinite(r.bestLap) ? `best ${formatTime(r.bestLap)}` : '');
    if (ghostDelta === null) this.text(this.delta, '');
    else {
      this.text(this.delta, (ghostDelta >= 0 ? '+' : '−') + Math.abs(ghostDelta).toFixed(2));
      this.delta.className = 'hud-delta ' + (ghostDelta > 0 ? 'slow' : 'fast');
    }
    const sp = Math.hypot(r.ship.vx, r.ship.vy);
    this.speed.style.width = Math.min(100, (sp / 450) * 100).toFixed(1) + '%';
    this.speed.classList.toggle('boost', r.ship.scrape > 0 || r.ship.boost > 0);

    if (race.time < 0) {
      this.text(this.count, String(Math.ceil(-race.time)));
      this.count.className = 'hud-count show';
    } else if (race.time < 0.8) {
      this.text(this.count, 'GO');
      this.count.className = 'hud-count show go';
    } else this.count.className = 'hud-count';

    this.radioTimer -= dt;
    if (this.radioTimer <= 0) this.radioEl.classList.remove('show');
    this.flashTimer -= dt;
    if (this.flashTimer <= 0) this.flashEl.classList.remove('show');
  }

  destroy(): void {
    this.el.remove();
  }
}

import { Application } from 'pixi.js';
import './style.css';
import { Bot, TIER_NAMES, type Tier } from './core/ai';
import { decodeGhost, encodeGhost, ghostPose, GHOST_HZ, type Ghost } from './core/ghost';
import { formatTime } from './core/math';
import { Race, STEP, type RacerSpec } from './core/race';
import { getTrack, TRACK_DEFS } from './core/tracks';
import { Input } from './input';
import { View } from './render/view';
import { bestLap, clearAll, ghostCode, loadSettings, saveBestLap, saveGhostCode, saveSettings } from './storage';
import { Hud } from './ui/hud';

type Mode = 'race' | 'tt' | 'split' | 'attract';

const COLORS = [0x2ef2ff, 0xff3df2, 0xffe14d, 0x3dff9a, 0xff7a3d, 0xb06bff];
const BOT_NAMES = ['Vex', 'Nova', 'Kite', 'Rook', 'Halo', 'Juno'];
const MIXED: Tier[] = ['insane', 'hard', 'hard', 'medium', 'medium', 'easy'];
const MODE_TITLES: Record<Mode, string> = { race: 'Race', tt: 'Time Trial', split: 'Split-screen', attract: '' };

interface Session {
  mode: Mode;
  race: Race;
  views: View[];
  huds: Hud[];
  ghost: Ghost | null;
  ghostTimes: Float32Array | null;
  paused: boolean;
  acc: number;
  resultsShown: boolean;
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const coarse = matchMedia('(pointer: coarse)').matches;
/** `?autopilot` lets an insane bot drive the human ships (demo/testing). */
const AUTOPILOT = new URLSearchParams(location.search).has('autopilot');

class Game {
  private app = new Application();
  private input!: Input;
  private settings = loadSettings();
  private session: Session | null = null;
  private menu = document.getElementById('menu') as HTMLDivElement;
  private hudLayer = document.getElementById('hud') as HTMLDivElement;
  private touchHint = document.getElementById('touch') as HTMLDivElement;
  private pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement;
  private setupMode: Mode = 'race';
  private imported = new Map<string, Ghost>();

  async init(): Promise<void> {
    await this.app.init({
      resizeTo: window, background: 0x05060b, antialias: true, autoDensity: true,
      resolution: Math.min(devicePixelRatio || 1, 2), powerPreference: 'high-performance',
    });
    const host = document.getElementById('game') as HTMLDivElement;
    host.appendChild(this.app.canvas);
    this.input = new Input(host);
    this.input.handlers(() => this.togglePause(), (slot) => this.respawn(slot));
    this.menu.addEventListener('click', (e) => this.onClick(e));
    this.menu.addEventListener('change', (e) => this.onChange(e));
    this.pauseBtn.addEventListener('click', () => this.togglePause());
    addEventListener('resize', () => requestAnimationFrame(() => this.layout()));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.session && this.session.mode !== 'attract' && !this.session.paused) this.togglePause();
    });
    this.app.ticker.add((tk) => this.frame(Math.min(tk.deltaMS / 1000, 0.1)));
    this.startAttract();
    this.show('main');
  }

  // ---------- sessions ----------

  private startAttract(): void {
    void this.start('attract');
  }

  private async start(mode: Mode): Promise<void> {
    const s = this.settings;
    const track = getTrack(s.track);
    const humans = mode === 'split' ? 2 : mode === 'attract' ? 0 : 1;
    const botCount = mode === 'tt' ? 0 : mode === 'attract' ? 6 : Math.min(s.bots, 6 - humans);
    const racers: RacerSpec[] = [];
    for (let i = 0; i < botCount; i++) {
      const tier = mode === 'attract' ? MIXED[i] : s.tier === 'mixed' ? MIXED[i] : s.tier;
      racers.push({ name: BOT_NAMES[i], color: COLORS[(i + humans) % COLORS.length], kind: 'bot', tier });
    }
    for (let i = 0; i < humans; i++) {
      racers.push({ name: i === 0 ? s.name : s.name2, color: COLORS[i], kind: 'human', slot: i });
    }
    const race = new Race({
      track,
      laps: mode === 'tt' || mode === 'attract' ? 0 : s.laps,
      racers,
      scheme: s.scheme,
      rubberBand: mode !== 'attract' && s.rubberBand,
      collisions: mode !== 'tt' && s.collisions,
      seed: Math.floor(Math.random() * 1e6),
    });

    if (AUTOPILOT) race.humans.forEach((h, i) => { h.autopilot = new Bot('insane', 5 + i); });
    let ghost: Ghost | null = null;
    if (mode !== 'attract' && s.ghosts) {
      ghost = this.imported.get(track.def.id) ?? null;
      const code = ghostCode(track.def.id);
      if (!ghost && code) { try { ghost = await decodeGhost(code); } catch { ghost = null; } }
    }

    this.end();
    const session: Session = {
      mode, race, views: [], huds: [], ghost, ghostTimes: ghost ? this.ghostTimes(ghost) : null,
      paused: false, acc: 0, resultsShown: false,
    };
    const follow = mode === 'attract' ? [race.racers[0]] : race.humans;
    for (const r of follow) {
      const view = new View(race, r, () => this.ghostPoseFor(session, r));
      this.app.stage.addChild(view.root);
      session.views.push(view);
      if (mode !== 'attract') session.huds.push(new Hud(this.hudLayer, race, r, mode === 'tt'));
    }
    this.session = session;
    this.input.clear();
    this.layout();
    const racing = mode !== 'attract';
    this.pauseBtn.classList.toggle('show', racing && coarse);
    this.touchHint.classList.toggle('show', racing && coarse && mode !== 'split');
    this.touchHint.querySelector('p')!.textContent = s.scheme === 'thrust' ? 'hold both to brake / reverse' : 'hold both to thrust';
    if (racing) this.hide();
  }

  private end(): void {
    const s = this.session;
    if (!s) return;
    for (const v of s.views) v.destroy();
    for (const h of s.huds) h.destroy();
    this.session = null;
  }

  private ghostTimes(g: Ghost): Float32Array {
    const t = getTrack(g.trackId);
    const out = new Float32Array(t.n).fill(NaN);
    let idx = -1;
    for (let k = 0; k < g.xs.length; k++) {
      idx = t.nearest(g.xs[k], g.ys[k], idx);
      if (k > g.xs.length / 2 && idx < t.n / 4) break;
      if (isNaN(out[idx])) out[idx] = k / GHOST_HZ;
    }
    let last = NaN;
    for (let i = 0; i < t.n; i++) { if (isNaN(out[i])) out[i] = last; else last = out[i]; }
    return out;
  }

  private ghostPoseFor(s: Session, r: { lap: number; lapStart: number; finished: boolean }) {
    if (!s.ghost || s.ghost.trackId !== s.race.track.def.id || r.lap < 1 || r.finished) return null;
    return ghostPose(s.ghost, s.race.time - r.lapStart);
  }

  private layout(): void {
    const s = this.session;
    if (!s) return;
    const w = this.app.screen.width, h = this.app.screen.height;
    const rects: [number, number, number, number][] = s.views.length === 1
      ? [[0, 0, w, h]]
      : w > h * 1.1
        ? [[0, 0, w / 2 - 1, h], [w / 2 + 1, 0, w / 2 - 1, h]]
        : [[0, 0, w, h / 2 - 1], [0, h / 2 + 1, w, h / 2 - 1]];
    s.views.forEach((v, i) => v.layout(...rects[i]));
    s.huds.forEach((hd, i) => hd.layout(...rects[i]));
  }

  private frame(dt: number): void {
    const s = this.session;
    if (!s) return;
    if (!s.paused) {
      s.acc += dt;
      let steps = 0;
      const players = s.race.humans.length;
      while (s.acc >= STEP && steps < 60) {
        s.race.step(this.input.read(players));
        s.acc -= STEP;
        steps++;
      }
      this.handleEvents(s);
    }
    for (const v of s.views) v.update(s.paused ? 0 : dt);
    s.huds.forEach((h, i) => h.update(dt, this.ghostDelta(s, i)));
    if (s.mode !== 'split' && coarse && s.race.time > 3) this.touchHint.classList.remove('show');
    if (s.race.state === 'finished' && !s.resultsShown && s.race.time - s.race.finishedAt > 2.5) {
      s.resultsShown = true;
      this.show('results');
    }
  }

  private ghostDelta(s: Session, i: number): number | null {
    const r = s.race.humans[i];
    if (!r || !s.ghostTimes || r.lap < 1 || r.finished) return null;
    const lapTime = s.race.time - r.lapStart;
    const gt = s.ghostTimes[r.ship.idx];
    if (lapTime < 0.5 || isNaN(gt) || r.ship.idx > s.race.track.n * 0.97) return null;
    return lapTime - gt;
  }

  private handleEvents(s: Session): void {
    const race = s.race;
    for (const ev of race.events) {
      if (ev.type === 'go') continue;
      const hi = race.humans.indexOf(ev.racer);
      const hud = hi >= 0 ? s.huds[hi] : null;
      if (!hud) continue;
      if (ev.type === 'lap') {
        const id = race.track.def.id;
        const record = ev.time < bestLap(id);
        if (record && ev.ghost) {
          saveBestLap(id, ev.time);
          const g = ev.ghost;
          void encodeGhost(g).then((code) => saveGhostCode(id, code));
          if (s.mode === 'tt' && !this.imported.has(id) && this.settings.ghosts) {
            s.ghost = g;
            s.ghostTimes = this.ghostTimes(g);
          }
        }
        const laps = race.config.laps;
        if (record) hud.flash(`NEW RECORD  ${formatTime(ev.time)}`, 'record');
        else if (ev.best) hud.flash(`BEST LAP  ${formatTime(ev.time)}`, 'best');
        else if (laps > 0 && ev.racer.lap === laps) hud.flash('FINAL LAP');
        else hud.flash(formatTime(ev.time));
        if (laps > 0 && ev.racer.lap === laps && (record || ev.best)) setTimeout(() => hud.flash('FINAL LAP'), 1300);
      } else if (ev.type === 'finish') {
        hud.flash(`FINISHED  ${ev.place}${['st', 'nd', 'rd'][ev.place - 1] ?? 'th'}`, 'best');
      }
    }
    race.events.length = 0;
  }

  private togglePause(): void {
    const s = this.session;
    if (!s || s.mode === 'attract' || s.resultsShown) return;
    s.paused = !s.paused;
    if (s.paused) this.show('pause'); else this.hide();
  }

  private respawn(slot: number): void {
    const s = this.session;
    if (!s || s.paused || s.mode === 'attract' || s.race.state !== 'racing') return;
    const r = s.race.humans[slot];
    if (r && !r.finished) s.race.respawn(r);
  }

  // ---------- menus ----------

  private hide(): void {
    this.menu.classList.remove('show');
    this.menu.innerHTML = '';
  }

  private show(screen: string): void {
    this.menu.innerHTML = `<div class="panel ${screen}">${this.render(screen)}</div>`;
    this.menu.classList.add('show');
    this.menu.dataset.screen = screen;
    for (const c of this.menu.querySelectorAll<HTMLCanvasElement>('canvas[data-preview]')) drawPreview(c, c.dataset.preview!);
  }

  private render(screen: string): string {
    const s = this.settings;
    switch (screen) {
      case 'main':
        return `
          <h1 class="logo">RACE<span>WING</span></h1>
          <p class="tag">gravity · walls · two buttons</p>
          <div class="stack">
            <button class="primary" data-action="setup" data-mode="race">Race</button>
            <button data-action="setup" data-mode="tt">Time Trial</button>
            <button data-action="setup" data-mode="split">Split-screen</button>
            <button data-action="go" data-to="settings">Settings</button>
            <button data-action="go" data-to="help">How to play</button>
          </div>`;
      case 'setup': {
        const m = this.setupMode;
        const tiers: (Tier | 'mixed')[] = ['easy', 'medium', 'hard', 'insane', 'mixed'];
        const maxBots = m === 'split' ? 4 : 5;
        const toggle = (key: string, label: string, on: boolean) =>
          `<label class="toggle"><input type="checkbox" data-set="${key}" ${on ? 'checked' : ''}><span>${label}</span></label>`;
        const imported = this.imported.get(s.track);
        return `
          <h2>${MODE_TITLES[m]}</h2>
          <div class="tracks">${TRACK_DEFS.map((d) => `
            <button class="track ${d.id === s.track ? 'sel' : ''}" data-action="track" data-id="${d.id}" style="--c:${hex(d.color)}">
              <canvas width="200" height="130" data-preview="${d.id}"></canvas>
              <b>${d.name}</b><small>${d.blurb}</small>
              <em>record ${formatTime(bestLap(d.id))}</em>
            </button>`).join('')}
          </div>
          <div class="opts">
            ${m === 'tt' ? '' : `
            <div class="opt"><span>Laps</span><div class="stepper"><button data-action="laps" data-d="-1">−</button><b>${s.laps}</b><button data-action="laps" data-d="1">+</button></div></div>
            <div class="opt"><span>Bots</span><div class="stepper"><button data-action="bots" data-d="-1">−</button><b>${Math.min(s.bots, maxBots)}</b><button data-action="bots" data-d="1">+</button></div></div>
            <div class="opt wide"><span>Bot skill</span><div class="seg">${tiers.map((t) => `<button class="${s.tier === t ? 'sel' : ''}" data-action="tier" data-tier="${t}">${t === 'mixed' ? 'Mixed' : TIER_NAMES[t]}</button>`).join('')}</div></div>
            ${toggle('rubberBand', 'Rubber-band bots', s.rubberBand)}
            ${toggle('collisions', 'Ship collisions', s.collisions)}`}
            ${toggle('ghosts', 'Show ghost', s.ghosts)}
          </div>
          ${m === 'tt' ? `
          <div class="ghostbar">
            <span>${imported ? `Racing imported ghost: <b>${esc(imported.name)}</b> ${formatTime(imported.time)}` : 'Racing your best-lap ghost'}</span>
            <button data-action="share">Share my ghost</button>
            <button data-action="go" data-to="import">Import ghost</button>
            ${imported ? '<button data-action="unimport">Drop import</button>' : ''}
          </div>` : ''}
          ${m === 'split' ? '<p class="note">P1: <kbd>A</kbd> <kbd>D</kbd> or gamepad 1 · P2: <kbd>←</kbd> <kbd>→</kbd> or gamepad 2</p>' : ''}
          <div class="row"><button data-action="go" data-to="main">Back</button><button class="primary" data-action="start">Start</button></div>`;
      }
      case 'settings':
        return `
          <h2>Settings</h2>
          <div class="opt wide"><span>Controls</span><div class="seg">
            <button class="${s.scheme === 'thrust' ? 'sel' : ''}" data-action="scheme" data-v="thrust">Always thrust</button>
            <button class="${s.scheme === 'classic' ? 'sel' : ''}" data-action="scheme" data-v="classic">Classic</button>
          </div></div>
          <p class="note">${s.scheme === 'thrust'
            ? 'Always thrusting. Hold one side to turn. Hold <b>both</b> to brake, then reverse.'
            : 'Hold one side to turn while coasting. Hold <b>both</b> to thrust.'}</p>
          <label class="field"><span>Player 1 name</span><input data-set="name" maxlength="16" value="${esc(s.name)}"></label>
          <label class="field"><span>Player 2 name</span><input data-set="name2" maxlength="16" value="${esc(s.name2)}"></label>
          <div class="row"><button data-action="wipe">Clear records &amp; ghosts</button><button class="primary" data-action="go" data-to="main">Done</button></div>`;
      case 'help':
        return `
          <h2>How to play</h2>
          <ul class="help">
            <li><b>Two buttons.</b> Left half / right half of the screen, <kbd>A</kbd>/<kbd>D</kbd>, <kbd>←</kbd>/<kbd>→</kbd>, or gamepad bumpers / d-pad.</li>
            <li><b>Always thrust</b> (default): one button turns, both together brake and then reverse. Switch to <i>Classic</i> in Settings.</li>
            <li><b>Scrape the walls.</b> Graze a wall at a shallow angle to charge speed and throw sparks. Hit it head-on and you bounce and lose speed.</li>
            <li><b>Green chevrons</b> are gravity currents that push you the way they point. <b>Purple wells</b> pull you in; <b>orange wells</b> push you away.</li>
            <li><b>Yellow arrows</b> are boost pads.</li>
            <li><kbd>R</kbd> or gamepad Y resets your ship to the track. <kbd>Esc</kbd>/<kbd>P</kbd> or Start pauses.</li>
          </ul>
          <div class="row"><button class="primary" data-action="go" data-to="main">Back</button></div>`;
      case 'pause':
        return `
          <h2>Paused</h2>
          <div class="stack">
            <button class="primary" data-action="resume">Resume</button>
            <button data-action="restart">Restart</button>
            <button data-action="quit">Quit to menu</button>
          </div>`;
      case 'results':
        return this.renderResults();
      case 'import':
        return `
          <h2>Import ghost</h2>
          <p class="note">Paste a ghost code a friend shared. It'll be the ghost for that track's time trial.</p>
          <textarea id="ghost-in" rows="5" placeholder="RW1.…"></textarea>
          <p class="err" id="ghost-err"></p>
          <div class="row"><button data-action="setup" data-mode="tt">Cancel</button><button class="primary" data-action="import">Load</button></div>`;
      case 'share':
        return `
          <h2>Share ghost</h2>
          <p class="note">${esc(getTrack(s.track).def.name)}, ${formatTime(bestLap(s.track))}. Copy this code and send it to a friend.</p>
          <textarea id="ghost-out" rows="6" readonly>${esc(ghostCode(s.track) ?? '')}</textarea>
          <p class="err" id="copy-msg"></p>
          <div class="row"><button data-action="back-setup">Back</button><button class="primary" data-action="copy">Copy</button></div>`;
    }
    return '';
  }

  private renderResults(): string {
    const s = this.session!;
    const race = s.race;
    const order = [...race.racers].sort((a, b) => a.place - b.place);
    const rows = order.map((r) => `
      <tr class="${r.human ? 'me' : ''}">
        <td>${r.place}</td>
        <td><i style="background:${hex(r.spec.color)}"></i>${esc(r.spec.name)}${r.bot ? `<small>${TIER_NAMES[r.bot.tier]}</small>` : ''}</td>
        <td>${r.finished ? formatTime(r.finishTime) : 'racing'}</td>
        <td>${formatTime(r.bestLap)}</td>
      </tr>`).join('');
    const hasGhost = !!ghostCode(race.track.def.id);
    return `
      <h2>Results</h2>
      <p class="tag">${esc(race.track.def.name)} · ${race.config.laps} laps</p>
      <table class="results"><thead><tr><th>#</th><th>Racer</th><th>Time</th><th>Best lap</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="row">
        <button data-action="quit">Menu</button>
        ${hasGhost ? '<button data-action="share">Share ghost</button>' : ''}
        <button class="primary" data-action="restart">Race again</button>
      </div>`;
  }

  private onChange(e: Event): void {
    const el = e.target as HTMLInputElement;
    const key = el.dataset.set as keyof typeof this.settings | undefined;
    if (!key) return;
    const st = this.settings as unknown as Record<string, unknown>;
    st[key] = el.type === 'checkbox' ? el.checked : el.value.trim() || st[key];
    saveSettings(this.settings);
  }

  private onClick(e: Event): void {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!btn) return;
    const s = this.settings;
    const d = btn.dataset;
    switch (d.action) {
      case 'go': this.show(d.to!); break;
      case 'setup': this.setupMode = d.mode as Mode; this.show('setup'); break;
      case 'back-setup':
        if (this.session && this.session.mode !== 'attract') this.show('results');
        else this.show('setup');
        break;
      case 'track':
        s.track = d.id!;
        saveSettings(s);
        this.startAttract();
        this.show('setup');
        break;
      case 'laps': s.laps = Math.max(1, Math.min(9, s.laps + Number(d.d))); saveSettings(s); this.show('setup'); break;
      case 'bots': s.bots = Math.max(0, Math.min(this.setupMode === 'split' ? 4 : 5, s.bots + Number(d.d))); saveSettings(s); this.show('setup'); break;
      case 'tier': s.tier = d.tier as Tier | 'mixed'; saveSettings(s); this.show('setup'); break;
      case 'scheme': s.scheme = d.v as 'thrust' | 'classic'; saveSettings(s); this.show('settings'); break;
      case 'start':
        if (coarse) document.documentElement.requestFullscreen?.().catch(() => {});
        void this.start(this.setupMode);
        break;
      case 'resume': this.togglePause(); break;
      case 'restart': void this.start(this.session?.mode ?? this.setupMode); break;
      case 'quit': this.startAttract(); this.show('main'); this.pauseBtn.classList.remove('show'); this.touchHint.classList.remove('show'); break;
      case 'wipe':
        if (confirm('Delete all saved records and ghosts?')) {
          clearAll();
          this.settings = loadSettings();
          this.show('settings');
        }
        break;
      case 'share':
        if (!ghostCode(s.track)) { alert('Set a lap time on this track first.'); break; }
        this.show('share');
        break;
      case 'copy': {
        const ta = document.getElementById('ghost-out') as HTMLTextAreaElement;
        const msg = document.getElementById('copy-msg')!;
        ta.select();
        navigator.clipboard?.writeText(ta.value).then(() => { msg.textContent = 'Copied!'; }, () => { msg.textContent = 'Select the text and copy it manually.'; });
        break;
      }
      case 'import': {
        const code = (document.getElementById('ghost-in') as HTMLTextAreaElement).value;
        const err = document.getElementById('ghost-err')!;
        decodeGhost(code).then((g) => {
          if (!TRACK_DEFS.some((t) => t.id === g.trackId)) throw new Error('That ghost is for a track this version doesn\'t have.');
          this.imported.set(g.trackId, g);
          s.track = g.trackId;
          saveSettings(s);
          this.setupMode = 'tt';
          this.startAttract();
          this.show('setup');
        }, (x: Error) => { err.textContent = x.message || 'Could not read that code.'; })
          .catch((x: Error) => { err.textContent = x.message; });
        break;
      }
      case 'unimport': this.imported.delete(s.track); this.show('setup'); break;
    }
  }
}

function drawPreview(c: HTMLCanvasElement, id: string): void {
  const t = getTrack(id);
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const b = t.bounds;
  const pad = 14;
  const sc = Math.min((c.width - pad * 2) / (b.maxX - b.minX), (c.height - pad * 2) / (b.maxY - b.minY));
  const ox = (c.width - (b.maxX - b.minX) * sc) / 2 - b.minX * sc;
  const oy = (c.height - (b.maxY - b.minY) * sc) / 2 - b.minY * sc;
  ctx.clearRect(0, 0, c.width, c.height);
  const path = () => {
    ctx.beginPath();
    for (let i = 0; i < t.n; i += 3) ctx.lineTo(t.cx[i] * sc + ox, t.cy[i] * sc + oy);
    ctx.closePath();
  };
  ctx.lineJoin = 'round';
  ctx.strokeStyle = hex(t.def.color);
  ctx.globalAlpha = 0.25; ctx.lineWidth = 9; path(); ctx.stroke();
  ctx.globalAlpha = 1; ctx.lineWidth = 2.5; path(); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(t.cx[0] * sc + ox, t.cy[0] * sc + oy, 4, 0, Math.PI * 2); ctx.fill();
}

void new Game().init();

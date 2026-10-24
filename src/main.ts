import { Application } from 'pixi.js';
import './style.css';
import { sound } from './audio';
import { Bot, TIER_NAMES, type Tier } from './core/ai';
import {
  MAX_STARS, nodeById, NODES, placeStars, seriesOf, totalStars, ttStars, ttTargets, unlockedHulls, type CampaignNode, type Line,
} from './core/campaign';
import { BANTER, pick, WREN } from './core/banter';
import { char, defaultTier, PIT_CREW } from './core/characters';
import { drawHull2D, hullById, PLAYER_COLORS, STARTER_HULLS } from './core/ships';
import { decodeGhost, encodeGhost, ghostPose, GHOST_HZ, type Ghost } from './core/ghost';
import { formatTime } from './core/math';
import { Race, STEP, type Racer, type RacerSpec } from './core/race';
import { getTrack, TRACK_DEFS } from './core/tracks';
import { Input } from './input';
import { View } from './render/view';
import {
  bestLap, clearAll, ghostCode, loadProgress, loadSeen, loadSettings, saveBestLap, saveGhostCode, saveProgress, saveSeen, saveSettings,
} from './storage';
import { focusNode, nodeX, stars, renderBrief, renderCallsign, renderDialogue, renderHangar, renderMap } from './ui/campaignView';
import { Hud } from './ui/hud';
import { portrait } from './ui/portrait';

type Mode = 'race' | 'tt' | 'split' | 'attract' | 'campaign';

const MIXED: Tier[] = ['insane', 'hard', 'hard', 'medium', 'medium', 'easy'];
const MODE_TITLES: Record<Mode, string> = { race: 'Quick Race', tt: 'Time Trial', split: 'Split-screen', attract: '', campaign: 'Campaign' };

interface Session {
  mode: Mode;
  event: CampaignNode | null;
  targets: [number, number, number] | null;
  race: Race;
  views: View[];
  huds: Hud[];
  ghost: Ghost | null;
  ghostTimes: Float32Array | null;
  paused: boolean;
  acc: number;
  resultsShown: boolean;
  lastCount: number;
  boost: number[];
  finalLap: boolean;
  radio: RadioState[];
}

interface RadioState {
  last: number;
  ahead: Set<Racer>;
  grind: number;
  lastGrindTip: number;
  hitTips: number;
  lastHitTip: number;
  saidFinal: boolean;
  saidLead: boolean;
}

const newRadio = (): RadioState => ({
  last: -99, ahead: new Set(), grind: 0, lastGrindTip: -99, hitTips: 0, lastHitTip: -99, saidFinal: false, saidLead: false,
});

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const ordinal = (n: number) => n + (['st', 'nd', 'rd'][n - 1] ?? 'th');
const coarse = matchMedia('(pointer: coarse)').matches;
/** `?autopilot` lets an Insane bot drive the human ships (demo/testing). */
const AUTOPILOT = new URLSearchParams(location.search).has('autopilot');

class Game {
  private app = new Application();
  private input!: Input;
  private settings = loadSettings();
  private progress = loadProgress();
  private session: Session | null = null;
  private menu = document.getElementById('menu') as HTMLDivElement;
  private hudLayer = document.getElementById('hud') as HTMLDivElement;
  private touchHint = document.getElementById('touch') as HTMLDivElement;
  private pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement;
  private pressL = document.querySelector('#press .l') as HTMLElement;
  private pressR = document.querySelector('#press .r') as HTMLElement;
  private setupMode: Mode = 'race';
  private eventId = 'x0';
  private imported = new Map<string, Ghost>();
  private seen = loadSeen();
  /** Stars earned by the last campaign event, and what that unlocked. */
  private earned: { stars: number; improved: boolean; unlocked: string[] } | null = null;
  private dialogue: { lines: Line[]; i: number; then: () => void } | null = null;
  private hangarBack = 'main';

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
    this.menu.addEventListener('input', (e) => this.onChange(e));
    this.pauseBtn.addEventListener('click', () => this.togglePause());
    const unlock = () => {
      sound.unlock();
      sound.setVolumes(this.settings.music, this.settings.sfx);
    };
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', (e) => {
      unlock();
      if (e.code === 'KeyM' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) sound.toggleMute();
    });
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

  private async start(mode: Mode, event: CampaignNode | null = null): Promise<void> {
    const s = this.settings;
    const track = getTrack(event?.track ?? s.track);
    const humans = mode === 'split' ? 2 : mode === 'attract' ? 0 : 1;
    const racers: RacerSpec[] = [];
    const pilot = (who: string, tier: Tier): RacerSpec => {
      const c = char(who);
      return { name: c.name.split(' ')[0], color: c.color, hull: c.hull, who, kind: 'bot', tier };
    };
    if (event) {
      for (const o of event.field) racers.push(pilot(o.who, o.tier));
    } else {
      const botCount = mode === 'tt' ? 0 : mode === 'attract' ? 6 : Math.min(s.bots, 6 - humans);
      const crew = [...PIT_CREW].sort(() => Math.random() - 0.5);
      for (let i = 0; i < botCount; i++) {
        const tier = mode === 'attract' ? defaultTier(crew[i]) : s.tier === 'mixed' ? MIXED[i] : s.tier;
        racers.push(pilot(crew[i], tier));
      }
    }
    const p2Color = PLAYER_COLORS.find((c) => c !== s.color) ?? 0xff3df2;
    for (let i = 0; i < humans; i++) {
      const name = i === 0 ? (mode === 'campaign' && s.callsign ? s.callsign : s.name) : s.name2;
      racers.push({ name, color: i === 0 ? s.color : p2Color, hull: i === 0 ? s.hull : 'wasp', kind: 'human', slot: i });
    }
    const timeTrial = mode === 'tt' || event?.kind === 'tt';
    const race = new Race({
      track,
      laps: event ? (event.kind === 'elim' ? 0 : event.kind === 'tt' ? 3 : event.laps) : timeTrial || mode === 'attract' ? 0 : s.laps,
      elimination: event?.kind === 'elim',
      racers,
      scheme: s.scheme,
      rubberBand: mode !== 'attract' && s.rubberBand,
      collisions: !timeTrial && s.collisions,
      seed: Math.floor(Math.random() * 1e6),
    });
    if (AUTOPILOT) race.humans.forEach((h, i) => { h.autopilot = new Bot('insane', 5 + i); });

    let ghost: Ghost | null = null;
    if (mode !== 'attract' && s.ghosts) {
      ghost = this.imported.get(track.key) ?? null;
      const code = ghostCode(track.key);
      if (!ghost && code) { try { ghost = await decodeGhost(code); } catch { ghost = null; } }
    }
    const targets = event?.kind === 'tt' ? ttTargets(track.def.id) : null;

    this.end();
    const session: Session = {
      mode, event, targets, race, views: [], huds: [], ghost, ghostTimes: ghost ? this.ghostTimes(ghost) : null,
      paused: false, acc: 0, resultsShown: false, lastCount: 99, boost: [0, 0], finalLap: false, radio: [newRadio(), newRadio()],
    };
    const follow = mode === 'attract' ? [race.racers[0]] : race.humans;
    for (const r of follow) {
      const view = new View(race, r, () => this.ghostPoseFor(session, r));
      this.app.stage.addChild(view.root);
      session.views.push(view);
      if (mode !== 'attract') {
        const hud = new Hud(this.hudLayer, race, r, timeTrial);
        if (targets) hud.info(`<span class="medal b"></span>${targets[0].toFixed(1)}<span class="medal s"></span>${targets[1].toFixed(1)}<span class="medal g"></span>${targets[2].toFixed(1)}`);
        session.huds.push(hud);
      }
    }
    this.session = session;
    this.input.clear();
    this.layout();
    const racing = mode !== 'attract';
    sound.setEngines(racing ? humans : 0);
    sound.setIntensity(racing ? 0.6 : 0.25);
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
    const t = getTrack(g.trackId.split('@')[0]);
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

  private ghostPoseFor(s: Session, r: Racer) {
    if (!s.ghost || s.ghost.trackId !== s.race.track.key || r.lap < 1 || r.finished || r.out) return null;
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
    const race = s.race;
    if (!s.paused) {
      s.acc += dt;
      let steps = 0;
      const players = race.humans.length;
      while (s.acc >= STEP && steps < 60) {
        race.step(this.input.read(players));
        s.acc -= STEP;
        steps++;
      }
      this.handleEvents(s);
    }
    if (s.mode !== 'attract') {
      this.frameAudio(s);
      if (!s.paused && race.state === 'racing') this.frameRadio(s, dt);
    }
    const sides = s.mode !== 'attract' && !s.paused ? this.input.touchSides() : { left: false, right: false };
    this.pressL.classList.toggle('on', sides.left);
    this.pressR.classList.toggle('on', sides.right);
    for (const v of s.views) v.update(s.paused ? 0 : dt);
    s.huds.forEach((h, i) => h.update(dt, this.ghostDelta(s, i)));
    if (s.mode !== 'split' && coarse && race.time > 3) this.touchHint.classList.remove('show');
    if (race.state === 'finished' && !s.resultsShown && race.time - race.finishedAt > 2.5) {
      s.resultsShown = true;
      sound.setIntensity(0.3);
      if (s.event) {
        this.scoreEvent(s);
        const win = this.won(s);
        this.story(`${s.event.id}:${win ? 'win' : 'lose'}`, win ? s.event.win : s.event.lose, () => this.show('results'));
      } else this.show('results');
    }
  }

  private frameAudio(s: Session): void {
    const race = s.race;
    if (race.time < 0) {
      const c = Math.ceil(-race.time);
      if (c !== s.lastCount && c <= 3) sound.countdown(false);
      s.lastCount = c;
    }
    race.humans.forEach((r, i) => {
      const sh = r.ship;
      sound.updateEngine(i, Math.hypot(sh.vx, sh.vy), s.paused ? 0 : sh.throttle, sh.scrape > 0 && !s.paused, !s.paused && !r.out);
      if (sh.hit > 250) { sound.hit(sh.hit); this.buzz(Math.min(70, Math.round(sh.hit / 8))); }
      if (sh.boost > s.boost[i]) sound.pad();
      s.boost[i] = sh.boost;
    });
    const p1 = race.humans[0];
    const final = !!p1 && !p1.finished && race.config.laps > 0 && p1.lap === race.config.laps;
    if (final !== s.finalLap) { s.finalLap = final; sound.setIntensity(final ? 0.9 : 0.6); }
  }

  private say(s: Session, i: number, who: string, text: string): void {
    if (!this.settings.radio) return;
    const hud = s.huds[i];
    if (!hud) return;
    const c = char(who);
    const name = this.settings.callsign || this.settings.name;
    hud.radio(portrait(c, 44), c.name.split(' ')[0], esc(text).replace(/\{name\}/g, esc(name)), c.color);
    s.radio[i].last = s.race.time;
  }

  private frameRadio(s: Session, dt: number): void {
    const race = s.race;
    race.humans.forEach((me, i) => {
      const st = s.radio[i];
      if (me.finished || me.out) return;
      if (race.time < 3) {
        st.ahead = new Set(race.racers.filter((r) => r !== me && r.place < me.place));
        return;
      }
      const free = race.time - st.last > 5;
      const sh = me.ship;
      // Wren's tips.
      if (sh.scrape > 0) st.grind += dt; else st.grind = 0;
      const laps = race.config.laps;
      if (laps > 0 && me.lap === laps && !st.saidFinal && me.maxLap === laps) {
        st.saidFinal = true;
        this.say(s, i, 'wren', pick(WREN.final));
        return;
      }
      if (sh.hit > 320 && st.hitTips < 3 && race.time - st.lastHitTip > 15 && free) {
        st.hitTips++;
        st.lastHitTip = race.time;
        this.say(s, i, 'wren', pick(WREN.hit));
        return;
      }
      if (st.grind > 1.4 && race.time - st.lastGrindTip > 25 && free) {
        st.lastGrindTip = race.time;
        this.say(s, i, 'wren', pick(WREN.grind));
        return;
      }
      // Overtakes.
      const ahead = new Set(race.racers.filter((r) => r !== me && !r.out && r.place < me.place));
      const passedMe = [...ahead].filter((r) => !st.ahead.has(r) && r.spec.who && BANTER[r.spec.who] && !r.finished);
      const iPassed = [...st.ahead].filter((r) => !ahead.has(r) && r.spec.who && BANTER[r.spec.who] && !r.out);
      st.ahead = ahead;
      if (free && passedMe.length) this.say(s, i, passedMe[0].spec.who!, pick(BANTER[passedMe[0].spec.who!].passMe));
      else if (free && iPassed.length && Math.random() < 0.7) this.say(s, i, iPassed[0].spec.who!, pick(BANTER[iPassed[0].spec.who!].passed));
      else if (me.place === 1 && !st.saidLead && race.racers.length > 1 && free && s.mode !== 'tt' && s.event?.kind !== 'tt') {
        st.saidLead = true;
        this.say(s, i, 'wren', pick(WREN.lead));
      }
    });
  }

  private buzz(pattern: number | number[]): void {
    if (this.settings.vibrate && navigator.vibrate) navigator.vibrate(pattern);
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
      if (ev.type === 'go') { sound.countdown(true); continue; }
      if (ev.type === 'out') {
        for (const v of s.views) v.burst(ev.racer.ship.x, ev.racer.ship.y, ev.racer.spec.color);
        sound.chime('out');
        const hi = race.humans.indexOf(ev.racer);
        for (const [i, h] of s.huds.entries()) h.flash(i === hi ? 'KNOCKED OUT' : `${ev.racer.spec.name.toUpperCase()} OUT`, i === hi ? '' : 'best');
        continue;
      }
      const hi = race.humans.indexOf(ev.racer);
      const hud = hi >= 0 ? s.huds[hi] : null;
      if (!hud) continue;
      if (ev.type === 'lap') {
        const key = race.track.key;
        const record = ev.time < bestLap(key);
        if (record && ev.ghost) {
          saveBestLap(key, ev.time);
          const g = ev.ghost;
          void encodeGhost(g).then((code) => saveGhostCode(key, code));
          if ((s.mode === 'tt' || s.event?.kind === 'tt') && !this.imported.has(key) && this.settings.ghosts) {
            s.ghost = g;
            s.ghostTimes = this.ghostTimes(g);
          }
        }
        const laps = race.config.laps;
        sound.chime(record ? 'record' : ev.best ? 'best' : 'lap');
        this.buzz(25);
        if (record) hud.flash(`NEW RECORD  ${formatTime(ev.time)}`, 'record');
        else if (ev.best) hud.flash(`BEST LAP  ${formatTime(ev.time)}`, 'best');
        else if (laps > 0 && ev.racer.lap === laps) hud.flash('FINAL LAP');
        else hud.flash(formatTime(ev.time));
        if (laps > 0 && ev.racer.lap === laps && (record || ev.best)) setTimeout(() => hud.flash('FINAL LAP'), 1300);
      } else if (ev.type === 'finish') {
        sound.chime('finish');
        this.buzz([40, 60, 40]);
        hud.flash(race.config.elimination ? 'LAST ONE FLYING' : `FINISHED  ${ordinal(ev.place)}`, 'best');
      }
    }
    race.events.length = 0;
  }

  private scoreEvent(s: Session): void {
    const ev = s.event!;
    const me = s.race.humans[0];
    const p = this.progress;
    const hullsBefore = unlockedHulls(p);
    const starsBefore = totalStars(p);
    const earned = ev.kind === 'exhibition' ? 0 : ev.kind === 'tt' ? ttStars(me.bestLap, s.targets!) : placeStars(me.place);
    const prev = p[ev.id] ?? -1;
    if (earned > prev) { p[ev.id] = earned; saveProgress(p); }
    const unlocked: string[] = [];
    for (const h of unlockedHulls(p)) if (!hullsBefore.includes(h)) unlocked.push(`${hullById(h).name} hull`);
    for (const g of NODES) if (g.gate && starsBefore < g.gate && totalStars(p) >= g.gate) unlocked.push(`${seriesOf(g).name} gate`);
    this.earned = { stars: earned, improved: earned > Math.max(0, prev), unlocked };
    if (earned > 0) setTimeout(() => sound.chime('star'), 400);
  }

  private won(s: Session): boolean {
    const ev = s.event!;
    return ev.kind === 'exhibition' ? s.race.humans[0].place === 1 : (this.earned?.stars ?? 0) > 0;
  }

  /** Show dialogue lines (once per key unless forced), then continue. */
  private story(key: string, lines: Line[] | undefined, then: () => void, force = false): void {
    if (!lines?.length || (!force && this.seen.has(key))) { then(); return; }
    this.seen.add(key);
    saveSeen(this.seen);
    this.dialogue = { lines, i: 0, then };
    this.show('dialogue');
  }

  private totalStars(): number {
    return totalStars(this.progress);
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
    if (r && !r.finished && !r.out) s.race.respawn(r);
  }

  // ---------- menus ----------

  private hide(): void {
    this.menu.classList.remove('show');
    this.menu.innerHTML = '';
  }

  private screen = 'main';

  private show(screen: string): void {
    if (screen === 'hangar' && this.screen !== 'hangar') this.hangarBack = this.screen === 'campaign' ? 'campaign' : 'main';
    this.screen = screen;
    this.menu.innerHTML = `<div class="panel ${screen}">${this.render(screen)}</div>`;
    this.menu.classList.add('show');
    this.menu.scrollTop = 0;
    for (const c of this.menu.querySelectorAll<HTMLCanvasElement>('canvas[data-preview]')) drawPreview(c, c.dataset.preview!);
    for (const c of this.menu.querySelectorAll<HTMLCanvasElement>('canvas[data-hull]')) drawShip(c, c.dataset.hull!, this.settings.color, 2.2);
    const big = document.getElementById('hangar-ship') as HTMLCanvasElement | null;
    if (big) drawShip(big, this.settings.hull, this.settings.color, 5.5);
    if (screen === 'campaign') {
      const scroller = this.menu.querySelector('.map-scroll') as HTMLElement | null;
      if (scroller) scroller.scrollLeft = Math.max(0, nodeX(focusNode(this.progress)) - scroller.clientWidth / 2);
    }
  }

  private render(screen: string): string {
    const s = this.settings;
    switch (screen) {
      case 'main':
        return `
          <h1 class="logo">RACE<span>WING</span></h1>
          <p class="tag">gravity · walls · two buttons</p>
          <div class="stack">
            <button class="primary" data-action="campaign">Campaign <small>${this.totalStars()}/${MAX_STARS}★</small></button>
            <button data-action="setup" data-mode="race">Quick Race</button>
            <button data-action="setup" data-mode="tt">Time Trial</button>
            <button data-action="setup" data-mode="split">Split-screen</button>
            <button data-action="go" data-to="hangar">Hangar</button>
            <button data-action="go" data-to="settings">Settings</button>
            <button data-action="go" data-to="help">How to play</button>
          </div>`;
      case 'campaign':
        return renderMap(this.progress);
      case 'brief':
        return renderBrief(nodeById(this.eventId)!, this.progress, s.callsign || s.name);
      case 'dialogue':
        return renderDialogue(this.dialogue!.lines, this.dialogue!.i, s.callsign || s.name);
      case 'callsign':
        return renderCallsign(s.callsign || s.name);
      case 'hangar':
        return renderHangar(s.hull, s.color, [...STARTER_HULLS, ...unlockedHulls(this.progress)]);
      case 'setup':
        return this.renderSetup();
      case 'settings': {
        const slider = (key: string, label: string, v: number) =>
          `<label class="field"><span>${label} <b>${Math.round(v * 100)}%</b></span><input type="range" min="0" max="1" step="0.05" data-set="${key}" value="${v}"></label>`;
        return `
          <h2>Settings</h2>
          <div class="opt wide"><span>Controls</span><div class="seg">
            <button class="${s.scheme === 'thrust' ? 'sel' : ''}" data-action="scheme" data-v="thrust">Always thrust</button>
            <button class="${s.scheme === 'classic' ? 'sel' : ''}" data-action="scheme" data-v="classic">Classic</button>
          </div></div>
          <p class="note">${s.scheme === 'thrust'
            ? 'Always thrusting. Hold one side to turn. Hold <b>both</b> to brake, then reverse.'
            : 'Hold one side to turn while coasting. Hold <b>both</b> to thrust.'}</p>
          ${slider('music', 'Music', s.music)}
          ${slider('sfx', 'Sound effects', s.sfx)}
          <p class="note"><kbd>M</kbd> mutes everything.</p>
          <div class="opts">
            <label class="toggle"><input type="checkbox" data-set="radio" ${s.radio ? 'checked' : ''}><span>Radio chatter</span></label>
            <label class="toggle"><input type="checkbox" data-set="vibrate" ${s.vibrate ? 'checked' : ''}><span>Vibration (Android)</span></label>
          </div>
          <label class="field"><span>Player 1 name</span><input data-set="name" maxlength="16" value="${esc(s.name)}"></label>
          <label class="field"><span>Player 2 name</span><input data-set="name2" maxlength="16" value="${esc(s.name2)}"></label>
          <div class="row"><button data-action="wipe">Reset progress, records &amp; ghosts</button><button class="primary" data-action="go" data-to="main">Done</button></div>`;
      }
      case 'help':
        return `
          <h2>How to play</h2>
          <ul class="help">
            <li><b>Two buttons.</b> Left half / right half of the screen, <kbd>A</kbd>/<kbd>D</kbd>, <kbd>←</kbd>/<kbd>→</kbd>, or gamepad bumpers / d-pad.</li>
            <li><b>Always thrust</b> (default): one button turns, both together brake and then reverse. Switch to <i>Classic</i> in Settings.</li>
            <li><b>Grind the walls.</b> Put your <i>engine flame</i> against a wall, tail in and nose angled slightly away, to boost and throw sparks. Nose-first contact just rubs off speed, and head-on hits bounce you.</li>
            <li><b>Green chevrons</b> are gravity currents that push you the way they point. <b>Purple wells</b> pull you in; <b>orange wells</b> push you away.</li>
            <li><b>Yellow arrows</b> are boost pads.</li>
            <li><b>Campaign:</b> earn up to 3★ per event (podium places, or bronze/silver/gold lap targets). Stars unlock the next series.</li>
            <li><kbd>R</kbd> or gamepad Y resets your ship to the track. <kbd>Esc</kbd>/<kbd>P</kbd> or Start pauses. <kbd>M</kbd> mutes.</li>
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
          <p class="note">Paste a ghost code a friend shared. It becomes the ghost for that track's time trial.</p>
          <textarea id="ghost-in" rows="5" placeholder="RW1.…"></textarea>
          <p class="err" id="ghost-err"></p>
          <div class="row"><button data-action="setup" data-mode="tt">Cancel</button><button class="primary" data-action="import">Load</button></div>`;
      case 'share': {
        const key = getTrack(s.track).key;
        return `
          <h2>Share ghost</h2>
          <p class="note">${esc(getTrack(s.track).def.name)}, ${formatTime(bestLap(key))}. Copy this code and send it to a friend.</p>
          <textarea id="ghost-out" rows="6" readonly>${esc(ghostCode(key) ?? '')}</textarea>
          <p class="err" id="copy-msg"></p>
          <div class="row"><button data-action="back-share">Back</button><button class="primary" data-action="copy">Copy</button></div>`;
      }
    }
    return '';
  }

  private renderSetup(): string {
    const s = this.settings;
    const m = this.setupMode;
    const tiers: (Tier | 'mixed')[] = ['easy', 'medium', 'hard', 'insane', 'mixed'];
    const maxBots = m === 'split' ? 4 : 5;
    const toggle = (key: string, label: string, on: boolean) =>
      `<label class="toggle"><input type="checkbox" data-set="${key}" ${on ? 'checked' : ''}><span>${label}</span></label>`;
    const imported = this.imported.get(getTrack(s.track).key);
    return `
      <h2>${MODE_TITLES[m]}</h2>
      <div class="tracks">${TRACK_DEFS.map((d) => `
        <button class="track ${d.id === s.track ? 'sel' : ''}" data-action="track" data-id="${d.id}" style="--c:${hex(d.color)}">
          <canvas width="200" height="130" data-preview="${d.id}"></canvas>
          <b>${d.name}</b><small>${d.blurb}</small>
          <em>record ${formatTime(bestLap(getTrack(d.id).key))}</em>
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

  private renderResults(): string {
    const s = this.session!;
    const race = s.race;
    const order = [...race.racers].sort((a, b) => a.place - b.place);
    const timeTrial = s.mode === 'tt' || s.event?.kind === 'tt';
    const rows = (timeTrial ? race.humans : order).map((r) => `
      <tr class="${r.human ? 'me' : ''}">
        <td>${r.place}</td>
        <td><i style="background:${hex(r.spec.color)}"></i>${esc(r.spec.name)}${r.bot ? `<small>${TIER_NAMES[r.bot.tier]}</small>` : ''}</td>
        <td>${r.finished ? formatTime(r.finishTime) : r.out ? 'out' : 'racing'}</td>
        <td>${formatTime(r.bestLap)}</td>
      </tr>`).join('');
    const key = race.track.key;
    const hasGhost = !!ghostCode(key);
    let head = '';
    let actions = `<button class="primary" data-action="restart">Race again</button>`;
    if (s.event && this.earned) {
      const e = this.earned;
      const ex = s.event.kind === 'exhibition';
      const msg = ex ? (race.humans[0].place === 1 ? 'You beat the champion!' : 'Exhibition complete.')
        : e.stars === 0 ? (s.event.kind === 'tt' ? 'No medal this time. Retry?' : 'Off the podium. Retry?')
          : e.improved ? 'New best for this event!' : 'Stars already earned.';
      head = `<div class="earned">${ex ? '' : stars(e.stars)}<p>${msg}</p>
        ${e.unlocked.map((u) => `<p class="unlock">🔓 ${esc(u)} unlocked!</p>`).join('')}</div>`;
      actions = `<button data-action="restart">Retry</button>
        <button class="primary" data-action="campaign">Campaign map</button>`;
    } else {
      actions = `<button data-action="quit">Menu</button>${hasGhost ? '<button data-action="share">Share ghost</button>' : ''}${actions}`;
    }
    const sub = timeTrial ? `${race.config.laps || ''} laps · best lap ${formatTime(race.humans[0]?.bestLap ?? Infinity)}` : race.config.elimination ? 'Elimination' : `${race.config.laps} laps`;
    return `
      <h2>Results</h2>
      <p class="tag">${esc(race.track.def.name)} · ${sub}</p>
      ${head}
      <table class="results"><thead><tr><th>#</th><th>Racer</th><th>Time</th><th>Best lap</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="row">${actions}</div>`;
  }

  private onChange(e: Event): void {
    const el = e.target as HTMLInputElement;
    const key = el.dataset.set;
    if (!key) return;
    const st = this.settings as unknown as Record<string, unknown>;
    if (el.type === 'checkbox') st[key] = el.checked;
    else if (el.type === 'range') {
      st[key] = Number(el.value);
      const label = el.parentElement?.querySelector('b');
      if (label) label.textContent = Math.round(Number(el.value) * 100) + '%';
      sound.setVolumes(this.settings.music, this.settings.sfx);
    } else if (e.type === 'change') st[key] = el.value.trim() || st[key];
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
      case 'campaign':
        if (!s.callsign) { this.show('callsign'); break; }
        if (this.session?.mode !== 'attract') this.startAttract();
        this.show('campaign');
        break;
      case 'callsign': {
        const v = (document.getElementById('callsign') as HTMLInputElement).value.trim().slice(0, 14);
        if (!v) break;
        s.callsign = v;
        saveSettings(s);
        this.show('campaign');
        break;
      }
      case 'brief': {
        this.eventId = d.id!;
        const ev = nodeById(this.eventId)!;
        if (this.session?.mode !== 'attract' || this.session.race.track.def.id !== ev.track) {
          s.track = ev.track;
          this.startAttract();
        }
        this.show('brief');
        break;
      }
      case 'story': {
        const ev = nodeById(this.eventId)!;
        this.story(`${ev.id}:pre`, ev.pre, () => this.show('brief'), true);
        break;
      }
      case 'start-event': {
        if (coarse) document.documentElement.requestFullscreen?.().catch(() => {});
        const ev = nodeById(this.eventId)!;
        this.story(`${ev.id}:pre`, ev.pre, () => { void this.start('campaign', ev); });
        break;
      }
      case 'next':
      case 'skip': {
        const dl = this.dialogue;
        if (!dl) break;
        if (d.action === 'next' && dl.i < dl.lines.length - 1) { dl.i++; this.show('dialogue'); break; }
        this.dialogue = null;
        dl.then();
        break;
      }
      case 'hull': s.hull = d.id!; saveSettings(s); this.show('hangar'); break;
      case 'color': s.color = Number(d.c); saveSettings(s); this.show('hangar'); break;
      case 'back-hangar': this.show(this.hangarBack); break;
      case 'back-share':
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
      case 'restart': {
        const cur = this.session;
        void this.start(cur?.mode ?? this.setupMode, cur?.event ?? null);
        break;
      }
      case 'quit':
        this.startAttract();
        this.show('main');
        this.pauseBtn.classList.remove('show');
        this.touchHint.classList.remove('show');
        break;
      case 'wipe':
        if (confirm('Delete campaign progress, records and ghosts?')) {
          clearAll();
          this.settings = loadSettings();
          this.progress = loadProgress();
          this.show('settings');
        }
        break;
      case 'share':
        if (this.session && this.session.mode !== 'attract') s.track = this.session.race.track.def.id;
        if (!ghostCode(getTrack(s.track).key)) { alert('Set a lap time on this track first.'); break; }
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
          const id = g.trackId.split('@')[0];
          if (!TRACK_DEFS.some((t) => t.id === id)) throw new Error('That ghost is for a track this version doesn\'t have.');
          if (getTrack(id).key !== g.trackId) throw new Error('That ghost was recorded on an older layout of this track.');
          this.imported.set(g.trackId, g);
          s.track = id;
          saveSettings(s);
          this.setupMode = 'tt';
          this.startAttract();
          this.show('setup');
        }).catch((x: Error) => { err.textContent = x.message || 'Could not read that code.'; });
        break;
      }
      case 'unimport': this.imported.delete(getTrack(s.track).key); this.show('setup'); break;
    }
  }
}

function drawShip(c: HTMLCanvasElement, hullId: string, color: number, scale: number): void {
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.save();
  ctx.translate(c.width / 2 + 4 * scale, c.height / 2);
  ctx.scale(scale, scale);
  drawHull2D(ctx, hullById(hullId), hex(color));
  ctx.restore();
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

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}

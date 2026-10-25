import { TIER_NAMES } from '../core/ai';
import {
  KIND_LABEL, MAX_STARS, NODES, nodeById, nodeState, SERIES, totalStars, ttTargets, type CampaignNode, type Line, type Progress,
} from '../core/campaign';
import { char } from '../core/characters';
import { formatTime } from '../core/math';
import { HULLS, PLAYER_COLORS } from '../core/ships';
import { getTrack } from '../core/tracks';
import { portrait } from './portrait';

const COLW = 150;
const ROWH = 112;
const PAD = 40;
const TOP = 46;
const NODE = 104;

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const stars = (n: number) => `<span class="stars">${'★'.repeat(n)}<i>${'★'.repeat(3 - n)}</i></span>`;
const fill = (text: string, name: string) => esc(text).replace(/\{name\}/g, `<span class="callsign">${esc(name)}</span>`);

const KIND_ICON: Record<string, string> = { race: '🏁', tt: '⏱', elim: '☠', exhibition: '✦' };

export function renderMap(p: Progress): string {
  const total = totalStars(p);
  const cols = Math.max(...NODES.map((n) => n.col)) + 1;
  const rows = Math.max(...NODES.map((n) => n.row)) + 1;
  const w = cols * COLW + PAD * 2;
  const h = rows * ROWH + TOP + 24;
  const cx = (n: CampaignNode) => PAD + n.col * COLW + COLW / 2;
  const cy = (n: CampaignNode) => TOP + n.row * ROWH + ROWH / 2;

  const bands = SERIES.map((s) => `
    <div class="band" style="left:${PAD + s.from * COLW}px;width:${(s.to - s.from + 1) * COLW}px;--c:${hex(s.color)}"><span>${s.name}</span></div>`).join('');

  const edges = NODES.flatMap((n) => n.requires.map((rid) => {
    const r = nodeById(rid)!;
    const st = nodeState(p, n);
    const cls = st === 'done' ? 'done' : st === 'open' ? 'open' : st === 'gated' ? 'gated' : 'locked';
    const x1 = cx(r), y1 = cy(r), x2 = cx(n), y2 = cy(n);
    const mx = (x1 + x2) / 2;
    return `<path class="edge ${cls}" d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}"/>`;
  })).join('');

  const nodes = NODES.map((n) => {
    const st = nodeState(p, n);
    const t = getTrack(n.track).def;
    const boss = n.boss ? char(n.boss) : n.kind === 'exhibition' ? char('sable') : null;
    const left = cx(n) - NODE / 2, top = cy(n) - NODE / 2;
    const gate = n.gate ? `<div class="gate ${total >= n.gate ? 'ok' : ''}">${total >= n.gate ? '🔓' : '🔒'} ${n.gate}★</div>` : '';
    const reward = n.reward ? `<div class="reward" title="Unlocks a hull">＋${HULLS.find((x) => x.id === n.reward)?.name}</div>` : '';
    return `
      <button class="node ${st} ${boss ? 'boss' : ''} kind-${n.kind}" data-action="brief" data-id="${n.id}" ${st === 'locked' ? 'disabled' : ''}
        style="left:${left}px;top:${top}px;--c:${hex(boss?.color ?? t.color)}">
        ${gate}
        ${boss ? `<div class="node-face">${portrait(boss, 34)}</div>` : `<div class="node-icon">${KIND_ICON[n.kind]}</div>`}
        <em>${n.kind === 'exhibition' ? 'Exhibition' : boss ? `vs ${boss.name.split(' ')[0]}` : KIND_LABEL[n.kind]}</em>
        <b>${t.name}</b>
        ${n.kind === 'exhibition' ? (st === 'done' ? '<span class="stars">✓</span>' : '') : stars(p[n.id] ?? 0)}
        ${reward}
      </button>`;
  }).join('');

  return `
    <div class="map-head">
      <h2>Campaign</h2>
      <span class="tag">Pilot licence · ${total}/${MAX_STARS}★</span>
    </div>
    <div class="map-scroll"><div class="map" style="width:${w}px;height:${h}px">
      ${bands}
      <svg class="edges" width="${w}" height="${h}">${edges}</svg>
      ${nodes}
    </div></div>
    <div class="row"><button data-action="go" data-to="hangar">Hangar</button><button class="primary" data-action="go" data-to="main">Back</button></div>`;
}

/** The node the map should scroll to: the first open one, else the last completed one. */
export function focusNode(p: Progress): CampaignNode {
  return NODES.find((n) => nodeState(p, n) === 'open') ?? [...NODES].reverse().find((n) => nodeState(p, n) === 'done') ?? NODES[0];
}
export const nodeX = (n: CampaignNode) => PAD + n.col * COLW + COLW / 2;

export function renderBrief(n: CampaignNode, p: Progress, name: string, assist = 0): string {
  const TIERS = ['easy', 'medium', 'hard', 'insane'] as const;
  const shift = (t: (typeof TIERS)[number]) => TIERS[Math.max(0, Math.min(3, TIERS.indexOf(t) + assist))];
  const t = getTrack(n.track);
  const st = nodeState(p, n);
  let goal: string;
  if (n.kind === 'tt') {
    const [b, s, g] = ttTargets(n.track);
    goal = `Best lap over 3 laps:<br><span class="medal b"></span>Bronze ${formatTime(b)} <span class="medal s"></span>Silver ${formatTime(s)} <span class="medal g"></span>Gold ${formatTime(g)}`;
  } else if (n.kind === 'exhibition') {
    goal = 'One lap. No stars on the line, just pride.';
  } else {
    goal = `${n.kind === 'elim' ? `${n.field.length + 1} ships, one knocked out every lap.` : `${n.laps} laps, ${n.field.length + 1} ships.`}<br>1st ★★★ · 2nd ★★ · 3rd ★`;
  }
  const rival = n.boss ? char(n.boss) : null;
  const lineup = n.field.map((o) => {
    const c = char(o.who);
    return `<div class="pilot" style="--c:${hex(c.color)}">${portrait(c, 40)}<div><b>${esc(c.name)}</b><small>${esc(c.title)} · ${TIER_NAMES[shift(o.tier)]}</small></div></div>`;
  }).join('');
  return `
    <h2>${n.kind === 'exhibition' ? 'Season opener' : rival ? `Showdown: ${esc(rival.name)}` : KIND_LABEL[n.kind]}</h2>
    <div class="brief-body">
      <canvas width="240" height="160" data-preview="${t.def.id}"></canvas>
      <div>
        <p class="kind" style="--c:${hex(t.def.color)}">${KIND_LABEL[n.kind]} · ${t.def.name}</p>
        <p>${fill(n.brief, name)}</p>
        ${rival ? `<blockquote style="--c:${hex(rival.color)}">${portrait(rival, 44)}<span><b>${esc(rival.name)}:</b> “${esc(rival.taunt)}”</span></blockquote>` : ''}
        <p class="goal">${goal}</p>
        ${n.reward ? `<p class="unlock-note">Reward: <b>${HULLS.find((x) => x.id === n.reward)?.name}</b> hull</p>` : ''}
        ${n.kind !== 'exhibition' ? `<p>Your best: ${stars(p[n.id] ?? 0)}</p>` : ''}
      </div>
    </div>
    ${lineup ? `<div class="lineup">${lineup}</div>` : ''}
    <div class="row">
      <button data-action="go" data-to="campaign">Map</button>
      ${n.pre ? '<button data-action="story">Replay briefing</button>' : ''}
      <button class="primary" data-action="start-event" ${st === 'gated' || st === 'locked' ? 'disabled' : ''}>${st === 'gated' ? `Need ${n.gate}★` : 'Start'}</button>
    </div>`;
}

export function renderDialogue(lines: Line[], i: number, name: string): string {
  const line = lines[i];
  const c = line.who === 'you' ? null : char(line.who);
  const dots = lines.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
  return `
    <div class="dlg" data-action="next" style="--c:${hex(c?.color ?? 0x2ef2ff)}">
      ${c ? portrait(c, 116) : ''}
      <div class="speech">
        <b>${esc(c?.name ?? name)}</b><small>${esc(c?.title ?? 'You')}</small>
        <p>${fill(line.text, name)}</p>
      </div>
    </div>
    <div class="row dlg-row"><span class="dots">${dots}</span><button data-action="skip">Skip</button><button class="primary" data-action="next">${i === lines.length - 1 ? 'Continue' : 'Next'}</button></div>`;
}

export function renderCallsign(current: string): string {
  return `
    <h2>Pilot registration</h2>
    <div class="dlg static" style="--c:#3dff9a">
      ${portrait(char('wren'), 96)}
      <div class="speech"><b>Wren Okafor</b><small>Crew chief</small>
      <p>New licence, new pilot. What callsign do you want painted on the hull?</p></div>
    </div>
    <label class="field"><span>Callsign</span><input id="callsign" maxlength="14" value="${esc(current)}" placeholder="e.g. Comet"></label>
    <div class="row"><button data-action="go" data-to="main">Back</button><button class="primary" data-action="callsign">Register</button></div>`;
}

export function renderHangar(hull: string, color: number, unlocked: string[]): string {
  const owner: Record<string, string> = { needle: 'Beat Kite', hammer: 'Beat Rook', manta: 'Beat Halo', crescent: 'Win the title', falcon: 'Pro time trial medal', twin: 'Elite time trial medal' };
  return `
    <h2>Hangar</h2>
    <div class="hangar-preview"><canvas id="hangar-ship" width="360" height="200"></canvas></div>
    <div class="hulls">${HULLS.map((h) => {
      const open = unlocked.includes(h.id);
      return `<button class="hull ${h.id === hull ? 'sel' : ''}" data-action="${open ? 'hull' : ''}" data-id="${h.id}" ${open ? '' : 'disabled'}>
        <canvas width="96" height="64" data-hull="${h.id}"></canvas><b>${h.name}</b>${open ? '' : `<small>🔒 ${owner[h.id] ?? ''}</small>`}</button>`;
    }).join('')}</div>
    <div class="swatches">${PLAYER_COLORS.map((c) => `<button class="swatch ${c === color ? 'sel' : ''}" data-action="color" data-c="${c}" style="--c:${hex(c)}" aria-label="colour"></button>`).join('')}</div>
    <div class="row"><button class="primary" data-action="back-hangar">Done</button></div>`;
}

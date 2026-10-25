// Headless check: map widths, route-bot solvability and medal times for every puzzle level.
// Usage: npx tsx scripts/puzzles.ts [levelId] [svgOutDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { Level, TILE } from '../src/core/level';
import { LEVELS } from '../src/core/levels';
import { PuzzleRun, RouteBot } from '../src/core/puzzle';

const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2] : null;
const out = process.argv[3];
if (out) mkdirSync(out, { recursive: true });
for (const def of LEVELS) {
  if (only && def.id !== only) continue;
  const widths = new Set(def.map.map((r) => r.length));
  if (widths.size > 1) console.log(`  ! ${def.id} rows have different widths:`, def.map.map((r, i) => `${i}:${r.length}`).join(' '));
  const run = new PuzzleRun(def, { name: 'bot', color: 0, kind: 'human', slot: 0 }, 'thrust', new RouteBot(def.route));
  const trail: number[] = [];
  const log: string[] = [];
  while (run.state !== 'finished' && run.time < 240) {
    run.step([]);
    const s = run.me.ship;
    if (Math.round(run.time * 240) % 24 === 0) trail.push(s.x, s.y);
    for (const e of run.events) if (e.type !== 'go') log.push(`${run.time.toFixed(1)}:${e.type}${'id' in e ? e.id : ''}`);
    run.events.length = 0;
  }
  const bot = (run.autopilot as RouteBot);
  console.log(`${def.id} ${def.name.padEnd(16)} ${run.state === 'finished' ? `done ${run.finishedAt.toFixed(1)}s` : `STUCK at wp ${bot.index} (${(run.me.ship.x / TILE).toFixed(1)},${(run.me.ship.y / TILE).toFixed(1)})`} falls ${run.falls} | ${log.join(' ')}`);
  if (out) {
    const lv = run.course as Level;
    const w = lv.cols * TILE, h = lv.rows * TILE;
    const p: string[] = [`<rect width="${w}" height="${h}" fill="#05060b"/>`];
    for (let r = 0; r < lv.rows; r++) for (let c = 0; c < lv.cols; c++) {
      const ch = def.map[r][c];
      const col: Record<string, string> = { '#': '#1b2440', '~': '#ff3355', '_': '#556', i: '#9fe8ff55', m: '#8a5a2b', t: '#ffe14d55', f: '#ff3df255', A: '#ffe14d', B: '#2ef2ff', C: '#ff3df2', '=': '#fff', ':': '#fff5' };
      if (col[ch]) p.push(`<rect x="${c * TILE}" y="${r * TILE}" width="${TILE}" height="${TILE}" fill="${col[ch]}"/>`);
      if (/[a-zA-Z*+><^v~OXGS]/.test(ch) && !col[ch]) p.push(`<text x="${(c + 0.5) * TILE}" y="${(r + 0.65) * TILE}" fill="#fff" font-size="50" text-anchor="middle">${ch.replace('<', '&lt;').replace('>', '&gt;')}</text>`);
    }
    p.push(`<polyline points="${def.route.map(([c, r]) => `${(c + 0.5) * TILE},${(r + 0.5) * TILE}`).join(' ')}" fill="none" stroke="#3dff9a" stroke-width="6" stroke-dasharray="20 14"/>`);
    p.push(`<polyline points="${trail.map((v) => v.toFixed(0)).join(' ')}" fill="none" stroke="#ff3df2" stroke-width="5"/>`);
    writeFileSync(`${out}/${def.id}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${Math.min(880, w / 4)}">${p.join('')}</svg>`);
  }
}

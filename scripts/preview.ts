// Writes an SVG overview of every track (walls, racing line, fields, pads, lap-fraction ticks) to the given folder.
// Usage: npx tsx scripts/preview.ts <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { getTrack, TRACK_DEFS } from '../src/core/tracks';

const out = process.argv[2] ?? 'preview';
mkdirSync(out, { recursive: true });
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

for (const def of TRACK_DEFS) {
  const t = getTrack(def.id);
  const b = t.bounds;
  const pad = 300;
  const w = b.maxX - b.minX + pad * 2, h = b.maxY - b.minY + pad * 2;
  const poly = (xs: Float64Array, ys: Float64Array, step = 1) => {
    let s = '';
    for (let i = 0; i < t.n; i += step) s += `${xs[i].toFixed(0)},${ys[i].toFixed(0)} `;
    return s;
  };
  const parts: string[] = [];
  parts.push(`<rect x="${b.minX - pad}" y="${b.minY - pad}" width="${w}" height="${h}" fill="#05060b"/>`);
  for (const z of t.zones) {
    for (let i = z.i0; t.inRange(i, z.i0, z.i1); i = (i + 4) % t.n) {
      parts.push(`<line x1="${t.lx[i]}" y1="${t.ly[i]}" x2="${t.rx[i]}" y2="${t.ry[i]}" stroke="#3dff9a" stroke-opacity="0.35" stroke-width="20"/>`);
      if (z.i0 === z.i1) break;
    }
  }
  for (const wl of t.wells) {
    parts.push(`<circle cx="${wl.x}" cy="${wl.y}" r="${wl.radius}" fill="${wl.strength > 0 ? '#b06bff' : '#ff7a3d'}" fill-opacity="0.12"/>`);
  }
  parts.push(`<polygon points="${poly(t.lx, t.ly)}" fill="none" stroke="${hex(def.color)}" stroke-width="10"/>`);
  parts.push(`<polygon points="${poly(t.rx, t.ry)}" fill="none" stroke="${hex(def.accent)}" stroke-width="10"/>`);
  const lx = new Float64Array(t.n), ly = new Float64Array(t.n);
  for (let i = 0; i < t.n; i++) { lx[i] = t.cx[i] + t.nx[i] * t.lineOff[i]; ly[i] = t.cy[i] + t.ny[i] * t.lineOff[i]; }
  parts.push(`<polygon points="${poly(lx, ly)}" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="5" stroke-dasharray="30 30"/>`);
  const pts = (poly: number[]) => poly.map((v) => v.toFixed(0)).join(' ');
  const SC: Record<string, string> = { ice: '#9fe8ff', mud: '#8a5a2b', turbo: '#ffe14d', flip: '#ff3df2' };
  for (const sf of t.surfaces) parts.push(`<polygon points="${pts(sf.poly)}" fill="${SC[sf.kind]}" fill-opacity="0.5"/>`);
  for (const r of t.ramps) parts.push(`<polygon points="${pts(r.poly)}" fill="#fff" fill-opacity="0.7"/>`);
  for (const pit of t.pits) parts.push(`<polygon points="${pts(pit.poly)}" fill="#ff3355" fill-opacity="0.8"/>`);
  for (const pt of t.portals) parts.push(`<circle cx="${pt.ax}" cy="${pt.ay}" r="${pt.r}" fill="#5ad1ff"/><circle cx="${pt.bx}" cy="${pt.by}" r="${pt.r}" fill="none" stroke="#5ad1ff" stroke-width="12"/><line x1="${pt.ax}" y1="${pt.ay}" x2="${pt.bx}" y2="${pt.by}" stroke="#5ad1ff" stroke-dasharray="40 30" stroke-width="6"/>`);
  for (const h of t.hazards) parts.push(`<circle cx="${h.cx}" cy="${h.cy}" r="${h.len / 2}" fill="none" stroke="#ff3355" stroke-width="10" stroke-dasharray="20 20"/>`);
  for (const p of t.pads) {
    const i = p.i0;
    parts.push(`<circle cx="${t.cx[i] + t.nx[i] * p.lat}" cy="${t.cy[i] + t.ny[i] * p.lat}" r="40" fill="#ffe14d"/>`);
  }
  for (let f = 0; f < 1; f += 0.05) {
    const i = Math.round(f * t.n) % t.n;
    parts.push(`<text x="${t.cx[i]}" y="${t.cy[i]}" fill="#fff" font-size="110" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle">${f.toFixed(2).slice(1)}</text>`);
  }
  parts.push(`<line x1="${t.lx[0]}" y1="${t.ly[0]}" x2="${t.rx[0]}" y2="${t.ry[0]}" stroke="#fff" stroke-width="24"/>`);
  for (const c of t.clearanceIssues()) {
    parts.push(`<circle cx="${t.cx[c.i]}" cy="${t.cy[c.i]}" r="120" fill="none" stroke="red" stroke-width="30"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.minX - pad} ${b.minY - pad} ${w} ${h}" width="${Math.round((w / Math.max(w, h)) * 900)}" height="${Math.round((h / Math.max(w, h)) * 900)}">${parts.join('')}</svg>`;
  writeFileSync(`${out}/${def.id}.svg`, svg);
}
console.log('wrote', TRACK_DEFS.length, 'previews to', out);

import { Container, Graphics } from 'pixi.js';
import { hazardBars, type Course } from '../core/course';

export function chevron(g: Graphics, size: number, color: number, width = 4): Graphics {
  return g.moveTo(-size * 0.5, -size).lineTo(size * 0.5, 0).lineTo(-size * 0.5, size).stroke({ width, color, cap: 'round', join: 'round' });
}

const SURFACE_STYLE = {
  ice: { color: 0x9fe8ff, alpha: 0.13 },
  mud: { color: 0x8a5a2b, alpha: 0.4 },
  turbo: { color: 0xffe14d, alpha: 0.1 },
  flip: { color: 0xff3df2, alpha: 0.1 },
};

interface Pulse { g: Container; phase: number; base: number }
interface Ring { g: Graphics; t: number; inward: boolean }

/** Wells, surfaces, ramps, pits, portals, hazards and orbs for any course. */
export class GimmickLayer extends Container {
  private pulses: Pulse[] = [];
  private rings: Ring[] = [];
  private spinners: Graphics[] = [];
  private hazardG = new Graphics();
  private orbG = new Graphics();

  constructor(private course: Course) {
    super();
    const c = course;
    for (const s of c.surfaces) {
      const st = SURFACE_STYLE[s.kind];
      const g = new Graphics().poly(s.poly).fill(st).poly(s.poly).stroke({ width: 2, color: st.color, alpha: 0.35 });
      this.addChild(g);
      // Texture marks inside the region.
      const marks = new Graphics();
      const step = s.kind === 'mud' ? 17 : 28;
      for (let x = s.minX; x < s.maxX; x += step) {
        for (let y = s.minY; y < s.maxY; y += step) {
          const ox = x + ((y / step) % 2) * step * 0.5;
          if (!inPoly(s.poly, ox, y)) continue;
          if (s.kind === 'ice') marks.moveTo(ox - 4, y + 2).lineTo(ox + 4, y - 2).stroke({ width: 0.8, color: 0xffffff, alpha: 0.3 });
          else if (s.kind === 'mud') marks.circle(ox, y, 2).fill({ color: 0x3a240f, alpha: 0.7 });
          else if (s.kind === 'flip') {
            marks.moveTo(ox - 10, y).lineTo(ox + 10, y).stroke({ width: 2, color: 0xff3df2, alpha: 0.4 });
            marks.moveTo(ox - 10, y).lineTo(ox - 5, y - 5).moveTo(ox - 10, y).lineTo(ox - 5, y + 5).stroke({ width: 2, color: 0xff3df2, alpha: 0.4 });
            marks.moveTo(ox + 10, y).lineTo(ox + 5, y - 5).moveTo(ox + 10, y).lineTo(ox + 5, y + 5).stroke({ width: 2, color: 0xff3df2, alpha: 0.4 });
          } else marks.circle(ox, y, 1.5).fill({ color: 0xffe14d, alpha: 0.5 });
        }
      }
      if (s.kind === 'turbo' || s.kind === 'flip') {
        marks.blendMode = 'add';
        this.pulses.push({ g: marks, phase: s.minX / 200, base: 0.5 });
      }
      this.addChild(marks);
    }

    for (const p of c.pits) {
      const g = new Graphics()
        .poly(p.poly).fill({ color: 0x000000, alpha: 1 })
        .poly(p.poly).stroke({ width: 4, color: 0xff3355, alpha: 0.18 })
        .poly(p.poly).stroke({ width: 1.2, color: 0xff3355, alpha: 0.9 });
      this.addChild(g);
      const hatch = new Graphics();
      for (let x = p.minX; x < p.maxX; x += 13) {
        for (let y = p.minY; y < p.maxY; y += 13) {
          if (inPoly(p.poly, x, y)) hatch.circle(x, y, 0.8).fill({ color: 0xff3355, alpha: 0.25 });
        }
      }
      this.addChild(hatch);
    }

    for (const r of c.ramps) {
      const g = new Graphics().poly(r.poly).fill({ color: 0xffffff, alpha: 0.12 }).poly(r.poly).stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
      this.addChild(g);
      const cx = (r.minX + r.maxX) / 2, cy = (r.minY + r.maxY) / 2;
      const ang = Math.atan2(r.dy, r.dx);
      for (let k = -1; k <= 1; k++) {
        const ch = chevron(new Graphics(), 6, 0xffffff, 2);
        ch.position.set(cx + -r.dy * k * 17, cy + r.dx * k * 17);
        ch.rotation = ang;
        ch.blendMode = 'add';
        this.addChild(ch);
        this.pulses.push({ g: ch, phase: k, base: 0.3 });
      }
    }

    for (const w of c.wells) {
      const color = w.strength > 0 ? 0xb06bff : 0xff7a3d;
      const halo = new Graphics().circle(w.x, w.y, w.radius).fill({ color, alpha: 0.025 }).circle(w.x, w.y, w.radius).stroke({ width: 1, color, alpha: 0.12 });
      this.addChild(halo);
      const core = new Graphics()
        .circle(w.x, w.y, 17).fill({ color, alpha: 0.18 })
        .circle(w.x, w.y, 8).fill({ color, alpha: 0.7 })
        .circle(w.x, w.y, 3).fill({ color: 0xffffff });
      core.blendMode = 'add';
      this.addChild(core);
      for (let k = 0; k < 4; k++) {
        const g = new Graphics().circle(0, 0, w.radius).stroke({ width: 1.5, color, alpha: 1 });
        g.position.set(w.x, w.y);
        g.blendMode = 'add';
        this.addChild(g);
        this.rings.push({ g, t: k / 4, inward: w.strength > 0 });
      }
    }

    for (const p of c.portals) {
      for (const [x, y, entry] of [[p.ax, p.ay, true], [p.bx, p.by, p.twoWay]] as [number, number, boolean][]) {
        const base = new Graphics().circle(0, 0, p.r).fill({ color: p.color, alpha: entry ? 0.16 : 0.07 });
        base.position.set(x, y);
        this.addChild(base);
        const ring = new Graphics();
        for (let k = 0; k < 8; k++) {
          const a0 = (k / 8) * Math.PI * 2, a1 = a0 + 0.45;
          ring.moveTo(Math.cos(a0) * p.r, Math.sin(a0) * p.r).arc(0, 0, p.r, a0, a1).stroke({ width: entry ? 2.5 : 1.5, color: p.color, alpha: entry ? 1 : 0.55 });
          ring.moveTo(Math.cos(a1 + 0.33) * (p.r - 6), Math.sin(a1 + 0.33) * (p.r - 6));
        }
        ring.position.set(x, y);
        ring.blendMode = 'add';
        this.addChild(ring);
        this.spinners.push(ring);
      }
    }

    this.hazardG.blendMode = 'add';
    this.orbG.blendMode = 'add';
    this.addChild(this.hazardG, this.orbG);
  }

  animate(time: number): void {
    for (const p of this.pulses) p.g.alpha = p.base + 0.5 * Math.max(0, Math.sin(p.phase - time * 5)) ** 2;
    for (const r of this.rings) {
      let f = (r.t + time * 0.35) % 1;
      if (r.inward) f = 1 - f;
      r.g.scale.set(Math.max(0.01, f));
      r.g.alpha = 0.22 * Math.sin(f * Math.PI);
    }
    this.spinners.forEach((s, i) => { s.rotation = time * (i % 2 ? -1.6 : 1.6); });
    const g = this.hazardG.clear();
    for (const h of this.course.hazards) {
      for (const [ax, ay, bx, by] of hazardBars(h, this.course.time)) {
        g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 8, color: 0xff3355, alpha: 0.18, cap: 'round' });
        g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 2.5, color: 0xff5a6a, alpha: 1, cap: 'round' });
      }
      if (h.kind === 'spin') g.circle(h.cx, h.cy, 4.5).fill({ color: 0xffffff, alpha: 0.9 });
    }
    const o = this.orbG.clear();
    for (const orb of this.course.orbs) {
      if (orb.cooldown > 0) continue;
      const pulse = 1 + 0.25 * Math.sin(time * 6 + orb.x);
      o.circle(orb.x, orb.y, 9 * pulse).fill({ color: 0x3dff9a, alpha: 0.18 }).circle(orb.x, orb.y, 3.5).fill({ color: 0xb8ffd9 });
    }
  }
}

function inPoly(p: number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const yi = p[i + 1], yj = p[j + 1];
    if (yi > y !== yj > y && x < ((p[j] - p[i]) * (y - yi)) / (yj - yi) + p[i]) inside = !inside;
  }
  return inside;
}

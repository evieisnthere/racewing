import { Container, Graphics } from 'pixi.js';
import { keyColor, Level, TILE } from '../core/level';
import { mulberry32 } from '../core/math';

/** Static floor and walls for a puzzle level, plus animated keys, gates, switches, barriers, checkpoints and goal. */
export class LevelLayer extends Container {
  private dyn = new Graphics();
  private glow = new Graphics();

  constructor(private level: Level) {
    super();
    const lv = level;
    const color = lv.def.color;
    const rand = mulberry32(lv.cols * 31 + lv.rows);

    const stars = new Graphics();
    const pad = 450;
    for (let i = 0; i < 700; i++) {
      stars.circle(-pad + rand() * (lv.cols * TILE + pad * 2), -pad + rand() * (lv.rows * TILE + pad * 2), 0.4 + rand() * 0.8)
        .fill({ color: 0xffffff, alpha: 0.1 + rand() * 0.35 });
    }
    this.addChild(stars);

    const floor = new Graphics();
    for (const [c, r] of lv.floor) floor.rect(c * TILE, r * TILE, TILE, TILE);
    floor.fill({ color: 0x0a0e1a });
    for (const [c, r] of lv.floor) floor.circle(c * TILE, r * TILE, 0.8);
    floor.fill({ color, alpha: 0.25 });
    this.addChild(floor);

    const low = new Graphics();
    for (const [c, r] of lv.lowTiles) {
      low.rect(c * TILE + 3, r * TILE + 3, TILE - 6, TILE - 6).fill({ color: 0x1a2236 });
      for (let k = 0; k < 4; k++) low.moveTo(c * TILE + 5, r * TILE + 9 + k * 10).lineTo(c * TILE + TILE - 5, r * TILE + 9 + k * 10);
      low.stroke({ width: 1, color: 0x8fa3c9, alpha: 0.35 });
    }
    this.addChild(low);

    // Start pad and goal ring base.
    const start = new Graphics().circle(lv.start.x, lv.start.y, 20).stroke({ width: 1.5, color: 0xffffff, alpha: 0.35 });
    this.addChild(start);

    const walls = (width: number, alpha: number, lowOnly: boolean | null) => {
      const g = new Graphics();
      for (const s of lv.segments) {
        if (lowOnly !== null && !!s.low !== lowOnly) continue;
        g.moveTo(s.ax, s.ay).lineTo(s.bx, s.by);
      }
      g.stroke({ width, color: lowOnly ? 0x8fa3c9 : color, alpha, cap: 'round' });
      if (width > 2) g.blendMode = 'add';
      return g;
    };
    this.addChild(walls(9, 0.06, false), walls(4, 0.16, false), walls(1, 1, false), walls(1, 0.8, true));
    this.glow.blendMode = 'add';
    this.addChild(this.dyn, this.glow);
  }

  animate(time: number): void {
    const lv = this.level;
    const g = this.dyn.clear();
    const gl = this.glow.clear();

    for (const gate of lv.gates) {
      const x = gate.c * TILE, y = gate.r * TILE, col = keyColor(gate.id);
      if (lv.gateClosed(gate)) {
        g.rect(x + 2, y + 2, TILE - 4, TILE - 4).fill({ color: col, alpha: 0.28 }).rect(x + 2, y + 2, TILE - 4, TILE - 4).stroke({ width: 1.5, color: col });
        // Keyhole.
        g.circle(x + TILE / 2, y + TILE / 2 - 4, 4.5).fill({ color: 0x05060b }).rect(x + TILE / 2 - 2, y + TILE / 2 - 1, 4, 10).fill({ color: 0x05060b });
      } else {
        g.rect(x + 2, y + 2, TILE - 4, TILE - 4).stroke({ width: 0.8, color: col, alpha: 0.3 });
      }
    }
    for (const b of lv.barriers) {
      const x = b.c * TILE, y = b.r * TILE;
      if (lv.barrierClosed(b)) {
        g.rect(x + 2, y + 2, TILE - 4, TILE - 4).fill({ color: 0xffffff, alpha: 0.2 });
        for (let k = -2; k < 4; k++) g.moveTo(x + k * 12, y + TILE).lineTo(x + k * 12 + TILE, y);
        g.stroke({ width: 2.5, color: 0xffffff, alpha: 0.55 });
        g.rect(x + 1, y + 1, TILE - 2, TILE - 2).stroke({ width: 1.5, color: 0xffffff });
      } else {
        g.rect(x + 2, y + 2, TILE - 4, TILE - 4).stroke({ width: 0.8, color: 0xffffff, alpha: 0.25 });
      }
    }
    // Barrier tiles were drawn over the floor without masking, so clip the stripes visually by redrawing edges.
    for (const sw of lv.switches) {
      const on = sw.on;
      gl.circle(sw.x, sw.y, 15).fill({ color: on ? 0x3dff9a : 0xff5a6a, alpha: 0.18 });
      gl.circle(sw.x, sw.y, 10).stroke({ width: 2, color: on ? 0x3dff9a : 0xff5a6a });
      gl.circle(sw.x, sw.y, 4 + Math.sin(time * 4)).fill({ color: 0xffffff });
    }
    for (const k of lv.keys) {
      if (k.taken) continue;
      const col = keyColor(k.id);
      const bob = Math.sin(time * 3 + k.x) * 2;
      const a = time * 2;
      const pts: number[] = [];
      for (let i = 0; i < 4; i++) pts.push(k.x + Math.cos(a + (i * Math.PI) / 2) * 8, k.y + bob + Math.sin(a + (i * Math.PI) / 2) * 8);
      gl.circle(k.x, k.y + bob, 15).fill({ color: col, alpha: 0.15 });
      gl.poly(pts).fill({ color: col }).poly(pts).stroke({ width: 1, color: 0xffffff });
    }
    for (const cp of lv.checkpoints) {
      const col = cp.reached ? 0x3dff9a : 0x8fa3c9;
      g.circle(cp.x, cp.y, 17).stroke({ width: 1.5, color: col, alpha: 0.8 });
      g.moveTo(cp.x - 3, cp.y + 8).lineTo(cp.x - 3, cp.y - 9).stroke({ width: 1.5, color: 0xffffff });
      g.poly([cp.x - 3, cp.y - 9, cp.x + 8, cp.y - 5.5, cp.x - 3, cp.y - 2]).fill({ color: col });
    }
    const goal = lv.goal;
    const pulse = 1 + Math.sin(time * 4) * 0.08;
    for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * Math.PI * 2 + time * 0.8;
      const R = goal.r * pulse;
      gl.moveTo(goal.x + Math.cos(a0) * R, goal.y + Math.sin(a0) * R).arc(goal.x, goal.y, R, a0, a0 + 0.26).stroke({ width: 3, color: k % 2 ? 0xffffff : 0xffe14d });
    }
    gl.circle(goal.x, goal.y, goal.r * 0.55).fill({ color: 0xffe14d, alpha: 0.25 });
  }
}

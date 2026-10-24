import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { clamp, mulberry32 } from '../core/math';
import type { Race, Racer } from '../core/race';
import type { Track } from '../core/track';

export interface Pose { x: number; y: number; angle: number }

const FLOOR = 0x0a0e1a;

function closedPath(g: Graphics, xs: Float64Array, ys: Float64Array): Graphics {
  g.moveTo(xs[0], ys[0]);
  for (let i = 1; i < xs.length; i++) g.lineTo(xs[i], ys[i]);
  g.closePath();
  return g;
}

function glowWall(parent: Container, xs: Float64Array, ys: Float64Array, color: number): void {
  const layers: [number, number][] = [[22, 0.05], [10, 0.14], [4, 0.5], [1.8, 1]];
  for (const [width, alpha] of layers) {
    const g = closedPath(new Graphics(), xs, ys).stroke({ width, color, alpha, join: 'round' });
    if (width > 3) g.blendMode = 'add';
    parent.addChild(g);
  }
}

function chevron(g: Graphics, size: number, color: number, width = 4): Graphics {
  return g.moveTo(-size * 0.5, -size).lineTo(size * 0.5, 0).lineTo(-size * 0.5, size).stroke({ width, color, cap: 'round', join: 'round' });
}

interface Pulse { g: Container; phase: number; base: number }
interface Ring { g: Graphics; t: number; inward: boolean }

/** Static track art plus animated field markers. Built once per viewport. */
class TrackLayer extends Container {
  private pulses: Pulse[] = [];
  private rings: Ring[] = [];

  constructor(track: Track) {
    super();
    const d = track.def;
    const b = track.bounds;
    const rand = mulberry32(track.n);

    const stars = new Graphics();
    const pad = 1600;
    const count = Math.min(2500, Math.round(((b.maxX - b.minX + pad * 2) * (b.maxY - b.minY + pad * 2)) / 9000));
    for (let i = 0; i < count; i++) {
      stars.circle(b.minX - pad + rand() * (b.maxX - b.minX + pad * 2), b.minY - pad + rand() * (b.maxY - b.minY + pad * 2), 0.8 + rand() * 1.8)
        .fill({ color: rand() < 0.15 ? d.accent : 0xffffff, alpha: 0.12 + rand() * 0.4 });
    }
    this.addChild(stars);

    const n = track.n;
    const floor = new Graphics();
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      floor.poly([track.lx[i], track.ly[i], track.lx[k], track.ly[k], track.rx[k], track.ry[k], track.rx[i], track.ry[i]]);
    }
    floor.fill({ color: FLOOR });
    this.addChild(floor);

    const stripes = new Graphics();
    for (let i = 0; i < n; i += 5) {
      stripes.moveTo(track.lx[i], track.ly[i]).lineTo(track.rx[i], track.ry[i])
        .stroke({ width: i % 25 === 0 ? 3 : 1.5, color: d.color, alpha: i % 25 === 0 ? 0.12 : 0.05 });
    }
    this.addChild(stripes);

    for (const z of track.zones) {
      const tint = new Graphics();
      for (let i = z.i0; i !== z.i1; i = (i + 1) % n) {
        const k = (i + 1) % n;
        tint.poly([track.lx[i], track.ly[i], track.lx[k], track.ly[k], track.rx[k], track.ry[k], track.rx[i], track.ry[i]]);
      }
      tint.fill({ color: 0x3dff9a, alpha: 0.05 });
      this.addChild(tint);
      for (let i = z.i0; track.inRange(i, z.i0, z.i1); i = (i + 6) % n) {
        const hw = track.hw[i];
        const angle = Math.atan2(track.ty[i], track.tx[i]) + z.angle;
        const ux = Math.cos(angle), uy = Math.sin(angle);
        for (let lat = -hw + 35; lat <= hw - 35; lat += 55) {
          const x = track.cx[i] + track.nx[i] * lat, y = track.cy[i] + track.ny[i] * lat;
          const g = chevron(new Graphics(), 11, 0x3dff9a, 3.5);
          g.position.set(x, y);
          g.rotation = angle;
          g.blendMode = 'add';
          this.addChild(g);
          this.pulses.push({ g, phase: (x * ux + y * uy) / 90, base: 0.08 });
        }
        if (z.i0 === z.i1) break;
      }
    }

    for (const p of track.pads) {
      for (let i = p.i0, j = 0; track.inRange(i, p.i0, p.i1); i = (i + 2) % n, j++) {
        const x = track.cx[i] + track.nx[i] * p.lat, y = track.cy[i] + track.ny[i] * p.lat;
        const g = chevron(new Graphics(), p.halfWidth * 0.55, 0xffe14d, 5);
        g.position.set(x, y);
        g.rotation = Math.atan2(track.ty[i], track.tx[i]);
        g.blendMode = 'add';
        this.addChild(g);
        this.pulses.push({ g, phase: -j * 0.9, base: 0.25 });
        if (j > 40) break;
      }
    }

    for (const w of track.wells) {
      const color = w.strength > 0 ? 0xb06bff : 0xff7a3d;
      const halo = new Graphics().circle(w.x, w.y, w.radius).fill({ color, alpha: 0.025 }).circle(w.x, w.y, w.radius).stroke({ width: 2, color, alpha: 0.12 });
      this.addChild(halo);
      const core = new Graphics()
        .circle(w.x, w.y, 34).fill({ color, alpha: 0.18 })
        .circle(w.x, w.y, 16).fill({ color, alpha: 0.7 })
        .circle(w.x, w.y, 6).fill({ color: 0xffffff });
      core.blendMode = 'add';
      this.addChild(core);
      for (let k = 0; k < 4; k++) {
        const g = new Graphics().circle(0, 0, w.radius).stroke({ width: 3, color, alpha: 1 });
        g.position.set(w.x, w.y);
        g.blendMode = 'add';
        this.addChild(g);
        this.rings.push({ g, t: k / 4, inward: w.strength > 0 });
      }
    }

    // Start line: a checker strip across sample 0.
    const start = new Graphics();
    const cells = 10;
    for (let c = 0; c < cells; c++) {
      for (let row = 0; row < 2; row++) {
        const f0 = c / cells, f1 = (c + 1) / cells;
        const ax = track.lx[0] + (track.rx[0] - track.lx[0]) * f0, ay = track.ly[0] + (track.ry[0] - track.ly[0]) * f0;
        const bx = track.lx[0] + (track.rx[0] - track.lx[0]) * f1, by = track.ly[0] + (track.ry[0] - track.ly[0]) * f1;
        const ox = track.tx[0] * 10 * row, oy = track.ty[0] * 10 * row;
        start.poly([ax + ox, ay + oy, bx + ox, by + oy, bx + ox + track.tx[0] * 10, by + oy + track.ty[0] * 10, ax + ox + track.tx[0] * 10, ay + oy + track.ty[0] * 10])
          .fill({ color: 0xffffff, alpha: (c + row) % 2 ? 0.75 : 0.08 });
      }
    }
    this.addChild(start);

    glowWall(this, track.lx, track.ly, d.color);
    glowWall(this, track.rx, track.ry, d.accent);
  }

  animate(time: number): void {
    for (const p of this.pulses) p.g.alpha = p.base + 0.6 * Math.max(0, Math.sin(p.phase - time * 5)) ** 2;
    for (const r of this.rings) {
      let f = (r.t + time * 0.35) % 1;
      if (r.inward) f = 1 - f;
      r.g.scale.set(Math.max(0.01, f));
      r.g.alpha = 0.22 * Math.sin(f * Math.PI);
    }
  }
}

class ShipSprite extends Container {
  readonly flame = new Graphics();
  constructor(color: number, alpha = 1) {
    super();
    const glow = new Graphics().poly([20, 0, -13, -12, -7, 0, -13, 12]).fill({ color, alpha: 0.18 });
    glow.blendMode = 'add';
    this.flame.poly([-7, -4, -24, 0, -7, 4]).fill({ color: 0xffffff, alpha: 0.9 });
    this.flame.blendMode = 'add';
    const body = new Graphics().poly([14, 0, -9, -8, -5, 0, -9, 8]).fill({ color: 0x05060b }).poly([14, 0, -9, -8, -5, 0, -9, 8]).stroke({ width: 2.2, color, join: 'round' });
    this.addChild(glow, this.flame, body);
    this.alpha = alpha;
  }
}

interface Spark { s: Sprite; vx: number; vy: number; life: number; max: number }

export class View {
  readonly root = new Container();
  private world = new Container();
  private layer: TrackLayer;
  private ships: ShipSprite[] = [];
  private trails: { pts: number[]; g: Graphics }[] = [];
  private ghost: ShipSprite;
  private sparkLayer = new Container();
  private sparks: Spark[] = [];
  private free: Sprite[] = [];
  private mask = new Graphics();
  private minimap = new Container();
  private miniDots = new Graphics();
  private miniScale = 1;
  private miniOx = 0;
  private miniOy = 0;
  private w = 1;
  private h = 1;
  private camX: number;
  private camY: number;
  private zoom = 1;
  private shake = 0;
  private rand = mulberry32(7);

  constructor(private race: Race, readonly follow: Racer, private ghostPose: () => Pose | null) {
    this.layer = new TrackLayer(race.track);
    this.world.addChild(this.layer);
    const trailLayer = new Container();
    trailLayer.blendMode = 'add';
    this.world.addChild(trailLayer);
    this.ghost = new ShipSprite(0xffffff, 0.35);
    this.ghost.visible = false;
    this.world.addChild(this.ghost);
    for (const r of race.racers) {
      const g = new Graphics();
      trailLayer.addChild(g);
      this.trails.push({ pts: [], g });
      const s = new ShipSprite(r.spec.color);
      this.ships.push(s);
      this.world.addChild(s);
    }
    this.sparkLayer.blendMode = 'add';
    this.world.addChild(this.sparkLayer);
    this.root.addChild(this.world, this.minimap, this.mask);
    this.root.mask = this.mask;
    this.camX = follow.ship.x;
    this.camY = follow.ship.y;
    this.buildMinimap();
  }

  private buildMinimap(): void {
    const t = this.race.track;
    const b = t.bounds;
    const size = 130;
    this.miniScale = size / Math.max(b.maxX - b.minX, b.maxY - b.minY);
    this.miniOx = -b.minX * this.miniScale + (size - (b.maxX - b.minX) * this.miniScale) / 2;
    this.miniOy = -b.minY * this.miniScale + (size - (b.maxY - b.minY) * this.miniScale) / 2;
    const g = new Graphics();
    g.roundRect(-10, -10, size + 20, size + 20, 10).fill({ color: 0x000000, alpha: 0.35 });
    g.moveTo(t.cx[0] * this.miniScale + this.miniOx, t.cy[0] * this.miniScale + this.miniOy);
    for (let i = 4; i < t.n; i += 4) g.lineTo(t.cx[i] * this.miniScale + this.miniOx, t.cy[i] * this.miniScale + this.miniOy);
    g.closePath().stroke({ width: 3, color: t.def.color, alpha: 0.5 });
    this.minimap.addChild(g, this.miniDots);
  }

  layout(x: number, y: number, w: number, h: number): void {
    this.root.position.set(x, y);
    this.w = w; this.h = h;
    this.mask.clear().rect(0, 0, w, h).fill(0xffffff);
    const small = Math.min(w, h) < 500;
    this.minimap.scale.set(small ? 0.7 : 1);
    this.minimap.position.set(w - (small ? 110 : 155), small ? 70 : 80);
  }

  update(dt: number): void {
    const race = this.race;
    const time = Math.max(0, race.time) + 10;
    this.layer.animate(time);

    race.racers.forEach((r, i) => {
      const s = r.ship;
      const sp = this.ships[i];
      sp.position.set(s.x, s.y);
      sp.rotation = s.angle;
      sp.flame.visible = s.throttle > 0;
      sp.flame.scale.x = 0.6 + Math.random() * 0.5 + (s.boost > 0 || s.scrape > 0 ? 0.8 : 0);
      sp.flame.tint = s.boost > 0 ? 0xffe14d : s.scrape > 0 ? 0xff7a3d : r.spec.color;

      const trail = this.trails[i];
      const pts = trail.pts;
      const lx = pts[pts.length - 2], ly = pts[pts.length - 1];
      if (pts.length === 0 || (s.x - lx) ** 2 + (s.y - ly) ** 2 > 36) {
        pts.push(s.x - Math.cos(s.angle) * 8, s.y - Math.sin(s.angle) * 8);
        if (pts.length > 60) pts.splice(0, 2);
      }
      const g = trail.g.clear();
      const m = pts.length / 2;
      for (let k = 1; k < m; k++) {
        const f = k / m;
        g.moveTo(pts[k * 2 - 2], pts[k * 2 - 1]).lineTo(pts[k * 2], pts[k * 2 + 1])
          .stroke({ width: 1 + f * 5, color: r.spec.color, alpha: f * 0.45, cap: 'round' });
      }

      if (s.scrape > 0) {
        for (let k = 0; k < 2; k++) {
          this.spark(s.scrapeX, s.scrapeY,
            s.vx * 0.15 + s.scrapeNx * (60 + this.rand() * 220) + (this.rand() - 0.5) * 160,
            s.vy * 0.15 + s.scrapeNy * (60 + this.rand() * 220) + (this.rand() - 0.5) * 160,
            this.rand() < 0.5 ? 0xffe14d : 0xff7a3d, 0.25 + this.rand() * 0.2);
        }
      }
      if (s.hit > 250) {
        const count = Math.min(24, Math.round(s.hit / 30));
        for (let k = 0; k < count; k++) {
          const a = this.rand() * Math.PI * 2, v = 80 + this.rand() * s.hit * 0.6;
          this.spark(s.hitX, s.hitY, Math.cos(a) * v, Math.sin(a) * v, r.spec.color, 0.35 + this.rand() * 0.3);
        }
        if (r === this.follow) this.shake = Math.min(14, s.hit / 60);
        s.hit = 0;
      }
      if (s.boost > 0.55) {
        for (let k = 0; k < 3; k++) {
          this.spark(s.x, s.y, -s.vx * 0.3 + (this.rand() - 0.5) * 200, -s.vy * 0.3 + (this.rand() - 0.5) * 200, 0xffe14d, 0.4);
        }
      }
    });

    const gp = this.ghostPose();
    this.ghost.visible = !!gp;
    if (gp) { this.ghost.position.set(gp.x, gp.y); this.ghost.rotation = gp.angle; }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        this.free.push(p.s);
        this.sparks[i] = this.sparks[this.sparks.length - 1];
        this.sparks.pop();
        continue;
      }
      p.vx *= Math.exp(-3 * dt); p.vy *= Math.exp(-3 * dt);
      p.s.x += p.vx * dt; p.s.y += p.vy * dt;
      p.s.alpha = p.life / p.max;
      p.s.rotation = Math.atan2(p.vy, p.vx);
      p.s.width = 2 + Math.hypot(p.vx, p.vy) * 0.03;
    }

    // Camera: lead the ship, zoom out with speed.
    const s = this.follow.ship;
    const speed = Math.hypot(s.vx, s.vy);
    const base = Math.min(this.w, this.h) / 720;
    const targetZoom = base * clamp(1.25 - speed / 1700, 0.62, 1.25);
    this.zoom += (targetZoom - this.zoom) * (1 - Math.exp(-2.2 * dt));
    const tx = s.x + s.vx * 0.3, ty = s.y + s.vy * 0.3;
    const k = 1 - Math.exp(-7 * dt);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    this.shake *= Math.exp(-10 * dt);
    const jx = (this.rand() - 0.5) * this.shake, jy = (this.rand() - 0.5) * this.shake;
    this.world.scale.set(this.zoom);
    this.world.position.set(this.w / 2 - this.camX * this.zoom + jx, this.h / 2 - this.camY * this.zoom + jy);

    const md = this.miniDots.clear();
    for (const r of race.racers) {
      const big = r === this.follow;
      md.circle(r.ship.x * this.miniScale + this.miniOx, r.ship.y * this.miniScale + this.miniOy, big ? 5 : 3.2)
        .fill({ color: r.spec.color });
      if (big) md.circle(r.ship.x * this.miniScale + this.miniOx, r.ship.y * this.miniScale + this.miniOy, 8).stroke({ width: 1.5, color: 0xffffff, alpha: 0.8 });
    }
  }

  private spark(x: number, y: number, vx: number, vy: number, color: number, life: number): void {
    if (this.sparks.length > 500) return;
    let s = this.free.pop();
    if (!s) {
      s = new Sprite(Texture.WHITE);
      s.anchor.set(0.5);
      this.sparkLayer.addChild(s);
    }
    s.visible = true;
    s.position.set(x, y);
    s.height = 1.8;
    s.tint = color;
    this.sparks.push({ s, vx, vy, life, max: life });
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

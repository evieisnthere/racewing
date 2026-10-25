import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { clamp, mulberry32 } from '../core/math';
import type { Course } from '../core/course';
import { PHYS } from '../core/physics';
import type { Racer } from '../core/race';
import { Track } from '../core/track';
import { chevron, GimmickLayer } from './gimmicks';
import { hullById, type Hull } from '../core/ships';

export interface Pose { x: number; y: number; angle: number }

const FLOOR = 0x0a0e1a;

function closedPath(g: Graphics, xs: Float64Array, ys: Float64Array): Graphics {
  g.moveTo(xs[0], ys[0]);
  for (let i = 1; i < xs.length; i++) g.lineTo(xs[i], ys[i]);
  g.closePath();
  return g;
}

function glowWall(parent: Container, xs: Float64Array, ys: Float64Array, color: number): void {
  const layers: [number, number][] = [[10, 0.06], [4.5, 0.16], [2, 0.55], [1, 1]];
  for (const [width, alpha] of layers) {
    const g = closedPath(new Graphics(), xs, ys).stroke({ width, color, alpha, join: 'round' });
    if (width > 3) g.blendMode = 'add';
    parent.addChild(g);
  }
}


interface Pulse { g: Container; phase: number; base: number }

/** A course's static art; animated once per frame. */
export type BaseLayer = Container & { animate(time: number): void };

/** What a View draws: a course, its racers and the clock. */
export interface Scene { course: Course; racers: Racer[]; time: number }

/** Static track art plus animated field markers. Built once per viewport. */
class TrackLayer extends Container {
  private pulses: Pulse[] = [];

  constructor(track: Track) {
    super();
    const d = track.def;
    const b = track.bounds;
    const rand = mulberry32(track.n);

    const stars = new Graphics();
    const pad = 700;
    const count = Math.min(2500, Math.round(((b.maxX - b.minX + pad * 2) * (b.maxY - b.minY + pad * 2)) / 2500));
    for (let i = 0; i < count; i++) {
      stars.circle(b.minX - pad + rand() * (b.maxX - b.minX + pad * 2), b.minY - pad + rand() * (b.maxY - b.minY + pad * 2), 0.4 + rand() * 0.9)
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
        .stroke({ width: i % 25 === 0 ? 1.4 : 0.7, color: d.color, alpha: i % 25 === 0 ? 0.14 : 0.06 });
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
        for (let lat = -hw + 18; lat <= hw - 18; lat += 30) {
          const x = track.cx[i] + track.nx[i] * lat, y = track.cy[i] + track.ny[i] * lat;
          const g = chevron(new Graphics(), 6, 0x3dff9a, 2);
          g.position.set(x, y);
          g.rotation = angle;
          g.blendMode = 'add';
          this.addChild(g);
          this.pulses.push({ g, phase: (x * ux + y * uy) / 45, base: 0.08 });
        }
        if (z.i0 === z.i1) break;
      }
    }

    for (const p of track.pads) {
      for (let i = p.i0, j = 0; track.inRange(i, p.i0, p.i1); i = (i + 2) % n, j++) {
        const x = track.cx[i] + track.nx[i] * p.lat, y = track.cy[i] + track.ny[i] * p.lat;
        const g = chevron(new Graphics(), p.halfWidth * 0.55, 0xffe14d, 2.5);
        g.position.set(x, y);
        g.rotation = Math.atan2(track.ty[i], track.tx[i]);
        g.blendMode = 'add';
        this.addChild(g);
        this.pulses.push({ g, phase: -j * 0.9, base: 0.25 });
        if (j > 40) break;
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
        const ox = track.tx[0] * 5 * row, oy = track.ty[0] * 5 * row;
        start.poly([ax + ox, ay + oy, bx + ox, by + oy, bx + ox + track.tx[0] * 5, by + oy + track.ty[0] * 5, ax + ox + track.tx[0] * 5, ay + oy + track.ty[0] * 5])
          .fill({ color: 0xffffff, alpha: (c + row) % 2 ? 0.75 : 0.08 });
      }
    }
    this.addChild(start);

    glowWall(this, track.lx, track.ly, d.color);
    glowWall(this, track.rx, track.ry, d.accent);
  }

  animate(time: number): void {
    for (const p of this.pulses) p.g.alpha = p.base + 0.6 * Math.max(0, Math.sin(p.phase - time * 5)) ** 2;
  }
}

class ShipSprite extends Container {
  readonly flames: Graphics[] = [];
  private shade: Graphics;
  constructor(hull: Hull, color: number, alpha = 1) {
    super();
    const scale = 1;
    const sc = (pts: number[]) => pts.map((v) => v * scale);
    this.shade = new Graphics().poly(sc(hull.body)).fill({ color: 0x000000, alpha: 0.55 });
    this.shade.visible = false;
    this.addChild(this.shade);
    const glow = new Graphics().poly(sc(hull.body)).stroke({ width: 7, color, alpha: 0.16, join: 'round' });
    glow.blendMode = 'add';
    this.addChild(glow);
    for (const [x, y] of hull.engines) {
      const f = new Graphics().poly([0, -2.6, -18, 0, 0, 2.6]).fill({ color: 0xffffff, alpha: 0.9 });
      f.position.set(x * scale, y * scale);
      f.blendMode = 'add';
      this.flames.push(f);
      this.addChild(f);
    }
    const body = new Graphics().poly(sc(hull.body)).fill({ color: 0x070912 }).poly(sc(hull.body)).stroke({ width: 1.8, color, join: 'round' });
    for (const d of hull.details) body.moveTo(d[0] * scale, d[1] * scale).lineTo(d[2] * scale, d[3] * scale).stroke({ width: 1, color, alpha: 0.5 });
    body.poly(sc(hull.cockpit)).fill({ color, alpha: 0.9 });
    this.addChild(body);
    this.alpha = alpha;
  }

  /** Drop shadow while airborne (h = 0..1 height). */
  shadow(h: number): void {
    this.shade.visible = h > 0.01;
    if (!this.shade.visible) return;
    // Offset down-right in world space, compensating for the ship's own rotation and scale.
    const d = 4 + h * 18, a = -this.rotation;
    this.shade.position.set((Math.cos(a) * d - Math.sin(a) * d) / this.scale.x, (Math.sin(a) * d + Math.cos(a) * d) / this.scale.x);
    this.shade.scale.set(1 / this.scale.x);
  }

  flame(on: boolean, len: number, tint: number): void {
    for (const f of this.flames) {
      f.visible = on;
      f.scale.x = len;
      f.tint = tint;
    }
  }
}

interface Spark { s: Sprite; vx: number; vy: number; life: number; max: number; len?: number }
interface Ring { x: number; y: number; r0: number; r1: number; life: number; max: number; color: number; width: number }
interface Scorch { ax: number; ay: number; bx: number; by: number; life: number }
/** Per-racer state from the previous frame, for edge-triggered effects. */
interface Prev { air: number; boost: number; lap: number; sx: number; sy: number; scraping: boolean }

export class View {
  readonly root = new Container();
  private world = new Container();
  private layer: BaseLayer;
  private gimmicks: GimmickLayer;
  private ships: ShipSprite[] = [];
  private trails: { pts: number[]; g: Graphics }[] = [];
  private tails = new Graphics();
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
  /** Brief zoom-out kick on boosts and launches. */
  private punch = 0;
  private rand = mulberry32(7);
  private fx = new Graphics();
  private glow = new Graphics();
  private rings: Ring[] = [];
  private scorch: Scorch[] = [];
  private prev: Prev[] = [];
  private stars = new Container();
  private starSprites: Sprite[] = [];
  private starPts: number[] = [];
  private startFlash = 0;

  constructor(private race: Scene, readonly follow: Racer, private ghostPose: () => Pose | null, base?: BaseLayer) {
    this.layer = base ?? new TrackLayer(race.course as Track);
    this.gimmicks = new GimmickLayer(race.course);
    this.world.addChild(this.layer, this.gimmicks);
    const trailLayer = new Container();
    trailLayer.blendMode = 'add';
    this.world.addChild(trailLayer);
    this.ghost = new ShipSprite(hullById(follow.spec.hull ?? 'dart'), 0xffffff, 0.35);
    this.ghost.visible = false;
    this.world.addChild(this.ghost);
    this.world.addChild(this.tails);
    for (const r of race.racers) {
      const g = new Graphics();
      trailLayer.addChild(g);
      this.trails.push({ pts: [], g });
      const s = new ShipSprite(hullById(r.spec.hull ?? 'dart'), r.spec.color);
      this.ships.push(s);
      this.world.addChild(s);
    }
    this.sparkLayer.blendMode = 'add';
    this.fx.blendMode = 'add';
    this.glow.blendMode = 'add';
    // Wall glow and scorch marks sit under the ships; rings and sparks over them.
    this.world.addChildAt(this.glow, 2);
    this.world.addChild(this.sparkLayer, this.fx);
    // Screen-space parallax stars behind everything.
    const sr = mulberry32(99);
    for (let i = 0; i < 140; i++) {
      const depth = sr() < 0.6 ? 0.08 : 0.2;
      this.starPts.push(sr(), sr(), depth, 0.3 + sr() * 0.9);
      const sp = new Sprite(Texture.WHITE);
      sp.anchor.set(0.5);
      sp.width = sp.height = depth > 0.1 ? 2.2 : 1.3;
      sp.alpha = this.starPts[this.starPts.length - 1] * (depth > 0.1 ? 0.6 : 0.35);
      this.stars.addChild(sp);
      this.starSprites.push(sp);
    }
    this.root.addChild(this.stars, this.world, this.minimap, this.mask);
    for (const r of race.racers) this.prev.push({ air: 0, boost: 0, lap: r.lap, sx: NaN, sy: NaN, scraping: false });
    this.root.mask = this.mask;
    this.camX = follow.ship.x;
    this.camY = follow.ship.y;
    this.buildMinimap();
  }

  private buildMinimap(): void {
    const course = this.race.course;
    const b = course.bounds;
    const size = 130;
    this.miniScale = size / Math.max(b.maxX - b.minX, b.maxY - b.minY);
    this.miniOx = -b.minX * this.miniScale + (size - (b.maxX - b.minX) * this.miniScale) / 2;
    this.miniOy = -b.minY * this.miniScale + (size - (b.maxY - b.minY) * this.miniScale) / 2;
    const g = new Graphics();
    g.roundRect(-10, -10, size + 20, size + 20, 10).fill({ color: 0x000000, alpha: 0.35 });
    const X = (x: number) => x * this.miniScale + this.miniOx, Y = (y: number) => y * this.miniScale + this.miniOy;
    if (course instanceof Track) {
      g.moveTo(X(course.cx[0]), Y(course.cy[0]));
      for (let i = 4; i < course.n; i += 4) g.lineTo(X(course.cx[i]), Y(course.cy[i]));
      g.closePath().stroke({ width: 3, color: course.def.color, alpha: 0.5 });
    } else {
      for (const sg of course.segments) g.moveTo(X(sg.ax), Y(sg.ay)).lineTo(X(sg.bx), Y(sg.by));
      g.stroke({ width: 1.5, color: 0x2ef2ff, alpha: 0.6 });
    }
    this.minimap.addChild(g, this.miniDots);
  }

  /** Snake tails: tapered beads from the ship back to the tip, brighter where the tail is swinging fast. */
  private drawTails(): void {
    const g = this.tails.clear();
    for (const r of this.race.racers) {
      const t = r.tail;
      if (!t || r.out || r.ship.fall > 0) continue;
      const c = r.spec.color;
      g.moveTo(t.xs[0], t.ys[0]);
      for (let k = 1; k < t.n; k++) g.lineTo(t.xs[k], t.ys[k]);
      g.stroke({ width: 2, color: c, alpha: 0.5, cap: 'round', join: 'round' });
      for (let k = 1; k < t.n; k++) {
        const f = 1 - k / t.n;
        const sp = Math.hypot(t.xs[k] - t.pxs[k], t.ys[k] - t.pys[k]) * 240;
        const hot = Math.min(1, sp / 400);
        g.circle(t.xs[k], t.ys[k], 1.6 + f * 3).fill({ color: hot > 0.5 ? 0xffffff : c, alpha: 0.55 + hot * 0.45 });
      }
    }
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
    this.gimmicks.animate(time);

    race.racers.forEach((r, i) => {
      const s = r.ship;
      const sp = this.ships[i];
      if (r.out) {
        sp.visible = false;
        this.trails[i].g.clear();
        return;
      }
      sp.position.set(s.x, s.y);
      sp.rotation = s.angle;
      // Airborne ships swell toward the camera; falling ones shrink into the pit.
      const airF = s.air > 0 && s.airMax > 0 ? Math.sin(Math.PI * (1 - s.air / s.airMax)) : 0;
      const fallF = s.fall > 0 ? s.fall / PHYS.fallTime : 1;
      sp.scale.set((1 + airF * 0.7) * fallF);
      sp.alpha = s.fall > 0 ? fallF : r.shield > 0 ? 0.35 + 0.4 * (Math.sin(time * 30) > 0 ? 1 : 0) : 1;
      sp.shadow(airF);
      sp.flame(s.throttle > 0 || s.scrape > 0, 0.6 + Math.random() * 0.5 + (s.boost > 0 || s.scrape > 0 ? 0.8 : 0),
        s.boost > 0 ? 0xffe14d : s.scrape > 0 ? 0xff7a3d : r.spec.color);

      const pv = this.prev[i];
      const me = r === this.follow;
      if (s.air > 0 && pv.air <= 0) { this.ring(s.x, s.y, 8, 46, 0.45, 0xffffff, 2); if (me) this.punch = Math.max(this.punch, 0.08); }
      if (s.air <= 0 && pv.air > 0 && s.fall <= 0) {
        this.ring(s.x, s.y, 6, 34, 0.35, r.spec.color, 2.5);
        for (let k = 0; k < 10; k++) { const a = this.rand() * Math.PI * 2; this.spark(s.x, s.y, Math.cos(a) * 90, Math.sin(a) * 90, 0xffffff, 0.3); }
        if (me) this.shake = Math.max(this.shake, 3);
      }
      if (s.boost > 0.55 && pv.boost <= 0.55) { this.ring(s.x, s.y, 10, 60, 0.5, 0xffe14d, 3); if (me) this.punch = Math.max(this.punch, 0.1); }
      if (me && r.lap > pv.lap && r.lap >= 1) { this.ring(s.x, s.y, 8, 55, 0.6, r.spec.color, 2.5); this.startFlash = 1; }
      // Scorch the wall where we grind.
      if (s.scrape > 0) {
        if (pv.scraping && Math.hypot(s.scrapeX - pv.sx, s.scrapeY - pv.sy) < 30) this.scorch.push({ ax: pv.sx, ay: pv.sy, bx: s.scrapeX, by: s.scrapeY, life: 1.4 });
        pv.sx = s.scrapeX; pv.sy = s.scrapeY;
      }
      pv.scraping = s.scrape > 0;
      pv.air = s.air; pv.boost = s.boost; pv.lap = r.lap;

      const trail = this.trails[i];
      const pts = trail.pts;
      if (s.warped > 0.3 || s.fall > 0) pts.length = 0;
      if (s.warped > 0.33) {
        this.ring(s.x, s.y, 4, 50, 0.45, 0x5ad1ff, 2.5);
        for (let k = 0; k < 18; k++) {
          const a = this.rand() * Math.PI * 2, v = 30 + this.rand() * 130;
          this.spark(s.x, s.y, Math.cos(a) * v, Math.sin(a) * v, 0x5ad1ff, 0.4);
        }
        s.warped = 0.3;
      }
      const lx = pts[pts.length - 2], ly = pts[pts.length - 1];
      if (pts.length === 0 || (s.x - lx) ** 2 + (s.y - ly) ** 2 > 9) {
        pts.push(s.x - Math.cos(s.angle) * 8, s.y - Math.sin(s.angle) * 8);
        if (pts.length > 80) pts.splice(0, 2);
      }
      // Trail in 5 fading bands: one stroke per band keeps this cheap.
      const g = trail.g.clear();
      const m = pts.length / 2;
      const BANDS = 5;
      for (let band = 0; band < BANDS; band++) {
        const k0 = Math.max(1, Math.floor((band / BANDS) * m)), k1 = Math.floor(((band + 1) / BANDS) * m);
        if (k1 <= k0) continue;
        g.moveTo(pts[k0 * 2 - 2], pts[k0 * 2 - 1]);
        for (let k = k0; k < k1; k++) g.lineTo(pts[k * 2], pts[k * 2 + 1]);
        const f = (band + 1) / BANDS;
        g.stroke({ width: 0.6 + f * 2.6, color: r.spec.color, alpha: f * 0.45, cap: 'round', join: 'round' });
      }

      if (s.scrape > 0) {
        for (let k = 0; k < 2; k++) {
          this.spark(s.scrapeX, s.scrapeY,
            s.vx * 0.2 + s.scrapeNx * (30 + this.rand() * 110) + (this.rand() - 0.5) * 80,
            s.vy * 0.2 + s.scrapeNy * (30 + this.rand() * 110) + (this.rand() - 0.5) * 80,
            this.rand() < 0.5 ? 0xffe14d : 0xff7a3d, 0.25 + this.rand() * 0.2);
        }
      }
      if (s.hit > 120) {
        const count = Math.min(24, Math.round(s.hit / 15));
        for (let k = 0; k < count; k++) {
          const a = this.rand() * Math.PI * 2, v = 40 + this.rand() * s.hit * 0.6;
          this.spark(s.hitX, s.hitY, Math.cos(a) * v, Math.sin(a) * v, r.spec.color, 0.35 + this.rand() * 0.3);
        }
        this.ring(s.hitX, s.hitY, 3, 10 + s.hit * 0.08, 0.3, 0xffffff, 1.5);
        if (r === this.follow) this.shake = Math.min(6, s.hit / 60);
        s.hit = 0;
      }
      if (s.boost > 0.55) {
        for (let k = 0; k < 3; k++) {
          this.spark(s.x, s.y, -s.vx * 0.3 + (this.rand() - 0.5) * 100, -s.vy * 0.3 + (this.rand() - 0.5) * 100, 0xffe14d, 0.4);
        }
      }
    });

    this.drawTails();

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
      p.s.rotation = Math.atan2(p.vy, p.vx);
      if (p.len !== undefined) {
        // Speed streak: fixed in the world, fades in and out.
        const f = p.life / p.max;
        p.s.alpha = Math.sin(f * Math.PI) * 0.35;
        p.s.width = p.len;
        continue;
      }
      p.vx *= Math.exp(-3 * dt); p.vy *= Math.exp(-3 * dt);
      p.s.x += p.vx * dt; p.s.y += p.vy * dt;
      p.s.alpha = p.life / p.max;
      p.s.width = 1 + Math.hypot(p.vx, p.vy) * 0.03;
    }

    // Camera: lead the ship, zoom out with speed.
    const s = this.follow.ship;
    const speed = Math.hypot(s.vx, s.vy);
    // About 8 ships across the shorter screen edge.
    const base = Math.min(this.w, this.h) / 235;
    const targetZoom = base * clamp(1.12 - speed / 1500, 0.78, 1.12);
    this.zoom += (targetZoom - this.zoom) * (1 - Math.exp(-2.2 * dt));
    this.punch *= Math.exp(-4 * dt);
    const tx = s.x + s.vx * 0.22, ty = s.y + s.vy * 0.22;
    const k = 1 - Math.exp(-7 * dt);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    this.shake *= Math.exp(-10 * dt);
    const jx = (this.rand() - 0.5) * this.shake, jy = (this.rand() - 0.5) * this.shake;
    const z = this.zoom * (1 - this.punch);
    this.world.scale.set(z);
    this.world.position.set(this.w / 2 - this.camX * z + jx, this.h / 2 - this.camY * z + jy);
    this.drawFx(dt, speed, z);

    const md = this.miniDots.clear();
    for (const r of race.racers) {
      const big = r === this.follow;
      md.circle(r.ship.x * this.miniScale + this.miniOx, r.ship.y * this.miniScale + this.miniOy, big ? 5 : 3.2)
        .fill({ color: r.spec.color });
      if (big) md.circle(r.ship.x * this.miniScale + this.miniOx, r.ship.y * this.miniScale + this.miniOy, 8).stroke({ width: 1.5, color: 0xffffff, alpha: 0.8 });
    }
  }

  private ring(x: number, y: number, r0: number, r1: number, life: number, color: number, width: number): void {
    if (this.rings.length < 60) this.rings.push({ x, y, r0, r1, life, max: life, color, width });
  }

  /** Wall glow near ships, grind scorch marks, rings, speed streaks and parallax stars. */
  private drawFx(dt: number, speed: number, z: number): void {
    const course = this.race.course;
    const g = this.glow.clear();
    // Neon walls brighten as ships pass close to them.
    const halfW = this.w / 2 / z + 60, halfH = this.h / 2 / z + 60;
    const glowPaths: number[][] = [];
    for (const r of this.race.racers) {
      const s = r.ship;
      if (r.out || Math.abs(s.x - this.camX) > halfW || Math.abs(s.y - this.camY) > halfH) continue;
      for (const id of course.query(s.x, s.y)) {
        const sg = course.segments[id];
        const ex = sg.bx - sg.ax, ey = sg.by - sg.ay;
        const l2 = ex * ex + ey * ey || 1;
        const t = clamp(((s.x - sg.ax) * ex + (s.y - sg.ay) * ey) / l2, 0, 1);
        const d = Math.hypot(s.x - sg.ax - ex * t, s.y - sg.ay - ey * t);
        if (d > 42) continue;
        // Long level walls: only light the stretch beside the ship.
        const len = Math.sqrt(l2), half = Math.min(1, 24 / len);
        const t0 = Math.max(0, t - half), t1 = Math.min(1, t + half);
        const a = (1 - d / 42) * (s.scrape > 0 && r === this.follow ? 1 : 0.6);
        const bucket = a > 0.6 ? 2 : a > 0.3 ? 1 : 0;
        (glowPaths[bucket] ??= []).push(sg.ax + ex * t0, sg.ay + ey * t0, sg.ax + ex * t1, sg.ay + ey * t1);
      }
      glowPaths.forEach((segs, bucket) => {
        if (!segs?.length) return;
        for (let k = 0; k < segs.length; k += 4) g.moveTo(segs[k], segs[k + 1]).lineTo(segs[k + 2], segs[k + 3]);
        g.stroke({ width: 3.5, color: r.spec.color, alpha: [0.15, 0.35, 0.6][bucket], cap: 'round' });
      });
      glowPaths.length = 0;
    }
    const bands: number[][] = [[], [], [], []];
    for (let i = this.scorch.length - 1; i >= 0; i--) {
      const sc = this.scorch[i];
      sc.life -= dt;
      if (sc.life <= 0) { this.scorch[i] = this.scorch[this.scorch.length - 1]; this.scorch.pop(); continue; }
      bands[Math.min(3, Math.floor((sc.life / 1.4) * 4))].push(sc.ax, sc.ay, sc.bx, sc.by);
    }
    bands.forEach((segs, band) => {
      if (!segs.length) return;
      for (let k = 0; k < segs.length; k += 4) g.moveTo(segs[k], segs[k + 1]).lineTo(segs[k + 2], segs[k + 3]);
      const f = (band + 1) / 4;
      g.stroke({ width: 1 + f * 3, color: f > 0.6 ? 0xffe14d : 0xff7a3d, alpha: f * 0.9, cap: 'round' });
    });
    if (this.scorch.length > 400) this.scorch.splice(0, this.scorch.length - 400);

    const fx = this.fx.clear();
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const rg = this.rings[i];
      rg.life -= dt;
      if (rg.life <= 0) { this.rings[i] = this.rings[this.rings.length - 1]; this.rings.pop(); continue; }
      const f = 1 - rg.life / rg.max;
      const rad = rg.r0 + (rg.r1 - rg.r0) * (1 - (1 - f) ** 3);
      fx.circle(rg.x, rg.y, rad).stroke({ width: rg.width * (1 - f * 0.6), color: rg.color, alpha: (1 - f) * 0.8 });
    }
    if (this.startFlash > 0 && course instanceof Track) {
      this.startFlash -= dt * 1.6;
      fx.moveTo(course.lx[0], course.ly[0]).lineTo(course.rx[0], course.ry[0]).stroke({ width: 8 * this.startFlash, color: 0xffffff, alpha: this.startFlash });
    }

    // Speed streaks once you're moving fast.
    const s = this.follow.ship;
    if (speed > 300 && s.fall <= 0) {
      const n = Math.min(4, Math.floor((speed - 300) / 70) + 1);
      for (let k = 0; k < n; k++) {
        const x = this.camX + (this.rand() - 0.5) * halfW * 2, y = this.camY + (this.rand() - 0.5) * halfH * 2;
        this.streak(x, y, s.vx, s.vy, 10 + (speed - 300) * 0.12);
      }
    }

    // Parallax stars (screen space): two depths drifting against the camera.
    const W = this.w, H = this.h;
    for (let i = 0; i < this.starPts.length; i += 4) {
      const depth = this.starPts[i + 2];
      this.starSprites[i / 4].position.set(
        ((this.starPts[i] * W - this.camX * z * depth) % W + W) % W,
        ((this.starPts[i + 1] * H - this.camY * z * depth) % H + H) % H,
      );
    }
  }

  private streak(x: number, y: number, vx: number, vy: number, len: number): void {
    if (this.sparks.length > 480) return;
    this.spark(x, y, vx, vy, 0xffffff, 0.3);
    const p = this.sparks[this.sparks.length - 1];
    p.len = len;
    p.s.height = 0.7;
  }

  /** Explosion of sparks, e.g. when a ship is knocked out. */
  burst(x: number, y: number, color: number): void {
    for (let k = 0; k < 60; k++) {
      const a = this.rand() * Math.PI * 2, v = 30 + this.rand() * 260;
      this.spark(x, y, Math.cos(a) * v, Math.sin(a) * v, k % 3 ? color : 0xffffff, 0.5 + this.rand() * 0.6);
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
    s.height = 0.9;
    s.tint = color;
    s.rotation = Math.atan2(vy, vx);
    this.sparks.push({ s, vx, vy, life, max: life });
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

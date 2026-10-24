import { Track, type TrackDef } from './track';

export const TRACK_DEFS: TrackDef[] = [
  {
    id: 'pulse',
    name: 'Pulse Circuit',
    blurb: 'A flowing starter loop. One boost pad, one gravity well, and long walls to grind.',
    color: 0x2ef2ff,
    accent: 0xff3df2,
    width: 230,
    scale: 1.9,
    points: [
      [-400, 0], [300, 0], [1000, -20], [1600, 80], [2000, 400], [2050, 850], [1750, 1150],
      [1300, 1150], [1050, 900], [700, 820], [350, 1000], [0, 1300], [-500, 1300],
      [-900, 1000], [-1000, 550], [-850, 180],
    ],
    pads: [{ at: 0.09, offset: -0.3 }],
    wells: [{ at: 0.24, offset: 2.4, radius: 750, strength: 320 }],
    gravity: [{ from: 0.66, to: 0.74, angle: 90, strength: 260 }],
  },
  {
    id: 'canyon',
    name: 'Scrape Canyon',
    blurb: 'Long, narrow sweepers built for grinding. A canyon wind pushes you onto the outside wall.',
    color: 0xff7a3d,
    accent: 0xffe14d,
    width: 180,
    scale: 100,
    points: [
      [0, 0], [10, 0], [20, 1], [30, 4], [38, 9], [42, 16], [40, 23], [34, 27], [26, 27], [20, 24],
      [14, 22], [8, 24], [4, 29], [-2, 33], [-10, 34], [-17, 31], [-20, 25], [-18, 18], [-12, 14],
      [-10, 8], [-7, 2],
    ],
    gravity: [{ from: 0.17, to: 0.27, angle: -90, strength: 200 }, { from: 0.62, to: 0.7, angle: -90, strength: 200 }],
    pads: [{ at: 0.04, offset: 0.4 }, { at: 0.47, offset: -0.3 }],
  },
  {
    id: 'well',
    name: 'Gravity Well',
    blurb: 'Orbit a massive attractor. It pulls you inward all lap, and repulsors guard the chicanes.',
    color: 0xb06bff,
    accent: 0xffb03d,
    width: 210,
    scale: 1.4,
    points: [
      [-1200, -1300], [-400, -1400], [400, -1300], [1100, -1100], [1500, -500], [1300, 0],
      [1600, 500], [1400, 1100], [700, 1400], [0, 1200], [-600, 1450], [-1300, 1200],
      [-1600, 600], [-1400, 0], [-1700, -600], [-1650, -1100],
    ],
    wells: [
      { at: 0, offset: 0, x: 0, y: 0, radius: 3600, strength: 220 },
      { at: 0.33, offset: -1.6, radius: 340, strength: -550 },
      { at: 0.82, offset: 1.6, radius: 340, strength: -550 },
    ],
    pads: [{ at: 0.12, offset: -0.4 }, { at: 0.6, offset: 0.4 }],
  },
  {
    id: 'slingshot',
    name: 'Slingshot',
    blurb: 'Hairpins wrapped around gravity wells. Commit to the turn and let the well fling you out.',
    color: 0xff3df2,
    accent: 0x2ef2ff,
    width: 200,
    scale: 100,
    points: [
      [-4, 0], [4, 0], [12, 0], [18, 0], [21.5, 1], [23.5, 4], [21.5, 7], [18, 8], [12, 8], [6, 8],
      [2.5, 9], [0.5, 12], [2.5, 15], [6, 16], [12, 16], [18, 16], [22, 16.5], [26, 17], [31, 15],
      [33, 9], [33, 2], [31, -4], [25, -7], [15, -8], [5, -8], [-4, -6], [-8, -3],
    ],
    wells: [
      { at: 0, offset: 0, x: 20, y: 4, radius: 650, strength: 380 },
      { at: 0, offset: 0, x: 4, y: 12, radius: 650, strength: 380 },
    ],
    pads: [{ at: 0.26, offset: 0 }, { at: 0.44, offset: 0 }, { at: 0.8, offset: 0.3 }],
  },
  {
    id: 'undertow',
    name: 'Undertow',
    blurb: 'Currents everywhere: a downhill rush, an uphill grind and crosswinds that shove you into the walls.',
    color: 0x3dff9a,
    accent: 0x2ef2ff,
    width: 210,
    scale: 1.3,
    points: [
      [0, 0], [800, 0], [1500, 100], [1900, 500], [1800, 1000], [1300, 1200], [800, 1000],
      [400, 1200], [300, 1700], [700, 2100], [1400, 2200], [2000, 2500], [1900, 3000],
      [1200, 3100], [400, 3000], [-300, 2700], [-600, 2100], [-400, 1500], [-700, 900], [-500, 350],
    ],
    gravity: [
      { from: 0.0, to: 0.07, angle: 0, strength: 240 },
      { from: 0.36, to: 0.44, angle: -90, strength: 300 },
      { from: 0.6, to: 0.68, angle: 180, strength: 170 },
      { from: 0.84, to: 0.9, angle: 90, strength: 300 },
    ],
    pads: [{ at: 0.52, offset: 0.3 }],
    wells: [{ at: 0.75, offset: -2.2, radius: 550, strength: 300 }],
  },
  {
    id: 'switchback',
    name: 'Crosswind Switchbacks',
    blurb: 'Climb and dive through four columns. Every column has its own wind: headwind, crosswinds and a tailwind dive.',
    color: 0xffe14d,
    accent: 0x3dff9a,
    width: 200,
    scale: 110,
    points: [
      [0, 0], [0, -8], [0, -16], [1.2, -18.8], [4, -20], [6.8, -18.8], [8, -16], [8, -10], [8, -4],
      [9.2, -1.2], [12, 0], [14.8, -1.2], [16, -4], [16, -10], [16, -16], [17.2, -18.8], [20, -20],
      [22.8, -18.8], [24, -16], [24, -8], [24, 0], [23, 5], [18, 8], [10, 9], [2, 8.5], [-3, 6], [-2.5, 2.5],
    ],
    gravity: [
      { from: 0.02, to: 0.11, angle: 180, strength: 150 },
      { from: 0.23, to: 0.3, angle: 90, strength: 260 },
      { from: 0.41, to: 0.48, angle: -90, strength: 260 },
      { from: 0.59, to: 0.69, angle: 0, strength: 200 },
    ],
    pads: [{ at: 0.8, offset: 0 }],
  },
  {
    id: 'oval',
    name: 'Velocity Oval',
    blurb: 'Wide, fast and banked. Gravity holds you into the turns, so the chicane is the only place to lose it.',
    color: 0xff5a8a,
    accent: 0xffffff,
    width: 250,
    scale: 120,
    points: [
      [0, 0], [10, 0], [20, 0], [30, 0], [36, 0.3], [42, 1.5], [47, 5], [49.5, 10], [47, 15], [42, 18.5],
      [36, 19.7], [30, 20], [24, 20], [19, 22.5], [15, 22.5], [11, 20], [6, 20], [0, 20], [-6, 19.7],
      [-12, 18.5], [-17, 15], [-19.5, 10], [-17, 5], [-12, 1.5], [-6, 0.3],
    ],
    gravity: [
      { from: 0.25, to: 0.43, angle: 90, strength: 260 },
      { from: 0.78, to: 0.97, angle: 90, strength: 260 },
    ],
    pads: [{ at: 0.05, offset: 0 }, { at: 0.12, offset: 0.5 }, { at: 0.55, offset: 0 }],
  },
];

const cache = new Map<string, Track>();

export function getTrack(id: string): Track {
  let t = cache.get(id);
  if (!t) {
    const def = TRACK_DEFS.find((d) => d.id === id) ?? TRACK_DEFS[0];
    t = new Track(def);
    cache.set(def.id, t);
  }
  return t;
}

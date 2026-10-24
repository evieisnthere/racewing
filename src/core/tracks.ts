import { Track, type TrackDef } from './track';

export const TRACK_DEFS: TrackDef[] = [
  {
    id: 'pulse',
    name: 'Pulse Circuit',
    blurb: 'A flowing starter loop. One boost pad, one gravity well, and a long wall to scrape.',
    color: 0x2ef2ff,
    accent: 0xff3df2,
    width: 210,
    points: [
      [-400, 0], [300, 0], [1000, -20], [1600, 80], [2000, 400], [2050, 850], [1750, 1150],
      [1300, 1150], [1050, 900], [700, 820], [350, 1000], [0, 1300], [-500, 1300],
      [-900, 1000], [-1000, 550], [-850, 180],
    ],
    pads: [{ at: 0.09, offset: -0.3 }],
    wells: [{ at: 0.24, offset: 2.4, radius: 560, strength: 520 }],
    gravity: [{ from: 0.66, to: 0.74, angle: 90, strength: 420 }],
  },
  {
    id: 'well',
    name: 'Gravity Well',
    blurb: 'Orbit a massive attractor. It pulls you inward the whole lap; repulsors guard the chicanes.',
    color: 0xb06bff,
    accent: 0xffb03d,
    width: 200,
    points: [
      [-1200, -1300], [-400, -1400], [400, -1300], [1100, -1100], [1500, -500], [1300, 0],
      [1600, 500], [1400, 1100], [700, 1400], [0, 1200], [-600, 1450], [-1300, 1200],
      [-1600, 600], [-1400, 0], [-1700, -600], [-1650, -1100],
    ],
    wells: [
      { at: 0, offset: 0, x: 0, y: 0, radius: 2500, strength: 380 },
      { at: 0.33, offset: -1.6, radius: 320, strength: -900 },
      { at: 0.82, offset: 1.6, radius: 320, strength: -900 },
    ],
    pads: [{ at: 0.12, offset: -0.4 }, { at: 0.6, offset: 0.4 }],
  },
  {
    id: 'undertow',
    name: 'Undertow',
    blurb: 'Currents everywhere: a downhill rush, an uphill grind and crosswinds that shove you into the walls.',
    color: 0x3dff9a,
    accent: 0x2ef2ff,
    width: 200,
    points: [
      [0, 0], [800, 0], [1500, 100], [1900, 500], [1800, 1000], [1300, 1200], [800, 1000],
      [400, 1200], [300, 1700], [700, 2100], [1400, 2200], [2000, 2500], [1900, 3000],
      [1200, 3100], [400, 3000], [-300, 2700], [-600, 2100], [-400, 1500], [-700, 900], [-500, 350],
    ],
    gravity: [
      { from: 0.0, to: 0.07, angle: 0, strength: 380 },
      { from: 0.36, to: 0.44, angle: -90, strength: 480 },
      { from: 0.6, to: 0.68, angle: 180, strength: 260 },
      { from: 0.84, to: 0.9, angle: 90, strength: 480 },
    ],
    pads: [{ at: 0.52, offset: 0.3 }],
    wells: [{ at: 0.75, offset: -2.2, radius: 500, strength: 450 }],
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

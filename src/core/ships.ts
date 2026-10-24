// Vector hull designs. Coordinates are in world units with the nose pointing along +x.
// Drawn by both the Pixi renderer and Canvas2D previews (hangar, map).

export interface Hull {
  id: string;
  name: string;
  /** Closed outline, flat [x, y, ...]. */
  body: number[];
  /** Panel lines (open polylines). */
  details: number[][];
  /** Canopy, closed. */
  cockpit: number[];
  /** Engine nozzle positions; flames draw backwards from here. */
  engines: [number, number][];
}

export const HULLS: Hull[] = [
  {
    id: 'dart', name: 'Dart',
    body: [16, 0, 4, -4, -2, -11, -8, -11, -6, -4, -10, -3, -10, 3, -6, 4, -8, 11, -2, 11, 4, 4],
    details: [[-2, -11, 2, -3.5], [-2, 11, 2, 3.5], [-6, -4, -6, 4]],
    cockpit: [9, 0, 4, -2.4, 0, -1.6, 0, 1.6, 4, 2.4],
    engines: [[-10, 0]],
  },
  {
    id: 'wasp', name: 'Wasp',
    body: [15, 0, 3, -5, -1, -10, -9, -8, -7, -3, -11, 0, -7, 3, -9, 8, -1, 10, 3, 5],
    details: [[-1, -10, -3, -3], [-1, 10, -3, 3]],
    cockpit: [8, 0, 3, -2.2, 0, 0, 3, 2.2],
    engines: [[-10, -2], [-10, 2]],
  },
  {
    id: 'needle', name: 'Needle',
    body: [21, 0, 6, -2.5, -4, -3, -6, -9, -10, -9, -9, -3, -12, -2, -12, 2, -9, 3, -10, 9, -6, 9, -4, 3, 6, 2.5],
    details: [[16, 0, 4, 0], [-6, -9, -5, -3], [-6, 9, -5, 3]],
    cockpit: [12, 0, 6, -1.6, 3, 0, 6, 1.6],
    engines: [[-12, 0]],
  },
  {
    id: 'hammer', name: 'Hammer',
    body: [14, 0, 10, -4, 4, -6, 3, -12, -10, -12, -12, -8, -12, 8, -10, 12, 3, 12, 4, 6, 10, 4],
    details: [[3, -12, -3, -6], [3, 12, -3, 6], [-3, -6, -3, 6], [-12, -10, -6, -10], [-12, 10, -6, 10]],
    cockpit: [9, 0, 4, -2.6, 0, -2, 0, 2, 4, 2.6],
    engines: [[-12, -9], [-12, 9]],
  },
  {
    id: 'manta', name: 'Manta',
    body: [14, 0, 6, -3, -2, -14, -7, -15, -4, -6, -9, -3, -9, 3, -4, 6, -7, 15, -2, 14, 6, 3],
    details: [[-2, -14, 0, -4], [-2, 14, 0, 4], [-4, -6, -4, 6]],
    cockpit: [8, 0, 3, -2.2, -1, 0, 3, 2.2],
    engines: [[-9, 0]],
  },
  {
    id: 'falcon', name: 'Falcon',
    body: [15, 0, 5, -3, 2, -5, 7, -12, 1, -12, -6, -5, -10, -4, -10, 4, -6, 5, 1, 12, 7, 12, 2, 5, 5, 3],
    details: [[1, -12, 0, -4], [1, 12, 0, 4]],
    cockpit: [9, 0, 4, -2, 1, 0, 4, 2],
    engines: [[-10, -2], [-10, 2]],
  },
  {
    id: 'twin', name: 'Catamaran',
    body: [15, -6, 5, -9, -10, -9, -11, -4, -6, -2, -6, 2, -11, 4, -10, 9, 5, 9, 15, 6, 6, 4, 4, 0, 6, -4],
    details: [[13, -6, -8, -6], [13, 6, -8, 6]],
    cockpit: [4, 0, -1, -1.8, -4, 0, -1, 1.8],
    engines: [[-11, -6.5], [-11, 6.5]],
  },
  {
    id: 'crescent', name: 'Crescent',
    body: [17, 0, 8, -3, 6, -9, 11, -14, 2, -13, -4, -6, -10, -4, -10, 4, -4, 6, 2, 13, 11, 14, 6, 9, 8, 3],
    details: [[6, -9, 0, -5], [6, 9, 0, 5], [-10, 0, -4, 0]],
    cockpit: [11, 0, 5, -2.2, 1, 0, 5, 2.2],
    engines: [[-10, -2.2], [-10, 2.2]],
  },
];

export const hullById = (id: string): Hull => HULLS.find((h) => h.id === id) ?? HULLS[0];

/** Hulls available without unlocking anything. */
export const STARTER_HULLS = ['dart', 'wasp'];

export const PLAYER_COLORS = [0x2ef2ff, 0xff3df2, 0xffe14d, 0x3dff9a, 0xff7a3d, 0xb06bff, 0xffffff, 0xff4d6d];

/** Draw a hull on a 2D canvas, centred at the current transform. */
export function drawHull2D(ctx: CanvasRenderingContext2D, hull: Hull, color: string, flame = true): void {
  const poly = (pts: number[], close: boolean) => {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    if (close) ctx.closePath();
  };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (flame) {
    for (const [x, y] of hull.engines) {
      const g = ctx.createLinearGradient(x, y, x - 16, y);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.3, color);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      poly([x, y - 2.5, x - 16, y, x, y + 2.5], true);
      ctx.fill();
    }
  }
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#070912';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  poly(hull.body, true);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 0.8;
  for (const d of hull.details) { poly(d, false); ctx.stroke(); }
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = color;
  poly(hull.cockpit, true);
  ctx.fill();
  ctx.globalAlpha = 1;
}

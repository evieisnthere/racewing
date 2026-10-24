import type { Ship } from './physics';

export const GHOST_HZ = 30;

export interface Ghost {
  trackId: string;
  /** Lap time in seconds. */
  time: number;
  name: string;
  xs: Float32Array;
  ys: Float32Array;
  as: Float32Array;
}

export class GhostRecorder {
  private xs: number[] = [];
  private ys: number[] = [];
  private as: number[] = [];

  reset(): void {
    this.xs.length = 0; this.ys.length = 0; this.as.length = 0;
  }

  /** Record a pose when the lap clock passes the next sample time. */
  sample(s: Ship, lapTime: number): void {
    while (this.xs.length <= lapTime * GHOST_HZ) {
      this.xs.push(s.x); this.ys.push(s.y); this.as.push(s.angle);
    }
  }

  finish(trackId: string, time: number, name: string): Ghost {
    return {
      trackId, time, name,
      xs: Float32Array.from(this.xs), ys: Float32Array.from(this.ys), as: Float32Array.from(this.as),
    };
  }
}

export function ghostPose(g: Ghost, t: number): { x: number; y: number; angle: number } | null {
  const f = t * GHOST_HZ;
  const i = Math.floor(f);
  if (i < 0 || i >= g.xs.length - 1) return null;
  const k = f - i;
  let da = g.as[i + 1] - g.as[i];
  if (da > Math.PI) da -= Math.PI * 2;
  if (da < -Math.PI) da += Math.PI * 2;
  return {
    x: g.xs[i] + (g.xs[i + 1] - g.xs[i]) * k,
    y: g.ys[i] + (g.ys[i + 1] - g.ys[i]) * k,
    angle: g.as[i] + da * k,
  };
}

// Share codes: "RW1." + base64url(deflate-raw(binary)). Positions are quantised to 1/8 unit and delta-coded.
const Q = 8;

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const buf = await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(buf);
}

export async function encodeGhost(g: Ghost): Promise<string> {
  const enc = new TextEncoder();
  const id = enc.encode(g.trackId);
  const name = enc.encode(g.name.slice(0, 24));
  const n = g.xs.length;
  const buf = new ArrayBuffer(4 + id.length + name.length + 8 + 8 + n * 5);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let o = 0;
  dv.setUint8(o++, id.length); u8.set(id, o); o += id.length;
  dv.setUint8(o++, name.length); u8.set(name, o); o += name.length;
  dv.setFloat32(o, g.time, true); o += 4;
  dv.setUint32(o, n, true); o += 4;
  let px = Math.round(g.xs[0] * Q), py = Math.round(g.ys[0] * Q);
  dv.setInt32(o, px, true); o += 4;
  dv.setInt32(o, py, true); o += 4;
  for (let i = 0; i < n; i++) {
    const qx = Math.round(g.xs[i] * Q), qy = Math.round(g.ys[i] * Q);
    dv.setInt16(o, Math.max(-32768, Math.min(32767, qx - px)), true); o += 2;
    dv.setInt16(o, Math.max(-32768, Math.min(32767, qy - py)), true); o += 2;
    px = qx; py = qy;
    const a = ((g.as[i] % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    dv.setUint8(o++, Math.round((a / (Math.PI * 2)) * 255));
  }
  const raw = u8.subarray(0, o);
  if (typeof CompressionStream === 'undefined') return 'RW1R.' + toB64(raw);
  return 'RW1.' + toB64(await pipe(raw, new CompressionStream('deflate-raw')));
}

export async function decodeGhost(code: string): Promise<Ghost> {
  code = code.trim();
  let bytes: Uint8Array;
  if (code.startsWith('RW1R.')) bytes = fromB64(code.slice(5));
  else if (code.startsWith('RW1.')) bytes = await pipe(fromB64(code.slice(4)), new DecompressionStream('deflate-raw'));
  else throw new Error('Not a Racewing ghost code');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  let o = 0;
  const idLen = dv.getUint8(o++);
  const trackId = dec.decode(bytes.subarray(o, o + idLen)); o += idLen;
  const nameLen = dv.getUint8(o++);
  const name = dec.decode(bytes.subarray(o, o + nameLen)); o += nameLen;
  const time = dv.getFloat32(o, true); o += 4;
  const n = dv.getUint32(o, true); o += 4;
  let px = dv.getInt32(o, true); o += 4;
  let py = dv.getInt32(o, true); o += 4;
  if (n > 200000 || o + n * 5 > bytes.length) throw new Error('Ghost code is truncated');
  const xs = new Float32Array(n), ys = new Float32Array(n), as = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    px += dv.getInt16(o, true); o += 2;
    py += dv.getInt16(o, true); o += 2;
    xs[i] = px / Q; ys[i] = py / Q;
    as[i] = (dv.getUint8(o++) / 255) * Math.PI * 2;
  }
  return { trackId, time, name, xs, ys, as };
}

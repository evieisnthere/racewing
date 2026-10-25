import type { Tier } from './core/ai';
import type { Scheme } from './core/physics';

export interface Settings {
  scheme: Scheme;
  rubberBand: boolean;
  collisions: boolean;
  ghosts: boolean;
  laps: number;
  bots: number;
  tier: Tier | 'mixed';
  track: string;
  name: string;
  name2: string;
  music: number;
  sfx: number;
  hull: string;
  color: number;
  callsign: string;
  radio: boolean;
  vibrate: boolean;
  /** Campaign bot strength: -1 relaxed, 0 normal, 1 hard. */
  assist: number;
  /** Snake tails in Quick Race / split-screen. */
  snake: boolean;
  /** Snake Battle setup. */
  arena: string;
  lives: number;
  /** Settings layout version (for one-off migrations). */
  v: number;
}

const DEFAULTS: Settings = {
  scheme: 'manual', rubberBand: true, collisions: true, ghosts: true,
  laps: 3, bots: 5, tier: 'medium', track: 'pulse', name: 'Player 1', name2: 'Player 2', music: 0.6, sfx: 0.8,
  hull: 'dart', color: 0x2ef2ff, callsign: '', radio: true, vibrate: true, assist: -1, snake: false, arena: 'A1', lives: 4, v: 2,
};

const PREFIX = 'racewing.';

function get(key: string): string | null {
  try { return localStorage.getItem(PREFIX + key); } catch { return null; }
}

function set(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, value);
  } catch { /* storage unavailable: settings just won't persist */ }
}

export function loadSettings(): Settings {
  let raw: Partial<Settings> = {};
  try { raw = JSON.parse(get('settings') ?? '{}'); } catch { raw = {}; }
  const s: Settings = { ...DEFAULTS, ...raw };
  if ((raw.v ?? 1) < 2) {
    // v2: W-to-thrust became the default; anyone still on the old always-thrust default moves over.
    if (s.scheme === 'thrust') s.scheme = 'manual';
    s.v = 2;
  }
  return s;
}

export function saveSettings(s: Settings): void {
  set('settings', JSON.stringify(s));
}

/** Keyed by Track.key (id + layout hash), so a changed layout starts fresh. */
export const ghostCode = (trackId: string): string | null => get(`ghost.${trackId}`);
export const saveGhostCode = (trackId: string, code: string | null): void => set(`ghost.${trackId}`, code);
export const bestLap = (trackId: string): number => Number(get(`best.${trackId}`) ?? Infinity);
export const saveBestLap = (trackId: string, t: number): void => set(`best.${trackId}`, String(t));

export function loadProgress(): Record<string, number> {
  try { return JSON.parse(get('campaign') ?? '{}'); } catch { return {}; }
}

export function saveProgress(p: Record<string, number>): void {
  set('campaign', JSON.stringify(p));
}

/** Best clear time per puzzle level id. */
export function loadPuzzleBests(): Record<string, number> {
  try { return JSON.parse(get('puzzle') ?? '{}'); } catch { return {}; }
}

export function savePuzzleBests(b: Record<string, number>): void {
  set('puzzle', JSON.stringify(b));
}

/** Dialogue keys already shown ("x0:pre", "r5:win", ...). */
export function loadSeen(): Set<string> {
  try { return new Set(JSON.parse(get('story') ?? '[]')); } catch { return new Set(); }
}

export function saveSeen(seen: Set<string>): void {
  set('story', JSON.stringify([...seen]));
}

export function clearAll(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch { /* nothing to clear */ }
}

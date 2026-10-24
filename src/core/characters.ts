import type { Tier } from './ai';

export type Visor = 'band' | 'round' | 'split' | 'slit' | 'none';
export type Headgear = 'round' | 'crest' | 'fin' | 'horns' | 'headset' | 'shades';

export interface Character {
  id: string;
  name: string;
  title: string;
  color: number;
  hull: string;
  visor: Visor;
  head: Headgear;
  /** Pre-race line shown on briefings. */
  taunt: string;
}

export const CHARACTERS: Record<string, Character> = {
  wren: { id: 'wren', name: 'Wren Okafor', title: 'Crew chief', color: 0x3dff9a, hull: 'dart', visor: 'none', head: 'headset', taunt: '' },
  dex: { id: 'dex', name: 'Dex Volta', title: 'League announcer', color: 0xffe14d, hull: 'dart', visor: 'none', head: 'shades', taunt: '' },
  sable: { id: 'sable', name: 'Sable Ardent', title: 'Reigning champion', color: 0xd9d4ff, hull: 'crescent', visor: 'slit', head: 'crest', taunt: 'Don\'t waste my time.' },
  kite: { id: 'kite', name: 'Kite Marlow', title: 'Rookie Series ace', color: 0xff3df2, hull: 'needle', visor: 'band', head: 'fin', taunt: 'Try to keep my trail in sight, rookie.' },
  rook: { id: 'rook', name: 'Rook Haldane', title: 'Pro Circuit bruiser', color: 0xff7a3d, hull: 'hammer', visor: 'split', head: 'horns', taunt: 'Walls are for pushing people into.' },
  halo: { id: 'halo', name: 'Halo Sen', title: 'Elite League prodigy', color: 0xffd23d, hull: 'manta', visor: 'round', head: 'crest', taunt: 'Every line is already decided. I just fly it.' },
  pip: { id: 'pip', name: 'Pip', title: 'Nervous rookie', color: 0x7fd4ff, hull: 'wasp', visor: 'round', head: 'round', taunt: 'Is it normal for the walls to be this close?' },
  dune: { id: 'dune', name: 'Dune', title: 'Laid-back drifter', color: 0xd9a066, hull: 'falcon', visor: 'band', head: 'round', taunt: 'No rush. Well, some rush.' },
  moth: { id: 'moth', name: 'Moth', title: 'Chaos merchant', color: 0xb06bff, hull: 'twin', visor: 'split', head: 'fin', taunt: 'I aim for the brightest ship. That\'s you.' },
  lark: { id: 'lark', name: 'Lark', title: 'Eternal optimist', color: 0x9dff6b, hull: 'dart', visor: 'band', head: 'round', taunt: 'Good luck out there! Genuinely!' },
  vex: { id: 'vex', name: 'Vex', title: 'Sore winner', color: 0xff4d6d, hull: 'needle', visor: 'slit', head: 'horns', taunt: 'I\'ve read your telemetry. It\'s adorable.' },
  nova: { id: 'nova', name: 'Nova', title: 'Showboat', color: 0x5ad1ff, hull: 'manta', visor: 'round', head: 'crest', taunt: 'Cameras are on me, so try not to crash into the shot.' },
  juno: { id: 'juno', name: 'Juno', title: 'Veteran', color: 0xc0c0ff, hull: 'hammer', visor: 'band', head: 'round', taunt: 'Twelve seasons. I\'ve seen a hundred of you.' },
};

/** Pit pilots used to fill Quick Race fields. */
export const PIT_CREW = ['vex', 'nova', 'kite', 'rook', 'halo', 'juno', 'pip', 'dune', 'moth', 'lark'];

export const char = (id: string): Character => CHARACTERS[id];

/** Default skill tier for pit pilots when they appear without an explicit one. */
export const defaultTier = (id: string): Tier =>
  (({ sable: 'insane', halo: 'insane', rook: 'hard', vex: 'hard', nova: 'hard', juno: 'hard', kite: 'medium' }) as Record<string, Tier>)[id] ?? 'easy';

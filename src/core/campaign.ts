import type { Tier } from './ai';
import { Race } from './race';
import { getTrack } from './tracks';

export type EventKind = 'race' | 'tt' | 'elim' | 'exhibition';

export interface Opponent { who: string; tier: Tier }
export interface Line { who: string; text: string }

export interface CampaignNode {
  id: string;
  kind: EventKind;
  track: string;
  /** Race laps (time trials give three laps to set a best; eliminations run until one ship remains). */
  laps: number;
  field: Opponent[];
  brief: string;
  /** Map position. */
  col: number;
  row: number;
  /** Unlocks once ANY of these is completed. */
  requires: string[];
  /** Total stars needed, in addition to `requires` (series gates). */
  gate?: number;
  /** Character id for rival showdowns. */
  boss?: string;
  /** Hull unlocked by completing (1★+). */
  reward?: string;
  pre?: Line[];
  win?: Line[];
  lose?: Line[];
}

export interface Series { name: string; from: number; to: number; color: number }

export const KIND_LABEL: Record<EventKind, string> = { race: 'Race', tt: 'Time Trial', elim: 'Elimination', exhibition: 'Exhibition' };

const f = (...spec: [string, Tier][]): Opponent[] => spec.map(([who, tier]) => ({ who, tier }));
const L = (...lines: [string, string][]): Line[] => lines.map(([who, text]) => ({ who, text }));

export const SERIES: Series[] = [
  { name: 'Rookie Series', from: 0, to: 4, color: 0x2ef2ff },
  { name: 'Pro Circuit', from: 5, to: 8, color: 0xff7a3d },
  { name: 'Elite League', from: 9, to: 12, color: 0xffd23d },
  { name: 'Championship', from: 13, to: 15, color: 0xd9d4ff },
];

export const NODES: CampaignNode[] = [
  // ---------------- Rookie ----------------
  {
    id: 'x0', kind: 'exhibition', track: 'pulse', laps: 1, col: 0, row: 1, requires: [],
    field: f(['sable', 'insane'], ['lark', 'easy'], ['pip', 'easy']),
    brief: 'Season opener: one exhibition lap with the reigning champion. Nobody expects you to win.',
    pre: L(
      ['dex', 'Pilots, fans and gravity freaks, welcome to the Racewing League season opener! Our champion Sable Ardent takes an exhibition lap against the newest licence holder… {name}!'],
      ['wren', '{name}, it\'s Wren, your crew chief. Lucky you. One lap with the champ. Just fly clean.'],
      ['wren', 'Remember: grind with your tail. Put your engine flame on the wall with your nose angled away. That\'s where the speed lives.'],
      ['sable', 'An exhibition. With a rookie. Fine. Stay out of my wake.'],
    ),
    win: L(
      ['sable', '…Huh. Beginner\'s luck, {name}. Don\'t get used to it.'],
      ['dex', 'WHAT a start! The rookie takes the champion! Somebody check the timing gates!'],
      ['wren', 'Don\'t let it go to your head. You still need your licence stamps. The Rookie Series starts now.'],
    ),
    lose: L(
      ['sable', 'Adequate. Come back when you\'re interesting.'],
      ['wren', 'That\'s Sable. Five seasons undefeated, zero manners. Let\'s get you through the Rookie Series and make them remember your callsign.'],
    ),
  },
  {
    id: 'r1', kind: 'race', track: 'pulse', laps: 3, col: 1, row: 1, requires: ['x0'],
    field: f(['kite', 'medium'], ['pip', 'easy'], ['dune', 'easy'], ['moth', 'easy'], ['lark', 'easy']),
    brief: 'Your first licence race. Finish on the podium.',
    pre: L(
      ['wren', 'First real race. A podium gets your first licence stamp. Watch Kite: fast, loud, and knows it.'],
      ['kite', 'New blood! Cute ship. Mine\'s faster.'],
    ),
    win: L(['kite', 'Okay, okay. Not bad for a first stamp.']),
    lose: L(['wren', 'Shake it off. Watch where Kite grinds and steal the line.']),
  },
  {
    id: 'r2', kind: 'tt', track: 'pulse', laps: 3, col: 2, row: 0, requires: ['r1'], field: [],
    brief: 'Three laps, best one counts. Learn which walls are worth grinding.',
    pre: L(['wren', 'No traffic, just you and the clock. Every bit of grind shaves time. Chase the medals.']),
  },
  {
    id: 'r3', kind: 'race', track: 'canyon', laps: 3, col: 2, row: 2, requires: ['r1'],
    field: f(['kite', 'medium'], ['moth', 'easy'], ['dune', 'medium'], ['pip', 'easy'], ['lark', 'easy']),
    brief: 'Narrow sweepers and a crosswind. Ride the outside wall.',
    pre: L(
      ['dex', 'Scrape Canyon! Narrow walls, wild winds and sparks for days!'],
      ['moth', 'I aim for the brightest ship. That\'s you.'],
    ),
    win: L(['wren', 'Look at those sparks. You\'re learning to love the walls.']),
  },
  {
    id: 'r4', kind: 'elim', track: 'switchback', laps: 0, col: 3, row: 1, requires: ['r2', 'r3'],
    field: f(['kite', 'medium'], ['pip', 'easy'], ['moth', 'easy']),
    brief: 'Last place is knocked out every lap. Be the last ship flying.',
    pre: L(
      ['wren', 'Elimination. Last place at the end of each lap gets pulled. Simple rules, hard to follow.'],
      ['pip', 'Oh no. Oh no no no.'],
    ),
    win: L(['pip', 'You were SO fast. Teach me?']),
  },
  {
    id: 'r5', kind: 'race', track: 'slingshot', laps: 3, col: 4, row: 1, requires: ['r4'], boss: 'kite', reward: 'needle',
    field: f(['kite', 'hard'], ['dune', 'medium'], ['pip', 'medium'], ['moth', 'easy'], ['lark', 'easy']),
    brief: 'Rookie final against Kite. Dive into the hairpins and let the wells sling you out.',
    pre: L(
      ['kite', 'Rookie final, {name}. Win and you\'re a Pro. Lose and you\'re in my highlight reel.'],
      ['wren', 'Kite overcooks the hairpins. Let the wells do the turning and catch them on the exit.'],
    ),
    win: L(
      ['kite', '…Fine. You earned it. Take the Needle\'s blueprints. You\'ll want something that turns like that in the Pros.'],
      ['dex', 'And the Rookie crown goes to… {name}!'],
    ),
    lose: L(['kite', 'Highlight reel it is! Run it back whenever you like, rookie.']),
  },
  // ---------------- Pro ----------------
  {
    id: 'p1', kind: 'race', track: 'well', laps: 3, col: 5, row: 1, requires: ['r5'], gate: 8,
    field: f(['rook', 'hard'], ['kite', 'medium'], ['vex', 'medium'], ['dune', 'medium'], ['pip', 'easy']),
    brief: 'Welcome to the Pro Circuit. The central well never lets go.',
    pre: L(
      ['dex', 'Welcome to the Pro Circuit! Ten tonnes of attitude, and its name is Rook Haldane!'],
      ['rook', 'Rookies bounce off my hull. Literally.'],
      ['wren', 'The well pulls you inward all lap. Fly a wide line and let it pull you through.'],
    ),
    win: L(['wren', 'Rook\'s rattled. Good.']),
  },
  {
    id: 'p2', kind: 'tt', track: 'canyon', laps: 3, col: 6, row: 0, requires: ['p1'], field: [], reward: 'falcon',
    brief: 'A sponsor is watching. Earn any medal to unlock the Falcon hull.',
    pre: L(['wren', 'Sponsor\'s watching this one. Hit a medal and they\'ll ship us a Falcon hull.']),
    win: L(['wren', 'The Falcon\'s in the hangar. Forward-swept wings. Gorgeous.']),
  },
  {
    id: 'p3', kind: 'elim', track: 'undertow', laps: 0, col: 6, row: 2, requires: ['p1'],
    field: f(['vex', 'hard'], ['rook', 'medium'], ['kite', 'medium'], ['dune', 'medium']),
    brief: 'Five ships, four knockouts. The currents decide who falls behind.',
    pre: L(['vex', 'I\'ve read your telemetry. It\'s adorable.']),
    win: L(['vex', 'Statistically improbable. I\'ll be filing a protest.']),
  },
  {
    id: 'p4', kind: 'race', track: 'switchback', laps: 3, col: 7, row: 1, requires: ['p2', 'p3'],
    field: f(['nova', 'hard'], ['vex', 'hard'], ['kite', 'medium'], ['juno', 'medium'], ['dune', 'medium']),
    brief: 'Climb the columns with the whole Pro field on your tail.',
    pre: L(['nova', 'Cameras are on me, so try not to crash into the shot.']),
    win: L(['dex', '{name} steals the spotlight from Nova!']),
  },
  {
    id: 'p5', kind: 'tt', track: 'slingshot', laps: 3, col: 7, row: 3, requires: ['p3'], field: [],
    brief: 'Optional: perfect slingshots, three laps.',
    pre: L(['wren', 'Optional, but Halo\'s people are watching slingshot times. Make them notice.']),
  },
  {
    id: 'p6', kind: 'race', track: 'oval', laps: 3, col: 8, row: 1, requires: ['p4'], boss: 'rook', reward: 'hammer',
    field: f(['rook', 'hard'], ['vex', 'hard'], ['nova', 'hard'], ['juno', 'medium'], ['kite', 'medium']),
    brief: 'Pro final on Rook\'s home track. Banked turns, three boost pads, and a bruiser in the mirrors.',
    pre: L(
      ['rook', 'The Oval. My house. You\'ll be scraping my paint off your nose.'],
      ['wren', 'Rook bullies people into the walls on the straights. Use the banking and stay out of reach.'],
    ),
    win: L(
      ['rook', 'Hah! You hit like a hammer. Take one. You\'ve earned it.'],
      ['sable', 'Rook has never lost on the Oval. …Interesting.'],
    ),
    lose: L(['rook', 'Back to the pits, little ship.']),
  },
  // ---------------- Elite ----------------
  {
    id: 'e1', kind: 'race', track: 'undertow', laps: 3, col: 9, row: 1, requires: ['p6'], gate: 22,
    field: f(['halo', 'insane'], ['rook', 'hard'], ['vex', 'hard'], ['nova', 'hard'], ['kite', 'medium']),
    brief: 'The Elite League starts in the currents.',
    pre: L(
      ['dex', 'The Elite League! The fastest pilots in the system… and {name}!'],
      ['halo', 'Every line is already decided. I just fly it.'],
    ),
    win: L(['halo', 'You took a line I hadn\'t calculated. I\'ll fix that.']),
  },
  {
    id: 'e2', kind: 'elim', track: 'oval', laps: 0, col: 10, row: 0, requires: ['e1'],
    field: f(['juno', 'hard'], ['rook', 'hard'], ['vex', 'hard'], ['nova', 'hard']),
    brief: 'Fast oval elimination. One slip and you\'re out.',
    pre: L(['juno', 'Twelve seasons. I\'ve seen a hundred of you. Most were out by lap two.']),
    win: L(['juno', 'A hundred and one. You\'re the first one I liked.']),
  },
  {
    id: 'e3', kind: 'tt', track: 'switchback', laps: 3, col: 10, row: 2, requires: ['e1'], field: [], reward: 'twin',
    brief: 'Climb into the headwind, dive with the tailwind. Earn a medal to unlock the Catamaran hull.',
    pre: L(['wren', 'An old friend of mine built a Catamaran hull. Post a medal time and it\'s yours.']),
    win: L(['wren', 'Twin booms, one cockpit, zero regrets. Probably.']),
  },
  {
    id: 'e4', kind: 'race', track: 'slingshot', laps: 3, col: 11, row: 1, requires: ['e2', 'e3'],
    field: f(['halo', 'hard'], ['rook', 'hard'], ['vex', 'hard'], ['nova', 'hard'], ['juno', 'hard']),
    brief: 'Slingshot with a full Elite field. Overtake on the exits.',
    pre: L(
      ['sable', 'You\'ve climbed far. Don\'t trip now.'],
      ['wren', 'Sable\'s watching you. That\'s new.'],
    ),
  },
  {
    id: 'e5', kind: 'tt', track: 'well', laps: 3, col: 11, row: 3, requires: ['e3'], field: [],
    brief: 'Optional: pure orbit work. Smooth inputs, let the well carry you.',
    pre: L(['wren', 'Smooth inputs. Let the well carry you.']),
  },
  {
    id: 'e6', kind: 'race', track: 'well', laps: 3, col: 12, row: 1, requires: ['e4'], boss: 'halo', reward: 'manta',
    field: f(['halo', 'insane'], ['rook', 'hard'], ['vex', 'hard'], ['nova', 'insane'], ['juno', 'hard']),
    brief: 'Elite final. Halo has simulated this race a thousand times.',
    pre: L(
      ['halo', 'I\'ve simulated this race four thousand times. You lose in all of them.'],
      ['wren', 'Simulations don\'t grind walls. You do.'],
    ),
    win: L(['halo', 'Variance. Beautiful, irritating variance. The Manta is yours. Maybe you\'ll find lines I can\'t.']),
    lose: L(['halo', 'As predicted.']),
  },
  // ---------------- Championship ----------------
  {
    id: 'c1', kind: 'race', track: 'canyon', laps: 3, col: 13, row: 1, requires: ['e6'], gate: 38,
    field: f(['sable', 'insane'], ['halo', 'insane'], ['rook', 'hard'], ['vex', 'hard'], ['nova', 'hard']),
    brief: 'Championship round one. The canyon again, against the best.',
    pre: L(
      ['dex', 'CHAMPIONSHIP SEASON! Challenger {name} against the best pilots alive!'],
      ['sable', 'So you made it. I remember the exhibition.'],
    ),
    win: L(['sable', 'Good. Keep that up.']),
  },
  {
    id: 'c2', kind: 'elim', track: 'well', laps: 0, col: 14, row: 0, requires: ['c1'],
    field: f(['kite', 'insane'], ['halo', 'insane'], ['rook', 'insane'], ['vex', 'hard'], ['nova', 'hard']),
    brief: 'Six ships around the well. Five get knocked out.',
    pre: L(['kite', 'The rookie\'s all grown up! Still gonna try to knock you out, though.']),
    win: L(['kite', 'Go get Sable. For all of us.']),
  },
  {
    id: 'c3', kind: 'tt', track: 'oval', laps: 3, col: 14, row: 2, requires: ['c1'], field: [],
    brief: 'Last tune-up before the final. Flat out, clean exits.',
    pre: L(['wren', 'Last tune-up before the final. Flat out, clean exits.']),
  },
  {
    id: 'c4', kind: 'race', track: 'slingshot', laps: 4, col: 15, row: 1, requires: ['c2', 'c3'], boss: 'sable', reward: 'crescent',
    field: f(['sable', 'insane'], ['halo', 'insane'], ['rook', 'insane'], ['kite', 'insane'], ['vex', 'insane']),
    brief: 'The title decider. Four laps of Slingshot against Sable and four other Insane pilots.',
    pre: L(
      ['dex', 'This is it. The title. Sable Ardent, five-time champion, against {name}!'],
      ['sable', 'When we met, I told you to stay out of my wake. That was a warning. Now it\'s an invitation.'],
      ['wren', 'Whatever happens, {name}, I\'m proud of you. Now go grind those walls.'],
    ),
    win: L(
      ['sable', '…Congratulations, champion. The Crescent\'s blueprints are yours. I\'ll be back next season. Make it interesting.'],
      ['dex', 'A NEW CHAMPION! {name} TAKES THE TITLE!'],
      ['wren', 'We did it. You did it. Drinks are on Kite.'],
    ),
    lose: L(['sable', 'Close. Closer than anyone in years. Again?']),
  },
];

/** Stars only come from scored events (not the exhibition). */
export const MAX_STARS = NODES.filter((n) => n.kind !== 'exhibition').length * 3;

export const nodeById = (id: string): CampaignNode | undefined => NODES.find((n) => n.id === id);
export const seriesOf = (n: CampaignNode): Series => SERIES.find((s) => n.col >= s.from && n.col <= s.to)!;

export type Progress = Record<string, number>;

/** An event counts as completed with 1★+ (any finish for the exhibition). */
export const completed = (p: Progress, id: string): boolean => {
  const n = nodeById(id);
  return id in p && (n?.kind === 'exhibition' || p[id] > 0);
};

export const totalStars = (p: Progress): number => NODES.reduce((a, n) => a + (n.kind === 'exhibition' ? 0 : p[n.id] ?? 0), 0);

export function nodeState(p: Progress, n: CampaignNode): 'locked' | 'gated' | 'open' | 'done' {
  if (completed(p, n.id)) return 'done';
  const reqOk = n.requires.length === 0 || n.requires.some((r) => completed(p, r));
  if (!reqOk) return 'locked';
  if (n.gate && totalStars(p) < n.gate) return 'gated';
  return 'open';
}

/** Hull ids unlocked by completed reward nodes. */
export const unlockedHulls = (p: Progress): string[] => NODES.filter((n) => n.reward && completed(p, n.id)).map((n) => n.reward!);

/** Stars for a placing in a race or elimination. */
export const placeStars = (place: number): number => (place === 1 ? 3 : place === 2 ? 2 : place === 3 ? 1 : 0);

const targetCache = new Map<string, [number, number, number]>();

/** Bronze/silver/gold lap targets: the best lap an Easy, Hard and Insane bot sets over three laps, rounded up to 0.1 s. */
export function ttTargets(trackId: string): [number, number, number] {
  let t = targetCache.get(trackId);
  if (t) return t;
  const track = getTrack(trackId);
  const best = (tier: Tier) => {
    const race = new Race({ track, laps: 3, racers: [{ name: '', color: 0, kind: 'bot', tier }], scheme: 'thrust', rubberBand: false, collisions: false, seed: 3 });
    while (race.state !== 'finished' && race.time < 400) race.step([]);
    return Math.ceil(race.racers[0].bestLap * 10) / 10;
  };
  t = [best('easy'), best('hard'), best('insane')];
  targetCache.set(trackId, t);
  return t;
}

export const ttStars = (lap: number, targets: [number, number, number]): number =>
  lap <= targets[2] ? 3 : lap <= targets[1] ? 2 : lap <= targets[0] ? 1 : 0;

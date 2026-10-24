import type { Tier } from './ai';
import { Race } from './race';
import { getTrack } from './tracks';

export type EventKind = 'race' | 'tt' | 'elim';

export interface Opponent { name: string; tier: Tier }

export interface CampaignEvent {
  id: string;
  kind: EventKind;
  track: string;
  /** Race laps (time trials always give three laps to set a best). */
  laps: number;
  field: Opponent[];
  brief: string;
  rival?: { name: string; taunt: string };
}

export interface Chapter {
  id: string;
  name: string;
  /** Stars needed to unlock. */
  need: number;
  events: CampaignEvent[];
}

export const KIND_LABEL: Record<EventKind, string> = { race: 'Race', tt: 'Time Trial', elim: 'Elimination' };

const f = (...spec: [string, Tier][]): Opponent[] => spec.map(([name, tier]) => ({ name, tier }));

export const CHAPTERS: Chapter[] = [
  {
    id: 'rookie',
    name: 'Rookie Series',
    need: 0,
    events: [
      { id: 'r1', kind: 'race', track: 'pulse', laps: 3, field: f(['Kite', 'medium'], ['Pip', 'easy'], ['Dune', 'easy'], ['Moth', 'easy'], ['Lark', 'easy']),
        brief: 'Your licence race. Finish on the podium. Keep your engine flame on the wall to grind for speed.',
        rival: { name: 'Kite', taunt: 'Another rookie? Try to keep my trail in sight.' } },
      { id: 'r2', kind: 'tt', track: 'pulse', laps: 3, field: [], brief: 'Three laps, best one counts. Learn where the walls are worth grinding.' },
      { id: 'r3', kind: 'race', track: 'canyon', laps: 3, field: f(['Kite', 'medium'], ['Pip', 'easy'], ['Dune', 'medium'], ['Moth', 'easy'], ['Lark', 'easy']),
        brief: 'Narrow sweepers and a crosswind. Ride the outside wall.',
        rival: { name: 'Kite', taunt: 'The canyon wind loves pushing rookies into walls.' } },
      { id: 'r4', kind: 'elim', track: 'switchback', laps: 0, field: f(['Kite', 'medium'], ['Pip', 'easy'], ['Moth', 'easy']),
        brief: 'Last place is knocked out every lap. Be the last ship flying.' },
      { id: 'r5', kind: 'race', track: 'slingshot', laps: 3, field: f(['Kite', 'medium'], ['Dune', 'medium'], ['Pip', 'medium'], ['Moth', 'easy'], ['Lark', 'easy']),
        brief: 'Rookie final. Dive into the hairpins and let the wells sling you out.',
        rival: { name: 'Kite', taunt: 'Win this and you might actually be Pro material.' } },
    ],
  },
  {
    id: 'pro',
    name: 'Pro Circuit',
    need: 8,
    events: [
      { id: 'p1', kind: 'race', track: 'well', laps: 3, field: f(['Rook', 'hard'], ['Kite', 'medium'], ['Vex', 'medium'], ['Dune', 'medium'], ['Pip', 'easy']),
        brief: 'Welcome to the Pro Circuit. The central well never lets go.',
        rival: { name: 'Rook', taunt: 'I don\'t lose to people who just got here.' } },
      { id: 'p2', kind: 'tt', track: 'canyon', laps: 3, field: [], brief: 'Grind the canyon walls for a lap the Pros will respect.' },
      { id: 'p3', kind: 'elim', track: 'undertow', laps: 0, field: f(['Rook', 'hard'], ['Vex', 'medium'], ['Kite', 'medium'], ['Dune', 'medium']),
        brief: 'Five ships, four knockouts. The currents decide who falls behind.' },
      { id: 'p4', kind: 'race', track: 'oval', laps: 3, field: f(['Rook', 'hard'], ['Vex', 'hard'], ['Kite', 'medium'], ['Nova', 'medium'], ['Dune', 'medium']),
        brief: 'Banked turns and three boost pads. Flat out until the chicane.',
        rival: { name: 'Rook', taunt: 'The oval is pure speed. You\'ll see my flame from behind.' } },
      { id: 'p5', kind: 'tt', track: 'slingshot', laps: 3, field: [], brief: 'Perfect slingshots, three laps.' },
    ],
  },
  {
    id: 'elite',
    name: 'Elite League',
    need: 20,
    events: [
      { id: 'e1', kind: 'race', track: 'undertow', laps: 3, field: f(['Halo', 'insane'], ['Rook', 'hard'], ['Vex', 'hard'], ['Nova', 'hard'], ['Kite', 'medium']),
        brief: 'The Elite League starts in the currents.',
        rival: { name: 'Halo', taunt: 'Elite means every wall, every lap. Keep up.' } },
      { id: 'e2', kind: 'elim', track: 'oval', laps: 0, field: f(['Halo', 'insane'], ['Rook', 'hard'], ['Vex', 'hard'], ['Nova', 'hard']),
        brief: 'Fast oval elimination. One slip and you\'re out.' },
      { id: 'e3', kind: 'tt', track: 'switchback', laps: 3, field: [], brief: 'Climb against the headwind, dive with the tailwind.' },
      { id: 'e4', kind: 'race', track: 'switchback', laps: 3, field: f(['Halo', 'insane'], ['Rook', 'hard'], ['Vex', 'hard'], ['Nova', 'hard'], ['Juno', 'hard']),
        brief: 'Switchbacks, full field. Overtake in the turns, not the columns.',
        rival: { name: 'Halo', taunt: 'Crosswinds don\'t bother me. Do they bother you?' } },
      { id: 'e5', kind: 'tt', track: 'well', laps: 3, field: [], brief: 'Orbit the well cleanly. Gold here takes nerve.' },
    ],
  },
  {
    id: 'champ',
    name: 'Championship',
    need: 34,
    events: [
      { id: 'c1', kind: 'race', track: 'canyon', laps: 3, field: f(['Sable', 'insane'], ['Halo', 'insane'], ['Rook', 'hard'], ['Vex', 'hard'], ['Nova', 'hard']),
        brief: 'Championship round one. The canyon again, against the best.',
        rival: { name: 'Sable', taunt: 'I\'ve held the title for three seasons. Make it interesting.' } },
      { id: 'c2', kind: 'elim', track: 'well', laps: 0, field: f(['Sable', 'insane'], ['Halo', 'insane'], ['Rook', 'insane'], ['Vex', 'hard'], ['Nova', 'hard']),
        brief: 'Six ships around the well. Five get knocked out.' },
      { id: 'c3', kind: 'race', track: 'slingshot', laps: 4, field: f(['Sable', 'insane'], ['Halo', 'insane'], ['Rook', 'insane'], ['Vex', 'insane'], ['Juno', 'insane']),
        brief: 'The title decider. Four laps of Slingshot against five Insane pilots.',
        rival: { name: 'Sable', taunt: 'Only one of us leaves with the crown.' } },
    ],
  },
];

export const ALL_EVENTS = CHAPTERS.flatMap((c) => c.events);
export const MAX_STARS = ALL_EVENTS.length * 3;

export function findEvent(id: string): { chapter: Chapter; event: CampaignEvent; index: number } | null {
  for (const chapter of CHAPTERS) {
    const index = chapter.events.findIndex((e) => e.id === id);
    if (index >= 0) return { chapter, event: chapter.events[index], index };
  }
  return null;
}

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

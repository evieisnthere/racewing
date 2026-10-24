// Headless check: track geometry sanity, and each AI tier lapping each track solo and in a full field.
// Usage: npm run sim [-- trackId]
import { TIER_NAMES, type Tier } from '../src/core/ai';
import { formatTime } from '../src/core/math';
import { Race, STEP, type RacerSpec } from '../src/core/race';
import { getTrack, TRACK_DEFS } from '../src/core/tracks';

const only = (globalThis as { process?: { argv: string[] } }).process?.argv[2];
const tiers: Tier[] = ['easy', 'medium', 'hard', 'insane'];

for (const def of TRACK_DEFS) {
  if (only && def.id !== only) continue;
  const track = getTrack(def.id);
  let minR = Infinity, minW = Infinity;
  for (let i = 0; i < track.n; i++) {
    const c = Math.abs(track.curv[i]);
    if (c > 0) minR = Math.min(minR, 1 / c);
    minW = Math.min(minW, track.hw[i] * 2);
  }
  console.log(`\n== ${def.name} (${def.id}) length ${track.length.toFixed(0)} samples ${track.n} min radius ${minR.toFixed(0)} min width ${minW.toFixed(0)}`);

  for (const tier of tiers) {
    const race = new Race({
      track, laps: 3, scheme: 'thrust', rubberBand: false, collisions: false,
      racers: [{ name: 'bot', color: 0, kind: 'bot', tier }],
    });
    const r = race.racers[0];
    let hits = 0, scrapeTime = 0, wasHit = false, maxSpeed = 0;
    while (race.state !== 'finished' && race.time < 300) {
      race.step([]);
      const s = r.ship;
      const strong = s.hit > 250;
      if (strong && !wasHit) hits++;
      wasHit = strong;
      if (s.scrape > 0) scrapeTime += STEP;
      maxSpeed = Math.max(maxSpeed, Math.hypot(s.vx, s.vy));
    }
    const status = r.finished ? formatTime(r.finishTime) : `DNF (lap ${r.lap}, idx ${r.ship.idx})`;
    console.log(
      `  ${TIER_NAMES[tier].padEnd(7)} total ${status.padEnd(12)} laps ${r.lapTimes.map(formatTime).join(' ')}  hits ${hits}  scrape ${scrapeTime.toFixed(1)}s  vmax ${maxSpeed.toFixed(0)}`,
    );
  }

  const field = new Race({
    track, laps: 3, scheme: 'thrust', rubberBand: false, collisions: true,
    racers: ([...tiers, 'medium', 'hard'] as Tier[]).map((tier, i): RacerSpec => ({ name: `${tier}${i}`, color: 0, kind: 'bot', tier })),
  });
  while (field.state !== 'finished' && field.time < 400) field.step([]);
  const order = [...field.racers].sort((a, b) => a.place - b.place);
  console.log(`  field: ${order.map((r) => `${r.place}.${r.spec.name}${r.finished ? '' : '(DNF)'}`).join(' ')}`);
}

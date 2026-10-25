// Headless Snake Battle sims: `npx tsx scripts/battle.ts [arenaId]`. Bots only.
import { ARENAS } from '../src/core/arenas';
import { BattleRun } from '../src/core/battle';
import type { Tier } from '../src/core/ai';

const only = process.argv[2];
const tiers: Tier[] = ['insane', 'hard', 'medium', 'medium', 'easy', 'easy'];
for (const arena of ARENAS.filter((a) => !only || a.id === only)) {
  for (const seed of [1, 2, 3]) {
    const run = new BattleRun({
      arena, lives: 3, timeLimit: 120, scheme: 'manual', seed,
      racers: tiers.map((tier, i) => ({ name: `B${i}`, color: 0xffffff, kind: 'bot' as const, tier })),
    });
    let falls = 0, shoves = 0, whips = 0;
    const self: Record<string, number> = {};
    while (run.state !== 'finished' && run.time < 130) {
      run.step([]);
      for (const ev of run.events) {
        if (ev.type === 'fall') { falls++; if (ev.by) shoves++; else self[ev.racer.spec.tier!] = (self[ev.racer.spec.tier!] ?? 0) + 1; }
        if (ev.type === 'whip') whips++;
      }
      run.events.length = 0;
    }
    const win = run.racers.find((r) => r.place === 1);
    console.log(`${arena.id} seed ${seed} ended ${run.finishedAt.toFixed(1)}s falls ${falls} byShove ${shoves} whips ${whips} winner ${win?.spec.name}/${win?.spec.tier} self ${JSON.stringify(self)}`);
  }
}

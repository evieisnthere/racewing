# Racewing

A neon two-button racer inspired by **Data Wing**: gravity currents, attractor/repulsor wells, boost pads, and wall grinding. Play a star-gated campaign (races, time-trial medals, elimination), race AI bots at four skill levels, chase your best-lap ghost, share ghost codes, or race a friend split-screen. Ambient electronic music and all sound effects are synthesised live with WebAudio.

Play it: https://evieisnthere.github.io/racewing/

Built with **Vite + TypeScript + PixiJS (WebGL)** and deployed to **GitHub Pages**.

## Controls

| | Turn left | Turn right | Both |
|---|---|---|---|
| Keyboard (solo) | `A` / `←` | `D` / `→` | brake → reverse |
| Touch | hold left half | hold right half | brake → reverse |
| Gamepad | LB / LT / d-pad / stick | RB / RT / d-pad / stick | brake → reverse |
| Split-screen | P1 `A` `D`, P2 `←` `→` (or gamepads 1 & 2) | | |

`M` mutes. `R` (P1) / `Enter` (P2) / gamepad Y resets your ship onto the track. `Esc`, `P` or Start pauses.

**Always thrust** (default): you're always accelerating, one button turns, both together brake and then reverse.
**Classic** (Settings): one button turns while coasting, both together thrust.

## Feel

Data Wing scale: tracks are 4-5 ships wide and the camera shows about 8 ships across the shorter screen edge.
The engine is weak and drag is low, so momentum does the work. Your velocity keeps its speed and swings toward
your nose (that's the drift), and you only lose speed in proportion to how sideways you're sliding.

## Mechanics

- **Wall grinding**: put your engine flame against a wall (tail touching, nose angled slightly away or parallel) for about +50% speed, sparks, and a gentle pull that holds you to the wall through corners. Sliding along nose-first rubs off speed; head-on hits bounce you.
- **Puzzles**: six tile levels with keys and gates, switches and barriers, ramps over pits, one-way portals, wells, currents, ice/mud/turbo/flip floors and moving hazards. Medals per level.
- **Track generator**: seeded tracks with tunable length, twist, width, fields and gimmicks, a daily track, and share codes.
- **Gravity currents** (green chevrons) push you the way they point: downhill, uphill, or sideways.
- **Wells**: purple pulls you in, orange pushes you away.
- **Boost pads** (yellow arrows).

## Campaign

A branching tech-tree map across four series (Rookie, Pro, Elite, Championship), with 21 scored events plus an opening exhibition against the champion. Completing a node unlocks its neighbours, and star gates guard each new series. Events award up to 3★: podium places in races and eliminations, and bronze/silver/gold lap targets in time trials (the targets are the best laps of Easy, Hard and Insane bots).

Short, skippable dialogue cards tell the story of your climb from licence to title. The cast: Wren (your crew chief), Dex Volta (the announcer), series bosses Kite, Rook and Halo, a crowd of pit pilots, and Sable Ardent, the aloof champion. Beating a boss unlocks their hull in the **Hangar**, where you pick your ship and colour.

## AI

Bots press the same two buttons you do. Easy, Medium, Hard and Insane differ in reaction time, steering precision, racing-line use, braking judgement, wall margin (Insane scrapes walls deliberately) and pad seeking. Optional rubber-banding slows bots that are ahead of you and speeds up bots behind.

## Development

```sh
npm install
npm run dev        # local dev server
npm run build      # typecheck + production build into dist/
npm run sim        # headless: every AI tier laps every track; reports lap times
```

Open `/?autopilot` to let an Insane bot drive your ship (handy for demos and testing).

### Layout

- `src/core/`: DOM-free simulation (tracks, physics, AI, race rules, ghosts). It runs in Node for `npm run sim`.
- `src/render/view.ts`: the Pixi renderer (one `View` per viewport).
- `src/ui/hud.ts`, `src/main.ts`, `src/style.css`: HUD, menus and game flow.
- `src/core/tracks.ts`: track definitions. Control points plus gravity zones, wells and pads, positioned by lap fraction.

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main` (or the dev branch). One-time setup: **Settings → Pages → Source: GitHub Actions**.

# Racewing

A neon two-button racer inspired by **Data Wing**: gravity currents, attractor/repulsor wells, boost pads, and wall-scrape boosting. Race AI bots at four skill levels, chase your best-lap ghost, share ghost codes, or race a friend split-screen.

Built with **Vite + TypeScript + PixiJS (WebGL)** and deployed to **GitHub Pages**.

## Controls

| | Turn left | Turn right | Both |
|---|---|---|---|
| Keyboard (solo) | `A` / `←` | `D` / `→` | brake → reverse |
| Touch | hold left half | hold right half | brake → reverse |
| Gamepad | LB / LT / d-pad / stick | RB / RT / d-pad / stick | brake → reverse |
| Split-screen | P1 `A` `D`, P2 `←` `→` (or gamepads 1 & 2) | | |

`R` (P1) / `Enter` (P2) / gamepad Y resets your ship onto the track. `Esc`, `P` or Start pauses.

**Always thrust** (default): you're always accelerating, one button turns, both together brake and then reverse.
**Classic** (Settings): one button turns while coasting, both together thrust.

## Mechanics

- **Wall scraping**: graze a wall at a shallow angle (under ~25°) to gain speed and throw sparks. Head-on hits bounce you and cost speed.
- **Gravity currents** (green chevrons) push you the way they point: downhill, uphill, or sideways.
- **Wells**: purple pulls you in, orange pushes you away.
- **Boost pads** (yellow arrows).

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

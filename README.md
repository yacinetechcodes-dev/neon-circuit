# Neon Circuit

A sci-fi/cyber 2D platformer in plain HTML5 Canvas + vanilla JavaScript.
No libraries, no build step, no asset files, no music. **Double-click `index.html` to play.**
Progress is saved in `localStorage`.

## Levels

| # | Level | New idea |
| --- | --- | --- |
| 1 | Boot Sector | basics: run, jump, cores, checkpoints |
| 2 | Data Stream | double jump, wall-jump, moving platforms, drones |
| 3 | Server Core | dash, lasers, crushers, turrets — **Core Warden** mini-boss |
| 4 | Orbital Station | low gravity, falling platforms, dash crystals, all enemies |
| 5 | The Mainframe | gauntlet, **Warden Mk-II**, three-phase **Mainframe** |
| 6 | Firewall Run | moving laser walls, timed gates, checkpoint gauntlet |
| 7 | Gravity Lab | gravity-flip and heavy-gravity zones |
| 8 | Quantum Maze | teleporters, switch-and-door puzzles, hidden shortcut |
| 9 | Overclock Tower | vertical climb, speed-boost gate run — **Warden Mk-III** |
| 10 | Core Meltdown | every mechanic, then **The Kernel** (new final boss) |

## World 2: Hacking World

Unlocks after World 1's boss. Terminal green, falling code, file-system corridors, glitches.

| # | Level | New idea |
| --- | --- | --- |
| 1 | Login Shell | glitch blocks, antivirus drones, bug crawlers, trojans — **Data Dash** |
| 2 | Firewall Run | laser firewalls, timed gates — **Freeze Process** |
| 3 | File System | symlink pads, permission doors, locked gates — **Root Access**; earns the **Virus Launcher** |
| 4 | Bit Flip | gravity-flip and overclock zones |
| 5 | Root Directory | every mechanic, then the three-phase **Admin Daemon** |

Data Dash makes the dash untouchable and lets it phase through firewall walls. Freeze Process
(R) stops enemies and moving hazards for 3 s. Root Access opens locked gates — including the
vault in level 1, so it's worth a revisit. Trojans look like repair kits; watch for the glitch.

## World 3: Pixel World

Unlocks after World 2's boss; a step up in difficulty. Retro 8-bit: chunky pixels, a PICO-8 palette.

| # | Level | New idea |
| --- | --- | --- |
| 1 | Press Start | pixel slimes (they split), block bats, disappearing blocks — **Pixel Shrink** |
| 2 | Brick Bridges | chasms too wide to jump, moving pixel walls, spike floors — **Block Place** |
| 3 | Pixel Caves | crawlspaces with tiny slimes, low pixel-wall corridors — **Rewind**; earns the **Pixel Bomb** |
| 4 | Sky Fortress | everything combined, bouncing squares overhead |
| 5 | Glitch Castle | a 100-row tower climb (from the archived Overclock Tower), then the three-phase **Glitch King** |

Pixel Shrink (T) makes you tiny enough for half-height crawlspaces (no shooting while tiny).
Block Place (B) drops a block under your feet in mid-air, or in front of you on the ground; it lasts 4 s.
Rewind is automatic: the first death in a level jumps you back to a safe spot from ~2 s earlier.

## World 4: Windows 10 World

Unlocks after World 3's boss; harder again. A parody desktop: every window, button, folder and
loading circle is a plain original shape (no real logos, icons or trademarks). Rename it by
changing `name` in `worlds/world04.js`.

| # | Level | New idea |
| --- | --- | --- |
| 1 | Desktop | chasing popup windows, closing windows, file-drag conveyors — **Minimize** |
| 2 | Error Gauntlet | error boxes, spinning loaders, file stacks to break (from archived level 6) — **Maximize** |
| 3 | File Explorer | tiered folders with linked windows (from archived level 8) — **Alt-Tab**; earns the **Popup Shotgun** |
| 4 | Update Hell | crashing blue panels and everything combined |
| 5 | Blue Screen | a final gauntlet, then the multi-phase **Blue Screen Beast** |

Minimize (Y) shrinks you small enough for thin slots and makes you quicker; press again to restore.
Maximize (U) makes you big and heavy: walk into a file stack to smash it (can't grow under a low ceiling).
Alt-Tab (Tab / I) while standing in a numbered window jumps you to its linked twin.
Spinning loaders can't be stomped. Popup Shotgun fires a 5-window spread.

## World 5: Apocalypse World

Unlocks after World 4's boss; harder again. A ruined city of broken machines under an orange
sky: smoke, rust, sparks, crumbling rubble and toxic sludge.

| # | Level | New idea |
| --- | --- | --- |
| 1 | Ashfall Avenue | scrap crawlers, rocket drones, toxic puddles, crumbling bridges — **Grapple Hook** |
| 2 | Smelter Row | cracked floors under sealed walls, wrecker bots, fire vents — **Ground Slam**; earns the **Rocket Launcher** |
| 3 | Fallen Tower | a four-room climb (from the archived Overclock Tower), falling debris, a rocket wall — **Jetpack Burst** |
| 4 | Scrapyard Run | everything combined |
| 5 | Titan Foundry | a final gauntlet, then the three-phase **Wrecker Titan** |

Grapple Hook (G) near a ring: swing, press Jump to let go (you get a little pop upward).
Ground Slam (↓ or N in mid-air): crashes down, breaks cracked floors and stuns nearby enemies;
stunned enemies are harmless and can be stomped (even armoured wrecker bots).
Jetpack Burst (H): a strong upward boost that recharges in ~1.3 s.
Rocket Launcher: area damage, and the only thing that breaks cracked walls. Rocket drones' rockets can be shot down.

## World 6: Linux World

The final world, and the hardest. A command-line look built only from original, generic shapes
(no logos or mascots): prompts, directory trees, package crates and process monitors.

| # | Level | New idea |
| --- | --- | --- |
| 1 | Home Directory | zombie processes, memory leaks, infinite-loop platforms — **Sudo** opens permission-locked doors |
| 2 | Process Tree | timed switches far from their doors, fork bombs, kernel panic orbs — **Pipe** |
| 3 | Package Tree | tiers of a directory tree with symlink pads and switch branches (from the archived Quantum Maze) — **Kill Process**; earns the **Grep Beam** |
| 4 | Root Filesystem | everything combined, including a three-door Sudo sprint |
| 5 | Kernel Space | a final gauntlet (after the archived Core Meltdown), then the three-phase **Kernel Core** |

Sudo (O): for 4 s you pass permission-locked doors and ignore shields (12 s recharge).
Pipe (\ or .): press once to mark a spot, again somewhere else to link it; press inside either end to travel.
Kill Process (Delete or ,): instantly removes the enemy under the red reticle (not bosses); 15 s recharge.
Zombie processes get back up after being "killed" — stomp the `<defunct>` body to reap them.
Memory leaks grow over time; shots shrink them. Panic orbs are shielded until they've blown their ring.
Grep Beam: an instant, piercing beam straight ahead (shields stop it unless Sudo is on).

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | ← → / A D | ◀ ▶ |
| Jump (hold for higher) | Space / ↑ / W / Z | JUMP |
| Drop through thin platform | ↓ + Jump | ▼ + JUMP |
| Dash (from level 2) | Shift / X | DASH |
| Pulse shot (from level 3) | F / C / J | FIRE |
| Pause | Esc / P | II |
| Mute | M | pause menu |
| Freeze Process (World 2) | R / V | FRZ |
| Pixel Shrink (World 3) | T | MINI |
| Block Place (World 3) | B | BLK |
| Minimize (World 4) | Y | MIN |
| Maximize (World 4) | U | MAX |
| Alt-Tab (World 4) | Tab / I | TAB |
| Grapple Hook (World 5) | G | HOOK |
| Ground Slam (World 5) | ↓ / N in mid-air | SLAM |
| Jetpack Burst (World 5) | H | JET |
| Sudo (World 6) | O | SUDO |
| Pipe (World 6) | \ / . | PIPE |
| Kill Process (World 6) | Delete / , | KILL |

## Project layout

```
index.html          loads core/, then the two manifests, then core/loader.js
style.css
core/               engine: util, registry, input, save, particles, camera,
                    level (parser + validator), physics, render, world, ui, engine, loader
entities/           player, pickups, hazards, enemies, firewall, gravity, quantum,
                    boss_warden, boss_mainframe, boss_kernel
entities/index.js   entity manifest (list of files to load)
levels/             _TEMPLATE.js, level01.js … level10.js
levels/index.js     level manifest (play order)
```

Everything uses plain `<script>` tags (no ES modules), so it works straight from disk.

## Add a new level

1. Copy `levels/_TEMPLATE.js` to `levels/level11.js`.
2. Give it a new `id` and `name`, then draw the `map` (one character per tile; all rows the same length).
3. Add `"level11.js",` to `LEVEL_FILES` in `levels/index.js`.
4. Open `index.html`. Problems are printed in the browser console (F12) as
   `[level 11 "…"] ERROR: …` and the level card turns red. The check catches a missing start,
   a missing exit, unknown legend characters, legend entries pointing at unregistered entity
   types, and uneven row lengths.

## Add a new enemy (or hazard)

1. Create `entities/myEnemy.js`:

```js
registerEntity("hopper", {
  size: [24, 24],                       // hitbox
  props: { enemy: true, hurts: true, stompable: true, shootable: true, dashable: true, hp: 1, color: "#ff3df0" },
  init(e, world, arg) { e.timer = 0; },
  update(e, world) {
    e.vy = Math.min(10, e.vy + 0.6);
    if (++e.timer % 90 === 0) e.vy = -9;          // hop every 1.5 s
    const res = Physics.move(world, e, 0, e.vy);
    if (res.hitY) e.vy = 0;
  },
  draw(e, ctx, world) {
    ctx.fillStyle = e.flash ? "#fff" : e.color;
    ctx.fillRect(e.x, e.y, e.w, e.h);
  },
});
```

2. Add `"myEnemy.js",` to `ENTITY_FILES` in `entities/index.js`.
3. Use it in a level: `legend: { "O": "hopper" }` and put `O` in the map.

Stomping, dash hits, pulse shots and contact damage are handled by the engine from the
`props` flags (each can also be a function `(e, world) => bool`, e.g. "only stompable while stunned").
Other hooks: `onTouch`, `onDamage`, `onDeath`, `onRespawn`, `blocks` (see `core/registry.js`).

## Add a new power-up

Temporary power-ups live in the `POWERUPS` table in `entities/pickups.js`
(`shield`, `magnet`, `speed`, `health`). To add one:

1. Add an entry, e.g. `jump: { color: "#7dff4a", label: "SPRING", frames: 600, text: "SUPER JUMP" }`.
2. Add `jump: 0` to `this.powers` in `entities/player.js` and use it where it matters
   (e.g. `if (this.powers.jump > 0) …` in the jump code).
3. Place it in a level with the legend value `"powerup:jump"`.

A completely different pickup can also be its own file with `registerEntity` and an `onTouch` hook.
Permanent upgrades (`doubleJump`, `dash`, `pulse`, `hpUp`) are granted by a level's `unlocks`
list or by an in-level `"upgrade:<name>"` pickup, and carry over to later levels.

## Sound effects

All sounds are synthesized in `core/sfx.js` with the Web Audio API (no files, no music).
Audio starts on the first key/click/touch (browser autoplay rule). **M** or the pause-menu
button toggles mute; the setting is saved. To add a sound:

```js
sfx.define("boing", (s, t) => s.tone(t, { type: "square", f0: 200, f1: 800, dur: 0.1, vol: 0.1 }));
sfx.play("boing"); // anywhere in the game code
```

Helpers: `s.tone` (oscillator with pitch sweep), `s.noise` (filtered noise burst), `s.arp` (note sequence).

## Developer options

Open `index.html?debug` for an FPS counter, all levels unlocked, `F9` = god mode,
`F10` = teleport to the next checkpoint/boss/exit. `?debug&level=3&x=120` starts level 3 at tile column 120.

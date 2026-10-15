# Neon Circuit

A sci-fi/cyber 2D platformer in plain HTML5 Canvas + vanilla JavaScript.
No libraries, no build step, no asset files, no music. **Double-click `index.html` to play.**
Progress is saved in `localStorage`.

Six worlds, each **one long level** (about 10-15 minutes) split into named sections that build
up: new mechanics one at a time, then combined, a mid-level challenge, a final stretch, and the
boss. Beating a world's boss unlocks the next world. Abilities and weapons carry over.

**Lives and checkpoints.** Each attempt at a world gives you **5 lives** (shown in the HUD).
Checkpoints are frequent (never more than ~40 tiles apart, several before every boss); dying
puts you back at the last one and costs a life. Lose all five and the world restarts from the
beginning with 5 fresh lives. Sections you've reached can be picked from the world's section
list to practise them.

**Health** is 3 points in Worlds 1-2, 4 in Worlds 3-4 and 5 in Worlds 5-6 (+1 every two worlds,
kept for good). Health pickups appear along the way and during boss fights.

**Bosses** each have one mechanic of their own, a readable pattern, two or three short phases that
look different, telegraphed attacks, a health bar, a name card and health drops. A fight takes
about a minute to a minute and a half.

**Text** is short and stays on screen long enough to read (1.5 s + 0.4 s per word). It never
stops play except for an important new mechanic. Signs along the way tell a little of each
world's story; every sign and tip can be re-read in **Help / Codex** (signs are in the LOGS tab).

## World 1: Tutorial World

| Section | Kind | What's in it |
| --- | --- | --- |
| Boot Sector | intro | run, jump, cores, checkpoints |
| Data Stream | intro | double jump, wall-jump, moving platforms, drones |
| Server Core | combine | dash, lasers, crushers, turrets |
| Warden's Gate | challenge | the **Core Warden** mini-boss |
| Orbital Station | combine | low gravity, falling platforms, dash crystals |
| Final Approach | combine | everything at once |
| The Mainframe | boss | **Mainframe**: hit its core while it is down and exposed |

Weapons found in the level: Arc Cannon, Scatter Burst (the Pulse Blaster comes with the Pulse ability).
The old levels 6-10 live in `levels/_archive/`; several sections in later worlds are adapted from them.

## World 2: Hacking World

Terminal green, falling code, file-system corridors, glitches.

| Section | Kind | What's in it |
| --- | --- | --- |
| Login Shell | intro | glitch blocks, antivirus drones, bug crawlers, trojans |
| Data Dash | intro | **Data Dash**: dash through firewall walls |
| Firewall Run | intro | laser firewalls, timed gates; **Freeze Process** |
| File System | combine | symlink pads, permission doors, locked gates; **Root Access**, **Virus Launcher** |
| Bit Flip | challenge | gravity-flip and overclock zones |
| Kernel Panic | combine | everything at once |
| Root Directory | boss | **Admin Daemon**: freeze it to lock its shell open, then shoot (it also opens while compiling) |

Data Dash makes the dash untouchable and lets it phase through firewall walls. Freeze Process
(R) stops enemies and moving hazards for 3 s. Root Access opens locked gates. Trojans look like
repair kits; watch for the glitch.

## World 3: Pixel World

Retro 8-bit: chunky pixels, a PICO-8 palette. Ends with a tall castle climb.

| Section | Kind | What's in it |
| --- | --- | --- |
| Press Start | intro | pixel slimes (they split), block bats, disappearing blocks; **Pixel Shrink** |
| Brick Bridges | intro | chasms too wide to jump; **Block Place** |
| Pixel Caves | intro | crawlspaces, low pixel-wall corridors; **Rewind**, **Pixel Bomb** |
| Sky Fortress | challenge | everything combined, bouncing squares overhead |
| Last Stretch | combine | everything at once |
| Glitch Castle | boss | a 100-row tower climb, then the **Glitch King**: when it splits, hit the shard with the crown |

Pixel Shrink (T) makes you tiny enough for half-height crawlspaces (no shooting while tiny).
Block Place (B) drops a block under your feet in mid-air, or in front of you on the ground; it lasts 4 s.
Rewind is automatic: the first death jumps you back to a safe spot from ~2 s earlier, without losing a life.

## World 4: Windows 10 World

A parody desktop: every window, button, folder and loading circle is a plain original shape
(no real logos, icons or trademarks). Rename it by changing `name` in `worlds/world04.js`.

| Section | Kind | What's in it |
| --- | --- | --- |
| Desktop | intro | chasing popups, closing windows, file-drag conveyors; **Minimize** |
| Error Gauntlet | intro | error boxes, spinning loaders, file stacks; **Maximize** |
| File Explorer | intro | tiered folders with linked windows; **Alt-Tab**, **Popup Shotgun** |
| Update Hell | challenge | crashing blue panels and everything combined |
| Restart Required | combine | everything at once |
| Blue Screen | boss | **Blue Screen Beast**: when a fist gets stuck, Maximize and shove it back to force an "update", then hit it |

Minimize (Y) shrinks you small enough for thin slots and makes you quicker; press again to restore.
Maximize (U) makes you big and heavy: walk into a file stack to smash it (can't grow under a low ceiling).
Alt-Tab (Tab / I) while standing in a numbered window jumps you to its linked twin.
Spinning loaders can't be stomped. Popup Shotgun fires a 5-window spread.

## World 5: Apocalypse World

A ruined city of broken machines under an orange sky: smoke, rust, sparks, rubble and toxic sludge.

| Section | Kind | What's in it |
| --- | --- | --- |
| Ashfall Avenue | intro | scrap crawlers, rocket drones, toxic puddles, crumbling bridges; **Grapple Hook** |
| Smelter Row | intro | cracked floors, wrecker bots, fire vents; **Ground Slam** |
| Scrapyard | intro | **Jetpack Burst**, the **Rocket Launcher** and a rocket wall |
| Collapse Run | challenge | falling debris and everything combined |
| Fallen Tower | combine | a climb to the roof |
| Titan Foundry | boss | **Wrecker Titan**: crack both smokestacks (rockets or slams) to make it overheat |

Grapple Hook (G) near a ring: swing, press Jump to let go (you get a little pop upward).
Ground Slam (down or N in mid-air): crashes down, breaks cracked floors and stuns nearby enemies;
stunned enemies are harmless and can be stomped (even armoured wrecker bots).
Jetpack Burst (H): a strong upward boost that recharges in ~1.3 s.
Rocket Launcher: area damage, and the only thing that breaks cracked walls. Rocket drones' rockets can be shot down.

## World 6: Linux World

The final world, and the hardest. A command-line look built only from original, generic shapes
(no logos or mascots): prompts, directory trees, package crates and process monitors.

| Section | Kind | What's in it |
| --- | --- | --- |
| Home Directory | intro | zombie processes, memory leaks, infinite-loop platforms; **Sudo** |
| Process Tree | intro | timed switches far from their doors, fork bombs, panic orbs; **Pipe** |
| Package Tree | intro | directory tiers with symlink pads and switch branches; **Kill Process**, **Grep Beam** |
| Root Filesystem | challenge | everything combined, including a three-door Sudo sprint |
| Kernel Space | combine | a final gauntlet |
| Kernel Core | boss | **Kernel Core**: hit the core when it dumps; in phase 3 stomp it or Sudo through its shield |

Sudo (O): for 4 s you pass permission-locked doors and ignore shields (10 s recharge).
Pipe (\ or .): press once to mark a spot, again somewhere else to link it; press inside either end to travel.
Kill Process (Delete or ,): instantly removes the enemy under the red reticle (not bosses); 15 s recharge.
Zombie processes get back up after being "killed": stomp the `<defunct>` body to reap them.
Memory leaks grow over time; shots shrink them. Panic orbs are shielded until they've blown their ring.
Grep Beam: an instant, piercing beam straight ahead (shields stop it unless Sudo is on).

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | ← → / A D | ◀ ▶ |
| Jump (hold for higher) | Space / ↑ / W / Z | JUMP |
| Drop through thin platform | ↓ + Jump | ▼ + JUMP |
| Dash (World 1, Server Core) | Shift / X | DASH |
| Fire weapon | F / C / J | FIRE |
| Switch weapon | Q / E / 1-9 | WPN |
| Pause | Esc / P | II |
| Mini map on/off | 0 / ` | MAP |
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

The full list (keyboard and touch, filled in from the game's own data) is on the **Controls**
page, from the title screen or the pause menu.

### Playing on a phone

Open the game in the phone's browser and hold it sideways. On touch screens the game shows
semi-transparent, thumb-sized buttons: ◀ ▶ (and ▼) on the left; JUMP, DASH, FIRE and WPN on the
right; pause and MAP at the top right. Several fingers work at once (run and jump together).
The current world's abilities get their own buttons (a ring shows recharge); abilities from
earlier worlds are in the ••• tray. Every menu, card and page works by tapping, and the pause
menu has a FULLSCREEN option. The game scales to any landscape screen; page scrolling, zooming
and text selection are disabled while playing.

### Help, Codex and the mini map

- The first time a new enemy (or a non-obvious hazard) appears, a short one-time tip says what
  it is and how to deal with it. Bosses get a name card. Each section opens with its name and
  goal, and the HUD shows the current section.
- New weapons and abilities are introduced once (name, what it does, which key/button).
- **HELP / CODEX** (pause menu or title) lists every enemy, hazard, boss, weapon, ability,
  item and mechanic tip found so far, each with an icon and one line; LOGS keeps every sign read.
- The HUD shows the current weapon and its charges, ability recharges and active power-ups.
  An arrow at the screen edge points to the exit when it's off screen.
- The mini map (top right) shows the parts of the level you've seen: terrain, you, the exit,
  checkpoints, the boss arena and enemy dots. Toggle it with `0` / `` ` `` or MAP; the choice is saved.

## Project layout

```
index.html          loads core/, then the three manifests, then core/loader.js
style.css
core/               engine: util, sfx, registry, input (keyboard + touch), save, particles,
                    camera, level (parser + validator), physics, render, world, weapons,
                    ui (HUD, menus), guide (tips, Controls, Help/Codex), minimap, engine, loader
entities/           player, pickups, hazards, enemies, and one file per world's enemies/hazards
                    (hacking, pixel, desktop, apocalypse, linux, ...) and per boss
entities/index.js   entity manifest (list of files to load)
weapons/            one file per weapon + weapons/index.js manifest
worlds/             one file per world (worldNN.js, _TEMPLATE.js) + worlds/index.js (play order)
levels/worldNN/     world.js: the world's single long level (with sections)
levels/_archive/    the old five-levels-per-world files and levels 6-10, kept to reuse
```

Everything uses plain `<script>` tags (no ES modules), so it works straight from disk.

## Add or edit a world's level

1. Each world's level is `levels/<folder>/world.js`; for a new world, copy `levels/_TEMPLATE.js` there.
2. Give it an `id` and a `name`, draw the `map` (one character per tile; all rows the same
   length) and split it into `sections` (name, short desc, kind, column range, optional theme).
   Use `"sign"` (with `text` in `entityOverrides`) for story notes and `"prop:<kind>"` for
   scenery (see `entities/decor.js`).
3. Put `"world.js"` in that world's `levels` list in `worlds/worldNN.js`.
4. Open `index.html`. Problems are printed in the browser console (F12) and the world card
   turns red. The check catches a missing start, a missing exit, unknown legend characters,
   legend entries pointing at unregistered entity types, uneven row lengths, section ranges
   that don't cover the map, sections without a checkpoint, and a boss outside the last section.

To add a whole world, copy `worlds/_TEMPLATE.js` (see the comments in it) and list it in
`worlds/index.js`.

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

Give it a name and one line for the player, and the game does the rest (a one-time tip the
first time it's seen, plus its Help / Codex entry with a live icon):

```js
registerEntity("hopper", {
  info: { name: "Hopper", desc: "Hops on a beat. Stomp it between hops." },
  // tip: false → Codex only (obvious things); kind: "item" → Items tab
  ...
});
```

Weapons get a `desc` next to their `label`; abilities get `name`, `desc`, `how` (with
`{key}` tokens) and, if the player presses something, `action` + `label` (its touch button)
in `UPGRADE_INFO` — the Controls page, touch buttons and HUD pick them up automatically.

## Add a new power-up

Temporary power-ups live in the `POWERUPS` table in `entities/pickups.js`
(`shield`, `magnet`, `speed`, `health`). To add one:

1. Add an entry, e.g. `jump: { color: "#7dff4a", label: "SPRING", frames: 600, text: "SUPER JUMP", desc: "Jump much higher for a while." }`
   (`desc` is shown the first time it's picked up and in the Codex).
2. Add `jump: 0` to `this.powers` in `entities/player.js` and use it where it matters
   (e.g. `if (this.powers.jump > 0) …` in the jump code).
3. Place it in a level with the legend value `"powerup:jump"`.

A completely different pickup can also be its own file with `registerEntity` and an `onTouch` hook.
Permanent upgrades (`doubleJump`, `dash`, `pulse` and each world's abilities) are granted by a level's `unlocks`
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

Open `index.html?debug` for an FPS counter, all worlds unlocked, `F9` = god mode,
`F10` = teleport to the next checkpoint/boss/exit. `?debug&world=2&level=1&x=120` starts
World 2's level at tile column 120. For testing, `UNLOCK_ALL` at the top of `core/engine.js`
opens every world and section; set it to `false` for normal progression.

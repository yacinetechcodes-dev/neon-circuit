# Neon Circuit

A sci-fi/cyber 2D platformer in plain HTML5 Canvas + vanilla JavaScript.
No libraries, no build step, no assets, no audio. **Double-click `index.html` to play.**

Five levels: **Boot Sector → Data Stream → Server Core → Orbital Station → The Mainframe**,
with a mini-boss (Core Warden) at the end of level 3, a harder Warden Mk-II and the
three-phase Mainframe in level 5. Progress is saved in `localStorage`.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | ← → / A D | ◀ ▶ |
| Jump (hold for higher) | Space / ↑ / W / Z | JUMP |
| Drop through thin platform | ↓ + Jump | ▼ + JUMP |
| Dash (from level 2) | Shift / X | DASH |
| Pulse shot (from level 3) | F / C / J | FIRE |
| Pause | Esc / P | II |

## Project layout

```
index.html          loads core/, then the two manifests, then core/loader.js
style.css
core/               engine: util, registry, input, save, particles, camera,
                    level (parser + validator), physics, render, world, ui, engine, loader
entities/           player, pickups, hazards, enemies, boss_warden, boss_mainframe
entities/index.js   entity manifest (list of files to load)
levels/             _TEMPLATE.js, level01.js … level05.js
levels/index.js     level manifest (play order)
```

Everything uses plain `<script>` tags (no ES modules), so it works straight from disk.

## Add a new level

1. Copy `levels/_TEMPLATE.js` to `levels/level06.js`.
2. Give it a new `id` and `name`, then draw the `map` (one character per tile; all rows the same length).
3. Add `"level06.js",` to `LEVEL_FILES` in `levels/index.js`.
4. Open `index.html`. Problems are printed in the browser console (F12) as
   `[level 6 "…"] ERROR: …` and the level card turns red. The check catches a missing start,
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

Open `index.html?debug` for an FPS counter, all levels unlocked, `G` = god mode,
`N` = teleport to the next checkpoint/boss/exit. `?debug&level=3&x=120` starts level 3 at tile column 120.

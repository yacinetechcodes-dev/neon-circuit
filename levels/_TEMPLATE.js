/* =========================================================================
 * levels/_TEMPLATE.js — copy this file to make a new level.
 *
 *   1. Copy it to e.g. levels/level06.js
 *   2. Fill in the fields below (everything is plain data — no code needed)
 *   3. Add "level06.js" to the list in levels/index.js
 *   4. Open index.html. If something is wrong, the browser console (F12)
 *      prints clear [level …] ERROR messages and the level-select card turns red.
 *
 * This template file itself is NOT listed in levels/index.js, so it never
 * loads. It is a complete, playable mini level if you do list it.
 * ========================================================================= */
registerLevel({
  // Unique number. Used as the save-game key (best times, cores…).
  id: 99,

  // Shown on the level card, the HUD and the intro banner.
  name: "My New Sector",

  // Colours (any CSS hex) and background style.
  //   style: "boot" | "stream" | "server" | "orbit" | "mainframe"
  theme: { bgTop: "#050818", bgBottom: "#0a1a3a", accent: "#00f0ff", gridColor: "#0b3a5a", style: "boot" },

  // Gravity multiplier for the whole level (1.0 = normal, 0.5 = floaty).
  // For low gravity in only part of a level, paint "~" cells instead.
  gravity: 1.0,

  // The game has no audio; keep this null.
  music: null,

  // Fallback start tile {x: column, y: row}. A "P" in the map wins over this.
  playerStart: { x: 2, y: 9 },

  // Permanent upgrades granted when this level is completed (optional).
  // Known upgrades: "doubleJump", "dash", "pulse", "hpUp"
  unlocks: [],

  // ASCII tile map: one character per 32×32 tile, row 0 is the top.
  // Every row MUST have the same length. Anything below the last row is a
  // bottomless pit; the left/right edges of the map act as walls.
  map: [
    "........................................", // 0
    "........................................", // 1
    "........................................", // 2
    "........................................", // 3
    "...........................C............", // 4
    "..........................===...........", // 5
    "..................C.....................", // 6
    ".................###.........D..........", // 7
    "........C...............................", // 8
    "..P..........E.......^^.........K.....X.", // 9
    "#############################..#########", // 10
    "#############################..#########", // 11
  ],

  // Which character means what. The engine already knows a default legend
  // (listed in full below), so you only NEED to add characters you change or
  // invent — but listing them keeps the level self-explanatory.
  //
  // Built-in tiles:  "empty", "solid", "oneway", "playerStart"
  // Anything else is an entity name from the entities/ registry, with an
  // optional argument after ":" (e.g. "powerup:shield", "spike:down").
  legend: {
    ".": "empty",
    "#": "solid",                 // solid block
    "=": "oneway",                // thin platform: jump up through, ↓+jump to drop
    "P": "playerStart",
    "X": "exit",                  // level end portal (locked while a boss lives)
    "K": "checkpoint",
    "C": "core",                  // energy core (score)
    "S": "secretCore",            // hidden bonus core
    "%": "fakeWall",              // looks solid, can be walked through (hide secrets!)
    "^": "spike",                 // also "spike:down", "spike:left", "spike:right"
    "v": "spike:down",
    "E": "patrolBot",             // walks, turns at walls/ledges — stomp it
    "D": "drone",                 // hovers, chases when close
    "T": "turret",                // fires aimed bolts ("turret:ceiling" hangs)
    "H": "charger",               // armored until it crashes into a wall
    "N": "sentinel",              // shield blocks attacks from the front
    "Y": "spiker",                // spiky top — dash or shoot it
    "M": "movingPlatform:h",      // 3 tiles wide, moves horizontally
    "m": "movingPlatform:v",      // moves vertically
    "F": "fallingPlatform",       // drops after you stand on it, respawns
    "|": "laser:v",               // ceiling emitter, beam goes down
    "-": "laser:h",               // wall emitter, beam goes right
    "Z": "electric",              // solid floor that sparks in cycles
    "Q": "crusher",               // 2×2 block that slams down (place top-left cell)
    "~": "gravityField",          // low-gravity zone (paint an area)
    "R": "dashRefill",            // crystal that restores the mid-air dash
    "G": "gate",                  // closes while a boss fight is running
    "W": "warden",                // mini-boss
    "B": "mainframe",             // final boss
    "u": "powerup:shield",
    "g": "powerup:magnet",
    "s": "powerup:speed",
    "h": "powerup:health",
  },

  // Optional per-entity settings. "at" is [column, row] of the character.
  // Any simple value is copied onto that entity, so these depend on the type:
  //   patrolBot / spiker / sentinel / charger: speed, range (tiles), dir:"right"
  //   drone:          speed, range, sight
  //   turret:         rate (s), range (tiles), bulletSpeed, dir:"left"|"right"|"up"|"down"
  //   movingPlatform: range (tiles, negative = left/up), speed, width (tiles), offset (frames)
  //   laser/electric: on (s), off (s; 0 = always on), offset (s)
  //   crusher:        delay (s), offset (s), fallSpeed, riseSpeed
  //   warden:         hp, speedMul, title, arena: [col, row, cols, rows]
  //   mainframe:      hp, title, arena: [col, row, cols, rows]
  entityOverrides: [
    { at: [13, 9], speed: 1.5, range: 3 },
    { at: [29, 7], sight: 4 },
  ],

  // Optional events. When the player enters the rectangle (in tiles) the
  // actions run once (set once:false to repeat each time it is entered).
  // Action types:
  //   { type: "hint", text: "…", time: 4 }        (use {jump} {dash} {shoot} {move} {down} for key names)
  //   { type: "banner", text: "…", sub: "…", time: 2.5 }
  //   { type: "pan", to: [col, row], time: 2 }     dialogue-free camera cutscene
  //   { type: "shake", amount: 8 }
  //   { type: "particles", at: [col, row], color: "#ff3df0" }
  //   { type: "flag", name: "anything", value: true }
  scripts: [
    { at: [4, 0], size: [1, 12], actions: [{ type: "hint", text: "Welcome to your new level!", time: 3 }] },
    { at: [24, 0], size: [1, 12], actions: [{ type: "pan", to: [38, 9], time: 1.5 }] },
  ],
});

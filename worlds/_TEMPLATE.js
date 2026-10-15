/* =========================================================================
 * worlds/_TEMPLATE.js — copy this file to make a new world.
 *
 *   1. Copy it to worlds/world02.js and fill in the fields below (pure data).
 *   2. Create the folder levels/world02/ and put its level files there
 *      (each one made from levels/_TEMPLATE.js). Level ids must be unique
 *      inside the world.
 *   3. Add "world02.js" to WORLD_FILES in worlds/index.js.
 *
 * A world unlocks once the previous world's boss is beaten. Abilities and
 * weapons from earlier worlds carry over automatically.
 * Tip: levels/_archive/ holds finished levels you can adapt as a start.
 * This template is not listed in worlds/index.js, so it never loads.
 * ========================================================================= */
registerWorld({
  // Unique number (save-game key). Worlds play in worlds/index.js order.
  id: 99,

  // Shown on the world select screen.
  name: "My New World",

  // Folder under levels/ holding this world's level files.
  folder: "world99",

  // Default look for every level in the world (a level's own theme wins).
  //   style: "boot" | "stream" | "server" | "orbit" | "mainframe"
  //   skins: per-entity look overrides, keyed by entity name. Any simple
  //          property is copied onto every instance, e.g. colours:
  //          { spike: { color: "#7dff4a", fill: "#14300c" }, patrolBot: { color: "#ffb400" } }
  theme: {
    bgTop: "#050818", bgBottom: "#0a1a3a", accent: "#00f0ff", gridColor: "#0b3a5a", style: "boot",
    skins: {},
  },

  // Level files in play order (inside levels/<folder>/).
  levels: ["level01.js"],

  // Abilities this world teaches. Grant each one through a level's `unlocks`.
  // Known: "doubleJump", "dash", "pulse" (gives the Pulse Blaster), "hpUp"
  abilities: [],

  // Enemy and hazard types this world uses (entity names). The validator
  // warns when a level uses a type that is not listed here.
  enemies: ["patrolBot", "drone"],
  hazards: ["spike", "movingPlatform"],

  // The world boss: the level file it is in, and its entity name. Finishing
  // that level unlocks the next world.
  boss: { level: "level05.js", entity: "warden" },

  // Weapons: owned from the start of the world, and awarded for finishing a
  // level (keyed by level file). Weapons can also be placed in maps:
  // "weapon:arcCannon".
  weapons: { start: [], rewards: { "level01.js": ["scatterBurst"] } },
});

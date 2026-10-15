/* worlds/world03.js — "Pixel World": retro 8-bit look, chunky pixels and a
 * limited (PICO-8) palette. World 3 of 6 — harder than Hacking World.
 * Unlocks after World 2's boss. Its castle climb adapts levels/_archive/level09. */
registerWorld({
  id: 3,
  name: "Pixel World",
  folder: "world03",
  theme: {
    bgTop: "#000000", bgBottom: "#1d2b53", accent: "#00e436", gridColor: "#7e2553", style: "pixel",
    tileStyle: "pixel", tileFill: "#ab5236", tileLight: "#ffccaa", tileDark: "#5f574f",
    skins: {
      spike: { color: "#c2c3c7", fill: "#5f574f", pixel: true },
    },
  },
  // One long level for the whole world, split into named sections.
  levels: ["world.js"],

  // Taught one per section (pickups in the level): Pixel Shrink (1), Block Place (2), Rewind (3).
  abilities: ["shrink", "blockPlace", "rewind"],

  enemies: ["pixelSlime", "blockBat", "bouncingSquare"],
  hazards: ["vanishBlock", "spike", "pixelWall", "halfBlock", "movingPlatform"],

  boss: { level: "world.js", entity: "glitchKing" },

  // Weapon reward: found as a pickup in the level (and kept once the world is cleared).
  weapons: { start: [], rewards: { "world.js": ["pixelBomb"] } },
});

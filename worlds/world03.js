/* worlds/world03.js — "Pixel World": retro 8-bit look, chunky pixels and a
 * limited (PICO-8) palette. World 3 of 6 — harder than Hacking World.
 * Unlocks after World 2's boss. Level 5 adapts levels/_archive/level09. */
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
  levels: ["level01.js", "level02.js", "level03.js", "level04.js", "level05.js"],

  // Taught one per level: Pixel Shrink (1), Block Place (2), Rewind (3).
  abilities: ["shrink", "blockPlace", "rewind"],

  enemies: ["pixelSlime", "blockBat", "bouncingSquare"],
  hazards: ["vanishBlock", "spike", "pixelWall", "halfBlock", "movingPlatform"],

  boss: { level: "level05.js", entity: "glitchKing" },

  // Pixel Bomb is awarded for clearing level 3, in time for levels 4-5.
  weapons: { start: [], rewards: { "level03.js": ["pixelBomb"] } },
});

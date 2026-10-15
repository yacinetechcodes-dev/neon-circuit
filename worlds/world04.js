/* worlds/world04.js — "Windows 10 World": a parody desktop. Every shape is
 * original and generic (plain window frames, plain squares for title-bar
 * buttons, folder/file blocks) — no real logos, icons or trademarks are used.
 * World 4 of 6: harder than Pixel World. Unlocks after World 3's boss.
 * Its Error Gauntlet adapts levels/_archive/level06, File Explorer adapts level08. */
registerWorld({
  id: 4,
  name: "Windows 10 World",
  folder: "world04",
  theme: {
    bgTop: "#0b3d91", bgBottom: "#1e88e5", accent: "#1565c0", gridColor: "#4fc3ff", style: "desktop",
    tileStyle: "window", tileFill: "#e9eff7", tileDark: "#b8c6d8",
    skins: {
      spike: { color: "#e53935", fill: "#7a1f1d" },
    },
  },
  // One long level for the whole world, split into named sections.
  levels: ["world.js"],

  // Taught one per section (pickups in the level): Minimize (1), Maximize (2), Alt-Tab (3).
  abilities: ["minimize", "maximize", "altTab"],

  enemies: ["popupWindow", "errorBox", "spinLoader"],
  hazards: ["closingWindow", "bluePanel", "dragTrap", "smashBlock", "slotBlock", "tabWindow", "spike",
    "switch", "door", "dashRefill"],

  boss: { level: "world.js", entity: "blueScreenBeast" },

  // Weapon reward: found as a pickup in the level (and kept once the world is cleared).
  weapons: { start: [], rewards: { "world.js": ["popupShotgun"] } },
});

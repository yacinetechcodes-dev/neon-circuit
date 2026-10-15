/* worlds/world04.js — "Windows 10 World": a parody desktop. Every shape is
 * original and generic (plain window frames, plain squares for title-bar
 * buttons, folder/file blocks) — no real logos, icons or trademarks are used.
 * World 4 of 6: harder than Pixel World. Unlocks after World 3's boss.
 * Level 2 adapts levels/_archive/level06, level 3 adapts level08. */
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
  levels: ["level01.js", "level02.js", "level03.js", "level04.js", "level05.js"],

  // Taught one per level: Minimize (1), Maximize (2), Alt-Tab (3).
  abilities: ["minimize", "maximize", "altTab"],

  enemies: ["popupWindow", "errorBox", "spinLoader"],
  hazards: ["closingWindow", "bluePanel", "dragTrap", "smashBlock", "slotBlock", "tabWindow", "spike",
    "switch", "door", "dashRefill"],

  boss: { level: "level05.js", entity: "blueScreenBeast" },

  // Popup Shotgun is awarded for clearing level 3, in time for levels 4-5.
  weapons: { start: [], rewards: { "level03.js": ["popupShotgun"] } },
});

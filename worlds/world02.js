/* worlds/world02.js — "Hacking World": terminal green on black, falling code,
 * file-system corridors, firewalls and glitches. Unlocks after World 1's boss.
 * Levels 2-5 adapt layouts from levels/_archive/ (06, 08, 07, 10). */
registerWorld({
  id: 2,
  name: "Hacking World",
  folder: "world02",
  theme: {
    bgTop: "#000703", bgBottom: "#001a0b", accent: "#39ff88", gridColor: "#0a3a1c", style: "hack",
    skins: {
      spike: { color: "#39ff88", fill: "#0c2a16" },
    },
  },
  // One long level for the whole world, split into named sections.
  levels: ["world.js"],

  // Taught one per section (pickups in the level): Data Dash (1), Freeze Process (2), Root Access (3).
  abilities: ["dataDash", "freeze", "rootAccess"],

  enemies: ["avDrone", "firewallWall", "bugCrawler", "bitBug", "trojan"],
  hazards: ["glitchBlock", "timedGate", "laserWall", "lockedGate", "spike", "teleporter", "switch", "door",
    "dashRefill", "flipField", "heavyField", "gravityField", "movingPlatform", "fallingPlatform"],

  boss: { level: "world.js", entity: "adminDaemon" },

  // Weapon reward: found as a pickup in the level (and kept once the world is cleared).
  weapons: { start: [], rewards: { "world.js": ["virusLauncher"] } },
});

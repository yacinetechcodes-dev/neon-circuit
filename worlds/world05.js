/* worlds/world05.js — "Apocalypse World": a ruined city of broken machines
 * under an orange sky — smoke, rust, sparks, collapsing buildings.
 * World 5 of 6: harder than Windows 10 World. Unlocks after World 4's boss.
 * Its Fallen Tower section adapts levels/_archive/level09 (the Overclock Tower climb). */
registerWorld({
  id: 5,
  name: "Apocalypse World",
  folder: "world05",
  theme: {
    bgTop: "#3a1206", bgBottom: "#ff8a3a", accent: "#ff7a1a", gridColor: "#5a2a14", style: "ruin",
    tileStyle: "rust", tileFill: "#4a3428", tileDark: "#3a2a22",
    skins: {
      spike: { color: "#c9c2ba", fill: "#5d5550" },
    },
  },
  // One long level for the whole world, split into named sections.
  levels: ["world.js"],

  // Taught one per section (pickups in the level): Grapple Hook (1), Ground Slam (2), Jetpack Burst (3).
  abilities: ["grapple", "groundSlam", "jetpack"],

  enemies: ["scrapCrawler", "rocketDrone", "wreckerBot"],
  hazards: ["collapseFloor", "fireVent", "debrisDrop", "toxic", "crackedFloor", "crackedWall", "grappleAnchor",
    "spike", "gate"],

  boss: { level: "world.js", entity: "wreckerTitan" },

  // Weapon reward: found as a pickup in the Scrapyard section (cracked walls
  // after it need a rocket), and kept once the world is cleared.
  weapons: { start: [], rewards: { "world.js": ["rocketLauncher"] } },
});

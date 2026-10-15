/* worlds/world01.js — "Tutorial World": the original five levels. */
registerWorld({
  id: 1,
  name: "Tutorial World",
  folder: "world01",
  theme: { bgTop: "#050818", bgBottom: "#0a1a3a", accent: "#00f0ff", gridColor: "#0b3a5a", style: "boot", skins: {} },
  // One long level for the whole world, split into named sections.
  levels: ["world.js"],
  abilities: ["doubleJump", "dash", "pulse"],
  enemies: ["patrolBot", "drone", "turret", "charger", "sentinel", "spiker", "warden"],
  hazards: ["spike", "laser", "electric", "crusher", "movingPlatform", "fallingPlatform", "gravityField", "dashRefill"],
  boss: { level: "world.js", entity: "mainframe" },
  // Weapon rewards: found as pickups in the level (and kept once the world is cleared).
  weapons: { start: [], rewards: { "world.js": ["arcCannon", "scatterBurst"] } },
});

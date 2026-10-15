/* worlds/world01.js — "Tutorial World": the original five levels. */
registerWorld({
  id: 1,
  name: "Tutorial World",
  folder: "world01",
  theme: { bgTop: "#050818", bgBottom: "#0a1a3a", accent: "#00f0ff", gridColor: "#0b3a5a", style: "boot", skins: {} },
  levels: ["level01.js", "level02.js", "level03.js", "level04.js", "level05.js"],
  abilities: ["doubleJump", "dash", "pulse", "hpUp"],
  enemies: ["patrolBot", "drone", "turret", "charger", "sentinel", "spiker", "warden"],
  hazards: ["spike", "laser", "electric", "crusher", "movingPlatform", "fallingPlatform", "gravityField"],
  boss: { level: "level05.js", entity: "mainframe" },
  weapons: { start: [], rewards: { "level04.js": ["arcCannon"], "level05.js": ["scatterBurst"] } },
});

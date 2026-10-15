/* worlds/world05.js — "Apocalypse World": a ruined city of broken machines
 * under an orange sky — smoke, rust, sparks, collapsing buildings.
 * World 5 of 6: harder than Windows 10 World. Unlocks after World 4's boss.
 * Level 3 adapts levels/_archive/level09 (the Overclock Tower climb). */
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
  levels: ["level01.js", "level02.js", "level03.js", "level04.js", "level05.js"],

  // Taught one per level: Grapple Hook (1), Ground Slam (2), Jetpack Burst (3).
  abilities: ["grapple", "groundSlam", "jetpack"],

  enemies: ["scrapCrawler", "rocketDrone", "wreckerBot"],
  hazards: ["collapseFloor", "fireVent", "debrisDrop", "toxic", "crackedFloor", "crackedWall", "grappleAnchor",
    "spike", "gate"],

  boss: { level: "level05.js", entity: "wreckerTitan" },

  // Rocket Launcher is awarded for clearing level 2: level 3 onward has
  // cracked walls only a rocket can open.
  weapons: { start: [], rewards: { "level02.js": ["rocketLauncher"] } },
});

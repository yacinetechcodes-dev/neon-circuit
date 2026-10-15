/* worlds/world06.js — "Linux World": the final world. A command-line
 * aesthetic made only of original, generic shapes (no logos or mascots):
 * prompts, directory trees as level layouts, package crates, process monitors.
 * World 6 of 6: the hardest. Unlocks after World 5's boss.
 * Level 3 adapts levels/_archive/level08 (Quantum Maze tiers), level 5 the
 * gauntlet of levels/_archive/level10 (Core Meltdown). */
registerWorld({
  id: 6,
  name: "Linux World",
  folder: "world06",
  theme: {
    bgTop: "#070707", bgBottom: "#1b1b1b", accent: "#fcaf3e", gridColor: "#2e3436", style: "term",
    tileStyle: "term", tileFill: "#1f1f1f", tileDark: "#2a2a2a",
    skins: {
      spike: { color: "#eeeeec", fill: "#555753" },
    },
  },
  levels: ["level01.js", "level02.js", "level03.js", "level04.js", "level05.js"],

  // Taught one per level: Sudo (1), Pipe (2), Kill Process (3).
  abilities: ["sudo", "pipe", "killProcess"],

  enemies: ["zombieProcess", "memoryLeak", "kernelPanicOrb"],
  hazards: ["permDoor", "forkBomb", "loopPlatform", "packageBox", "spike", "gate",
    "switch", "door", "teleporter"],

  boss: { level: "level05.js", entity: "kernelCore" },

  // Grep Beam is awarded for clearing level 3, in time for levels 4-5.
  weapons: { start: [], rewards: { "level03.js": ["grepBeam"] } },
});

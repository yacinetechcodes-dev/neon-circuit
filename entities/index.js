/* =========================================================================
 * entities/index.js — entity manifest. Files load in this order.
 * To add a new enemy / hazard / power-up: create a file in this folder that
 * calls registerEntity("myName", {...}) and add its file name below.
 * ========================================================================= */
const ENTITY_FILES = [
  "player.js",
  "pickups.js",
  "hazards.js",
  "enemies.js",
  "boss_warden.js",
  "boss_mainframe.js",
  "firewall.js",      // level 6: moving laser walls, timed gates
  "gravity.js",       // level 7: gravity-flip and heavy-gravity zones
  "quantum.js",       // level 8: teleporters, switches, doors
  "boss_kernel.js",   // level 10: final boss
  "hacking.js",       // World 2: antivirus drones, firewall walls, bugs, trojans, glitch blocks, locked gates
  "boss_daemon.js",   // World 2 boss: Admin Daemon
  "pixel.js",         // World 3: slimes, block bats, bouncing squares, vanish blocks, pixel walls, half blocks
  "boss_glitchking.js", // World 3 boss: Glitch King
  "desktop.js",       // World 4: popups, error boxes, loaders, closing windows, blue panels, drag traps
  "boss_bluescreen.js", // World 4 boss: Blue Screen Beast
  "apocalypse.js",    // World 5: scrap crawlers, rocket drones, wreckers, collapse floors, vents, debris, toxic
  "boss_titan.js",    // World 5 boss: Wrecker Titan
  "linux.js",         // World 6: zombie processes, memory leaks, panic orbs, fork bombs, perm doors, loop platforms
  "boss_kernelcore.js", // World 6 boss (final): Kernel Core
  "decor.js",         // scenery for every world: text signs and animated props
];

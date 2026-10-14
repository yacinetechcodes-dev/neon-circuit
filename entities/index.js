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
];

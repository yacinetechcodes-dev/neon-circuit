/* =========================================================================
 * core/loader.js — loads every file listed in entities/index.js and
 * levels/index.js (in order) by injecting <script> tags, then starts the
 * game. Plain <script> tags work from file://, so no server is needed.
 * ========================================================================= */
"use strict";

(function boot() {
  const canvas = document.getElementById("game");
  Game.init(canvas);
  Game.draw(); // "LOADING…"

  const queue = []
    .concat(ENTITY_FILES.map((f) => "entities/" + f))
    .concat(LEVEL_FILES.map((f) => "levels/" + f));

  function next() {
    const file = queue.shift();
    if (!file) { Game.start(); return; }
    const s = document.createElement("script");
    s.src = file;
    s.onload = next;
    s.onerror = () => {
      console.error(`[loader] could not load "${file}" — check the file name in the manifest.`);
      Game.loadErrors.push(file);
      next();
    };
    document.body.appendChild(s);
  }
  next();
})();

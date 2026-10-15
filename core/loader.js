/* =========================================================================
 * core/loader.js — loads, in order:
 *   1. every file in entities/index.js
 *   2. every file in weapons/index.js
 *   3. every world in worlds/index.js
 *   4. each world's level files from levels/<world.folder>/
 * by injecting <script> tags, then starts the game. Plain <script> tags work
 * from file://, so no server is needed.
 * ========================================================================= */
"use strict";

(function boot() {
  const canvas = document.getElementById("game");
  Game.init(canvas);
  Game.draw(); // "LOADING…"

  const queue = []
    .concat(ENTITY_FILES.map((f) => ({ src: "entities/" + f })))
    .concat((typeof WEAPON_FILES !== "undefined" ? WEAPON_FILES : []).map((f) => ({ src: "weapons/" + f })))
    .concat(WORLD_FILES.map((f) => ({ src: "worlds/" + f })));
  let levelsQueued = false;

  function queueLevels() {
    levelsQueued = true;
    for (const w of Registry.worlds) {
      const folder = w.folder || "world" + String(w.id).padStart(2, "0");
      for (const f of w.levels || []) queue.push({ src: `levels/${folder}/${f}`, world: w, file: f });
    }
  }

  function next() {
    if (!queue.length && !levelsQueued) queueLevels();
    const item = queue.shift();
    if (!item) {
      Registry._loadingWorld = null;
      Game.start();
      return;
    }
    Registry._loadingWorld = item.world || null;
    Registry._loadingFile = item.file || null;
    const s = document.createElement("script");
    s.src = item.src;
    s.onload = next;
    s.onerror = () => {
      console.error(`[loader] could not load "${item.src}" — check the file name in the manifest.`);
      Game.loadErrors.push(item.src);
      next();
    };
    document.body.appendChild(s);
  }
  next();
})();

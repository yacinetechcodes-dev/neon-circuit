/* =========================================================================
 * core/level.js — turns a level definition (pure data) into a tile grid
 * plus a list of entity spawns, and validates it.
 * ========================================================================= */
"use strict";

// Tile codes stored in the collision grid.
const T_EMPTY = 0, T_SOLID = 1, T_ONEWAY = 2, T_HIDDEN_SOLID = 3;

/**
 * Legend values every level gets for free. A level's own `legend` is merged
 * on top, so it can override or add characters.
 *   "solid" / "oneway" / "empty" / "playerStart" are built into the engine.
 *   Anything else is an entity name from the registry, optionally followed
 *   by ":arg" (e.g. "powerup:shield", "spike:down").
 */
const DEFAULT_LEGEND = {
  ".": "empty", " ": "empty",
  "#": "solid", "=": "oneway",
  "P": "playerStart", "X": "exit", "K": "checkpoint",
  "C": "core", "S": "secretCore", "%": "fakeWall",
  "^": "spike", "v": "spike:down", "{": "spike:left", "}": "spike:right",
  "E": "patrolBot", "D": "drone", "T": "turret", "t": "turret:ceiling",
  "H": "charger", "N": "sentinel", "Y": "spiker",
  "M": "movingPlatform:h", "m": "movingPlatform:v", "F": "fallingPlatform",
  "|": "laser:v", "-": "laser:h", "Z": "electric", "Q": "crusher",
  "~": "gravityField", "R": "dashRefill", "G": "gate",
  "W": "warden", "B": "mainframe",
  "u": "powerup:shield", "g": "powerup:magnet", "s": "powerup:speed", "h": "powerup:health",
};

const LevelLoader = {
  /**
   * Validate a level definition. Returns { errors: [], warnings: [] }.
   * Errors make the level unplayable; warnings are only logged.
   */
  validate(def) {
    const errors = [], warnings = [];
    const tag = `[level ${def && def.id} "${def && def.name}"]`;
    if (!def.map || !Array.isArray(def.map) || def.map.length === 0) {
      errors.push("has no map (expected an array of strings).");
      return this._report(tag, errors, warnings);
    }
    const legend = Object.assign({}, DEFAULT_LEGEND, def.legend || {});
    const width = def.map[0].length;
    let starts = 0, exits = 0;
    const unknown = new Set();

    def.map.forEach((row, r) => {
      if (typeof row !== "string") { errors.push(`row ${r} is not a string.`); return; }
      if (row.length !== width) {
        errors.push(`row ${r} has length ${row.length}, expected ${width} (uneven row lengths).`);
      }
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        const val = legend[ch];
        if (val === undefined) { unknown.add(ch); continue; }
        if (val === "playerStart") starts++;
        const name = String(val).split(":")[0];
        if (name === "exit") exits++;
      }
    });
    for (const ch of unknown) errors.push(`unknown legend character "${ch}" in map.`);

    // Legend values must be engine built-ins or registered entities.
    for (const [ch, val] of Object.entries(legend)) {
      const name = String(val).split(":")[0];
      if (["empty", "solid", "oneway", "playerStart"].includes(name)) continue;
      if (!Registry.entities[name]) {
        // Only an error if the character is actually used.
        if (def.map.some((row) => row.includes(ch))) {
          errors.push(`legend "${ch}" → "${val}" is not a registered entity type.`);
        }
      }
    }

    if (starts === 0 && !def.playerStart) errors.push("has no player start (no 'P' tile and no playerStart).");
    if (starts > 1) warnings.push(`has ${starts} player starts; the first one is used.`);
    if (exits === 0) errors.push("has no exit ('X' tile mapped to \"exit\").");

    for (const o of def.entityOverrides || []) {
      if (!o.at || o.at.length !== 2) { warnings.push("an entityOverride is missing at:[col,row]."); continue; }
      const [c, r] = o.at;
      const ch = def.map[r] && def.map[r][c];
      if (!ch || legend[ch] === "empty" || ["solid", "oneway"].includes(legend[ch])) {
        warnings.push(`entityOverride at [${c},${r}] does not point at an entity (found "${ch || "outside map"}").`);
      }
    }
    if (def.gravity != null && !(def.gravity > 0)) errors.push("gravity must be a positive number.");
    return this._report(tag, errors, warnings);
  },

  _report(tag, errors, warnings) {
    for (const e of errors) console.error(`${tag} ERROR: ${e}`);
    for (const w of warnings) console.warn(`${tag} warning: ${w}`);
    return { errors, warnings };
  },

  /** Build runtime data: { w, h, tiles, spawns, start }. Assumes validate() passed. */
  parse(def) {
    const legend = Object.assign({}, DEFAULT_LEGEND, def.legend || {});
    const h = def.map.length;
    const w = def.map[0].length;
    const tiles = new Uint8Array(w * h);
    const spawns = [];
    let start = null;
    const overrides = {};
    for (const o of def.entityOverrides || []) if (o.at) overrides[o.at[0] + "," + o.at[1]] = o;

    for (let r = 0; r < h; r++) {
      const row = def.map[r];
      for (let c = 0; c < w; c++) {
        const val = legend[row[c]];
        if (!val || val === "empty") continue;
        if (val === "solid") { tiles[r * w + c] = T_SOLID; continue; }
        if (val === "oneway") { tiles[r * w + c] = T_ONEWAY; continue; }
        if (val === "playerStart") { if (!start) start = { x: c, y: r }; continue; }
        const [name, arg] = String(val).split(":");
        const ov = overrides[c + "," + r];
        const opts = Object.assign({}, ov || {});
        delete opts.at;
        spawns.push({ name, arg, col: c, row: r, opts });
      }
    }
    if (!start) start = { x: def.playerStart.x, y: def.playerStart.y };
    return { w, h, tiles, spawns, start };
  },
};

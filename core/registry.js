/* =========================================================================
 * core/registry.js — the registries the engine reads from.
 *
 *   registerEntity(name, def)  → used by files in entities/
 *   registerWorld(def)         → used by files in worlds/
 *   registerLevel(def)         → used by files in levels/worldNN/
 *   registerWeapon(name, def)  → used by files in weapons/ (see core/weapons.js)
 *
 * The engine never hard-codes enemy / hazard / pickup types: a level's
 * legend maps a map character to an entity name, and the engine looks the
 * name up here. Adding a new type = one new file that calls registerEntity.
 * ========================================================================= */
"use strict";

const Registry = {
  entities: {},        // name → definition
  weapons: {},         // name → weapon definition (core/weapons.js)
  worlds: [],          // world definitions in manifest order; each gets .levelDefs
  levels: [],          // every loaded level, flat (for tools / validation)
  _loadingWorld: null, // set by the loader while a world's level files load
};

/**
 * Register an entity type.
 *
 * def fields (all optional except draw/update as needed):
 *   size: [w, h]          hitbox in pixels (default 32×32)
 *   anchor: "bottom" | "center" | "top" | "topleft"
 *                         where the hitbox sits inside its map cell
 *   layer: 0..3           draw order (0 = behind everything, 3 = in front)
 *   props: {...}          default properties copied onto each instance
 *                         (e.g. enemy:true, hp:2, stompable:true, solid:true)
 *   init(e, world, arg)   called once at spawn; arg = text after ":" in legend
 *   update(e, world)      called every frame while active (near the camera)
 *   draw(e, ctx, world)   draw in world coordinates
 *   onTouch(e, world, p)  called when the player overlaps the entity
 *   onDamage(e, world, amount, source) → return true if damage was applied
 *   onDeath(e, world)     called when hp reaches 0
 *   onRespawn(e, world)   called when the player respawns at a checkpoint
 */
function registerEntity(name, def) {
  if (Registry.entities[name]) {
    console.warn(`[registry] entity "${name}" registered twice — overriding.`);
  }
  def.name = name;
  Registry.entities[name] = def;
}

/** Register a world (see worlds/_TEMPLATE.js for every field). */
function registerWorld(def) {
  if (!def || typeof def !== "object" || def.id == null) {
    console.error("[registry] registerWorld() needs an object with an id.");
    return;
  }
  if (Registry.worlds.some((w) => w.id === def.id)) {
    console.error(`[registry] world id ${def.id} registered twice — ignoring the second one.`);
    return;
  }
  def.levelDefs = [];
  Registry.worlds.push(def);
}

/** Register a level (see levels/_TEMPLATE.js). It joins the world being loaded. */
function registerLevel(def) {
  if (!def || typeof def !== "object") {
    console.error("[registry] registerLevel() needs an object.");
    return;
  }
  const world = Registry._loadingWorld;
  if (!world) {
    console.error(`[registry] level "${def.name}" was loaded outside a world — list it in a worlds/ file.`);
    return;
  }
  def.world = world;
  def.file = Registry._loadingFile;
  const existing = world.levelDefs.findIndex((l) => l.id === def.id);
  if (existing >= 0) {
    console.warn(`[registry] level id ${def.id} registered twice in world ${world.id} — overriding.`);
    world.levelDefs[existing] = def;
  } else {
    world.levelDefs.push(def);
  }
  Registry.levels.push(def);
}

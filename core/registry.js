/* =========================================================================
 * core/registry.js — the two registries the engine reads from.
 *
 *   registerEntity(name, def)  → used by files in entities/
 *   registerLevel(def)         → used by files in levels/
 *
 * The engine never hard-codes enemy / hazard / pickup types: a level's
 * legend maps a map character to an entity name, and the engine looks the
 * name up here. Adding a new type = one new file that calls registerEntity.
 * ========================================================================= */
"use strict";

const Registry = {
  entities: {},   // name → definition
  levels: [],     // level definitions in load (= manifest) order
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

/** Register a level (see levels/_TEMPLATE.js for every field). */
function registerLevel(def) {
  if (!def || typeof def !== "object") {
    console.error("[registry] registerLevel() needs an object.");
    return;
  }
  const existing = Registry.levels.findIndex((l) => l.id === def.id);
  if (existing >= 0) {
    console.warn(`[registry] level id ${def.id} registered twice — overriding.`);
    Registry.levels[existing] = def;
  } else {
    Registry.levels.push(def);
  }
}

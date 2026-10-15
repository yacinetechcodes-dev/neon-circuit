/* =========================================================================
 * core/weapons.js — weapon registry, the shared player projectile, and a
 * pickup that hands out weapons inside levels.
 *
 *   registerWeapon(name, def)   → one small file per weapon in weapons/
 *   Weapons.shot(world, p, o)   → helper for def.fire() to spawn a projectile
 *
 * def fields:
 *   label     HUD name ("PULSE")          color   HUD / projectile colour
 *   order     sort position in the list   cooldown  frames between shots
 *   ammo      max charges (null = unlimited)
 *   regen     frames to recharge one charge
 *   icon(ctx, cx, cy, color)              small HUD icon
 *   fire(world, player)                   spawn the projectile(s)
 * ========================================================================= */
"use strict";

function registerWeapon(name, def) {
  if (Registry.weapons[name]) console.warn(`[weapons] "${name}" registered twice — overriding.`);
  def.name = name;
  def.order = def.order == null ? 99 : def.order;
  Registry.weapons[name] = def;
}

const Weapons = {
  get(name) { return Registry.weapons[name]; },

  /** Known weapon names sorted by their order. */
  sort(names) {
    return [...new Set(names)].filter((n) => Registry.weapons[n])
      .sort((a, b) => Registry.weapons[a].order - Registry.weapons[b].order);
  },

  /** Spawn one player projectile from the muzzle.
   *  o: { speed, angle (radians, 0 = forward), dmg, life, kind, color, size, pierce } */
  shot(world, p, o) {
    const dir = p.facing;
    const a = o.angle || 0;
    const size = o.size || 10;
    const sx = dir > 0 ? p.x + p.w : p.x - size;
    const e = world.spawn("playerShot", sx, p.y + 13 - size / 2, {});
    if (!e) return null;
    e.w = size; e.h = size;
    e.vx = Math.cos(a) * o.speed * dir;
    e.vy = Math.sin(a) * o.speed;
    e.dmg = o.dmg || 1;
    e.life = o.life || 45;
    e.kind = o.kind || "pulse";
    e.color = o.color || "#7dff4a";
    e.pierce = o.pierce || 0;
    return e;
  },
};

// ------------------------------------------------------------- playerShot
// Shared projectile for every weapon. Hits enemies (respecting shields and
// shootable flags) and cancels enemy bullets.
registerEntity("playerShot", {
  size: [10, 10],
  layer: 2,
  props: { transient: true, alwaysActive: true },
  init(e) { e.life = 45; e.hit = []; e.t0 = Math.random() * 6; },
  update(e, world) {
    e.x += e.vx; e.y += e.vy;
    if (--e.life <= 0) { e.dead = true; return; }
    if (Physics.solidAtPx(world, U.cx(e), U.cy(e))) {
      e.dead = true;
      world.particles.burst(U.cx(e), U.cy(e), 6, e.color, 2);
      return;
    }
    for (const o of world.entities) {
      if (o.dead || !o.active || o === e || e.hit.includes(o) || !U.overlap(e, o)) continue;
      if (o.name === "bullet" || o.shootDown) {
        o.dead = true;
        world.particles.burst(U.cx(o), U.cy(o), 8, "#ffffff", 3);
        sfx.play("hit");
        if (e.pierce-- <= 0) { e.dead = true; return; }
        continue;
      }
      if (!o.enemy) continue;
      e.hit.push(o);
      const blocked = (o.def.blocks && o.def.blocks(o, world, U.sign(e.vx)) && !(world.player.sudo > 0)) || !U.flag(o.shootable, o, world);
      if (blocked) {
        sfx.play("blocked");
        world.particles.burst(U.cx(e), U.cy(e), 8, "#5ef0ff", 3);
        world.particles.ring(U.cx(e), U.cy(e), "#5ef0ff", 10, 10);
        e.dead = true;
        return;
      }
      world.damageEntity(o, e.dmg, "shot");
      if (e.pierce-- <= 0) { e.dead = true; return; }
    }
  },
  draw(e, ctx, world) {
    const cx = U.cx(e), cy = U.cy(e);
    switch (e.kind) {
      case "arc": {
        U.glow(ctx, cx, cy, 30, e.color, 0.9);
        ctx.fillStyle = "#e8fdff";
        ctx.beginPath(); ctx.arc(cx, cy, e.w / 2 - 2, 0, 6.28); ctx.fill();
        // Crackling arcs around the orb.
        ctx.strokeStyle = e.color; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = world.time * 0.4 + i * 2.1 + e.t0;
          ctx.moveTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6);
          ctx.lineTo(cx + Math.cos(a + 0.5) * (e.w * 0.8), cy + Math.sin(a + 0.5) * (e.w * 0.8));
        }
        ctx.stroke();
        break;
      }
      case "pellet":
        U.glow(ctx, cx, cy, 12, e.color, 0.8);
        ctx.fillStyle = "#fff1cc";
        ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 6.28); ctx.fill();
        break;
      default: // "pulse"
        U.glow(ctx, cx, cy, 16, e.color, 0.9);
        ctx.fillStyle = "#e6ffd6";
        ctx.fillRect(cx - 7, cy - 2, 14, 4);
    }
  },
});

// ------------------------------------------------------------- weapon pickup
// Place in a map with a legend value like "weapon:scatterBurst".
registerEntity("weapon", {
  size: [26, 26],
  anchor: "center",
  init(e, world, arg) {
    e.weapon = arg;
    if (!Registry.weapons[arg]) console.warn(`[weapons] unknown weapon "${arg}" in a level.`);
    if (world.player.weapons.includes(arg)) e.dead = true; // already owned
  },
  onTouch(e, world, p) {
    const def = Registry.weapons[e.weapon];
    if (!def) { e.dead = true; return; }
    p.giveWeapon(e.weapon, true);
    Save.addWeapon(e.weapon);
    e.dead = true;
    world.banner = { text: def.label, sub: UI.keys("{swap}"), t: 120, max: 120, color: def.color };
    world.particles.burst(U.cx(e), U.cy(e), 30, def.color, 5, { glow: true });
    sfx.play("powerup");
  },
  draw(e, ctx, world) {
    const def = Registry.weapons[e.weapon];
    if (!def) return;
    const cx = U.cx(e), cy = U.cy(e) + Math.sin(world.time * 0.05) * 3;
    U.glow(ctx, cx, cy, 34, def.color, 0.6);
    ctx.fillStyle = "#0b1328";
    U.roundRect(ctx, cx - 13, cy - 13, 26, 26, 6); ctx.fill();
    ctx.strokeStyle = def.color; ctx.lineWidth = 2; ctx.stroke();
    if (def.icon) def.icon(ctx, cx, cy, def.color);
  },
});

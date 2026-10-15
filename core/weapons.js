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
    const cx = U.cx(e), cy = U.cy(e), t = world.time;
    switch (e.kind) {
      case "arc": {
        // A ball of lightning: comet tail, crackling arcs, white-hot core.
        Look.comet(ctx, cx, cy, e.vx, e.vy, e.w / 2 - 3, e.color, "#e8fdff");
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = e.color; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = t * 0.4 + i * 1.57 + e.t0;
          let px = cx + Math.cos(a) * 5, py = cy + Math.sin(a) * 5;
          ctx.moveTo(px, py);
          for (let k = 1; k <= 3; k++) { px = cx + Math.cos(a + k * 0.25) * (5 + k * 3.5) + U.rand(-1.5, 1.5); py = cy + Math.sin(a + k * 0.25) * (5 + k * 3.5) + U.rand(-1.5, 1.5); ctx.lineTo(px, py); }
        }
        ctx.stroke();
        ctx.restore();
        break;
      }
      case "pellet":
        Look.comet(ctx, cx, cy, e.vx, e.vy, 2.6, e.color, "#fff1cc");
        break;
      default: { // "pulse": an energy bolt with a stretched tail
        const d = U.sign(e.vx) || 1;
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        const g = ctx.createLinearGradient(cx - d * 24, 0, cx + d * 6, 0);
        g.addColorStop(0, U.rgba(e.color, 0)); g.addColorStop(1, U.rgba(e.color, 0.8));
        ctx.fillStyle = g; ctx.fillRect(Math.min(cx - d * 24, cx + d * 6), cy - 3, 30, 6);
        U.glow(ctx, cx, cy, 18, e.color, 0.9);
        ctx.restore();
        ctx.fillStyle = "#f2ffe6"; U.roundRect(ctx, cx - 7, cy - 2.5, 14, 5, 2.5); ctx.fill();
      }
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
    world.banner = { text: def.label, sub: UI.keys(`${def.desc || ""}   {shoot} fire · {swap} switch`), t: 180, max: 180, color: def.color };
    Save.markSeen("weapon_" + e.weapon);
    Guide.discover("w:" + e.weapon);
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

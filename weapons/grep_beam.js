/* weapons/grep_beam.js — a precise, instant beam straight ahead: it pierces
 * every enemy in its line (1 damage each) and shoots down enemy rockets.
 * Stops at walls and at shields (unless Sudo is active). (World 6 reward) */
sfx.define("grep", (s, t) => {
  s.tone(t, { type: "sawtooth", f0: 1600, f1: 2400, dur: 0.07, vol: 0.06 });
  s.tone(t, { type: "sine", f0: 800, dur: 0.12, vol: 0.06 });
}, 0.06);

registerWeapon("grepBeam", {
  desc: "An instant, precise beam that pierces every enemy in line.",
  label: "GREP",
  color: "#8ae234",
  order: 8,
  cooldown: 22,
  ammo: 4,
  regen: 60,
  range: 15,
  icon(ctx, cx, cy, color) {
    ctx.fillStyle = color;
    ctx.fillRect(cx - 8, cy - 1, 16, 2);
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx - 3, cy - 3, 3.5, 0, 6.28); ctx.stroke();
    ctx.fillRect(cx - 1, cy, 2, 5);
  },
  fire(world, p) {
    const dir = p.facing, y = p.y + 13;
    const x0 = dir > 0 ? p.x + p.w : p.x;
    let x1 = x0;
    // March to the first wall.
    for (let k = 0; k < this.range * TILE; k += 4) {
      const x = x0 + dir * k;
      if (Physics.solidAtPx(world, x, y)) break;
      x1 = x;
    }
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    const hits = world.entities
      .filter((o) => !o.dead && o.active && (o.enemy || o.shootDown || o.name === "bullet") && o.y <= y + 2 && o.y + o.h >= y - 2 && o.x + o.w >= lo && o.x <= hi)
      .sort((a, b) => (U.cx(a) - U.cx(b)) * dir);
    for (const o of hits) {
      if (!o.enemy) { o.dead = true; world.particles.burst(U.cx(o), U.cy(o), 8, "#ffffff", 3); continue; }
      const blocked = (o.def.blocks && o.def.blocks(o, world, dir) && !(p.sudo > 0)) || !U.flag(o.shootable, o, world);
      if (blocked) {
        x1 = dir > 0 ? o.x : o.x + o.w;
        world.particles.ring(x1, y, "#5ef0ff", 10, 10);
        sfx.play("blocked");
        break;
      }
      world.damageEntity(o, 1, "beam");
    }
    const fx = world.spawn("grepBeamFx", Math.min(x0, x1), y - 2, {});
    if (fx) { fx.w = Math.max(2, Math.abs(x1 - x0)); fx.dir = dir; }
    world.particles.burst(x1, y, 8, this.color, 3);
    sfx.play("grep");
  },
});

// The visible beam: a bright line that fades out.
registerEntity("grepBeamFx", {
  size: [10, 4],
  layer: 2,
  props: { transient: true, alwaysActive: true, alwaysDraw: true },
  update(e) { if (e.t > 10) e.dead = true; },
  draw(e, ctx) {
    const k = 1 - e.t / 10;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgba(138,226,52,0.3)"; ctx.fillRect(e.x, e.y - 5 * k - 2, e.w, 10 * k + 6);
    ctx.fillStyle = "#e9ffd4"; ctx.fillRect(e.x, e.y + 1, e.w, 2);
    // Crackle along the beam and match markers.
    ctx.strokeStyle = "rgba(200,255,160,0.7)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(e.x, e.y + 2);
    for (let x = e.x; x < e.x + e.w; x += 10) ctx.lineTo(x, e.y + 2 + U.rand(-4, 4) * k);
    ctx.stroke();
    ctx.fillStyle = "#8ae234";
    for (let x = e.x + 6; x < e.x + e.w; x += 18) ctx.fillRect(x, e.y - 1, 6, 6);
    ctx.restore();
  },
  light(e) { return null; },
});

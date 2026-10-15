/* weapons/pixel_bomb.js — a chunky bomb that bounces twice, then explodes
 * (or blows on contact with an enemy). Hits everything in the blast. (World 3 reward) */
sfx.define("bomb", (s, t) => {
  s.noise(t, { filter: "lowpass", f0: 1400, f1: 80, dur: 0.35, vol: 0.32 });
  s.tone(t, { type: "square", f0: 180, f1: 40, dur: 0.3, vol: 0.12 });
}, 0.08);
sfx.define("bonk", (s, t) => s.tone(t, { type: "square", f0: 300, f1: 200, dur: 0.04, vol: 0.05 }), 0.04);

registerWeapon("pixelBomb", {
  desc: "Bounces, then explodes, hitting everything around it.",
  label: "BOMB",
  color: "#ffa300",
  order: 5,
  cooldown: 34,
  ammo: 3,
  regen: 120,
  icon(ctx, cx, cy, color) {
    ctx.fillStyle = color;
    ctx.fillRect(cx - 5, cy - 3, 10, 10); ctx.fillRect(cx - 3, cy - 5, 6, 2);
    ctx.fillStyle = "#fff1e8"; ctx.fillRect(cx + 1, cy - 8, 2, 3);
  },
  fire(world, p) {
    const b = world.spawn("pixelBombShot", p.facing > 0 ? p.x + p.w : p.x - 14, p.y + 4, {});
    if (b) { b.vx = p.facing * 5; b.vy = -5.5; }
    sfx.play("bonk");
  },
});

registerEntity("pixelBombShot", {
  size: [14, 14],
  layer: 2,
  props: { transient: true, alwaysActive: true, radius: 68, dmg: 3 },
  init(e) { e.life = 110; e.bounces = 0; },
  explode(e, world) {
    if (e.dead) return;
    e.dead = true;
    const cx = U.cx(e), cy = U.cy(e);
    for (const o of world.entities) {
      if (o.dead || !o.active || !o.enemy) continue;
      if (U.dist(cx, cy, U.cx(o), U.cy(o)) <= e.radius + Math.max(o.w, o.h) / 2) world.damageEntity(o, e.dmg, "bomb");
    }
    const fx = world.spawn("bombBlast", cx - e.radius, cy - e.radius, {});
    if (fx) { fx.w = fx.h = e.radius * 2; }
    world.particles.burst(cx, cy, 24, "#ffa300", 6, { shape: "square" });
    world.particles.burst(cx, cy, 12, "#ffec27", 4, { shape: "square" });
    world.particles.emit(cx, cy, { shape: "glow", size: e.radius, life: 12, color: "#ffec27" });
    world.flash(cx, cy, e.radius * 3, "#ffa300", 16);
    world.hitStop = Math.max(world.hitStop || 0, 2);
    world.camera.shake(5);
    sfx.play("bomb");
  },
  update(e, world) {
    e.vy = Math.min(10, e.vy + 0.4);
    const res = Physics.move(world, e, e.vx, e.vy, { solids: true });
    if (res.hitX) e.vx = -e.vx * 0.7;
    if (res.hitY) {
      if (e.vy > 0) { e.bounces++; sfx.play("bonk"); }
      e.vy = -e.vy * 0.62; e.vx *= 0.85;
    }
    if (e.bounces >= 3 || --e.life <= 0) return this.explode(e, world);
    for (const o of world.entities) if (o.enemy && !o.dead && o.active && U.overlap(e, o)) return this.explode(e, world);
    if (e.y > world.ph + 50) e.dead = true;
  },
  draw(e, ctx, world) {
    const x = Math.round(e.x), y = Math.round(e.y), t = world.time;
    const blink = Math.floor(t / Math.max(2, 6 - e.bounces * 1.5)) % 2;
    ctx.fillStyle = "#1d2b53"; ctx.fillRect(x, y + 2, 14, 12);
    ctx.fillStyle = "#ffa300"; ctx.fillRect(x + 2, y + 4, 10, 8);
    ctx.fillStyle = "#ffec27"; ctx.fillRect(x + 2, y + 4, 10, 2);
    ctx.fillStyle = "#fff1e8"; ctx.fillRect(x + 6, y - 2, 2, 4);
    // Fuse spark: blinks faster with every bounce.
    if (blink) { ctx.fillStyle = "#ff004d"; ctx.fillRect(x + 5, y - 5, 4, 4); U.glow(ctx, x + 7, y - 3, 10, "#ff004d", 0.8); }
    if (t % 3 === 0 && Game.state === "play") world.particles.emit(x + 7, y - 3, { vx: U.rand(-1, 1), vy: U.rand(-1.5, -0.5), life: 10, size: 2, color: "#ffec27", shape: "square" });
  },
  light(e) { return [50, "#ffa300", 0.7]; },
});

// Expanding square ring — purely visual.
registerEntity("bombBlast", {
  size: [10, 10],
  layer: 2,
  props: { transient: true, alwaysActive: true, alwaysDraw: true },
  update(e) { if (e.t > 16) e.dead = true; },
  draw(e, ctx) {
    const k = e.t / 16, cx = U.cx(e), cy = U.cy(e), r = (e.w / 2) * (0.4 + k * 0.6);
    const snap = (v) => Math.round(v / 4) * 4;
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = U.rgba("#ffa300", 0.25 * (1 - k)); ctx.fillRect(snap(cx - r), snap(cy - r), snap(r * 2), snap(r * 2));
    ctx.strokeStyle = "#ffec27"; ctx.lineWidth = 8;
    ctx.strokeRect(snap(cx - r), snap(cy - r), snap(r * 2), snap(r * 2));
    ctx.strokeStyle = "#ff004d"; ctx.lineWidth = 4;
    const r2 = r * 0.6;
    ctx.strokeRect(snap(cx - r2), snap(cy - r2), snap(r2 * 2), snap(r2 * 2));
    ctx.globalAlpha = 1;
  },
  light(e) { return [e.w, "#ffa300", 1.2 * (1 - e.t / 16)]; },
});

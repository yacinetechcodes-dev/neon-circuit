/* weapons/rocket_launcher.js — a slow-firing rocket that speeds up and
 * explodes on whatever it hits: area damage to every enemy in the blast, and
 * it breaks cracked walls and floors. (World 5 reward) */
sfx.define("rocketLaunch", (s, t) => {
  s.noise(t, { filter: "bandpass", f0: 400, f1: 1800, dur: 0.25, vol: 0.2 });
  s.tone(t, { type: "sawtooth", f0: 220, f1: 110, dur: 0.15, vol: 0.06 });
}, 0.08);

registerWeapon("rocketLauncher", {
  label: "ROCKET",
  color: "#ff6a1a",
  order: 7,
  cooldown: 40,
  ammo: 3,
  regen: 110,
  icon(ctx, cx, cy, color) {
    ctx.fillStyle = color;
    ctx.fillRect(cx - 7, cy - 2, 10, 5);
    ctx.beginPath(); ctx.moveTo(cx + 3, cy - 3); ctx.lineTo(cx + 8, cy + 0.5); ctx.lineTo(cx + 3, cy + 4); ctx.fill();
    ctx.fillRect(cx - 8, cy - 5, 3, 3); ctx.fillRect(cx - 8, cy + 3, 3, 3);
  },
  fire(world, p) {
    const r = world.spawn("rocketShot", p.facing > 0 ? p.x + p.w : p.x - 16, p.y + 9, {});
    if (r) r.vx = p.facing * 4;
    p.vx -= p.facing * 1.5; // a little recoil
    sfx.play("rocketLaunch");
  },
});

registerEntity("rocketShot", {
  size: [16, 8],
  layer: 2,
  props: { transient: true, alwaysActive: true, radius: 70, dmg: 3 },
  init(e) { e.life = 90; },
  explode(e, world) {
    if (e.dead) return;
    e.dead = true;
    apocBlast(world, U.cx(e), U.cy(e), e.radius, e.dmg, "rocket");
  },
  update(e, world) {
    e.vx = U.clamp(e.vx * 1.07, -11, 11);
    const res = Physics.move(world, e, e.vx, 0, { solids: true, oneway: false });
    if (world.time % 2 === 0) world.particles.emit(e.vx > 0 ? e.x : e.x + e.w, U.cy(e), { vx: -U.sign(e.vx) * 1.5, vy: U.rand(-0.4, 0.4), life: 20, size: 3, color: "#7a6a60" });
    if (res.hitX || --e.life <= 0) return this.explode(e, world);
    for (const o of world.entities) {
      if (o.dead || !o.active || o === e || !U.overlap(e, o)) continue;
      if (o.enemy || o.shootDown || o.name === "crackedWall" || o.name === "crackedFloor") {
        if (o.shootDown) o.dead = true;
        return this.explode(e, world);
      }
    }
  },
  draw(e, ctx) {
    const d = U.sign(e.vx) || 1, x = Math.round(e.x), y = Math.round(e.y);
    ctx.fillStyle = "#c9c2ba"; ctx.fillRect(x + 2, y + 1, 11, 6);
    ctx.fillStyle = "#ff6a1a";
    if (d > 0) { ctx.fillRect(x + 13, y + 2, 3, 4); ctx.fillRect(x, y, 3, 8); }
    else { ctx.fillRect(x, y + 2, 3, 4); ctx.fillRect(x + 13, y, 3, 8); }
    U.glow(ctx, d > 0 ? x : x + 16, y + 4, 14, "#ffb347", 0.8);
  },
});

// Expanding fire ring — purely visual.
registerEntity("rocketBlast", {
  size: [10, 10],
  layer: 2,
  props: { transient: true, alwaysActive: true, alwaysDraw: true },
  update(e) { if (e.t > 18) e.dead = true; },
  draw(e, ctx) {
    const k = e.t / 18, cx = U.cx(e), cy = U.cy(e), r = (e.w / 2) * (0.35 + k * 0.65);
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = U.rgba("#ffb347", 0.35); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.28); ctx.fill();
    ctx.strokeStyle = "#ff6a1a"; ctx.lineWidth = 6; ctx.stroke();
    ctx.globalAlpha = 1;
  },
});

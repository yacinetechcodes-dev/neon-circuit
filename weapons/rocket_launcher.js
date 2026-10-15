/* weapons/rocket_launcher.js — a slow-firing rocket that speeds up and
 * explodes on whatever it hits: area damage to every enemy in the blast, and
 * it breaks cracked walls and floors. (World 5 reward) */
sfx.define("rocketLaunch", (s, t) => {
  s.noise(t, { filter: "bandpass", f0: 400, f1: 1800, dur: 0.25, vol: 0.2 });
  s.tone(t, { type: "sawtooth", f0: 220, f1: 110, dur: 0.15, vol: 0.06 });
}, 0.08);

registerWeapon("rocketLauncher", {
  desc: "Area damage; the only thing that breaks cracked walls.",
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
  draw(e, ctx, world) {
    const d = U.sign(e.vx) || 1, x = e.x, y = e.y, cy = U.cy(e), t = world.time;
    // Exhaust flame and a smoke trail.
    const back = d > 0 ? x : x + e.w;
    Look.thruster(ctx, back, cy, -d, 0, 14 + Math.min(10, Math.abs(e.vx)), "#ffb347", t);
    if (Game.state === "play") world.particles.emit(back - d * 4, cy + U.rand(-1, 1), { vx: -d * U.rand(0.2, 0.8), vy: U.rand(-0.3, 0.1), drag: 0.95, life: 26, size: 3, grow: 0.18, color: "#6a5e58", shape: "smoke", alpha: 0.5 });
    // Body: gradient casing, nose cone, fins, stripe.
    ctx.beginPath(); ctx.rect(x + 2, y + 1, 11, 6);
    Look.fill(ctx, y + 1, 6, "#b8b0a8", 0.3, 0.35);
    ctx.fillStyle = "#ff6a1a";
    ctx.beginPath();
    if (d > 0) { ctx.moveTo(x + 13, y + 1); ctx.lineTo(x + 17, y + 4); ctx.lineTo(x + 13, y + 7); }
    else { ctx.moveTo(x + 3, y + 1); ctx.lineTo(x - 1, y + 4); ctx.lineTo(x + 3, y + 7); }
    ctx.fill();
    ctx.fillStyle = "#7a2a10";
    if (d > 0) { ctx.fillRect(x, y - 1, 4, 3); ctx.fillRect(x, y + 6, 4, 3); } else { ctx.fillRect(x + 12, y - 1, 4, 3); ctx.fillRect(x + 12, y + 6, 4, 3); }
    ctx.fillStyle = "#ff6a1a"; ctx.fillRect(x + 7, y + 1, 2, 6);
  },
  light(e) { return [70, "#ffb347", 0.9]; },
});

// Expanding fire ring — purely visual.
registerEntity("rocketBlast", {
  size: [10, 10],
  layer: 2,
  props: { transient: true, alwaysActive: true, alwaysDraw: true },
  update(e) { if (e.t > 18) e.dead = true; },
  draw(e, ctx) {
    const k = e.t / 18, cx = U.cx(e), cy = U.cy(e), r = (e.w / 2) * (0.35 + k * 0.65);
    ctx.save();
    ctx.globalAlpha = 1 - k;
    const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    g.addColorStop(0, "rgba(255,240,200,0.9)"); g.addColorStop(0.4, "rgba(255,150,40,0.55)"); g.addColorStop(1, "rgba(255,90,20,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.28); ctx.fill();
    ctx.strokeStyle = "#ff6a1a"; ctx.lineWidth = 6 * (1 - k) + 1; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.28); ctx.stroke();
    ctx.restore();
  },
  light(e) { return [e.w * 1.2, "#ffb347", 1.4 * (1 - e.t / 18)]; },
});

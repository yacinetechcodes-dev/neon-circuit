/* weapons/virus_launcher.js — lobs a virus blob. An infected enemy pulses
 * damage into everything near it, and bursts when it dies. (World 2 reward) */
sfx.define("virus", (s, t) => {
  s.tone(t, { type: "square", f0: 300, f1: 140, dur: 0.14, vol: 0.08 });
  s.tone(t, { type: "square", f0: 450, f1: 210, dur: 0.12, vol: 0.05, delay: 0.04 });
}, 0.1);

const VIRUS_GREEN = "#9dff3a";

registerWeapon("virusLauncher", {
  label: "VIRUS",
  color: VIRUS_GREEN,
  order: 4,
  cooldown: 30,
  ammo: 4,
  regen: 110,
  icon(ctx, cx, cy, color) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 6.28); ctx.fill();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.28;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4); ctx.lineTo(cx + Math.cos(a) * 7.5, cy + Math.sin(a) * 7.5); ctx.stroke();
    }
  },
  fire(world, p) {
    const b = world.spawn("virusShot", p.facing > 0 ? p.x + p.w : p.x - 14, p.y + 6, {});
    if (b) { b.vx = p.facing * 6.5; b.vy = -2.5; }
    sfx.play("virus");
  },
});

// The blob: arcs under light gravity and infects the first enemy it touches.
registerEntity("virusShot", {
  size: [14, 14],
  layer: 2,
  props: { transient: true, alwaysActive: true },
  init(e) { e.life = 90; },
  update(e, world) {
    e.vy += 0.18;
    e.x += e.vx; e.y += e.vy;
    if (--e.life <= 0 || Physics.solidAtPx(world, U.cx(e), U.cy(e))) {
      e.dead = true;
      world.particles.burst(U.cx(e), U.cy(e), 8, VIRUS_GREEN, 2);
      return;
    }
    for (const o of world.entities) {
      if (o.dead || !o.active || !o.enemy || !U.overlap(e, o)) continue;
      e.dead = true;
      world.damageEntity(o, 1, "shot");
      if (!o.dead && !o.infection) {
        const inf = world.spawn("infection", U.cx(o) - 8, U.cy(o) - 8, {});
        if (inf) { inf.host = o; o.infection = inf; }
      }
      world.particles.burst(U.cx(o), U.cy(o), 14, VIRUS_GREEN, 3);
      return;
    }
  },
  draw(e, ctx, world) {
    const cx = U.cx(e), cy = U.cy(e);
    U.glow(ctx, cx, cy, 18, VIRUS_GREEN, 0.8);
    ctx.fillStyle = "#e6ffd0";
    ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, 6.28); ctx.fill();
    ctx.strokeStyle = VIRUS_GREEN; ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const a = world.time * 0.2 + (i / 5) * 6.28;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5); ctx.lineTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8); ctx.stroke();
    }
  },
});

// Rides an infected enemy for 5 s, pulsing 1 damage into enemies within ~3 tiles.
registerEntity("infection", {
  size: [16, 16],
  layer: 2,
  props: { transient: true, alwaysActive: true, radius: 96, pulse: 40 },
  init(e) { e.life = 300; },
  burst(e, world, dmg) {
    const cx = U.cx(e), cy = U.cy(e);
    for (const o of world.entities) {
      if (o === e.host || o.dead || !o.active || !o.enemy) continue;
      if (U.dist(cx, cy, U.cx(o), U.cy(o)) <= e.radius) world.damageEntity(o, dmg, "virus");
    }
    world.particles.ring(cx, cy, VIRUS_GREEN, e.radius, 22);
  },
  update(e, world) {
    const h = e.host;
    if (!h || h.dead) {
      // Host destroyed: final burst.
      this.burst(e, world, 2);
      world.particles.burst(U.cx(e), U.cy(e), 20, VIRUS_GREEN, 5, { glow: true });
      e.dead = true;
      return;
    }
    e.x = U.cx(h) - e.w / 2; e.y = U.cy(h) - e.h / 2;
    if (e.t % e.pulse === 0) this.burst(e, world, 1);
    if (world.time % 4 === 0) world.particles.emit(U.cx(e) + U.rand(-10, 10), U.cy(e), { vy: -1, life: 20, size: 2, color: VIRUS_GREEN });
    if (--e.life <= 0) { e.dead = true; h.infection = null; }
  },
  draw(e, ctx, world) {
    const cx = U.cx(e), cy = U.cy(e);
    const k = (e.t % e.pulse) / e.pulse;
    ctx.strokeStyle = U.rgba(VIRUS_GREEN, 0.5 * (1 - k)); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 10 + k * (e.radius - 10), 0, 6.28); ctx.stroke();
    U.glow(ctx, cx, cy, 24, VIRUS_GREEN, 0.4);
  },
});

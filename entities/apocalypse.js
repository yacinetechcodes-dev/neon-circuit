/* =========================================================================
 * entities/apocalypse.js — World 5 "Apocalypse World": a ruined city of
 * broken machines. Abstract scrap shapes only (no faces).
 *
 *   scrapCrawler    low scrap walker; lunges when you're close     (stomp/shoot/dash)
 *   rocketDrone     hovers and fires slow homing rockets           (stomp/shoot/dash)
 *   enemyRocket     its rocket: steers toward you, can be shot down
 *   wreckerBot      armoured walker swinging a wrecking ball       (Ground Slam stuns it,
 *                   then stomp; rockets/shots wear it down)
 *   collapseFloor   rubble block: crumbles shortly after you stand on it, reforms later
 *   fireVent        floor vent: warns, then blasts a flame column (timed)
 *   debrisDrop      ceiling crack that drops chunks of rubble on a rhythm
 *   toxic           toxic pool cell — burns and throws you out
 *   crackedFloor    solid until a Ground Slam (or a rocket) breaks it
 *   crackedWall     solid until a rocket blast breaks it
 *   grappleAnchor   ring you can hook onto with the Grapple Hook
 *
 * Also adds the World 5 abilities (Grapple Hook, Ground Slam, Jetpack Burst)
 * to the upgrade banner table, their sounds, and apocBlast() (area damage
 * that also breaks cracked walls/floors).
 * ========================================================================= */
"use strict";

const RUST = {
  rust: "#b5521b", dark: "#2a1a14", iron: "#5d5550", steel: "#8a8580", ember: "#ffb347",
  fire: "#ff6a1a", smoke: "#4a3f3a", toxic: "#9dff3a", toxicDeep: "#3f7a12", spark: "#ffe08a",
};

Object.assign(UPGRADE_INFO, {
  grapple: { name: "GRAPPLE HOOK", desc: "Hook a ring and swing; jump to let go.", how: "{grapple} near a ring", action: "grapple", label: "HOOK", world: 5 },
  groundSlam: { name: "GROUND SLAM", desc: "Crash down: breaks cracked floors and stuns nearby enemies.", how: "{slam} in mid-air", action: "slam", label: "SLAM", world: 5 },
  jetpack: { name: "JETPACK BURST", desc: "A strong upward boost (recharges in ~1.3 s).", how: "{jetpack}", action: "jetpack", label: "JET", world: 5 },
});

sfx.define("hook", (s, t) => {
  s.tone(t, { type: "square", f0: 1200, f1: 500, dur: 0.06, vol: 0.06 });
  s.noise(t, { filter: "highpass", f0: 3000, dur: 0.05, vol: 0.06, delay: 0.04 });
}, 0.06);
sfx.define("slamImpact", (s, t) => {
  s.noise(t, { filter: "lowpass", f0: 900, f1: 60, dur: 0.35, vol: 0.34 });
  s.tone(t, { type: "sine", f0: 120, f1: 40, dur: 0.3, vol: 0.14 });
}, 0.08);
sfx.define("jet", (s, t) => s.noise(t, { filter: "bandpass", f0: 700, f1: 2400, dur: 0.22, vol: 0.18 }), 0.08);
sfx.define("crumble", (s, t) => s.noise(t, { filter: "lowpass", f0: 1600, f1: 200, dur: 0.3, vol: 0.2 }), 0.08);
sfx.define("flame", (s, t) => s.noise(t, { filter: "bandpass", f0: 500, f1: 900, dur: 0.4, vol: 0.12 }), 0.15);
sfx.define("boom", (s, t) => {
  s.noise(t, { filter: "lowpass", f0: 1800, f1: 70, dur: 0.45, vol: 0.36 });
  s.tone(t, { type: "sawtooth", f0: 160, f1: 35, dur: 0.35, vol: 0.1 });
}, 0.06);

/** Area blast: hurts enemies (bosses decide for themselves) and breaks cracked
 *  walls/floors (whole connected groups). Returns the number of blocks broken. */
function apocBlast(world, cx, cy, r, dmg, src) {
  for (const o of world.entities) {
    if (o.dead || !o.active || !o.enemy) continue;
    if (U.dist(cx, cy, U.cx(o), U.cy(o)) <= r + Math.max(o.w, o.h) / 2) world.damageEntity(o, dmg, src || "blast");
  }
  let broken = 0;
  for (const o of world.entities) {
    if (o.dead || (o.name !== "crackedWall" && o.name !== "crackedFloor")) continue;
    const nx = U.clamp(cx, o.x, o.x + o.w), ny = U.clamp(cy, o.y, o.y + o.h);
    if (U.dist(cx, cy, nx, ny) <= r * 0.6) broken += breakCracked(world, o);
  }
  const fx = world.spawn("rocketBlast", cx - r, cy - r, {});
  if (fx) fx.w = fx.h = r * 2;
  world.particles.burst(cx, cy, 26, RUST.fire, 6, { glow: true });
  world.particles.burst(cx, cy, 12, RUST.spark, 4);
  world.camera.shake(6);
  sfx.play("boom");
  return broken;
}

/** Connected cracked blocks of the same kind (edge-to-edge). */
function crackedGroup(e, list) {
  const all = list.filter((o) => o.name === e.name && !o.dead && !o.broken);
  const out = [e], seen = new Set([e]);
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    for (const o of all) {
      if (seen.has(o)) continue;
      const dx = Math.abs(o.x - a.x), dy = Math.abs(o.y - a.y);
      if ((dx === 0 && dy === TILE) || (dy === 0 && dx === TILE)) { seen.add(o); out.push(o); }
    }
  }
  return out;
}
function breakCracked(world, e) {
  if (e.dead) return 0;
  const g = crackedGroup(e, world.entities);
  for (const b of g) {
    b.dead = true;
    world.solids = world.solids.filter((o) => o !== b);
    world.particles.burst(U.cx(b), U.cy(b), 12, RUST.rust, 5, { shape: "square" });
    world.particles.burst(U.cx(b), U.cy(b), 6, RUST.steel, 4, { shape: "square" });
  }
  sfx.play("crumble");
  return g.length;
}

/** Riveted rust plate (shared look for scrap blocks). */
function rustPlate(ctx, x, y, w, h, base, edge) {
  ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = edge; ctx.fillRect(x, y, w, 3); ctx.fillRect(x, y + h - 3, w, 3);
  ctx.fillStyle = U.rgba("#000000", 0.35);
  ctx.fillRect(x + 4, y + 6, 3, 3); ctx.fillRect(x + w - 7, y + 6, 3, 3);
}

// ---------------------------------------------------------------- scrapCrawler
registerEntity("scrapCrawler", {
  size: [30, 18],
  props: { enemy: true, hurts: true, stompable: true, shootable: true, dashable: true, hp: 2,
    speed: 1.1, lunge: 2.8, sight: 5, color: RUST.rust },
  init(e) { e.dir = e.opts.dir === "right" ? 1 : -1; },
  update(e, world) {
    const p = world.player;
    const near = p.alive && Math.abs(U.cx(p) - U.cx(e)) < e.sight * TILE && Math.abs(U.cy(p) - U.cy(e)) < 40;
    if (near && e.onGround) e.dir = U.sign(U.cx(p) - U.cx(e)) || e.dir;
    walkStep(e, world, near ? e.lunge : e.speed);
  },
  draw(e, ctx, world) {
    const col = e.flash ? "#ffffff" : e.color, x = e.x, y = e.y;
    // Legs: four little scuttling bars.
    ctx.strokeStyle = RUST.iron; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const lx = x + 4 + i * 7, k = Math.sin(e.t * 0.5 + i * 1.6) * 3;
      ctx.beginPath(); ctx.moveTo(lx, y + 10); ctx.lineTo(lx + k, y + 18); ctx.stroke();
    }
    // Shell: stepped scrap plates.
    ctx.fillStyle = RUST.dark; ctx.fillRect(x + 1, y + 4, 28, 9);
    ctx.fillStyle = col; ctx.fillRect(x + 3, y + 2, 10, 8); ctx.fillRect(x + 14, y + 1, 12, 9);
    ctx.fillStyle = RUST.steel; ctx.fillRect(x + 6, y + 4, 3, 2); ctx.fillRect(x + 18, y + 3, 4, 2);
    sensor(ctx, e.dir > 0 ? x + 27 : x + 3, y + 7, 2, RUST.ember);
  },
});

// ---------------------------------------------------------------- rocketDrone
registerEntity("rocketDrone", {
  size: [32, 22],
  anchor: "center",
  props: { enemy: true, hurts: true, stompable: true, shootable: true, dashable: true, hp: 2,
    rate: 150, sight: 10, color: RUST.ember },
  init(e) { e.timer = 60 + Math.floor(Math.random() * 60); e.phase = Math.random() * 6.28; },
  update(e, world) {
    const p = world.player;
    e.x = e.home.x + Math.sin(e.t * 0.015 + e.phase) * 40;
    e.y = e.home.y + Math.sin(e.t * 0.04 + e.phase) * 10;
    const d = U.dist(U.cx(e), U.cy(e), U.cx(p), U.cy(p));
    if (p.alive && d < e.sight * TILE && world.onScreen(e, 0) && --e.timer <= 0) {
      e.timer = e.rate;
      const r = world.spawn("enemyRocket", U.cx(e) - 6, e.y + e.h, {});
      if (r) { const a = Math.atan2(U.cy(p) - U.cy(e), U.cx(p) - U.cx(e)); r.ang = a; }
      sfx.play("shoot");
    }
  },
  draw(e, ctx, world) {
    const col = e.flash ? "#ffffff" : e.color, x = e.x, y = e.y;
    // Rotors.
    ctx.fillStyle = RUST.steel;
    const k = Math.abs(Math.sin(world.time * 0.6)) * 10;
    ctx.fillRect(x + 6 - k / 2, y, k + 2, 2); ctx.fillRect(x + 26 - k / 2, y, k + 2, 2);
    ctx.fillRect(x + 6, y + 1, 2, 4); ctx.fillRect(x + 25, y + 1, 2, 4);
    // Body: hexagonal scrap hull with a launch tube.
    ctx.fillStyle = RUST.dark;
    ctx.beginPath(); ctx.moveTo(x + 2, y + 9); ctx.lineTo(x + 8, y + 4); ctx.lineTo(x + 24, y + 4); ctx.lineTo(x + 30, y + 9);
    ctx.lineTo(x + 24, y + 18); ctx.lineTo(x + 8, y + 18); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = RUST.iron; ctx.fillRect(x + 12, y + 16, 8, 6);
    if (e.timer < 25 && Math.floor(e.timer / 4) % 2) U.glow(ctx, U.cx(e), y + 21, 16, RUST.fire, 0.8);
    sensor(ctx, U.cx(e), y + 11, 2.5, col);
  },
});

// ---------------------------------------------------------------- enemyRocket
registerEntity("enemyRocket", {
  size: [12, 12],
  layer: 2,
  props: { transient: true, alwaysActive: true, shootDown: true, speed: 2.7, turn: 0.035 },
  init(e) { e.life = 220; e.ang = Math.PI / 2; },
  explode(e, world) {
    if (e.dead) return;
    e.dead = true;
    const p = world.player;
    if (U.dist(U.cx(e), U.cy(e), U.cx(p), U.cy(p)) < 34) world.hurtPlayer(1, e);
    world.particles.burst(U.cx(e), U.cy(e), 14, RUST.fire, 4, { glow: true });
    if (world.onScreen(e)) sfx.play("boom");
  },
  update(e, world) {
    const p = world.player;
    const want = Math.atan2(U.cy(p) - U.cy(e), U.cx(p) - U.cx(e));
    let da = want - e.ang;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    e.ang += U.clamp(da, -e.turn, e.turn);
    e.x += Math.cos(e.ang) * e.speed; e.y += Math.sin(e.ang) * e.speed;
    if (world.time % 3 === 0) world.particles.emit(U.cx(e), U.cy(e), { vx: -Math.cos(e.ang), vy: -Math.sin(e.ang), life: 18, size: 3, color: RUST.smoke });
    if (--e.life <= 0 || Physics.solidAtPx(world, U.cx(e), U.cy(e))) return this.explode(e, world);
  },
  onTouch(e, world) { this.explode(e, world); },
  draw(e, ctx) {
    const cx = U.cx(e), cy = U.cy(e);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(e.ang);
    ctx.fillStyle = RUST.steel; ctx.fillRect(-7, -3, 12, 6);
    ctx.fillStyle = RUST.fire; ctx.fillRect(5, -3, 3, 6); ctx.fillRect(-10, -2, 3, 4);
    ctx.restore();
    U.glow(ctx, cx, cy, 14, RUST.fire, 0.6);
  },
});

// ---------------------------------------------------------------- wreckerBot
registerEntity("wreckerBot", {
  size: [40, 40],
  props: { enemy: true, hurts: true, hp: 6, speed: 0.6, chain: 54, spin: 0.045, color: RUST.ember,
    stompable: (e) => (e.stun > 0 ? true : "bounce"),
    shootable: true,
    dashable: (e) => e.stun > 0 },
  init(e) { e.dir = e.opts.dir === "right" ? 1 : -1; e.ang = Math.random() * 6.28; },
  ball(e) { return { x: U.cx(e) + Math.cos(e.ang) * e.chain, y: e.y + 8 + Math.sin(e.ang) * e.chain }; },
  update(e, world) {
    walkStep(e, world, e.speed);
    e.ang += e.spin * e.dir;
    const b = this.ball(e), p = world.player;
    if (p.alive && U.dist(b.x, b.y, U.cx(p), U.cy(p)) < 13 + Math.min(p.w, p.h) / 2 + 2) world.hurtPlayer(1, { x: b.x - 1, y: b.y - 1, w: 2, h: 2 });
  },
  draw(e, ctx, world) {
    const col = e.flash ? "#ffffff" : e.color, x = e.x, y = e.y;
    const b = this.ball(e);
    // Chain.
    ctx.strokeStyle = RUST.steel; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(U.cx(e), y + 8); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    // Treads.
    ctx.fillStyle = RUST.dark; ctx.fillRect(x, y + 30, 40, 10);
    ctx.fillStyle = RUST.iron;
    for (let i = 0; i < 5; i++) ctx.fillRect(x + 2 + ((i * 8 + e.t * e.dir) % 40 + 40) % 38, y + 32, 3, 6);
    // Armoured body.
    rustPlate(ctx, x + 3, y + 8, 34, 23, RUST.rust, col);
    ctx.fillStyle = RUST.dark; ctx.fillRect(x + 12, y, 16, 9);
    sensor(ctx, U.cx(e) + e.dir * 8, y + 18, 3, e.stun > 0 ? "#6a6a6a" : RUST.fire);
    // Wrecking ball.
    ctx.fillStyle = "#3a3632";
    ctx.beginPath(); ctx.arc(b.x, b.y, 13, 0, 6.28); ctx.fill();
    ctx.strokeStyle = RUST.steel; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = RUST.steel; ctx.fillRect(b.x - 4, b.y - 4, 3, 3);
  },
});

// ---------------------------------------------------------------- collapseFloor
// Rubble block: you can stand on it briefly; it crumbles, then reforms.
registerEntity("collapseFloor", {
  size: [32, 32],
  anchor: "topleft",
  props: { solid: true, alwaysActive: true, shake: 34, gone: 300 },
  init(e) { e.trig = null; },
  /** Solid at time t, given when it was first stepped on. */
  solidAt(e, t) { return e.trig == null || t < e.trig + e.shake || t >= e.trig + e.shake + e.gone; },
  standing(e, p) { return p.alive && p.onGround && p.y + p.h >= e.y - 1 && p.y + p.h <= e.y + 2 && p.x + p.w > e.x && p.x < e.x + e.w; },
  update(e, world) {
    const p = world.player, t = world.htime;
    if (e.trig != null && t >= e.trig + e.shake + e.gone && !U.overlap(p, e)) e.trig = null;
    if (e.trig == null && this.standing(e, p)) { e.trig = t; if (world.onScreen(e)) sfx.play("crumble"); }
    const s = this.solidAt(e, t);
    if (e.solid && !s) world.particles.burst(U.cx(e), U.cy(e), 10, RUST.rust, 4, { shape: "square" });
    e.solid = s;
  },
  onRespawn(e) { e.trig = null; e.solid = true; },
  draw(e, ctx, world) {
    const t = world.htime;
    if (!e.solid) {
      const k = e.trig != null ? (t - e.trig - e.shake) / e.gone : 1;
      if (k > 0.8 && world.time % 6 < 3) { ctx.strokeStyle = U.rgba(RUST.ember, 0.6); ctx.strokeRect(e.x + 2, e.y + 2, 28, 28); }
      return;
    }
    const sx = e.trig != null ? U.rand(-2, 2) : 0;
    const x = e.x + sx, y = e.y;
    ctx.fillStyle = "#4a3428"; ctx.fillRect(x, y, 32, 32);
    ctx.fillStyle = "#6e4a34";
    ctx.fillRect(x + 1, y + 1, 14, 9); ctx.fillRect(x + 17, y + 2, 13, 11); ctx.fillRect(x + 3, y + 12, 12, 9);
    ctx.fillRect(x + 16, y + 15, 14, 8); ctx.fillRect(x + 2, y + 23, 27, 7);
    ctx.fillStyle = RUST.dark; ctx.fillRect(x + 15, y + 4, 2, 24);
    if (e.trig != null) U.glow(ctx, x + 16, y, 22, RUST.fire, 0.4);
  },
});

// ---------------------------------------------------------------- fireVent
// Floor vent; the hitbox is the flame column above it.
// overrides: height (tiles), on / off (s), offset (s)
registerEntity("fireVent", {
  size: [24, 96],
  props: { height: 3, on: 1.0, off: 1.8, offset: 0, warn: 0.5, alwaysActive: true },
  init(e) {
    const b = e.y + e.h;
    e.h = e.height * TILE - 8; e.y = b - e.h;
  },
  state(e, t) {
    const period = e.on + e.off;
    const k = ((t / FPS + e.offset) % period + period) % period;
    if (k < e.off - e.warn) return "off";
    if (k < e.off) return "warn";
    return "on";
  },
  burning(e, t) { return this.state(e, t) === "on"; },
  update(e, world) {
    const s = this.state(e, world.htime);
    if (s === "on" && e.st !== "on" && world.onScreen(e)) sfx.play("flame");
    e.st = s;
  },
  onTouch(e, world) { if (e.st === "on") world.hurtPlayer(1, e, { up: -7 }); },
  draw(e, ctx, world) {
    const bx = e.x - 4, by = e.y + e.h;
    ctx.fillStyle = RUST.dark; ctx.fillRect(bx, by - 8, 32, 8);
    ctx.fillStyle = RUST.iron; for (let i = 0; i < 4; i++) ctx.fillRect(bx + 3 + i * 7, by - 7, 4, 6);
    if (e.st === "warn") {
      ctx.fillStyle = U.rgba(RUST.fire, world.time % 6 < 3 ? 0.9 : 0.4); ctx.fillRect(bx + 2, by - 10, 28, 3);
      if (world.time % 4 === 0) world.particles.emit(U.cx(e) + U.rand(-8, 8), by - 10, { vy: -1.5, life: 16, size: 3, color: RUST.smoke });
    } else if (e.st === "on") {
      for (let i = 0; i < 6; i++) {
        const k = i / 6, w = 22 - k * 14 + Math.sin(world.time * 0.7 + i) * 3;
        ctx.fillStyle = i < 2 ? "#fff3c4" : i < 4 ? RUST.ember : RUST.fire;
        ctx.globalAlpha = 0.9 - k * 0.3;
        ctx.fillRect(U.cx(e) - w / 2, by - 8 - (k + 1 / 6) * e.h, w, e.h / 6 + 1);
      }
      ctx.globalAlpha = 1;
      U.glow(ctx, U.cx(e), by - e.h / 2, 46, RUST.fire, 0.45);
    }
  },
});

// ---------------------------------------------------------------- debrisDrop
// Ceiling crack. A rubble chunk falls on a fixed rhythm (pure function of
// time): warning shadow, fall, shatter. overrides: rate (s), offset (s)
registerEntity("debrisDrop", {
  size: [28, 28],
  anchor: "top",
  props: { rate: 2.2, offset: 0, warn: 40, alwaysActive: true },
  init(e, world) {
    let r = e.row + 1;
    while (r < world.h + 4 && !Physics.solidAt(world, e.col, r)) r++;
    e.top = e.row * TILE; e.floorY = r * TILE;
    e.drop = e.floorY - e.h - e.top;
    e.tFall = Math.ceil(Math.sqrt(2 * Math.max(1, e.drop) / 0.5));
    e.period = Math.max(Math.round(e.rate * FPS), e.warn + e.tFall + 10);
  },
  /** { y, mode } at time t. */
  at(e, t) {
    const k = (((t + Math.round(e.offset * FPS)) % e.period) + e.period) % e.period;
    if (k < e.warn) return { y: e.top, mode: "warn" };
    const f = k - e.warn;
    if (f < e.tFall) return { y: e.top + Math.min(e.drop, 0.25 * f * f), mode: "fall" };
    return { y: e.top, mode: "idle" };
  },
  update(e, world) {
    const s = this.at(e, world.htime);
    if (e.mode === "fall" && s.mode !== "fall" && world.onScreen(e)) {
      world.particles.burst(U.cx(e), e.floorY - 6, 12, RUST.iron, 4, { shape: "square" });
      world.camera.shake(3);
    }
    e.y = s.y; e.mode = s.mode;
  },
  onTouch(e, world) { if (e.mode === "fall") world.hurtPlayer(1, e); },
  draw(e, ctx, world) {
    // Crack in the ceiling.
    ctx.fillStyle = RUST.dark; ctx.fillRect(e.col * TILE + 4, e.top - 4, 24, 4);
    if (e.mode === "warn") {
      ctx.fillStyle = U.rgba(RUST.fire, world.time % 8 < 4 ? 0.7 : 0.3);
      ctx.fillRect(e.x, e.floorY - 3, e.w, 3);
      if (world.time % 5 === 0) world.particles.emit(U.cx(e) + U.rand(-10, 10), e.top + 2, { vy: 2, life: 20, size: 2, color: RUST.steel });
    }
    if (e.mode !== "fall") return;
    const x = e.x, y = e.y;
    ctx.fillStyle = "#3a2c24";
    ctx.beginPath(); ctx.moveTo(x + 4, y); ctx.lineTo(x + 24, y + 3); ctx.lineTo(x + 28, y + 18); ctx.lineTo(x + 18, y + 28);
    ctx.lineTo(x + 2, y + 22); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = RUST.rust; ctx.lineWidth = 2; ctx.stroke();
  },
});

// ---------------------------------------------------------------- toxic
// One cell of toxic pool. The burning surface is a few px below the cell top.
registerEntity("toxic", {
  size: [32, 24],
  anchor: "topleft",
  layer: 2,
  init(e) { e.y += 8; },
  onTouch(e, world, p) {
    if (world.hurtPlayer(1, e, { up: -10 })) { p.vy = -10; world.particles.burst(U.cx(p), p.y + p.h, 10, RUST.toxic, 3); }
  },
  draw(e, ctx, world) {
    const x = e.x, y = e.y;
    ctx.fillStyle = U.rgba(RUST.toxicDeep, 0.9); ctx.fillRect(x, y, 32, 24);
    ctx.fillStyle = RUST.toxic;
    const w1 = Math.sin(world.time * 0.08 + e.col) * 2;
    ctx.fillRect(x, y + w1 + 2, 32, 3);
    if ((world.time + e.col * 17) % 50 < 12) {
      const k = ((world.time + e.col * 17) % 50) / 12;
      ctx.globalAlpha = 1 - k;
      ctx.beginPath(); ctx.arc(x + 10 + (e.col % 3) * 6, y + 10 - k * 10, 3, 0, 6.28); ctx.fill();
      ctx.globalAlpha = 1;
    }
    U.glow(ctx, x + 16, y + 4, 22, RUST.toxic, 0.25);
  },
});

// ---------------------------------------------------------------- crackedFloor / crackedWall
registerEntity("crackedFloor", {
  size: [32, 32],
  anchor: "topleft",
  props: { solid: true, alwaysActive: true },
  draw(e, ctx) {
    rustPlate(ctx, e.x, e.y, 32, 32, "#5a3a2a", "#8a5a3a");
    ctx.strokeStyle = RUST.ember; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(e.x + 4, e.y + 2); ctx.lineTo(e.x + 12, e.y + 12); ctx.lineTo(e.x + 9, e.y + 20);
    ctx.lineTo(e.x + 18, e.y + 30); ctx.moveTo(e.x + 12, e.y + 12); ctx.lineTo(e.x + 26, e.y + 8); ctx.stroke();
  },
});
registerEntity("crackedWall", {
  size: [32, 32],
  anchor: "topleft",
  props: { solid: true, alwaysActive: true },
  draw(e, ctx) {
    ctx.fillStyle = "#3e2e26"; ctx.fillRect(e.x, e.y, 32, 32);
    ctx.fillStyle = "#5e4434";
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) ctx.fillRect(e.x + 1 + c * 16 + (r % 2) * 8 - (r % 2 && c ? 16 : 0), e.y + 1 + r * 8, 14, 6);
    ctx.strokeStyle = RUST.fire; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(e.x + 16, e.y); ctx.lineTo(e.x + 12, e.y + 10); ctx.lineTo(e.x + 20, e.y + 18); ctx.lineTo(e.x + 14, e.y + 32); ctx.stroke();
  },
});

// ---------------------------------------------------------------- grappleAnchor
registerEntity("grappleAnchor", {
  size: [20, 20],
  anchor: "center",
  layer: 0,
  props: { range: 6.5 },
  draw(e, ctx, world) {
    const cx = U.cx(e), cy = U.cy(e), p = world.player;
    const can = p.has("grapple") && U.dist(cx, cy, U.cx(p), U.cy(p)) <= e.range * TILE;
    // A girder stub with a ring.
    ctx.fillStyle = RUST.iron; ctx.fillRect(cx - 3, cy - 18, 6, 10);
    ctx.strokeStyle = can ? RUST.spark : RUST.steel; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, 7, 0, 6.28); ctx.stroke();
    if (can) U.glow(ctx, cx, cy, 22, RUST.spark, 0.5 + Math.sin(world.time * 0.2) * 0.2);
  },
});

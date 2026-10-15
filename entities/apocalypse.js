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
  jetpack: { name: "JETPACK BURST", hud: "JET", desc: "A strong upward boost (recharges in ~1.3 s).", how: "{jetpack}", action: "jetpack", label: "JET", world: 5 },
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
  world.particles.explode(cx, cy, RUST.fire, r * 0.6);
  world.particles.burst(cx, cy, 10, RUST.spark, 4);
  world.flash(cx, cy, r * 3, RUST.fire, 20);
  world.hitStop = Math.max(world.hitStop || 0, 3);
  world.camera.shake(7);
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
  ctx.beginPath(); ctx.rect(x, y, w, h);
  Look.fill(ctx, y, h, base, 0.15, 0.35);
  ctx.fillStyle = edge; ctx.fillRect(x, y, w, 3); ctx.fillRect(x, y + h - 3, w, 3);
  ctx.fillStyle = "rgba(255,230,200,0.2)"; ctx.fillRect(x, y, w, 1);
  // Rust streaks running down from the rivets.
  ctx.fillStyle = "rgba(90,30,5,0.35)";
  ctx.fillRect(x + 5, y + 9, 1.5, h * 0.4); ctx.fillRect(x + w - 6, y + 9, 1.5, h * 0.3);
  Look.bolt(ctx, x + 5, y + 7, 1.5); Look.bolt(ctx, x + w - 5, y + 7, 1.5);
}

// ---------------------------------------------------------------- scrapCrawler
registerEntity("scrapCrawler", {
  info: { name: "Scrap Crawler", desc: "Lunges when you get close." },
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
    const col = e.flash ? "#ffffff" : e.color, x = e.x, y = e.y, t = e.t, d = e.dir || 1;
    const p = world.player;
    const near = p.alive && Math.abs(U.cx(p) - U.cx(e)) < e.sight * TILE && Math.abs(U.cy(p) - U.cy(e)) < 48;
    Look.shadow(ctx, U.cx(e), y + e.h, e.w + 2);
    // Jointed legs scuttle (faster when lunging).
    ctx.strokeStyle = RUST.iron; ctx.lineWidth = 2; ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      const lx = x + 4 + i * 7, k = Math.sin(t * (near ? 0.9 : 0.5) + i * 1.6) * 3;
      ctx.beginPath(); ctx.moveTo(lx, y + 9); ctx.lineTo(lx + k * 0.5 - 1, y + 13); ctx.lineTo(lx + k, y + 18); ctx.stroke();
    }
    // Shell: overlapping scrap plates with rivets and a rust streak.
    ctx.beginPath(); ctx.rect(x + 1, y + 4, 28, 9); Look.fill(ctx, y + 4, 9, RUST.dark, 0.15, 0.3);
    ctx.beginPath(); ctx.rect(x + 3, y + 2, 10, 8); Look.fill(ctx, y + 2, 8, col, 0.25, 0.35);
    ctx.beginPath(); ctx.rect(x + 14, y + 1, 12, 9); Look.fill(ctx, y + 1, 9, U.mix(col, RUST.iron, 0.4), 0.25, 0.35);
    Look.bolt(ctx, x + 6, y + 4, 1.2); Look.bolt(ctx, x + 23, y + 3, 1.2);
    ctx.fillStyle = "rgba(60,20,5,0.5)"; ctx.fillRect(x + 18, y + 5, 2, 5);
    // Exhaust pipe with a puff now and then.
    ctx.fillStyle = RUST.steel; ctx.fillRect(d > 0 ? x + 2 : x + 25, y - 2, 3, 5);
    if (t % 40 === 0 && Game.state === "play") world.particles.emit(d > 0 ? x + 3 : x + 26, y - 3, { vy: -0.6, life: 26, size: 2.5, grow: 0.12, color: "#5a504a", shape: "smoke", alpha: 0.4 });
    Look.core(ctx, d > 0 ? x + 27 : x + 3, y + 7, 2.2, near ? "#ff3355" : RUST.ember, t, near);
  },
});

// ---------------------------------------------------------------- rocketDrone
registerEntity("rocketDrone", {
  info: { name: "Rocket Drone", desc: "Fires slow homing rockets: shoot them down or dodge." },
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
    const col = e.flash ? "#ffffff" : e.color, x = e.x, y = e.y, t = world.time;
    // Rotor arms and blurred blades.
    ctx.strokeStyle = RUST.iron; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 7, y + 5); ctx.lineTo(x + 7, y + 1); ctx.moveTo(x + 26, y + 5); ctx.lineTo(x + 26, y + 1); ctx.stroke();
    for (const rx of [x + 7, x + 26]) {
      ctx.fillStyle = U.rgba(RUST.steel, 0.25); ctx.beginPath(); ctx.ellipse(rx, y, 8, 1.8, 0, 0, 6.28); ctx.fill();
      const k = Math.sin(t * 0.8 + rx) * 7;
      ctx.fillStyle = RUST.steel; ctx.fillRect(rx - Math.abs(k), y - 1, Math.abs(k) * 2, 2);
    }
    // Hexagonal scrap hull with a launch tube.
    ctx.beginPath(); ctx.moveTo(x + 2, y + 9); ctx.lineTo(x + 8, y + 4); ctx.lineTo(x + 24, y + 4); ctx.lineTo(x + 30, y + 9);
    ctx.lineTo(x + 24, y + 18); ctx.lineTo(x + 8, y + 18); ctx.closePath();
    Look.fill(ctx, y + 4, 14, "#3a261c", 0.2, 0.35);
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(x + 6, y + 12, 20, 1);
    Look.bolt(ctx, x + 9, y + 8, 1.2); Look.bolt(ctx, x + 23, y + 8, 1.2);
    ctx.fillStyle = RUST.iron; ctx.fillRect(x + 12, y + 16, 8, 6);
    ctx.fillStyle = "#1a1210"; ctx.fillRect(x + 13, y + 20, 6, 2);
    // Telegraph: the tube glows and a ring closes before each launch.
    const arming = e.timer < 25;
    if (arming) { U.glow(ctx, U.cx(e), y + 21, 18, RUST.fire, Math.floor(e.timer / 4) % 2 ? 0.9 : 0.4); Look.telegraph(ctx, U.cx(e), y + 22, 6, RUST.fire, 1 - e.timer / 25); }
    Look.core(ctx, U.cx(e), y + 10, 2.5, arming ? "#ff3355" : col, t, arming);
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
  draw(e, ctx, world) {
    const cx = U.cx(e), cy = U.cy(e), t = world.time;
    // Smoke trail behind it.
    if (t % 2 === 0 && Game.state === "play") world.particles.emit(cx - Math.cos(e.ang) * 9, cy - Math.sin(e.ang) * 9, { vx: -Math.cos(e.ang) * 0.4, vy: -Math.sin(e.ang) * 0.4, drag: 0.95, life: 24, size: 2.5, grow: 0.15, color: "#5a4c46", shape: "smoke", alpha: 0.45 });
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(e.ang);
    Look.thruster(ctx, -9, 0, -1, 0, 9, RUST.ember, t);
    ctx.beginPath(); ctx.rect(-7, -3, 12, 6); Look.fill(ctx, -3, 6, RUST.steel, 0.35, 0.3);
    ctx.fillStyle = RUST.fire;
    ctx.beginPath(); ctx.moveTo(5, -3); ctx.lineTo(9, 0); ctx.lineTo(5, 3); ctx.fill();
    ctx.fillStyle = "#6a2a10"; ctx.fillRect(-8, -5, 3, 3); ctx.fillRect(-8, 2, 3, 3);
    ctx.fillStyle = Math.floor(t / 4) % 2 ? "#ff3355" : "#ffe08a"; ctx.fillRect(0, -1, 2, 2);
    ctx.restore();
    U.glow(ctx, cx, cy, 16, RUST.fire, 0.6);
  },
});

// ---------------------------------------------------------------- wreckerBot
registerEntity("wreckerBot", {
  info: { name: "Wrecker Bot", desc: "Armoured, swings a wrecking ball. Ground Slam to stun it, then stomp." },
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
    const col = e.flash ? "#ffffff" : e.color, x = e.x, y = e.y, t = e.t;
    const b = this.ball(e), stun = e.stun > 0;
    Look.shadow(ctx, U.cx(e), y + 40, 46);
    // Chain links.
    const ax = U.cx(e), ay = y + 8, n = 7;
    for (let i = 1; i <= n; i++) {
      const k = i / (n + 1), lx = ax + (b.x - ax) * k, ly = ay + (b.y - ay) * k;
      ctx.strokeStyle = i % 2 ? RUST.steel : "#6a6560"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(lx, ly, 3, 2, e.ang, 0, 6.28); ctx.stroke();
    }
    // Treads with moving links and wheels.
    ctx.beginPath(); U.roundRect(ctx, x, y + 30, 40, 10, 4); Look.fill(ctx, y + 30, 10, "#22160f", 0.1, 0.3);
    ctx.fillStyle = RUST.iron;
    for (let i = 0; i < 6; i++) ctx.fillRect(x + 2 + ((i * 7 + t * (e.dir || 1) * 0.6) % 36 + 36) % 36, y + 31, 3, 2);
    for (const wx of [x + 7, x + 20, x + 33]) { ctx.fillStyle = "#3a3632"; ctx.beginPath(); ctx.arc(wx, y + 35, 3.5, 0, 6.28); ctx.fill(); }
    // Armoured body and cockpit block (dented when stunned).
    rustPlate(ctx, x + 3, y + 8, 34, 23, RUST.rust, col);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x + 6, y + 20, 28, 1);
    for (let i = 0; i < 4; i++) Look.bolt(ctx, x + 8 + i * 8, y + 26, 1.3);
    ctx.beginPath(); ctx.rect(x + 12, y, 16, 9); Look.fill(ctx, y, 9, RUST.dark, 0.2, 0.3);
    ctx.fillStyle = "#1a1210"; ctx.fillRect(x + 14, y + 2, 12, 3);
    // Smoke stack.
    ctx.fillStyle = RUST.iron; ctx.fillRect(x + (e.dir > 0 ? 5 : 31), y + 2, 4, 7);
    if (t % 24 === 0 && Game.state === "play") world.particles.emit(x + (e.dir > 0 ? 7 : 33), y + 1, { vy: -0.7, life: 30, size: 3, grow: 0.15, color: stun ? "#8a8a8a" : "#4a3f3a", shape: "smoke", alpha: 0.45 });
    Look.core(ctx, U.cx(e) + e.dir * 8, y + 16, 3, stun ? "#6a6a6a" : RUST.fire, t, !stun);
    // Wrecking ball: shaded sphere with studs and a motion smear.
    const bs = Math.abs(e.angV || 0.05);
    if (bs > 0.04) { ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.beginPath(); ctx.arc(b.x - Math.cos(e.ang + Math.PI / 2) * 6, b.y - Math.sin(e.ang + Math.PI / 2) * 6, 13, 0, 6.28); ctx.fill(); }
    const g = ctx.createRadialGradient(b.x - 4, b.y - 4, 2, b.x, b.y, 13);
    g.addColorStop(0, "#8a847e"); g.addColorStop(1, "#24211e");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, 13, 0, 6.28); ctx.fill();
    ctx.strokeStyle = RUST.steel; ctx.lineWidth = 2; ctx.stroke();
    for (let i = 0; i < 5; i++) { const a = t * 0.05 + i * 1.256; ctx.fillStyle = "#4a4540"; ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * 9, b.y + Math.sin(a) * 9, 2, 0, 6.28); ctx.fill(); }
  },
});

// ---------------------------------------------------------------- collapseFloor
// Rubble block: you can stand on it briefly; it crumbles, then reforms.
registerEntity("collapseFloor", {
  info: { name: "Rubble", desc: "Crumbles soon after you stand on it, reforms later." },
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
    const going = e.trig != null;
    const sx = going ? U.rand(-2, 2) : 0;
    const x = e.x + sx, y = e.y;
    ctx.fillStyle = "#3a281e"; ctx.fillRect(x, y, 32, 32);
    // Rubble chunks with lit tops.
    for (const [rx, ry, rw, rh] of [[1, 1, 14, 9], [17, 2, 13, 11], [3, 12, 12, 9], [16, 15, 14, 8], [2, 23, 27, 7]]) {
      ctx.beginPath(); ctx.rect(x + rx, y + ry, rw, rh); Look.fill(ctx, y + ry, rh, "#6e4a34", 0.2, 0.3);
    }
    ctx.fillStyle = RUST.dark; ctx.fillRect(x + 15, y + 4, 2, 24);
    if (going) {
      // Cracks glow and grit falls (the telegraph).
      ctx.strokeStyle = RUST.fire; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x + 4, y + 2); ctx.lineTo(x + 10, y + 14); ctx.lineTo(x + 7, y + 26); ctx.moveTo(x + 24, y + 3); ctx.lineTo(x + 20, y + 16); ctx.stroke();
      U.glow(ctx, x + 16, y, 22, RUST.fire, 0.45);
      if (world.time % 4 === 0 && Game.state === "play") world.particles.emit(x + U.rand(2, 30), y + 32, { vy: 1.2, grav: 0.2, life: 18, size: 2, color: "#8a6a50", shape: "square" });
    }
  },
});

// ---------------------------------------------------------------- fireVent
// Floor vent; the hitbox is the flame column above it.
// overrides: height (tiles), on / off (s), offset (s)
registerEntity("fireVent", {
  info: { name: "Fire Vent", desc: "Smokes as a warning, then blasts flame." },
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
    const bx = e.x - 4, by = e.y + e.h, t = world.time;
    // Grated vent box.
    ctx.beginPath(); ctx.rect(bx, by - 9, 32, 9); Look.fill(ctx, by - 9, 9, "#3a2a22", 0.2, 0.4);
    ctx.fillStyle = "#14100c"; for (let i = 0; i < 4; i++) ctx.fillRect(bx + 3 + i * 7, by - 7, 4, 6);
    ctx.fillStyle = e.st === "off" ? "rgba(255,106,26,0.25)" : RUST.fire; for (let i = 0; i < 4; i++) ctx.fillRect(bx + 3 + i * 7, by - 2, 4, 1);
    if (e.st === "warn") {
      ctx.fillStyle = U.rgba(RUST.fire, t % 6 < 3 ? 0.9 : 0.4); ctx.fillRect(bx + 2, by - 11, 28, 3);
      U.glow(ctx, U.cx(e), by - 8, 20, RUST.fire, t % 6 < 3 ? 0.6 : 0.3);
      if (t % 4 === 0 && Game.state === "play") world.particles.emit(U.cx(e) + U.rand(-8, 8), by - 10, { vy: -1.5, life: 20, size: 3, grow: 0.15, color: RUST.smoke, shape: "smoke", alpha: 0.5 });
    } else if (e.st === "on") {
      // Flame column: layered tongues that flicker, bright core.
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let layer = 0; layer < 3; layer++) {
        const col = layer === 0 ? RUST.fire : layer === 1 ? RUST.ember : "#fff3c4";
        const wMax = 26 - layer * 7;
        ctx.fillStyle = U.rgba(col, 0.75 - layer * 0.1);
        ctx.beginPath(); ctx.moveTo(U.cx(e) - wMax / 2, by - 8);
        for (let k = 0; k <= 8; k++) {
          const yy = by - 8 - (k / 8) * e.h * (1 - layer * 0.12);
          const w = wMax * (1 - k / 9) + Math.sin(t * 0.7 + k * 1.3 + layer) * 3;
          ctx.lineTo(U.cx(e) + w / 2, yy);
        }
        for (let k = 8; k >= 0; k--) {
          const yy = by - 8 - (k / 8) * e.h * (1 - layer * 0.12);
          const w = wMax * (1 - k / 9) + Math.sin(t * 0.6 + k * 1.7 + layer * 2) * 3;
          ctx.lineTo(U.cx(e) - w / 2, yy);
        }
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      U.glow(ctx, U.cx(e), by - e.h / 2, 50, RUST.fire, 0.5);
      if (t % 3 === 0 && Game.state === "play") world.particles.emit(U.cx(e) + U.rand(-6, 6), by - e.h, { vx: U.rand(-0.8, 0.8), vy: U.rand(-2.5, -1), life: 22, size: 2, color: RUST.ember, glow: true });
    }
  },
  light(e) { return e.st === "on" ? [120, "#ff6a1a", 1.1] : e.st === "warn" ? [40, "#ff6a1a", 0.5] : null; },
});

// ---------------------------------------------------------------- debrisDrop
// Ceiling crack. A rubble chunk falls on a fixed rhythm (pure function of
// time): warning shadow, fall, shatter. overrides: rate (s), offset (s)
registerEntity("debrisDrop", {
  info: { name: "Falling Debris", desc: "Chunks fall where the red mark flashes." },
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
    const t = world.time;
    // Crack in the ceiling with hanging rebar.
    ctx.fillStyle = RUST.dark; ctx.fillRect(e.col * TILE + 4, e.top - 4, 24, 4);
    ctx.strokeStyle = "#7a6a60"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(e.col * TILE + 8, e.top); ctx.lineTo(e.col * TILE + 10, e.top + 7); ctx.moveTo(e.col * TILE + 22, e.top); ctx.lineTo(e.col * TILE + 21, e.top + 5); ctx.stroke();
    if (e.mode === "warn") {
      // Telegraph: a target strip on the floor, dust trickling down.
      ctx.fillStyle = U.rgba(RUST.fire, t % 8 < 4 ? 0.7 : 0.3);
      ctx.fillRect(e.x, e.floorY - 3, e.w, 3);
      U.glow(ctx, U.cx(e), e.floorY - 2, 24, RUST.fire, 0.35);
      if (t % 5 === 0 && Game.state === "play") world.particles.emit(U.cx(e) + U.rand(-10, 10), e.top + 2, { vy: 2, life: 20, size: 2, color: RUST.steel });
    }
    if (e.mode !== "fall") return;
    const x = e.x, y = e.y;
    ctx.beginPath(); ctx.moveTo(x + 4, y); ctx.lineTo(x + 24, y + 3); ctx.lineTo(x + 28, y + 18); ctx.lineTo(x + 18, y + 28);
    ctx.lineTo(x + 2, y + 22); ctx.closePath();
    Look.fill(ctx, y, 28, "#4a382c", 0.25, 0.4);
    ctx.strokeStyle = RUST.rust; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 10, y + 6); ctx.lineTo(x + 16, y + 16); ctx.stroke();
  },
});

// ---------------------------------------------------------------- toxic
// One cell of toxic pool. The burning surface is a few px below the cell top.
registerEntity("toxic", {
  info: { name: "Toxic Sludge", desc: "Burns and throws you out.", tip: false },
  size: [32, 24],
  anchor: "topleft",
  layer: 2,
  init(e) { e.y += 8; },
  onTouch(e, world, p) {
    if (world.hurtPlayer(1, e, { up: -10 })) { p.vy = -10; world.particles.burst(U.cx(p), p.y + p.h, 10, RUST.toxic, 3); }
  },
  draw(e, ctx, world) {
    const x = e.x, y = e.y, t = world.time;
    const g = ctx.createLinearGradient(0, y, 0, y + 24);
    g.addColorStop(0, U.rgba(RUST.toxic, 0.85)); g.addColorStop(0.25, U.rgba(RUST.toxicDeep, 0.95)); g.addColorStop(1, "rgba(20,40,6,0.95)");
    ctx.fillStyle = g; ctx.fillRect(x, y, 32, 24);
    // Surface waves.
    ctx.fillStyle = RUST.toxic;
    for (let i = 0; i < 4; i++) { const w = Math.sin(t * 0.08 + e.col + i * 1.5) * 2; ctx.fillRect(x + i * 8, y + w + 2, 8, 2); }
    // Bubbles rising and popping.
    for (let i = 0; i < 2; i++) {
      const ph = (t + e.col * 17 + i * 25) % 50;
      if (ph < 14) {
        const k = ph / 14;
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = "#d8ff9a"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x + 8 + i * 12 + (e.col % 3) * 2, y + 12 - k * 12, 2 + k * 2, 0, 6.28); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    U.glow(ctx, x + 16, y + 4, 24, RUST.toxic, 0.3);
    if ((t + e.col * 11) % 70 === 0 && Game.state === "play") world.particles.emit(x + 16, y, { vy: -0.5, life: 40, size: 4, grow: 0.15, color: "#6a9a2a", shape: "smoke", alpha: 0.35 });
  },
  light(e) { return (e.col % 2) ? null : [50, "#9dff3a", 0.35]; },
});

// ---------------------------------------------------------------- crackedFloor / crackedWall
registerEntity("crackedFloor", {
  info: { name: "Cracked Floor", desc: "Ground Slam (or a rocket) breaks it." },
  size: [32, 32],
  anchor: "topleft",
  props: { solid: true, alwaysActive: true },
  draw(e, ctx, world) {
    rustPlate(ctx, e.x, e.y, 32, 32, "#5a3a2a", "#8a5a3a");
    // Glowing fracture lines: an obvious "break me" hint.
    const a = 0.65 + 0.3 * Math.sin(world.time * 0.08 + e.col);
    ctx.strokeStyle = U.rgba(RUST.ember, a); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(e.x + 4, e.y + 2); ctx.lineTo(e.x + 12, e.y + 12); ctx.lineTo(e.x + 9, e.y + 20);
    ctx.lineTo(e.x + 18, e.y + 30); ctx.moveTo(e.x + 12, e.y + 12); ctx.lineTo(e.x + 26, e.y + 8); ctx.stroke();
    U.glow(ctx, e.x + 12, e.y + 12, 10, RUST.ember, a * 0.5);
  },
});
registerEntity("crackedWall", {
  info: { name: "Cracked Wall", desc: "Only a rocket blast breaks it." },
  size: [32, 32],
  anchor: "topleft",
  props: { solid: true, alwaysActive: true },
  draw(e, ctx, world) {
    ctx.fillStyle = "#2e221c"; ctx.fillRect(e.x, e.y, 32, 32);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) {
      const bx = e.x + 1 + c * 16 + (r % 2) * 8 - (r % 2 && c ? 16 : 0), by = e.y + 1 + r * 8;
      ctx.beginPath(); ctx.rect(bx, by, 14, 6); Look.fill(ctx, by, 6, "#6e5040", 0.2, 0.3);
    }
    const a = 0.7 + 0.3 * Math.sin(world.time * 0.1 + e.row);
    ctx.strokeStyle = U.rgba(RUST.fire, a); ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(e.x + 16, e.y); ctx.lineTo(e.x + 12, e.y + 10); ctx.lineTo(e.x + 20, e.y + 18); ctx.lineTo(e.x + 14, e.y + 32); ctx.stroke();
    U.glow(ctx, e.x + 16, e.y + 16, 14, RUST.fire, a * 0.45);
  },
});

// ---------------------------------------------------------------- grappleAnchor
registerEntity("grappleAnchor", {
  info: { name: "Grapple Ring", desc: "Hook it with the Grapple Hook to swing." },
  size: [20, 20],
  anchor: "center",
  layer: 0,
  props: { range: 6.5 },
  draw(e, ctx, world) {
    const cx = U.cx(e), cy = U.cy(e), p = world.player, t = world.time;
    const can = p.has("grapple") && U.dist(cx, cy, U.cx(p), U.cy(p)) <= e.range * TILE;
    // A girder stub with a bolted plate and a ring.
    ctx.beginPath(); ctx.rect(cx - 4, cy - 20, 8, 12); Look.fill(ctx, cy - 20, 12, RUST.iron, 0.25, 0.3);
    Look.bolt(ctx, cx, cy - 16, 1.4);
    ctx.strokeStyle = "#3a3632"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(cx, cy, 7, 0, 6.28); ctx.stroke();
    ctx.strokeStyle = can ? RUST.spark : RUST.steel; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, 7, 0, 6.28); ctx.stroke();
    if (can) {
      U.glow(ctx, cx, cy, 24, RUST.spark, 0.5 + Math.sin(t * 0.2) * 0.2);
      // Rotating "hook here" brackets.
      ctx.strokeStyle = U.rgba(RUST.spark, 0.7); ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) { const a = t * 0.06 + i * 1.57; ctx.beginPath(); ctx.arc(cx, cy, 13, a, a + 0.6); ctx.stroke(); }
    }
  },
});

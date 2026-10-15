/* =========================================================================
 * entities/enemies.js — regular enemies and projectiles.
 *
 *   patrolBot  walks back and forth, turns at walls/ledges   (stomp/shoot/dash)
 *   drone      hovers, chases the player when close           (stomp/shoot/dash)
 *   turret     fires aimed bolts; "turret:ceiling" hangs      (shoot/dash, stomp if on floor)
 *   charger    spots you, revs, charges; armoured until it    (only when stunned)
 *              slams into something and is stunned
 *   sentinel   front energy shield blocks shots and dashes    (stomp, or hit from behind)
 *   spiker     spiked top — stomping hurts you                (shoot or dash)
 *
 * Contact rules (stomp / dash / hurt) live in World.enemyContact; each type
 * only declares flags: stompable, shootable, dashable (bool or function).
 * ========================================================================= */
"use strict";

/** Ground walker step shared by several enemies. Returns the move result. */
function walkStep(e, world, speed, avoidLedges = true) {
  e.vy = Math.min(10, e.vy + 0.6);
  const res = Physics.move(world, e, e.dir * speed, e.vy);
  if (res.hitY) e.vy = 0;
  e.onGround = res.onGround;
  if (res.hitX) e.dir *= -1;
  else if (avoidLedges && e.onGround) {
    const fx = e.dir > 0 ? e.x + e.w + 2 : e.x - 2;
    if (!Physics.groundBelow(world, fx, e.y + e.h)) e.dir *= -1;
  }
  if (e.range && Math.abs(e.x - e.home.x) > e.range * TILE) {
    e.dir = e.x > e.home.x ? -1 : 1;
  }
  if (e.y > world.ph + 100) e.dead = true;
  return res;
}

/** The single glowing "sensor light" every robot has (no faces). */
function sensor(ctx, x, y, r, color) {
  Look.core(ctx, x, y, r, color, typeof Game !== "undefined" ? Game.time : 0);
}

const ENEMY_BASE = { enemy: true, hurts: true, stompable: true, shootable: true, dashable: true, hp: 1 };

// ---------------------------------------------------------------- patrolBot
registerEntity("patrolBot", {
  info: { name: "Patrol Bot", desc: "Walks back and forth. Stomp, shoot or dash it." },
  size: [28, 24],
  props: Object.assign({}, ENEMY_BASE, { speed: 1.0, color: "#ff3df0" }),
  init(e) { e.dir = e.opts.dir === "right" ? 1 : -1; },
  update(e, world) { walkStep(e, world, e.speed); },
  draw(e, ctx, world) {
    const col = e.flash ? "#ffffff" : e.color;
    const t = e.t, d = e.dir;
    const bob = Math.abs(Math.sin(t * 0.25)) * 1.5;
    const cx = U.cx(e), by = e.y + e.h;
    Look.shadow(ctx, cx, by, e.w + 4);
    // Wheels with spokes (spin with travel).
    const spin = t * 0.25 * d;
    for (const wx of [e.x + 6, e.x + e.w - 6]) {
      ctx.fillStyle = "#0e1424"; ctx.beginPath(); ctx.arc(wx, by - 4.5, 4.5, 0, 6.28); ctx.fill();
      ctx.strokeStyle = U.rgba(col, 0.8); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath();
      for (let k = 0; k < 3; k++) { const a = spin + k * 2.09; ctx.moveTo(wx, by - 4.5); ctx.lineTo(wx + Math.cos(a) * 4, by - 4.5 + Math.sin(a) * 4); }
      ctx.stroke();
    }
    // Suspension struts.
    ctx.strokeStyle = "#3a2448"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(e.x + 6, by - 5); ctx.lineTo(e.x + 9, e.y + 14 - bob); ctx.moveTo(e.x + e.w - 6, by - 5); ctx.lineTo(e.x + e.w - 9, e.y + 14 - bob); ctx.stroke();
    // Domed body.
    const y0 = e.y + 2 - bob;
    ctx.beginPath();
    ctx.moveTo(e.x + 1, y0 + 14); ctx.lineTo(e.x + 1, y0 + 8);
    ctx.quadraticCurveTo(e.x + 1, y0, e.x + 9, y0); ctx.lineTo(e.x + e.w - 9, y0);
    ctx.quadraticCurveTo(e.x + e.w - 1, y0, e.x + e.w - 1, y0 + 8); ctx.lineTo(e.x + e.w - 1, y0 + 14); ctx.closePath();
    Look.fill(ctx, y0, 14, "#3a1446");
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    // Visor slot and side vents.
    ctx.fillStyle = "#12061a"; U.roundRect(ctx, cx - 9 + d * 2, y0 + 5, 18, 6, 3); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.12)"; for (let k = 0; k < 3; k++) ctx.fillRect(cx - d * 10 - 1 + k * 2 * -d, y0 + 9, 1, 4);
    // Antenna that sways with the bob.
    const ax = cx - d * 7, ay = y0;
    ctx.strokeStyle = "#5a3a6a"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - d * 3 + Math.sin(t * 0.2) * 2, ay - 7); ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(ax - d * 3 + Math.sin(t * 0.2) * 2 - 1.5, ay - 9, 3, 3);
    Look.core(ctx, cx + d * 5, y0 + 8, 2.6, col, t);
  },
});

// ---------------------------------------------------------------- drone
registerEntity("drone", {
  info: { name: "Drone", desc: "Chases you when you get close. Stomp or shoot it." },
  size: [26, 22],
  anchor: "center",
  props: Object.assign({}, ENEMY_BASE, { speed: 1.3, range: 3, sight: 6, color: "#ffb400" }),
  init(e) { e.phase = Math.random() * 6.28; e.chasing = false; },
  update(e, world) {
    const p = world.player;
    const d = U.dist(U.cx(e), U.cy(e), U.cx(p), U.cy(p));
    const fromHome = U.dist(e.x, e.y, e.home.x, e.home.y);
    e.chasing = p.alive && d < e.sight * TILE && fromHome < 10 * TILE;
    let tx, ty;
    if (e.chasing) { tx = U.cx(p) - e.w / 2; ty = U.cy(p) - e.h / 2 - 10; }
    else {
      tx = e.home.x + Math.sin(e.t * 0.015 + e.phase) * e.range * TILE;
      ty = e.home.y + Math.sin(e.t * 0.05) * 8;
    }
    const sp = e.chasing ? e.speed : e.speed * 1.2;
    e.vx = U.approach(e.vx, U.clamp((tx - e.x) * 0.05, -sp, sp), 0.08);
    e.vy = U.approach(e.vy, U.clamp((ty - e.y) * 0.05, -sp, sp), 0.08);
    Physics.move(world, e, e.vx, e.vy, { solids: false, oneway: false });
    e.face = e.vx >= 0 ? 1 : -1;
  },
  draw(e, ctx, world) {
    const col = e.flash ? "#ffffff" : e.color;
    const cx = U.cx(e), cy = U.cy(e), t = e.t, f = e.face || 1;
    const tilt = U.clamp(e.vx * 0.12, -0.35, 0.35);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt);
    // Rotor arms and blurred blades.
    ctx.strokeStyle = "#5a4420"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-12, -7); ctx.lineTo(12, -7); ctx.stroke();
    for (const rx of [-12, 12]) {
      ctx.fillStyle = U.rgba(col, 0.18); ctx.beginPath(); ctx.ellipse(rx, -10, 9, 2.2, 0, 0, 6.28); ctx.fill();
      const r = Math.sin(t * 0.9 + rx) * 8;
      ctx.strokeStyle = U.rgba(col, 0.85); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(rx - r, -10); ctx.lineTo(rx + r, -10); ctx.stroke();
      ctx.fillStyle = "#2a1e08"; ctx.fillRect(rx - 1.5, -10, 3, 4);
    }
    // Spherical hull with equator band.
    ctx.beginPath(); ctx.arc(0, 0, 10.5, 0, 6.28);
    Look.fill(ctx, -10, 21, "#4a3210", 0.3, 0.45);
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(-10, 1, 20, 3);
    ctx.fillStyle = U.rgba(col, 0.5); ctx.fillRect(-10, 1, 20, 1);
    // Under-thruster.
    Look.thruster(ctx, 0, 10, 0, 1, 7, col, t);
    ctx.restore();
    // Scanning cone while idle, a lock-on ring while chasing.
    if (e.chasing) {
      ctx.strokeStyle = U.rgba("#ff3355", 0.5 + 0.3 * Math.sin(t * 0.4)); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, 16 + Math.sin(t * 0.4) * 2, 0, 6.28); ctx.stroke();
    } else if (Gfx.q.glow > 0.5) {
      const a = Math.sin(t * 0.05) * 0.6 + (f > 0 ? 0.3 : Math.PI - 0.3);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 60);
      g.addColorStop(0, U.rgba(col, 0.18)); g.addColorStop(1, U.rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 60, a - 0.25, a + 0.25); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    Look.core(ctx, cx + f * 3, cy - 1, e.chasing ? 3.4 : 2.6, e.chasing ? "#ff3355" : col, t, e.chasing);
  },
});

// ---------------------------------------------------------------- turret
// overrides: rate (s), range (tiles), bulletSpeed, dir ("left"|"right"|"up"|"down" = fixed aim)
registerEntity("turret", {
  info: { name: "Turret", desc: "Fires at you: hide behind blocks, then shoot it." },
  size: [30, 22],
  props: Object.assign({}, ENEMY_BASE, {
    hp: 2, rate: 2.2, range: 12, bulletSpeed: 3.6, color: "#ff6a2a",
    stompable: (e) => !e.ceiling,
  }),
  init(e, world, arg) {
    e.ceiling = arg === "ceiling";
    if (e.ceiling) e.y = e.row * TILE;
    e.timer = Math.round(e.rate * FPS * 0.5 + (e.col % 5) * 9);
    e.aim = e.ceiling ? Math.PI / 2 : -Math.PI / 2;
    e.charge = 0;
  },
  update(e, world) {
    const p = world.player;
    const mx = U.cx(e), my = e.ceiling ? e.y + e.h - 4 : e.y + 4;
    const fixed = { left: Math.PI, right: 0, up: -Math.PI / 2, down: Math.PI / 2 }[e.opts.dir];
    const inRange = p.alive && U.dist(mx, my, U.cx(p), U.cy(p)) < e.range * TILE;
    const want = fixed != null ? fixed : Math.atan2(U.cy(p) - my, U.cx(p) - mx);
    if (inRange) {
      // Rotate smoothly toward the target.
      let d = want - e.aim;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      e.aim += U.clamp(d, -0.06, 0.06);
    }
    if (e.charge > 0) {
      if (--e.charge === 0) {
        const s = e.bulletSpeed;
        const bx = mx + Math.cos(e.aim) * 16, by = my + Math.sin(e.aim) * 16;
        const b = world.spawn("bullet", bx - 5, by - 5, {});
        if (b) { b.vx = Math.cos(e.aim) * s; b.vy = Math.sin(e.aim) * s; }
        world.particles.burst(bx, by, 6, e.color, 2);
        if (world.onScreen(e)) sfx.play("fire");
      }
    } else if (--e.timer <= 0) {
      e.timer = Math.round(e.rate * FPS);
      if (inRange) e.charge = 28;
    }
  },
  draw(e, ctx, world) {
    const col = e.flash ? "#ffffff" : e.color;
    const mx = U.cx(e), my = e.ceiling ? e.y + e.h - 4 : e.y + 4;
    const k = e.charge > 0 ? 1 - e.charge / 28 : 0;
    // Mount plate with bolts.
    const py = e.ceiling ? e.y : e.y + e.h - 10;
    ctx.beginPath(); ctx.rect(e.x, py, e.w, 10);
    Look.fill(ctx, py, 10, "#4a2616");
    ctx.strokeStyle = U.rgba(col, 0.6); ctx.lineWidth = 1; ctx.strokeRect(e.x + 0.5, py + 0.5, e.w - 1, 9);
    Look.bolt(ctx, e.x + 4, py + 5); Look.bolt(ctx, e.x + e.w - 4, py + 5);
    // Aim line during the wind-up (the telegraph).
    if (e.charge > 0) Look.sight(ctx, mx, my, e.aim, 220, "#ff6a2a", k);
    // Barrel with recoil and cooling fins.
    const recoil = e.charge === 0 && e.timer > Math.round(e.rate * FPS) - 8 ? (e.timer - Math.round(e.rate * FPS) + 8) * 0.6 : 0;
    ctx.save();
    ctx.translate(mx, my); ctx.rotate(e.aim);
    ctx.fillStyle = "#2a140a"; ctx.fillRect(4 - recoil, -4, 15, 8);
    ctx.fillStyle = "#7a4428"; ctx.fillRect(4 - recoil, -3, 15, 6);
    ctx.fillStyle = "rgba(0,0,0,0.35)"; for (let i = 0; i < 3; i++) ctx.fillRect(7 + i * 3 - recoil, -4, 1.5, 8);
    ctx.fillStyle = e.charge > 0 ? U.mix(col, "#ffffff", k) : col; ctx.fillRect(16 - recoil, -3.5, 3, 7);
    ctx.restore();
    // Rotating dome.
    ctx.beginPath(); ctx.arc(mx, my, 11, 0, 6.28);
    Look.fill(ctx, my - 11, 22, "#5a2e18", 0.35, 0.45);
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(mx, my, 7, e.aim - 1.2, e.aim + 1.2); ctx.stroke();
    if (e.charge > 0) Look.telegraph(ctx, mx + Math.cos(e.aim) * 18, my + Math.sin(e.aim) * 18, 6, "#ff6a2a", k);
    Look.core(ctx, mx, my, 2.6, col, e.t, e.charge > 0);
  },
});

// ---------------------------------------------------------------- charger
registerEntity("charger", {
  info: { name: "Charger", desc: "Armoured. Dodge its charge so it crashes, then hit it." },
  size: [34, 26],
  props: Object.assign({}, ENEMY_BASE, {
    speed: 0.8, chargeSpeed: 8, sight: 9, color: "#ff3355",
    stompable: (e) => e.mode === "stun",
    shootable: (e) => e.mode === "stun",
    dashable: (e) => e.mode === "stun",
  }),
  init(e) { e.dir = e.opts.dir === "right" ? 1 : -1; e.mode = "patrol"; e.timer = 0; e.cool = 0; },
  onDeath() { Save.markSeen("charger"); },
  update(e, world) {
    const p = world.player;
    if (e.cool > 0) e.cool--;
    switch (e.mode) {
      case "patrol": {
        walkStep(e, world, e.speed);
        const dx = U.cx(p) - U.cx(e), dy = Math.abs((p.y + p.h) - (e.y + e.h));
        if (p.alive && e.cool <= 0 && Math.abs(dx) < e.sight * TILE && dy < 40) {
          e.dir = U.sign(dx) || e.dir;
          e.mode = "rev"; e.timer = 36;
        }
        break;
      }
      case "rev":
        e.vy = Math.min(10, e.vy + 0.6);
        Physics.move(world, e, 0, e.vy);
        if (world.time % 3 === 0) world.particles.dust(U.cx(e) - e.dir * 14, e.y + e.h, "#ff8a5a", 2, -e.dir * 2);
        if (--e.timer <= 0) e.mode = "charge";
        break;
      case "charge": {
        e.vy = Math.min(10, e.vy + 0.6);
        const res = Physics.move(world, e, e.dir * e.chargeSpeed, e.vy);
        if (res.hitY) e.vy = 0;
        const fx = e.dir > 0 ? e.x + e.w + 2 : e.x - 2;
        const ledge = res.onGround && !Physics.groundBelow(world, fx, e.y + e.h);
        if (world.time % 2 === 0) world.particles.emit(U.cx(e) - e.dir * 16, U.cy(e), { vx: -e.dir * 2, life: 12, size: 3, color: "#ff3355", shape: "square" });
        if (res.hitX || ledge) {
          e.mode = "stun"; e.timer = 120;
          world.particles.burst(e.dir > 0 ? e.x + e.w : e.x, U.cy(e), 14, "#ffe14d", 4);
          if (res.hitX) world.camera.shake(5);
        }
        if (e.y > world.ph + 100) e.dead = true;
        break;
      }
      case "stun":
        e.vy = Math.min(10, e.vy + 0.6);
        Physics.move(world, e, 0, e.vy);
        if (world.time % 8 === 0) world.particles.emit(U.cx(e) + U.rand(-10, 10), e.y, { vy: -1, life: 20, size: 2, color: "#ffe14d" });
        if (--e.timer <= 0) { e.mode = "patrol"; e.dir *= -1; e.cool = 70; }
        break;
    }
  },
  draw(e, ctx, world) {
    const stun = e.mode === "stun", rev = e.mode === "rev", chg = e.mode === "charge";
    const col = e.flash ? "#ffffff" : stun ? "#ffe14d" : e.color;
    const shake = rev ? U.rand(-1.5, 1.5) : 0;
    const x = e.x + shake, y = e.y, d = e.dir, t = e.t;
    Look.shadow(ctx, U.cx(e), y + e.h, e.w + 6);
    // Speed lines while charging.
    if (chg) {
      ctx.strokeStyle = U.rgba(e.color, 0.5); ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) { const ly = y + 4 + i * 6, lx = d > 0 ? x - 6 - (i % 2) * 8 : x + e.w + 6 + (i % 2) * 8; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx - d * (14 + i * 3), ly); ctx.stroke(); }
    }
    // Treads.
    ctx.fillStyle = "#14101c"; U.roundRect(ctx, x + 2, y + e.h - 7, e.w - 4, 7, 3); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    const tr = (t * (chg ? 1.5 : 0.4) * d) % 6;
    for (let k = -1; k < 6; k++) ctx.fillRect(x + 4 + ((k * 6 + tr + 6) % (e.w - 8)), y + e.h - 6, 2, 5);
    // Wedge hull.
    ctx.beginPath();
    ctx.moveTo(x + (d > 0 ? 0 : e.w), y + e.h - 6);
    ctx.lineTo(x + (d > 0 ? 0 : e.w), y + 5);
    ctx.lineTo(x + e.w / 2 - d * 2, y + 1);
    ctx.lineTo(x + (d > 0 ? e.w : 0), y + e.h * 0.55);
    ctx.lineTo(x + (d > 0 ? e.w : 0), y + e.h - 6);
    ctx.closePath();
    Look.fill(ctx, y, e.h, stun ? "#3a2a10" : "#4a1020", 0.25, 0.4);
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    // Armour plates (cracked while stunned) and a ram at the front.
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + e.w / 2, y + 3); ctx.lineTo(x + e.w / 2, y + e.h - 7); ctx.stroke();
    if (stun) { ctx.strokeStyle = "#ffe14d"; ctx.beginPath(); ctx.moveTo(x + e.w / 2 - 4, y + 6); ctx.lineTo(x + e.w / 2 + 1, y + 11); ctx.lineTo(x + e.w / 2 - 2, y + 15); ctx.stroke(); }
    ctx.fillStyle = stun ? "#5a4a20" : "#c9c2d8";
    const fx = d > 0 ? x + e.w - 2 : x + 2;
    ctx.beginPath(); ctx.moveTo(fx, y + e.h * 0.5); ctx.lineTo(fx + d * 6, y + e.h * 0.62); ctx.lineTo(fx, y + e.h * 0.74); ctx.fill();
    // Horn spikes.
    ctx.fillStyle = stun ? "#5a4a20" : col;
    for (let i = 0; i < 3; i++) {
      const sx = x + 6 + i * 9;
      ctx.beginPath(); ctx.moveTo(sx, y + 4); ctx.lineTo(sx + 4 + d * 2, y - 5); ctx.lineTo(sx + 8, y + 4); ctx.fill();
    }
    // Exhaust pipes: smoke idle, fire while revving.
    const ex = d > 0 ? x + 3 : x + e.w - 3;
    ctx.fillStyle = "#2a2a34"; ctx.fillRect(ex - 2, y + 2, 4, 6);
    if (rev || chg) Look.thruster(ctx, ex, y + 2, -d * 0.4, -1, rev ? 10 : 7, "#ff6a2a", t);
    else if (world.time % 20 === 0 && !stun && Game.state === "play") world.particles.emit(ex, y + 1, { vy: -0.6, vx: -d * 0.3, life: 30, size: 3, grow: 0.12, color: "#55505e", shape: "smoke", alpha: 0.35 });
    Look.core(ctx, x + e.w / 2 + d * 8, y + e.h * 0.42, rev || chg ? 3.4 : 2.5, rev || chg ? "#ff3355" : col, t, rev || chg);
    if (rev) Look.warn(ctx, U.cx(e), y - 14, "#ff3355", t);
    if (stun) {
      ctx.strokeStyle = "#ffe14d"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(U.cx(e), y - 8, 7, t * 0.2, t * 0.2 + 4); ctx.stroke();
    }
  },
});

// ---------------------------------------------------------------- sentinel
registerEntity("sentinel", {
  info: { name: "Sentinel", desc: "Its front shield blocks shots and dashes: hit it from behind." },
  size: [28, 32],
  props: Object.assign({}, ENEMY_BASE, { speed: 0.6, color: "#9d6bff" }),
  init(e) { e.dir = e.opts.dir === "right" ? 1 : -1; },
  onDeath() { Save.markSeen("sentinel"); },
  /** Attacks travelling against the facing direction hit the shield. */
  blocks(e, world, attackDir) { return attackDir === -e.dir; },
  update(e, world) {
    // Turn to face the player when they are close, so you must outsmart it.
    const p = world.player;
    const dx = U.cx(p) - U.cx(e);
    if (Math.abs(dx) < 5 * TILE && Math.abs(U.cy(p) - U.cy(e)) < 48 && e.t % 40 === 0) e.dir = U.sign(dx) || e.dir;
    walkStep(e, world, e.speed);
  },
  draw(e, ctx, world) {
    const col = e.flash ? "#ffffff" : e.color;
    const t = e.t, d = e.dir, cx = U.cx(e), by = e.y + e.h;
    Look.shadow(ctx, cx, by, e.w + 2);
    // Two stepping legs.
    const ph = t * 0.18;
    for (const [k, s] of [[-1, Math.sin(ph)], [1, -Math.sin(ph)]]) {
      const hx = cx + k * 5, hy = by - 9;
      const fx = hx + s * 4 * d, fy = by - Math.max(0, s) * 2;
      ctx.strokeStyle = k < 0 ? "#2a1a48" : "#3a2860"; ctx.lineWidth = 3.5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo((hx + fx) / 2 + d * 2, hy + 4); ctx.lineTo(fx, fy - 1); ctx.stroke();
      ctx.fillStyle = "#14101c"; ctx.fillRect(fx - 3, fy - 2, 6, 2);
    }
    // Tall armoured body.
    Look.box(ctx, e.x + 3, e.y + 2, e.w - 6, e.h - 11, 5, "#2a1a4a", col);
    ctx.fillStyle = "#120a22"; ctx.fillRect(cx - 7, e.y + 7, 14, 6);
    for (let i = 0; i < 3; i++) Look.bolt(ctx, e.x + 7 + i * 7, e.y + e.h - 13, 1.2);
    Look.core(ctx, cx + d * 3, e.y + 10, 2.5, col, t);
    // Emitter arm and a hex-patterned shield arc in front.
    const sx = d > 0 ? e.x + e.w + 4 : e.x - 4, cy = U.cy(e);
    ctx.strokeStyle = "#4a3a70"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx + d * 6, cy - 2); ctx.lineTo(sx - d * 6, cy); ctx.stroke();
    const a = 0.55 + Math.sin(world.time * 0.2) * 0.2;
    const a0 = d > 0 ? -1.05 : Math.PI - 1.05, a1 = a0 + 2.1;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = U.rgba("#5ef0ff", 0.12);
    ctx.beginPath(); ctx.arc(sx - d * 10, cy, 20, a0, a1); ctx.arc(sx - d * 10, cy, 15, a1, a0, true); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = U.rgba("#5ef0ff", a); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(sx - d * 10, cy, 19, a0, a1); ctx.stroke();
    ctx.strokeStyle = U.rgba("#5ef0ff", 0.35); ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) { const an = a0 + (a1 - a0) * i / 5; ctx.beginPath(); ctx.moveTo(sx - d * 10 + Math.cos(an) * 15, cy + Math.sin(an) * 15); ctx.lineTo(sx - d * 10 + Math.cos(an) * 20, cy + Math.sin(an) * 20); ctx.stroke(); }
    const sweep = a0 + ((t * 0.04) % 1) * (a1 - a0);
    U.glow(ctx, sx - d * 10 + Math.cos(sweep) * 18, cy + Math.sin(sweep) * 18, 8, "#ffffff", 0.6);
    ctx.restore();
    U.glow(ctx, sx, cy, 20, "#5ef0ff", 0.25);
  },
});

// ---------------------------------------------------------------- spiker
registerEntity("spiker", {
  info: { name: "Spiker", desc: "Spiked top, don't stomp it. Shoot or dash it." },
  size: [30, 20],
  props: Object.assign({}, ENEMY_BASE, { hp: 2, speed: 0.7, color: "#7dff4a", stompable: false }),
  init(e) { e.dir = e.opts.dir === "right" ? 1 : -1; },
  update(e, world) { walkStep(e, world, e.speed); },
  draw(e, ctx, world) {
    const col = e.flash ? "#ffffff" : e.color;
    const cx = U.cx(e), by = e.y + e.h, t = e.t, d = e.dir;
    Look.shadow(ctx, cx, by, e.w + 4);
    // Little scuttling legs.
    ctx.strokeStyle = "#0e2208"; ctx.lineWidth = 2; ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      const lx = e.x + 5 + i * 6.5, s = Math.sin(t * 0.4 + i * 1.6) * 2;
      ctx.beginPath(); ctx.moveTo(lx, by - 5); ctx.lineTo(lx + s, by - 0.5); ctx.stroke();
    }
    // Spikes breathe in and out; brighter tips.
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + (i + 0.5) * (Math.PI / 5);
      const len = 21 + Math.sin(t * 0.15 + i * 1.3) * 2.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a - 0.24) * 12, by - 5 + Math.sin(a - 0.24) * 12);
      ctx.lineTo(cx + Math.cos(a) * len, by - 5 + Math.sin(a) * len);
      ctx.lineTo(cx + Math.cos(a + 0.24) * 12, by - 5 + Math.sin(a + 0.24) * 12);
      const g = ctx.createLinearGradient(cx, by - 5, cx + Math.cos(a) * len, by - 5 + Math.sin(a) * len);
      g.addColorStop(0, U.mix(col, "#000000", 0.4)); g.addColorStop(1, U.mix(col, "#ffffff", 0.5));
      ctx.fillStyle = g; ctx.fill();
    }
    // Shell.
    ctx.beginPath(); ctx.arc(cx, by - 5, 14, Math.PI, 0); ctx.closePath();
    Look.fill(ctx, by - 19, 14, "#1e4410", 0.3, 0.3);
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, by - 5, 9, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = "#0e2208"; ctx.fillRect(e.x + 1, by - 6, e.w - 2, 3);
    Look.core(ctx, cx + d * 6, by - 10, 2.4, col, t);
  },
});

// ---------------------------------------------------------------- bullet
// Enemy projectile. Passes harmlessly through a dashing player.
registerEntity("bullet", {
  size: [10, 10],
  layer: 2,
  props: { transient: true, alwaysActive: true, color: "#ff6a2a" },
  init(e) { e.life = 300; },
  update(e, world) {
    e.x += e.vx; e.y += e.vy;
    if (--e.life <= 0) e.dead = true;
    if (Physics.solidAtPx(world, U.cx(e), U.cy(e))) {
      e.dead = true;
      world.particles.burst(U.cx(e), U.cy(e), 5, e.color, 2);
    }
    if (world.time % 3 === 0) world.particles.emit(U.cx(e), U.cy(e), { life: 10, size: 2.5, color: e.color });
  },
  onTouch(e, world, p) {
    if (p.dashing > 0) return;
    if (world.hurtPlayer(1, e)) e.dead = true;
  },
  draw(e, ctx) {
    Look.comet(ctx, U.cx(e), U.cy(e), e.vx || 0, e.vy || 0, 3.6, e.color, "#fff0d0");
  },
});

// The player's projectiles live in core/weapons.js ("playerShot").

// ---------------------------------------------------------------- shockwave
// Ground wave created by heavy landings (bosses). Jump over it.
registerEntity("shockwave", {
  size: [18, 20],
  layer: 2,
  props: { transient: true, alwaysActive: true, hurts: true, speed: 4.5 },
  init(e) { e.life = 160; e.dir = 1; },
  update(e, world) {
    const res = Physics.move(world, e, e.dir * e.speed, 0, { solids: false });
    const fx = e.dir > 0 ? e.x + e.w + 1 : e.x - 1;
    if (res.hitX || !Physics.groundBelow(world, fx, e.y + e.h) || --e.life <= 0) {
      e.dead = true;
      world.particles.burst(U.cx(e), e.y + e.h, 6, "#ffb400", 2);
    }
  },
  draw(e, ctx, world) {
    const cx = U.cx(e), by = e.y + e.h, t = world.time;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    U.glow(ctx, cx, by - 8, 24, "#ffb400", 0.7);
    const g = ctx.createLinearGradient(0, e.y - 4, 0, by);
    g.addColorStop(0, "rgba(255,240,200,0.95)"); g.addColorStop(1, "rgba(255,140,0,0.4)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(e.x - 4, by);
    ctx.quadraticCurveTo(cx - e.dir * 4, e.y - 4 + Math.sin(t * 0.6) * 3, e.x + e.w + 4, by);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    if (t % 3 === 0 && Game.state === "play") world.particles.emit(cx, by - 2, { vx: -e.dir * U.rand(0.5, 2), vy: U.rand(-2.5, -0.5), life: 14, size: 2, color: "#ffd27a", shape: "spark" });
  },
});

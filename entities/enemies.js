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
  U.glow(ctx, x, y, r * 4, color, 0.7);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
}

const ENEMY_BASE = { enemy: true, hurts: true, stompable: true, shootable: true, dashable: true, hp: 1 };

// ---------------------------------------------------------------- patrolBot
registerEntity("patrolBot", {
  size: [28, 24],
  props: Object.assign({}, ENEMY_BASE, { speed: 1.0, color: "#ff3df0" }),
  init(e) { e.dir = e.opts.dir === "right" ? 1 : -1; },
  update(e, world) { walkStep(e, world, e.speed); },
  draw(e, ctx, world) {
    const col = e.flash ? "#ffffff" : e.color;
    const bob = Math.sin(e.t * 0.3) * 1;
    ctx.fillStyle = "#2a0f33";
    U.roundRect(ctx, e.x, e.y + 2 + bob, e.w, e.h - 8, 5); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    // Wheels.
    ctx.fillStyle = "#14203c";
    const spin = e.t * 0.3 * e.dir;
    for (const wx of [e.x + 6, e.x + e.w - 6]) {
      ctx.beginPath(); ctx.arc(wx, e.y + e.h - 4, 4, 0, 6.28); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(wx, e.y + e.h - 4); ctx.lineTo(wx + Math.cos(spin) * 4, e.y + e.h - 4 + Math.sin(spin) * 4); ctx.stroke();
    }
    sensor(ctx, U.cx(e) + e.dir * 6, e.y + 9 + bob, 3, col);
  },
});

// ---------------------------------------------------------------- drone
registerEntity("drone", {
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
    const cx = U.cx(e), cy = U.cy(e);
    // Rotor bars.
    const r = Math.sin(e.t * 0.8) * 12;
    ctx.strokeStyle = U.rgba(col, 0.7); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - r, cy - 13); ctx.lineTo(cx + r, cy - 13); ctx.stroke();
    ctx.fillStyle = "#33220a";
    ctx.beginPath(); ctx.arc(cx, cy, 11, 0, 6.28); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 11); ctx.lineTo(cx, cy - 13); ctx.stroke();
    sensor(ctx, cx + (e.face || 1) * 3, cy, e.chasing ? 3.5 : 2.5, e.chasing ? "#ff3355" : col);
  },
});

// ---------------------------------------------------------------- turret
// overrides: rate (s), range (tiles), bulletSpeed, dir ("left"|"right"|"up"|"down" = fixed aim)
registerEntity("turret", {
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
    // Base.
    ctx.fillStyle = "#331a10";
    if (e.ceiling) ctx.fillRect(e.x, e.y, e.w, 10); else ctx.fillRect(e.x, e.y + e.h - 10, e.w, 10);
    ctx.fillStyle = "#4a2616";
    ctx.beginPath(); ctx.arc(mx, my, 11, 0, 6.28); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    // Barrel.
    ctx.save();
    ctx.translate(mx, my); ctx.rotate(e.aim);
    ctx.fillStyle = "#6b3a22"; ctx.fillRect(0, -3, 17, 6);
    ctx.fillStyle = col; ctx.fillRect(14, -3, 3, 6);
    ctx.restore();
    if (e.charge > 0) U.glow(ctx, mx + Math.cos(e.aim) * 16, my + Math.sin(e.aim) * 16, 8 + (28 - e.charge), "#ff6a2a", 0.8);
    sensor(ctx, mx, my, 2.5, col);
  },
});

// ---------------------------------------------------------------- charger
registerEntity("charger", {
  size: [34, 26],
  props: Object.assign({}, ENEMY_BASE, {
    speed: 0.8, chargeSpeed: 8, sight: 9, color: "#ff3355",
    stompable: (e) => e.mode === "stun",
    shootable: (e) => e.mode === "stun",
    dashable: (e) => e.mode === "stun",
  }),
  init(e) { e.dir = e.opts.dir === "right" ? 1 : -1; e.mode = "patrol"; e.timer = 0; e.cool = 0; },
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
    const stun = e.mode === "stun";
    const col = e.flash ? "#ffffff" : stun ? "#ffe14d" : e.color;
    const shake = e.mode === "rev" ? U.rand(-1.5, 1.5) : 0;
    const x = e.x + shake, y = e.y, d = e.dir;
    // Wedge body.
    ctx.fillStyle = "#3a0d18";
    ctx.beginPath();
    ctx.moveTo(x + (d > 0 ? 0 : e.w), y + e.h - 4);
    ctx.lineTo(x + (d > 0 ? 0 : e.w), y + 4);
    ctx.lineTo(x + e.w / 2, y);
    ctx.lineTo(x + (d > 0 ? e.w : 0), y + e.h * 0.55);
    ctx.lineTo(x + (d > 0 ? e.w : 0), y + e.h - 4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    // Armour spikes on top & front (gone dark while stunned).
    ctx.fillStyle = stun ? "#5a4a20" : col;
    for (let i = 0; i < 3; i++) {
      const sx = x + 6 + i * 9;
      ctx.beginPath(); ctx.moveTo(sx, y + 3); ctx.lineTo(sx + 4, y - 5); ctx.lineTo(sx + 8, y + 3); ctx.fill();
    }
    ctx.fillStyle = "#14203c";
    ctx.fillRect(x + 3, y + e.h - 5, e.w - 6, 5);
    sensor(ctx, x + e.w / 2 + d * 8, y + e.h * 0.45, e.mode === "rev" || e.mode === "charge" ? 3.5 : 2.5,
      e.mode === "rev" || e.mode === "charge" ? "#ff3355" : col);
    if (stun) {
      ctx.strokeStyle = "#ffe14d"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(U.cx(e), y - 8, 7, e.t * 0.2, e.t * 0.2 + 4); ctx.stroke();
    }
  },
});

// ---------------------------------------------------------------- sentinel
registerEntity("sentinel", {
  size: [28, 32],
  props: Object.assign({}, ENEMY_BASE, { speed: 0.6, color: "#9d6bff" }),
  init(e) { e.dir = e.opts.dir === "right" ? 1 : -1; },
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
    ctx.fillStyle = "#1e1238";
    U.roundRect(ctx, e.x + 2, e.y + 2, e.w - 4, e.h - 6, 4); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#14203c";
    ctx.fillRect(e.x + 4, e.y + e.h - 5, e.w - 8, 5);
    sensor(ctx, U.cx(e) + e.dir * 4, e.y + 10, 2.5, col);
    // Shield arc in front.
    const sx = e.dir > 0 ? e.x + e.w + 4 : e.x - 4;
    const a = 0.6 + Math.sin(world.time * 0.2) * 0.2;
    ctx.strokeStyle = U.rgba("#5ef0ff", a); ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sx - e.dir * 10, U.cy(e), 18, e.dir > 0 ? -1 : Math.PI - 1, e.dir > 0 ? 1 : Math.PI + 1);
    ctx.stroke();
    U.glow(ctx, sx, U.cy(e), 18, "#5ef0ff", 0.3);
  },
});

// ---------------------------------------------------------------- spiker
registerEntity("spiker", {
  size: [30, 20],
  props: Object.assign({}, ENEMY_BASE, { hp: 2, speed: 0.7, color: "#7dff4a", stompable: false }),
  init(e) { e.dir = e.opts.dir === "right" ? 1 : -1; },
  update(e, world) { walkStep(e, world, e.speed); },
  draw(e, ctx, world) {
    const col = e.flash ? "#ffffff" : e.color;
    const cx = U.cx(e), by = e.y + e.h;
    ctx.fillStyle = col;
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + (i + 0.5) * (Math.PI / 5);
      const wob = Math.sin(e.t * 0.2 + i) * 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a - 0.25) * 12, by - 4 + Math.sin(a - 0.25) * 12);
      ctx.lineTo(cx + Math.cos(a) * (22 + wob), by - 4 + Math.sin(a) * (22 + wob));
      ctx.lineTo(cx + Math.cos(a + 0.25) * 12, by - 4 + Math.sin(a + 0.25) * 12);
      ctx.fill();
    }
    ctx.fillStyle = "#16330c";
    ctx.beginPath(); ctx.arc(cx, by - 4, 14, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillRect(e.x + 1, by - 4, e.w - 2, 4);
    sensor(ctx, cx + e.dir * 6, by - 9, 2.5, col);
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
    U.glow(ctx, U.cx(e), U.cy(e), 14, e.color, 0.8);
    ctx.fillStyle = "#fff0d0";
    ctx.beginPath(); ctx.arc(U.cx(e), U.cy(e), 4, 0, 6.28); ctx.fill();
  },
});

// ---------------------------------------------------------------- pulseShot
// The player's ranged attack.
registerEntity("pulseShot", {
  size: [14, 8],
  layer: 2,
  props: { transient: true, alwaysActive: true },
  init(e) { e.life = 45; },
  update(e, world) {
    e.x += e.vx;
    if (--e.life <= 0) { e.dead = true; return; }
    if (Physics.solidAtPx(world, U.cx(e), U.cy(e))) {
      e.dead = true;
      world.particles.burst(U.cx(e), U.cy(e), 6, "#7dff4a", 2);
      return;
    }
    for (const o of world.entities) {
      if (o.dead || !o.active || o === e || !U.overlap(e, o)) continue;
      if (o.name === "bullet") { o.dead = true; e.dead = true; sfx.play("hit"); world.particles.burst(U.cx(o), U.cy(o), 8, "#ffffff", 3); return; }
      if (!o.enemy) continue;
      e.dead = true;
      const dir = U.sign(e.vx);
      const blocked = (o.def.blocks && o.def.blocks(o, world, dir)) || !U.flag(o.shootable, o, world);
      if (blocked) {
        sfx.play("blocked");
        world.particles.burst(U.cx(e), U.cy(e), 8, "#5ef0ff", 3);
        world.particles.ring(U.cx(e), U.cy(e), "#5ef0ff", 10, 10);
      } else {
        world.damageEntity(o, 1, "shot");
      }
      return;
    }
  },
  draw(e, ctx) {
    U.glow(ctx, U.cx(e), U.cy(e), 16, "#7dff4a", 0.9);
    ctx.fillStyle = "#e6ffd6";
    ctx.fillRect(e.x, e.y + 2, e.w, 4);
  },
});

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
    const cx = U.cx(e), by = e.y + e.h;
    U.glow(ctx, cx, by - 8, 20, "#ffb400", 0.6);
    ctx.fillStyle = "#ffd27a";
    ctx.beginPath();
    ctx.moveTo(e.x, by); ctx.lineTo(cx, e.y + Math.sin(world.time * 0.6) * 3); ctx.lineTo(e.x + e.w, by);
    ctx.closePath(); ctx.fill();
  },
});

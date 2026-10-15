/* =========================================================================
 * entities/hacking.js — World 2 "Hacking World" enemies and hazards.
 *
 *   avDrone        antivirus drone: scans, locks on, fires a dart  (stomp/shoot/dash)
 *   firewallWall   living barrier: shoot it down, or Data Dash through it
 *   bugCrawler     fast crawler that hops at you; splits into two bitBugs
 *   trojan         looks like a repair pickup — springs when you get close
 *   glitchBlock    solid block that corrupts in and out on a rhythm
 *   lockedGate     sealed door; opens for a player with Root Access
 *
 * Also adds the World 2 ability names (Data Dash, Freeze Process, Root
 * Access) to the upgrade banner table, and their sounds.
 * ========================================================================= */
"use strict";

const HACK_GREEN = "#39ff88";

Object.assign(UPGRADE_INFO, {
  dataDash: { name: "DATA DASH", how: "{dash}: phase through" },
  freeze: { name: "FREEZE PROCESS", how: "{freeze}" },
  rootAccess: { name: "ROOT ACCESS", how: "opens locked gates" },
});

sfx.define("freeze", (s, t) => {
  s.tone(t, { type: "square", f0: 1800, f1: 200, dur: 0.3, vol: 0.08 });
  s.tone(t, { type: "sine", f0: 900, f1: 880, dur: 0.35, vol: 0.06, delay: 0.05 });
}, 0.3);
sfx.define("unlock", (s, t) => s.arp(t, [392, 587, 784], { type: "square", step: 0.05, vol: 0.08 }), 0.2);
sfx.define("glitch", (s, t) => {
  s.noise(t, { filter: "bandpass", f0: 600, f1: 3000, dur: 0.12, vol: 0.14, q: 4 });
  s.tone(t, { type: "square", f0: 90, f1: 400, dur: 0.1, vol: 0.06 });
}, 0.12);

/** Is the straight line between two points free of solid tiles? */
function lineClear(world, x0, y0, x1, y1) {
  for (let i = 1; i < 8; i++) {
    const k = i / 8;
    if (Physics.solidAtPx(world, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k)) return false;
  }
  return true;
}

// ---------------------------------------------------------------- avDrone
registerEntity("avDrone", {
  size: [28, 24],
  anchor: "center",
  props: { enemy: true, hurts: true, stompable: true, shootable: true, dashable: true, hp: 2,
    speed: 1.1, range: 4, sight: 7, color: HACK_GREEN },
  init(e) { e.phase = Math.random() * 6.28; e.lock = 0; e.cool = 60 + Math.floor(Math.random() * 60); },
  update(e, world) {
    const p = world.player;
    const cx = U.cx(e), cy = U.cy(e), px = U.cx(p), py = U.cy(p);
    const sees = p.alive && U.dist(cx, cy, px, py) < e.sight * TILE && lineClear(world, cx, cy, px, py);
    // Patrol a slow figure-eight around home; drift toward the player when locked.
    let tx = e.home.x + Math.sin(e.t * 0.012 + e.phase) * e.range * TILE;
    let ty = e.home.y + Math.sin(e.t * 0.024 + e.phase) * 10;
    if (e.lock > 0) { tx = U.lerp(tx, px - e.w / 2, 0.3); ty = U.lerp(ty, py - 60, 0.3); }
    e.vx = U.approach(e.vx, U.clamp((tx - e.x) * 0.04, -e.speed, e.speed), 0.06);
    e.vy = U.approach(e.vy, U.clamp((ty - e.y) * 0.04, -e.speed, e.speed), 0.06);
    Physics.move(world, e, e.vx, e.vy, { solids: false, oneway: false });
    if (e.cool > 0) e.cool--;
    if (e.lock > 0) {
      if (--e.lock === 0) {
        const a = Math.atan2(py - cy, px - cx);
        const b = world.spawn("bullet", cx - 5, cy - 5, {});
        if (b) { b.vx = Math.cos(a) * 4.2; b.vy = Math.sin(a) * 4.2; b.color = HACK_GREEN; }
        if (world.onScreen(e)) sfx.play("fire");
        e.cool = 110;
      }
    } else if (sees && e.cool <= 0) {
      e.lock = 34; // telegraph: the scan beam turns red, then it fires
    }
    e.scan = Math.sin(e.t * 0.05) * 0.6;
  },
  draw(e, ctx, world) {
    const cx = U.cx(e), cy = U.cy(e);
    const locked = e.lock > 0;
    const col = e.flash ? "#ffffff" : locked ? "#ff3355" : e.color;
    // Scan cone.
    ctx.globalAlpha = locked ? 0.22 : 0.1;
    ctx.fillStyle = col;
    const a = Math.PI / 2 + e.scan;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a - 0.3) * 120, cy + Math.sin(a - 0.3) * 120);
    ctx.lineTo(cx + Math.cos(a + 0.3) * 120, cy + Math.sin(a + 0.3) * 120);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    // Hexagonal shell with a single scanning light.
    ctx.fillStyle = "#06180e";
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const k = (Math.PI / 3) * i + e.t * 0.02;
      const x = cx + Math.cos(k) * 13, y = cy + Math.sin(k) * 11;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    U.glow(ctx, cx, cy, locked ? 22 : 14, col, 0.8);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx - 5 + e.scan * 5, cy - 1.5, 10, 3);
  },
});

// ---------------------------------------------------------- firewallWall
// One "I" at the top of a doorway; the wall fills it down to the floor.
registerEntity("firewallWall", {
  size: [32, 32],
  anchor: "topleft",
  layer: 2,
  props: { enemy: true, hurts: false, solid: true, shootable: true, stompable: "bounce", dashable: false,
    hp: 6, color: "#ff6a2a", alwaysActive: true, noFreeze: true },
  init(e, world) {
    let r = e.row;
    while (r < world.h && !Physics.solidAt(world, e.col, r)) r++;
    e.x = e.col * TILE + 4; e.w = 24;
    e.h = Math.max(TILE, (r - e.row) * TILE);
  },
  update(e, world) {
    const p = world.player;
    // Data Dash phases straight through (decided before the player moves).
    const phasing = p.alive && p.has("dataDash") &&
      (p.dashing > 0 || (Input.pressed("dash") && p.canDash && p.dashCool <= 0 && Math.abs(U.cx(p) - U.cx(e)) < 5 * TILE));
    const inside = U.overlap(p, e);
    e.phasing = phasing || inside;
    e.solid = !e.phasing;
    if (e.phasing) world.solids = world.solids.filter((s) => s !== e);
  },
  draw(e, ctx, world) {
    const col = e.flash ? "#ffffff" : e.color;
    ctx.globalAlpha = e.phasing ? 0.35 : 1;
    ctx.fillStyle = "#200a04";
    ctx.fillRect(e.x, e.y, e.w, e.h);
    // Brick rows with rising embers of code.
    ctx.fillStyle = col;
    for (let y = e.y, row = 0; y < e.y + e.h; y += 10, row++) {
      const off = row % 2 ? 6 : 0;
      for (let x = e.x - off; x < e.x + e.w; x += 12) ctx.fillRect(Math.max(e.x, x) + 1, y + 1, Math.min(10, e.x + e.w - Math.max(e.x, x) - 1), 1);
    }
    const k = (world.time * 1.5 + e.col * 37) % e.h;
    ctx.fillStyle = U.rgba(col, 0.6);
    ctx.fillRect(e.x + 2, e.y + e.h - k, e.w - 4, 3);
    // Health ticks.
    ctx.fillStyle = col;
    for (let i = 0; i < e.hp; i++) ctx.fillRect(e.x + 3 + i * 3.4, e.y + 3, 2, 4);
    if (!e.phasing && world.time % 4 === 0) U.glow(ctx, U.cx(e), e.y + e.h - 6, 18, col, 0.35);
    ctx.globalAlpha = 1;
  },
});

// ---------------------------------------------------------- bugCrawler
function drawBug(ctx, e, segs) {
  const col = e.flash ? "#ffffff" : e.color;
  const by = e.y + e.h - 5;
  for (let i = 0; i < segs; i++) {
    const x = e.x + e.w / 2 - e.dir * (i - 1) * (e.w / (segs + 0.5));
    const r = e.h * 0.42 - i * 0.6;
    const bob = Math.sin(e.t * 0.4 + i) * 1.2;
    ctx.fillStyle = "#0e2206";
    ctx.beginPath(); ctx.arc(x, by - r + 3 + bob, r, 0, 6.28); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 3, by + 2); ctx.lineTo(x - 5, by + 5); ctx.moveTo(x + 3, by + 2); ctx.lineTo(x + 5, by + 5); ctx.stroke();
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(e.x + e.w / 2 + e.dir * (e.w / 2 - 4) - 1.5, by - e.h * 0.5, 3, 3);
}

registerEntity("bugCrawler", {
  size: [26, 16],
  props: { enemy: true, hurts: true, stompable: true, shootable: true, dashable: true, hp: 1, speed: 1.6, color: "#b6ff3a" },
  init(e) { e.dir = e.opts.dir === "right" ? 1 : -1; e.hop = 40 + Math.floor(Math.random() * 40); },
  update(e, world) {
    const p = world.player;
    walkStep(e, world, e.speed);
    if (e.onGround && --e.hop <= 0) {
      e.hop = 80;
      const dx = U.cx(p) - U.cx(e);
      if (Math.abs(dx) < 6 * TILE && Math.abs(U.cy(p) - U.cy(e)) < 3 * TILE) { e.dir = U.sign(dx) || e.dir; e.vy = -7.5; }
    }
  },
  onDeath(e, world) {
    for (const d of [-1, 1]) {
      const b = world.spawn("bitBug", U.cx(e) - 7 + d * 6, e.y + e.h - 10, {});
      if (b) { b.dir = d; b.vy = -4; b.transient = true; }
    }
  },
  draw(e, ctx) { drawBug(ctx, e, 3); },
});

registerEntity("bitBug", {
  size: [14, 10],
  props: { enemy: true, hurts: true, stompable: true, shootable: true, dashable: true, hp: 1, speed: 2.2, color: "#b6ff3a" },
  init(e) { e.dir = 1; },
  update(e, world) { walkStep(e, world, e.speed); },
  draw(e, ctx) { drawBug(ctx, e, 2); },
});

// ---------------------------------------------------------- trojan
// Disguised as a repair capsule. A faint glitch every few seconds gives it away.
registerEntity("trojan", {
  size: [24, 24],
  props: { enemy: true, hurts: true, stompable: true, shootable: true, dashable: true, hp: 2, color: "#ff3df0" },
  init(e) { e.mode = "disguise"; e.hopT = 0; e.homeY = e.y; },
  reveal(e, world) {
    if (e.mode !== "disguise") return;
    e.mode = "awake"; e.hopT = 20;
    world.particles.burst(U.cx(e), U.cy(e), 18, e.color, 4);
    if (world.onScreen(e)) sfx.play("glitch");
  },
  update(e, world) {
    const p = world.player;
    if (e.mode === "disguise") {
      e.y = e.homeY + Math.sin(e.t * 0.06) * 2; // floats like a real pickup
      const near = Math.abs(U.cx(p) - U.cx(e)) < 2.2 * TILE && Math.abs(U.cy(p) - U.cy(e)) < 1.6 * TILE;
      if (p.alive && (near || e.hp < e.maxHp)) this.reveal(e, world);
      return;
    }
    // Awake: hop at the player.
    e.vy = Math.min(10, e.vy + 0.6);
    const res = Physics.move(world, e, e.vx, e.vy);
    if (res.hitY) { e.vy = 0; e.vx = U.approach(e.vx, 0, 1); }
    if (res.hitX) e.vx = -e.vx * 0.5;
    if (res.onGround && --e.hopT <= 0) {
      e.hopT = 48;
      e.vx = U.clamp((U.cx(p) - U.cx(e)) / 30, -3.2, 3.2);
      e.vy = -8;
    }
    if (e.y > world.ph + 100) e.dead = true;
  },
  onTouch(e, world, p) {
    if (e.mode === "disguise") { this.reveal(e, world); world.hurtPlayer(1, e); return; }
    world.enemyContact(e);
  },
  draw(e, ctx, world) {
    const cx = U.cx(e), cy = U.cy(e);
    if (e.mode === "disguise") {
      // Same look as a repair power-up…
      const glitch = (e.t + e.col * 31) % 170 < 4;
      const gx = glitch ? U.rand(-3, 3) : 0;
      U.glow(ctx, cx, cy, 26, "#ff4d6d", 0.6);
      ctx.fillStyle = "#0b1328";
      U.roundRect(ctx, cx - 11 + gx, cy - 11, 22, 22, 6); ctx.fill();
      ctx.strokeStyle = glitch ? "#ff3df0" : "#ff4d6d"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = glitch ? "#ff3df0" : "#ff4d6d";
      ctx.fillRect(cx - 2 + gx, cy - 6, 4, 12); ctx.fillRect(cx - 6 + gx, cy - 2, 12, 4);
      return;
    }
    // …until it unfolds into a jagged box.
    const col = e.flash ? "#ffffff" : e.color;
    ctx.fillStyle = "#1e0a22";
    ctx.fillRect(e.x, e.y + 6, e.w, e.h - 6);
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(e.x, e.y + 6, e.w, e.h - 6);
    ctx.fillStyle = col;
    const open = 3 + Math.abs(Math.sin(e.t * 0.25)) * 5;
    ctx.save(); ctx.translate(e.x, e.y + 6); ctx.rotate(-0.3 - open * 0.04);
    ctx.fillRect(0, -3, e.w * 0.9, 3);
    ctx.restore();
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(e.x + 2 + i * 6, e.y + 6); ctx.lineTo(e.x + 5 + i * 6, e.y + 6 - open); ctx.lineTo(e.x + 8 + i * 6, e.y + 6); ctx.fill();
    }
    U.glow(ctx, cx, cy + 3, 12, col, 0.7);
  },
});

// ---------------------------------------------------------- glitchBlock
// overrides: on (s solid), off (s gone), offset (s)
registerEntity("glitchBlock", {
  size: [32, 32],
  anchor: "topleft",
  props: { on: 2.0, off: 1.2, offset: 0, solid: true, alwaysActive: true },
  init(e) { e.state = "on"; e.solid = true; },
  /** "on" (solid) | "fading" (solid, about to vanish) | "off" | "forming" (gone, about to return) */
  phase(e, world) {
    const period = e.on + e.off;
    const t = ((world.htime / FPS + e.offset) % period + period) % period;
    if (t < e.on) return t > e.on - 0.5 ? "fading" : "on";
    return t > period - 0.5 ? "forming" : "off";
  },
  update(e, world) {
    const was = e.state;
    e.state = this.phase(e, world);
    const solidNow = e.state === "on" || e.state === "fading";
    if (solidNow && !e.solid && U.overlap(e, world.player)) return; // never re-form inside the player
    e.solid = solidNow;
    if (was !== "off" && e.state === "off" && world.onScreen(e) && e.col % 3 === 0) sfx.play("glitch");
  },
  draw(e, ctx, world) {
    const th = world.theme;
    if (!e.solid) {
      const forming = e.state === "forming" && world.time % 6 < 3;
      ctx.strokeStyle = U.rgba(HACK_GREEN, forming ? 0.7 : 0.25);
      ctx.setLineDash([3, 4]); ctx.strokeRect(e.x + 1.5, e.y + 1.5, 29, 29); ctx.setLineDash([]);
      if (world.time % 9 === 0) { ctx.fillStyle = U.rgba(HACK_GREEN, 0.4); ctx.fillRect(e.x + Math.random() * 28, e.y + Math.random() * 28, 4, 2); }
      return;
    }
    const fading = e.state === "fading";
    // Corrupted slices drift sideways (wildly just before it vanishes).
    for (let i = 0; i < 4; i++) {
      const jitter = fading ? U.rand(-5, 5) : (world.time + e.col * 7 + i * 13) % 97 < 5 ? U.rand(-3, 3) : 0;
      ctx.fillStyle = i % 2 ? th.tileFill : U.mix(th.tileFill, HACK_GREEN, 0.12);
      ctx.fillRect(e.x + jitter, e.y + i * 8, 32, 8);
    }
    ctx.fillStyle = fading && world.time % 6 < 3 ? "#ff3df0" : HACK_GREEN;
    ctx.fillRect(e.x, e.y, 32, 2);
    ctx.fillStyle = U.rgba(HACK_GREEN, 0.5);
    ctx.fillRect(e.x + 6, e.y + 12, 6, 2); ctx.fillRect(e.x + 18, e.y + 20, 8, 2);
  },
});

// ---------------------------------------------------------- lockedGate
// One "+" at the top of a doorway. Opens for good once a player with Root
// Access comes close.
registerEntity("lockedGate", {
  size: [32, 32],
  anchor: "topleft",
  layer: 2,
  props: { solid: true, alwaysActive: true },
  init(e, world) {
    let r = e.row;
    while (r < world.h && !Physics.solidAt(world, e.col, r)) r++;
    e.x = e.col * TILE + 4; e.w = 24;
    e.h = Math.max(TILE, (r - e.row) * TILE);
    e.openK = 0; e.open = false;
  },
  update(e, world) {
    const p = world.player;
    const near = { x: e.x - TILE * 1.5, y: e.y - TILE, w: e.w + TILE * 3, h: e.h + TILE * 2 };
    if (!e.open && p.alive && p.has("rootAccess") && U.overlap(p, near)) {
      e.open = true;
      world.particles.burst(U.cx(e), U.cy(e), 20, "#ffd23d", 4);
      sfx.play("unlock");
      Save.markSeen("rootAccess");
    }
    e.solid = !e.open;
    e.openK = U.approach(e.openK, e.open ? 1 : 0, 0.06);
  },
  draw(e, ctx, world) {
    const h = e.h * (1 - e.openK);
    ctx.fillStyle = "#1c1a0c";
    ctx.fillRect(e.x - 4, e.y, 4, e.h); ctx.fillRect(e.x + e.w, e.y, 4, e.h);
    if (h < 2) return;
    const can = world.player.has("rootAccess");
    const col = can ? "#ffd23d" : "#ff4d6d";
    ctx.fillStyle = "#14130a";
    ctx.fillRect(e.x, e.y, e.w, h);
    ctx.fillStyle = U.rgba(col, 0.5);
    for (let y = e.y + 6; y < e.y + h - 4; y += 12) ctx.fillRect(e.x + 4, y, e.w - 8, 2);
    // Lock glyph.
    const cy = e.y + Math.min(h / 2, 40);
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(U.cx(e), cy - 4, 5, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(U.cx(e) - 7, cy - 4, 14, 10);
    U.glow(ctx, U.cx(e), cy, 20, col, 0.4);
  },
});

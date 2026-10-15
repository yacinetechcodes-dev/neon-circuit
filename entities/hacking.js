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
  dataDash: { name: "DATA DASH", hud: "DASH", desc: "Your dash is untouchable and phases through firewalls.", how: "{dash}", world: 2 },
  freeze: { name: "FREEZE PROCESS", hud: "FRZ", desc: "Stops enemies and moving hazards for 3 s (9 s recharge).", how: "{freeze}", action: "freeze", label: "FRZ", world: 2 },
  rootAccess: { name: "ROOT ACCESS", desc: "Locked gates open when you walk up to them.", how: "automatic", world: 2 },
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
  info: { name: "Antivirus Drone", desc: "Scans, locks on and fires a dart. Stomp or shoot it." },
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
    const cx = U.cx(e), cy = U.cy(e), t = e.t;
    const locked = e.lock > 0;
    const col = e.flash ? "#ffffff" : locked ? "#ff3355" : e.color;
    // Scan cone with sweep lines (turns red and solid while locking on).
    const a = Math.PI / 2 + (e.scan || 0);
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 130);
    g.addColorStop(0, U.rgba(col, locked ? 0.32 : 0.16)); g.addColorStop(1, U.rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 130, a - 0.3, a + 0.3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = U.rgba(col, locked ? 0.6 : 0.25); ctx.lineWidth = 1;
    const sw = a - 0.3 + ((t * 0.03) % 1) * 0.6;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sw) * 120, cy + Math.sin(sw) * 120); ctx.stroke();
    ctx.restore();
    // Four little stabiliser fins.
    ctx.fillStyle = "#0e2a18";
    for (let i = 0; i < 4; i++) { const k = (Math.PI / 2) * i + Math.PI / 4 + t * 0.02; ctx.save(); ctx.translate(cx + Math.cos(k) * 13, cy + Math.sin(k) * 11); ctx.rotate(k); ctx.fillRect(-2, -3, 6, 6); ctx.restore(); }
    // Hexagonal shell.
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const k = (Math.PI / 3) * i + t * 0.02; const x = cx + Math.cos(k) * 13, y = cy + Math.sin(k) * 11; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath();
    Look.fill(ctx, cy - 11, 22, "#0a2a16", 0.25, 0.4);
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    // Lens slit with a scanning light.
    ctx.fillStyle = "#020a04"; U.roundRect(ctx, cx - 8, cy - 3, 16, 6, 3); ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.fillRect(cx - 5 + (e.scan || 0) * 5, cy - 1.5, 10, 3);
    U.glow(ctx, cx + (e.scan || 0) * 5, cy, locked ? 24 : 14, col, 0.8);
    if (locked) { Look.telegraph(ctx, cx, cy + 14, 5, "#ff3355", 1 - e.lock / 34); Look.warn(ctx, cx, cy - 22, "#ff3355", t); }
  },
});

// ---------------------------------------------------------- firewallWall
// One "I" at the top of a doorway; the wall fills it down to the floor.
registerEntity("firewallWall", {
  info: { name: "Firewall", desc: "A living barrier: shoot it down or Data Dash through it." },
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
    const col = e.flash ? "#ffffff" : e.color, t = world.time;
    ctx.save();
    ctx.globalAlpha = e.phasing ? 0.35 : 1;
    // Dark brick body with glowing mortar and a heat gradient.
    const g = ctx.createLinearGradient(0, e.y, 0, e.y + e.h);
    g.addColorStop(0, "#1a0804"); g.addColorStop(1, "#3a1206");
    ctx.fillStyle = g; ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.fillStyle = U.rgba(col, 0.75);
    for (let y = e.y, row = 0; y < e.y + e.h; y += 10, row++) {
      ctx.fillRect(e.x, y, e.w, 1);
      const off = row % 2 ? 6 : 0;
      for (let x = e.x - off + 12; x < e.x + e.w; x += 12) if (x > e.x) ctx.fillRect(x, y, 1, 10);
    }
    // Flames licking up the face and rising code embers.
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) {
      const k = (t * (1.2 + i * 0.4) + e.col * 37 + i * 40) % e.h;
      ctx.fillStyle = U.rgba(i === 1 ? "#ffd27a" : col, 0.55 * (1 - k / e.h));
      ctx.fillRect(e.x + 2 + i * (e.w / 3), e.y + e.h - k, e.w / 3 - 3, 3);
    }
    const fg = ctx.createLinearGradient(0, e.y + e.h - 20, 0, e.y + e.h);
    fg.addColorStop(0, U.rgba(col, 0)); fg.addColorStop(1, U.rgba(col, 0.35 + 0.1 * Math.sin(t * 0.3)));
    ctx.fillStyle = fg; ctx.fillRect(e.x, e.y + e.h - 20, e.w, 20);
    ctx.globalCompositeOperation = "source-over";
    // Health ticks.
    ctx.fillStyle = col;
    for (let i = 0; i < e.hp; i++) ctx.fillRect(e.x + 3 + i * 3.4, e.y + 3, 2, 4);
    ctx.restore();
    if (!e.phasing && t % 4 === 0) U.glow(ctx, U.cx(e), e.y + e.h - 6, 20, col, 0.4);
  },
});

// ---------------------------------------------------------- bugCrawler
function drawBug(ctx, e, segs) {
  const col = e.flash ? "#ffffff" : e.color, t = e.t;
  const by = e.y + e.h - 5;
  Look.shadow(ctx, U.cx(e), e.y + e.h, e.w);
  // Segments from tail to head; legs scuttle in a wave.
  for (let i = segs - 1; i >= 0; i--) {
    const x = e.x + e.w / 2 - e.dir * (i - 1) * (e.w / (segs + 0.5));
    const r = e.h * 0.42 - i * 0.6;
    const bob = Math.sin(t * 0.4 + i) * 1.2;
    ctx.strokeStyle = "#1e4a0a"; ctx.lineWidth = 1.5; ctx.lineCap = "round";
    const s1 = Math.sin(t * 0.5 + i * 1.3) * 2;
    ctx.beginPath(); ctx.moveTo(x - 3, by + 1); ctx.lineTo(x - 5 + s1, by + 5); ctx.moveTo(x + 3, by + 1); ctx.lineTo(x + 5 - s1, by + 5); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, by - r + 3 + bob, r, 0, 6.28);
    Look.fill(ctx, by - r * 2 + 3 + bob, r * 2, "#163a08", 0.35, 0.35);
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = U.rgba(col, 0.35); ctx.fillRect(x - r * 0.6, by - r + 2 + bob, r * 1.2, 1);
  }
  // Head: mandibles and a sensor dot (no face).
  const hx = e.x + e.w / 2 + e.dir * (e.w / 2 - 4), hy = by - e.h * 0.45;
  ctx.strokeStyle = col; ctx.lineWidth = 1.5;
  const m = Math.abs(Math.sin(t * 0.3)) * 2;
  ctx.beginPath(); ctx.moveTo(hx, hy + 2); ctx.lineTo(hx + e.dir * (4 + m), hy + 4); ctx.moveTo(hx, hy + 5); ctx.lineTo(hx + e.dir * (4 + m), hy + 3); ctx.stroke();
  ctx.strokeStyle = U.rgba(col, 0.7); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(hx - e.dir * 2, hy - 2); ctx.lineTo(hx + e.dir * 3, hy - 7 + Math.sin(t * 0.3)); ctx.stroke();
  Look.core(ctx, hx, hy + 0.5, 1.8, col, t);
}

registerEntity("bugCrawler", {
  info: { name: "Bug Crawler", desc: "Hops at you; splits into two bit bugs." },
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
  info: { name: "Bit Bug", desc: "A tiny piece of a bug crawler.", tip: false },
  size: [14, 10],
  props: { enemy: true, hurts: true, stompable: true, shootable: true, dashable: true, hp: 1, speed: 2.2, color: "#b6ff3a" },
  init(e) { e.dir = 1; },
  update(e, world) { walkStep(e, world, e.speed); },
  draw(e, ctx) { drawBug(ctx, e, 2); },
});

// ---------------------------------------------------------- trojan
// Disguised as a repair capsule. A faint glitch every few seconds gives it away.
registerEntity("trojan", {
  info: { name: "Trojan", desc: "Looks like a repair kit, but bites. Watch for the glitch." },
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
    const cx = U.cx(e), cy = U.cy(e), t = e.t;
    if (e.mode === "disguise") {
      // Same look as a repair power-up… with a tell-tale glitch every few seconds.
      const glitch = (t + e.col * 31) % 170 < 5;
      const gx = glitch ? U.rand(-3, 3) : 0, by = Math.sin(world.time * 0.06) * 3;
      U.glow(ctx, cx, cy + by, 28, "#ff4d6d", 0.6);
      ctx.strokeStyle = U.rgba("#ff4d6d", 0.7); ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const a = world.time * 0.05 + i * 2.09; ctx.beginPath(); ctx.arc(cx, cy + by, 16, a, a + 1.2); ctx.stroke(); }
      U.roundRect(ctx, cx - 11 + gx, cy - 11 + by, 22, 22, 6);
      Look.fill(ctx, cy - 11 + by, 22, "#16203e", 0.25, 0.4);
      ctx.strokeStyle = glitch ? "#ff3df0" : "#ff4d6d"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = glitch ? "#ff3df0" : "#ff4d6d";
      ctx.fillRect(cx - 2 + gx, cy - 6 + by, 4, 12); ctx.fillRect(cx - 6 + gx, cy - 2 + by, 12, 4);
      if (glitch) { ctx.fillStyle = "rgba(255,61,240,0.5)"; ctx.fillRect(cx - 14, cy - 4 + by + U.rand(-6, 6), 28, 2); }
      return;
    }
    // …until it unfolds into a jagged snapping box.
    const col = e.flash ? "#ffffff" : e.color;
    Look.shadow(ctx, cx, e.y + e.h, e.w);
    Look.box(ctx, e.x, e.y + 6, e.w, e.h - 6, 3, "#2e0e36", col, { seam: false });
    ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(e.x + 3, e.y + 12, e.w - 6, 3);
    const open = 3 + Math.abs(Math.sin(t * 0.25)) * 6;
    // The lid snaps open and shut.
    ctx.save(); ctx.translate(e.x, e.y + 6); ctx.rotate(-0.3 - open * 0.05);
    ctx.fillStyle = "#3a1244"; ctx.fillRect(0, -4, e.w * 0.95, 4);
    ctx.fillStyle = col; ctx.fillRect(0, -4, e.w * 0.95, 1.5);
    ctx.restore();
    ctx.fillStyle = "#ffe6f8";
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(e.x + 2 + i * 6, e.y + 6); ctx.lineTo(e.x + 5 + i * 6, e.y + 6 - open); ctx.lineTo(e.x + 8 + i * 6, e.y + 6); ctx.fill(); }
    Look.core(ctx, cx, cy + 4, 3, col, t, true);
  },
});

// ---------------------------------------------------------- glitchBlock
// overrides: on (s solid), off (s gone), offset (s)
registerEntity("glitchBlock", {
  info: { name: "Glitch Block", desc: "Solid, then flickers out and back on." },
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
    const th = world.theme, t = world.time;
    if (!e.solid) {
      const forming = e.state === "forming" && t % 6 < 3;
      ctx.strokeStyle = U.rgba(HACK_GREEN, forming ? 0.8 : 0.25); ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]); ctx.lineDashOffset = -t * 0.3; ctx.strokeRect(e.x + 1.5, e.y + 1.5, 29, 29); ctx.setLineDash([]);
      if (forming) { ctx.fillStyle = U.rgba(HACK_GREEN, 0.15); ctx.fillRect(e.x, e.y, 32, 32); }
      if (t % 9 === 0) { ctx.fillStyle = U.rgba(HACK_GREEN, 0.4); ctx.fillRect(e.x + Math.random() * 28, e.y + Math.random() * 28, 4, 2); }
      return;
    }
    const fading = e.state === "fading";
    // Corrupted slices drift sideways (wildly just before it vanishes), RGB-split edges.
    for (let i = 0; i < 4; i++) {
      const jitter = fading ? U.rand(-5, 5) : (t + e.col * 7 + i * 13) % 97 < 5 ? U.rand(-3, 3) : 0;
      ctx.fillStyle = i % 2 ? th.tileFill : U.mix(th.tileFill, HACK_GREEN, 0.14);
      ctx.fillRect(e.x + jitter, e.y + i * 8, 32, 8);
      if (jitter) { ctx.fillStyle = "rgba(255,61,240,0.35)"; ctx.fillRect(e.x + jitter - 2, e.y + i * 8, 2, 8); ctx.fillStyle = "rgba(61,255,240,0.35)"; ctx.fillRect(e.x + jitter + 32, e.y + i * 8, 2, 8); }
    }
    ctx.fillStyle = fading && t % 6 < 3 ? "#ff3df0" : HACK_GREEN;
    ctx.fillRect(e.x, e.y, 32, 2);
    ctx.font = "9px monospace"; ctx.fillStyle = U.rgba(HACK_GREEN, 0.55);
    ctx.fillText(((e.col * 5 + (t >> 4)) % 2 ? "01" : "10") + ((e.row + (t >> 5)) % 2 ? "1" : "0"), e.x + 6, e.y + 18);
    ctx.fillRect(e.x + 6, e.y + 24, 8, 2); ctx.fillRect(e.x + 18, e.y + 12, 8, 2);
  },
});

// ---------------------------------------------------------- lockedGate
// One "+" at the top of a doorway. Opens for good once a player with Root
// Access comes close.
registerEntity("lockedGate", {
  info: { name: "Locked Gate", desc: "Needs Root Access to open." },
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
    const h = e.h * (1 - e.openK), t = world.time;
    // Frame posts.
    for (const px of [e.x - 5, e.x + e.w]) { ctx.beginPath(); ctx.rect(px, e.y, 5, e.h); Look.fill(ctx, e.y, e.h, "#2a2810"); }
    if (h < 2) return;
    const can = world.player.has("rootAccess");
    const col = can ? "#ffd23d" : "#ff4d6d";
    // Heavy shutter: slats with highlights.
    ctx.beginPath(); ctx.rect(e.x, e.y, e.w, h);
    Look.fill(ctx, e.y, h, "#22200e", 0.1, 0.3);
    for (let y = e.y + 2; y < e.y + h - 2; y += 8) {
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(e.x, y + 6, e.w, 2);
      ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fillRect(e.x, y, e.w, 1);
    }
    ctx.fillStyle = U.rgba(col, 0.5 + 0.2 * Math.sin(t * 0.08));
    ctx.fillRect(e.x + 2, e.y + h - 3, e.w - 4, 2);
    // Lock glyph.
    const cy = e.y + Math.min(h / 2, 40);
    ctx.fillStyle = "#14130a"; U.roundRect(ctx, U.cx(e) - 10, cy - 14, 20, 24, 4); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(U.cx(e), cy - 4, 5, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(U.cx(e) - 7, cy - 4, 14, 10);
    ctx.fillStyle = "#14130a"; ctx.fillRect(U.cx(e) - 1, cy - 1, 2, 4);
    U.glow(ctx, U.cx(e), cy, 22, col, 0.45);
  },
});

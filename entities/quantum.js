/* =========================================================================
 * entities/quantum.js — teleporter pads, floor switches and doors (level 8+).
 *
 *   "teleporter:1"  pads with the same id are linked in pairs
 *   "switch:a"      floor switch for channel a (override time: seconds the
 *                   door stays open; 0 = stays open for good)
 *   "door:a"        door that opens while channel a is on. "door:ab" needs
 *                   both a and b. Place it at the top of the doorway; it
 *                   extends down to the floor.
 * ========================================================================= */
"use strict";

const CHANNEL_COLORS = { a: "#3df5ff", b: "#ffd23d", c: "#ff3df0", d: "#7dff4a", e: "#ff8a3d" };

sfx.define("teleport", (s, t) => {
  s.tone(t, { type: "sine", f0: 300, f1: 1800, dur: 0.18, vol: 0.12 });
  s.tone(t, { type: "square", f0: 1800, f1: 600, dur: 0.12, vol: 0.05, delay: 0.12 });
}, 0.1);
sfx.define("switch", (s, t) => {
  s.tone(t, { type: "square", f0: 440, dur: 0.05, vol: 0.09 });
  s.tone(t, { type: "square", f0: 880, dur: 0.08, vol: 0.09, delay: 0.05 });
}, 0.1);
sfx.define("door", (s, t) => s.tone(t, { type: "triangle", f0: 200, f1: 520, dur: 0.25, vol: 0.1 }), 0.2);

/** Is channel ch on right now? (switches store an expiry frame) */
function channelOn(world, ch) {
  return (world.flags["sw_" + ch] || 0) > world.time;
}

// ------------------------------------------------------------- teleporter
registerEntity("teleporter", {
  info: { name: "Teleporter", desc: "Step on a pad to jump to its twin.", tip: false },
  size: [26, 40],
  layer: 0,
  props: { alwaysActive: true },
  init(e, world, arg) { e.link = arg || "1"; e.color = ["#3df5ff", "#ff3df0", "#ffd23d", "#7dff4a", "#ff8a3d"][(parseInt(e.link, 10) || 1) % 5]; },
  partner(e, world) {
    if (!e.mate || e.mate.dead) e.mate = world.entities.find((o) => o !== e && o.name === "teleporter" && o.link === e.link);
    return e.mate;
  },
  update(e, world) {
    const p = world.player;
    if (!p.alive) return;
    if (p.tpLock && !U.overlap(p, p.tpLock)) p.tpLock = null;
    if (p.tpLock === e || !U.overlap(p, e)) return;
    const m = this.partner(e, world);
    if (!m) return;
    world.particles.burst(U.cx(p), U.cy(p), 18, e.color, 4);
    p.x = U.cx(m) - p.w / 2;
    p.y = m.y + m.h - p.h;
    p.vy = 0; p.dashing = 0;
    p.tpLock = m;
    world.particles.burst(U.cx(p), U.cy(p), 24, e.color, 5, { glow: true });
    world.particles.ring(U.cx(m), U.cy(m), e.color, 30);
    world.camera.snap(p);
    world.fade = 0.25;
    sfx.play("teleport");
    Save.markSeen("teleport");
  },
  draw(e, ctx, world) {
    const cx = U.cx(e), by = e.y + e.h, t = world.time;
    // Pad: bevelled base with a lit ring and a light column.
    ctx.beginPath(); ctx.rect(e.x - 4, by - 7, e.w + 8, 7); Look.fill(ctx, by - 7, 7, "#18243c", 0.2, 0.35);
    ctx.fillStyle = e.color; ctx.fillRect(e.x - 4, by - 8, e.w + 8, 2);
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(e.x - 4, by - 8, e.w + 8, 1);
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(0, by - 48, 0, by - 6);
    g.addColorStop(0, U.rgba(e.color, 0)); g.addColorStop(1, U.rgba(e.color, 0.28));
    ctx.fillStyle = g; ctx.fillRect(e.x - 2, by - 48, e.w + 4, 42);
    ctx.restore();
    U.glow(ctx, cx, by - 12, 28, e.color, 0.45 + 0.15 * Math.sin(t * 0.1));
    for (let i = 0; i < 3; i++) {
      const k = ((t * 0.03 + i / 3) % 1);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = e.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, by - 6 - k * 34, 12 - k * 4, 3, 0, 0, 6.28); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Channel number pips on the base.
    ctx.fillStyle = "#ffffff";
    const n = Math.min(5, parseInt(e.link, 10) || 1);
    for (let i = 0; i < n; i++) ctx.fillRect(cx - n * 2 + i * 4, by - 4, 2, 2);
  },
  light(e) { return [60, e.color, 0.6]; },
});

// ------------------------------------------------------------- switch
registerEntity("switch", {
  info: { name: "Switch", desc: "Opens doors of its colour (some only for a few seconds).", tip: false },
  size: [26, 14],
  props: { time: 0, alwaysActive: true },
  init(e, world, arg) { e.ch = arg || "a"; e.color = CHANNEL_COLORS[e.ch] || "#ffffff"; },
  update(e, world) {
    const p = world.player;
    e.on = channelOn(world, e.ch);
    if (!p.alive || e.on || !U.overlap(p, e)) return;
    world.flags["sw_" + e.ch] = e.time > 0 ? world.time + Math.round(e.time * FPS) : Infinity;
    e.on = true;
    world.particles.burst(U.cx(e), e.y, 14, e.color, 3);
    sfx.play("switch");
    Save.markSeen("switch");
  },
  draw(e, ctx, world) {
    const by = e.y + e.h, on = e.on, t = world.time;
    ctx.beginPath(); ctx.rect(e.x - 3, by - 6, e.w + 6, 6); Look.fill(ctx, by - 6, 6, "#1e2840", 0.2, 0.35);
    // The plate sinks when pressed.
    const ph = on ? 2 : 6;
    ctx.beginPath(); ctx.rect(e.x + 3, by - 5 - ph, e.w - 6, ph); Look.fill(ctx, by - 5 - ph, ph, on ? e.color : U.mix(e.color, "#000000", 0.4), 0.35, 0.2);
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(e.x + 3, by - 5 - ph, e.w - 6, 1);
    if (on) U.glow(ctx, U.cx(e), by - 6, 20, e.color, 0.65);
    else if (Math.floor(t / 30) % 2) { ctx.fillStyle = U.rgba(e.color, 0.8); ctx.fillRect(U.cx(e) - 1, by - 15, 2, 3); ctx.fillRect(U.cx(e) - 3, by - 14, 6, 1); }
    // Countdown bar for timed switches.
    const until = world.flags["sw_" + e.ch];
    if (on && e.time > 0 && isFinite(until)) {
      const k = U.clamp((until - t) / (e.time * FPS), 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(e.x - 2, by - 17, e.w + 4, 4);
      ctx.fillStyle = k < 0.3 && t % 8 < 4 ? "#ffffff" : e.color;
      ctx.fillRect(e.x - 1, by - 16, (e.w + 2) * k, 2);
    }
  },
});

// ------------------------------------------------------------- door
registerEntity("door", {
  info: { name: "Door", desc: "Opens with the switch of the same colour.", tip: false },
  size: [32, 32],
  anchor: "topleft",
  layer: 2,
  props: { alwaysActive: true },
  init(e, world, arg) {
    e.chs = (arg || "a").split("");
    let r = e.row;
    while (r < world.h && !Physics.solidAt(world, e.col, r)) r++;
    e.x = e.col * TILE + 4; e.w = 24;
    e.h = Math.max(TILE, (r - e.row) * TILE);
    e.openK = 0;
    e.solid = true;
  },
  update(e, world) {
    const open = e.chs.every((c) => channelOn(world, c));
    if (open && e.solid && world.onScreen(e)) sfx.play("door");
    if (!open && !e.solid && U.overlap(e, world.player)) return; // never close on the player
    e.solid = !open;
    e.openK = U.approach(e.openK, open ? 1 : 0, 0.08);
  },
  draw(e, ctx, world) {
    const h = e.h * (1 - e.openK);
    for (const px of [e.x - 5, e.x + e.w]) { ctx.beginPath(); ctx.rect(px, e.y, 5, e.h); Look.fill(ctx, e.y, e.h, "#22304e", 0.2, 0.35); }
    if (h < 2) return;
    ctx.beginPath(); ctx.rect(e.x, e.y, e.w, h); Look.fill(ctx, e.y, h, "#18213a", 0.1, 0.3);
    for (let y = e.y + 10; y < e.y + h - 4; y += 12) { ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(e.x, y, e.w, 1); }
    // One coloured stripe per required channel (lit when that channel is on).
    e.chs.forEach((c, i) => {
      const lit = channelOn(world, c);
      ctx.fillStyle = lit ? CHANNEL_COLORS[c] : U.rgba(CHANNEL_COLORS[c] || "#ffffff", 0.4);
      ctx.fillRect(e.x + 5 + i * 8, e.y + 4, 4, Math.max(0, h - 8));
      if (lit) U.glow(ctx, e.x + 7 + i * 8, e.y + h / 2, 14, CHANNEL_COLORS[c], 0.35);
    });
    ctx.fillStyle = U.rgba("#ffffff", 0.2);
    ctx.fillRect(e.x, e.y + h - 3, e.w, 3);
  },
});

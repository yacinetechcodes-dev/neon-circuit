/* =========================================================================
 * entities/firewall.js — moving laser walls and timed gates (level 6+).
 * Both are pure functions of world.time, so they are fully predictable.
 * ========================================================================= */
"use strict";

// ------------------------------------------------------------- laserWall
// A laser fence that slides back and forth.
// arg: "up"   → rises from the floor, `len` tiles tall (default 2) — jump over it
//      "down" → hangs from a ceiling down to `gap` tiles above the floor
//               (default 1) — stay low and walk under it
// overrides: range (tiles, sign = direction), speed (px/frame), offset (frames),
//            len, gap, on / off (seconds; off > 0 makes it blink)
registerEntity("laserWall", {
  info: { name: "Laser Wall", desc: "A moving wall of lasers: wait for the gap." },
  size: [32, 32],
  layer: 2,
  props: { range: 6, speed: 1.4, offset: 0, len: 0, gap: 1, on: 1, off: 0, alwaysActive: true, alwaysDraw: true },
  init(e, world, arg) {
    e.dir = arg === "down" ? "down" : "up";
    e.homeX = e.col * TILE + TILE / 2;
    if (e.dir === "up") {
      e.baseY = (e.row + 1) * TILE;                  // floor surface
      e.beamTop = e.baseY - (e.len || 2) * TILE;
      e.beamBot = e.baseY - 4;
    } else {
      e.baseY = e.row * TILE;                        // ceiling surface
      let r = e.row;
      while (r < world.h && !Physics.solidAt(world, e.col, r)) r++;
      const floorY = r * TILE;
      e.beamTop = e.baseY + 4;
      e.beamBot = e.len ? e.baseY + e.len * TILE : floorY - e.gap * TILE;
    }
    e.dist = Math.abs(e.range) * TILE;
    e.sgn = e.range < 0 ? -1 : 1;
    e.period = Math.max(60, Math.round((2 * e.dist) / e.speed));
    this.place(e, world);
  },
  /** Position for the current world.time (triangle wave). */
  place(e, world) {
    const ph = (((world.htime + e.offset) % e.period) + e.period) % e.period / e.period;
    const k = ph < 0.5 ? ph * 2 : 2 - ph * 2;
    e.cxNow = e.homeX + e.sgn * e.dist * k;
    e.x = e.cxNow - 5; e.w = 10;
    e.y = e.beamTop; e.h = e.beamBot - e.beamTop;
    e.state = cycleState(world, e.on, e.off, e.offset / FPS);
    e.hot = e.state === "on";
  },
  update(e, world) {
    const was = e.state;
    this.place(e, world);
    if (e.hot && was && was !== "on" && world.onScreen(e)) sfx.play("laser");
  },
  onTouch(e, world) { if (e.hot) world.hurtPlayer(1, e); },
  draw(e, ctx, world) {
    const cx = e.cxNow, col = "#ff2a6d", t = world.time;
    // Emitter sled on its rail.
    const ey = e.dir === "up" ? e.baseY - 9 : e.baseY;
    ctx.beginPath(); ctx.rect(cx - 11, ey, 22, 9); Look.fill(ctx, ey, 9, "#3a1a30", 0.2, 0.35);
    ctx.fillStyle = e.hot ? col : "#6a2a48"; ctx.fillRect(cx - 3, e.dir === "up" ? ey : ey + 7, 6, 2);
    // Rail showing the patrol range.
    const x0 = Math.min(e.homeX, e.homeX + e.sgn * e.dist), x1 = Math.max(e.homeX, e.homeX + e.sgn * e.dist);
    ctx.fillStyle = U.rgba(col, 0.2); ctx.fillRect(x0, e.dir === "up" ? e.baseY - 2 : e.baseY, x1 - x0, 2);
    ctx.fillStyle = U.rgba(col, 0.45); ctx.fillRect(x0, e.dir === "up" ? e.baseY - 3 : e.baseY, 2, 4); ctx.fillRect(x1 - 2, e.dir === "up" ? e.baseY - 3 : e.baseY, 2, 4);
    if (e.hot) {
      const f = 0.8 + Math.random() * 0.2;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = U.rgba(col, 0.25 * f); ctx.fillRect(cx - 10, e.y, 20, e.h);
      ctx.fillStyle = U.rgba(col, 0.55 * f); ctx.fillRect(cx - 4 + Math.sin(t * 0.9), e.y, 8, e.h);
      ctx.fillStyle = U.rgba("#ffe6ee", f); ctx.fillRect(cx - 1.5, e.y, 3, e.h);
      ctx.restore();
      U.glow(ctx, cx, e.dir === "up" ? e.y : e.y + e.h, 18, col, 0.75);
    } else if (e.state === "warn") {
      ctx.fillStyle = U.rgba(col, t % 6 < 3 ? 0.55 : 0.2);
      ctx.fillRect(cx - 1, e.y, 2, e.h);
    }
  },
  light(e) { return e.hot ? [60, "#ff2a6d", 0.8] : null; },
});

// ------------------------------------------------------------- timedGate
// An energy door that opens and closes on a fixed rhythm. Place one "O" at
// the top of the doorway; it extends down to the floor.
// overrides: on (seconds closed), off (seconds open), offset (seconds)
registerEntity("timedGate", {
  info: { name: "Timed Gate", desc: "Opens and closes on a rhythm.", tip: false },
  size: [32, 32],
  anchor: "topleft",
  layer: 2,
  props: { on: 1.6, off: 1.6, offset: 0, alwaysActive: true },
  init(e, world) {
    let r = e.row;
    while (r < world.h && !Physics.solidAt(world, e.col, r)) r++;
    e.x = e.col * TILE + 6; e.w = 20;
    e.h = Math.max(TILE, (r - e.row) * TILE);
    e.period = Math.round((e.on + e.off) * FPS);
  },
  update(e, world) {
    e.state = cycleState(world, e.on, e.off, e.offset);
    const closed = e.state === "on";
    if (closed && !e.solid) {
      if (U.overlap(e, world.player)) return; // never close on top of the player
      if (world.onScreen(e)) sfx.play("zap");
    }
    e.solid = closed;
  },
  draw(e, ctx, world) {
    const col = "#ff3b3b", t = world.time;
    for (const px of [e.x - 6, e.x + e.w + 2]) { ctx.beginPath(); ctx.rect(px, e.y, 4, e.h); Look.fill(ctx, e.y, e.h, "#4a1420", 0.2, 0.35); }
    if (e.solid) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = U.rgba(col, 0.25); ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = col;
      for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 0.3 + i * 2); ctx.fillRect(e.x + 3 + i * 7, e.y, 2, e.h); }
      ctx.globalAlpha = 1;
      for (let y = e.y + ((t * 2) % 16); y < e.y + e.h; y += 16) ctx.fillRect(e.x, y, e.w, 2);
      ctx.restore();
    } else if (e.state === "warn") {
      // Telegraph: the field flickers in before it closes.
      ctx.fillStyle = U.rgba(col, t % 6 < 3 ? 0.4 : 0.1);
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = U.rgba(col, 0.7); ctx.fillRect(e.x, e.y, e.w, 2); ctx.fillRect(e.x, e.y + e.h - 2, e.w, 2);
    } else {
      ctx.fillStyle = U.rgba(col, 0.12);
      ctx.fillRect(e.x + 9, e.y, 2, e.h);
    }
  },
  light(e) { return e.solid ? [50, "#ff3b3b", 0.6] : null; },
});

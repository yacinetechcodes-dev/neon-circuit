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
    const cx = e.cxNow, col = "#ff2a6d";
    // Emitter block.
    ctx.fillStyle = "#2a1424";
    if (e.dir === "up") ctx.fillRect(cx - 10, e.baseY - 8, 20, 8);
    else ctx.fillRect(cx - 10, e.baseY, 20, 8);
    // Track line showing the patrol range.
    ctx.fillStyle = U.rgba(col, 0.18);
    const x0 = Math.min(e.homeX, e.homeX + e.sgn * e.dist), x1 = Math.max(e.homeX, e.homeX + e.sgn * e.dist);
    ctx.fillRect(x0, e.dir === "up" ? e.baseY - 2 : e.baseY, x1 - x0, 2);
    if (e.hot) {
      const f = 0.8 + Math.random() * 0.2;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = U.rgba(col, 0.32 * f);
      ctx.fillRect(cx - 9, e.y, 18, e.h);
      ctx.fillStyle = U.rgba("#ffd0dd", f);
      ctx.fillRect(cx - 2, e.y, 4, e.h);
      ctx.globalCompositeOperation = "source-over";
      U.glow(ctx, cx, e.dir === "up" ? e.y : e.y + e.h, 16, col, 0.7);
    } else if (e.state === "warn" && world.time % 6 < 3) {
      ctx.fillStyle = U.rgba(col, 0.45);
      ctx.fillRect(cx - 1, e.y, 2, e.h);
    }
  },
});

// ------------------------------------------------------------- timedGate
// An energy door that opens and closes on a fixed rhythm. Place one "O" at
// the top of the doorway; it extends down to the floor.
// overrides: on (seconds closed), off (seconds open), offset (seconds)
registerEntity("timedGate", {
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
    const col = "#ff3b3b";
    // Frame posts.
    ctx.fillStyle = "#3a1018";
    ctx.fillRect(e.x - 6, e.y, 4, e.h);
    ctx.fillRect(e.x + e.w + 2, e.y, 4, e.h);
    if (e.solid) {
      ctx.fillStyle = U.rgba(col, 0.3);
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = col;
      for (let i = 0; i < 3; i++) ctx.fillRect(e.x + 3 + i * 7, e.y, 2, e.h);
      for (let y = e.y + ((world.time * 2) % 16); y < e.y + e.h; y += 16) ctx.fillRect(e.x, y, e.w, 2);
    } else if (e.state === "warn") {
      ctx.fillStyle = U.rgba(col, world.time % 6 < 3 ? 0.35 : 0.1);
      ctx.fillRect(e.x, e.y, e.w, e.h);
    } else {
      ctx.fillStyle = U.rgba(col, 0.1);
      ctx.fillRect(e.x + 9, e.y, 2, e.h);
    }
  },
});

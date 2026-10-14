/* =========================================================================
 * entities/hazards.js — spikes, lasers, electric floors, crushers,
 * moving / falling platforms, low-gravity fields, fake walls, boss gates.
 * ========================================================================= */
"use strict";

/** On/off cycle helper shared by lasers and electric floors.
 *  Returns "on" | "warn" | "off". Times in seconds; offset shifts the phase. */
function cycleState(world, on, off, offset) {
  if (!off) return "on";
  const period = on + off;
  const t = ((world.time / FPS + (offset || 0)) % period + period) % period;
  if (t < on) return "on";
  if (t > period - 0.6) return "warn";
  return "off";
}

// ---------------------------------------------------------------- spike
// arg: up (default) | down | left | right  — the direction the points face.
registerEntity("spike", {
  size: [32, 32],
  props: { color: "#ff3355" },
  init(e, world, arg) {
    e.dir = arg || "up";
    const x = e.x, y = e.y;
    const box = {
      up: [x + 3, y + 17, 26, 15],
      down: [x + 3, y, 26, 15],
      left: [x + 17, y + 3, 15, 26],
      right: [x, y + 3, 15, 26],
    }[e.dir] || [x + 3, y + 17, 26, 15];
    [e.x, e.y, e.w, e.h] = box;
    e.cellX = x; e.cellY = y;
  },
  onTouch(e, world) {
    world.hurtPlayer(1, e, { up: e.dir === "up" ? -9 : e.dir === "down" ? 2 : -6 });
  },
  draw(e, ctx) {
    const x = e.cellX, y = e.cellY;
    ctx.fillStyle = "#5a1430";
    ctx.strokeStyle = "#ff3355";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 2; i++) {
      const o = i * 16;
      switch (e.dir) {
        case "down": ctx.moveTo(x + o, y); ctx.lineTo(x + o + 8, y + 16); ctx.lineTo(x + o + 16, y); break;
        case "left": ctx.moveTo(x + 32, y + o); ctx.lineTo(x + 16, y + o + 8); ctx.lineTo(x + 32, y + o + 16); break;
        case "right": ctx.moveTo(x, y + o); ctx.lineTo(x + 16, y + o + 8); ctx.lineTo(x, y + o + 16); break;
        default: ctx.moveTo(x + o, y + 32); ctx.lineTo(x + o + 8, y + 16); ctx.lineTo(x + o + 16, y + 32);
      }
    }
    ctx.fill();
    ctx.stroke();
  },
});

// ---------------------------------------------------------------- laser
// arg: v (beam shoots down from a ceiling emitter) | h (beam shoots right).
// overrides: on, off, offset (seconds). off: 0 = always on.
registerEntity("laser", {
  size: [32, 32],
  layer: 2,
  props: { on: 1.5, off: 1.5, offset: 0 },
  init(e, world, arg) {
    e.dir = arg === "h" ? "h" : "v";
    e.ex = e.x; e.ey = e.y; // emitter cell
    if (e.dir === "v") {
      let r = e.row + 1;
      while (r < world.h && !Physics.solidAt(world, e.col, r)) r++;
      e.x = e.ex + 12; e.w = 8; e.y = e.ey + 10; e.h = r * TILE - e.y;
    } else {
      let c = e.col + 1;
      while (c < world.w && !Physics.solidAt(world, c, e.row)) c++;
      e.y = e.ey + 12; e.h = 8; e.x = e.ex + 10; e.w = c * TILE - e.x;
    }
  },
  update(e, world) {
    const prev = e.state;
    e.state = cycleState(world, e.on, e.off, e.offset);
    if (e.state === "on" && prev && prev !== "on" && world.onScreen(e)) sfx.play("laser");
  },
  onTouch(e, world) { if (e.state === "on") world.hurtPlayer(1, e); },
  draw(e, ctx, world) {
    const st = e.state || "off";
    const col = "#ff2a6d";
    // Emitter.
    ctx.fillStyle = "#24203a";
    if (e.dir === "v") ctx.fillRect(e.ex + 6, e.ey, 20, 12);
    else ctx.fillRect(e.ex, e.ey + 6, 12, 20);
    ctx.fillStyle = st === "on" ? col : st === "warn" ? "#ff9db8" : "#5a2a40";
    if (e.dir === "v") ctx.fillRect(e.ex + 10, e.ey + 8, 12, 4);
    else ctx.fillRect(e.ex + 8, e.ey + 10, 4, 12);
    if (st === "on") {
      const flick = 0.8 + Math.random() * 0.2;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = U.rgba(col, 0.35 * flick);
      if (e.dir === "v") ctx.fillRect(e.x - 4, e.y, e.w + 8, e.h); else ctx.fillRect(e.x, e.y - 4, e.w, e.h + 8);
      ctx.fillStyle = U.rgba("#ffd0dd", flick);
      if (e.dir === "v") ctx.fillRect(e.x + 2, e.y, 4, e.h); else ctx.fillRect(e.x, e.y + 2, e.w, 4);
      ctx.globalCompositeOperation = "source-over";
      if (world.time % 4 === 0) {
        const px = e.dir === "v" ? U.cx(e) : e.x + e.w, py = e.dir === "v" ? e.y + e.h : U.cy(e);
        world.particles.emit(px, py, { vx: U.rand(-2, 2), vy: U.rand(-2, 0), life: 12, size: 2, color: col });
      }
    } else if (st === "warn" && world.time % 6 < 3) {
      ctx.fillStyle = U.rgba(col, 0.4);
      if (e.dir === "v") ctx.fillRect(e.x + 3, e.y, 2, e.h); else ctx.fillRect(e.x, e.y + 3, e.w, 2);
    }
  },
});

// -------------------------------------------------------- electric floor
// A solid block whose top surface is electrified in cycles.
// overrides: on, off, offset (seconds)
registerEntity("electric", {
  size: [32, 32],
  props: { on: 1.2, off: 1.8, offset: 0 },
  init(e, world) {
    world.tiles[e.row * world.w + e.col] = T_HIDDEN_SOLID;
  },
  update(e, world) {
    const prev = e.state;
    e.state = cycleState(world, e.on, e.off, e.offset);
    if (e.state === "on" && prev && prev !== "on" && world.onScreen(e)) sfx.play("zap");
    if (e.state !== "on") return;
    const p = world.player;
    const zone = { x: e.x, y: e.y - 3, w: e.w, h: 4 };
    if (p.alive && U.overlap(p, zone)) world.hurtPlayer(1, e, { up: -9 });
  },
  draw(e, ctx, world) {
    const st = e.state || "off";
    ctx.fillStyle = "#1d2a1a";
    ctx.fillRect(e.x, e.y, 32, 32);
    ctx.fillStyle = "#33401f";
    for (let i = 0; i < 4; i++) ctx.fillRect(e.x + 3 + i * 7, e.y + 8, 4, 20);
    const col = st === "on" ? "#e8ff4a" : st === "warn" && world.time % 6 < 3 ? "#9aa83a" : "#4f5a22";
    ctx.fillStyle = col;
    ctx.fillRect(e.x, e.y, 32, 4);
    if (st === "on") {
      U.glow(ctx, U.cx(e), e.y, 26, "#e8ff4a", 0.5);
      ctx.strokeStyle = "#f6ffb0";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let x = e.x, y = e.y - 2;
      ctx.moveTo(x, y);
      while (x < e.x + 32) { x += 5; y = e.y - 2 - Math.random() * 12; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  },
});

// ---------------------------------------------------------------- crusher
// 2×2 tile block hanging from a ceiling. Slams down, then slowly rises.
// overrides: delay (s, wait at top), offset (s), fallSpeed, riseSpeed
registerEntity("crusher", {
  size: [64, 64],
  anchor: "topleft",
  props: { solid: true, delay: 1.4, offset: 0, fallSpeed: 14, riseSpeed: 1.6 },
  init(e, world) {
    let r = e.row + 2;
    while (r < world.h + 4 && !Physics.solidAt(world, e.col, r) && !Physics.solidAt(world, e.col + 1, r)) r++;
    e.floorY = r * TILE - e.h;
    this.onRespawn(e);
  },
  onRespawn(e) {
    e.x = e.home.x; e.y = e.home.y;
    e.mode = "wait";
    e.timer = Math.round((e.delay + e.offset) * FPS);
    e.vy = 0;
  },
  update(e, world) {
    switch (e.mode) {
      case "wait":
        if (--e.timer <= 0) { e.mode = "warn"; e.timer = 32; }
        break;
      case "warn":
        if (--e.timer <= 0) { e.mode = "fall"; e.vy = 2; }
        break;
      case "fall": {
        e.vy = Math.min(e.fallSpeed, e.vy + 1.2);
        const dy = Math.min(e.vy, e.floorY - e.y);
        Physics.moveSolid(world, e, 0, dy);
        if (e.y >= e.floorY) {
          e.mode = "land"; e.timer = 40;
          const onScreen = U.overlap(e, { x: world.camera.x, y: world.camera.y, w: VIEW_W, h: VIEW_H });
          if (onScreen) { world.camera.shake(7); sfx.play("slam"); }
          world.particles.dust(e.x + 10, e.y + e.h, "#b0c4ff", 8, -1);
          world.particles.dust(e.x + e.w - 10, e.y + e.h, "#b0c4ff", 8, 1);
        }
        break;
      }
      case "land":
        if (--e.timer <= 0) e.mode = "rise";
        break;
      case "rise": {
        const dy = Math.max(-e.riseSpeed, e.home.y - e.y);
        Physics.moveSolid(world, e, 0, dy);
        if (e.y <= e.home.y) { e.mode = "wait"; e.timer = Math.round(e.delay * FPS); }
        break;
      }
    }
  },
  draw(e, ctx, world) {
    const shake = e.mode === "warn" ? U.rand(-2, 2) : 0;
    const x = e.x + shake, y = e.y;
    // Piston rod back to the ceiling.
    ctx.fillStyle = "#2a2f48";
    ctx.fillRect(x + 26, e.home.y - 4, 12, y - e.home.y + 4);
    ctx.fillStyle = "#3a4166";
    ctx.fillRect(x, y, e.w, e.h);
    ctx.fillStyle = "#262b45";
    ctx.fillRect(x + 6, y + 6, e.w - 12, e.h - 20);
    // Hazard stripes on the face.
    ctx.fillStyle = e.mode === "warn" ? "#ff3355" : "#ff9d00";
    for (let i = 0; i < 4; i++) ctx.fillRect(x + 4 + i * 16, y + e.h - 10, 9, 10);
    ctx.fillStyle = "#ffb44d";
    ctx.fillRect(x, y + e.h - 2, e.w, 2);
    if (e.mode === "warn") U.glow(ctx, x + e.w / 2, y + e.h, 40, "#ff3355", 0.6);
  },
});

// -------------------------------------------------------- moving platform
// arg: h | v. overrides: range (tiles, sign = direction), speed (px/frame),
// width (tiles), offset (frames).
registerEntity("movingPlatform", {
  size: [96, 16],
  anchor: "topleft",
  props: { solid: true, range: 4, speed: 1.6, width: 3, offset: 0 },
  init(e, world, arg) {
    e.axis = arg === "v" ? "v" : "h";
    e.w = e.width * TILE;
    e.dist = Math.abs(e.range) * TILE;
    e.dirSign = e.range < 0 ? -1 : 1;
    e.period = Math.max(60, (2 * e.dist / e.speed) * 1.25);
  },
  update(e, world) {
    const k = 0.5 - 0.5 * Math.cos(((world.time + e.offset) / e.period) * Math.PI * 2);
    const off = e.dirSign * e.dist * k;
    const tx = e.axis === "h" ? e.home.x + off : e.home.x;
    const ty = e.axis === "v" ? e.home.y + off : e.home.y;
    Physics.moveSolid(world, e, tx - e.x, ty - e.y);
  },
  draw(e, ctx, world) {
    ctx.fillStyle = "#1a2648";
    ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.fillStyle = world.theme.accent;
    ctx.fillRect(e.x, e.y, e.w, 3);
    ctx.fillStyle = U.rgba(world.theme.accent, 0.5);
    for (let x = e.x + 8; x < e.x + e.w - 8; x += 16) ctx.fillRect(x, e.y + 7, 8, 3);
    U.glow(ctx, e.x + 6, e.y + 8, 12, world.theme.accent, 0.6);
    U.glow(ctx, e.x + e.w - 6, e.y + 8, 12, world.theme.accent, 0.6);
    // Thruster flicker underneath.
    ctx.fillStyle = U.rgba("#ff9d00", 0.5 + Math.random() * 0.3);
    ctx.fillRect(e.x + e.w / 2 - 6, e.y + e.h, 12, 3 + Math.random() * 4);
  },
});

// -------------------------------------------------------- falling platform
registerEntity("fallingPlatform", {
  size: [32, 16],
  anchor: "top",
  props: { solid: true },
  init(e) { this.onRespawn(e); },
  onRespawn(e) {
    e.x = e.home.x; e.y = e.home.y;
    e.mode = "idle"; e.timer = 0; e.vy = 0; e.solid = true;
  },
  update(e, world) {
    const p = world.player;
    switch (e.mode) {
      case "idle":
        if (p.ground === e) { e.mode = "shake"; e.timer = 28; }
        break;
      case "shake":
        if (--e.timer <= 0) { e.mode = "fall"; e.vy = 0.5; }
        break;
      case "fall":
        e.vy = Math.min(10, e.vy + 0.45);
        Physics.moveSolid(world, e, 0, e.vy);
        if (e.y > e.home.y + 700 || e.y > world.ph + 64) {
          e.mode = "gone"; e.solid = false; e.timer = 180;
        }
        break;
      case "gone":
        if (--e.timer <= 0) {
          const back = { x: e.home.x, y: e.home.y, w: e.w, h: e.h };
          if (!U.overlap(back, p)) {
            this.onRespawn(e);
            world.particles.burst(U.cx(e), U.cy(e), 8, "#ffb400", 2);
          }
        }
        break;
    }
  },
  draw(e, ctx) {
    if (e.mode === "gone") {
      ctx.strokeStyle = "rgba(255,180,0,0.15)";
      ctx.strokeRect(e.home.x + 0.5, e.home.y + 0.5, e.w - 1, e.h - 1);
      return;
    }
    const sx = e.mode === "shake" ? U.rand(-1.5, 1.5) : 0;
    ctx.fillStyle = "#3a2a18";
    ctx.fillRect(e.x + sx, e.y, e.w, e.h);
    ctx.fillStyle = "#ffb400";
    ctx.fillRect(e.x + sx, e.y, e.w, 3);
    ctx.fillStyle = "#7a5410";
    ctx.fillRect(e.x + sx + 4, e.y + 7, 6, 4);
    ctx.fillRect(e.x + sx + 13, e.y + 7, 6, 4);
    ctx.fillRect(e.x + sx + 22, e.y + 7, 6, 4);
  },
});

// -------------------------------------------------------- low-gravity field
registerEntity("gravityField", {
  size: [32, 32],
  anchor: "topleft",
  layer: 0,
  update(e, world) {
    const p = world.player;
    if (p.alive && U.overlap(p, e)) p.lowGrav = true;
    if (Math.random() < 0.01)
      world.particles.emit(e.x + Math.random() * 32, e.y + 32, { vy: -0.7, life: 50, size: 2, color: "#b78cff", drag: 1 });
  },
  draw(e, ctx, world) {
    ctx.globalAlpha = 0.07 + 0.03 * Math.sin(world.time * 0.03 + e.col * 0.4 + e.row * 0.3);
    ctx.fillStyle = "#8a5cff";
    ctx.fillRect(e.x, e.y, 32, 32);
    ctx.globalAlpha = 1;
  },
});

// ---------------------------------------------------------------- fake wall
// Looks exactly like a solid block but can be walked through — hides secrets.
registerEntity("fakeWall", {
  size: [32, 32],
  anchor: "topleft",
  layer: 3,
  init(e) { e.alpha = 1; },
  update(e, world) {
    const p = world.player;
    const near = { x: e.x - 8, y: e.y - 8, w: 48, h: 48 };
    const target = U.overlap(p, near) ? 0.25 : e.found ? 0.6 : 1;
    if (target < 1) e.found = true;
    e.alpha = U.lerp(e.alpha, target, 0.15);
  },
  draw(e, ctx, world) {
    const th = world.theme;
    ctx.globalAlpha = e.alpha;
    ctx.fillStyle = th.tileFill;
    ctx.fillRect(e.x, e.y, 32, 32);
    ctx.fillStyle = th.edgeDim;
    ctx.fillRect(e.x, e.y + 30, 32, 2);
    // A barely-visible flicker is the only clue.
    if ((world.time + e.col * 13) % 240 < 3) {
      ctx.fillStyle = U.rgba(th.accent, 0.25);
      ctx.fillRect(e.x + 4, e.y + 14, 24, 2);
    }
    ctx.globalAlpha = 1;
  },
});

// ---------------------------------------------------------------- boss gate
// Open (passable) normally; becomes a solid energy barrier during boss fights.
registerEntity("gate", {
  size: [32, 32],
  anchor: "topleft",
  layer: 2,
  props: { alwaysActive: true },
  update(e, world) {
    const closed = !!world.flags.bossFight;
    if (closed && !e.solid) {
      // Never close on top of the player.
      if (U.overlap(e, world.player)) return;
      world.particles.burst(U.cx(e), U.cy(e), 6, "#ff3df0", 2);
    }
    e.solid = closed;
  },
  draw(e, ctx, world) {
    if (e.solid) {
      ctx.fillStyle = U.rgba("#ff3df0", 0.25);
      ctx.fillRect(e.x + 4, e.y, 24, 32);
      ctx.fillStyle = "#ff3df0";
      for (let i = 0; i < 3; i++) ctx.fillRect(e.x + 7 + i * 8, e.y, 2, 32);
      if (world.time % 3 === 0) U.glow(ctx, U.cx(e), U.cy(e), 20, "#ff3df0", 0.3);
    } else {
      ctx.fillStyle = U.rgba("#ff3df0", 0.12);
      ctx.fillRect(e.x + 4, e.y, 2, 32);
      ctx.fillRect(e.x + 26, e.y, 2, 32);
    }
  },
});

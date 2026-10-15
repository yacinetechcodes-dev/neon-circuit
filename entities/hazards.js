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
  const t = ((world.htime / FPS + (offset || 0)) % period + period) % period;
  if (t < on) return "on";
  if (t > period - 0.6) return "warn";
  return "off";
}

// ---------------------------------------------------------------- spike
// arg: up (default) | down | left | right  — the direction the points face.
registerEntity("spike", {
  info: { name: "Spikes", desc: "Sharp. Don't touch.", tip: false },
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
  draw(e, ctx, world) {
    const x = e.cellX, y = e.cellY;
    if (e.pixel) {
      // Chunky stepped spikes (World 3 skin) with a lit edge.
      const step = (bx, by, dx, dy, along) => { // 3 steps per spike
        for (let k = 0; k < 3; k++) {
          const len = 16 - k * 6, off = k * 3;
          ctx.fillStyle = k === 2 ? "#ffffff" : k === 1 ? e.color : U.mix(e.color, "#000000", 0.3);
          if (along === "h") ctx.fillRect(bx + off, by + dy * k * 5, len, 5);
          else ctx.fillRect(bx + dx * k * 5, by + off, 5, len);
        }
      };
      for (let i = 0; i < 2; i++) {
        const o = i * 16;
        if (e.dir === "down") step(x + o, y, 0, 1, "h");
        else if (e.dir === "left") step(x + 27, y + o, -1, 0, "v");
        else if (e.dir === "right") step(x, y + o, 1, 0, "v");
        else step(x + o, y + 27, 0, -1, "h");
      }
      return;
    }
    // Metal spikes: a dark base plate, gradient blades and glinting tips.
    const fill = e.fill || "#5a1430", col = e.color || "#ff2a6d";
    const tips = [];
    ctx.beginPath();
    for (let i = 0; i < 2; i++) {
      const o = i * 16;
      switch (e.dir) {
        case "down": ctx.moveTo(x + o, y); ctx.lineTo(x + o + 8, y + 17); ctx.lineTo(x + o + 16, y); tips.push([x + o + 8, y + 17]); break;
        case "left": ctx.moveTo(x + 32, y + o); ctx.lineTo(x + 15, y + o + 8); ctx.lineTo(x + 32, y + o + 16); tips.push([x + 15, y + o + 8]); break;
        case "right": ctx.moveTo(x, y + o); ctx.lineTo(x + 17, y + o + 8); ctx.lineTo(x, y + o + 16); tips.push([x + 17, y + o + 8]); break;
        default: ctx.moveTo(x + o, y + 32); ctx.lineTo(x + o + 8, y + 15); ctx.lineTo(x + o + 16, y + 32); tips.push([x + o + 8, y + 15]);
      }
    }
    const vert = e.dir === "down" || !e.dir || e.dir === "up";
    const g = vert ? ctx.createLinearGradient(0, y + (e.dir === "down" ? 0 : 32), 0, y + 16) : ctx.createLinearGradient(x + (e.dir === "left" ? 32 : 0), 0, x + 16, 0);
    g.addColorStop(0, U.mix(fill, "#000000", 0.35)); g.addColorStop(1, U.mix(fill, col, 0.55));
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
    // A glint travels across the row of spikes.
    const k = ((world.time * 0.02 + e.cellX * 0.013) % 1);
    for (const [tx, ty] of tips) {
      ctx.fillStyle = "#ffffff"; ctx.fillRect(tx - 1, ty - 1, 2, 2);
      if (Math.abs(k - ((tx % 64) / 64)) < 0.05) U.glow(ctx, tx, ty, 8, "#ffffff", 0.6);
    }
  },
});

// ---------------------------------------------------------------- laser
// arg: v (beam shoots down from a ceiling emitter) | h (beam shoots right).
// overrides: on, off, offset (seconds). off: 0 = always on.
registerEntity("laser", {
  info: { name: "Laser", desc: "Burns while it's on; some blink on and off.", tip: false },
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
    const col = "#ff2a6d", t = world.time;
    const v = e.dir === "v";
    // Emitter housing with vents and a status lens.
    const hx = v ? e.ex + 4 : e.ex, hy = v ? e.ey : e.ey + 4, hw = v ? 24 : 14, hh = v ? 14 : 24;
    ctx.beginPath(); ctx.rect(hx, hy, hw, hh);
    Look.fill(ctx, hy, hh, "#2e2848");
    ctx.strokeStyle = "#4a4070"; ctx.lineWidth = 1; ctx.strokeRect(hx + 0.5, hy + 0.5, hw - 1, hh - 1);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    for (let i = 0; i < 3; i++) { if (v) ctx.fillRect(hx + 4 + i * 6, hy + 2, 3, 4); else ctx.fillRect(hx + 2, hy + 4 + i * 6, 4, 3); }
    const lx = v ? e.ex + 16 : e.ex + 10, ly = v ? e.ey + 10 : e.ey + 16;
    const lensCol = st === "on" ? col : st === "warn" ? "#ff9db8" : "#5a2a40";
    ctx.fillStyle = lensCol; ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, 6.28); ctx.fill();
    if (st !== "off") U.glow(ctx, lx, ly, 14, col, st === "on" ? 0.9 : 0.5);
    if (st === "on") {
      // Beam: wide glow, jittering core, bright centre line.
      const flick = 0.8 + Math.random() * 0.2;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = U.rgba(col, 0.22 * flick);
      if (v) ctx.fillRect(e.x - 6, e.y, e.w + 12, e.h); else ctx.fillRect(e.x, e.y - 6, e.w, e.h + 12);
      ctx.fillStyle = U.rgba(col, 0.55 * flick);
      const j = Math.sin(t * 0.9) * 0.8;
      if (v) ctx.fillRect(e.x + 1 + j, e.y, 6, e.h); else ctx.fillRect(e.x, e.y + 1 + j, e.w, 6);
      ctx.fillStyle = U.rgba("#ffe6ee", flick);
      if (v) ctx.fillRect(e.x + 3, e.y, 2, e.h); else ctx.fillRect(e.x, e.y + 3, e.w, 2);
      ctx.restore();
      const px = v ? U.cx(e) : e.x + e.w, py = v ? e.y + e.h : U.cy(e);
      U.glow(ctx, px, py, 18, col, 0.7);
      if (t % 4 === 0 && Game.state === "play") world.particles.emit(px, py, { vx: U.rand(-2, 2), vy: U.rand(-2, 0), life: 12, size: 2, color: col, shape: "spark" });
    } else if (st === "warn") {
      // Telegraph: a thin flickering guide line along the beam path.
      ctx.fillStyle = U.rgba(col, t % 6 < 3 ? 0.5 : 0.2);
      if (v) ctx.fillRect(e.x + 3.5, e.y, 1, e.h); else ctx.fillRect(e.x, e.y + 3.5, e.w, 1);
    }
  },
  light(e) { return e.state === "on" ? [70, "#ff2a6d", 0.8] : null; },
});

// -------------------------------------------------------- electric floor
// A solid block whose top surface is electrified in cycles.
// overrides: on, off, offset (seconds)
registerEntity("electric", {
  info: { name: "Electric Floor", desc: "Shocks you while it crackles.", tip: false },
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
    const st = e.state || "off", t = world.time;
    // Insulated block with coils.
    ctx.beginPath(); ctx.rect(e.x, e.y, 32, 32);
    Look.fill(ctx, e.y, 32, "#25331f", 0.1, 0.4);
    ctx.fillStyle = "#3d4a26";
    for (let i = 0; i < 4; i++) { ctx.fillRect(e.x + 3 + i * 7, e.y + 8, 4, 20); ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(e.x + 3 + i * 7, e.y + 8, 1, 20); ctx.fillStyle = "#3d4a26"; }
    for (let yy = e.y + 10; yy < e.y + 28; yy += 4) { ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(e.x + 2, yy, 28, 1); }
    const on = st === "on", warn = st === "warn";
    const col = on ? "#e8ff4a" : warn && t % 6 < 3 ? "#b8c84a" : "#4f5a22";
    ctx.fillStyle = col; ctx.fillRect(e.x, e.y, 32, 4);
    ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.fillRect(e.x, e.y, 32, 1);
    if (warn) U.glow(ctx, U.cx(e), e.y, 16, "#e8ff4a", 0.25 + (t % 6 < 3 ? 0.2 : 0));
    if (on) {
      U.glow(ctx, U.cx(e), e.y, 30, "#e8ff4a", 0.55);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let k = 0; k < 2; k++) {
        ctx.strokeStyle = k ? "rgba(255,255,255,0.9)" : "rgba(232,255,74,0.7)"; ctx.lineWidth = k ? 1 : 2.5;
        ctx.beginPath();
        let x = e.x, y = e.y - 2;
        ctx.moveTo(x, y);
        while (x < e.x + 32) { x += 4 + Math.random() * 3; y = e.y - 2 - Math.random() * 13; ctx.lineTo(Math.min(x, e.x + 32), y); }
        ctx.stroke();
      }
      ctx.restore();
    }
  },
  light(e) { return e.state === "on" ? [60, "#e8ff4a", 0.9] : null; },
});

// ---------------------------------------------------------------- crusher
// 2×2 tile block hanging from a ceiling. Slams down, then slowly rises.
// overrides: delay (s, wait at top), offset (s), fallSpeed, riseSpeed
registerEntity("crusher", {
  info: { name: "Crusher", desc: "Slams down on a rhythm: pass between hits.", tip: false },
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
    const warn = e.mode === "warn";
    const shake = warn ? U.rand(-2, 2) : 0;
    const x = e.x + shake, y = e.y, t = world.time;
    // Telescoping piston back to the ceiling.
    const top = e.home.y - 4, len = y - top;
    ctx.fillStyle = "#1e2236"; ctx.fillRect(x + 24, top, 16, Math.max(0, len));
    ctx.fillStyle = "#4a5276"; ctx.fillRect(x + 27, top, 10, Math.max(0, len));
    ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(x + 28, top, 2, Math.max(0, len));
    for (let yy = top + 6; yy < y - 4; yy += 14) { ctx.fillStyle = "#2a2f48"; ctx.fillRect(x + 25, yy, 14, 3); }
    // Heavy block: bevelled steel, bolts, hazard stripes, glowing slots.
    ctx.beginPath(); ctx.rect(x, y, e.w, e.h);
    Look.fill(ctx, y, e.h, "#3e466c", 0.18, 0.4);
    ctx.strokeStyle = "#5c6896"; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, e.w - 2, e.h - 2);
    ctx.fillStyle = "#262b45"; ctx.fillRect(x + 7, y + 7, e.w - 14, e.h - 22);
    for (const [bx, by] of [[5, 5], [e.w - 5, 5], [5, e.h - 15], [e.w - 5, e.h - 15]]) Look.bolt(ctx, x + bx, y + by, 2);
    ctx.fillStyle = warn ? "#ff3355" : "#ff9d00";
    ctx.save(); ctx.beginPath(); ctx.rect(x, y + e.h - 11, e.w, 11); ctx.clip();
    for (let i = -1; i < e.w / 8 + 1; i++) { ctx.beginPath(); ctx.moveTo(x + i * 12, y + e.h); ctx.lineTo(x + i * 12 + 6, y + e.h); ctx.lineTo(x + i * 12 + 12, y + e.h - 11); ctx.lineTo(x + i * 12 + 6, y + e.h - 11); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = "#ffd28a"; ctx.fillRect(x, y + e.h - 2, e.w, 2);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = warn && t % 8 < 4 ? "#ff3355" : U.rgba("#ff9d00", 0.6); ctx.fillRect(x + 14 + i * 14, y + 12, 8, 3); }
    if (warn) {
      // Telegraph: a red glow and a target strip on the floor below.
      U.glow(ctx, x + e.w / 2, y + e.h, 44, "#ff3355", 0.65);
      ctx.fillStyle = U.rgba("#ff3355", 0.25 + (t % 8 < 4 ? 0.2 : 0));
      ctx.fillRect(x + 2, y + e.h + 2, e.w - 4, 3);
    }
  },
});

// -------------------------------------------------------- moving platform
// arg: h | v. overrides: range (tiles, sign = direction), speed (px/frame),
// width (tiles), offset (frames).
registerEntity("movingPlatform", {
  info: { name: "Moving Platform", desc: "Carries you along.", tip: false },
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
    const k = 0.5 - 0.5 * Math.cos(((world.htime + e.offset) / e.period) * Math.PI * 2);
    const off = e.dirSign * e.dist * k;
    const tx = e.axis === "h" ? e.home.x + off : e.home.x;
    const ty = e.axis === "v" ? e.home.y + off : e.home.y;
    Physics.moveSolid(world, e, tx - e.x, ty - e.y);
  },
  draw(e, ctx, world) {
    const acc = world.theme.accent, t = world.time;
    // Hover pad: metal deck, accent rim, running lights, twin thrusters.
    ctx.beginPath(); ctx.rect(e.x, e.y, e.w, e.h);
    Look.fill(ctx, e.y, e.h, "#22305a", 0.2, 0.45);
    ctx.fillStyle = acc; ctx.fillRect(e.x, e.y, e.w, 3);
    ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.fillRect(e.x, e.y, e.w, 1);
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(e.x, e.y + e.h - 2, e.w, 2);
    const n = Math.max(1, Math.floor((e.w - 12) / 16));
    for (let i = 0; i < n; i++) {
      const on = Math.floor(t / 8 + i) % n === 0;
      ctx.fillStyle = on ? acc : U.rgba(acc, 0.3);
      ctx.fillRect(e.x + 8 + i * 16, e.y + 6, 8, 3);
    }
    Look.bolt(ctx, e.x + 4, e.y + 7); Look.bolt(ctx, e.x + e.w - 4, e.y + 7);
    for (const tx of [e.x + 10, e.x + e.w - 10]) {
      ctx.fillStyle = "#14182a"; ctx.fillRect(tx - 4, e.y + e.h, 8, 3);
      Look.thruster(ctx, tx, e.y + e.h + 3, 0, 1, 7, "#ff9d00", t + tx);
    }
  },
});

// -------------------------------------------------------- falling platform
registerEntity("fallingPlatform", {
  info: { name: "Falling Platform", desc: "Drops shortly after you land on it." },
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
  draw(e, ctx, world) {
    if (e.mode === "gone") {
      // Ghost outline where it will come back.
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(255,180,0,0.22)";
      ctx.strokeRect(e.home.x + 0.5, e.home.y + 0.5, e.w - 1, e.h - 1);
      ctx.setLineDash([]);
      return;
    }
    const shaking = e.mode === "shake";
    const sx = shaking ? U.rand(-1.5, 1.5) : 0, x = e.x + sx;
    ctx.beginPath(); ctx.rect(x, e.y, e.w, e.h);
    Look.fill(ctx, e.y, e.h, "#4a3418", 0.2, 0.4);
    ctx.fillStyle = "#ffb400"; ctx.fillRect(x, e.y, e.w, 3);
    ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.fillRect(x, e.y, e.w, 1);
    ctx.fillStyle = "#7a5410";
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 4 + i * 9, e.y + 7, 6, 4);
    // Cracks appear while it shakes (the telegraph), with falling grit.
    if (shaking) {
      ctx.strokeStyle = "rgba(20,10,0,0.8)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x + 10, e.y + 3); ctx.lineTo(x + 14, e.y + 8); ctx.lineTo(x + 12, e.y + e.h); ctx.moveTo(x + 22, e.y + 3); ctx.lineTo(x + 19, e.y + 9); ctx.stroke();
      if (world.time % 4 === 0 && Game.state === "play") world.particles.emit(x + U.rand(2, e.w - 2), e.y + e.h, { vy: 1.5, grav: 0.2, life: 18, size: 2, color: "#b08a40", shape: "square" });
    }
  },
});

// -------------------------------------------------------- low-gravity field
registerEntity("gravityField", {
  info: { name: "Low-Gravity Field", desc: "Inside it you float and jump higher." },
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
    const t = world.time;
    ctx.globalAlpha = 0.07 + 0.03 * Math.sin(t * 0.03 + e.col * 0.4 + e.row * 0.3);
    ctx.fillStyle = "#8a5cff";
    ctx.fillRect(e.x, e.y, 32, 32);
    // Slowly rising motes show it is low gravity.
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#c9b0ff";
    const ph = (e.col * 7 + e.row * 3) % 32;
    const yy = e.y + 32 - ((t * 0.35 + ph * 3) % 32);
    ctx.fillRect(e.x + (ph % 24) + 4, yy, 2, 2);
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
    const th = world.tileThemeAt ? world.tileThemeAt(e.col) : world.theme;
    ctx.globalAlpha = e.alpha;
    const img = Tiles.single(th);
    if (img) ctx.drawImage(img, e.x, e.y);
    else { ctx.fillStyle = th.tileFill; ctx.fillRect(e.x, e.y, 32, 32); }
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
  info: { name: "Arena Gate", desc: "Shuts during a boss fight, opens when it's over.", tip: false },
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
    const t = world.time;
    // Posts.
    for (const px of [e.x + 2, e.x + 26]) { ctx.fillStyle = "#2a1838"; ctx.fillRect(px, e.y, 4, 32); ctx.fillStyle = e.solid ? "#ff3df0" : U.rgba("#ff3df0", 0.3); ctx.fillRect(px + 1, e.y + 2, 2, 4); }
    if (e.solid) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = U.rgba("#ff3df0", 0.18); ctx.fillRect(e.x + 6, e.y, 20, 32);
      for (let i = 0; i < 3; i++) {
        const a = 0.55 + 0.45 * Math.sin(t * 0.3 + i * 2 + e.row);
        ctx.fillStyle = U.rgba("#ff3df0", a); ctx.fillRect(e.x + 8 + i * 7, e.y, 2, 32);
      }
      const sy = e.y + ((t * 2 + e.row * 11) % 32);
      ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fillRect(e.x + 6, sy, 20, 1);
      ctx.restore();
      if (t % 3 === 0) U.glow(ctx, U.cx(e), U.cy(e), 20, "#ff3df0", 0.3);
    }
  },
});

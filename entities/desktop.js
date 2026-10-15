/* =========================================================================
 * entities/desktop.js — World 4 "Windows 10 World" (a desktop parody).
 * Generic, original shapes only: plain window frames, plain squares for the
 * title-bar buttons, folder/file blocks — no real logos or icons.
 *
 *   popupWindow    a pop-up that chases you around               (stomp/shoot/dash)
 *   errorBox       walking dialog; its "ding" sends out a ring    (stomp twice/shoot)
 *   spinLoader     rolling loading circle — spinning, don't stomp (shoot/dash)
 *   closingWindow  window platform that closes and reopens on a rhythm
 *   bluePanel      blue panel that crashes down from a ceiling, then rises
 *   dragTrap       file-drag zone: drags you sideways while you're inside
 *   smashBlock     stack of files — only a Maximized player can smash it
 *   slotBlock      leaves an 11 px slot — only a Minimized player fits
 *   tabWindow      Alt-Tab target: linked pairs, press Alt-Tab inside one
 *
 * Also adds the World 4 abilities (Minimize, Maximize, Alt-Tab) to the
 * upgrade banner table, and their sounds.
 * ========================================================================= */
"use strict";

const DESK = {
  blue: "#1e88e5", deep: "#0b3d91", sky: "#4fc3ff", white: "#f4f8fc", gray: "#c9d3df",
  dark: "#1b2330", red: "#e53935", amber: "#ffb300", green: "#43a047", ink: "#0d1b2a",
};

/** A generic window frame: title bar, body, three plain squares. */
function drawWindowFrame(ctx, x, y, w, h, o = {}) {
  const bar = o.bar || DESK.blue, bh = Math.min(o.barH || 8, h);
  // Body with a soft top-to-bottom sheen.
  const body = o.body || DESK.white;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, body); g.addColorStop(1, U.mix(body, "#9fb2c8", 0.25));
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  // Title bar: gradient and a highlight line.
  const tg = ctx.createLinearGradient(0, y, 0, y + bh);
  tg.addColorStop(0, U.mix(bar, "#ffffff", 0.25)); tg.addColorStop(1, bar);
  ctx.fillStyle = tg; ctx.fillRect(x, y, w, bh);
  ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(x, y, w, 1);
  if (w >= 24 && bh >= 6) {
    ctx.fillStyle = U.rgba("#ffffff", 0.85);
    for (let i = 0; i < 3; i++) ctx.fillRect(x + w - 6 - i * 6, y + 2, 4, bh - 4);
  }
  ctx.strokeStyle = o.edge || DESK.deep; ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

Object.assign(UPGRADE_INFO, {
  minimize: { name: "MINIMIZE", desc: "Shrink small and quick to slip through thin slots.", how: "{minimize}", action: "minimize", label: "MIN", world: 4 },
  maximize: { name: "MAXIMIZE", desc: "Grow big and heavy; walk into file stacks to smash them.", how: "{maximize}", action: "maximize", label: "MAX", world: 4 },
  altTab: { name: "ALT-TAB", desc: "Inside a numbered window, jump to its linked twin.", how: "{alttab} in a linked window", action: "altTab", label: "TAB", world: 4 },
});

sfx.define("minimize", (s, t) => s.tone(t, { type: "sine", f0: 900, f1: 300, dur: 0.12, vol: 0.09 }), 0.08);
sfx.define("maximize", (s, t) => s.tone(t, { type: "sine", f0: 300, f1: 900, dur: 0.14, vol: 0.09 }), 0.08);
sfx.define("alttab", (s, t) => {
  s.tone(t, { type: "triangle", f0: 660, dur: 0.05, vol: 0.09 });
  s.tone(t, { type: "triangle", f0: 990, dur: 0.07, vol: 0.09, delay: 0.05 });
}, 0.1);
sfx.define("ding", (s, t) => {
  s.tone(t, { type: "sine", f0: 880, dur: 0.18, vol: 0.08 });
  s.tone(t, { type: "sine", f0: 660, dur: 0.25, vol: 0.07, delay: 0.09 });
}, 0.2);
sfx.define("smash", (s, t) => {
  s.noise(t, { filter: "lowpass", f0: 2400, f1: 200, dur: 0.25, vol: 0.28 });
  s.tone(t, { type: "square", f0: 140, f1: 60, dur: 0.18, vol: 0.08 });
}, 0.06);

// ---------------------------------------------------------------- popupWindow
registerEntity("popupWindow", {
  info: { name: "Pop-up", desc: "Chases you around. Stomp, shoot or dash it." },
  size: [36, 26],
  anchor: "center",
  props: { enemy: true, hurts: true, stompable: true, shootable: true, dashable: true, hp: 1,
    speed: 1.7, sight: 9, color: DESK.blue },
  init(e) { e.phase = Math.random() * 6.28; },
  update(e, world) {
    const p = world.player;
    const d = U.dist(U.cx(e), U.cy(e), U.cx(p), U.cy(p));
    const chase = p.alive && d < e.sight * TILE;
    const tx = chase ? U.cx(p) - e.w / 2 : e.home.x + Math.sin(e.t * 0.02 + e.phase) * 48;
    const ty = chase ? U.cy(p) - e.h / 2 - 18 : e.home.y + Math.sin(e.t * 0.05) * 8;
    e.vx = U.approach(e.vx, U.clamp((tx - e.x) * 0.05, -e.speed, e.speed), 0.07);
    e.vy = U.approach(e.vy, U.clamp((ty - e.y) * 0.05, -e.speed, e.speed), 0.07);
    Physics.move(world, e, e.vx, e.vy, { solids: false, oneway: false });
  },
  draw(e, ctx, world) {
    const x = Math.round(e.x), y = Math.round(e.y), t = e.t;
    const bob = Math.sin(t * 0.12) * 1.5;
    // Drop shadow on whatever is behind.
    ctx.fillStyle = "rgba(0,20,60,0.25)"; ctx.fillRect(x + 4, y + 5 + bob, e.w, e.h);
    drawWindowFrame(ctx, x, y + bob, e.w, e.h, { bar: e.flash ? "#ffffff" : e.color });
    // "Typing" content lines that keep filling up.
    const k = (t * 0.6) % (e.w - 10);
    ctx.fillStyle = DESK.gray;
    ctx.fillRect(x + 5, y + 12 + bob, e.w - 10, 3);
    ctx.fillRect(x + 5, y + 18 + bob, Math.max(4, k), 3);
    ctx.fillStyle = DESK.ink; if (Math.floor(t / 15) % 2) ctx.fillRect(x + 5 + Math.max(4, k), y + 17 + bob, 1, 5);
    // A big bouncing "OK" button (plain shape).
    if (e.h > 26) { ctx.fillStyle = DESK.blue; ctx.fillRect(x + e.w / 2 - 6, y + e.h - 7 + bob, 12, 4); }
    U.glow(ctx, x + e.w - 4, y + 4 + bob, 8, "#ff5a5a", 0.4 + 0.3 * Math.sin(t * 0.3));
  },
});

// ---------------------------------------------------------------- errorBox
registerEntity("errorBox", {
  info: { name: "Error Box", desc: "Its 'ding' sends out a ring: keep away or jump it." },
  size: [38, 28],
  props: { enemy: true, hurts: true, stompable: true, shootable: true, dashable: true, hp: 2,
    speed: 0.8, rate: 140, ring: 92, color: DESK.red },
  init(e) { e.dir = -1; e.timer = Math.floor(Math.random() * e.rate); e.ringR = 0; },
  update(e, world) {
    const p = world.player;
    walkStep(e, world, e.ringR > 0 || e.timer < 30 ? 0 : e.speed);
    if (e.ringR > 0) {
      e.ringR += 4;
      const d = U.dist(U.cx(e), U.cy(e), U.cx(p), U.cy(p));
      if (Math.abs(d - e.ringR) < 14) world.hurtPlayer(1, e);
      if (e.ringR > e.ring) e.ringR = 0;
    } else if (--e.timer <= 0) {
      e.timer = e.rate;
      e.ringR = 8;
      if (world.onScreen(e)) sfx.play("ding");
    }
  },
  draw(e, ctx, world) {
    const t = world.time;
    const warn = e.ringR === 0 && e.timer < 30 && Math.floor(e.timer / 4) % 2;
    const x = Math.round(e.x), y = Math.round(e.y);
    // Little stand legs that step as it walks.
    const s = Math.sin(e.t * 0.25) * 2;
    ctx.strokeStyle = "#5b6b82"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 6, y + e.h - 2); ctx.lineTo(x + 6 + s, y + e.h + 2); ctx.moveTo(x + e.w - 6, y + e.h - 2); ctx.lineTo(x + e.w - 6 - s, y + e.h + 2); ctx.stroke();
    Look.shadow(ctx, U.cx(e), y + e.h + 2, e.w);
    drawWindowFrame(ctx, x, y, e.w, e.h, { bar: e.flash || warn ? "#ffffff" : e.color });
    // Warning triangle (generic).
    const cx = U.cx(e), cy = y + 18;
    ctx.fillStyle = DESK.amber;
    ctx.beginPath(); ctx.moveTo(cx, cy - 7); ctx.lineTo(cx + 7, cy + 6); ctx.lineTo(cx - 7, cy + 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = DESK.ink; ctx.fillRect(cx - 1, cy - 3, 2, 5); ctx.fillRect(cx - 1, cy + 3, 2, 2);
    // Telegraph: a closing ring before the "ding", then the ring itself.
    if (e.ringR === 0 && e.timer < 30) Look.telegraph(ctx, cx, U.cy(e), e.w * 0.7, e.color, 1 - e.timer / 30);
    if (e.ringR > 0) {
      const a = 1 - e.ringR / e.ring;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = U.rgba(e.color, a * 0.35); ctx.lineWidth = 14;
      ctx.beginPath(); ctx.arc(cx, U.cy(e), e.ringR, 0, 6.28); ctx.stroke();
      ctx.strokeStyle = U.rgba("#ffffff", a); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, U.cy(e), e.ringR, 0, 6.28); ctx.stroke();
      ctx.restore();
    }
  },
});

// ---------------------------------------------------------------- spinLoader
registerEntity("spinLoader", {
  info: { name: "Spinning Loader", desc: "Spinning, don't stomp it. Shoot or dash it." },
  size: [26, 26],
  props: { enemy: true, hurts: true, stompable: false, shootable: true, dashable: true, hp: 3, speed: 2.4, color: DESK.sky },
  init(e) { e.dir = e.opts.dir === "right" ? 1 : -1; },
  update(e, world) {
    e.vy = Math.min(10, e.vy + 0.6);
    const res = Physics.move(world, e, e.dir * e.speed, e.vy);
    if (res.hitY) e.vy = 0;
    if (res.hitX) e.dir = -e.dir;
    if (e.y > world.ph + 100) e.dead = true;
  },
  draw(e, ctx, world) {
    const cx = U.cx(e), cy = U.cy(e), t = world.time;
    const col = e.flash ? "#ffffff" : e.color;
    Look.shadow(ctx, cx, e.y + e.h, e.w * 0.8);
    U.glow(ctx, cx, cy, 22, col, 0.45);
    // Track ring and a dark hub.
    ctx.strokeStyle = U.rgba(col, 0.2); ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, 10, 0, 6.28); ctx.stroke();
    ctx.fillStyle = "#0b2a5a"; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 6.28); ctx.fill();
    // Spinning dots with a fading tail (blur when rolling fast).
    const a0 = (t * 0.18) * e.dir;
    for (let i = 0; i < 10; i++) {
      const a = a0 - e.dir * (i / 10) * Math.PI * 1.6;
      ctx.globalAlpha = 1 - i / 10;
      ctx.fillStyle = i === 0 ? "#ffffff" : col;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10, 3.4 - i * 0.18, 0, 6.28); ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
});

// ---------------------------------------------------------------- closingWindow
// A window you can stand on that closes and reopens on a rhythm.
// overrides: width (tiles), on (s open), off (s closed), offset (s)
registerEntity("closingWindow", {
  info: { name: "Closing Window", desc: "A platform that closes and reopens on a rhythm." },
  size: [96, 16],
  anchor: "topleft",
  props: { solid: true, width: 3, on: 2.2, off: 1.2, offset: 0, alwaysActive: true },
  init(e) { e.w = e.width * TILE; e.state = "on"; },
  phase(e, world) {
    const period = e.on + e.off;
    const t = ((world.htime / FPS + e.offset) % period + period) % period;
    if (t < e.on) return t > e.on - 0.5 ? "closing" : "on";
    return t > period - 0.4 ? "opening" : "off";
  },
  update(e, world) {
    e.state = this.phase(e, world);
    const solidNow = e.state === "on" || e.state === "closing";
    if (solidNow && !e.solid && U.overlap(e, world.player)) return; // never reopen inside the player
    e.solid = solidNow;
  },
  draw(e, ctx, world) {
    const t = world.time;
    if (!e.solid) {
      if (e.state === "opening" && t % 6 < 3) { ctx.strokeStyle = DESK.sky; ctx.lineWidth = 2; ctx.strokeRect(e.x + 1, e.y + 1, e.w - 2, e.h - 2); }
      // Minimized to a little taskbar tab.
      ctx.fillStyle = U.rgba(DESK.sky, 0.35); ctx.fillRect(U.cx(e) - 8, e.y + e.h - 3, 16, 3);
      return;
    }
    const closing = e.state === "closing";
    const shrink = closing ? (Math.floor(t / 3) % 2 ? 4 : 0) : 0;
    ctx.fillStyle = "rgba(0,20,60,0.22)"; ctx.fillRect(e.x + 4, e.y + 5, e.w, e.h);
    drawWindowFrame(ctx, e.x + shrink, e.y, e.w - shrink * 2, e.h, { bar: closing ? DESK.red : DESK.blue, barH: 7 });
    if (closing) U.glow(ctx, e.x + e.w - 6, e.y + 4, 14, DESK.red, 0.6);
  },
});

// ---------------------------------------------------------------- bluePanel
// 3×2-tile panel hanging from a ceiling: waits, shakes, crashes down, rises.
// Pure function of time (deterministic). overrides: delay (s), offset (s)
registerEntity("bluePanel", {
  info: { name: "Crashing Panel", desc: "Shakes, then crashes down: get clear." },
  size: [96, 64],
  anchor: "topleft",
  props: { solid: true, delay: 1.4, offset: 0, alwaysActive: true },
  init(e, world) {
    let r = e.row + 2;
    while (r < world.h + 4 && ![0, 1, 2].some((k) => Physics.solidAt(world, e.col + k, r))) r++;
    e.floorY = r * TILE - e.h;
    e.drop = e.floorY - e.home.y;
    this.timing(e);
  },
  timing(e) {
    e.tWait = Math.round(e.delay * FPS); e.tWarn = 34; e.tFall = Math.max(6, Math.ceil(Math.sqrt(2 * e.drop / 1.2)));
    e.tHold = 40; e.tRise = Math.ceil(e.drop / 1.6);
    e.period = e.tWait + e.tWarn + e.tFall + e.tHold + e.tRise;
  },
  /** { y, mode } at time t. */
  at(e, t) {
    let k = (((t + Math.round(e.offset * FPS)) % e.period) + e.period) % e.period;
    if (k < e.tWait) return { y: e.home.y, mode: "wait" };
    k -= e.tWait;
    if (k < e.tWarn) return { y: e.home.y, mode: "warn" };
    k -= e.tWarn;
    if (k < e.tFall) return { y: e.home.y + Math.min(e.drop, 0.6 * k * k), mode: "fall" };
    k -= e.tFall;
    if (k < e.tHold) return { y: e.floorY, mode: "hold" };
    k -= e.tHold;
    return { y: Math.max(e.home.y, e.floorY - k * 1.6), mode: "rise" };
  },
  update(e, world) {
    const s = this.at(e, world.htime);
    const was = e.mode;
    e.mode = s.mode;
    Physics.moveSolid(world, e, 0, s.y - e.y);
    if (was === "fall" && e.mode === "hold" && world.onScreen(e)) { world.camera.shake(7); sfx.play("slam"); world.particles.dust(U.cx(e), e.y + e.h, DESK.sky, 10); }
  },
  draw(e, ctx, world) {
    const t = world.time, warn = e.mode === "warn";
    const sx = warn ? U.rand(-2, 2) : 0;
    const x = e.x + sx, y = e.y;
    // Cable and pulley.
    ctx.fillStyle = "#2a3a52"; ctx.fillRect(x + e.w / 2 - 3, e.home.y - 4, 6, y - e.home.y + 4);
    ctx.fillStyle = "#3a4c6a"; ctx.beginPath(); ctx.arc(x + e.w / 2, e.home.y, 6, 0, 6.28); ctx.fill();
    // Panel: gradient blue, bezel, a "please wait" progress bar and dots.
    ctx.beginPath(); ctx.rect(x, y, e.w, e.h);
    Look.fill(ctx, y, e.h, DESK.blue, 0.2, 0.35);
    ctx.strokeStyle = DESK.deep; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, e.w - 2, e.h - 2);
    ctx.fillStyle = DESK.deep; ctx.fillRect(x, y + e.h - 6, e.w, 6);
    ctx.fillStyle = U.rgba("#ffffff", 0.35); ctx.fillRect(x + 12, y + 30, e.w - 24, 6);
    const k = ((t * 0.01) % 1);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(x + 12, y + 30, (e.w - 24) * k, 6);
    for (let i = 0; i < 3; i++) { ctx.globalAlpha = (Math.floor(t / 10) % 3) === i ? 1 : 0.35; ctx.fillRect(x + e.w / 2 - 13 + i * 9, y + 14, 5, 5); }
    ctx.globalAlpha = 1;
    if (warn) {
      U.glow(ctx, x + e.w / 2, y + e.h, 44, DESK.red, 0.65);
      ctx.fillStyle = U.rgba(DESK.red, t % 8 < 4 ? 0.45 : 0.2); ctx.fillRect(x + 2, y + e.h + 2, e.w - 4, 3);
      Look.warn(ctx, x + e.w / 2, y - 10, DESK.red, t);
    }
  },
});

// ---------------------------------------------------------------- dragTrap
// arg: "l" | "r" (default) — the direction files (and you) get dragged.
registerEntity("dragTrap", {
  info: { name: "File-Drag Zone", desc: "Drags you sideways while you're inside." },
  size: [32, 32],
  anchor: "topleft",
  layer: 0,
  props: { force: 2.2 },
  init(e, world, arg) { e.dir = arg === "l" ? -1 : 1; },
  update(e, world) {
    const p = world.player;
    if (!p.alive || !U.overlap(p, e) || p.dragT === world.time) return;
    p.dragT = world.time;          // one push per frame, however many cells overlap
    Physics.move(world, p, e.dir * e.force, 0);
  },
  draw(e, ctx, world) {
    const t = world.time;
    ctx.fillStyle = U.rgba(DESK.sky, 0.1); ctx.fillRect(e.x, e.y, 32, 32);
    ctx.strokeStyle = U.rgba(DESK.sky, 0.5); ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.lineDashOffset = -t * 0.5 * e.dir;
    ctx.strokeRect(e.x + 0.5, e.y + 0.5, 31, 31); ctx.setLineDash([]);
    // Drifting file glyphs and direction chevrons.
    const k = ((t * 1.2 * e.dir + e.col * 13) % 32 + 32) % 32;
    ctx.fillStyle = U.rgba(DESK.white, 0.6);
    ctx.fillRect(e.x + k - 4, e.y + 10 + (e.row % 2) * 6, 8, 10);
    ctx.fillStyle = U.rgba(DESK.blue, 0.7); ctx.fillRect(e.x + k - 4, e.y + 10 + (e.row % 2) * 6, 8, 2);
    ctx.strokeStyle = U.rgba(DESK.sky, 0.45); ctx.lineWidth = 2;
    const c = ((t * 0.8 * e.dir) % 16 + 16) % 16;
    ctx.beginPath(); ctx.moveTo(e.x + c + 2, e.y + 24); ctx.lineTo(e.x + c + 2 + e.dir * 4, e.y + 27); ctx.lineTo(e.x + c + 2, e.y + 30); ctx.stroke();
  },
});

// ---------------------------------------------------------------- smashBlock
registerEntity("smashBlock", {
  info: { name: "File Stack", desc: "Only a Maximized robot can smash it." },
  size: [32, 32],
  anchor: "topleft",
  props: { solid: true, alwaysActive: true },
  update(e, world) {
    const p = world.player;
    if (p.form !== "max" || !p.alive) return;
    if (U.overlap({ x: p.x - 3, y: p.y - 3, w: p.w + 6, h: p.h + 6 }, e)) {
      for (const b of this.stack(e, world.entities)) {
        b.dead = true;
        world.particles.burst(U.cx(b), U.cy(b), 14, DESK.amber, 5, { shape: "square" });
        world.particles.burst(U.cx(b), U.cy(b), 6, DESK.white, 4, { shape: "square" });
      }
      world.camera.shake(5);
      sfx.play("smash");
      Save.markSeen("maximize");
    }
  },
  /** The whole connected stack (blocks touching edge-to-edge) goes at once. */
  stack(e, list) {
    const all = list.filter((o) => o.name === "smashBlock" && !o.dead);
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
  },
  draw(e, ctx) {
    // A stack of folders and papers (generic rectangles), slightly askew.
    const x = e.x, y = e.y;
    ctx.fillStyle = "#8a5a12"; ctx.fillRect(x, y + 4, 32, 28);
    ctx.fillStyle = DESK.white; ctx.fillRect(x + 3, y + 6, 26, 6); ctx.fillRect(x + 5, y + 2, 22, 5);
    ctx.fillStyle = "#c9d3df"; for (let i = 0; i < 3; i++) ctx.fillRect(x + 7, y + 3 + i * 2, 16, 1);
    ctx.beginPath(); ctx.rect(x, y + 10, 32, 22);
    Look.fill(ctx, y + 10, 22, DESK.amber, 0.25, 0.3);
    ctx.fillStyle = DESK.amber; ctx.fillRect(x, y + 7, 13, 4);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x, y + 20, 32, 1); ctx.fillRect(x, y + 26, 32, 1);
    ctx.fillStyle = DESK.white; ctx.fillRect(x + 6, y + 14, 20, 2); ctx.fillRect(x + 6, y + 22, 14, 2);
    ctx.strokeStyle = "#7a520f"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 4.5, 31, 27);
  },
});

// ---------------------------------------------------------------- slotBlock
// Solid top part of the cell, leaving an 11 px slot at the bottom.
registerEntity("slotBlock", {
  info: { name: "Slot", desc: "A thin gap only a Minimized robot fits through." },
  size: [32, 21],
  anchor: "top",
  props: { solid: true },
  init(e) { e.x = e.col * TILE; e.y = e.row * TILE; },
  draw(e, ctx) {
    ctx.beginPath(); ctx.rect(e.x, e.y, 32, 21);
    Look.fill(ctx, e.y, 21, DESK.gray, 0.3, 0.2);
    ctx.fillStyle = DESK.blue; ctx.fillRect(e.x, e.y + 17, 32, 4);
    ctx.fillStyle = "#9fd0ff"; ctx.fillRect(e.x, e.y + 20, 32, 1);
    ctx.fillStyle = DESK.white; ctx.fillRect(e.x + 4, e.y + 4, 24, 3);
    ctx.fillStyle = "rgba(0,0,0,0.15)"; ctx.fillRect(e.x + 4, e.y + 9, 18, 2);
  },
});

// ---------------------------------------------------------------- tabWindow
// arg: link id. Press Alt-Tab while inside one to jump to its partner.
registerEntity("tabWindow", {
  info: { name: "Linked Window", desc: "Alt-Tab inside it to jump to its twin." },
  size: [44, 52],
  layer: 0,
  props: { alwaysActive: true },
  init(e, world, arg) { e.link = arg || "1"; e.color = ["#4fc3ff", "#ffb300", "#43a047", "#e53935", "#ab47bc"][(parseInt(e.link, 10) || 1) % 5]; },
  partner(e, world) {
    if (!e.mate || e.mate.dead) e.mate = world.entities.find((o) => o !== e && o.name === "tabWindow" && o.link === e.link);
    return e.mate;
  },
  update(e, world) {
    const p = world.player;
    if (!p.alive || !p.has("altTab") || !U.overlap(p, e) || !Input.pressed("altTab") || p.tabT === world.time) return;
    const m = this.partner(e, world);
    if (!m) return;
    p.tabT = world.time;
    world.particles.burst(U.cx(p), U.cy(p), 16, e.color, 4, { shape: "square" });
    p.x = U.cx(m) - p.w / 2; p.y = m.y + m.h - p.h; p.vx = p.vy = 0; p.dashing = 0;
    world.particles.ring(U.cx(m), U.cy(m), e.color, 30);
    world.camera.snap(p);
    world.fade = 0.2;
    sfx.play("alttab");
    Save.markSeen("altTab");
  },
  draw(e, ctx, world) {
    const on = world.player.has("altTab"), t = world.time;
    ctx.globalAlpha = on ? 1 : 0.4;
    if (on) U.glow(ctx, U.cx(e), U.cy(e), Math.max(e.w, e.h) * 0.7, e.color, 0.25 + 0.1 * Math.sin(t * 0.08));
    ctx.fillStyle = U.rgba(e.color, 0.12); ctx.fillRect(e.x + 2, e.y + 8, e.w - 4, e.h - 10);
    ctx.strokeStyle = e.color; ctx.lineWidth = 2;
    ctx.strokeRect(e.x + 1, e.y + 1, e.w - 2, e.h - 2);
    ctx.fillStyle = e.color; ctx.fillRect(e.x + 1, e.y + 1, e.w - 2, 7);
    ctx.fillStyle = "rgba(255,255,255,0.8)"; for (let i = 0; i < 3; i++) ctx.fillRect(e.x + e.w - 8 - i * 6, e.y + 3, 3, 3);
    // Two overlapping mini-windows that swap places = "switch".
    const k = (Math.sin(t * 0.05) + 1) * 2;
    ctx.strokeStyle = U.rgba(e.color, 0.9); ctx.lineWidth = 2;
    ctx.strokeRect(e.x + 10 + k, e.y + 18, 16, 12); ctx.strokeRect(e.x + 18 - k, e.y + 26, 16, 12);
    ctx.globalAlpha = 1;
  },
});

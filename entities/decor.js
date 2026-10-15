/* =========================================================================
 * entities/decor.js — scenery that makes each world feel like its topic.
 *
 *   sign          a small text sign (story-style notes, warnings, hints).
 *                 Its text comes from an entityOverride: { at, text: "..." }.
 *                 Walk up to it to read; read signs are kept in the Codex (LOGS).
 *   prop:<kind>   decoration, no collision, drawn behind everything. Kinds are
 *                 registered with registerProp(kind, { w, h, draw(e, ctx, t, world) })
 *                 — one set per world below. Shapes only, no faces.
 * ========================================================================= */
"use strict";

const PROPS = {};
/** Register a decoration kind: size [w, h] and a draw(e, ctx, time, world). */
function registerProp(kind, def) { PROPS[kind] = def; }

registerEntity("sign", {
  info: { name: "Sign", desc: "Walk up to a sign to read it.", tip: false, kind: "item" },
  size: [28, 32],
  layer: 0,
  props: { text: "..." },
  update(e, world) {
    const p = world.player;
    e.reading = p.alive && U.overlap({ x: e.x - 40, y: e.y - 40, w: e.w + 80, h: e.h + 60 }, p);
    if (e.reading && !e.logged) {
      e.logged = true;
      const wid = world.worldDef ? world.worldDef.id : 0;
      Guide.discover("n:" + wid + ":" + e.text);
    }
  },
  draw(e, ctx, world) {
    const x = e.x, y = e.y, acc = world.theme.accent;
    ctx.fillStyle = "#2a2f3a"; ctx.fillRect(x + 12, y + 14, 4, 18);
    ctx.fillStyle = "rgba(10,14,28,0.9)"; ctx.fillRect(x, y, 28, 18);
    ctx.strokeStyle = acc; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, y + 0.5, 27, 17);
    ctx.fillStyle = U.rgba(acc, 0.8);
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 5, y + 4 + i * 4, 18 - (i === 2 ? 8 : 0), 2);
    if (!e.reading) return;
    // The note, above the sign.
    ctx.font = "bold 13px monospace";
    const lines = UI.wrap(ctx, e.text, 260);
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20, h = 10 + lines.length * 16;
    const bx = U.cx(e) - w / 2, by = y - h - 10;
    ctx.fillStyle = "rgba(6,10,26,0.88)"; ctx.fillRect(bx, by, w, h);
    ctx.strokeStyle = U.rgba(acc, 0.7); ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
    ctx.fillStyle = "#e6f6ff"; ctx.textAlign = "center";
    lines.forEach((l, i) => ctx.fillText(l, U.cx(e), by + 18 + i * 16));
    ctx.textAlign = "left";
  },
});

registerEntity("prop", {
  size: [32, 32],
  layer: 0,
  props: { alwaysDraw: false },
  init(e, world, arg) {
    e.kind = arg;
    const d = PROPS[arg];
    if (!d) { console.warn(`[decor] unknown prop "${arg}"`); return; }
    // Sit on the floor of its cell, centred.
    const b = e.y + e.h, cx = e.x + e.w / 2;
    e.w = d.w; e.h = d.h; e.x = cx - d.w / 2; e.y = b - d.h;
    e.seed = (e.col * 7 + e.row * 13) % 97;
  },
  draw(e, ctx, world) {
    const d = PROPS[e.kind];
    if (d) d.draw(e, ctx, world.time + e.seed * 7, world);
  },
});

// ======================================================= World 1: circuits & servers
registerProp("serverRack", { w: 40, h: 72, draw(e, ctx, t) {
  ctx.fillStyle = "#0f1730"; ctx.fillRect(e.x, e.y, e.w, e.h);
  ctx.strokeStyle = "#2b4a7a"; ctx.strokeRect(e.x + 0.5, e.y + 0.5, e.w - 1, e.h - 1);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = "#16233f"; ctx.fillRect(e.x + 4, e.y + 5 + i * 8, e.w - 8, 5);
    ctx.fillStyle = ((t >> 3) + i * 5 + e.seed) % 7 < 3 ? "#7dff4a" : "#1f3a1f"; ctx.fillRect(e.x + e.w - 9, e.y + 6 + i * 8, 3, 3);
  }
} });
registerProp("fanVent", { w: 36, h: 36, draw(e, ctx, t) {
  const cx = e.x + 18, cy = e.y + 18;
  ctx.fillStyle = "#0f1730"; ctx.fillRect(e.x, e.y, 36, 36);
  ctx.strokeStyle = "#2b4a7a"; ctx.strokeRect(e.x + 0.5, e.y + 0.5, 35, 35);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.25);
  ctx.fillStyle = "#3a6aa8"; for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.fillRect(-2, -14, 4, 12); }
  ctx.restore();
} });
registerProp("holoPanel", { w: 44, h: 30, draw(e, ctx, t) {
  ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 0.07);
  ctx.fillStyle = "rgba(0,240,255,0.12)"; ctx.fillRect(e.x, e.y, 44, 26);
  ctx.strokeStyle = "#00f0ff"; ctx.strokeRect(e.x + 0.5, e.y + 0.5, 43, 25);
  ctx.fillStyle = "#00f0ff";
  for (let i = 0; i < 4; i++) ctx.fillRect(e.x + 5, e.y + 5 + i * 5, 10 + ((t >> 4) * 7 + i * 11) % 24, 2);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#2b4a7a"; ctx.fillRect(e.x + 20, e.y + 26, 4, 4);
} });
registerProp("cableArch", { w: 64, h: 40, draw(e, ctx, t) {
  ctx.strokeStyle = "#1c2f55"; ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(e.x, e.y + 4 + i * 4);
    ctx.quadraticCurveTo(e.x + 32, e.y + 34 + i * 3 + Math.sin(t * 0.03 + i) * 2, e.x + 64, e.y + 4 + i * 4); ctx.stroke();
  }
  ctx.fillStyle = "#ff3df0"; ctx.fillRect(e.x + 30 + Math.sin(t * 0.05) * 24, e.y + 30, 3, 3);
} });
registerProp("antenna", { w: 20, h: 64, draw(e, ctx, t) {
  ctx.fillStyle = "#1c2f55"; ctx.fillRect(e.x + 8, e.y + 8, 4, 56);
  ctx.fillRect(e.x + 2, e.y + 60, 16, 4);
  const on = (t >> 5) % 2 === 0;
  ctx.fillStyle = on ? "#ff3355" : "#4a1a22"; ctx.fillRect(e.x + 7, e.y + 2, 6, 6);
  if (on) U.glow(ctx, e.x + 10, e.y + 5, 14, "#ff3355", 0.6);
} });

// ======================================================= World 2: hacking
registerProp("terminal", { w: 48, h: 40, draw(e, ctx, t) {
  ctx.fillStyle = "#031a0c"; ctx.fillRect(e.x, e.y, 48, 34);
  ctx.strokeStyle = "#39ff88"; ctx.strokeRect(e.x + 0.5, e.y + 0.5, 47, 33);
  ctx.fillStyle = "rgba(57,255,136,0.7)";
  for (let i = 0; i < 5; i++) ctx.fillRect(e.x + 4, e.y + 4 + i * 6, 6 + ((t >> 3) * 5 + i * 13) % 34, 2);
  if ((t >> 4) % 2) ctx.fillRect(e.x + 4, e.y + 28, 5, 3);
  ctx.fillStyle = "#0c3a1c"; ctx.fillRect(e.x + 18, e.y + 34, 12, 6);
} });
registerProp("dataPillar", { w: 24, h: 96, draw(e, ctx, t) {
  ctx.fillStyle = "rgba(57,255,136,0.08)"; ctx.fillRect(e.x, e.y, 24, 96);
  ctx.font = "10px monospace"; ctx.fillStyle = "rgba(57,255,136,0.55)";
  for (let i = 0; i < 8; i++) ctx.fillText(((i * 7 + (t >> 3)) % 2) ? "1" : "0", e.x + 8, e.y + ((i * 12 + t * 0.8) % 96));
} });
registerProp("lockIcon", { w: 24, h: 28, draw(e, ctx, t) {
  ctx.strokeStyle = "#39ff88"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(e.x + 12, e.y + 10, 6, Math.PI, 0); ctx.stroke();
  ctx.fillStyle = (t >> 5) % 2 ? "#39ff88" : "#1d6a3c"; ctx.fillRect(e.x + 4, e.y + 10, 16, 14);
} });
registerProp("packetStream", { w: 96, h: 16, draw(e, ctx, t) {
  ctx.fillStyle = "rgba(57,255,136,0.12)"; ctx.fillRect(e.x, e.y + 6, 96, 4);
  ctx.fillStyle = "#39ff88";
  for (let i = 0; i < 3; i++) ctx.fillRect(e.x + ((t * 1.5 + i * 32) % 96), e.y + 5, 6, 6);
} });

// ======================================================= World 3: pixel
registerProp("pixelTree", { w: 40, h: 64, draw(e, ctx) {
  ctx.fillStyle = "#ab5236"; ctx.fillRect(e.x + 16, e.y + 36, 8, 28);
  ctx.fillStyle = "#008751"; ctx.fillRect(e.x + 4, e.y + 12, 32, 24); ctx.fillRect(e.x + 10, e.y + 4, 20, 8);
  ctx.fillStyle = "#00e436"; ctx.fillRect(e.x + 8, e.y + 14, 8, 8);
} });
registerProp("torch", { w: 16, h: 40, draw(e, ctx, t) {
  ctx.fillStyle = "#5f574f"; ctx.fillRect(e.x + 6, e.y + 16, 4, 24);
  const f = (t >> 3) % 3;
  ctx.fillStyle = "#ffa300"; ctx.fillRect(e.x + 4, e.y + 8 - f, 8, 8 + f);
  ctx.fillStyle = "#ffec27"; ctx.fillRect(e.x + 6, e.y + 10 - f, 4, 4);
} });
registerProp("castleFlag", { w: 32, h: 64, draw(e, ctx, t) {
  ctx.fillStyle = "#c2c3c7"; ctx.fillRect(e.x + 2, e.y, 4, 64);
  const k = (t >> 4) % 2 ? 4 : 0;
  ctx.fillStyle = "#ff004d"; ctx.fillRect(e.x + 6, e.y + 4, 20, 8); ctx.fillRect(e.x + 6, e.y + 12, 16 + k, 8);
} });
registerProp("coinStack", { w: 24, h: 24, draw(e, ctx, t) {
  for (let i = 0; i < 3; i++) { ctx.fillStyle = i % 2 ? "#ffa300" : "#ffec27"; ctx.fillRect(e.x + 4, e.y + 16 - i * 6, 16, 6); }
  if ((t >> 4) % 6 === 0) { ctx.fillStyle = "#fff1e8"; ctx.fillRect(e.x + 16, e.y + 2, 4, 4); }
} });

// ======================================================= World 4: desktop (generic shapes)
registerProp("desktopIcon", { w: 36, h: 44, draw(e, ctx, t) {
  const folder = e.seed % 2 === 0;
  if (folder) { ctx.fillStyle = "#ffb300"; ctx.fillRect(e.x + 2, e.y + 8, 32, 22); ctx.fillRect(e.x + 2, e.y + 4, 12, 6); }
  else { ctx.fillStyle = "#f4f8fc"; ctx.fillRect(e.x + 8, e.y + 2, 20, 28); ctx.fillStyle = "#4fc3ff"; ctx.fillRect(e.x + 11, e.y + 9, 14, 2); ctx.fillRect(e.x + 11, e.y + 14, 10, 2); }
  ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fillRect(e.x + 4, e.y + 36, 28, 4);
} });
registerProp("stickyNote", { w: 28, h: 28, draw(e, ctx, t) {
  ctx.fillStyle = "#fff59d"; ctx.fillRect(e.x, e.y + Math.sin(t * 0.03) * 1, 28, 28);
  ctx.fillStyle = "#b8a840"; for (let i = 0; i < 3; i++) ctx.fillRect(e.x + 4, e.y + 7 + i * 6, 18 - i * 4, 2);
} });
registerProp("progressWin", { w: 72, h: 44, draw(e, ctx, t) {
  drawWindowFrame(ctx, e.x, e.y, 72, 40, { barH: 7 });
  const k = ((t * 0.004) + e.seed / 97) % 1;
  ctx.fillStyle = "#c9d3df"; ctx.fillRect(e.x + 8, e.y + 22, 56, 6);
  ctx.fillStyle = "#43a047"; ctx.fillRect(e.x + 8, e.y + 22, 56 * k, 6);
} });
registerProp("binCan", { w: 28, h: 36, draw(e, ctx, t) {
  ctx.fillStyle = "#90a4ae"; ctx.fillRect(e.x + 4, e.y + 6, 20, 30); ctx.fillRect(e.x + 2, e.y + 2, 24, 4);
  ctx.fillStyle = "#607d8b"; for (let i = 0; i < 3; i++) ctx.fillRect(e.x + 8 + i * 5, e.y + 10, 2, 22);
} });

// ======================================================= World 5: ruined city
registerProp("brokenCar", { w: 80, h: 36, draw(e, ctx, t) {
  ctx.fillStyle = "#4a3428"; ctx.fillRect(e.x + 4, e.y + 14, 72, 16); ctx.fillRect(e.x + 18, e.y + 2, 36, 14);
  ctx.fillStyle = "#2a1a14"; ctx.beginPath(); ctx.arc(e.x + 20, e.y + 30, 6, 0, 6.28); ctx.arc(e.x + 60, e.y + 30, 6, 0, 6.28); ctx.fill();
  ctx.fillStyle = "rgba(255,179,71,0.35)"; ctx.fillRect(e.x + 22, e.y + 5, 12, 8);
} });
registerProp("streetLamp", { w: 24, h: 96, draw(e, ctx, t) {
  ctx.fillStyle = "#3a302a"; ctx.fillRect(e.x + 10, e.y + 8, 4, 88); ctx.fillRect(e.x + 2, e.y + 6, 20, 4);
  const on = Math.sin(t * 0.3) > -0.7 || (t >> 2) % 9 === 0;
  ctx.fillStyle = on ? "#ffb347" : "#5a3a1a"; ctx.fillRect(e.x + 2, e.y + 10, 8, 4);
  if (on) U.glow(ctx, e.x + 6, e.y + 14, 30, "#ffb347", 0.4);
} });
registerProp("barrelFire", { w: 28, h: 48, draw(e, ctx, t) {
  ctx.fillStyle = "#5d3a1a"; ctx.fillRect(e.x + 2, e.y + 22, 24, 26);
  ctx.fillStyle = "#3a2a1a"; ctx.fillRect(e.x + 2, e.y + 28, 24, 3); ctx.fillRect(e.x + 2, e.y + 40, 24, 3);
  for (let i = 0; i < 4; i++) {
    const h = 8 + ((t * 3 + i * 17) % 12);
    ctx.fillStyle = i % 2 ? "#ff6a1a" : "#ffb347"; ctx.fillRect(e.x + 4 + i * 5, e.y + 22 - h, 5, h);
  }
} });
registerProp("rubblePile", { w: 56, h: 24, draw(e, ctx) {
  ctx.fillStyle = "#3a2c24";
  ctx.beginPath(); ctx.moveTo(e.x, e.y + 24); ctx.lineTo(e.x + 10, e.y + 8); ctx.lineTo(e.x + 24, e.y + 12); ctx.lineTo(e.x + 34, e.y); ctx.lineTo(e.x + 56, e.y + 24); ctx.fill();
  ctx.fillStyle = "#6e4a34"; ctx.fillRect(e.x + 18, e.y + 14, 8, 5); ctx.fillRect(e.x + 36, e.y + 10, 6, 4);
} });

// ======================================================= World 6: terminal / linux (generic shapes)
registerProp("crateStack", { w: 40, h: 56, draw(e, ctx) {
  for (const [dx, dy] of [[0, 28], [16, 28], [8, 0]]) {
    ctx.fillStyle = "#8f6a3e"; ctx.fillRect(e.x + dx, e.y + dy, 24, 28);
    ctx.fillStyle = "#d9c9a3"; ctx.fillRect(e.x + dx + 10, e.y + dy, 4, 28);
  }
} });
registerProp("cpuMonitor", { w: 56, h: 44, draw(e, ctx, t) {
  ctx.fillStyle = "#1e1e1e"; ctx.fillRect(e.x, e.y, 56, 36);
  ctx.strokeStyle = "#fcaf3e"; ctx.strokeRect(e.x + 0.5, e.y + 0.5, 55, 35);
  ctx.strokeStyle = "#8ae234"; ctx.beginPath();
  for (let i = 0; i < 12; i++) { const v = Math.sin((t * 0.05) + i * 0.8 + e.seed) * 9; i ? ctx.lineTo(e.x + 4 + i * 4, e.y + 18 + v) : ctx.moveTo(e.x + 4, e.y + 18 + v); }
  ctx.stroke();
  ctx.fillStyle = "#3a3a3a"; ctx.fillRect(e.x + 24, e.y + 36, 8, 8);
} });
registerProp("logScroll", { w: 64, h: 72, draw(e, ctx, t) {
  ctx.fillStyle = "rgba(20,20,20,0.7)"; ctx.fillRect(e.x, e.y, 64, 72);
  ctx.fillStyle = "rgba(211,215,207,0.5)";
  for (let i = 0; i < 9; i++) ctx.fillRect(e.x + 4, e.y + 4 + ((i * 8 + (t >> 2)) % 64), 8 + ((i * 17 + (t >> 6)) % 44), 2);
} });
registerProp("cronClock", { w: 32, h: 32, draw(e, ctx, t) {
  const cx = e.x + 16, cy = e.y + 16;
  ctx.strokeStyle = "#fcaf3e"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 13, 0, 6.28); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(t * 0.02) * 10, cy + Math.sin(t * 0.02) * 10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(t * 0.002) * 6, cy + Math.sin(t * 0.002) * 6); ctx.stroke();
} });

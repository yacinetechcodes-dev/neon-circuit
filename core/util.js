/* =========================================================================
 * core/util.js — shared constants and small helpers.
 * Everything in the game lives on plain globals (no modules) so the game
 * works when index.html is opened straight from disk (file://).
 * ========================================================================= */
"use strict";

const TILE = 32;          // tile size in pixels
const VIEW_W = 960;       // logical screen width
const VIEW_H = 540;       // logical screen height
const FPS = 60;           // fixed simulation rate

const U = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  rand: (a, b) => a + Math.random() * (b - a),
  randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  sign: (v) => (v > 0 ? 1 : v < 0 ? -1 : 0),
  /** Move v toward target by at most step. */
  approach(v, target, step) {
    return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
  },
  /** Axis-aligned rectangle overlap ({x,y,w,h}). */
  overlap: (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y,
  dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
  cx: (e) => e.x + e.w / 2,
  cy: (e) => e.y + e.h / 2,
  /** Evaluate a flag that may be a boolean or a function(e, world). */
  flag: (v, e, world) => (typeof v === "function" ? v(e, world) : v),

  /** Deterministic pseudo random generator (for backgrounds). */
  seeded(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return ((s >>> 0) % 100000) / 100000;
    };
  },

  hexToRgb(hex) {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  },
  rgba(hex, a) {
    const [r, g, b] = U.hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  },
  /** Mix two hex colours, t=0 → a, t=1 → b. Returns hex. */
  mix(a, b, t) {
    const A = U.hexToRgb(a), B = U.hexToRgb(b);
    const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
    return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  },

  /** Seconds → "m:ss.cc" */
  fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return `${m}:${s < 10 ? "0" : ""}${s.toFixed(2)}`;
  },

  // ---- Glow sprites ---------------------------------------------------
  // Real canvas shadowBlur is slow; instead we pre-render one soft radial
  // gradient per colour and stamp it with drawImage (additive blending).
  _glowCache: {},
  glowSprite(color) {
    let c = U._glowCache[color];
    if (c) return c;
    if (typeof document === "undefined") return null; // headless tests
    c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, U.rgba(color, 0.9));
    grd.addColorStop(0.25, U.rgba(color, 0.45));
    grd.addColorStop(1, U.rgba(color, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    U._glowCache[color] = c;
    return c;
  },
  /** Draw a glow of radius r centred at (x,y). ctx should be in world space. */
  glow(ctx, x, y, r, color, alpha = 1) {
    const s = U.glowSprite(color);
    if (!s) return;
    const prevA = ctx.globalAlpha, prevC = ctx.globalCompositeOperation;
    ctx.globalAlpha = prevA * alpha;
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = prevA;
    ctx.globalCompositeOperation = prevC;
  },

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },
};

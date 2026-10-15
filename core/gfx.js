/* =========================================================================
 * core/gfx.js — graphics quality, lights, hit-pause, the neon vector font
 * and shared drawing helpers.
 *
 *   Gfx.q                 current quality settings (see Gfx.LEVELS)
 *   Gfx.setQuality(name)  "high" | "medium" | "low" (saved in localStorage)
 *   Gfx.light(x, y, r, color, a)   add a light this frame (world pixels)
 *   Gfx.vtext(ctx, str, x, y, o)   neon stroke-font text (titles, banners)
 *   Gfx.panel(ctx, x, y, w, h, o)  chamfered neon panel
 *
 * Everything is drawn in code; nothing here loads files.
 * ========================================================================= */
"use strict";

const Gfx = {
  /** Per-quality settings. Every effect reads these, so a new effect only
   *  needs to look at Gfx.q to scale itself. */
  LEVELS: {
    high: { name: "HIGH", particles: 900, fx: 1, layers: 5, anim: 1, lights: 48, mask: true, glow: 1, dpr: 2, tileAnim: true, fg: true },
    medium: { name: "MEDIUM", particles: 480, fx: 0.65, layers: 4, anim: 0.6, lights: 24, mask: true, glow: 0.75, dpr: 1.5, tileAnim: true, fg: true },
    low: { name: "LOW", particles: 220, fx: 0.4, layers: 3, anim: 0.3, lights: 0, mask: false, glow: 0.45, dpr: 1, tileAnim: false, fg: false },
  },
  ORDER: ["high", "medium", "low"],
  quality: "high",
  q: null,
  lights: [],

  init() {
    const s = (typeof Save !== "undefined" && Save.data && Save.data.settings) || {};
    let qn = s.quality;
    if (!this.LEVELS[qn]) {
      const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
      qn = coarse ? "medium" : "high";
    }
    this.setQuality(qn, false);
  },
  setQuality(name, save = true) {
    this.quality = this.LEVELS[name] ? name : "high";
    this.q = this.LEVELS[this.quality];
    if (save && typeof Save !== "undefined" && Save.data) {
      Save.data.settings = Object.assign({}, Save.data.settings, { quality: this.quality });
      Save.write();
    }
  },
  cycleQuality() {
    const i = this.ORDER.indexOf(this.quality);
    this.setQuality(this.ORDER[(i + 1) % this.ORDER.length]);
    return this.q.name;
  },

  // ------------------------------------------------------------- lights
  /** Add a light for this frame (world pixels). Lights glow additively over
   *  the scene and cut holes in the theme's ambient darkness. */
  light(x, y, r, color, a = 1) {
    if (this.lights.length >= this.q.lights) return;
    this.lights.push({ x, y, r, color, a });
  },

  /** Additive "bloom" pass, world space (camera transform applied). */
  drawLights(ctx, cam) {
    if (!this.lights.length) return;
    const x0 = cam.x - 200, x1 = cam.x + VIEW_W + 200, y0 = cam.y - 200, y1 = cam.y + VIEW_H + 200;
    const k = 0.32 * this.q.glow;
    for (const L of this.lights) {
      if (L.x < x0 || L.x > x1 || L.y < y0 || L.y > y1) continue;
      U.glow(ctx, L.x, L.y, L.r, L.color, L.a * k);
    }
  },

  /** Ambient darkness with light holes, drawn at half resolution (screen space). */
  drawLightMask(ctx, cam, theme) {
    const L = theme.light || {};
    const amb = L.ambient == null ? 0.3 : L.ambient;
    if (!this.q.mask || amb <= 0 || typeof document === "undefined") return;
    const W = VIEW_W >> 1, H = VIEW_H >> 1;
    if (!this._mask) { this._mask = document.createElement("canvas"); this._mask.width = W; this._mask.height = H; }
    const m = this._mask, g = m.getContext("2d");
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, W, H);
    g.fillStyle = U.rgba(L.tint || "#02040c", amb);
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "destination-out";
    const hole = this._holeSprite();
    for (const l of this.lights) {
      const r = l.r * 1.25 * 0.5, x = (l.x - cam.x) * 0.5, y = (l.y - cam.y) * 0.5;
      if (x < -r || x > W + r || y < -r || y > H + r) continue;
      g.globalAlpha = Math.min(1, l.a);
      g.drawImage(hole, x - r, y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    ctx.drawImage(m, 0, 0, VIEW_W, VIEW_H);
  },
  _holeSprite() {
    if (this._hole) return this._hole;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.45, "rgba(255,255,255,0.6)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return (this._hole = c);
  },

  /** Soft dark corners, cached per size. */
  vignette(ctx, strength = 0.5) {
    if (typeof document === "undefined" || strength <= 0) return;
    if (!this._vig) {
      const c = document.createElement("canvas");
      c.width = 480; c.height = 270;
      const g = c.getContext("2d");
      const grd = g.createRadialGradient(240, 135, 90, 240, 135, 300);
      grd.addColorStop(0, "rgba(0,0,0,0)");
      grd.addColorStop(1, "rgba(0,0,0,1)");
      g.fillStyle = grd; g.fillRect(0, 0, 480, 270);
      this._vig = c;
    }
    ctx.globalAlpha = strength;
    ctx.drawImage(this._vig, 0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 1;
  },

  // ------------------------------------------------------------- helpers
  ease: {
    outCubic: (t) => 1 - Math.pow(1 - U.clamp(t, 0, 1), 3),
    inOutCubic: (t) => { t = U.clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outBack: (t) => { t = U.clamp(t, 0, 1); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  },

  /** Chamfered path (corners cut by c). */
  chamfer(ctx, x, y, w, h, c = 8) {
    ctx.beginPath();
    ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c); ctx.closePath();
  },

  /** Neon panel: dark glass, accent rim, a bright top edge and corner ticks.
   *  o: { accent, alpha, cut, glow (0..1), fill } */
  panel(ctx, x, y, w, h, o = {}) {
    const acc = o.accent || "#00f0ff", c = o.cut == null ? Math.min(10, h / 3) : o.cut;
    const a = o.alpha == null ? 0.78 : o.alpha;
    this.chamfer(ctx, x, y, w, h, c);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, `rgba(14,22,48,${a})`);
    g.addColorStop(1, `rgba(4,7,20,${a})`);
    ctx.fillStyle = o.fill || g;
    ctx.fill();
    if (o.glow) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = U.rgba(acc, 0.18 * o.glow);
      ctx.lineWidth = 6; ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = U.rgba(acc, o.rim == null ? 0.6 : o.rim);
    ctx.lineWidth = 1.5; ctx.stroke();
    // Top highlight and corner ticks.
    ctx.fillStyle = U.rgba("#ffffff", 0.07);
    ctx.fillRect(x + c, y + 2, w - c * 2, 1);
    ctx.fillStyle = acc;
    ctx.fillRect(x + c - 1, y - 1, Math.min(14, w / 4), 2);
    ctx.fillRect(x + w - c - Math.min(14, w / 4) + 1, y + h - 1, Math.min(14, w / 4), 2);
  },

  // ------------------------------------------------------- vector font
  // Glyphs are polylines on a 4×6 grid (y down). A zero-length segment draws
  // a dot (round caps). Unknown characters fall back to the canvas font.
  GLYPHS: {
    A: "0,6 0,2 2,0 4,2 4,6|0,4 4,4", B: "0,0 3,0 4,1 4,2 3,3 0,3|3,3 4,4 4,5 3,6 0,6 0,0",
    C: "4,0 1,0 0,1 0,5 1,6 4,6", D: "0,0 3,0 4,1 4,5 3,6 0,6 0,0", E: "4,0 0,0 0,6 4,6|0,3 3,3",
    F: "4,0 0,0 0,6|0,3 3,3", G: "4,1 4,0 1,0 0,1 0,5 1,6 4,6 4,3 2,3", H: "0,0 0,6|4,0 4,6|0,3 4,3",
    I: "1,0 3,0|2,0 2,6|1,6 3,6", J: "4,0 4,5 3,6 1,6 0,5", K: "0,0 0,6|4,0 1,3 0,3|1,3 4,6",
    L: "0,0 0,6 4,6", M: "0,6 0,0 2,3 4,0 4,6", N: "0,6 0,0 4,6 4,0", O: "1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0",
    P: "0,6 0,0 3,0 4,1 4,2 3,3 0,3", Q: "1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0|2,4 4,6",
    R: "0,6 0,0 3,0 4,1 4,2 3,3 0,3|2,3 4,6", S: "4,1 3,0 1,0 0,1 0,2 1,3 3,3 4,4 4,5 3,6 1,6 0,5",
    T: "0,0 4,0|2,0 2,6", U: "0,0 0,5 1,6 3,6 4,5 4,0", V: "0,0 2,6 4,0", W: "0,0 1,6 2,3 3,6 4,0",
    X: "0,0 4,6|4,0 0,6", Y: "0,0 2,3 4,0|2,3 2,6", Z: "0,0 4,0 0,6 4,6",
    0: "1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0|1,5 3,1", 1: "1,1 2,0 2,6|1,6 3,6", 2: "0,1 1,0 3,0 4,1 4,2 0,6 4,6",
    3: "0,1 1,0 3,0 4,1 4,2 3,3 1,3|3,3 4,4 4,5 3,6 1,6 0,5", 4: "3,6 3,0 0,4 4,4",
    5: "4,0 0,0 0,3 3,3 4,4 4,5 3,6 0,6", 6: "3,0 1,0 0,1 0,5 1,6 3,6 4,5 4,4 3,3 0,3", 7: "0,0 4,0 1,6",
    8: "1,0 3,0 4,1 4,2 3,3 1,3 0,2 0,1 1,0|1,3 0,4 0,5 1,6 3,6 4,5 4,4 3,3",
    9: "4,3 1,3 0,2 0,1 1,0 3,0 4,1 4,5 3,6 1,6",
    " ": "", ".": "2,6 2,6", ",": "2,5 1,7", "!": "2,0 2,4|2,6 2,6", "?": "0,1 1,0 3,0 4,1 4,2 2,3 2,4|2,6 2,6",
    "-": "1,3 3,3", ":": "2,1.5 2,1.5|2,4.5 2,4.5", "/": "4,0 0,6", "'": "2,0 2,1.5", "+": "2,1.5 2,4.5|0.5,3 3.5,3",
    "%": "0,6 4,0|0.5,0.5 0.5,0.5|3.5,5.5 3.5,5.5", "(": "3,0 1.5,1.5 1.5,4.5 3,6", ")": "1,0 2.5,1.5 2.5,4.5 1,6",
    "<": "4,0.5 0,3 4,5.5", ">": "0,0.5 4,3 0,5.5", "=": "0.5,2 3.5,2|0.5,4 3.5,4", "_": "0,6 4,6",
    "#": "1,0 1,6|3,0 3,6|0,2 4,2|0,4 4,4", "*": "2,1 2,5|0.5,2 3.5,4|3.5,2 0.5,4", "·": "2,3 2,3",
    "✓": "0,3 1.5,5 4,0", "◀": "4,0 0,3 4,6 4,0", "▶": "0,0 4,3 0,6 0,0", "…": "0,6 0,6|2,6 2,6|4,6 4,6",
    "&": "4,6 1,2 1,1 2,0 3,1 3,2 0,4 0,5 1,6 2,6 4,4",
  },
  _glyphs: null,
  _parse() {
    this._glyphs = {};
    for (const [k, v] of Object.entries(this.GLYPHS)) {
      this._glyphs[k] = v ? v.split("|").map((pl) => pl.trim().split(/\s+/).map((pt) => pt.split(",").map(Number))) : [];
    }
  },
  canVector(str) {
    if (!this._glyphs) this._parse();
    for (const ch of String(str).toUpperCase()) if (!this._glyphs[ch]) return false;
    return true;
  },
  /** Width of a vector string at a cap height. */
  vwidth(str, size, spacing = 2) {
    const u = size / 6;
    const n = [...String(str)].length;
    return n ? (n * (4 + spacing) - spacing) * u : 0;
  },
  _strokeText(g, str, x, y, u, spacing) {
    let cx = x;
    g.beginPath();
    for (const ch of String(str).toUpperCase()) {
      for (const pl of this._glyphs[ch] || []) {
        pl.forEach(([px, py], i) => {
          const X = cx + px * u, Y = y + py * u;
          if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
        });
        // A dot: nudge so the round caps always draw.
        if (pl.every(([px, py]) => px === pl[0][0] && py === pl[0][1])) g.lineTo(cx + pl[0][0] * u + 0.01, y + pl[0][1] * u);
      }
      cx += (4 + spacing) * u;
    }
    g.stroke();
  },
  _vcache: new Map(),
  /**
   * Neon stroke text. y is the BASELINE (like canvas text).
   * o: { size (cap height px), color, glow (colour), align, weight (stroke scale), spacing, core (inner colour) }
   */
  vtext(ctx, str, x, y, o = {}) {
    str = String(str);
    if (!this.canVector(str)) {
      // Fallback: regular canvas text in the same spirit.
      return UI.text(ctx, str, x, y, { size: Math.round((o.size || 16) * 1.35), align: o.align, color: o.color, glow: o.glow });
    }
    const size = o.size || 16, spacing = o.spacing == null ? 2 : o.spacing;
    const color = o.color || "#dff6ff", glow = o.glow || null, weight = o.weight || 1;
    const key = `${str}|${size}|${color}|${glow}|${weight}|${spacing}|${o.core || ""}`;
    let c = this._vcache.get(key);
    if (!c && typeof document !== "undefined") {
      const u = size / 6, lw = Math.max(1.5, size * 0.13 * weight), pad = Math.ceil(lw * 3 + (glow ? size * 0.35 : 0));
      c = document.createElement("canvas");
      c.width = Math.ceil(this.vwidth(str, size, spacing) + pad * 2);
      c.height = Math.ceil(size + u + pad * 2);
      const g = c.getContext("2d");
      g.lineCap = "round"; g.lineJoin = "round";
      if (glow) {
        g.strokeStyle = U.rgba(glow, 0.16); g.lineWidth = lw * 4.2; this._strokeText(g, str, pad, pad, u, spacing);
        g.strokeStyle = U.rgba(glow, 0.35); g.lineWidth = lw * 2.2; this._strokeText(g, str, pad, pad, u, spacing);
      }
      g.strokeStyle = color; g.lineWidth = lw; this._strokeText(g, str, pad, pad, u, spacing);
      if (o.core) { g.strokeStyle = o.core; g.lineWidth = Math.max(1, lw * 0.4); this._strokeText(g, str, pad, pad, u, spacing); }
      c._pad = pad;
      if (this._vcache.size > 260) this._vcache.delete(this._vcache.keys().next().value);
      this._vcache.set(key, c);
    }
    if (!c) return;
    const w = c.width - c._pad * 2;
    const dx = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    ctx.drawImage(c, Math.round(dx - c._pad), Math.round(y - size - c._pad));
  },
};

Gfx.q = Gfx.LEVELS.high;

/* -------------------------------------------------------------------------
 * Look: shared drawing kit for enemies, hazards and pickups, so every type
 * gets the same finish (gradient bodies, rim light, glowing cores, ground
 * shadows, clear attack telegraphs). No faces: robots have sensor cores.
 * ------------------------------------------------------------------------- */
const Look = {
  /** Soft contact shadow under something standing at (cx, by). */
  shadow(ctx, cx, by, w, a = 0.35) {
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.beginPath(); ctx.ellipse(cx, by, w / 2, Math.max(2, w / 9), 0, 0, 6.28); ctx.fill();
  },
  /** Vertical gradient fill for the current path, lit from above. */
  fill(ctx, y, h, base, light = 0.22, dark = 0.35) {
    if (!isFinite(y) || !isFinite(h) || h === 0) { ctx.fillStyle = base; ctx.fill(); return; }
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, U.mix(base, "#ffffff", light));
    g.addColorStop(0.5, base);
    g.addColorStop(1, U.mix(base, "#000000", dark));
    ctx.fillStyle = g;
    ctx.fill();
  },
  /** Rounded armour box: gradient, coloured rim, top highlight, panel seam. */
  box(ctx, x, y, w, h, r, base, rim, o = {}) {
    U.roundRect(ctx, x, y, w, h, r);
    this.fill(ctx, y, h, base, o.light, o.dark);
    ctx.strokeStyle = rim; ctx.lineWidth = o.lw || 2; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.16)"; ctx.fillRect(x + r, y + 2, w - r * 2, 1.5);
    if (o.seam !== false && h > 14) { ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x + 3, y + h * 0.6, w - 6, 1); }
  },
  /** Glowing sensor core: halo, pulsing ring, bright centre. */
  core(ctx, x, y, r, color, t = 0, hot = false) {
    const p = 0.5 + 0.5 * Math.sin(t * (hot ? 0.45 : 0.12));
    U.glow(ctx, x, y, r * (4 + p * 1.5), color, hot ? 0.9 : 0.65);
    ctx.fillStyle = U.mix(color, "#000000", 0.4);
    ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, 6.28); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.45, 0, 6.28); ctx.fill();
    if (hot) { ctx.strokeStyle = U.rgba(color, 0.6 * (1 - p)); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, r + 3 + p * 4, 0, 6.28); ctx.stroke(); }
  },
  /** Attack telegraph: a ring that closes in as k goes 0 → 1, plus a flicker. */
  telegraph(ctx, x, y, r, color, k) {
    k = U.clamp(k, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = U.rgba(color, 0.35 + k * 0.5); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r * (1.8 - k * 0.8), 0, 6.28); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
    U.glow(ctx, x, y, r * (1 + k), color, 0.3 + k * 0.6);
    ctx.restore();
  },
  /** A small bobbing "!" warning chevron above (x, y). */
  warn(ctx, x, y, color, t) {
    const b = Math.sin(t * 0.3) * 2;
    ctx.save();
    ctx.translate(x, y + b);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 2); ctx.lineTo(-6, 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#1a0a10"; ctx.fillRect(-1, -5, 2, 4); ctx.fillRect(-1, -0.5, 2, 1.5);
    U.glow(ctx, 0, -3, 14, color, 0.5);
    ctx.restore();
  },
  /** Flickering thruster flame pointing (dx, dy). */
  thruster(ctx, x, y, dx, dy, len, color, t) {
    const f = len * (0.75 + 0.25 * Math.sin(t * 1.3) + Math.random() * 0.15);
    const nx = -dy, ny = dx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = U.rgba(color, 0.75);
    ctx.beginPath(); ctx.moveTo(x + nx * 3, y + ny * 3); ctx.lineTo(x + dx * f, y + dy * f); ctx.lineTo(x - nx * 3, y - ny * 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath(); ctx.moveTo(x + nx * 1.4, y + ny * 1.4); ctx.lineTo(x + dx * f * 0.5, y + dy * f * 0.5); ctx.lineTo(x - nx * 1.4, y - ny * 1.4); ctx.closePath(); ctx.fill();
    U.glow(ctx, x + dx * f * 0.3, y + dy * f * 0.3, len, color, 0.5);
    ctx.restore();
  },
  /** Rivet / bolt head. */
  bolt(ctx, x, y, r = 1.6) {
    ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.beginPath(); ctx.arc(x + 0.5, y + 0.6, r, 0, 6.28); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
  },
  /** Comet-style projectile: tail along -velocity, glowing head. */
  comet(ctx, x, y, vx, vy, r, color, core = "#ffffff") {
    const sp = Math.hypot(vx, vy) || 1, tx = -vx / sp, ty = -vy / sp, L = r * 4 + sp * 2;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(x, y, x + tx * L, y + ty * L);
    g.addColorStop(0, U.rgba(color, 0.8)); g.addColorStop(1, U.rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x - ty * r, y + tx * r); ctx.lineTo(x + tx * L, y + ty * L); ctx.lineTo(x + ty * r, y - tx * r); ctx.closePath(); ctx.fill();
    U.glow(ctx, x, y, r * 3.5, color, 0.85);
    ctx.restore();
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
  },
  /** Faint aiming line (telegraphs a shot along angle a). */
  sight(ctx, x, y, a, len, color, k) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = U.rgba(color, 0.15 + 0.5 * k); ctx.lineWidth = 1 + k;
    ctx.setLineDash([6, 5]); ctx.lineDashOffset = -k * 30;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  },
};

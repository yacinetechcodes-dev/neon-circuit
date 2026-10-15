/* =========================================================================
 * core/background.js — layered, animated parallax backgrounds.
 *
 * A background is described by data (theme.bg), merged over a preset for the
 * theme's style. Every world gets the same quality just by naming a style and
 * its colours; a world file can override any part:
 *
 *   bg: {
 *     sky:    ["#top", "#middle", "#bottom"],          // gradient
 *     orb:    { kind: "sun"|"planet"|"core"|"moon", x: 0.7, y: 150, r: 70, color },
 *     rays:   { color, alpha, count },                // light shafts from above
 *     stars:  { count, color, pixel: false },
 *     layers: [ { type, depth, height, density, color, light, alpha } ... ],  // back → front
 *     fog:    { color, alpha },                       // haze between layers
 *     fg:     { type, color, alpha },                 // sparse silhouettes in front
 *     anim:   [ { type, ...params } ],                // moving elements
 *   }
 *
 * Layer types: skyline chips racks pillars trusses hexgrid code folders hills
 *   castles windows swoosh ruins scrap crates terminals mountains cables domes
 * Anim types: dataRain motes embers ash smoke clouds pixelClouds glitch scan
 *   packets shooting beams loader monitor
 * FG types: pillars cables pixels rubble frames
 *
 * Static layers are pre-rendered once to offscreen canvases (tileable 1024 px
 * strips); only the animated parts are drawn each frame, scaled by Gfx.q.
 * ========================================================================= */
"use strict";

class Background {
  constructor(theme, seed) {
    this.theme = theme;
    this.style = theme.style || "boot";
    this.seed = seed || 1;
    this.spec = Background.specFor(theme);
    this.levelH = VIEW_H;          // set by the world (vertical parallax)
    this.built = false;
    const R = U.seeded(this.seed * 9973 + 17);
    const sp = this.spec;
    this.stars = Array.from({ length: (sp.stars && sp.stars.count) || 0 }, () => ({ x: R() * 2000, y: R() * VIEW_H * 0.75, s: R() * 1.8 + 0.4, tw: R() * 6.28 }));
    this.anims = (sp.anim || []).map((a) => Background.initAnim(a, R, theme));
  }

  // ------------------------------------------------------------ spec
  static specFor(th) {
    const preset = (Background.PRESETS[th.style] || Background.PRESETS.boot)(th);
    const own = th.bg || {};
    return Object.assign({}, preset, own);
  }

  /** Colours shared by the builders. */
  static palette(th) {
    const a2 = th.accent2 || U.mix(th.accent, "#ff3df0", 0.55);
    return { top: th.bgTop, bottom: th.bgBottom, accent: th.accent, accent2: a2, grid: th.gridColor, dark: U.mix(th.bgTop, "#000000", 0.55) };
  }

  // ------------------------------------------------------------ build
  build() {
    this.built = true;
    if (typeof document === "undefined") return;
    const sp = this.spec, P = Background.palette(this.theme);
    // Sky (gradient + orb), baked once at screen size.
    this.sky = document.createElement("canvas");
    this.sky.width = VIEW_W; this.sky.height = VIEW_H;
    const g = this.sky.getContext("2d");
    const cols = sp.sky || [P.top, U.mix(P.top, P.bottom, 0.55), P.bottom];
    const grd = g.createLinearGradient(0, 0, 0, VIEW_H);
    cols.forEach((c, i) => grd.addColorStop(i / (cols.length - 1), c));
    g.fillStyle = grd; g.fillRect(0, 0, VIEW_W, VIEW_H);
    // Subtle dither noise so big gradients don't band.
    const R = U.seeded(this.seed * 31 + 5);
    g.fillStyle = "rgba(255,255,255,0.018)";
    for (let i = 0; i < 900; i++) g.fillRect(R() * VIEW_W, R() * VIEW_H, 1, 1);
    if (sp.orb && sp.orb.kind !== "none") Background.drawOrb(g, sp.orb, P);
    // Light rays.
    if (sp.rays) {
      this.rays = document.createElement("canvas");
      this.rays.width = VIEW_W; this.rays.height = VIEW_H;
      const rg = this.rays.getContext("2d");
      const n = sp.rays.count || 5, col = sp.rays.color || "#ffffff";
      for (let i = 0; i < n; i++) {
        const x0 = (sp.rays.x != null ? sp.rays.x * VIEW_W : VIEW_W * 0.65) + (R() - 0.5) * 360, w = 30 + R() * 90, lean = -180 - R() * 160;
        const lg = rg.createLinearGradient(0, 0, 0, VIEW_H);
        lg.addColorStop(0, U.rgba(col, 0.55)); lg.addColorStop(1, U.rgba(col, 0));
        rg.fillStyle = lg;
        rg.beginPath(); rg.moveTo(x0, -10); rg.lineTo(x0 + w, -10); rg.lineTo(x0 + w + lean, VIEW_H); rg.lineTo(x0 + lean - w * 0.6, VIEW_H); rg.closePath(); rg.fill();
      }
    }
    // Parallax layers (quality decides how many).
    let defs = (sp.layers || []).slice();
    while (defs.length > Gfx.q.layers && defs.length > 2) defs.splice(1, 1);
    const n = defs.length;
    this.layers = defs.map((d, i) => this.buildLayer(d, i, n, P));
    if (sp.fg && Gfx.q.fg) this.fg = this.buildFg(sp.fg, P);
    this.builtQuality = Gfx.quality;
  }

  buildLayer(d, i, n, P) {
    const far = n > 1 ? i / (n - 1) : 1;            // 0 = farthest, 1 = nearest
    const res = far < 0.3 ? 0.5 : 1;                  // far layers at half resolution
    const W = 1024, H = Math.round((d.height || 0.6) * VIEW_H + 40);
    const c = document.createElement("canvas");
    c.width = Math.round(W * res); c.height = Math.round(H * res);
    const g = c.getContext("2d");
    g.scale(res, res);
    const L = {
      W, H, far,
      // Atmospheric perspective: far layers melt into the sky, near ones are dark
      // silhouettes with a faint rim, so the background never reads as terrain.
      base: d.color || U.mix(U.mix(P.bottom, P.top, 0.25), P.dark, 0.3 + far * 0.6),
      rim: U.rgba(d.rim || P.accent, 0.1 + far * 0.14),
      light: d.light || P.accent, light2: d.light2 || P.accent2,
      accent: P.accent, accent2: P.accent2, grid: P.grid, density: d.density || 1,
      lights: [],
    };
    const R = U.seeded(this.seed * 131 + i * 977 + (d.type || "").length * 13);
    const fn = Background.LAYERS[d.type] || Background.LAYERS.skyline;
    fn(g, L, R, d);
    return { canvas: c, depth: d.depth == null ? 0.08 + far * 0.4 : d.depth, H, alpha: d.alpha == null ? 1 : d.alpha, lights: L.lights.slice(0, 40), fogAfter: d.fog !== false };
  }

  buildFg(d, P) {
    const W = 2048, H = VIEW_H;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    const R = U.seeded(this.seed * 71 + 3);
    const col = d.color || U.mix(P.top, "#000000", 0.7), acc = U.rgba(d.accent || P.accent, 0.35);
    (Background.FG[d.type] || Background.FG.pillars)(g, W, H, R, col, acc);
    return { canvas: c, depth: d.depth || 1.35, alpha: d.alpha == null ? 0.9 : d.alpha };
  }

  // ------------------------------------------------------------ draw
  /** Vertical parallax: 0 when the camera is at the bottom of the level. */
  lift(cam, depth) {
    const span = Math.max(1, this.levelH - VIEW_H);
    const f = U.clamp(cam.y / span, 0, 1);
    return (1 - f) * Math.min(260, span * 0.35) * depth * 1.6;
  }

  draw(ctx, cam, time) {
    if (!this.built || this.builtQuality !== Gfx.quality) this.build();
    const sp = this.spec, th = this.theme;
    if (!this.sky) { ctx.fillStyle = th.bgBottom; ctx.fillRect(0, 0, VIEW_W, VIEW_H); return; }
    ctx.drawImage(this.sky, 0, 0);
    this.drawStars(ctx, cam, time);
    if (this.rays) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = (sp.rays.alpha || 0.12) * (0.75 + 0.25 * Math.sin(time * 0.012));
      ctx.drawImage(this.rays, -((cam.x * 0.03) % 120), 0);
      ctx.restore();
    }
    // Anims that live behind every layer (clouds, beams, shooting stars).
    for (const a of this.anims) if (a.behind) Background.ANIMS[a.type].draw(ctx, a, cam, time, this);
    const fog = sp.fog;
    this.layers.forEach((L, i) => {
      const ox = cam.x * L.depth, w = 1024;
      const y = VIEW_H - L.H + Math.round(this.lift(cam, L.depth));
      if (y >= VIEW_H) return;
      ctx.globalAlpha = L.alpha;
      let x = -(((ox % w) + w) % w);
      for (; x < VIEW_W; x += w) ctx.drawImage(L.canvas, Math.round(x), y, w, L.H);
      ctx.globalAlpha = 1;
      // Blinking / flickering lights on this layer.
      if (L.lights.length && Gfx.q.anim > 0.3) this.drawLayerLights(ctx, L, ox, y, time);
      // Haze between layers (atmospheric depth).
      if (fog && L.fogAfter && i < this.layers.length - 1) {
        const fy = y + L.H * 0.35;
        const fg = ctx.createLinearGradient(0, fy, 0, VIEW_H);
        fg.addColorStop(0, U.rgba(fog.color || th.bgBottom, 0));
        fg.addColorStop(1, U.rgba(fog.color || th.bgBottom, (fog.alpha || 0.25)));
        ctx.fillStyle = fg; ctx.fillRect(0, fy, VIEW_W, VIEW_H - fy);
      }
    });
    for (const a of this.anims) if (!a.behind) Background.ANIMS[a.type].draw(ctx, a, cam, time, this);
  }

  drawLayerLights(ctx, L, ox, y, time) {
    const w = 1024;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const l of L.lights) {
      let on;
      if (l.kind === "blink") on = ((time + l.ph * 60) % (l.rate || 90)) < 10 ? 1 : 0;
      else if (l.kind === "flicker") on = Math.sin(time * 0.05 + l.ph) > -0.6 ? (Math.random() < 0.97 ? 1 : 0.2) : 0.25;
      else on = 0.55 + 0.45 * Math.sin(time * 0.05 + l.ph * 6);
      if (on <= 0.05) continue;
      let x = l.x - (((ox % w) + w) % w);
      for (let k = 0; k < 2; k++, x += w) {
        if (x < -30 || x > VIEW_W + 30) continue;
        ctx.globalAlpha = on;
        ctx.fillStyle = l.color;
        ctx.fillRect(x - l.s / 2, y + l.y - l.s / 2, l.s, l.s);
        if (Gfx.q.glow > 0.5) U.glow(ctx, x, y + l.y, l.s * 5, l.color, on * 0.7);
      }
    }
    ctx.restore();
  }

  drawStars(ctx, cam, time) {
    const st = this.spec.stars;
    if (!st || !this.stars.length) return;
    const n = Math.round(this.stars.length * Math.max(0.4, Gfx.q.anim));
    ctx.fillStyle = st.color || "#ffffff";
    const lift = this.lift(cam, 0.03);
    for (let i = 0; i < n; i++) {
      const s = this.stars[i];
      const x = ((s.x - cam.x * 0.02) % 2000 + 2000) % 2000 - 500;
      if (x < -5 || x > VIEW_W + 5) continue;
      const tw = Math.sin(time * 0.03 + s.tw);
      if (st.pixel) {
        ctx.globalAlpha = tw > 0.6 ? 0.85 : 0.35;
        const z = s.s > 1.4 ? 4 : 2;
        ctx.fillRect(Math.round(x / 2) * 2, Math.round((s.y + lift) / 2) * 2, z, z);
        continue;
      }
      ctx.globalAlpha = 0.3 + 0.3 * tw;
      ctx.fillRect(x, s.y + lift, s.s, s.s);
      if (s.s > 1.9 && tw > 0.7) { ctx.fillRect(x - 2, s.y + lift + s.s / 2 - 0.5, s.s + 4, 1); ctx.fillRect(x + s.s / 2 - 0.5, s.y + lift - 2, 1, s.s + 4); }
    }
    ctx.globalAlpha = 1;
  }

  /** Foreground silhouettes, drawn over the scene (screen space). */
  drawFg(ctx, cam) {
    if (!this.fg || !Gfx.q.fg) return;
    const w = this.fg.canvas.width, ox = cam.x * this.fg.depth;
    ctx.globalAlpha = this.fg.alpha;
    let x = -(((ox % w) + w) % w);
    for (; x < VIEW_W; x += w) ctx.drawImage(this.fg.canvas, Math.round(x), 0);
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ orb
  static drawOrb(g, o, P) {
    const x = (o.x == null ? 0.7 : o.x) * VIEW_W, y = o.y || 140, r = o.r || 70, col = o.color || P.accent;
    const halo = g.createRadialGradient(x, y, r * 0.5, x, y, r * 3.2);
    halo.addColorStop(0, U.rgba(col, 0.35)); halo.addColorStop(1, U.rgba(col, 0));
    g.fillStyle = halo; g.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
    switch (o.kind) {
      case "sun": {
        const b = g.createRadialGradient(x, y - r * 0.2, r * 0.1, x, y, r);
        b.addColorStop(0, U.mix(col, "#ffffff", 0.75)); b.addColorStop(1, col);
        g.fillStyle = b; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
        // Haze bands across the sun.
        g.fillStyle = U.rgba(P.top, 0.25);
        for (let k = 0; k < 4; k++) g.fillRect(x - r, y + r * (0.15 + k * 0.2), r * 2, r * 0.06 + k);
        break;
      }
      case "planet": {
        const b = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
        b.addColorStop(0, U.mix(col, "#ffffff", 0.35)); b.addColorStop(0.7, col); b.addColorStop(1, U.mix(col, P.top, 0.7));
        g.fillStyle = b; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
        g.save(); g.beginPath(); g.arc(x, y, r, 0, 6.28); g.clip();
        g.fillStyle = U.rgba(P.top, 0.18);
        for (let k = -3; k <= 3; k++) g.fillRect(x - r, y + k * r * 0.22, r * 2, r * 0.07);
        g.restore();
        g.strokeStyle = U.rgba(U.mix(col, "#ffffff", 0.4), 0.5); g.lineWidth = 3;
        g.beginPath(); g.ellipse(x, y, r * 1.75, r * 0.32, -0.3, 0, 6.28); g.stroke();
        g.strokeStyle = U.rgba(col, 0.25); g.lineWidth = 8;
        g.beginPath(); g.ellipse(x, y, r * 1.6, r * 0.27, -0.3, 0, 6.28); g.stroke();
        break;
      }
      case "moon": {
        g.fillStyle = U.mix(col, "#ffffff", 0.6); g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
        g.fillStyle = U.rgba(P.top, 0.18);
        for (const [dx, dy, rr] of [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.16], [0.05, 0.45, 0.12]]) { g.beginPath(); g.arc(x + dx * r, y + dy * r, rr * r, 0, 6.28); g.fill(); }
        break;
      }
      case "pixelSun": {
        const s = 8;
        g.fillStyle = col;
        for (let yy = -r; yy <= r; yy += s) for (let xx = -r; xx <= r; xx += s) if (xx * xx + yy * yy <= r * r) g.fillRect(Math.round((x + xx) / s) * s, Math.round((y + yy) / s) * s, s, s);
        g.fillStyle = U.rgba(P.top, 0.3);
        for (let k = 0; k < 4; k++) g.fillRect(x - r, y + k * s * 1.5 + s, r * 2 + s, s / 2);
        break;
      }
      default: { // "core": a glowing reactor with rings
        const b = g.createRadialGradient(x, y, 0, x, y, r);
        b.addColorStop(0, "#ffffff"); b.addColorStop(0.25, U.mix(col, "#ffffff", 0.5)); b.addColorStop(1, U.rgba(col, 0));
        g.fillStyle = b; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
        g.strokeStyle = U.rgba(col, 0.35); g.lineWidth = 2;
        for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(x, y, r * (0.6 + k * 0.35), 0, 6.28); g.stroke(); }
      }
    }
  }

  // ------------------------------------------------------------ anims
  static initAnim(a, R, th) {
    const s = Object.assign({ behind: ["clouds", "pixelClouds", "beams", "shooting", "packets"].includes(a.type) }, a);
    const n = Math.round(a.count || 0);
    s.items = [];
    const P = Background.palette(th);
    s.color = a.color || P.accent;
    switch (a.type) {
      case "dataRain": for (let i = 0; i < (n || 26); i++) s.items.push({ x: R() * 1400, sp: R() * 2 + 1, len: Math.floor(R() * 10 + 6), off: R() * 600 }); break;
      case "motes": case "embers": case "ash":
        for (let i = 0; i < (n || 36); i++) s.items.push({ x: R() * VIEW_W, y: R() * VIEW_H, s: R() * 2 + 1, v: R() * 0.4 + 0.15, ph: R() * 6.28 }); break;
      case "clouds": case "pixelClouds":
        for (let i = 0; i < (n || 7); i++) s.items.push({ x: R() * 1600, y: 30 + R() * (a.band || 200), w: 120 + R() * 220, h: 24 + R() * 30, v: 0.08 + R() * 0.2, d: 0.03 + R() * 0.06 }); break;
      case "smoke": for (let i = 0; i < (n || 5); i++) s.items.push({ i, y: 80 + i * 90, ph: R() * 6 }); break;
      case "packets": for (let i = 0; i < (n || 10); i++) s.items.push({ y: 0.45 + R() * 0.5, x: R() * 1400, v: 2 + R() * 4, len: 20 + R() * 50 }); break;
      case "beams": for (let i = 0; i < (n || 3); i++) s.items.push({ x: 0.15 + R() * 0.7, ph: R() * 6.28, sp: 0.004 + R() * 0.006 }); break;
      default: break;
    }
    return s;
  }
}

// =========================================================================
// Layer builders: draw a tileable 1024-wide strip, silhouettes rising from
// the bottom. L = { W, H, far, base, rim, light, light2, accent, accent2, grid,
// density, lights[] }. Push dynamic lights as { x, y, s, color, kind, ph, rate }.
// =========================================================================
/** Draw a shape that may cross the strip's seam: fn(X, r) runs at x and at
 *  x ± W with the same random stream r, so both copies match exactly. */
Background.wrap = (L, x, w, fn, R) => {
  const seed = Math.floor((R ? R() : 0.5) * 1e9) + 1;
  const run = (X) => fn(X, U.seeded(seed));
  run(x); if (x + w > L.W) run(x - L.W); if (x < 0) run(x + L.W);
};
Background.light = (L, x, y, s, color, kind, R, rate) => {
  if (L.lights.length >= 40) return;
  const lx = ((x % L.W) + L.W) % L.W;
  L.lights.push({ x: lx, y, s, color, kind, ph: R(), rate });
};
Background.windows = (g, L, R, x, y, w, h, o = {}) => {
  const cw = o.cw || 5, ch = o.ch || 7, gx = o.gx || 9, gy = o.gy || 12;
  for (let yy = y + 8; yy < y + h - 10; yy += gy) {
    const lit = R() < 0.25;
    for (let xx = x + 6; xx < x + w - 8; xx += gx) {
      const r = R();
      if (r < (lit ? 0.75 : 0.18)) {
        g.fillStyle = U.rgba(R() < 0.8 ? L.light : L.light2, 0.1 + L.far * 0.22 * R());
        g.fillRect(xx, yy, cw, ch);
      }
    }
  }
};

Background.LAYERS = {
  /** City towers with setbacks, antennas, lit windows and abstract neon signs. */
  skyline(g, L, R) {
    const H = L.H;
    for (let x = -30; x < L.W;) {
      const w = (36 + R() * 80) * (1 / Math.sqrt(L.density)), h = H * (0.3 + R() * 0.62);
      const top = H - h;
      Background.wrap(L, x, w + 20, (X, r) => {
        g.fillStyle = L.base;
        g.fillRect(X, top, w, h);
        if (r() < 0.5) { const sw = w * (0.4 + r() * 0.3); g.fillRect(X + (w - sw) / 2, top - h * 0.12, sw, h * 0.12 + 1); }
        // Rim light on the top and the lit side.
        g.fillStyle = L.rim; g.fillRect(X, top, w, 2); g.fillRect(X, top, 2, h);
        // Vertical panel seams.
        g.fillStyle = "rgba(0,0,0,0.18)";
        for (let k = X + 12; k < X + w - 4; k += 18) g.fillRect(k, top + 4, 1, h);
        Background.windows(g, L, r, X, top, w, h);
      }, R);
      if (R() < 0.45) {
        const ax = x + w / 2, ah = 16 + R() * 40;
        Background.wrap(L, ax - 2, 4, (X) => { g.fillStyle = L.base; g.fillRect(X + 1, top - h * 0.12 - ah, 2, ah); }, R);
        Background.light(L, ax, top - h * 0.12 - ah, 3, R() < 0.5 ? "#ff3355" : L.light, "blink", R, 70 + Math.floor(R() * 80));
      }
      if (R() < 0.18 && L.far > 0.3) {
        // Abstract neon sign: a framed bar with a chevron (no text or logos).
        const sx = x + w * 0.2, sy = top + 20 + R() * Math.max(10, h * 0.3), sw = 18 + R() * 20;
        Background.wrap(L, sx, sw, (X) => {
          g.strokeStyle = U.rgba(L.light2, 0.8); g.lineWidth = 2; g.strokeRect(X, sy, sw, 10);
          g.beginPath(); g.moveTo(X + 4, sy + 2); g.lineTo(X + 8, sy + 5); g.lineTo(X + 4, sy + 8); g.stroke();
        }, R);
        Background.light(L, sx + sw / 2, sy + 5, 4, L.light2, "flicker", R);
      }
      x += w + 6 + R() * 26;
    }
  },

  /** Motherboard chips on a board: big packages, pins, capacitors, traces. */
  chips(g, L, R) {
    const H = L.H, floor = H - 30;
    g.fillStyle = L.base; g.fillRect(0, floor, L.W, 30);
    g.strokeStyle = L.rim; g.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      let x = R() * L.W, y = floor + 8 + R() * 16;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 3; k++) { x += (R() - 0.3) * 120; g.lineTo(x, y); y = floor + 6 + R() * 18; g.lineTo(x, y); }
      g.stroke();
    }
    for (let x = 10; x < L.W;) {
      const w = 60 + R() * 110, h = 40 + R() * H * 0.55, top = floor - h;
      Background.wrap(L, x, w, (X) => {
        g.fillStyle = L.base; g.fillRect(X, top, w, h);
        g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(X + 4, top + 4, w - 8, h * 0.35);
        g.fillStyle = L.rim; g.fillRect(X, top, w, 2);
        // Pins along both sides.
        g.fillStyle = U.mix(L.base, "#ffffff", 0.12);
        for (let y = top + 8; y < floor - 6; y += 8) { g.fillRect(X - 4, y, 4, 3); g.fillRect(X + w, y, 4, 3); }
        // Orientation dot.
        g.fillStyle = U.rgba(L.light, 0.35); g.beginPath(); g.arc(X + 10, top + 10, 3, 0, 6.28); g.fill();
      }, R);
      Background.light(L, x + w - 10, top + 10, 3, R() < 0.6 ? L.light : "#7dff4a", "pulse", R);
      // Capacitors.
      const cx = x + w + 14;
      if (R() < 0.7) Background.wrap(L, cx, 14, (X, r) => {
        const ch = 18 + r() * 26;
        g.fillStyle = U.mix(L.base, L.grid, 0.4); g.fillRect(X, floor - ch, 14, ch);
        g.fillStyle = L.rim; g.fillRect(X, floor - ch, 14, 2);
        g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(X + 9, floor - ch + 3, 3, ch - 4);
      }, R);
      x += w + 40 + R() * 60;
    }
  },

  /** Server racks: frames, units, vents, hanging cable bundles, LEDs. */
  racks(g, L, R) {
    const H = L.H;
    const step = 112 / Math.sqrt(L.density);
    for (let x = 0; x < L.W; x += step) {
      const w = 84, h = H * (0.55 + R() * 0.4), top = H - h;
      g.fillStyle = L.base; g.fillRect(x + 10, top, w, h);
      g.fillStyle = L.rim; g.fillRect(x + 10, top, w, 2); g.fillRect(x + 10, top, 2, h); g.fillRect(x + 10 + w - 2, top, 2, h);
      for (let y = top + 10; y < H - 12; y += 16) {
        g.fillStyle = U.mix(L.base, "#000000", 0.35); g.fillRect(x + 16, y, w - 12, 12);
        g.fillStyle = "rgba(255,255,255,0.05)";
        for (let k = 0; k < 6; k++) g.fillRect(x + 40 + k * 6, y + 3, 3, 6);
        g.fillStyle = U.rgba(R() < 0.5 ? L.light : "#ff9d00", 0.35); g.fillRect(x + 20, y + 4, 3, 3);
        if (R() < 0.12) Background.light(L, x + 24, y + 5.5, 3, R() < 0.5 ? L.light : "#7dff4a", "blink", R, 30 + Math.floor(R() * 60));
      }
      // Cable bundle to the next rack.
      g.strokeStyle = U.mix(L.base, "#000000", 0.4); g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + 94, top + 20); g.quadraticCurveTo(x + 112, top + 70 + R() * 50, x + 126, top + 30); g.stroke();
    }
  },

  /** Translucent data pillars with glowing caps and banded light. */
  pillars(g, L, R) {
    const H = L.H;
    for (let x = 0; x < L.W; x += 48 / Math.sqrt(L.density)) {
      const h = H * (0.3 + R() * 0.68), w = 16 + R() * 22;
      const grd = g.createLinearGradient(0, H - h, 0, H);
      grd.addColorStop(0, U.rgba(L.light, 0.05 + L.far * 0.1)); grd.addColorStop(1, U.rgba(L.light, 0.22 + L.far * 0.15));
      g.fillStyle = grd; g.fillRect(x, H - h, w, h);
      g.fillStyle = U.rgba(L.light, 0.55); g.fillRect(x, H - h, w, 2);
      g.fillStyle = U.rgba("#ffffff", 0.06);
      for (let y = H - h + 10; y < H; y += 14 + R() * 20) g.fillRect(x + 2, y, w - 4, 2);
      if (R() < 0.4) Background.light(L, x + w / 2, H - h, 3, L.light, "pulse", R);
    }
  },

  /** Space-station trusses with modules, solar panels and beacons. */
  trusses(g, L, R) {
    const H = L.H;
    for (let x = 0; x < L.W; x += 256) {
      const y = H * (0.25 + R() * 0.45);
      g.strokeStyle = L.base; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 256, y); g.moveTo(x, y + 26); g.lineTo(x + 256, y + 26); g.stroke();
      g.lineWidth = 2;
      for (let k = 0; k < 256; k += 32) { g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k + 32, y + 26); g.moveTo(x + k + 32, y); g.lineTo(x + k, y + 26); g.stroke(); }
      g.fillStyle = L.rim; g.fillRect(x, y - 1, 256, 1);
      // Module (cylinder) with windows.
      const mx = x + 60 + R() * 100, mw = 70 + R() * 40;
      g.fillStyle = L.base; U.roundRect(g, mx, y - 18, mw, 62, 14); g.fill();
      g.fillStyle = L.rim; g.fillRect(mx + 10, y - 18, mw - 20, 2);
      for (let k = mx + 14; k < mx + mw - 12; k += 14) { g.fillStyle = U.rgba(L.light, 0.35 + R() * 0.3); g.fillRect(k, y + 6, 6, 6); }
      // Solar panel wing.
      const px = x + (R() < 0.5 ? 10 : 180), py = y - 90 - R() * 40;
      g.strokeStyle = L.base; g.beginPath(); g.moveTo(px + 30, py + 60); g.lineTo(px + 30, y); g.stroke();
      g.fillStyle = U.mix(L.base, L.grid, 0.5); g.fillRect(px, py, 60, 60);
      g.strokeStyle = U.rgba(L.light, 0.22); g.lineWidth = 1;
      for (let k = 0; k <= 60; k += 12) { g.beginPath(); g.moveTo(px + k, py); g.lineTo(px + k, py + 60); g.moveTo(px, py + k); g.lineTo(px + 60, py + k); g.stroke(); }
      Background.light(L, mx + mw, y + 12, 3, "#ff3355", "blink", R, 80);
    }
  },

  /** Monoliths covered in a hex lattice with glowing seams. */
  hexgrid(g, L, R) {
    const H = L.H, s = 14;
    for (let x = 0; x < L.W;) {
      const w = 90 + R() * 120, h = H * (0.4 + R() * 0.55), top = H - h;
      Background.wrap(L, x, w, (X, rr) => {
        g.fillStyle = L.base;
        g.beginPath(); g.moveTo(X, H); g.lineTo(X, top + 20); g.lineTo(X + 20, top); g.lineTo(X + w - 20, top); g.lineTo(X + w, top + 20); g.lineTo(X + w, H); g.fill();
        g.save(); g.clip();
        g.strokeStyle = U.rgba(L.light, 0.08 + L.far * 0.12); g.lineWidth = 1;
        for (let y = top; y < H + s; y += s * 1.5) for (let xx = X; xx < X + w + s; xx += s * Math.sqrt(3)) {
          const ox = (Math.round((y - top) / (s * 1.5)) % 2) * (s * Math.sqrt(3)) / 2;
          g.beginPath();
          for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i + Math.PI / 6; const px = xx + ox + Math.cos(a) * s * 0.9, py = y + Math.sin(a) * s * 0.9; i ? g.lineTo(px, py) : g.moveTo(px, py); }
          g.closePath(); g.stroke();
          if (rr() < 0.04) { g.fillStyle = U.rgba(L.light, 0.12); g.fill(); }
        }
        g.restore();
        g.fillStyle = L.rim; g.fillRect(X + 20, top, w - 40, 2);
        g.fillStyle = U.rgba(L.light, 0.25 + L.far * 0.3); g.fillRect(X + w / 2 - 1, top + 30, 2, h - 30);
      }, R);
      Background.light(L, x + w / 2, top + 30, 4, L.light, "pulse", R);
      x += w + 30 + R() * 50;
    }
  },

  /** Tall panels of dim monospace text (terminal walls). */
  code(g, L, R) {
    const H = L.H;
    const chars = "0123456789ABCDEF{}[]<>/$#=+;:._-|";
    g.font = "11px monospace";
    for (let x = 0; x < L.W;) {
      const w = 110 + R() * 90, h = H * (0.4 + R() * 0.55), top = H - h;
      g.fillStyle = L.base; g.fillRect(x, top, w, h);
      g.fillStyle = L.rim; g.fillRect(x, top, w, 2);
      g.fillStyle = U.rgba(L.light, 0.16 + L.far * 0.2);
      for (let y = top + 16; y < H - 4; y += 13) {
        let line = "", n = Math.floor((w - 12) / 7 * (0.3 + R() * 0.7));
        for (let k = 0; k < n; k++) line += chars[Math.floor(R() * chars.length)];
        g.fillText(line, x + 6, y);
      }
      Background.light(L, x + 10, top + 8, 3, L.light, "blink", R, 40);
      x += w + 20 + R() * 40;
    }
  },

  /** Directory-tree silhouettes: folder tabs on branches. */
  folders(g, L, R) {
    const H = L.H;
    g.font = "11px monospace";
    const names = ["/root", "/sys", "/bin", "/etc", "/var/log", "/dev", "/proc", "/usr/lib", "/tmp"];
    for (let x = 20; x < L.W; x += 170) {
      const y = H * (0.15 + R() * 0.3);
      g.fillStyle = U.rgba(L.light, 0.3); g.fillText(names[Math.floor(R() * names.length)], x, y);
      g.strokeStyle = L.base; g.lineWidth = 2;
      const n = 4 + Math.floor(R() * 4);
      for (let k = 0; k < n; k++) {
        const yy = y + 18 + k * 34;
        if (yy > H - 20) break;
        g.beginPath(); g.moveTo(x + 4, y + 6); g.lineTo(x + 4, yy + 8); g.lineTo(x + 18, yy + 8); g.stroke();
        g.fillStyle = L.base; g.fillRect(x + 20, yy, 26, 16); g.fillRect(x + 20, yy - 4, 11, 5);
        g.fillStyle = L.rim; g.fillRect(x + 20, yy, 26, 1);
        g.fillStyle = U.rgba(L.light, 0.12 + R() * 0.12); g.fillRect(x + 50, yy + 5, 30 + R() * 50, 5);
        if (R() < 0.15) Background.light(L, x + 33, yy + 8, 3, L.light, "blink", R, 60);
      }
    }
  },

  /** Stepped 8-bit hills with lighter crests and dither bands. */
  hills(g, L, R, d) {
    const H = L.H, P8 = 8, amp = d.amp || 1;
    const snap = (v) => Math.round(v / P8) * P8;
    const ph = R() * 10, f1 = 0.006 + R() * 0.006;
    for (let x = 0; x < L.W; x += P8) {
      // Periodic over the strip width so it tiles.
      const t = (x / L.W) * Math.PI * 2;
      const hgt = snap(H * 0.35 * amp + Math.sin(t * 3 + ph) * H * 0.12 * amp + Math.sin(t * 7 + ph * 2) * H * 0.05 * amp);
      g.fillStyle = L.base; g.fillRect(x, H - hgt, P8, hgt);
      g.fillStyle = U.mix(L.base, "#ffffff", 0.12 + L.far * 0.1); g.fillRect(x, H - hgt, P8, P8);
      g.fillStyle = U.mix(L.base, "#000000", 0.18);
      for (let y = H - hgt + 24; y < H; y += 16) if (((x / P8) + (y / 8)) % 2 === 0) g.fillRect(x, y, P8 / 2, P8 / 2);
      if (R() < 0.03) { g.fillStyle = U.mix(L.base, L.light, 0.5); g.fillRect(x, H - hgt - P8, P8 / 2, P8); }
    }
    void f1;
  },

  /** Pixel castles: crenellated towers, lit slit windows, pennants. */
  castles(g, L, R) {
    const H = L.H, P8 = 8;
    const snap = (v) => Math.round(v / P8) * P8;
    for (let x = 40; x < L.W - 60; x += 200 + snap(R() * 120)) {
      const tw = 48 + snap(R() * 24), th = snap(H * (0.3 + R() * 0.45));
      g.fillStyle = L.base; g.fillRect(x, H - th, tw, th);
      for (let k = 0; k < tw; k += 16) g.fillRect(x + k, H - th - P8, P8, P8);
      g.fillStyle = U.mix(L.base, "#ffffff", 0.1); g.fillRect(x, H - th, tw, 4);
      // Bricks.
      g.fillStyle = U.mix(L.base, "#000000", 0.2);
      for (let y = H - th + 12; y < H; y += 12) g.fillRect(x + ((y / 12) % 2 ? 4 : 12), y, 8, 2);
      g.fillStyle = U.rgba(L.light, 0.6); g.fillRect(x + tw / 2 - 4, H - th + 24, 8, 16);
      Background.light(L, x + tw / 2, H - th + 32, 4, L.light, "flicker", R);
      // Pennant.
      g.fillStyle = L.base; g.fillRect(x + tw / 2 - 1, H - th - 40, 2, 32);
      g.fillStyle = U.rgba(L.light2, 0.7); g.fillRect(x + tw / 2 + 1, H - th - 40, 14, 8);
      // Wall to the next tower.
      g.fillStyle = L.base; g.fillRect(x + tw, H - th * 0.45, 100, th * 0.45);
      for (let k = 0; k < 100; k += 16) g.fillRect(x + tw + k, H - th * 0.45 - P8, P8, P8);
    }
  },

  /** Floating desktop windows: title bars, controls, content blocks. */
  windows(g, L, R) {
    const H = L.H;
    for (let i = 0; i < 6 * L.density; i++) {
      const w = 120 + R() * 150, h = 80 + R() * 90, x = R() * (L.W - w), y = 20 + R() * (H - h - 40);
      g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(x + 6, y + 8, w, h);
      g.fillStyle = U.rgba("#ffffff", 0.08 + L.far * 0.12); g.fillRect(x, y, w, h);
      g.fillStyle = U.rgba(L.accent, 0.3 + L.far * 0.3); g.fillRect(x, y, w, 12);
      g.fillStyle = "rgba(255,255,255,0.5)"; for (let k = 0; k < 3; k++) g.fillRect(x + w - 10 - k * 9, y + 4, 5, 5);
      g.fillStyle = U.rgba("#ffffff", 0.14 + L.far * 0.1);
      for (let yy = y + 22; yy < y + h - 10; yy += 10) g.fillRect(x + 10, yy, (w - 20) * (0.4 + R() * 0.6), 4);
      if (R() < 0.5) { g.fillStyle = U.rgba(L.light2, 0.2); g.fillRect(x + w - 60, y + 22, 46, 36); }
      g.strokeStyle = U.rgba("#ffffff", 0.18); g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w, h);
    }
  },

  /** Soft abstract wallpaper swooshes (far desktop layer). */
  swoosh(g, L, R) {
    const H = L.H;
    for (let i = 0; i < 4; i++) {
      const y0 = H * (0.3 + i * 0.15), amp = 30 + R() * 60, ph = R() * 6.28;
      const grd = g.createLinearGradient(0, y0 - amp, 0, H);
      grd.addColorStop(0, U.rgba("#ffffff", 0.1 + i * 0.03)); grd.addColorStop(1, U.rgba(L.light, 0.02));
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= L.W; x += 16) g.lineTo(x, y0 + Math.sin((x / L.W) * Math.PI * 2 * (1 + (i % 2)) + ph) * amp);
      g.lineTo(L.W, H); g.closePath(); g.fill();
    }
  },

  /** Broken skyscrapers: jagged tops, dark holes, glowing fires, rebar. */
  ruins(g, L, R) {
    const H = L.H;
    for (let x = -20; x < L.W;) {
      const w = 50 + R() * 80, h = H * (0.35 + R() * 0.6), top = H - h;
      Background.wrap(L, x, w + 30, (X, rr) => {
        g.fillStyle = L.base;
        g.beginPath(); g.moveTo(X, H); g.lineTo(X, top + rr() * 30);
        for (let k = 1; k <= 5; k++) g.lineTo(X + (w * k) / 5, top + rr() * 60);
        g.lineTo(X + w, H); g.closePath(); g.fill();
        g.fillStyle = L.rim; g.fillRect(X, top + 30, 2, h - 30);
        for (let yy = top + 60; yy < H - 20; yy += 24) for (let xx = X + 8; xx < X + w - 12; xx += 16) {
          const r = rr();
          if (r < 0.35) { g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(xx, yy, 8, 11); }
          else if (r < 0.42) { g.fillStyle = U.rgba(L.light, 0.35); g.fillRect(xx, yy, 8, 11); }
        }
        if (rr() < 0.6) {
          g.strokeStyle = U.mix(L.base, "#9a8a80", 0.35); g.lineWidth = 2;
          g.beginPath(); g.moveTo(X + w * 0.5, top + 20); g.lineTo(X + w * 0.5 + 16, top - 24); g.moveTo(X + w * 0.3, top + 25); g.lineTo(X + w * 0.3 - 6, top - 14); g.stroke();
        }
      }, R);
      if (R() < 0.35) Background.light(L, x + w * 0.4, top + 70 + R() * 60, 5, "#ff8a3a", "flicker", R);
      x += w + 10 + R() * 40;
    }
  },

  /** Scrap heaps: mounds with wrecked car shapes, tyres, crane arms. */
  scrap(g, L, R) {
    const H = L.H;
    g.fillStyle = L.base;
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= L.W; x += 32) { const t = (x / L.W) * Math.PI * 2; g.lineTo(x, H - H * (0.22 + 0.1 * Math.sin(t * 2) + 0.06 * Math.sin(t * 5 + 1)) - R() * 10); }
    g.lineTo(L.W, H); g.fill();
    for (let i = 0; i < 7; i++) {
      const x = R() * (L.W - 80), y = H * (0.62 + R() * 0.15);
      g.fillStyle = U.mix(L.base, "#000000", 0.2);
      g.beginPath(); g.moveTo(x, y + 18); g.lineTo(x + 10, y + 6); g.lineTo(x + 26, y); g.lineTo(x + 52, y); g.lineTo(x + 64, y + 8); g.lineTo(x + 70, y + 18); g.fill();
      g.fillStyle = U.rgba(L.light, 0.15); g.fillRect(x + 28, y + 3, 18, 6);
      g.fillStyle = U.mix(L.base, "#000000", 0.45); g.beginPath(); g.arc(x + 16, y + 19, 6, 0, 6.28); g.arc(x + 56, y + 19, 6, 0, 6.28); g.fill();
    }
    // Crane.
    const cx = 200 + R() * 500;
    g.strokeStyle = L.base; g.lineWidth = 6;
    g.beginPath(); g.moveTo(cx, H); g.lineTo(cx, H * 0.15); g.lineTo(cx + 220, H * 0.22); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.moveTo(cx + 200, H * 0.22); g.lineTo(cx + 200, H * 0.45); g.stroke();
    g.fillStyle = L.base; g.fillRect(cx + 186, H * 0.45, 28, 14);
    g.fillStyle = L.rim; g.fillRect(cx, H * 0.15, 220, 2);
    Background.light(L, cx + 220, H * 0.22, 4, "#ff3355", "blink", R, 70);
  },

  /** Package crates stacked into towers. */
  crates(g, L, R) {
    const H = L.H;
    for (let x = 10; x < L.W - 40;) {
      const n = 1 + Math.floor(R() * 5), s = 30 + Math.floor(R() * 14);
      for (let k = 0; k < n; k++) {
        const y = H - (k + 1) * (s + 2), ox = (R() - 0.5) * 6;
        g.fillStyle = L.base; g.fillRect(x + ox, y, s, s);
        g.fillStyle = L.rim; g.fillRect(x + ox, y, s, 2);
        g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(x + ox + s / 2 - 3, y, 6, s); g.fillRect(x + ox, y + s / 2 - 1, s, 2);
        g.fillStyle = U.rgba(L.light, 0.18); g.fillRect(x + ox + 4, y + 4, 8, 3);
      }
      x += s + 14 + R() * 40;
    }
  },

  /** Terminals and server boxes with prompt lines and blinking cursors. */
  terminals(g, L, R) {
    const H = L.H;
    for (let x = 20; x < L.W - 100;) {
      const w = 90 + R() * 70, h = 60 + R() * 50, y = H - h - 30 - R() * H * 0.35;
      g.fillStyle = L.base; g.fillRect(x, y, w, h); g.fillRect(x + w / 2 - 6, y + h, 12, H - y - h);
      g.fillStyle = U.mix(L.base, "#000000", 0.5); g.fillRect(x + 6, y + 6, w - 12, h - 12);
      g.fillStyle = L.rim; g.fillRect(x, y, w, 2);
      g.fillStyle = U.rgba(L.light, 0.3 + L.far * 0.3);
      for (let yy = y + 12, k = 0; yy < y + h - 14; yy += 8, k++) g.fillRect(x + 10, yy, (w - 30) * (0.3 + R() * 0.7), 3);
      Background.light(L, x + 14, y + h - 14, 4, L.light, "blink", R, 50);
      x += w + 30 + R() * 60;
    }
  },

  /** Jagged distant mountains / rubble ridge (generic far layer). */
  mountains(g, L, R) {
    const H = L.H;
    g.fillStyle = L.base;
    g.beginPath(); g.moveTo(0, H);
    const ph = R() * 6;
    for (let x = 0; x <= L.W; x += 16) {
      const t = (x / L.W) * Math.PI * 2;
      g.lineTo(x, H - H * (0.45 + 0.25 * Math.sin(t * 2 + ph) + 0.12 * Math.sin(t * 5 + ph * 2) + 0.05 * Math.sin(t * 13)));
    }
    g.lineTo(L.W, H); g.closePath(); g.fill();
    g.strokeStyle = L.rim; g.lineWidth = 1.5; g.stroke();
  },

  /** Utility poles with sagging cables. */
  cables(g, L, R) {
    const H = L.H, step = 256;
    for (let x = 0; x < L.W; x += step) {
      const top = H * (0.2 + R() * 0.15);
      g.fillStyle = L.base; g.fillRect(x + 40, top, 6, H - top); g.fillRect(x + 26, top + 8, 34, 4);
      g.strokeStyle = L.base; g.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x + 28 + k * 14, top + 10); g.quadraticCurveTo(x + 43 + step / 2, top + 60 + k * 6, x + 28 + k * 14 + step, top + 10); g.stroke(); }
      Background.light(L, x + 43, top, 3, "#ff3355", "blink", R, 90);
    }
  },

  /** Domes and towers of a city core (mainframe / orbit). */
  domes(g, L, R) {
    const H = L.H;
    for (let x = 0; x < L.W;) {
      const r = 40 + R() * 70, cx = x + r, base = H - 10 - R() * 30;
      Background.wrap(L, x, r * 2, (X) => {
        g.fillStyle = L.base; g.beginPath(); g.arc(X + r, base, r, Math.PI, 0); g.fill(); g.fillRect(X, base, r * 2, H - base);
        g.strokeStyle = L.rim; g.lineWidth = 2; g.beginPath(); g.arc(X + r, base, r, Math.PI, 0); g.stroke();
        g.strokeStyle = U.rgba(L.light, 0.12); g.lineWidth = 1;
        for (let k = 1; k < 4; k++) { g.beginPath(); g.arc(X + r, base, r * k / 4, Math.PI, 0); g.stroke(); }
      }, R);
      Background.light(L, cx, base - r, 4, L.light, "pulse", R);
      x += r * 2 + 20 + R() * 60;
    }
  },
};

// =========================================================================
// Foreground silhouettes (2048-wide strip, screen height). Keep them to the
// top and bottom edges so they never hide the action.
// =========================================================================
Background.FG = {
  pillars(g, W, H, R, col, acc) {
    for (let x = 100; x < W; x += 500 + R() * 500) {
      const h = 50 + R() * 40;
      g.fillStyle = col; g.fillRect(x, H - h, 36, h); g.fillRect(x - 10, H - h, 56, 8);
      g.fillStyle = acc; g.fillRect(x, H - h + 8, 2, h);
    }
    for (let x = 300; x < W; x += 700 + R() * 500) {
      g.fillStyle = col; g.fillRect(x, 0, 120 + R() * 140, 14);
      g.fillStyle = acc; g.fillRect(x, 14, 80, 1);
    }
  },
  cables(g, W, H, R, col) {
    g.strokeStyle = col;
    for (let x = 0; x < W; x += 340 + R() * 300) {
      const w = 200 + R() * 260, sag = 30 + R() * 40;
      g.lineWidth = 3 + R() * 3;
      g.beginPath(); g.moveTo(x, -4); g.quadraticCurveTo(x + w / 2, sag * 2, x + w, -4); g.stroke();
    }
    for (let x = 200; x < W; x += 600 + R() * 400) { g.fillStyle = col; g.fillRect(x, H - 40, 80 + R() * 80, 40); }
  },
  pixels(g, W, H, R, col) {
    g.fillStyle = col;
    for (let x = 0; x < W; x += 8) {
      const t = (x / W) * Math.PI * 2;
      const h = Math.max(0, Math.round((18 + Math.sin(t * 9) * 14 + Math.sin(t * 23) * 8) / 8) * 8);
      g.fillRect(x, H - h, 8, h);
    }
    for (let x = 150; x < W; x += 420 + R() * 400) { const s = 8 * (2 + Math.floor(R() * 3)); g.fillRect(x, H - 24 - s, s, s); }
  },
  rubble(g, W, H, R, col, acc) {
    g.fillStyle = col;
    for (let x = 0; x < W; x += 260 + R() * 360) {
      const w = 90 + R() * 160, h = 26 + R() * 34;
      g.beginPath(); g.moveTo(x, H); g.lineTo(x + w * 0.2, H - h); g.lineTo(x + w * 0.45, H - h * 0.7); g.lineTo(x + w * 0.7, H - h * 1.1); g.lineTo(x + w, H); g.fill();
      g.strokeStyle = acc; g.lineWidth = 2; g.beginPath(); g.moveTo(x + w * 0.7, H - h * 1.1); g.lineTo(x + w * 0.78, H - h * 1.6); g.stroke();
    }
  },
  frames(g, W, H, R, col, acc) {
    for (let x = 120; x < W; x += 520 + R() * 400) {
      g.fillStyle = col; g.fillRect(x, H - 30, 160, 30);
      g.fillStyle = acc; g.fillRect(x, H - 30, 160, 2);
      g.fillStyle = "rgba(255,255,255,0.25)"; for (let k = 0; k < 3; k++) g.fillRect(x + 12 + k * 22, H - 20, 14, 10);
    }
  },
};

// =========================================================================
// Animated elements. draw(ctx, a, cam, time, bg) in screen space.
// Counts scale with Gfx.q.anim.
// =========================================================================
Background.ANIMS = {
  dataRain: {
    draw(ctx, a, cam, time) {
      ctx.font = "12px monospace";
      ctx.fillStyle = a.color;
      const set = a.chars || "01";
      const n = Math.round(a.items.length * Gfx.q.anim);
      for (let i = 0; i < n; i++) {
        const col = a.items[i];
        const x = ((col.x - cam.x * (a.depth || 0.4)) % 1400 + 1400) % 1400 - 200;
        if (x < -10 || x > VIEW_W) continue;
        const head = ((time * col.sp + col.off) % (VIEW_H + 300)) - 150;
        for (let k = 0; k < col.len; k++) {
          ctx.globalAlpha = (1 - k / col.len) * (a.alpha || 0.25) * (k === 0 ? 2 : 1);
          ctx.fillText(set[(i * 7 + k * 5 + (time >> 3)) % set.length], x, head - k * 14);
        }
      }
      ctx.globalAlpha = 1;
    },
  },
  motes: {
    draw(ctx, a, cam, time) {
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = a.color;
      const n = Math.round(a.items.length * Gfx.q.anim);
      for (let i = 0; i < n; i++) {
        const m = a.items[i];
        m.y -= m.v; if (m.y < -5) m.y = VIEW_H + 5;
        const x = ((m.x + Math.sin(time * 0.01 + m.ph) * 20 - cam.x * 0.15) % VIEW_W + VIEW_W) % VIEW_W;
        ctx.globalAlpha = 0.25 + 0.2 * Math.sin(time * 0.05 + m.ph);
        ctx.fillRect(x, m.y, m.s, m.s);
      }
      ctx.restore();
    },
  },
  embers: {
    draw(ctx, a, cam, time) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const n = Math.round(a.items.length * Gfx.q.anim);
      for (let i = 0; i < n; i++) {
        const m = a.items[i];
        m.y -= m.v * 2.4; if (m.y < -5) { m.y = VIEW_H + 5; }
        const x = ((m.x + Math.sin(time * 0.03 + m.ph) * 24 - cam.x * 0.3) % VIEW_W + VIEW_W) % VIEW_W;
        const f = 0.5 + 0.5 * Math.sin(time * 0.2 + m.ph * 5);
        ctx.globalAlpha = 0.4 + 0.5 * f;
        ctx.fillStyle = f > 0.6 ? "#ffe0a0" : a.color;
        ctx.fillRect(x, m.y, m.s * 0.9, m.s * 0.9);
      }
      ctx.restore();
    },
  },
  ash: {
    draw(ctx, a, cam, time) {
      ctx.fillStyle = a.color;
      const n = Math.round(a.items.length * Gfx.q.anim);
      for (let i = 0; i < n; i++) {
        const m = a.items[i];
        m.y += m.v * 1.6; if (m.y > VIEW_H + 5) m.y = -5;
        const x = ((m.x + Math.sin(time * 0.02 + m.ph) * 16 - cam.x * 0.25) % VIEW_W + VIEW_W) % VIEW_W;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(x, m.y, m.s, m.s * 0.7);
      }
      ctx.globalAlpha = 1;
    },
  },
  smoke: {
    draw(ctx, a, cam, time) {
      const n = Math.max(1, Math.round(a.items.length * Gfx.q.anim));
      for (let k = 0; k < n; k++) {
        const s = a.items[k], i = s.i;
        const y = s.y + Math.sin(time * 0.004 + s.ph) * 20;
        const x = ((i * 377 - cam.x * (0.15 + i * 0.05) - time * (0.2 + i * 0.05)) % 1600 + 1600) % 1600 - 400;
        ctx.fillStyle = U.rgba(a.color, (a.alpha || 0.2) + (i % 2) * 0.06);
        ctx.beginPath(); ctx.ellipse(x, y, 260, 34, 0, 0, 6.28); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + 700, y + 20, 200, 26, 0, 0, 6.28); ctx.fill();
      }
    },
  },
  clouds: {
    draw(ctx, a, cam, time) {
      const n = Math.round(a.items.length * Math.max(0.5, Gfx.q.anim));
      for (let i = 0; i < n; i++) {
        const c = a.items[i];
        const x = ((c.x - cam.x * c.d - time * c.v) % 1600 + 1600) % 1600 - 300;
        if (x > VIEW_W + 50 || x + c.w < -50) continue;
        ctx.fillStyle = U.rgba(a.color, a.alpha || 0.18);
        ctx.beginPath();
        ctx.ellipse(x + c.w * 0.5, c.y, c.w * 0.5, c.h * 0.5, 0, 0, 6.28);
        ctx.ellipse(x + c.w * 0.3, c.y - c.h * 0.3, c.w * 0.25, c.h * 0.5, 0, 0, 6.28);
        ctx.ellipse(x + c.w * 0.65, c.y - c.h * 0.25, c.w * 0.22, c.h * 0.45, 0, 0, 6.28);
        ctx.fill();
      }
    },
  },
  pixelClouds: {
    draw(ctx, a, cam, time) {
      const n = Math.round(a.items.length * Math.max(0.5, Gfx.q.anim));
      ctx.fillStyle = U.rgba(a.color, a.alpha || 0.16);
      for (let i = 0; i < n; i++) {
        const c = a.items[i];
        const x = Math.round((((c.x - cam.x * c.d - time * c.v) % 1600 + 1600) % 1600 - 300) / 4) * 4;
        const y = Math.round(c.y / 8) * 8;
        for (const [dx, dy, w, h] of [[0, 8, 64, 16], [16, 0, 32, 8], [8, 24, 48, 8], [56, 16, 16, 8]]) ctx.fillRect(x + dx, y + dy, w, h);
      }
    },
  },
  glitch: {
    draw(ctx, a, cam, time) {
      if (time % (a.every || 140) >= 6) return;
      const r = U.seeded(Math.floor(time / (a.every || 140)) + 1);
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = U.rgba(k % 2 ? (a.color2 || "#ff3df0") : a.color, 0.18);
        ctx.fillRect(r() * VIEW_W - 100, r() * VIEW_H, 140 + r() * 300, 2 + r() * 6);
      }
    },
  },
  scan: {
    draw(ctx, a, cam, time) {
      ctx.fillStyle = `rgba(255,255,255,${a.alpha || 0.025})`;
      for (let y = 0; y < VIEW_H; y += 4) ctx.fillRect(0, y, VIEW_W, 1);
      const sy = (time * 1.5) % (VIEW_H + 120) - 60;
      const g = ctx.createLinearGradient(0, sy - 40, 0, sy);
      g.addColorStop(0, U.rgba(a.color, 0)); g.addColorStop(1, U.rgba(a.color, 0.05));
      ctx.fillStyle = g; ctx.fillRect(0, sy - 40, VIEW_W, 40);
    },
  },
  packets: {
    draw(ctx, a, cam, time, bg) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const n = Math.round(a.items.length * Gfx.q.anim);
      for (let i = 0; i < n; i++) {
        const p = a.items[i];
        const y = VIEW_H * p.y + bg.lift(cam, 0.25) * 0.5;
        const x = ((p.x + time * p.v - cam.x * 0.3) % 1400 + 1400) % 1400 - 200;
        const g = ctx.createLinearGradient(x - p.len, 0, x, 0);
        g.addColorStop(0, U.rgba(a.color, 0)); g.addColorStop(1, U.rgba(a.color, a.alpha || 0.3));
        ctx.fillStyle = g; ctx.fillRect(x - p.len, y, p.len, 1.5);
      }
      ctx.restore();
    },
  },
  shooting: {
    draw(ctx, a, cam, time) {
      const period = a.every || 400, t = time % period;
      if (t > 40) return;
      const r = U.seeded(Math.floor(time / period) + 7);
      const x0 = r() * VIEW_W, y0 = 30 + r() * 140, k = t / 40;
      const x = x0 + k * 260, y = y0 + k * 90;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const g = ctx.createLinearGradient(x - 80, y - 28, x, y);
      g.addColorStop(0, U.rgba(a.color, 0)); g.addColorStop(1, U.rgba(a.color, 0.8 * (1 - k)));
      ctx.strokeStyle = g; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 80, y - 28); ctx.lineTo(x, y); ctx.stroke();
      ctx.restore();
    },
  },
  beams: {
    draw(ctx, a, cam, time) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (const b of a.items) {
        const x = VIEW_W * b.x - (cam.x * 0.05) % 200, ang = Math.sin(time * b.sp + b.ph) * 0.45;
        ctx.save(); ctx.translate(x, VIEW_H); ctx.rotate(ang);
        const g = ctx.createLinearGradient(0, 0, 0, -VIEW_H);
        g.addColorStop(0, U.rgba(a.color, a.alpha || 0.12)); g.addColorStop(1, U.rgba(a.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(60, -VIEW_H); ctx.lineTo(-60, -VIEW_H); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    },
  },
  loader: {
    draw(ctx, a, cam, time) {
      const px = 560 - cam.x * 0.05, py = 70 - cam.y * 0.03, pw = 300, ph = 150;
      ctx.fillStyle = "rgba(11,61,145,0.4)"; ctx.fillRect(px, py, pw, ph);
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(px, py, pw, 14);
      ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.strokeRect(px + 0.5, py + 0.5, pw, ph);
      for (let i = 0; i < 6; i++) {
        const an = time * 0.09 + i * 0.45;
        ctx.fillStyle = `rgba(255,255,255,${0.15 + i * 0.12})`;
        ctx.beginPath(); ctx.arc(px + pw / 2 + Math.cos(an) * 16, py + 56 + Math.sin(an) * 16, 3, 0, 6.28); ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(px + 40, py + 100, pw - 80, 6);
      ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fillRect(px + 40, py + 100, (pw - 80) * ((time * 0.0015) % 1), 6);
      ctx.font = "12px monospace"; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillText(`Please wait... ${Math.floor(((time * 0.0015) % 1) * 100)}%`, px + pw / 2, py + 130);
      ctx.textAlign = "left";
    },
  },
  monitor: {
    draw(ctx, a, cam, time) {
      const pw = 280, ph = 150, px = VIEW_W - pw - 200 - (cam.x * 0.04) % 40, py = 170;
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "rgba(20,20,20,0.7)"; ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = U.rgba(a.color, 0.35); ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, pw, ph);
      ctx.font = "11px monospace"; ctx.fillStyle = "rgba(211,215,207,0.55)";
      ctx.fillText("PID  CPU%  COMMAND", px + 10, py + 18);
      for (let i = 0; i < 6; i++) {
        const v = 0.5 + 0.5 * Math.sin(time * (0.02 + i * 0.007) + i * 1.7);
        ctx.fillStyle = "rgba(211,215,207,0.4)"; ctx.fillText(String(100 + i * 37), px + 10, py + 38 + i * 18);
        ctx.fillStyle = v > 0.8 ? "rgba(239,41,41,0.6)" : "rgba(138,226,52,0.5)";
        ctx.fillRect(px + 52, py + 30 + i * 18, (pw - 70) * v, 8);
      }
      ctx.font = "14px monospace"; ctx.fillStyle = "rgba(138,226,52,0.35)";
      ctx.fillText("user@host:~$ ", 40, VIEW_H - 140);
      if (Math.floor(time / 30) % 2) ctx.fillRect(152, VIEW_H - 152, 9, 15);
    },
  },
};

// =========================================================================
// Presets per style. Each one is the full look of a theme; a world file's
// theme.bg overrides any part.
// =========================================================================
Background.PRESETS = {
  boot: (th) => ({
    sky: [U.mix(th.bgTop, "#000000", 0.3), th.bgTop, th.bgBottom],
    orb: { kind: "core", x: 0.72, y: 130, r: 46, color: th.accent },
    stars: { count: 90 },
    rays: { color: th.accent, alpha: 0.07, count: 4 },
    layers: [
      { type: "skyline", height: 0.75, density: 1.4 },
      { type: "domes", height: 0.4 },
      { type: "chips", height: 0.55 },
      { type: "racks", height: 0.42, density: 0.8 },
      { type: "cables", height: 0.5 },
    ],
    fog: { color: th.bgBottom, alpha: 0.35 },
    fg: { type: "pillars" },
    anim: [{ type: "dataRain", count: 10, alpha: 0.18 }, { type: "packets", count: 8 }, { type: "motes", count: 30 }, { type: "shooting", every: 520, color: "#ffffff" }],
    light: { ambient: 0.28 },
  }),
  stream: (th) => ({
    sky: [U.mix(th.bgTop, "#000000", 0.3), th.bgTop, th.bgBottom],
    stars: { count: 70 },
    rays: { color: th.accent, alpha: 0.1, count: 6, x: 0.4 },
    layers: [
      { type: "pillars", height: 0.9, density: 1.5 },
      { type: "skyline", height: 0.6 },
      { type: "pillars", height: 0.7 },
      { type: "hexgrid", height: 0.45 },
      { type: "cables", height: 0.45 },
    ],
    fog: { color: th.bgBottom, alpha: 0.3 },
    fg: { type: "cables" },
    anim: [{ type: "dataRain", count: 26, alpha: 0.24 }, { type: "packets", count: 14 }, { type: "motes", count: 36 }],
    light: { ambient: 0.3 },
  }),
  server: (th) => ({
    sky: [U.mix(th.bgTop, "#000000", 0.4), th.bgTop, th.bgBottom],
    stars: { count: 30 },
    rays: { color: th.accent, alpha: 0.06, count: 3 },
    layers: [
      { type: "skyline", height: 0.8, density: 1.6 },
      { type: "racks", height: 0.75, density: 1.2 },
      { type: "chips", height: 0.5 },
      { type: "racks", height: 0.55 },
      { type: "cables", height: 0.6 },
    ],
    fog: { color: th.bgBottom, alpha: 0.4 },
    fg: { type: "cables" },
    anim: [{ type: "embers", count: 24, color: th.accent }, { type: "dataRain", count: 8, alpha: 0.14 }, { type: "beams", count: 2, alpha: 0.06 }],
    light: { ambient: 0.38 },
  }),
  orbit: (th) => ({
    sky: ["#000000", th.bgTop, th.bgBottom],
    orb: { kind: "planet", x: 0.72, y: 150, r: 100, color: U.mix(th.accent, "#7aa8ff", 0.4) },
    stars: { count: 160 },
    layers: [
      { type: "trusses", height: 0.85, depth: 0.05 },
      { type: "mountains", height: 0.3, color: U.mix(th.bgBottom, "#000000", 0.3) },
      { type: "trusses", height: 0.7 },
      { type: "domes", height: 0.38 },
      { type: "trusses", height: 0.5 },
    ],
    fog: { color: th.bgBottom, alpha: 0.2 },
    fg: { type: "pillars" },
    anim: [{ type: "shooting", every: 260, color: "#ffffff" }, { type: "motes", count: 20 }],
    light: { ambient: 0.32 },
  }),
  mainframe: (th) => ({
    sky: [U.mix(th.bgTop, "#000000", 0.4), th.bgTop, th.bgBottom],
    orb: { kind: "core", x: 0.5, y: 170, r: 70, color: th.accent },
    stars: { count: 40 },
    rays: { color: th.accent, alpha: 0.1, count: 6, x: 0.5 },
    layers: [
      { type: "hexgrid", height: 0.85, density: 1.3 },
      { type: "skyline", height: 0.6 },
      { type: "hexgrid", height: 0.6 },
      { type: "chips", height: 0.45 },
      { type: "cables", height: 0.5 },
    ],
    fog: { color: th.bgBottom, alpha: 0.35 },
    fg: { type: "pillars" },
    anim: [{ type: "beams", count: 3, alpha: 0.08 }, { type: "dataRain", count: 12, alpha: 0.18 }, { type: "motes", count: 30 }],
    light: { ambient: 0.34 },
  }),
  hack: (th) => ({
    sky: ["#000000", th.bgTop, th.bgBottom],
    stars: { count: 0 },
    layers: [
      { type: "code", height: 0.9, density: 1.2 },
      { type: "skyline", height: 0.65 },
      { type: "folders", height: 0.8 },
      { type: "terminals", height: 0.5 },
      { type: "cables", height: 0.5 },
    ],
    fog: { color: th.bgBottom, alpha: 0.35 },
    fg: { type: "cables" },
    anim: [{ type: "dataRain", count: 30, alpha: 0.3, chars: "0123456789ABCDEF{}<>/$#" }, { type: "glitch", every: 150 }, { type: "packets", count: 8 }, { type: "scan", alpha: 0.018 }],
    light: { ambient: 0.35, tint: "#000a04" },
  }),
  pixel: (th) => ({
    sky: [th.bgTop, U.mix(th.bgTop, th.bgBottom, 0.6), th.bgBottom],
    orb: { kind: "pixelSun", x: 0.78, y: 120, r: 40, color: "#ffa300" },
    stars: { count: 70, pixel: true },
    layers: [
      { type: "hills", height: 0.7, amp: 1.2 },
      { type: "castles", height: 0.75 },
      { type: "hills", height: 0.55 },
      { type: "castles", height: 0.5 },
      { type: "hills", height: 0.35, amp: 0.8 },
    ],
    fg: { type: "pixels" },
    anim: [{ type: "pixelClouds", count: 8, color: "#fff1e8", band: 160 }, { type: "shooting", every: 600, color: "#fff1e8" }],
    light: { ambient: 0.18 },
  }),
  desktop: (th) => ({
    sky: [th.bgTop, U.mix(th.bgTop, th.bgBottom, 0.5), th.bgBottom],
    orb: { kind: "none" },
    rays: { color: "#ffffff", alpha: 0.12, count: 6, x: 0.55 },
    layers: [
      { type: "swoosh", height: 0.9 },
      { type: "windows", height: 0.95, density: 0.8 },
      { type: "swoosh", height: 0.6 },
      { type: "windows", height: 0.8, density: 0.6, alpha: 0.55 },
    ],
    fg: { type: "frames", color: "#0d2a5a" },
    anim: [{ type: "clouds", count: 6, color: "#ffffff", alpha: 0.1, band: 220 }, { type: "loader" }],
    light: { ambient: 0 },
  }),
  ruin: (th) => ({
    sky: [U.mix(th.bgTop, "#000000", 0.3), th.bgTop, th.bgBottom],
    orb: { kind: "sun", x: 0.66, y: 200, r: 64, color: "#ffb347" },
    rays: { color: "#ffb347", alpha: 0.1, count: 5, x: 0.66 },
    layers: [
      { type: "mountains", height: 0.45 },
      { type: "ruins", height: 0.85, density: 1.3 },
      { type: "ruins", height: 0.7 },
      { type: "scrap", height: 0.6 },
      { type: "cables", height: 0.55 },
    ],
    fog: { color: "#ff8a3a", alpha: 0.18 },
    fg: { type: "rubble" },
    anim: [{ type: "smoke", count: 5, color: "#3c2d28" }, { type: "embers", count: 30, color: "#ff8a3a" }, { type: "ash", count: 30, color: "#c8b4aa" }],
    light: { ambient: 0.22, tint: "#140602" },
  }),
  term: (th) => ({
    sky: ["#000000", th.bgTop, th.bgBottom],
    stars: { count: 0 },
    layers: [
      // Background text is dim green-grey, so it never looks like the amber platforms.
      { type: "code", height: 0.95, density: 1.4, light: "#5f7a5f" },
      { type: "terminals", height: 0.7, light: "#4e9a06" },
      { type: "crates", height: 0.6, light: "#8f6a3e" },
      { type: "terminals", height: 0.5, light: "#4e9a06", alpha: 0.85 },
      { type: "crates", height: 0.35, light: "#8f6a3e" },
    ],
    fog: { color: th.bgBottom, alpha: 0.3 },
    fg: { type: "cables" },
    anim: [{ type: "monitor" }, { type: "scan", alpha: 0.025 }, { type: "dataRain", count: 10, alpha: 0.12, chars: "$#~/_-|" }],
    light: { ambient: 0.32 },
  }),
};

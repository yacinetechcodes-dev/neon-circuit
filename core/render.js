/* =========================================================================
 * core/render.js — detailed tile-map drawing.
 *
 * Tiles are painted once into cached chunk canvases (16×16 tiles) and then
 * drawn with a single drawImage per chunk. Only a light "pulse" along lit
 * edges is animated per frame.
 *
 * The look is data: theme.tiles (in a world file) over a style default.
 *   tiles: {
 *     style:   "circuit" | "metal" | "hex" | "pixel" | "window" | "rust" | "term",
 *     base, light, dark,          // body colours (default from the theme)
 *     edge,                       // lit top edge (default: accent)
 *     seam,                       // glowing seams / traces (default: accent)
 *     pattern: "circuit" | "panels" | "hex" | "bricks" | "window" | "plates" | "cells",
 *     decor:   ["rivets", "cracks", "vents", "grass", "moss", "rust", "drips", "glyphs", "cables", "leds"],
 *     oneway:  "plate" | "girder" | "pixel" | "bar" | "dashes",
 *     chamfer: 5,                 // outer corners cut by n px (0 = square)
 *     ao:      0.5,               // how much deep interior tiles darken
 *   }
 * Sections are painted with their own theme, so a style change happens at
 * the section's first column, not when the player crosses it.
 * ========================================================================= */
"use strict";

const Tiles = {
  CH: 16,                       // chunk size in tiles
  PAD: 12,                      // chunk padding (glows spill over tile bounds)
  MAX_CHUNKS: 18,

  /** Default style for each background style. */
  STYLE_FOR: { boot: "circuit", stream: "circuit", hack: "circuit", server: "metal", orbit: "metal", mainframe: "hex", pixel: "pixel", desktop: "window", ruin: "rust", term: "term" },

  STYLES: {
    circuit: { pattern: "circuit", decor: ["rivets", "cracks", "vents", "leds", "cables"], oneway: "plate", chamfer: 5, ao: 0.55 },
    metal: { pattern: "panels", decor: ["rivets", "cracks", "vents", "leds", "cables"], oneway: "girder", chamfer: 5, ao: 0.55 },
    hex: { pattern: "hex", decor: ["cracks", "leds"], oneway: "plate", chamfer: 6, ao: 0.6 },
    pixel: { pattern: "bricks", decor: ["grass", "cracks"], oneway: "pixel", chamfer: 0, ao: 0.35 },
    window: { pattern: "window", decor: [], oneway: "bar", chamfer: 0, ao: 0.15, taskbar: 4 },
    rust: { pattern: "plates", decor: ["rivets", "cracks", "rust", "drips", "moss"], oneway: "girder", chamfer: 4, ao: 0.55 },
    term: { pattern: "cells", decor: ["glyphs", "cracks"], oneway: "dashes", chamfer: 0, ao: 0.4 },
  },

  /** Full tile spec for a theme (cached on the theme object). */
  specFor(th) {
    if (th._tileSpec) return th._tileSpec;
    const own = th.tiles || {};
    const style = own.style || (th.tileStyle === "pixel" ? "pixel" : th.tileStyle === "window" ? "window" : th.tileStyle === "rust" ? "rust" : th.tileStyle === "term" ? "term" : this.STYLE_FOR[th.style] || "circuit");
    const S = Object.assign({ style }, this.STYLES[style] || this.STYLES.circuit, own);
    S.base = S.base || th.tileFill || U.mix(th.bgBottom, th.gridColor, 0.55);
    S.light = S.light || th.tileLight || U.mix(S.base, "#ffffff", 0.22);
    S.dark = S.dark || th.tileDark || U.mix(S.base, "#000000", 0.45);
    S.edge = S.edge || th.accent;
    S.seam = S.seam || th.accent;
    S.decorSet = new Set(S.decor || []);
    // Body shades: [depth 0..3][variation 0..3]
    S.shades = [0, 1, 2, 3].map((d) => [0, 1, 2, 3].map((v) => U.mix(U.mix(S.base, v < 2 ? "#ffffff" : "#000000", [0.05, 0.02, 0.03, 0.07][v]), "#000000", (d / 3) * S.ao * 0.75)));
    th._tileSpec = S;
    return S;
  },

  // ------------------------------------------------------------ chunks
  draw(ctx, world, cam) {
    if (typeof document === "undefined") return;
    const CH = this.CH, size = CH * TILE;
    const cache = world._chunks || (world._chunks = new Map());
    const cx0 = Math.floor(cam.x / size), cx1 = Math.floor((cam.x + VIEW_W) / size);
    const cy0 = Math.floor(cam.y / size), cy1 = Math.floor((cam.y + VIEW_H) / size);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = this.chunk(world, cache, cx, cy);
      if (c) ctx.drawImage(c, cx * size - this.PAD, cy * size - this.PAD);
    }
    // Pre-build one chunk ahead in the direction of travel.
    const ahead = world.player.vx >= 0 ? cx1 + 1 : cx0 - 1;
    for (let cy = cy0; cy <= cy1; cy++) if (!cache.has(ahead + ":" + cy)) { this.chunk(world, cache, ahead, cy); break; }
    if (Gfx.q.tileAnim) this.drawPulse(ctx, world, cam);
  },

  chunk(world, cache, cx, cy) {
    const CH = this.CH;
    if (cx < 0 || cy < 0 || cx * CH >= world.w || cy * CH >= world.h) return null;
    const key = cx + ":" + cy;
    let c = cache.get(key);
    if (c) { cache.delete(key); cache.set(key, c); return c; } // LRU touch
    c = this.buildChunk(world, cx, cy);
    cache.set(key, c);
    while (cache.size > this.MAX_CHUNKS) cache.delete(cache.keys().next().value);
    return c;
  },

  buildChunk(world, cx, cy) {
    const CH = this.CH, P = this.PAD, size = CH * TILE;
    const c = document.createElement("canvas");
    c.width = size + P * 2; c.height = size + P * 2;
    const g = c.getContext("2d");
    g.translate(P, P);
    const c0 = cx * CH, r0 = cy * CH;
    const W = world.w, Hh = world.h, tiles = world.tiles;
    const solid = (col, row) => {
      if (col < 0 || col >= W || row < 0 || row >= Hh) return row >= 0; // edges and floor count as solid, the sky does not
      const t = tiles[row * W + col];
      return t === T_SOLID || t === T_HIDDEN_SOLID;
    };
    const depthAt = (col, row) => {
      for (let d = 1; d <= 3; d++) {
        for (let dy = -d; dy <= d; dy++) {
          const dx = d - Math.abs(dy);
          if (!solid(col + dx, row + dy) || !solid(col - dx, row + dy)) return d - 1;
        }
      }
      return 3;
    };
    // Bleed: paint the neighbouring tiles' bodies 2 px past the chunk edge, so
    // chunks overlap with opaque pixels and no seam shows when scaled.
    g.save();
    g.beginPath(); g.rect(-2, -2, size + 4, size + 4); g.rect(0, 0, size, size); g.clip("evenodd");
    for (let r = r0 - 1; r <= r0 + CH; r++) for (let col = c0 - 1; col <= c0 + CH; col++) {
      if (r >= r0 && r < r0 + CH && col >= c0 && col < c0 + CH) continue;
      if (r < 0 || col < 0 || r >= Hh || col >= W || tiles[r * W + col] !== T_SOLID) continue;
      const S = this.specFor(world.tileThemeAt ? world.tileThemeAt(col) : world.theme);
      const n = { u: solid(col, r - 1), d: solid(col, r + 1), l: solid(col - 1, r), r: solid(col + 1, r), depth: depthAt(col, r), taskbar: S.taskbar && r >= Hh - S.taskbar };
      const hh = ((col * 73856093) ^ (r * 19349663)) >>> 0;
      this.body(g, (col - c0) * TILE, (r - r0) * TILE, S, hh, n, col, r);
      this.edges(g, (col - c0) * TILE, (r - r0) * TILE, S, hh, n);
    }
    g.restore();
    // Two passes: bodies first, then edge decorations that spill outside the tile.
    for (let pass = 0; pass < 2; pass++) {
      for (let r = r0; r < Math.min(Hh, r0 + CH); r++) for (let col = c0; col < Math.min(W, c0 + CH); col++) {
        const t = tiles[r * W + col];
        if (t !== T_SOLID && t !== T_ONEWAY) continue;
        const S = this.specFor(world.tileThemeAt ? world.tileThemeAt(col) : world.theme);
        const x = (col - c0) * TILE, y = (r - r0) * TILE;
        const h = ((col * 73856093) ^ (r * 19349663)) >>> 0;
        if (t === T_ONEWAY) { if (pass === 0) this.oneway(g, x, y, S, h, solid(col - 1, r) || tiles[r * W + col - 1] === T_ONEWAY, col + 1 < W && tiles[r * W + col + 1] === T_ONEWAY); continue; }
        const n = {
          u: solid(col, r - 1), d: solid(col, r + 1), l: solid(col - 1, r), r: solid(col + 1, r),
          ul: solid(col - 1, r - 1), ur: solid(col + 1, r - 1), dl: solid(col - 1, r + 1), dr: solid(col + 1, r + 1),
        };
        n.taskbar = S.taskbar && r >= Hh - S.taskbar;
        if (pass === 0) { n.depth = depthAt(col, r); this.body(g, x, y, S, h, n, col, r); }
        else this.edges(g, x, y, S, h, n);
      }
    }
    return c;
  },

  // ------------------------------------------------------------ painters
  body(g, x, y, S, h, n, col, row) {
    const T = TILE, v = h & 3, depth = n.depth;
    if (n.taskbar) {
      // Desktop floor: a dark taskbar with app slots along its top row.
      g.fillStyle = depth === 0 ? "#1f2836" : "#18202c"; g.fillRect(x, y, T, T);
      g.fillStyle = "rgba(255,255,255,0.04)"; g.fillRect(x, y + T - 1, T, 1);
      if (!n.u) {
        g.fillStyle = "#3a4860"; g.fillRect(x, y, T, 2);
        if (col % 2 === 0) {
          const on = col % 6 === 0;
          g.fillStyle = on ? S.edge : "#5b6b82"; g.fillRect(x + 9, y + 9, 14, 14);
          g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(x + 9, y + 9, 14, 2);
          if (on) { g.fillStyle = "#9fd0ff"; g.fillRect(x + 11, y + 26, 10, 2); }
        }
      }
      return;
    }
    g.fillStyle = S.shades[depth][v];
    g.fillRect(x, y, T, T);
    const surface = depth === 0;
    switch (S.pattern) {
      case "circuit": {
        // Inset panel with bevel, and circuit traces with solder pads.
        g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(x + 2, y + 2, T - 4, 1); g.fillRect(x + 2, y + 2, 1, T - 4);
        g.fillStyle = "rgba(0,0,0,0.22)"; g.fillRect(x + 2, y + T - 3, T - 4, 1); g.fillRect(x + T - 3, y + 2, 1, T - 4);
        const k = (h >> 3) % 7;
        g.strokeStyle = U.rgba(S.seam, depth < 2 ? 0.22 : 0.1); g.lineWidth = 1.5;
        g.beginPath();
        if (k === 0) { g.moveTo(x, y + 10); g.lineTo(x + 14, y + 10); g.lineTo(x + 20, y + 16); g.lineTo(x + T, y + 16); }
        else if (k === 1) { g.moveTo(x + 8, y); g.lineTo(x + 8, y + 12); g.lineTo(x + 18, y + 22); g.lineTo(x + 18, y + T); }
        else if (k === 2) { g.moveTo(x, y + 24); g.lineTo(x + T, y + 24); }
        else if (k === 3) { g.moveTo(x + 24, y); g.lineTo(x + 24, y + T); }
        g.stroke();
        if (k <= 1) { g.fillStyle = U.rgba(S.seam, 0.35); g.fillRect(x + (k ? 16 : 12), y + (k ? 20 : 8), 4, 4); }
        if (k === 4 && depth > 0) {
          // A small chip.
          g.fillStyle = U.mix(S.base, "#000000", 0.45); g.fillRect(x + 8, y + 9, 16, 14);
          g.fillStyle = "rgba(255,255,255,0.12)"; for (let i = 0; i < 4; i++) { g.fillRect(x + 9 + i * 4, y + 6, 2, 3); g.fillRect(x + 9 + i * 4, y + 23, 2, 3); }
        }
        break;
      }
      case "panels": {
        // Two plates per tile, seams, slight sheen.
        g.fillStyle = "rgba(0,0,0,0.25)";
        if ((row + (col >> 1)) % 2) g.fillRect(x, y + 15, T, 2); else g.fillRect(x + 15, y, 2, T);
        g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(x + 1, y + 1, T - 2, 2);
        g.fillStyle = U.rgba(S.seam, 0.07); g.fillRect(x, y + T - 1, T, 1);
        break;
      }
      case "hex": {
        g.strokeStyle = U.rgba(S.seam, depth < 2 ? 0.18 : 0.08); g.lineWidth = 1;
        const s = 8, oy = (col % 2) * 7;
        g.beginPath();
        for (let yy = -8 + oy; yy < T + 8; yy += 14) {
          const cx = x + 16, cy = y + yy;
          for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; const px = cx + Math.cos(a) * s, py = cy + Math.sin(a) * s * 0.9; i ? g.lineTo(px, py) : g.moveTo(px, py); }
          g.closePath();
        }
        g.save(); g.beginPath(); g.rect(x, y, T, T); g.clip(); g.stroke(); g.restore();
        break;
      }
      case "bricks": {
        // 8-bit bricks on a 4 px grid: each brick gets its own shade, a lit
        // top row of pixels and a shaded bottom-right; mortar between.
        if (!S.brickShades) S.brickShades = [0.12, 0.05, 0, -0.06, -0.12].map((k) => U.mix(S.base, k > 0 ? "#ffffff" : "#000000", Math.abs(k)));
        g.fillStyle = S.dark; g.fillRect(x, y, T, T);
        for (let br = 0; br < 2; br++) {
          const by = y + br * 16, off = ((row * 2 + br) % 2) ? 8 : 0;
          for (let bx = -16 + off; bx < T; bx += 16) {
            const x0 = Math.max(x, x + bx), x1 = Math.min(x + T, x + bx + 12);
            if (x1 <= x0) continue;
            const bh = ((col * 7 + bx * 3 + (row * 2 + br) * 13) * 2654435761) >>> 0;
            const depthK = Math.min(2, depth);
            g.fillStyle = S.brickShades[Math.min(4, (bh % 4) + depthK)];
            g.fillRect(x0, by, x1 - x0, 12);
            g.fillStyle = U.rgba(S.light, 0.35); g.fillRect(x0, by, x1 - x0, 4 - ((bh >> 3) & 1) * 0);
            g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(x0, by + 8, x1 - x0, 4);
            if (((bh >> 5) % 11) === 0) { g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x0 + 4, by + 4, 4, 4); }   // chipped
          }
        }
        if ((h % 13) === 5 && depth > 0) { g.fillStyle = U.rgba("#5a8a3a", 0.6); g.fillRect(x + 4, y + 12, 8, 4); g.fillRect(x + 8, y + 16, 4, 4); }  // moss
        break;
      }
      case "window": {
        const grd = g.createLinearGradient(0, y, 0, y + T);
        grd.addColorStop(0, U.mix(S.base, "#ffffff", 0.25)); grd.addColorStop(1, S.base);
        g.fillStyle = grd; g.fillRect(x, y, T, T);
        if ((col + row) % 5 === 0) { g.fillStyle = S.dark; g.fillRect(x + 6, y + 10, 18, 3); g.fillRect(x + 6, y + 16, 12, 3); }
        if ((h & 31) === 7) { g.fillStyle = U.rgba(S.edge, 0.25); g.fillRect(x + 6, y + 6, 20, 20); g.fillStyle = "rgba(255,255,255,0.5)"; g.fillRect(x + 8, y + 18, 6, 6); }
        break;
      }
      case "plates": {
        // Riveted rusty plates with stains and scratches.
        g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(x, y, T, 1); g.fillRect(x, y, 1, T);
        g.fillStyle = "rgba(255,200,160,0.05)"; g.fillRect(x + 1, y + 1, T - 2, 1);
        if ((h & 7) === 2) { g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(x + 4, y + 15, T - 8, 2); }
        if (S.decorSet.has("rust") && (h & 7) < 3) {
          g.fillStyle = U.rgba("#b5541f", 0.25 + ((h >> 4) & 3) * 0.06);
          g.beginPath(); g.ellipse(x + 8 + ((h >> 6) % 16), y + 10 + ((h >> 9) % 14), 5 + (h % 5), 3 + (h % 3), 0, 0, 6.28); g.fill();
        }
        if ((h & 15) === 9) { g.strokeStyle = "rgba(255,255,255,0.08)"; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 4, y + 22); g.lineTo(x + 20, y + 26); g.stroke(); }
        break;
      }
      case "cells": {
        g.fillStyle = S.dark; g.fillRect(x, y + T - 1, T, 1); g.fillRect(x + T - 1, y, 1, T);
        if (S.decorSet.has("glyphs") && h % 7 === 0) {
          g.font = "14px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
          g.fillStyle = "rgba(211,215,207,0.13)"; g.fillText("#$/_|{}<>;:~*"[h % 13], x + 16, y + 17);
        }
        break;
      }
    }
    // Shared decorations.
    const D = S.decorSet;
    if (D.has("rivets") && (S.pattern === "plates" || (h & 7) === 5) && depth < 3) {
      for (const [rx, ry] of [[4, 4], [T - 6, 4], [4, T - 6], [T - 6, T - 6]]) {
        g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x + rx, y + ry + 1, 3, 2);
        g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(x + rx, y + ry, 2, 2);
      }
    }
    if (D.has("vents") && (h % 23) === 4 && depth > 0) {
      g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x + 6, y + 8, 20, 16);
      g.fillStyle = "rgba(255,255,255,0.08)"; for (let i = 0; i < 4; i++) g.fillRect(x + 8, y + 10 + i * 4, 16, 1);
    }
    if (D.has("leds") && (h % 19) === 2 && surface) {
      g.fillStyle = U.rgba(S.seam, 0.9); g.fillRect(x + 22, y + 14, 3, 3);
      g.fillStyle = U.rgba(S.seam, 0.25); g.fillRect(x + 21, y + 13, 5, 5);
    }
    if (D.has("cracks") && (h % 17) === 6) {
      g.strokeStyle = "rgba(0,0,0,0.45)"; g.lineWidth = 1.2;
      const sx = x + 6 + (h >> 5) % 18, sy = y + 4;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 4, sy + 8); g.lineTo(sx + 1, sy + 14); g.lineTo(sx + 6, sy + 22); g.moveTo(sx + 4, sy + 8); g.lineTo(sx + 10, sy + 11); g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.08)"; g.beginPath(); g.moveTo(sx + 1, sy); g.lineTo(sx + 5, sy + 8); g.stroke();
    }
    // Side bevels where the block meets air.
    if (!n.l) { g.fillStyle = U.rgba(S.light, 0.35); g.fillRect(x, y, 2, T); g.fillStyle = U.rgba(S.edge, 0.25); g.fillRect(x, y, 1, T); }
    if (!n.r) { g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x + T - 3, y, 3, T); g.fillStyle = U.rgba(S.edge, 0.18); g.fillRect(x + T - 1, y, 1, T); }
    if (!n.d) { g.fillStyle = "rgba(0,0,0,0.45)"; g.fillRect(x, y + T - 3, T, 3); }
    // Outer corners: chamfer (or a pixel notch) so blocks don't look like boxes.
    const cut = S.chamfer || 0;
    if (cut > 0) {
      g.save(); g.globalCompositeOperation = "destination-out"; g.beginPath();
      if (!n.u && !n.l) { g.moveTo(x, y); g.lineTo(x + cut, y); g.lineTo(x, y + cut); }
      if (!n.u && !n.r) { g.moveTo(x + T, y); g.lineTo(x + T - cut, y); g.lineTo(x + T, y + cut); }
      if (!n.d && !n.l) { g.moveTo(x, y + T); g.lineTo(x + cut, y + T); g.lineTo(x, y + T - cut); }
      if (!n.d && !n.r) { g.moveTo(x + T, y + T); g.lineTo(x + T - cut, y + T); g.lineTo(x + T, y + T - cut); }
      g.fill(); g.restore();
    } else if (S.style === "pixel") {
      g.save(); g.globalCompositeOperation = "destination-out";
      if (!n.u && !n.l) g.fillRect(x, y, 4, 4);
      if (!n.u && !n.r) g.fillRect(x + T - 4, y, 4, 4);
      g.restore();
    }
  },

  edges(g, x, y, S, h, n) {
    const T = TILE, D = S.decorSet, cut = S.chamfer || 0;
    if (n.taskbar) return;
    if (!n.u) {
      // Lit top edge: glow above, bright rim, highlight line.
      const l0 = !n.l ? cut : 0, r0 = !n.r ? cut : 0;
      if (S.style !== "pixel" && S.style !== "window") {
        const grd = g.createLinearGradient(0, y - 8, 0, y);
        grd.addColorStop(0, U.rgba(S.edge, 0)); grd.addColorStop(1, U.rgba(S.edge, 0.2));
        g.fillStyle = grd; g.fillRect(x + l0, y - 8, T - l0 - r0, 8);
      }
      switch (S.style) {
        case "pixel":
          g.fillStyle = S.edge; g.fillRect(x + (!n.l ? 4 : 0), y, T - (!n.l ? 4 : 0) - (!n.r ? 4 : 0), 8);
          g.fillStyle = U.mix(S.edge, "#ffffff", 0.35); g.fillRect(x + (!n.l ? 4 : 0), y, T - (!n.l ? 4 : 0) - (!n.r ? 4 : 0), 4);
          if (D.has("grass")) {
            g.fillStyle = S.edge;
            for (let k = 0; k < 3; k++) { const gx = x + ((h >> (k * 3)) % 7) * 4; if ((h >> (k + 5)) & 1) g.fillRect(gx, y - 4, 4, 4); }
            g.fillStyle = U.mix(S.base, "#000000", 0.35); g.fillRect(x + ((h % 3) * 8) + 4, y + 8, 4, 4);
          }
          break;
        case "window": {
          g.fillStyle = S.edge; g.fillRect(x, y, T, 8);
          g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(x, y, T, 2);
          if (!n.r) { g.fillStyle = "rgba(255,255,255,0.85)"; for (let i = 0; i < 3; i++) g.fillRect(x + T - 7 - i * 7, y + 2, 4, 4); }
          break;
        }
        case "term":
          g.fillStyle = S.edge; g.fillRect(x, y, T, 2);
          g.fillStyle = U.rgba(S.edge, 0.35); g.fillRect(x, y + 3, T, 1);
          break;
        case "rust": {
          g.fillStyle = S.edge; g.fillRect(x + l0, y, T - l0 - r0, 2);
          g.fillStyle = "rgba(255,230,200,0.25)"; g.fillRect(x + l0, y + 2, T - l0 - r0, 1);
          g.fillStyle = "#2a1a14";
          const k = h & 15;
          g.fillRect(x + (k % 4) * 7, y + 3, 6, 3); g.fillRect(x + 18 + (k % 3) * 3, y + 3, 5, 2);
          if (D.has("moss") && (h % 5) === 1) { g.fillStyle = "rgba(110,140,60,0.55)"; for (let i = 0; i < 4; i++) g.fillRect(x + 4 + i * 6 + (h >> i) % 3, y - 2 - ((h >> (i + 3)) & 1) * 2, 3, 3); }
          break;
        }
        default: {
          g.fillStyle = S.edge; g.fillRect(x + l0, y, T - l0 - r0, 3);
          g.fillStyle = U.mix(S.edge, "#ffffff", 0.6); g.fillRect(x + l0, y, T - l0 - r0, 1);
          g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(x + l0, y + 3, T - l0 - r0, 1);
          // Dash markers on the rim every other tile.
          if ((h & 3) === 0) { g.fillStyle = U.rgba(S.edge, 0.55); g.fillRect(x + 10, y + 5, 12, 2); }
        }
      }
    }
    if (!n.d) {
      if (D.has("drips") && (h % 6) === 1) {
        g.fillStyle = "rgba(120,60,30,0.55)";
        const dx = x + 6 + (h >> 4) % 20; g.fillRect(dx, y + T, 2, 4 + (h % 6)); g.fillRect(dx - 1, y + T, 4, 2);
      }
      if (D.has("cables") && (h % 9) === 2) {
        g.strokeStyle = U.mix(S.base, "#000000", 0.5); g.lineWidth = 2;
        g.beginPath(); g.moveTo(x + 4, y + T - 1); g.quadraticCurveTo(x + 16, y + T + 12 + (h % 6), x + 28, y + T - 1); g.stroke();
      }
    }
  },

  oneway(g, x, y, S, h, leftJoined, rightJoined) {
    const T = TILE;
    switch (S.oneway) {
      case "pixel":
        g.fillStyle = S.base; g.fillRect(x, y, T, 8);
        g.fillStyle = S.edge; g.fillRect(x, y, T, 4);
        g.fillStyle = S.dark; g.fillRect(x + 12, y + 4, 8, 4);
        break;
      case "bar":
        g.fillStyle = S.base; g.fillRect(x, y, T, 10);
        g.fillStyle = S.edge; g.fillRect(x, y, T, 4);
        g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(x, y, T, 1);
        break;
      case "dashes":
        g.fillStyle = S.edge;
        for (let k = 0; k < 4; k++) g.fillRect(x + 1 + k * 8, y + 1, 6, 3);
        g.fillStyle = U.rgba(S.edge, 0.25); g.fillRect(x, y + 5, T, 2);
        break;
      case "girder": {
        g.fillStyle = U.mix(S.base, "#9a8a80", 0.25); g.fillRect(x, y, T, 9);
        g.fillStyle = S.edge; g.fillRect(x, y, T, 2);
        g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(x, y + 9); g.lineTo(x + 16, y + 2); g.lineTo(x + 32, y + 9); g.stroke();
        g.fillStyle = "rgba(255,255,255,0.15)"; g.fillRect(x + 4, y + 4, 2, 2); g.fillRect(x + 26, y + 4, 2, 2);
        break;
      }
      default: { // "plate": a neon-edged slab with support struts at its ends
        g.fillStyle = S.base; g.fillRect(x, y, T, 10);
        g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(x, y + 8, T, 2);
        g.fillStyle = S.edge; g.fillRect(x, y, T, 2);
        g.fillStyle = U.mix(S.edge, "#ffffff", 0.5); g.fillRect(x, y, T, 1);
        g.fillStyle = U.rgba(S.edge, 0.5); g.fillRect(x + 6, y + 4, 4, 3); g.fillRect(x + 22, y + 4, 4, 3);
        const grd = g.createLinearGradient(0, y - 6, 0, y);
        grd.addColorStop(0, U.rgba(S.edge, 0)); grd.addColorStop(1, U.rgba(S.edge, 0.18));
        g.fillStyle = grd; g.fillRect(x, y - 6, T, 6);
        if (!leftJoined) { g.fillStyle = U.mix(S.base, "#000000", 0.3); g.fillRect(x + 2, y + 10, 3, 6); }
        if (!rightJoined) { g.fillStyle = U.mix(S.base, "#000000", 0.3); g.fillRect(x + T - 5, y + 10, 3, 6); }
      }
    }
  },

  /** A light pulse that travels along lit top edges (per frame, additive). */
  drawPulse(ctx, world, cam) {
    const T = TILE, W = world.w, tiles = world.tiles;
    const c0 = Math.max(0, Math.floor(cam.x / T)), c1 = Math.min(W - 1, Math.floor((cam.x + VIEW_W) / T));
    const r0 = Math.max(1, Math.floor(cam.y / T)), r1 = Math.min(world.h - 1, Math.floor((cam.y + VIEW_H) / T));
    const t = world.time;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let c = c0; c <= c1; c++) {
      const k = Math.sin(t * 0.04 - c * 0.28);
      if (k < 0.93) continue;
      const a = (k - 0.93) / 0.07;
      for (let r = r0; r <= r1; r++) {
        const i = r * W + c;
        if (tiles[i] !== T_SOLID) continue;
        const up = tiles[i - W];
        if (up === T_SOLID || up === T_HIDDEN_SOLID) continue;
        const S = this.specFor(world.tileThemeAt ? world.tileThemeAt(c) : world.theme);
        if (S.style === "window" || S.style === "pixel") continue;
        ctx.globalAlpha = a * 0.6;
        ctx.fillStyle = S.edge;
        ctx.fillRect(c * T, r * T - 1, T, 3);
      }
    }
    ctx.restore();
  },

  /** One interior tile for the theme (used by fake walls), cached. */
  single(theme) {
    if (typeof document === "undefined") return null;
    if (theme._tileSingle) return theme._tileSingle;
    const c = document.createElement("canvas");
    c.width = c.height = TILE;
    const g = c.getContext("2d");
    const S = this.specFor(theme);
    this.body(g, 0, 0, S, 12345, { u: true, d: true, l: true, r: true, depth: 1 }, 3, 3);
    return (theme._tileSingle = c);
  },
};

/** Draw visible tiles (kept as a function for older callers). */
function drawTiles(ctx, world, cam) { Tiles.draw(ctx, world, cam); }

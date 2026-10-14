/* =========================================================================
 * core/render.js — parallax backgrounds and tile-map drawing.
 * Backgrounds are procedural and keyed on theme.style:
 *   "boot" | "stream" | "server" | "orbit" | "mainframe"
 * ========================================================================= */
"use strict";

class Background {
  constructor(theme, seed) {
    this.theme = theme;
    this.style = theme.style || "boot";
    this.rng = U.seeded(seed * 9973 + 17);
    const R = this.rng;
    this.stars = Array.from({ length: 90 }, () => ({
      x: R() * 2000, y: R() * VIEW_H, s: R() * 1.8 + 0.3, tw: R() * 6.28,
    }));
    this.motes = Array.from({ length: 36 }, () => ({
      x: R() * VIEW_W, y: R() * VIEW_H, s: R() * 2 + 1, v: R() * 0.4 + 0.1, ph: R() * 6.28,
    }));
    this.columns = Array.from({ length: 26 }, () => ({
      x: R() * 1400, speed: R() * 2 + 1, len: Math.floor(R() * 10 + 6), off: R() * 600,
    }));
    this.grad = null;
    this.mid = this._buildMid();
    this.far = this._buildFar();
  }

  /** Pre-render a 1024-wide tileable silhouette layer for the given style. */
  _buildMid() {
    if (typeof document === "undefined") return null;
    const W = 1024, H = VIEW_H;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    const R = U.seeded(this.style.length * 131 + 7);
    const acc = this.theme.accent, grid = this.theme.gridColor;
    g.lineCap = "round";
    switch (this.style) {
      case "server": {
        // Rows of server racks with blinking-light slots.
        for (let x = 0; x < W; x += 120) {
          const h = 260 + R() * 160, w = 90;
          g.fillStyle = U.rgba(grid, 0.55);
          g.fillRect(x + 10, H - h, w, h);
          g.strokeStyle = U.rgba(acc, 0.18);
          g.strokeRect(x + 10.5, H - h + 0.5, w, h);
          for (let y = H - h + 14; y < H - 10; y += 18) {
            g.fillStyle = U.rgba(grid, 0.9);
            g.fillRect(x + 18, y, w - 16, 10);
            g.fillStyle = U.rgba(R() < 0.5 ? acc : "#ff9d00", 0.5);
            g.fillRect(x + 22 + R() * 50, y + 3, 4, 4);
          }
        }
        break;
      }
      case "stream": {
        // Tall translucent data pillars.
        for (let x = 0; x < W; x += 64) {
          const h = 140 + R() * 330;
          const grd = g.createLinearGradient(0, H - h, 0, H);
          grd.addColorStop(0, U.rgba(acc, 0));
          grd.addColorStop(1, U.rgba(acc, 0.16));
          g.fillStyle = grd;
          g.fillRect(x + 8, H - h, 22 + R() * 18, h);
        }
        break;
      }
      case "orbit": {
        // Station trusses.
        g.strokeStyle = U.rgba(grid, 0.9);
        g.lineWidth = 3;
        for (let x = 0; x < W; x += 256) {
          const y = 120 + R() * 220;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + 256, y); g.stroke();
          g.beginPath(); g.moveTo(x, y + 30); g.lineTo(x + 256, y + 30); g.stroke();
          for (let k = 0; k < 256; k += 32) {
            g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k + 32, y + 30); g.stroke();
          }
          g.fillStyle = U.rgba(acc, 0.35);
          g.fillRect(x + 100, y + 8, 40, 14);
        }
        break;
      }
      case "mainframe": {
        // Hex lattice.
        g.strokeStyle = U.rgba(grid, 0.55);
        g.lineWidth = 1.5;
        const s = 34;
        for (let y = 0; y < H + s; y += s * 1.5) {
          for (let x = 0; x < W + s; x += s * Math.sqrt(3)) {
            const ox = (Math.round(y / (s * 1.5)) % 2) * (s * Math.sqrt(3)) / 2;
            g.beginPath();
            for (let i = 0; i < 6; i++) {
              const a = Math.PI / 3 * i + Math.PI / 6;
              const px = x + ox + Math.cos(a) * s * 0.9, py = y + Math.sin(a) * s * 0.9;
              i ? g.lineTo(px, py) : g.moveTo(px, py);
            }
            g.closePath();
            g.stroke();
            if (R() < 0.06) { g.fillStyle = U.rgba(acc, 0.07); g.fill(); }
          }
        }
        break;
      }
      default: {
        // "boot": circuit-board traces with solder pads.
        g.strokeStyle = U.rgba(grid, 0.95);
        g.lineWidth = 2;
        for (let i = 0; i < 60; i++) {
          let x = R() * W, y = R() * H;
          g.beginPath(); g.moveTo(x, y);
          for (let k = 0; k < 4; k++) {
            if (R() < 0.5) x += (R() - 0.5) * 220; else y += (R() - 0.5) * 160;
            g.lineTo(x, y);
          }
          g.stroke();
          g.fillStyle = U.rgba(acc, 0.25);
          g.beginPath(); g.arc(x, y, 3, 0, 6.28); g.fill();
        }
      }
    }
    return c;
  }

  _buildFar() {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = 1024; c.height = VIEW_H;
    const g = c.getContext("2d");
    const R = U.seeded(77 + this.style.length);
    g.fillStyle = U.rgba(this.theme.gridColor, 0.35);
    for (let x = 0; x < 1024; x += 40 + R() * 60) {
      const w = 30 + R() * 70, h = 60 + R() * 200;
      g.fillRect(x, VIEW_H - h, w, h);
    }
    return c;
  }

  draw(ctx, cam, time) {
    const th = this.theme;
    if (!this.grad) {
      this.grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      this.grad.addColorStop(0, th.bgTop);
      this.grad.addColorStop(1, th.bgBottom);
    }
    ctx.fillStyle = this.grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Stars / distant lights.
    ctx.fillStyle = "#ffffff";
    for (const s of this.stars) {
      const x = ((s.x - cam.x * 0.04) % 2000 + 2000) % 2000 - 500;
      if (x < -5 || x > VIEW_W + 5) continue;
      ctx.globalAlpha = 0.25 + 0.25 * Math.sin(time * 0.03 + s.tw);
      ctx.fillRect(x, s.y - cam.y * 0.02, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // Style specific "big object".
    if (this.style === "orbit") {
      const px = 700 - cam.x * 0.02, py = 150 - cam.y * 0.02;
      const grd = ctx.createRadialGradient(px - 30, py - 30, 10, px, py, 120);
      grd.addColorStop(0, U.mix(th.accent, "#ffffff", 0.3));
      grd.addColorStop(1, th.bgBottom);
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(px, py, 110, 0, 6.28); ctx.fill();
      ctx.strokeStyle = U.rgba(th.accent, 0.35); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(px, py, 190, 34, -0.3, 0, 6.28); ctx.stroke();
    } else if (this.style === "mainframe") {
      const px = VIEW_W / 2 - cam.x * 0.015, py = 200 - cam.y * 0.02;
      ctx.strokeStyle = U.rgba(th.accent, 0.12); ctx.lineWidth = 10;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(px, py, 120 + i * 60, time * 0.004 * (i + 1), time * 0.004 * (i + 1) + 4.2);
        ctx.stroke();
      }
    }

    // Far silhouettes.
    if (this.far) this._tileLayer(ctx, this.far, cam.x * 0.1, cam.y * 0.05 + 40, 0.8);
    // Mid layer.
    if (this.mid) this._tileLayer(ctx, this.mid, cam.x * 0.25, cam.y * 0.1, 1);

    // Falling data columns.
    if (this.style === "stream" || this.style === "mainframe" || this.style === "boot") {
      ctx.font = "12px monospace";
      ctx.fillStyle = th.accent;
      const n = this.style === "stream" ? this.columns.length : 10;
      for (let i = 0; i < n; i++) {
        const col = this.columns[i];
        const x = ((col.x - cam.x * 0.4) % 1400 + 1400) % 1400 - 200;
        if (x < -10 || x > VIEW_W) continue;
        const head = ((time * col.speed + col.off) % (VIEW_H + 300)) - 150;
        for (let k = 0; k < col.len; k++) {
          ctx.globalAlpha = (1 - k / col.len) * 0.22;
          ctx.fillText(((i * 7 + k * 3 + (time >> 4)) & 1) ? "1" : "0", x, head - k * 14);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Near grid.
    ctx.strokeStyle = U.rgba(th.gridColor, 0.5);
    ctx.lineWidth = 1;
    const gs = 64;
    const gx = -((cam.x * 0.5) % gs), gy = -((cam.y * 0.5) % gs);
    ctx.beginPath();
    for (let x = gx; x < VIEW_W; x += gs) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, VIEW_H); }
    for (let y = gy; y < VIEW_H; y += gs) { ctx.moveTo(0, y + 0.5); ctx.lineTo(VIEW_W, y + 0.5); }
    ctx.stroke();

    // Floating motes.
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = th.accent;
    for (const m of this.motes) {
      m.y -= m.v; if (m.y < -5) { m.y = VIEW_H + 5; }
      const x = ((m.x + Math.sin(time * 0.01 + m.ph) * 20 - cam.x * 0.15) % VIEW_W + VIEW_W) % VIEW_W;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(x, m.y, m.s, m.s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  _tileLayer(ctx, img, ox, oy, alpha) {
    const w = img.width;
    let x = -(((ox % w) + w) % w);
    ctx.globalAlpha = alpha;
    const y = Math.round(U.clamp(-oy * 0.3, -30, 30)) + 20;
    for (; x < VIEW_W; x += w) ctx.drawImage(img, Math.round(x), y);
    ctx.globalAlpha = 1;
  }
}

/** Draw visible tiles. Batched by colour to keep state changes low. */
function drawTiles(ctx, world, cam) {
  const th = world.theme;
  const T = TILE;
  const c0 = Math.max(0, Math.floor(cam.x / T)), c1 = Math.min(world.w - 1, Math.floor((cam.x + VIEW_W) / T));
  const r0 = Math.max(0, Math.floor(cam.y / T)), r1 = Math.min(world.h - 1, Math.floor((cam.y + VIEW_H) / T));
  const tiles = world.tiles, W = world.w;
  const solid = (c, r) => {
    if (c < 0 || c >= W || r < 0 || r >= world.h) return true;
    const t = tiles[r * W + c];
    return t === T_SOLID || t === T_HIDDEN_SOLID;
  };

  // Pass 1: block bodies.
  ctx.fillStyle = th.tileFill;
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++)
      if (tiles[r * W + c] === T_SOLID) ctx.fillRect(c * T, r * T, T, T);

  // Pass 2: inner panel + circuit detail on exposed tiles.
  ctx.fillStyle = th.tileInner;
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      if (tiles[r * W + c] !== T_SOLID) continue;
      const h = (c * 73856093) ^ (r * 19349663);
      if ((h & 7) === 0) ctx.fillRect(c * T + 6, r * T + 6, T - 12, T - 12);
      else if ((h & 7) === 1) ctx.fillRect(c * T + 4, r * T + 14, T - 8, 3);
    }

  // Pass 3: neon edges where a block touches air.
  ctx.fillStyle = th.accent;
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      if (tiles[r * W + c] !== T_SOLID) continue;
      if (!solid(c, r - 1)) ctx.fillRect(c * T, r * T, T, 3);
    }
  ctx.fillStyle = th.edgeDim;
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      if (tiles[r * W + c] !== T_SOLID) continue;
      if (!solid(c - 1, r)) ctx.fillRect(c * T, r * T, 2, T);
      if (!solid(c + 1, r)) ctx.fillRect(c * T + T - 2, r * T, 2, T);
      if (!solid(c, r + 1)) ctx.fillRect(c * T, r * T + T - 2, T, 2);
    }
  // Soft glow above lit edges.
  ctx.fillStyle = th.edgeGlow;
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      if (tiles[r * W + c] === T_SOLID && !solid(c, r - 1)) ctx.fillRect(c * T, r * T - 5, T, 5);
    }

  // One-way platforms.
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      if (tiles[r * W + c] !== T_ONEWAY) continue;
      ctx.fillStyle = th.tileFill;
      ctx.fillRect(c * T, r * T, T, 10);
      ctx.fillStyle = th.accent;
      ctx.fillRect(c * T, r * T, T, 2);
      ctx.fillStyle = th.edgeDim;
      ctx.fillRect(c * T + 6, r * T + 4, 4, 4);
      ctx.fillRect(c * T + 22, r * T + 4, 4, 4);
    }
}

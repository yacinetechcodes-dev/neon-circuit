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
      case "desktop": {
        // Soft diagonal light rays.
        for (let i = 0; i < 6; i++) {
          const x0 = R() * W;
          g.fillStyle = U.rgba("#ffffff", 0.035 + R() * 0.03);
          g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + 90, 0); g.lineTo(x0 - 160, H); g.lineTo(x0 - 260, H); g.closePath(); g.fill();
        }
        // Desktop icon grid (folders and files — plain shapes).
        for (let k = 0; k < 6; k++) {
          const x = 24, y = 30 + k * 64;
          if (k % 2) {
            g.fillStyle = U.rgba("#ffb300", 0.55); g.fillRect(x, y + 6, 34, 24); g.fillRect(x, y + 2, 14, 6);
          } else {
            g.fillStyle = U.rgba("#f4f8fc", 0.55); g.fillRect(x + 6, y, 24, 30);
            g.fillStyle = U.rgba("#4fc3ff", 0.6); g.fillRect(x + 10, y + 8, 16, 3); g.fillRect(x + 10, y + 14, 12, 3);
          }
          g.fillStyle = U.rgba("#ffffff", 0.35); g.fillRect(x + 2, y + 36, 30, 4);
        }
        // Faint floating window frames.
        for (let i = 0; i < 5; i++) {
          const x = 140 + R() * (W - 260), y = 40 + R() * 260, w = 120 + R() * 140, h = 80 + R() * 90;
          g.fillStyle = U.rgba("#ffffff", 0.05); g.fillRect(x, y, w, h);
          g.fillStyle = U.rgba(acc, 0.12); g.fillRect(x, y, w, 10);
          g.strokeStyle = U.rgba("#ffffff", 0.12); g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w, h);
        }
        break;
      }
      case "term": {
        // Directory trees and package listings in dim monospace.
        g.font = "12px monospace";
        const dirs = ["/", "home", "proc", "usr", "var", "etc", "tmp", "dev", "lib", "opt", "srv", "boot"];
        for (let x = 30; x < W; x += 200) {
          let y = 40 + R() * 80;
          g.fillStyle = U.rgba(acc, 0.22);
          g.fillText("$ tree /" + dirs[Math.floor(R() * dirs.length)], x, y);
          g.fillStyle = U.rgba("#d3d7cf", 0.12);
          const n = 5 + Math.floor(R() * 6);
          for (let k = 0; k < n; k++) {
            const deep = R() < 0.4 ? "\u2502   " : "";
            const last = k === n - 1 ? "\u2514\u2500\u2500 " : "\u251c\u2500\u2500 ";
            g.fillText(deep + last + dirs[Math.floor(R() * dirs.length)] + (R() < 0.3 ? ".pkg" : ""), x, y + 18 + k * 16);
          }
        }
        // Package crates stacked along the bottom.
        for (let x = 10; x < W; x += 90 + R() * 80) {
          const h = 1 + Math.floor(R() * 3);
          for (let k = 0; k < h; k++) {
            g.fillStyle = U.rgba("#8f6a3e", 0.22); g.fillRect(x, H - 40 - k * 36, 34, 34);
            g.fillStyle = U.rgba("#d9c9a3", 0.18); g.fillRect(x + 14, H - 40 - k * 36, 6, 34);
          }
        }
        break;
      }
      case "ruin": {
        // Broken skyline: jagged towers with empty window holes and bent girders.
        for (let x = -20; x < W; x += 70 + R() * 60) {
          const w = 50 + R() * 70, h = 140 + R() * 220, top = H - h;
          g.fillStyle = U.rgba("#2a1a14", 0.85);
          g.beginPath(); g.moveTo(x, H); g.lineTo(x, top + R() * 30);
          for (let k = 1; k <= 4; k++) g.lineTo(x + (w * k) / 4, top + R() * 50);
          g.lineTo(x + w, H); g.closePath(); g.fill();
          g.fillStyle = U.rgba("#ff8a3a", 0.12);
          for (let yy = top + 50; yy < H - 20; yy += 26) for (let xx = x + 8; xx < x + w - 12; xx += 18) if (R() < 0.35) g.fillRect(xx, yy, 8, 12);
          if (R() < 0.5) {
            g.strokeStyle = U.rgba("#5d4a40", 0.9); g.lineWidth = 4;
            g.beginPath(); g.moveTo(x + w * 0.5, top + 20); g.lineTo(x + w * 0.5 + 20, top - 30); g.lineTo(x + w * 0.5 + 50, top - 20); g.stroke();
          }
        }
        break;
      }
      case "pixel": {
        const P8 = 8;
        const snap = (v) => Math.round(v / P8) * P8;
        // Blocky clouds.
        for (let i = 0; i < 7; i++) {
          const cx = snap(R() * W), cy = snap(40 + R() * 140);
          g.fillStyle = U.rgba("#fff1e8", 0.1);
          for (const [dx, dy, w, h] of [[0, 8, 64, 16], [16, 0, 32, 8], [8, 24, 48, 8]]) g.fillRect(cx + dx, cy + dy, w, h);
        }
        // Stepped hills.
        g.fillStyle = U.rgba(grid, 0.95);
        for (let x = 0; x < W; x += P8) {
          const hgt = snap(110 + Math.sin(x * 0.012) * 50 + Math.sin(x * 0.031) * 22);
          g.fillRect(x, H - hgt, P8, hgt);
        }
        // Castle towers with crenellations.
        for (let x = 60; x < W; x += 260) {
          const tw = 48, th = snap(150 + R() * 90);
          g.fillStyle = U.rgba(grid, 0.8);
          g.fillRect(x, H - th, tw, th);
          for (let k = 0; k < tw; k += 16) g.fillRect(x + k, H - th - 8, 8, 8);
          g.fillStyle = U.rgba(acc, 0.35);
          g.fillRect(x + 20, H - th + 24, 8, 16);
        }
        break;
      }
      case "hack": {
        // File-system silhouettes: directory trees and folder tabs.
        g.font = "11px monospace";
        const names = ["/root", "/sys", "/bin", "/etc", "/var/log", "/dev/null", "/proc", "/usr/lib"];
        for (let x = 20; x < W; x += 170) {
          let y = 60 + R() * 120;
          g.fillStyle = U.rgba(acc, 0.2);
          g.fillText(names[Math.floor(R() * names.length)], x, y);
          g.strokeStyle = U.rgba(grid, 0.9); g.lineWidth = 1.5;
          for (let k = 0; k < 6; k++) {
            const yy = y + 18 + k * 34;
            g.beginPath(); g.moveTo(x + 4, y + 6); g.lineTo(x + 4, yy + 8); g.lineTo(x + 18, yy + 8); g.stroke();
            g.fillStyle = U.rgba(grid, 0.95);
            g.fillRect(x + 20, yy, 26, 16);
            g.fillRect(x + 20, yy - 4, 11, 5);
            g.fillStyle = U.rgba(acc, 0.12 + R() * 0.12);
            g.fillRect(x + 50, yy + 5, 30 + R() * 50, 5);
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
    const pixelStars = this.style === "pixel";
    for (const s of this.stars) {
      const x = ((s.x - cam.x * 0.04) % 2000 + 2000) % 2000 - 500;
      if (x < -5 || x > VIEW_W + 5) continue;
      if (pixelStars) {
        ctx.globalAlpha = Math.sin(time * 0.03 + s.tw) > 0.6 ? 0.8 : 0.35;
        const z = s.s > 1.4 ? 4 : 2;
        ctx.fillRect(Math.round(x / 2) * 2, Math.round((s.y - cam.y * 0.02) / 2) * 2, z, z);
        continue;
      }
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
    } else if (this.style === "ruin") {
      // A low, hazy sun behind the smoke.
      const px = 640 - cam.x * 0.02, py = 210 - cam.y * 0.02;
      U.glow(ctx, px, py, 220, "#ffb347", 0.35);
      ctx.fillStyle = "rgba(255,190,110,0.55)";
      ctx.beginPath(); ctx.arc(px, py, 60, 0, 6.28); ctx.fill();
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
    if (this.style === "stream" || this.style === "mainframe" || this.style === "boot" || this.style === "hack") {
      ctx.font = "12px monospace";
      ctx.fillStyle = th.accent;
      const hack = this.style === "hack";
      const n = this.style === "stream" || hack ? this.columns.length : 10;
      for (let i = 0; i < n; i++) {
        const col = this.columns[i];
        const x = ((col.x - cam.x * 0.4) % 1400 + 1400) % 1400 - 200;
        if (x < -10 || x > VIEW_W) continue;
        const head = ((time * col.speed + col.off) % (VIEW_H + 300)) - 150;
        for (let k = 0; k < col.len; k++) {
          ctx.globalAlpha = (1 - k / col.len) * (hack ? 0.3 : 0.22);
          const ch = hack ? "0123456789ABCDEF{}<>/$#"[(i * 7 + k * 5 + (time >> 3)) % 23] : ((i * 7 + k * 3 + (time >> 4)) & 1) ? "1" : "0";
          ctx.fillText(ch, x, head - k * 14);
        }
      }
      ctx.globalAlpha = 1;
      if (hack && time % 140 < 6) {
        // Brief glitch: displaced bright bars.
        const r = U.seeded(Math.floor(time / 140) + 1);
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = U.rgba(k % 2 ? "#ff3df0" : th.accent, 0.18);
          ctx.fillRect(r() * VIEW_W - 100, r() * VIEW_H, 140 + r() * 300, 2 + r() * 6);
        }
      }
    }

    if (this.style === "pixel") return; // 8-bit look: no smooth grid or motes
    if (this.style === "term") {
      // Process monitor: live-looking CPU / MEM bars in a panel.
      const pw = 280, ph = 150, px = VIEW_W - pw - 200, py = 170; // clear of the HUD and mini map
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "rgba(20,20,20,0.75)"; ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = "rgba(252,175,62,0.35)"; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, pw, ph);
      ctx.font = "11px monospace"; ctx.fillStyle = "rgba(211,215,207,0.55)";
      ctx.fillText("PID  CPU%  COMMAND", px + 10, py + 18);
      for (let i = 0; i < 6; i++) {
        const v = 0.5 + 0.5 * Math.sin(time * (0.02 + i * 0.007) + i * 1.7);
        ctx.fillStyle = "rgba(211,215,207,0.4)"; ctx.fillText(String(100 + i * 37), px + 10, py + 38 + i * 18);
        ctx.fillStyle = v > 0.8 ? "rgba(239,41,41,0.6)" : "rgba(138,226,52,0.5)";
        ctx.fillRect(px + 52, py + 30 + i * 18, (pw - 70) * v, 8);
      }
      // Blinking prompt at the bottom left.
      ctx.font = "14px monospace"; ctx.fillStyle = "rgba(138,226,52,0.35)";
      ctx.fillText("user@host:~$ ", 40, VIEW_H - 140);
      if (Math.floor(time / 30) % 2) ctx.fillRect(152, VIEW_H - 152, 9, 15);
      // Faint scanlines.
      ctx.fillStyle = "rgba(255,255,255,0.025)";
      for (let y = 0; y < VIEW_H; y += 4) ctx.fillRect(0, y, VIEW_W, 1);
      return;
    }
    if (this.style === "ruin") {
      // Drifting smoke bands and falling sparks / ash.
      for (let i = 0; i < 5; i++) {
        const y = 80 + i * 90 + Math.sin(time * 0.004 + i) * 20;
        const x = ((i * 377 - cam.x * (0.15 + i * 0.05) - time * (0.2 + i * 0.05)) % 1600 + 1600) % 1600 - 400;
        ctx.fillStyle = `rgba(60,45,40,${0.18 + (i % 2) * 0.08})`;
        ctx.beginPath(); ctx.ellipse(x, y, 260, 34, 0, 0, 6.28); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + 700, y + 20, 200, 26, 0, 0, 6.28); ctx.fill();
      }
      for (const m of this.motes) {
        m.y += m.v * 2.2; if (m.y > VIEW_H + 5) m.y = -5;
        const x = ((m.x + Math.sin(time * 0.02 + m.ph) * 16 - cam.x * 0.2) % VIEW_W + VIEW_W) % VIEW_W;
        ctx.fillStyle = m.s > 2.2 ? "rgba(255,200,120,0.7)" : "rgba(200,180,170,0.35)";
        ctx.fillRect(x, m.y, m.s, m.s);
      }
      return;
    }
    if (this.style === "desktop") {
      const px = 560 - cam.x * 0.05, py = 70 - cam.y * 0.03, pw = 300, ph = 150;
      ctx.fillStyle = "rgba(11,61,145,0.45)"; ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.strokeRect(px + 0.5, py + 0.5, pw, ph);
      for (let i = 0; i < 6; i++) {                 // loading circle
        const a = time * 0.09 + i * 0.45;
        ctx.fillStyle = `rgba(255,255,255,${0.15 + i * 0.12})`;
        ctx.beginPath(); ctx.arc(px + pw / 2 + Math.cos(a) * 16, py + 50 + Math.sin(a) * 16, 3, 0, 6.28); ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(px + 40, py + 96, pw - 80, 6);
      ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fillRect(px + 40, py + 96, (pw - 80) * ((time * 0.0015) % 1), 6);
      ctx.font = "12px monospace"; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillText(`Please wait... ${Math.floor(((time * 0.0015) % 1) * 100)}%`, px + pw / 2, py + 126);
      ctx.textAlign = "left";
      return;
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
  if (th.tileStyle === "pixel") return drawPixelTiles(ctx, world, cam);
  if (th.tileStyle === "window") return drawWindowTiles(ctx, world, cam);
  if (th.tileStyle === "rust") return drawRustTiles(ctx, world, cam);
  if (th.tileStyle === "term") return drawTermTiles(ctx, world, cam);
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

/** 8-bit tiles: bricks on a 4px grid, a bright chunky top edge where exposed. */
function drawPixelTiles(ctx, world, cam) {
  const th = world.theme, T = TILE, W = world.w, tiles = world.tiles;
  const c0 = Math.max(0, Math.floor(cam.x / T)), c1 = Math.min(W - 1, Math.floor((cam.x + VIEW_W) / T));
  const r0 = Math.max(0, Math.floor(cam.y / T)), r1 = Math.min(world.h - 1, Math.floor((cam.y + VIEW_H) / T));
  const solid = (c, r) => {
    if (c < 0 || c >= W || r < 0 || r >= world.h) return true;
    const t = tiles[r * W + c];
    return t === T_SOLID || t === T_HIDDEN_SOLID;
  };
  const light = th.tileLight || U.mix(th.tileFill, "#ffffff", 0.25);
  const dark = th.tileDark || U.mix(th.tileFill, "#000000", 0.45);
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const t = tiles[r * W + c];
      const x = c * T, y = r * T;
      if (t === T_ONEWAY) {
        ctx.fillStyle = th.tileFill; ctx.fillRect(x, y, T, 8);
        ctx.fillStyle = th.accent; ctx.fillRect(x, y, T, 4);
        ctx.fillStyle = dark; ctx.fillRect(x + 12, y + 4, 8, 4);
        continue;
      }
      if (t !== T_SOLID) continue;
      ctx.fillStyle = th.tileFill; ctx.fillRect(x, y, T, T);
      // Mortar: two brick rows per tile, offset every other row.
      ctx.fillStyle = dark;
      ctx.fillRect(x, y + 12, T, 4); ctx.fillRect(x, y + 28, T, 4);
      ctx.fillRect(x + ((r % 2) ? 4 : 20), y, 4, 12);
      ctx.fillRect(x + ((r % 2) ? 20 : 4), y + 16, 4, 12);
      ctx.fillStyle = light;
      ctx.fillRect(x, y, 4, 4);
      if (!solid(c, r - 1)) {
        ctx.fillStyle = th.accent; ctx.fillRect(x, y, T, 8);
        ctx.fillStyle = dark;
        ctx.fillRect(x + ((c * 7) % 3) * 8 + 4, y + 8, 4, 4);
      }
    }
}

/** Desktop tiles: light window panels with blue title bars along exposed tops;
 *  floors in the bottom rows are drawn as a dark taskbar. */
function drawWindowTiles(ctx, world, cam) {
  const th = world.theme, T = TILE, W = world.w, tiles = world.tiles;
  const c0 = Math.max(0, Math.floor(cam.x / T)), c1 = Math.min(W - 1, Math.floor((cam.x + VIEW_W) / T));
  const r0 = Math.max(0, Math.floor(cam.y / T)), r1 = Math.min(world.h - 1, Math.floor((cam.y + VIEW_H) / T));
  const solid = (c, r) => {
    if (c < 0 || c >= W || r < 0 || r >= world.h) return true;
    const t = tiles[r * W + c];
    return t === T_SOLID || t === T_HIDDEN_SOLID;
  };
  const taskbarRow = world.h - 4;
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const t = tiles[r * W + c];
      const x = c * T, y = r * T;
      if (t === T_ONEWAY) {
        ctx.fillStyle = th.tileFill; ctx.fillRect(x, y, T, 10);
        ctx.fillStyle = th.accent; ctx.fillRect(x, y, T, 4);
        continue;
      }
      if (t !== T_SOLID) continue;
      const top = !solid(c, r - 1);
      if (r >= taskbarRow) {
        ctx.fillStyle = "#1b2330"; ctx.fillRect(x, y, T, T);
        if (top) {
          ctx.fillStyle = "#2b3648"; ctx.fillRect(x, y, T, 3);
          if (c % 2 === 0) { ctx.fillStyle = (c % 6 === 0) ? th.accent : "#5b6b82"; ctx.fillRect(x + 9, y + 9, 14, 14); }
        }
        continue;
      }
      ctx.fillStyle = th.tileFill; ctx.fillRect(x, y, T, T);
      ctx.fillStyle = th.tileDark || "#c9d3df";
      if (!solid(c - 1, r)) ctx.fillRect(x, y, 2, T);
      if (!solid(c + 1, r)) ctx.fillRect(x + T - 2, y, 2, T);
      if (!solid(c, r + 1)) ctx.fillRect(x, y + T - 2, T, 2);
      if (top) {
        ctx.fillStyle = th.accent; ctx.fillRect(x, y, T, 8);
        // Title-bar buttons at the right end of each window's top edge.
        const barContinues = solid(c + 1, r) && !solid(c + 1, r - 1);
        if (!barContinues) {
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          for (let i = 0; i < 3; i++) ctx.fillRect(x + T - 7 - i * 7, y + 2, 4, 4);
        }
      } else if ((c + r) % 5 === 0) {
        ctx.fillStyle = th.tileDark || "#c9d3df"; ctx.fillRect(x + 8, y + 12, 16, 3);
      }
    }
}

/** Ruined-city tiles: rusted plates with rivets, scorched edges and a jagged
 *  broken top on exposed surfaces. */
function drawRustTiles(ctx, world, cam) {
  const th = world.theme, T = TILE, W = world.w, tiles = world.tiles;
  const c0 = Math.max(0, Math.floor(cam.x / T)), c1 = Math.min(W - 1, Math.floor((cam.x + VIEW_W) / T));
  const r0 = Math.max(0, Math.floor(cam.y / T)), r1 = Math.min(world.h - 1, Math.floor((cam.y + VIEW_H) / T));
  const solid = (c, r) => {
    if (c < 0 || c >= W || r < 0 || r >= world.h) return true;
    const t = tiles[r * W + c];
    return t === T_SOLID || t === T_HIDDEN_SOLID;
  };
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const t = tiles[r * W + c];
      const x = c * T, y = r * T;
      if (t === T_ONEWAY) {
        // Steel girder.
        ctx.fillStyle = "#5d5550"; ctx.fillRect(x, y, T, 8);
        ctx.fillStyle = th.accent; ctx.fillRect(x, y, T, 2);
        ctx.fillStyle = "#2a1a14"; ctx.fillRect(x + 6, y + 3, 4, 3); ctx.fillRect(x + 22, y + 3, 4, 3);
        continue;
      }
      if (t !== T_SOLID) continue;
      const h = (c * 73856093) ^ (r * 19349663);
      ctx.fillStyle = (h & 3) === 0 ? th.tileDark : th.tileFill; ctx.fillRect(x, y, T, T);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      if ((h & 7) === 1) { ctx.fillRect(x + 5, y + 5, 3, 3); ctx.fillRect(x + T - 8, y + T - 8, 3, 3); }
      if ((h & 7) === 2) ctx.fillRect(x + 4, y + 15, T - 8, 2);
      if (!solid(c - 1, r)) { ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(x, y, 3, T); }
      if (!solid(c + 1, r)) { ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(x + T - 3, y, 3, T); }
      if (!solid(c, r - 1)) {
        // Broken, scorched top edge.
        ctx.fillStyle = th.accent; ctx.fillRect(x, y, T, 3);
        ctx.fillStyle = "#3a2a22";
        const k = h & 15;
        ctx.fillRect(x + (k % 4) * 7, y + 3, 6, 3); ctx.fillRect(x + 18 + (k % 3) * 3, y + 3, 5, 2);
      }
    }
}

/** Terminal tiles: dark character cells, a bright prompt-coloured top edge,
 *  and the odd dim glyph so walls read like ASCII art. */
function drawTermTiles(ctx, world, cam) {
  const th = world.theme, T = TILE, W = world.w, tiles = world.tiles;
  const c0 = Math.max(0, Math.floor(cam.x / T)), c1 = Math.min(W - 1, Math.floor((cam.x + VIEW_W) / T));
  const r0 = Math.max(0, Math.floor(cam.y / T)), r1 = Math.min(world.h - 1, Math.floor((cam.y + VIEW_H) / T));
  const solid = (c, r) => {
    if (c < 0 || c >= W || r < 0 || r >= world.h) return true;
    const t = tiles[r * W + c];
    return t === T_SOLID || t === T_HIDDEN_SOLID;
  };
  const GLYPHS = "#$/_|{}<>;:~*";
  ctx.font = "14px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const t = tiles[r * W + c];
      const x = c * T, y = r * T;
      if (t === T_ONEWAY) {
        ctx.fillStyle = th.accent;
        for (let k = 0; k < 4; k++) ctx.fillRect(x + 1 + k * 8, y + 1, 6, 3);
        ctx.fillStyle = "rgba(252,175,62,0.25)"; ctx.fillRect(x, y + 5, T, 2);
        continue;
      }
      if (t !== T_SOLID) continue;
      ctx.fillStyle = th.tileFill; ctx.fillRect(x, y, T, T);
      ctx.fillStyle = th.tileDark; ctx.fillRect(x, y + T - 1, T, 1); ctx.fillRect(x + T - 1, y, 1, T);
      const h = ((c * 73856093) ^ (r * 19349663)) >>> 0;
      if (h % 7 === 0) { ctx.fillStyle = "rgba(211,215,207,0.12)"; ctx.fillText(GLYPHS[h % GLYPHS.length], x + 16, y + 17); }
      if (!solid(c, r - 1)) { ctx.fillStyle = th.accent; ctx.fillRect(x, y, T, 2); }
      if (!solid(c - 1, r)) { ctx.fillStyle = "rgba(252,175,62,0.35)"; ctx.fillRect(x, y, 1, T); }
      if (!solid(c + 1, r)) { ctx.fillStyle = "rgba(252,175,62,0.35)"; ctx.fillRect(x + T - 1, y, 1, T); }
    }
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}

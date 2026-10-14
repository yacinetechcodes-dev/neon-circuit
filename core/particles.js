/* =========================================================================
 * core/particles.js — pooled particle system (additive neon sparks).
 * ========================================================================= */
"use strict";

class Particles {
  constructor(max = 900) {
    this.max = max;
    this.list = [];
    this.pool = [];
  }

  /**
   * Spawn one particle.
   * o: { vx, vy, life, size, color, grav, drag, shape: "dot"|"square"|"ring"|"line", shrink }
   */
  emit(x, y, o = {}) {
    if (this.list.length >= this.max) return;
    const p = this.pool.pop() || {};
    p.x = x; p.y = y;
    p.vx = o.vx || 0; p.vy = o.vy || 0;
    p.life = p.maxLife = o.life || 30;
    p.size = o.size || 3;
    p.color = o.color || "#00f0ff";
    p.grav = o.grav || 0;
    p.drag = o.drag == null ? 0.96 : o.drag;
    p.shape = o.shape || "dot";
    p.shrink = o.shrink !== false;
    p.glow = !!o.glow;
    this.list.push(p);
  }

  /** Radial burst of n sparks. */
  burst(x, y, n, color, speed = 4, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.emit(x, y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: (o.life || 28) * (0.6 + Math.random() * 0.6),
        size: o.size || U.rand(1.5, 3.5), color, grav: o.grav || 0,
        shape: o.shape || (Math.random() < 0.3 ? "square" : "dot"),
        glow: o.glow,
      });
    }
  }

  ring(x, y, color, size = 26, life = 22) {
    this.emit(x, y, { shape: "ring", size, life, color, shrink: false });
  }

  /** Small puff of dust at feet. */
  dust(x, y, color = "#8fb8ff", n = 6, dir = 0) {
    for (let i = 0; i < n; i++) {
      this.emit(x + U.rand(-6, 6), y, {
        vx: U.rand(-1.5, 1.5) + dir, vy: U.rand(-1.4, -0.2),
        life: U.randInt(14, 24), size: U.rand(1.5, 3), color, shape: "square",
      });
    }
  }

  update() {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.grav;
      p.x += p.vx; p.y += p.vy;
      if (--p.life <= 0) {
        L[i] = L[L.length - 1];
        L.pop();
        this.pool.push(p);
      }
    }
  }

  clear() {
    while (this.list.length) this.pool.push(this.list.pop());
  }

  draw(ctx, cam) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const x0 = cam.x - 20, y0 = cam.y - 20, x1 = cam.x + VIEW_W + 20, y1 = cam.y + VIEW_H + 20;
    for (const p of this.list) {
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      const t = p.life / p.maxLife;
      const s = p.shrink ? p.size * t : p.size;
      ctx.globalAlpha = Math.min(1, t * 1.5);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      switch (p.shape) {
        case "square":
          ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
          break;
        case "ring":
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.2 - t), 0, Math.PI * 2);
          ctx.stroke();
          break;
        case "line":
          ctx.lineWidth = s;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3);
          ctx.stroke();
          break;
        default:
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.5, s), 0, Math.PI * 2);
          ctx.fill();
      }
      if (p.glow) U.glow(ctx, p.x, p.y, s * 4, p.color, t * 0.6);
    }
    ctx.restore();
  }
}

/* =========================================================================
 * core/particles.js — pooled particle system.
 *
 * Shapes: dot, square, ring, line, spark (streak along its motion), smoke
 * (soft puff, normal blending), shard (spinning debris), star (twinkle),
 * glow (soft light blob). Smoke and debris draw first with normal blending,
 * everything else is additive neon.
 *
 * The cap and burst sizes follow the graphics quality (Gfx.q).
 * ========================================================================= */
"use strict";

class Particles {
  constructor(max) {
    this.maxFixed = max || 0;
    this.list = [];
    this.pool = [];
  }
  get max() { return this.maxFixed || (typeof Gfx !== "undefined" && Gfx.q ? Gfx.q.particles : 900); }
  /** Scale a particle count by the quality setting (at least 1 when n > 0). */
  n(count) {
    const k = typeof Gfx !== "undefined" && Gfx.q ? Gfx.q.fx : 1;
    return count > 0 ? Math.max(1, Math.round(count * k)) : 0;
  }

  /**
   * Spawn one particle.
   * o: { vx, vy, life, size, color, grav, drag, shape, shrink, glow, grow, rot, vr, alpha }
   */
  emit(x, y, o = {}) {
    if (this.list.length >= this.max) return null;
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
    p.grow = o.grow || 0;
    p.rot = o.rot == null ? Math.random() * 6.28 : o.rot;
    p.vr = o.vr || 0;
    p.alpha = o.alpha == null ? 1 : o.alpha;
    p.normal = p.shape === "smoke" || p.shape === "shard";
    this.list.push(p);
    return p;
  }

  /** Radial burst of n sparks. */
  burst(x, y, n, color, speed = 4, o = {}) {
    n = this.n(n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.emit(x, y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: (o.life || 28) * (0.6 + Math.random() * 0.6),
        size: o.size || U.rand(1.5, 3.5), color, grav: o.grav || 0,
        shape: o.shape || (Math.random() < 0.25 ? "square" : Math.random() < 0.5 ? "spark" : "dot"),
        glow: o.glow,
      });
    }
  }

  ring(x, y, color, size = 26, life = 22) {
    this.emit(x, y, { shape: "ring", size, life, color, shrink: false });
  }

  /** Small puff of dust at feet. */
  dust(x, y, color = "#8fb8ff", n = 6, dir = 0) {
    n = this.n(n);
    for (let i = 0; i < n; i++) {
      this.emit(x + U.rand(-6, 6), y, {
        vx: U.rand(-1.5, 1.5) + dir, vy: U.rand(-1.4, -0.2),
        life: U.randInt(14, 24), size: U.rand(1.5, 3), color, shape: "square",
      });
    }
  }

  /** Soft landing puff: two smoke curls rolling out sideways. */
  puff(x, y, color = "#9fb4d8", strength = 1) {
    const n = this.n(Math.round(4 + strength * 4));
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      this.emit(x + side * U.rand(2, 8), y - 2, {
        vx: side * U.rand(0.8, 2.2) * strength, vy: U.rand(-0.6, -0.1), drag: 0.9,
        life: U.randInt(18, 30), size: U.rand(3, 5), grow: 0.25, color, shape: "smoke", alpha: 0.5,
      });
    }
  }

  /** Impact: bright flash, sparks flying back along the hit. */
  hit(x, y, color, dirX = 0) {
    this.emit(x, y, { shape: "glow", size: 22, life: 8, color, shrink: true });
    const n = this.n(8);
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(U.rand(-1, 1), dirX ? -dirX : U.rand(-1, 1)) + U.rand(-0.9, 0.9);
      const s = U.rand(2, 6);
      this.emit(x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: U.randInt(10, 18), size: U.rand(1.5, 2.5), color: i % 3 ? color : "#ffffff", shape: "spark", drag: 0.9 });
    }
    this.ring(x, y, color, 14, 10);
  }

  /** Explosion: flash, shockwave, sparks, debris and smoke. size ~ radius in px. */
  explode(x, y, color, size = 24) {
    const k = size / 24;
    this.emit(x, y, { shape: "glow", size: 46 * k, life: 12, color: "#ffffff" });
    this.emit(x, y, { shape: "glow", size: 70 * k, life: 18, color });
    this.ring(x, y, color, 34 * k, 20);
    this.ring(x, y, "#ffffff", 20 * k, 12);
    const ns = this.n(Math.round(18 * Math.sqrt(k)));
    for (let i = 0; i < ns; i++) {
      const a = Math.random() * 6.28, s = U.rand(2, 7) * Math.sqrt(k);
      this.emit(x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: U.randInt(14, 30), size: U.rand(1.5, 3), color: i % 4 ? color : "#ffffff", shape: "spark", drag: 0.92, glow: i % 5 === 0 });
    }
    const nd = this.n(Math.round(6 * Math.sqrt(k)));
    for (let i = 0; i < nd; i++) {
      const a = U.rand(-2.8, -0.3), s = U.rand(2, 5);
      this.emit(x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, grav: 0.25, drag: 0.98, life: U.randInt(26, 44), size: U.rand(3, 5) * Math.sqrt(k), color: U.mix(color, "#20283a", 0.55), shape: "shard", vr: U.rand(-0.3, 0.3), shrink: false });
    }
    const nm = this.n(Math.round(5 * Math.sqrt(k)));
    for (let i = 0; i < nm; i++) {
      this.emit(x + U.rand(-8, 8) * k, y + U.rand(-8, 8) * k, { vx: U.rand(-0.8, 0.8), vy: U.rand(-1.2, -0.3), drag: 0.95, life: U.randInt(30, 50), size: U.rand(6, 10) * Math.sqrt(k), grow: 0.3, color: "#3a3d4a", shape: "smoke", alpha: 0.45 });
    }
  }

  /** Pickup: ring, a little column of rising sparkles. */
  pickup(x, y, color) {
    this.emit(x, y, { shape: "glow", size: 30, life: 14, color });
    this.ring(x, y, color, 22, 16);
    const n = this.n(10);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28;
      this.emit(x + Math.cos(a) * 6, y + Math.sin(a) * 6, { vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6 - 1.2, drag: 0.93, life: U.randInt(18, 30), size: U.rand(2, 3.5), color: i % 3 ? color : "#ffffff", shape: "star" });
    }
  }

  /** Thin glowing trail dot (projectiles call this every frame or two). */
  trail(x, y, color, size = 3, life = 12) {
    this.emit(x, y, { shape: "dot", size, life, color, drag: 1, glow: false });
  }

  update() {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.grav;
      p.x += p.vx; p.y += p.vy;
      if (p.grow) p.size += p.grow;
      if (p.vr) p.rot += p.vr;
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
    const x0 = cam.x - 40, y0 = cam.y - 40, x1 = cam.x + VIEW_W + 40, y1 = cam.y + VIEW_H + 40;
    // Pass 1: smoke and debris (normal blending), pass 2: additive light.
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalCompositeOperation = pass ? "lighter" : "source-over";
      for (const p of this.list) {
        if (p.normal !== !pass) continue;
        if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
        const t = p.life / p.maxLife;
        const s = p.shrink ? p.size * t : p.size;
        ctx.globalAlpha = Math.min(1, t * 1.5) * p.alpha;
        ctx.fillStyle = p.color;
        ctx.strokeStyle = p.color;
        switch (p.shape) {
          case "square":
            ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
            break;
          case "ring":
            ctx.lineWidth = 2 * Math.max(0.4, t);
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
          case "spark": {
            ctx.lineWidth = Math.max(0.8, s * 0.8);
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2);
            ctx.stroke();
            break;
          }
          case "smoke":
            ctx.globalAlpha = t * p.alpha;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
            break;
          case "shard":
            ctx.save();
            ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.fillRect(-s / 2, -s / 3, s, s * 0.66);
            ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(-s / 2, -s / 3, s, 1);
            ctx.restore();
            break;
          case "star": {
            const r = Math.max(0.6, s) * (0.7 + 0.3 * Math.sin(p.life * 0.9));
            ctx.fillRect(p.x - r * 1.6, p.y - 0.6, r * 3.2, 1.2);
            ctx.fillRect(p.x - 0.6, p.y - r * 1.6, 1.2, r * 3.2);
            break;
          }
          case "glow":
            U.glow(ctx, p.x, p.y, Math.max(1, s), p.color, t);
            break;
          default:
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(0.5, s), 0, Math.PI * 2);
            ctx.fill();
        }
        if (p.glow && Gfx.q.glow > 0.5) U.glow(ctx, p.x, p.y, s * 4, p.color, t * 0.6);
      }
    }
    ctx.restore();
  }
}

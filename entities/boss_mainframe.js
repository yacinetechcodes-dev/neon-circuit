/* =========================================================================
 * entities/boss_mainframe.js — THE MAINFRAME (final boss, level 5)
 *
 * A floating core wrapped in a rotating shield. Three phases:
 *   1  aimed bursts + summons drones
 *   2  laser columns (telegraphed) + radial bullet rings
 *   3  everything, faster
 * The basic boss pattern of the game: a telegraphed attack string, then the
 * core sinks and opens. 9 hits (3 per phase), about a minute.
 * Repair capsules drop when the fight starts, at each phase change and
 * every ~14 s.
 * After each attack string it sinks to the floor and its shield opens
 * ("CORE EXPOSED") — stomp it, shoot it or dash into it. While exposed it
 * is harmless to touch.
 *
 * overrides: hp, title, arena: [col, row, cols, rows]
 * ========================================================================= */
"use strict";

registerEntity("mainframe", {
  info: { name: "The Mainframe", desc: "Hit its core while it's down and exposed." },
  size: [96, 96],
  anchor: "center",
  layer: 1,
  props: {
    enemy: true, hurts: true, isBoss: true, alwaysActive: true, alwaysDraw: true,
    hp: 9, title: "THE MAINFRAME", color: "#ff3df0",
    stompable: (e) => (e.mode === "expose" && e.open ? true : "bounce"),
    shootable: (e) => e.mode === "expose" && e.open,
    dashable: (e) => e.mode === "expose" && e.open,
  },
  init(e, world) {
    const a = e.opts.arena || [e.col - 15, e.row - 2, 30, 17];
    e.arena = { x: a[0] * TILE, y: a[1] * TILE, w: a[2] * TILE, h: a[3] * TILE };
    // Find the arena floor under the boss.
    let r = e.row + 1;
    while (r < world.h && !Physics.solidAt(world, e.col, r)) r++;
    e.floorY = r * TILE;
    e.hoverY = e.home.y;
    this.onRespawn(e, world);
  },
  onRespawn(e) {
    e.x = e.home.x; e.y = e.home.y;
    e.hp = e.maxHp;
    e.mode = "sleep"; e.timer = 0; e.step = 0;
    e.phase = 1; e.open = false;
    e.spin = 0; e.healT = 0;
  },
  /** Repair capsule somewhere on the arena floor (one at a time). */
  dropHealth(e, world) {
    if (world.entities.some((o) => o.bossDrop && !o.dead)) return;
    const x = e.arena.x + 3 * TILE + Math.random() * (e.arena.w - 6 * TILE);
    const h = world.spawn("powerup", x, e.floorY - 40, {}, "health");
    if (h) { h.transient = true; h.bossDrop = true; world.particles.ring(U.cx(h), U.cy(h), "#ff4d6d", 26); }
  },

  pattern(e) {
    if (e.phase === 1) return ["burst", "drones", "expose"];
    if (e.phase === 2) return ["beams", "ring", "expose"];
    return ["ring", "beams", "burst", "expose"];
  },
  next(e) {
    const pat = this.pattern(e);
    e.mode = pat[e.step % pat.length];
    e.step++;
    e.timer = 0;
  },

  /** Float toward a point. */
  drift(e, tx, ty, k = 0.04) {
    e.x += (tx - e.x) * k;
    e.y += (ty - e.y) * k;
  },
  hoverX(e, world) {
    const ar = e.arena;
    return ar.x + ar.w / 2 - e.w / 2 + Math.sin(world.time * 0.012) * (ar.w / 2 - 4 * TILE);
  },

  shoot(world, x, y, angle, speed, color = "#ff3df0") {
    const b = world.spawn("bullet", x - 5, y - 5, {});
    if (b) { b.vx = Math.cos(angle) * speed; b.vy = Math.sin(angle) * speed; b.color = color; }
    sfx.play("fire"); // throttled, so a whole ring = one sound
  },

  update(e, world) {
    const p = world.player;
    const fast = e.phase === 3 ? 1.35 : 1;
    const cx = U.cx(e), cy = U.cy(e);
    e.spin += e.open ? 0.005 : 0.03 * fast;
    e.hurts = !(e.mode === "expose" || e.mode === "sleep" || e.mode === "dying");
    // Health pickups during the fight: one every ~14 s.
    if (!["sleep", "intro", "dying"].includes(e.mode) && ++e.healT >= 840) { e.healT = 0; this.dropHealth(e, world); }

    switch (e.mode) {
      case "sleep":
        if (p.alive && U.overlap(p, e.arena) && p.x > e.arena.x + 5 * TILE) {
          e.mode = "intro"; e.timer = 120;
          world.startBoss(e, e.arena);
        }
        return;
      case "intro":
        if (e.timer % 8 === 0) world.particles.ring(cx, cy, "#ff3df0", 60 + (120 - e.timer), 24);
        if (--e.timer <= 0) { e.mode = "rest"; e.timer = 30; this.dropHealth(e, world); }
        return;
      case "rest":
        this.drift(e, this.hoverX(e, world), e.hoverY);
        if (--e.timer <= 0) this.next(e);
        return;

      case "burst": {
        this.drift(e, this.hoverX(e, world), e.hoverY);
        e.timer++;
        const volleys = e.phase === 3 ? 4 : 3, gap = Math.round(34 / fast);
        if (e.timer > 20 && (e.timer - 20) % gap === 0 && (e.timer - 20) / gap < volleys) {
          const a = Math.atan2(U.cy(p) - cy, U.cx(p) - cx);
          for (const o of [-0.22, 0, 0.22]) this.shoot(world, cx, cy, a + o, 4.2 * fast);
          world.particles.burst(cx, cy, 10, "#ff3df0", 3);
        }
        if (e.timer > 20 + volleys * gap + 20) { e.mode = "rest"; e.timer = 25; }
        return;
      }

      case "drones": {
        this.drift(e, this.hoverX(e, world), e.hoverY);
        e.timer++;
        if (e.timer === 30) {
          const alive = world.entities.filter((o) => o.name === "drone" && o.minion && !o.dead).length;
          for (let i = 0; i < Math.min(2, 3 - alive); i++) {
            const d = world.spawn("drone", cx - 13 + (i ? 40 : -40), cy, { speed: 1.5 * fast, sight: 30 });
            if (d) { d.transient = true; d.minion = true; d.alwaysActive = true; }
            world.particles.burst(cx + (i ? 40 : -40), cy, 14, "#ffb400", 3);
          }
        }
        if (e.timer > 70) { e.mode = "rest"; e.timer = 20; }
        return;
      }

      case "beams": {
        this.drift(e, U.lerp(e.x, e.arena.x + e.arena.w / 2 - e.w / 2, 0.5), e.hoverY);
        e.timer++;
        if (e.timer === 20) {
          const n = e.phase === 3 ? 4 : 3;
          const xs = [U.cx(p)];
          for (let i = 1; i < n; i++) {
            let x, tries = 0;
            do { x = e.arena.x + TILE * 2 + Math.random() * (e.arena.w - TILE * 4); tries++; }
            while (xs.some((o) => Math.abs(o - x) < 90) && tries < 20);
            xs.push(x);
          }
          for (const x of xs) {
            const b = world.spawn("bossBeam", x - 18, e.arena.y, {});
            if (b) { b.h = e.floorY - e.arena.y; b.warn = Math.round(62 / fast); b.on = 40; }
          }
        }
        if (e.timer > 20 + 62 / fast + 50) { e.mode = "rest"; e.timer = 20; }
        return;
      }

      case "ring": {
        this.drift(e, this.hoverX(e, world), e.hoverY);
        e.timer++;
        const n = e.phase === 3 ? 16 : 12;
        if (e.timer === 30 || (e.phase >= 2 && e.timer === 60)) {
          const off = e.timer === 60 ? Math.PI / n : 0;
          for (let i = 0; i < n; i++) this.shoot(world, cx, cy, off + (i / n) * Math.PI * 2, 3.2 * fast, "#b78cff");
          world.particles.ring(cx, cy, "#b78cff", 60, 24);
          world.camera.shake(4);
        }
        if (e.timer > 90) { e.mode = "rest"; e.timer = 20; }
        return;
      }

      case "expose": {
        e.timer++;
        const sit = e.floorY - e.h - 4;
        const openFor = e.phase === 3 ? 170 : 210;
        if (e.timer < 50) {
          this.drift(e, e.x, sit, 0.08);
        } else if (e.timer < 50 + openFor) {
          e.open = true;
          e.y = sit + Math.sin(e.timer * 0.1) * 2;
          if (e.timer % 10 === 0) world.particles.emit(cx + U.rand(-30, 30), e.y, { vy: -1.5, life: 30, size: 3, color: "#ffe14d" });
        } else {
          e.open = false;
          this.drift(e, e.x, e.hoverY, 0.05);
          if (Math.abs(e.y - e.hoverY) < 4) { e.mode = "rest"; e.timer = 20; }
        }
        return;
      }

      case "dying":
        e.timer--;
        e.x += U.rand(-2, 2);
        if (e.timer % 6 === 0) {
          world.particles.burst(e.x + Math.random() * e.w, e.y + Math.random() * e.h, 16, U.pick(["#ff3df0", "#00f0ff", "#ffe14d", "#ffffff"]), 6, { glow: true });
          world.camera.shake(8);
        }
        if (e.timer <= 0) world.killEntity(e);
        return;
    }
  },

  onDamage(e, world, amount, source) {
    if (!(e.mode === "expose" && e.open) || e.iframes > 0) return false;
    e.hp -= 1;
    e.flash = 10;
    e.iframes = 24;
    world.camera.shake(8);
    sfx.play("bossHit");
    world.particles.burst(U.cx(e), U.cy(e), 24, "#ffffff", 6);
    if (e.hp <= 0) {
      e.mode = "dying"; e.timer = 150; e.open = true;
      for (const o of world.entities) if (o.name === "bullet" || o.name === "bossBeam" || o.minion) o.dead = true;
      world.banner = { text: "CRITICAL FAILURE", sub: "", t: 140, max: 140, color: "#ffe14d" };
      return true;
    }
    const third = e.maxHp / 3;
    const newPhase = e.hp > third * 2 ? 1 : e.hp > third ? 2 : 3;
    if (newPhase !== e.phase) {
      e.phase = newPhase;
      e.step = 0;
      e.timer = 999; // end the exposure: it rises and starts the next phase
      e.open = false;
      for (const o of world.entities) if (o.name === "bullet") o.dead = true;
      world.banner = { text: `PHASE ${newPhase}`, sub: "", t: 100, max: 100, color: "#ff3df0" };
      this.dropHealth(e, world); e.healT = 0;
    }
    return true;
  },

  onDeath(e, world) {
    world.endBoss(e);
    world.particles.burst(U.cx(e), U.cy(e), 120, "#00f0ff", 10, { glow: true });
    world.particles.ring(U.cx(e), U.cy(e), "#ffffff", 140, 50);
    for (const o of world.entities) if (o.minion) world.killEntity(o);
  },

  draw(e, ctx, world) {
    const cx = U.cx(e), cy = U.cy(e), t = world.time;
    const col = e.flash ? "#ffffff" : e.open ? "#ffe14d" : e.color;
    if (e.mode === "sleep") {
      ctx.strokeStyle = U.rgba(e.color, 0.25 + 0.15 * Math.sin(t * 0.04)); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, cy, 40, 0, 6.28); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 22, 0, 6.28); Look.fill(ctx, cy - 22, 44, "#1a0f22", 0.15, 0.3);
      U.glow(ctx, cx, cy, 30, e.color, 0.2 + 0.15 * Math.sin(t * 0.04));
      return;
    }
    U.glow(ctx, cx, cy, 120, col, 0.35);
    // Cables to the ceiling with data pulses running down them.
    for (const o of [-30, 0, 30]) {
      const x0 = cx + o, y0 = e.arena.y, xm = cx + o * 2, ym = (e.arena.y + cy) / 2, x1 = cx + o * 0.5, y1 = cy - 30;
      ctx.strokeStyle = "#1a1028"; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(xm, ym, x1, y1); ctx.stroke();
      ctx.strokeStyle = "#3a2450"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(xm, ym, x1, y1); ctx.stroke();
      const k = ((t * 0.02 + o * 0.01) % 1 + 1) % 1, u = 1 - k;
      const px = u * u * x0 + 2 * u * k * xm + k * k * x1, py = u * u * y0 + 2 * u * k * ym + k * k * y1;
      U.glow(ctx, px, py, 10, col, 0.9);
    }
    // Phase 2+: an outer ring of rotating spikes.
    if (e.phase >= 2) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-e.spin * 0.6);
      ctx.fillStyle = U.rgba(e.phase >= 3 ? "#ff3355" : col, 0.85);
      for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(-4, -60); ctx.lineTo(0, -70); ctx.lineTo(4, -60); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
    // Shield segments (spread apart when open) with bevelled shading.
    const segs = 6, gap = e.open ? 0.35 : 0.08, rr = e.open ? 52 : 44;
    for (let i = 0; i < segs; i++) {
      const a0 = e.spin + (i / segs) * Math.PI * 2 + gap, a1 = e.spin + ((i + 1) / segs) * Math.PI * 2 - gap;
      ctx.lineCap = "butt";
      ctx.strokeStyle = U.mix(col, "#000000", 0.55); ctx.lineWidth = 11;
      ctx.beginPath(); ctx.arc(cx, cy, rr, a0, a1); ctx.stroke();
      ctx.strokeStyle = i % 2 ? col : U.mix(col, "#000000", 0.25); ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(cx, cy, rr, a0, a1); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, rr + 4, a0, a1); ctx.stroke();
      const am = (a0 + a1) / 2;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(cx + Math.cos(am) * rr - 1.5, cy + Math.sin(am) * rr - 1.5, 3, 3);
    }
    // Core housing: a rotating hexagon shell.
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(e.spin * -1.5);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; i ? ctx.lineTo(Math.cos(a) * 32, Math.sin(a) * 32) : ctx.moveTo(32, 0); }
    ctx.closePath();
    Look.fill(ctx, -32, 64, "#22102e", 0.2, 0.4);
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    // Core: pulsing light, rings; cracks in the last phase.
    const pulse = 10 + Math.sin(t * (e.open ? 0.3 : 0.1)) * 3;
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, pulse + 6);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, e.open ? "#fff6c0" : col); g.addColorStop(1, U.rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, pulse + 6, 0, 6.28); ctx.fill();
    U.glow(ctx, cx, cy, pulse * 4, col, 0.9);
    ctx.strokeStyle = U.rgba(col, 0.5); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 18 + (t * 0.5) % 10, 0, 6.28); ctx.stroke();
    if (e.phase >= 3) {
      ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(cx - 20, cy - 8); ctx.lineTo(cx - 10, cy - 2); ctx.lineTo(cx - 14, cy + 10); ctx.moveTo(cx + 18, cy - 14); ctx.lineTo(cx + 8, cy - 6); ctx.stroke();
      if (t % 10 === 0 && Game.state === "play") world.particles.emit(cx + U.rand(-20, 20), cy + U.rand(-20, 20), { vx: U.rand(-2, 2), vy: U.rand(-2, 0), life: 16, size: 2, color: "#ffe14d", shape: "spark" });
    }
    if (e.open) {
      // Target brackets: "hit me now".
      const r = 26 + Math.sin(t * 0.3) * 3;
      ctx.strokeStyle = "#ffe14d"; ctx.lineWidth = 2;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.beginPath(); ctx.moveTo(cx + sx * r, cy + sy * (r - 7)); ctx.lineTo(cx + sx * r, cy + sy * r); ctx.lineTo(cx + sx * (r - 7), cy + sy * r); ctx.stroke(); }
    }
    // Phase pips.
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < 4 - e.phase ? col : "#33223a";
      ctx.fillRect(cx - 16 + i * 12, cy + 40, 8, 4);
    }
  },
});

// Vertical laser column used by the Mainframe. Warns, fires, disappears.
registerEntity("bossBeam", {
  size: [36, 32],
  layer: 2,
  props: { transient: true, alwaysActive: true, alwaysDraw: true, warn: 60, on: 40 },
  update(e) {
    if (e.t === e.warn + 1) sfx.play("laser");
    if (e.t > e.warn + e.on) e.dead = true;
  },
  onTouch(e, world) { if (e.t > e.warn) world.hurtPlayer(1, e); },
  draw(e, ctx, world) {
    const cx = U.cx(e), t = world.time;
    if (e.t <= e.warn) {
      // Telegraph: a widening target column with a bright guide line and floor marker.
      const k = e.t / e.warn;
      ctx.fillStyle = U.rgba("#ff2a6d", 0.08 + k * 0.17);
      ctx.fillRect(e.x + e.w / 2 - 2 - k * 14, e.y, 4 + k * 28, e.h);
      if (t % 8 < 4) { ctx.fillStyle = "#ff2a6d"; ctx.fillRect(cx - 1, e.y, 2, e.h); }
      U.glow(ctx, cx, e.y + e.h - 4, 20 + k * 20, "#ff2a6d", 0.4 + k * 0.4);
    } else {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = U.rgba("#ff2a6d", 0.4); ctx.fillRect(e.x - 4, e.y, e.w + 8, e.h);
      ctx.fillStyle = U.rgba("#ff8ab0", 0.6); ctx.fillRect(cx - 10 + Math.sin(t) * 1.5, e.y, 20, e.h);
      ctx.fillStyle = "#fff0f4"; ctx.fillRect(cx - 4, e.y, 8, e.h);
      ctx.restore();
      U.glow(ctx, cx, e.y + e.h - 6, 40, "#ff2a6d", 0.8);
      if (t % 3 === 0 && Game.state === "play") world.particles.burst(cx, e.y + e.h, 3, "#ff2a6d", 3);
    }
  },
  light(e) { return e.t > e.warn ? [90, "#ff2a6d", 1] : null; },
});

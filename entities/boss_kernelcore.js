/* =========================================================================
 * entities/boss_kernelcore.js — KERNEL CORE (World 6 boss, final boss)
 *
 * Nested rotating squares around a bright core, with four orbiting process
 * cubes. No face. It hangs high in the arena and only comes down to dump.
 *   Phase 1  process cubes fire aimed volleys, syscall scanlines sweep down
 *   Phase 2  + memory leaks and a fork-bomb burst, faster volleys
 *   Phase 3  + kernel panic: radial bursts with one safe gap; its shield stays
 *            up while it dumps — stomp it, or use Sudo to shoot through
 * After each attack string it CORE DUMPs: it sinks to the floor and opens.
 * 12 hits (4 per phase); the phase-3 shield is its unique twist (Sudo).
 * Repair capsules drop at each phase start and every ~14 s.
 *
 * overrides: hp (multiple of 3), title, arena: [col, row, cols, rows]
 * ========================================================================= */
"use strict";

registerEntity("kernelCore", {
  info: { name: "Kernel Core", desc: "Hit the core when it dumps. Phase 3: Sudo through its shield." },
  size: [112, 112],
  props: {
    enemy: true, hurts: true, isBoss: true, alwaysActive: true, alwaysDraw: true,
    hp: 12, title: "KERNEL CORE", color: "#fcaf3e",
    stompable: (e) => (e.mode === "dump" && e.open ? true : "bounce"),
    shootable: (e) => e.mode === "dump" && e.open,
    dashable: (e) => e.mode === "dump" && e.open,
  },
  /** Phase 3 keeps its shield up while dumping (Sudo ignores it). */
  blocks(e, world) { return e.phase === 3 && !(world.player.sudo > 0); },
  init(e) {
    const a = e.opts.arena || [e.col - 16, e.row - 15, 32, 17];
    e.arena = { x: a[0] * TILE, y: a[1] * TILE, w: a[2] * TILE, h: a[3] * TILE };
    e.floorY = e.home.y + e.h;
    e.hoverY = e.arena.y + 2 * TILE;
    this.onRespawn(e);
  },
  onRespawn(e) {
    e.x = e.home.x; e.y = e.home.y;
    e.hp = e.maxHp; e.mode = "sleep"; e.timer = 0; e.step = 0; e.phase = 1;
    e.healT = 0; e.open = false; e.spin = 0; e.reps = 0;
  },
  phaseOf(e) { const q = e.maxHp / 3; return e.hp > q * 2 ? 1 : e.hp > q ? 2 : 3; },
  pattern(e) {
    if (e.phase === 1) return ["volley", "syscall", "dump"];
    if (e.phase === 2) return ["leak", "volley", "dump"];
    return ["panic", "fork", "dump"];
  },
  next(e) { const pat = this.pattern(e); e.mode = pat[e.step % pat.length]; e.step++; e.timer = 0; e.reps = e.phase === 3 ? 4 : 3; },
  rest(e, f) { e.mode = "rest"; e.timer = f; e.open = false; },
  dropHealth(e, world) {
    const x = e.arena.x + 3 * TILE + Math.random() * (e.arena.w - 6 * TILE);
    const h = world.spawn("powerup", x, e.floorY - 40, {}, "health");
    if (h) { h.transient = true; h.coreDrop = true; world.particles.ring(U.cx(h), U.cy(h), "#ef2929", 26); }
  },
  cubes(e, world) {
    return [0, 1, 2, 3].map((i) => {
      const a = e.spin + (i * Math.PI) / 2;
      return { x: U.cx(e) + Math.cos(a) * 90, y: U.cy(e) + Math.sin(a) * 90 };
    });
  },
  /** Glide toward a target spot (x centred on the player, clamped to the arena). */
  glide(e, tx, ty, k) {
    tx = U.clamp(tx, e.arena.x + TILE, e.arena.x + e.arena.w - TILE - e.w);
    e.x += (tx - e.x) * k; e.y += (ty - e.y) * k;
  },

  update(e, world) {
    const p = world.player;
    const fast = [1, 1.15, 1.3][e.phase - 1];
    e.spin += 0.02 * fast;
    e.hurts = !["sleep", "dying"].includes(e.mode) && !(e.mode === "dump" && e.open);
    if (!["sleep", "intro", "dying"].includes(e.mode) && ++e.healT >= 840) {
      e.healT = 0;
      if (!world.entities.some((o) => o.coreDrop && !o.dead)) this.dropHealth(e, world);
    }

    switch (e.mode) {
      case "sleep":
        if (p.alive && U.overlap(p, e.arena) && p.x > e.arena.x + 5 * TILE) {
          e.mode = "intro"; e.timer = 100;
          world.startBoss(e, e.arena);
        }
        return;
      case "intro":
        this.glide(e, e.x, e.hoverY, 0.04);
        if (e.timer % 12 === 0) world.particles.ring(U.cx(e), U.cy(e), "#fcaf3e", 60, 16);
        if (--e.timer <= 0) { this.dropHealth(e, world); this.rest(e, 30); }
        return;
      case "rest":
        this.glide(e, U.cx(p) - e.w / 2, e.hoverY, 0.03);
        if (--e.timer <= 0) this.next(e);
        return;

      case "volley": {
        e.timer++;
        this.glide(e, U.cx(p) - e.w / 2, e.hoverY, 0.02);
        const every = Math.round(36 / fast);
        if (e.timer % every === 0) {
          for (const c of this.cubes(e, world)) {
            const a = Math.atan2(U.cy(p) - c.y, U.cx(p) - c.x), sp = 3.6 * fast;
            const b = world.spawn("bullet", c.x - 5, c.y - 5, {});
            if (b) { b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.color = "#fcaf3e"; }
          }
          sfx.play("shoot");
          if (--e.reps <= 0) this.rest(e, 40);
        }
        return;
      }

      case "syscall": {
        e.timer++;
        if (e.timer === 1) {
          const gw = 3.5 * TILE;
          const gx = e.arena.x + 2 * TILE + Math.random() * (e.arena.w - 4 * TILE - gw);
          const b = world.spawn("scanBeam", e.arena.x, e.arena.y + TILE, {});
          if (b) { b.w = e.arena.w; b.gx0 = gx; b.gx1 = gx + gw; b.floorY = e.floorY; b.speed = (e.floorY - b.y) / (110 / fast); }
        }
        if (e.timer > 40 + 110 / fast + 10) this.rest(e, 30);
        return;
      }

      case "leak": {
        e.timer++;
        if (e.timer === 20) {
          const alive = world.entities.filter((o) => o.minion && !o.dead).length;
          for (let i = 0; i < Math.min(2, 4 - alive); i++) {
            const m = world.spawn("memoryLeak", U.cx(e) + (i ? 80 : -100), e.floorY - 18, { grow: 10 });
            if (m) { m.transient = true; m.minion = true; m.alwaysActive = true; }
          }
          sfx.play("fork");
        }
        if (e.timer > 50) this.rest(e, 30);
        return;
      }

      case "fork": {
        e.timer++;
        if (e.timer % 12 === 0 && e.timer <= 48) {
          const alive = world.entities.filter((o) => o.minion && !o.dead).length;
          if (alive < 6) {
            const c = world.spawn("forkChild", U.cx(e) - 6, e.y + e.h, {});
            if (c) { c.minion = true; c.vy = -3; c.vx = U.rand(-3, 3); c.split = 99999; }
          }
          sfx.play("fork");
        }
        if (e.timer > 70) this.rest(e, 30);
        return;
      }

      case "panic": {
        // Radial bursts from the core with one safe gap that turns each time.
        e.timer++;
        if (e.timer % Math.round(40 / fast) === 0) {
          const gap = Math.atan2(U.cy(p) - U.cy(e), U.cx(p) - U.cx(e)) + U.rand(-0.6, 0.6);
          for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2;
            let d = Math.abs(a - gap) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d;
            if (d < 0.45) continue;
            const b = world.spawn("bullet", U.cx(e) - 5, U.cy(e) - 5, {});
            if (b) { b.vx = Math.cos(a) * 3 * fast; b.vy = Math.sin(a) * 3 * fast; b.color = "#ef2929"; }
          }
          world.camera.shake(4); sfx.play("panic");
          if (--e.reps <= 1) this.rest(e, 40);
        }
        return;
      }

      case "dump": {
        e.timer++;
        const openFor = [220, 190, 170][e.phase - 1];
        this.glide(e, e.x, e.floorY - e.h, 0.08);
        e.open = e.timer > 30 && e.timer < 30 + openFor;
        if (e.timer === 30) world.camera.shake(6);
        if (e.timer >= 30 + openFor + 20) this.rest(e, 30);
        return;
      }

      case "dying":
        e.timer--;
        if (e.timer % 6 === 0) {
          world.particles.burst(e.x + Math.random() * e.w, e.y + Math.random() * e.h, 14, U.pick(["#fcaf3e", "#8ae234", "#eeeeec"]), 6, { shape: "square" });
          world.camera.shake(8);
        }
        if (e.timer <= 0) world.killEntity(e);
        return;
    }
  },

  onDamage(e, world, amount, source) {
    if (e.mode !== "dump" || !e.open || e.iframes > 0) return false;
    if (source !== "stomp" && this.blocks(e, world)) return false;
    e.hp -= 1; e.flash = 10; e.iframes = 22;
    world.camera.shake(8); sfx.play("bossHit");
    world.particles.burst(U.cx(e), U.cy(e), 20, "#ffffff", 5, { shape: "square" });
    if (e.hp <= 0) {
      e.hp = 0; e.mode = "dying"; e.timer = 180; e.open = false;
      for (const o of world.entities) if (["bullet", "scanBeam"].includes(o.name) || o.minion) o.dead = true;
      world.banner = { text: "SYSTEM HALTED", sub: "", t: 160, max: 160, color: "#8ae234" };
      return true;
    }
    const ph = this.phaseOf(e);
    if (ph !== e.phase) {
      e.phase = ph; e.step = 0; this.rest(e, 50);
      this.dropHealth(e, world); e.healT = 0;
      world.banner = { text: `PHASE ${ph}`, sub: ph === 3 ? "shield up: stomp it, or Sudo" : "", t: 110, max: 110, color: ph === 3 ? "#ef2929" : "#fcaf3e" };
    }
    return true;
  },

  onDeath(e, world) {
    world.endBoss(e);
    world.particles.burst(U.cx(e), U.cy(e), 120, "#fcaf3e", 9, { shape: "square" });
    for (const o of world.entities) if (o.minion) world.killEntity(o);
  },

  draw(e, ctx, world) {
    const cx = U.cx(e), cy = U.cy(e);
    if (e.mode === "sleep") ctx.globalAlpha = 0.6;
    const col = e.flash ? "#ffffff" : e.phase === 3 ? "#ef2929" : "#fcaf3e";
    U.glow(ctx, cx, cy, 90, col, e.open ? 0.7 : 0.35);
    // Nested rotating squares.
    for (let i = 0; i < 3; i++) {
      const s = 56 - i * 14, a = e.spin * (i % 2 ? -1.5 : 1) + i * 0.4;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
      ctx.strokeStyle = i === 0 ? col : U.rgba(col, 0.7 - i * 0.15); ctx.lineWidth = 4 - i;
      ctx.strokeRect(-s, -s, s * 2, s * 2);
      ctx.restore();
    }
    // Core.
    const r = e.open ? 16 + Math.sin(world.time * 0.3) * 3 : 10;
    ctx.fillStyle = e.open ? "#ffffff" : "#3a3a3a";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    if (!e.open) { ctx.fillStyle = col; ctx.fillRect(cx - 4, cy - 4, 8, 8); }
    // Phase-3 shield while dumping.
    if (e.phase === 3 && e.mode === "dump") {
      ctx.strokeStyle = world.player.sudo > 0 ? U.rgba("#fcaf3e", 0.3) : "#eeeeec"; ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]); ctx.lineDashOffset = -world.time;
      ctx.beginPath(); ctx.arc(cx, cy, 70, 0, 6.28); ctx.stroke(); ctx.setLineDash([]);
    }
    // Orbiting process cubes (not while dumping).
    if (e.mode !== "dump" && e.mode !== "dying") {
      for (const c of this.cubes(e, world)) {
        ctx.fillStyle = "#1e1e1e"; ctx.fillRect(c.x - 9, c.y - 9, 18, 18);
        ctx.strokeStyle = "#8ae234"; ctx.lineWidth = 2; ctx.strokeRect(c.x - 9, c.y - 9, 18, 18);
        ctx.fillStyle = "#8ae234"; ctx.fillRect(c.x - 5, c.y - 1, 10, 2);
      }
    }
    // Phase pips.
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < 4 - e.phase ? col : "#3a3a3a"; ctx.fillRect(cx - 16 + i * 12, e.y - 12, 8, 4); }
    ctx.globalAlpha = 1;
  },
});

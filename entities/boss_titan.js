/* =========================================================================
 * entities/boss_titan.js — WRECKER TITAN (World 5 boss)
 *
 * A giant scrap machine: tank treads, a riveted hull, two smokestacks and a
 * crane arm with a wrecking ball. No face — one furnace grille.
 *   Phase 1  wrecking-ball floor sweeps (jump them), rocket rain, stomp waves
 *   Phase 2  + scrap crawlers join, falling debris
 *   Phase 3  + fire vents erupt across the floor, faster everything
 * After each attack string it OVERHEATS: it stalls and the furnace opens —
 * stomp, shoot, rocket or dash it then. Ground Slam near it while it's
 * overheated knocks it off balance (the hit counts double).
 * Repair capsules drop at each phase start and every ~14 s.
 *
 * overrides: hp (multiple of 3), title, arena: [col, row, cols, rows]
 * ========================================================================= */
"use strict";

registerEntity("wreckerTitan", {
  size: [160, 128],
  props: {
    enemy: true, hurts: true, isBoss: true, alwaysActive: true, alwaysDraw: true,
    hp: 24, title: "WRECKER TITAN", color: "#ff6a1a",
    stompable: (e) => (e.mode === "overheat" ? true : "bounce"),
    shootable: (e) => e.mode === "overheat",
    dashable: (e) => e.mode === "overheat",
  },
  init(e) {
    const a = e.opts.arena || [e.col - 18, e.row - 15, 32, 17];
    e.arena = { x: a[0] * TILE, y: a[1] * TILE, w: a[2] * TILE, h: a[3] * TILE };
    e.floorY = e.home.y + e.h;
    this.onRespawn(e);
  },
  onRespawn(e) {
    e.x = e.home.x; e.y = e.home.y;
    e.hp = e.maxHp; e.mode = "sleep"; e.timer = 0; e.step = 0; e.phase = 1;
    e.healT = 0; e.sweeps = 0; e.ball = null; e.heat = 0; e.dir = -1;
  },
  phaseOf(e) { const q = e.maxHp / 3; return e.hp > q * 2 ? 1 : e.hp > q ? 2 : 3; },
  pattern(e) {
    if (e.phase === 1) return ["sweep", "rockets", "stomp", "overheat"];
    if (e.phase === 2) return ["crawlers", "sweep", "debris", "stomp", "overheat"];
    return ["vents", "sweep", "rockets", "debris", "vents", "overheat"];
  },
  next(e) { const pat = this.pattern(e); e.mode = pat[e.step % pat.length]; e.step++; e.timer = 0; e.sweeps = e.phase === 3 ? 3 : 2; },
  rest(e, f) { e.mode = "rest"; e.timer = f; },
  dropHealth(e, world) {
    const x = e.arena.x + 3 * TILE + Math.random() * (e.arena.w - 6 * TILE);
    const h = world.spawn("powerup", x, e.floorY - 40, {}, "health");
    if (h) { h.transient = true; h.titanDrop = true; world.particles.ring(U.cx(h), U.cy(h), "#ff4d6d", 26); }
  },
  /** Random floor x positions inside the arena, at least `gap` apart. */
  spots(e, n, first, gap = 90) {
    const xs = first == null ? [] : [first];
    let guard = 0;
    while (xs.length < n && guard++ < 200) {
      const x = e.arena.x + 2 * TILE + Math.random() * (e.arena.w - 4 * TILE);
      if (xs.every((o) => Math.abs(o - x) > gap)) xs.push(x);
    }
    return xs;
  },

  update(e, world) {
    const p = world.player;
    const fast = [1, 1.15, 1.3][e.phase - 1];
    e.hurts = !["sleep", "overheat", "dying"].includes(e.mode);
    if (!["sleep", "intro", "dying"].includes(e.mode) && ++e.healT >= 840) {
      e.healT = 0;
      if (!world.entities.some((o) => o.titanDrop && !o.dead)) this.dropHealth(e, world);
    }
    if (e.mode !== "sleep" && world.time % 5 === 0)
      for (const sx of [e.x + 34, e.x + 58]) world.particles.emit(sx, e.y - 6, { vx: U.rand(-0.3, 0.3), vy: -1.4, life: 50, size: 5, color: "#4a3f3a" });

    switch (e.mode) {
      case "sleep":
        if (p.alive && U.overlap(p, e.arena) && p.x > e.arena.x + 5 * TILE) {
          e.mode = "intro"; e.timer = 90;
          world.startBoss(e, e.arena);
        }
        return;
      case "intro":
        if (e.timer % 15 === 0) world.particles.burst(U.cx(e), e.y + 30, 10, "#ffb347", 4);
        if (--e.timer <= 0) { this.dropHealth(e, world); this.rest(e, 30); }
        return;
      case "rest": {
        // Rumble slowly toward the player between attacks.
        const tx = U.clamp(U.cx(p) - e.w / 2, e.arena.x + TILE, e.arena.x + e.arena.w - TILE - e.w);
        e.dir = U.sign(tx - e.x) || e.dir;
        if (Math.abs(tx - e.x) > 4) e.x += e.dir * 0.8 * fast;
        if (--e.timer <= 0) this.next(e);
        return;
      }

      case "sweep": {
        // The wrecking ball rolls across the floor from the far side; jump it.
        e.timer++;
        if (e.timer === 1) {
          const fromLeft = U.cx(p) > U.cx(e);
          e.ball = { x: fromLeft ? e.arena.x + TILE : e.arena.x + e.arena.w - TILE, y: e.floorY - 22, vx: (fromLeft ? 1 : -1) * 5.2 * fast, warn: 36 };
        }
        const b = e.ball;
        if (!b) { this.rest(e, 30); return; }
        if (b.warn > 0) { b.warn--; return; }
        b.x += b.vx;
        if (p.alive && U.dist(b.x, b.y, U.cx(p), U.cy(p)) < 20 + Math.min(p.w, p.h) / 2) world.hurtPlayer(1, { x: b.x - 1, y: b.y - 1, w: 2, h: 2 });
        if (world.time % 3 === 0) world.particles.dust(b.x, e.floorY, "#8a7a6a", 2);
        if (b.x < e.arena.x + TILE / 2 || b.x > e.arena.x + e.arena.w - TILE / 2) {
          world.camera.shake(4); sfx.play("slam");
          e.ball = null;
          if (--e.sweeps <= 0) this.rest(e, Math.round(30 / fast));
          else e.timer = 0;
        }
        return;
      }

      case "rockets": {
        e.timer++;
        if (e.timer === 10) {
          this.spots(e, 4 + e.phase, U.cx(p)).forEach((x, i) => {
            const r = world.spawn("titanShell", x - 10, e.arena.y + TILE, {});
            if (r) { r.floorY = e.floorY; r.warn = 50 + i * 10; }
          });
          sfx.play("rocketLaunch");
        }
        if (e.timer > 130) this.rest(e, 30);
        return;
      }

      case "stomp": {
        e.timer++;
        const rise = 26;
        if (e.timer <= rise) e.y = e.home.y - Math.sin((e.timer / rise) * Math.PI / 2) * 40;
        else if (e.timer <= rise + 10) e.y = Math.min(e.home.y, e.y + 10);
        if (e.timer === rise + 10) {
          e.y = e.home.y;
          for (const d of [-1, 1]) {
            const s = world.spawn("shockwave", d > 0 ? e.x + e.w : e.x - 18, e.floorY - 20, {});
            if (s) { s.dir = d; s.speed = 4.6 * fast; }
          }
          world.camera.shake(9); sfx.play("slam");
        }
        if (e.timer > rise + 10 + 40) { if (--e.sweeps > 0) e.timer = 0; else this.rest(e, 30); }
        return;
      }

      case "crawlers": {
        e.timer++;
        if (e.timer === 20) {
          const alive = world.entities.filter((o) => o.minion && !o.dead).length;
          for (let i = 0; i < Math.min(2, 3 - alive); i++) {
            const m = world.spawn("scrapCrawler", U.cx(e) + (i ? 70 : -100), e.floorY - 18, { lunge: 3 * fast });
            if (m) { m.transient = true; m.minion = true; m.alwaysActive = true; m.dir = i ? 1 : -1; }
          }
          sfx.play("crumble");
        }
        if (e.timer > 50) this.rest(e, 30);
        return;
      }

      case "debris": {
        e.timer++;
        if (e.timer === 10) {
          this.spots(e, 5, U.cx(p), 80).forEach((x, i) => {
            const d = world.spawn("titanShell", x - 10, e.arena.y + TILE, {});
            if (d) { d.floorY = e.floorY; d.warn = 46 + i * 7; d.rubble = true; }
          });
          world.camera.shake(6);
        }
        if (e.timer > 120) this.rest(e, 30);
        return;
      }

      case "vents": {
        e.timer++;
        if (e.timer === 10) {
          this.spots(e, 6, U.cx(p), 70).forEach((x, i) => {
            const f = world.spawn("titanFlame", x - 12, e.floorY - 100, {});
            if (f) { f.warn = 44 + (i % 2) * 24; f.floorY = e.floorY; }
          });
        }
        if (e.timer > 140) this.rest(e, 30);
        return;
      }

      case "overheat": {
        e.timer++;
        e.heat = Math.min(1, e.timer / 20);
        const openFor = [230, 200, 170][e.phase - 1];
        if (world.time % 4 === 0) world.particles.emit(U.cx(e) + U.rand(-30, 30), e.y + 40, { vy: -2, life: 30, size: 4, color: "#ffb347", glow: true });
        if (e.timer > openFor) { e.heat = 0; this.rest(e, 30); }
        return;
      }

      case "dying":
        e.timer--;
        if (e.timer % 6 === 0) {
          world.particles.burst(e.x + Math.random() * e.w, e.y + Math.random() * e.h, 14, U.pick(["#ff6a1a", "#ffb347", "#8a8580"]), 6);
          world.camera.shake(8);
        }
        if (e.timer <= 0) world.killEntity(e);
        return;
    }
  },

  onDamage(e, world, amount, source) {
    if (e.mode !== "overheat" || e.iframes > 0) return false;
    e.hp -= source === "slam" ? 2 : 1; e.flash = 10; e.iframes = 22;
    world.camera.shake(8); sfx.play("bossHit");
    world.particles.burst(U.cx(e), U.cy(e), 20, "#ffffff", 5);
    if (e.hp <= 0) {
      e.hp = 0;
      e.mode = "dying"; e.timer = 150; e.ball = null;
      for (const o of world.entities) if (["shockwave", "titanShell", "titanFlame"].includes(o.name) || o.minion) o.dead = true;
      world.banner = { text: "SCRAPPED", sub: "", t: 140, max: 140, color: "#ffb347" };
      return true;
    }
    const ph = this.phaseOf(e);
    if (ph !== e.phase) {
      e.phase = ph; e.step = 0; e.heat = 0; this.rest(e, 40);
      this.dropHealth(e, world); e.healT = 0;
      world.banner = { text: `PHASE ${ph}`, sub: "", t: 90, max: 90, color: ph === 3 ? "#ff3355" : "#ffb347" };
    }
    return true;
  },

  onDeath(e, world) {
    world.endBoss(e);
    world.particles.burst(U.cx(e), U.cy(e), 100, "#ff6a1a", 9, { glow: true });
    for (const o of world.entities) if (o.minion) world.killEntity(o);
  },

  draw(e, ctx, world) {
    const x = Math.round(e.x), y = Math.round(e.y);
    const hot = e.mode === "overheat";
    if (e.mode === "sleep") ctx.globalAlpha = 0.65;
    // Treads.
    ctx.fillStyle = "#1e1612"; ctx.fillRect(x, y + 100, e.w, 28);
    ctx.fillStyle = "#5d5550";
    for (let i = 0; i < 10; i++) ctx.fillRect(x + 4 + ((i * 16 + world.time * (e.mode === "rest" ? e.dir : 0)) % 160 + 160) % 152, y + 104, 6, 20);
    // Hull.
    ctx.fillStyle = e.flash ? "#ffffff" : "#7a3a16"; ctx.fillRect(x + 8, y + 36, e.w - 16, 66);
    ctx.fillStyle = "#a8521e"; ctx.fillRect(x + 8, y + 36, e.w - 16, 6);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    for (let i = 0; i < 6; i++) { ctx.fillRect(x + 16 + i * 24, y + 46, 4, 4); ctx.fillRect(x + 16 + i * 24, y + 92, 4, 4); }
    // Smokestacks.
    ctx.fillStyle = "#3a302a"; ctx.fillRect(x + 28, y, 14, 38); ctx.fillRect(x + 52, y + 8, 14, 30);
    ctx.fillStyle = "#ff6a1a"; ctx.fillRect(x + 28, y, 14, 4); ctx.fillRect(x + 52, y + 8, 14, 4);
    // Crane arm.
    ctx.strokeStyle = "#5d5550"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x + e.w - 30, y + 40); ctx.lineTo(x + e.w - 4, y + 6); ctx.lineTo(x + e.w + 26, y + 14); ctx.stroke();
    // Furnace grille (opens while overheated).
    const gx = x + e.w / 2 - 26, gy = y + 54;
    ctx.fillStyle = "#1a120e"; ctx.fillRect(gx, gy, 52, 34);
    if (hot) {
      const k = e.heat * (0.8 + Math.sin(world.time * 0.4) * 0.2);
      ctx.fillStyle = `rgba(255,${120 + Math.floor(k * 100)},40,${0.5 + k * 0.5})`; ctx.fillRect(gx + 4, gy + 4, 44, 26);
      U.glow(ctx, gx + 26, gy + 17, 60, "#ffb347", 0.8 * k);
    } else {
      ctx.fillStyle = "#5d5550";
      for (let i = 0; i < 5; i++) ctx.fillRect(gx + 4 + i * 10, gy + 4, 4, 26);
      ctx.fillStyle = "#ff6a1a"; ctx.fillRect(gx + 22, gy + 14, 8, 6);
    }
    // Phase lights.
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < 4 - e.phase ? "#ffb347" : "#3a302a"; ctx.fillRect(x + e.w / 2 - 16 + i * 12, y + 26, 8, 6); }
    ctx.globalAlpha = 1;
    // Wrecking ball during a sweep.
    const b = e.ball;
    if (b) {
      if (b.warn > 0) {
        ctx.fillStyle = world.time % 8 < 4 ? "#ff3355" : "#7a1f1d";
        ctx.fillRect(b.vx > 0 ? e.arena.x : e.arena.x + e.arena.w - 12, e.floorY - 50, 12, 50);
      } else {
        ctx.fillStyle = "#2e2a26"; ctx.beginPath(); ctx.arc(b.x, b.y, 20, 0, 6.28); ctx.fill();
        ctx.strokeStyle = "#8a8580"; ctx.lineWidth = 3; ctx.stroke();
        const a = b.x * 0.05;
        ctx.fillStyle = "#8a8580"; ctx.fillRect(b.x + Math.cos(a) * 10 - 3, b.y + Math.sin(a) * 10 - 3, 6, 6);
      }
    }
  },
});

// Rocket (or rubble) dropping onto a floor marker.
registerEntity("titanShell", {
  size: [20, 24],
  layer: 2,
  props: { transient: true, alwaysActive: true, alwaysDraw: true, freezable: true },
  init(e) { e.warn = 50; e.vy = 0; },
  update(e, world) {
    if (e.t <= e.warn) return;
    e.vy = Math.min(12, e.vy + 0.8);
    e.y += e.vy;
    if (e.y + e.h >= e.floorY) {
      e.dead = true;
      const p = world.player;
      if (!e.rubble && U.dist(U.cx(e), e.floorY - 10, U.cx(p), U.cy(p)) < 40) world.hurtPlayer(1, e);
      world.particles.burst(U.cx(e), e.floorY - 4, 12, e.rubble ? "#8a7a6a" : "#ff6a1a", 4, { glow: !e.rubble });
    }
  },
  onTouch(e, world) { if (e.t > e.warn) world.hurtPlayer(1, e); },
  draw(e, ctx, world) {
    if (e.t <= e.warn) {
      ctx.fillStyle = world.time % 8 < 4 ? "#ff3355" : "#7a1f1d";
      ctx.fillRect(e.x - 6, e.floorY - 4, e.w + 12, 4);
      return;
    }
    if (e.rubble) {
      ctx.fillStyle = "#3a2c24"; ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.strokeStyle = "#b5521b"; ctx.lineWidth = 2; ctx.strokeRect(e.x + 1, e.y + 1, e.w - 2, e.h - 2);
      return;
    }
    ctx.fillStyle = "#c9c2ba"; ctx.fillRect(e.x + 5, e.y, 10, 18);
    ctx.fillStyle = "#ff6a1a"; ctx.fillRect(e.x + 5, e.y + 18, 10, 6); ctx.fillRect(e.x + 2, e.y + 2, 3, 6); ctx.fillRect(e.x + 15, e.y + 2, 3, 6);
    U.glow(ctx, U.cx(e), e.y - 4, 16, "#ffb347", 0.7);
  },
});

// Flame column bursting from the arena floor after a warning.
registerEntity("titanFlame", {
  size: [24, 100],
  layer: 2,
  props: { transient: true, alwaysActive: true, alwaysDraw: true, freezable: true },
  init(e) { e.warn = 44; e.burn = 50; },
  update(e) { if (e.t > e.warn + e.burn) e.dead = true; },
  onTouch(e, world) { if (e.t > e.warn) world.hurtPlayer(1, e, { up: -7 }); },
  draw(e, ctx, world) {
    const by = e.y + e.h;
    if (e.t <= e.warn) {
      ctx.fillStyle = world.time % 8 < 4 ? "#ff6a1a" : "#7a2a10";
      ctx.fillRect(e.x - 4, by - 4, e.w + 8, 4);
      return;
    }
    for (let i = 0; i < 6; i++) {
      const k = i / 6, w = 24 - k * 14 + Math.sin(world.time * 0.7 + i) * 3;
      ctx.fillStyle = i < 2 ? "#fff3c4" : i < 4 ? "#ffb347" : "#ff6a1a";
      ctx.fillRect(U.cx(e) - w / 2, by - (k + 1 / 6) * e.h, w, e.h / 6 + 1);
    }
    U.glow(ctx, U.cx(e), by - e.h / 2, 46, "#ff6a1a", 0.45);
  },
});

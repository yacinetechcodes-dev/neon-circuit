/* =========================================================================
 * entities/boss_bluescreen.js — BLUE SCREEN BEAST (World 4 boss)
 *
 * A giant monitor-on-a-stand made of plain rectangles, with two floating
 * blue-panel fists. No face: a dot spinner and a progress bar.
 *   Phase 1  fist slams (shockwaves), summons popups, scanline sweep
 *   Phase 2  + file-drag pull toward the Beast
 *   Phase 3  + crashing blue panels from the ceiling, faster everything
 * Unique mechanic: after a fist attack one fist stays STUCK in the floor
 * (glowing amber, safe to touch). MAXIMIZE and walk into it to smash it —
 * the Beast crashes into UPDATING: it freezes and its core opens, hit it.
 * 9 hits (3 per phase). Repair capsules at each phase start and every ~14 s.
 *
 * overrides: hp (multiple of 3), title, arena: [col, row, cols, rows]
 * ========================================================================= */
"use strict";

registerEntity("blueScreenBeast", {
  info: { name: "Blue Screen Beast", desc: "Maximize and smash its stuck fist, then hit it." },
  size: [128, 112],
  props: {
    enemy: true, hurts: true, isBoss: true, alwaysActive: true, alwaysDraw: true,
    hp: 9, title: "BLUE SCREEN BEAST", color: "#1e88e5",
    stompable: (e) => (e.mode === "update" ? true : "bounce"),
    shootable: (e) => e.mode === "update",
    dashable: (e) => e.mode === "update",
  },
  init(e) {
    const a = e.opts.arena || [e.col - 15, e.row - 15, 30, 17];
    e.arena = { x: a[0] * TILE, y: a[1] * TILE, w: a[2] * TILE, h: a[3] * TILE };
    e.floorY = e.home.y + e.h;
    this.onRespawn(e);
  },
  onRespawn(e) {
    e.x = e.home.x; e.y = e.home.y;
    e.hp = e.maxHp; e.mode = "sleep"; e.timer = 0; e.step = 0; e.phase = 1;
    e.fists = []; e.healT = 0; e.slams = 0; e.pct = 0;
  },
  phaseOf(e) { const q = e.maxHp / 3; return e.hp > q * 2 ? 1 : e.hp > q ? 2 : 3; },
  pattern(e) {
    if (e.phase === 1) return ["fists", "popups", "scan"];
    if (e.phase === 2) return ["fists", "drag", "scan"];
    return ["crash", "fists", "drag"];
  },
  next(e) { const pat = this.pattern(e); e.mode = pat[e.step % pat.length]; e.step++; e.timer = 0; e.slams = e.phase === 3 ? 4 : 3; },
  rest(e, f) { e.mode = "rest"; e.timer = f; },
  dropHealth(e, world) {
    const x = e.arena.x + 3 * TILE + Math.random() * (e.arena.w - 6 * TILE);
    const h = world.spawn("powerup", x, e.floorY - 40, {}, "health");
    if (h) { h.transient = true; h.beastDrop = true; world.particles.ring(U.cx(h), U.cy(h), "#e53935", 26); }
  },
  /** Where a fist rests beside the screen. */
  fistHome(e, i) { return { x: (i ? e.x + e.w + 22 : e.x - 66), y: e.y + 36 }; },

  update(e, world) {
    const p = world.player;
    const fast = [1, 1.15, 1.3][e.phase - 1];
    e.hurts = !["sleep", "update", "dying"].includes(e.mode);
    if (!["sleep", "intro", "dying"].includes(e.mode) && ++e.healT >= 840) {
      e.healT = 0;
      if (!world.entities.some((o) => o.beastDrop && !o.dead)) this.dropHealth(e, world);
    }
    // A stuck fist: a Maximized player smashes it and the Beast crashes into an update.
    for (const f of e.fists) {
      if (!(f.stuck > 0)) continue;
      f.stuck--;
      const P = world.player;
      if (P.alive && P.form === "max" && U.overlap({ x: P.x - 4, y: P.y - 4, w: P.w + 8, h: P.h + 8 }, f) && !["dying", "update"].includes(e.mode)) {
        f.stuck = 0; f.busy = false;
        world.particles.burst(U.cx(f), U.cy(f), 30, "#ffb300", 6, { shape: "square" });
        world.camera.shake(10); sfx.play("smash");
        for (const o of world.entities) if (o.name === "shockwave" || o.name === "scanBeam" || o.name === "panelDrop") o.dead = true;
        e.mode = "update"; e.timer = 0;
      } else if (f.stuck <= 0) f.busy = false;
    }
    // Idle fists drift back home.
    for (let i = 0; i < e.fists.length; i++) {
      const f = e.fists[i];
      if (f.busy) continue;
      const h = this.fistHome(e, i);
      f.x += (h.x - f.x) * 0.1; f.y += (h.y + Math.sin(world.time * 0.06 + i * 2) * 6 - f.y) * 0.1;
      f.armed = false;
    }

    switch (e.mode) {
      case "sleep":
        if (p.alive && U.overlap(p, e.arena) && p.x > e.arena.x + 5 * TILE) {
          e.mode = "intro"; e.timer = 90;
          world.startBoss(e, e.arena);
          e.fists = [0, 1].map((i) => {
            const h = this.fistHome(e, i);
            const f = world.spawn("beastFist", h.x, h.y, {});
            if (f) { f.transient = true; f.alwaysActive = true; }
            return f;
          }).filter(Boolean);
        }
        return;
      case "intro":
        if (e.timer % 15 === 0) world.particles.burst(U.cx(e), e.y + 20, 10, "#4fc3ff", 4, { shape: "square" });
        if (--e.timer <= 0) { this.dropHealth(e, world); this.rest(e, 30); }
        return;
      case "rest":
        if (--e.timer <= 0) this.next(e);
        return;

      case "fists": {
        const f = e.fists[e.slams % 2];
        if (!f) { this.rest(e, 30); return; }
        if (e.timer === 0) for (const o of e.fists) o.stuck = 0;
        e.timer++;
        const aim = Math.round(40 / fast), fallMax = 50, hold = 18;
        f.busy = true;
        if (e.timer === 1) f.tx = U.clamp(U.cx(p) - f.w / 2, e.arena.x + TILE, e.arena.x + e.arena.w - TILE - f.w);
        if (e.timer <= aim) {
          f.x += (f.tx - f.x) * 0.2; f.y += (e.arena.y + 2 * TILE - f.y) * 0.2;
          f.shadow = true; f.armed = false;
        } else if (e.timer <= aim + fallMax && f.y + f.h < e.floorY) {
          f.y = Math.min(e.floorY - f.h, f.y + 15); f.armed = true; f.shadow = true;
          if (f.y + f.h >= e.floorY) {
            for (const d of [-1, 1]) {
              const s = world.spawn("shockwave", d > 0 ? f.x + f.w : f.x - 18, e.floorY - 20, {});
              if (s) { s.dir = d; s.speed = 4.4 * fast; }
            }
            world.camera.shake(8); sfx.play("slam");
            e.timer = aim + fallMax; // jump to hold
          }
        } else if (e.timer <= aim + fallMax + hold) {
          f.armed = true; f.shadow = false;
        } else {
          f.busy = false; f.armed = false; f.shadow = false;
          e.timer = 0;
          if (--e.slams <= 0) {
            // The last fist gets stuck in the floor: smash it while Maximized.
            f.busy = true; f.stuck = 220;
            if (!Save.seen("stuckFist")) { Save.markSeen("stuckFist"); world.showHint("{maximize} and smash the stuck fist"); }
            this.rest(e, Math.round(30 / fast));
          }
        }
        return;
      }

      case "popups": {
        e.timer++;
        if (e.timer === 20) {
          const alive = world.entities.filter((o) => o.minion && !o.dead).length;
          for (let i = 0; i < Math.min(2, 3 - alive); i++) {
            const m = world.spawn("popupWindow", U.cx(e) - 18 + (i ? 60 : -60), e.y - 10, { speed: 1.8 * fast, sight: 30 });
            if (m) { m.transient = true; m.minion = true; m.alwaysActive = true; }
          }
          sfx.play("ding");
        }
        if (e.timer > 50) this.rest(e, 30);
        return;
      }

      case "scan": {
        e.timer++;
        if (e.timer === 1) {
          const gw = 3.5 * TILE;
          const gx = e.arena.x + 2 * TILE + Math.random() * (e.arena.w - 4 * TILE - gw);
          const b = world.spawn("scanBeam", e.arena.x, e.arena.y + TILE, {});
          if (b) {
            b.w = e.arena.w; b.gx0 = gx; b.gx1 = gx + gw; b.floorY = e.floorY;
            b.speed = (e.floorY - b.y) / (110 / fast);
          }
        }
        if (e.timer > 40 + 110 / fast + 10) this.rest(e, 30);
        return;
      }

      case "drag": {
        e.timer++;
        if (e.timer > 20 && e.timer < 150 && p.alive && U.overlap(p, e.arena) && p.dragT !== world.time) {
          p.dragT = world.time;
          Physics.move(world, p, U.sign(U.cx(e) - U.cx(p)) * 1.8, 0);
          if (world.time % 4 === 0) world.particles.emit(U.cx(p), U.cy(p), { vx: U.sign(U.cx(e) - U.cx(p)) * 2, life: 14, size: 3, color: "#4fc3ff", shape: "square" });
        }
        if (e.timer > 160) this.rest(e, 30);
        return;
      }

      case "crash": {
        e.timer++;
        if (e.timer === 10) {
          const xs = [U.cx(p)];
          while (xs.length < 5) {
            const x = e.arena.x + 2 * TILE + Math.random() * (e.arena.w - 4 * TILE);
            if (xs.every((o) => Math.abs(o - x) > 80)) xs.push(x);
          }
          xs.forEach((x, i) => {
            const d = world.spawn("panelDrop", x - 18, e.arena.y + TILE, {});
            if (d) { d.floorY = e.floorY; d.warn = 46 + i * 8; }
          });
        }
        if (e.timer > 110) this.rest(e, 30);
        return;
      }

      case "update": {
        e.timer++;
        const openFor = [230, 200, 170][e.phase - 1];
        e.pct = Math.min(99, Math.floor((e.timer / openFor) * 100));
        if (e.timer > openFor) this.rest(e, 30);
        return;
      }

      case "dying":
        e.timer--;
        if (e.timer % 6 === 0) {
          world.particles.burst(e.x + Math.random() * e.w, e.y + Math.random() * e.h, 14, U.pick(["#1e88e5", "#4fc3ff", "#ffffff"]), 6, { shape: "square" });
          world.camera.shake(8);
        }
        if (e.timer <= 0) world.killEntity(e);
        return;
    }
  },

  onDamage(e, world) {
    if (e.mode !== "update" || e.iframes > 0) return false;
    e.hp -= 1; e.flash = 10; e.iframes = 22;
    world.camera.shake(8); sfx.play("bossHit");
    world.particles.burst(U.cx(e), U.cy(e), 20, "#ffffff", 5, { shape: "square" });
    if (e.hp <= 0) {
      e.mode = "dying"; e.timer = 150;
      for (const o of world.entities) if (["shockwave", "scanBeam", "panelDrop", "beastFist"].includes(o.name) || o.minion) o.dead = true;
      world.banner = { text: "SHUTTING DOWN", sub: "", t: 140, max: 140, color: "#4fc3ff" };
      return true;
    }
    const ph = this.phaseOf(e);
    if (ph !== e.phase) {
      e.phase = ph; e.step = 0; this.rest(e, 40);
      this.dropHealth(e, world); e.healT = 0;
      world.banner = { text: `PHASE ${ph}`, sub: "", t: 90, max: 90, color: ph === 3 ? "#e53935" : "#4fc3ff" };
    }
    return true;
  },

  onDeath(e, world) {
    world.endBoss(e);
    world.particles.burst(U.cx(e), U.cy(e), 100, "#4fc3ff", 9, { shape: "square" });
    for (const o of world.entities) if (o.minion) world.killEntity(o);
  },

  draw(e, ctx, world) {
    const x = Math.round(e.x), y = Math.round(e.y);
    const upd = e.mode === "update";
    const blue = e.flash ? "#ffffff" : e.phase === 3 ? "#1565c0" : "#1e88e5";
    if (e.mode === "sleep") ctx.globalAlpha = 0.6;
    // Stand.
    ctx.fillStyle = "#1b2330"; ctx.fillRect(x + 54, y + 84, 20, 22); ctx.fillRect(x + 30, y + 104, 68, 8);
    // Screen.
    ctx.fillStyle = "#0b1f3a"; ctx.fillRect(x, y, e.w, 88);
    ctx.fillStyle = blue; ctx.fillRect(x + 6, y + 6, e.w - 12, 76);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(x + 14, y + 14, 40, 4); ctx.fillRect(x + 14, y + 22, 60, 3); ctx.fillRect(x + 14, y + 28, 48, 3);
    if (upd) {
      const pulse = 10 + Math.sin(world.time * 0.3) * 3;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(x + e.w / 2 - pulse, y + 40 - pulse / 2, pulse * 2, pulse);
      U.glow(ctx, x + e.w / 2, y + 40, 40, "#ffffff", 0.7);
      ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.fillRect(x + 14, y + 64, e.w - 28, 6);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(x + 14, y + 64, (e.w - 28) * (e.pct / 100), 6);
      ctx.font = "10px monospace"; ctx.textAlign = "center";
      ctx.fillText(`UPDATING ${e.pct}%`, x + e.w / 2, y + 79); ctx.textAlign = "left";
    } else {
      for (let i = 0; i < 6; i++) {                 // dot spinner
        const a = world.time * 0.1 + i * 0.5;
        ctx.fillStyle = `rgba(255,255,255,${0.2 + i * 0.13})`;
        ctx.beginPath(); ctx.arc(x + e.w / 2 + Math.cos(a) * 14, y + 50 + Math.sin(a) * 14, 3, 0, 6.28); ctx.fill();
      }
    }
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < 4 - e.phase ? "#4fc3ff" : "#2a3a52"; ctx.fillRect(x + e.w / 2 - 16 + i * 12, y - 10, 8, 4); }
    ctx.globalAlpha = 1;
  },
});

// One of the Beast's fists (positions driven by the Beast).
registerEntity("beastFist", {
  size: [44, 44],
  layer: 2,
  props: { transient: true, alwaysActive: true, alwaysDraw: true },
  onTouch(e, world) { if (e.armed) world.hurtPlayer(1, e); },
  draw(e, ctx, world) {
    if (e.shadow) {
      const beast = world.boss;
      const floorY = beast && beast.floorY ? beast.floorY : e.y + 300;
      ctx.fillStyle = "rgba(229,57,53,0.45)"; ctx.fillRect(e.x, floorY - 4, e.w, 4);
    }
    ctx.fillStyle = "#0b1f3a"; ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.fillStyle = e.stuck > 0 ? (world.time % 10 < 5 ? "#ffb300" : "#ffe082") : e.armed ? "#e53935" : "#1e88e5"; ctx.fillRect(e.x + 4, e.y + 4, e.w - 8, e.h - 8);
    if (e.stuck > 0) U.glow(ctx, U.cx(e), U.cy(e), 40, "#ffb300", 0.5);
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(e.x + 8, e.y + 8, e.w - 16, 4);
  },
});

// Horizontal scanline: sweeps down the arena with one safe gap.
registerEntity("scanBeam", {
  size: [32, 8],
  layer: 2,
  props: { transient: true, alwaysActive: true, alwaysDraw: true, warn: 40, freezable: true },
  update(e) {
    if (e.t <= e.warn) return;
    e.y += e.speed;
    if (e.y + e.h >= e.floorY) e.dead = true;
  },
  onTouch(e, world, p) {
    if (e.t <= e.warn) return;
    const inGap = p.x >= e.gx0 && p.x + p.w <= e.gx1;
    if (!inGap) world.hurtPlayer(1, e);
  },
  draw(e, ctx, world) {
    const warn = e.t <= e.warn;
    ctx.globalAlpha = warn ? (world.time % 8 < 4 ? 0.5 : 0.2) : 1;
    ctx.fillStyle = "#e3f2fd";
    ctx.fillRect(e.x, e.y + 2, e.gx0 - e.x, 4); ctx.fillRect(e.gx1, e.y + 2, e.x + e.w - e.gx1, 4);
    ctx.fillStyle = "rgba(79,195,255,0.35)";
    ctx.fillRect(e.x, e.y - 2, e.gx0 - e.x, 12); ctx.fillRect(e.gx1, e.y - 2, e.x + e.w - e.gx1, 12);
    ctx.strokeStyle = "#43a047"; ctx.lineWidth = 2;
    ctx.strokeRect(e.gx0, e.y - 6, e.gx1 - e.gx0, 20); // the safe gap
    ctx.globalAlpha = 1;
  },
});

// Small blue panel crashing down after a floor marker.
registerEntity("panelDrop", {
  size: [36, 24],
  layer: 2,
  props: { transient: true, alwaysActive: true, alwaysDraw: true, freezable: true },
  init(e) { e.warn = 50; e.vy = 0; },
  update(e, world) {
    if (e.t <= e.warn) return;
    e.vy = Math.min(11, e.vy + 0.9);
    e.y += e.vy;
    if (e.y + e.h >= e.floorY) { e.dead = true; world.particles.burst(U.cx(e), e.floorY - 4, 10, "#4fc3ff", 4, { shape: "square" }); }
  },
  onTouch(e, world) { if (e.t > e.warn) world.hurtPlayer(1, e); },
  draw(e, ctx, world) {
    if (e.t <= e.warn) {
      ctx.fillStyle = world.time % 8 < 4 ? "#e53935" : "#7a1f1d";
      ctx.fillRect(e.x, e.floorY - 4, e.w, 4);
      return;
    }
    ctx.fillStyle = "#0b1f3a"; ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.fillStyle = "#1e88e5"; ctx.fillRect(e.x + 3, e.y + 3, e.w - 6, e.h - 6);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(e.x + 8, e.y + 14, e.w - 16, 3);
  },
});

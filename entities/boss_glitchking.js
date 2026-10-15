/* =========================================================================
 * entities/boss_glitchking.js — GLITCH KING (World 3 boss)
 *
 * A big blocky king made of squares.
 *   Phase 1  hops (shockwaves on landing), tosses bouncing squares
 *   Phase 2  + SPLIT: breaks into four shards that orbit, then dash at you
 *   Phase 3  + PIXEL RAIN, faster everything
 * After each attack string it gets DAZED: the crown lifts off and its core
 * is open — stomp, shoot, dash or bomb it. Repair capsules drop at the start
 * of each phase and every ~14 s during the fight.
 *
 * overrides: hp (multiple of 3), title, arena: [col, row, cols, rows]
 * ========================================================================= */
"use strict";

registerEntity("glitchKing", {
  size: [96, 88],
  props: {
    enemy: true, hurts: true, isBoss: true, alwaysActive: true, alwaysDraw: true,
    hp: 18, title: "GLITCH KING", color: PICO.yellow,
    stompable: (e) => (e.mode === "daze" ? true : "bounce"),
    shootable: (e) => e.mode === "daze",
    dashable: (e) => e.mode === "daze",
  },
  init(e, world) {
    const a = e.opts.arena || [e.col - 15, e.row - 15, 30, 17];
    e.arena = { x: a[0] * TILE, y: a[1] * TILE, w: a[2] * TILE, h: a[3] * TILE };
    e.floorY = e.home.y + e.h;
    this.onRespawn(e, world);
  },
  onRespawn(e) {
    e.x = e.home.x; e.y = e.home.y;
    e.vx = 0; e.vy = 0;
    e.hp = e.maxHp;
    e.mode = "sleep"; e.timer = 0; e.step = 0;
    e.phase = 1; e.hidden = false; e.shards = []; e.healT = 0; e.onGround = true;
  },
  phaseOf(e) { const q = e.maxHp / 3; return e.hp > q * 2 ? 1 : e.hp > q ? 2 : 3; },
  pattern(e) {
    if (e.phase === 1) return ["hop", "toss", "hop", "daze"];
    if (e.phase === 2) return ["split", "hop", "toss", "daze"];
    return ["split", "rain", "hop", "rain", "toss", "daze"];
  },
  next(e) {
    const pat = this.pattern(e);
    e.mode = pat[e.step % pat.length];
    e.step++; e.timer = 0; e.hops = e.phase === 3 ? 4 : 3;
  },
  rest(e, f) { e.mode = "rest"; e.timer = f; },
  dropHealth(e, world) {
    const x = e.arena.x + 3 * TILE + Math.random() * (e.arena.w - 6 * TILE);
    const h = world.spawn("powerup", x, e.floorY - 40, {}, "health");
    if (h) { h.transient = true; h.kingDrop = true; world.particles.ring(U.cx(h), U.cy(h), PICO.red, 26); }
  },
  physics(e, world) {
    e.vy = Math.min(14, e.vy + 0.7);
    const was = e.onGround;
    const res = Physics.move(world, e, e.vx, e.vy, { oneway: false });
    if (res.hitY) e.vy = 0;
    if (res.hitX) e.vx = 0;
    e.onGround = res.onGround;
    return { landed: res.onGround && !was };
  },

  update(e, world) {
    const p = world.player;
    const fast = [1, 1.15, 1.3][e.phase - 1];
    e.hurts = !e.hidden && !["sleep", "daze", "dying"].includes(e.mode);

    if (!["sleep", "intro", "dying"].includes(e.mode) && ++e.healT >= 840) {
      e.healT = 0;
      if (!world.entities.some((o) => o.kingDrop && !o.dead)) this.dropHealth(e, world);
    }

    switch (e.mode) {
      case "sleep":
        if (p.alive && U.overlap(p, e.arena) && p.x > e.arena.x + 5 * TILE) {
          e.mode = "intro"; e.timer = 90;
          world.startBoss(e, e.arena);
        }
        return;
      case "intro":
        if (e.timer % 12 === 0) world.particles.burst(U.cx(e), e.y, 10, PICO.yellow, 4, { shape: "square" });
        this.physics(e, world);
        if (--e.timer <= 0) { this.dropHealth(e, world); this.rest(e, 30); }
        return;
      case "rest":
        e.vx = U.approach(e.vx, 0, 0.5);
        this.physics(e, world);
        if (--e.timer <= 0 && e.onGround) this.next(e);
        return;

      case "hop": {
        const { landed } = this.physics(e, world);
        if (landed) {
          for (const d of [-1, 1]) {
            const s = world.spawn("shockwave", d > 0 ? e.x + e.w : e.x - 18, e.floorY - 20, {});
            if (s) { s.dir = d; s.speed = 4.4 * fast; }
          }
          world.camera.shake(9);
          sfx.play("slam");
          world.particles.burst(U.cx(e), e.floorY - 4, 16, PICO.orange, 4, { shape: "square" });
          e.vx = 0; e.timer = Math.round(24 / fast);
        }
        if (e.onGround) {
          if (e.timer > 0) e.timer--;
          else if (e.hops > 0) {
            e.hops--;
            e.vy = -13;
            e.vx = U.clamp((U.cx(p) - U.cx(e)) / 40, -5, 5) * fast;
            e.onGround = false;
          } else this.rest(e, 30);
        }
        return;
      }

      case "toss": {
        e.vx = 0; this.physics(e, world);
        e.timer++;
        if (e.timer === 30) {
          const alive = world.entities.filter((o) => o.minion && !o.dead).length;
          for (let i = 0; i < Math.min(2, 3 - alive); i++) {
            const b = world.spawn("bouncingSquare", U.cx(e) - 11 + (i ? 30 : -30), e.y - 30, { speed: 2.6 * fast, angle: i ? "ur" : "ul" });
            if (b) { b.transient = true; b.minion = true; b.alwaysActive = true; b.hp = 2; }
          }
          sfx.play("fire");
        }
        if (e.timer > 60) this.rest(e, Math.round(40 / fast));
        return;
      }

      case "split": {
        e.timer++;
        const cx = e.arena.x + e.arena.w / 2, cy = e.floorY - 5 * TILE;
        if (e.timer === 1) {
          e.hidden = true;
          e.shards = [];
          const sx = U.cx(e) - 15, sy = U.cy(e) - 15;
          for (let i = 0; i < 4; i++) {
            const s = world.spawn("kingShard", sx, sy, {});
            if (s) { s.transient = true; s.slot = i; s.mode = "orbit"; e.shards.push(s); }
          }
          world.camera.shake(8); sfx.play("glitch");
          e.y = -4000; // body is gone while the shards fly
        }
        const shards = e.shards.filter((s) => !s.dead);
        // Orbit, then dash one by one, then regroup.
        const orbitPos = (s) => {
          const a = world.time * 0.03 * fast + s.slot * Math.PI / 2;
          return { x: cx + Math.cos(a) * 140 - 15, y: cy + Math.sin(a) * 70 - 15 };
        };
        const dashStart = 60, each = Math.round(70 / fast);
        const k = Math.floor((e.timer - dashStart) / each), f = (e.timer - dashStart) % each;
        for (const s of shards) {
          if (e.timer < dashStart + 4 * each && !(k === s.slot && e.timer >= dashStart)) {
            const o = orbitPos(s); s.x += (o.x - s.x) * 0.15; s.y += (o.y - s.y) * 0.15; s.flashT = 0;
            continue;
          }
          if (k === s.slot && e.timer >= dashStart) {
            if (f < 26) { s.flashT = 1; s.aim = { x: U.cx(p) - 15, y: U.cy(p) - 15 }; } // telegraph
            else {
              s.flashT = 0;
              const dx = s.aim.x - s.x, dy = s.aim.y - s.y, d = Math.hypot(dx, dy);
              if (d > 6) { s.x += (dx / d) * 9 * fast; s.y += (dy / d) * 9 * fast; }
            }
          }
        }
        if (e.timer >= dashStart + 4 * each) {
          // Regroup at the arena centre floor.
          for (const s of shards) { s.x += (cx - 15 - s.x) * 0.12; s.y += (e.floorY - 60 - s.y) * 0.12; }
          if (e.timer >= dashStart + 4 * each + 40) {
            for (const s of shards) { s.dead = true; world.particles.burst(U.cx(s), U.cy(s), 8, PICO.yellow, 3, { shape: "square" }); }
            e.shards = [];
            e.hidden = false;
            e.x = cx - e.w / 2; e.y = e.floorY - e.h; e.vy = 0;
            this.rest(e, 30);
          }
        }
        return;
      }

      case "rain": {
        e.vx = 0; this.physics(e, world);
        e.timer++;
        if (e.timer === 10) {
          const xs = [U.cx(p)];
          while (xs.length < 8) {
            const x = e.arena.x + 2 * TILE + Math.random() * (e.arena.w - 4 * TILE);
            if (xs.every((o) => Math.abs(o - x) > 64)) xs.push(x);
          }
          xs.forEach((x, i) => {
            const d = world.spawn("pixelDrop", x - 12, e.arena.y + TILE, {});
            if (d) { d.floorY = e.floorY; d.warn = 48 + i * 7; }
          });
        }
        if (e.timer > 120) this.rest(e, 30);
        return;
      }

      case "daze": {
        e.vx = 0; this.physics(e, world);
        e.timer++;
        if (e.timer % 12 === 0) world.particles.emit(U.cx(e) + U.rand(-30, 30), e.y, { vy: -1.5, life: 28, size: 4, color: PICO.yellow, shape: "square" });
        if (e.timer > [230, 200, 170][e.phase - 1]) this.rest(e, 30);
        return;
      }

      case "dying":
        e.timer--;
        if (e.timer % 6 === 0) {
          world.particles.burst(e.x + Math.random() * e.w, e.y + Math.random() * e.h, 14, U.pick([PICO.yellow, PICO.red, PICO.blue, PICO.white]), 6, { shape: "square" });
          world.camera.shake(8);
        }
        if (e.timer <= 0) world.killEntity(e);
        return;
    }
  },

  onDamage(e, world) {
    if (e.mode !== "daze" || e.iframes > 0) return false;
    e.hp -= 1; e.flash = 10; e.iframes = 22;
    world.camera.shake(8);
    sfx.play("bossHit");
    world.particles.burst(U.cx(e), e.y + 10, 20, PICO.white, 5, { shape: "square" });
    if (e.hp <= 0) {
      e.mode = "dying"; e.timer = 150;
      for (const o of world.entities) if (o.name === "shockwave" || o.name === "pixelDrop" || o.name === "kingShard" || o.minion) o.dead = true;
      world.banner = { text: "GAME OVER, KING", sub: "", t: 140, max: 140, color: PICO.yellow };
      return true;
    }
    const ph = this.phaseOf(e);
    if (ph !== e.phase) {
      e.phase = ph; e.step = 0; this.rest(e, 40);
      this.dropHealth(e, world); e.healT = 0;
      world.banner = { text: `PHASE ${ph}`, sub: "", t: 90, max: 90, color: ph === 3 ? PICO.red : PICO.orange };
    }
    return true;
  },

  onDeath(e, world) {
    world.endBoss(e);
    world.particles.burst(U.cx(e), U.cy(e), 100, PICO.yellow, 9, { shape: "square" });
    for (const o of world.entities) if (o.minion) world.killEntity(o);
  },

  draw(e, ctx, world) {
    if (e.hidden) return;
    const x = Math.round(e.x / 4) * 4, y = Math.round(e.y / 4) * 4;
    const daze = e.mode === "daze";
    const glitch = e.mode !== "sleep" && world.time % 53 < 3 ? 8 : 0;
    const robe = e.flash ? PICO.white : e.phase === 3 ? PICO.red : PICO.plum;
    if (e.mode === "sleep") ctx.globalAlpha = 0.55;
    // Robe: a stepped pyramid of blocks.
    ctx.fillStyle = robe;
    ctx.fillRect(x + 8, y + 52, 80, 36);
    ctx.fillRect(x + 16 + glitch, y + 36, 64, 16);
    ctx.fillStyle = PICO.yellow;
    ctx.fillRect(x + 8, y + 80, 80, 8);              // trim
    ctx.fillRect(x + 44, y + 36, 8, 52);             // sash
    // Head block with a single visor slit (no face).
    ctx.fillStyle = e.flash ? PICO.white : PICO.lilac;
    ctx.fillRect(x + 28 - glitch, y + 12, 40, 24);
    ctx.fillStyle = PICO.black; ctx.fillRect(x + 32 - glitch, y + 20, 32, 6);
    ctx.fillStyle = daze ? PICO.yellow : PICO.red; ctx.fillRect(x + 36 - glitch + (Math.floor(world.time / 10) % 3) * 8, y + 20, 8, 6);
    // Floating hands.
    const bob = Math.round(Math.sin(world.time * 0.08) * 3) * 2;
    ctx.fillStyle = robe;
    ctx.fillRect(x - 12, y + 48 + bob, 16, 16); ctx.fillRect(x + 92, y + 48 - bob, 16, 16);
    // Crown: lifts off while dazed, exposing the core.
    const lift = daze ? 26 + Math.round(Math.sin(world.time * 0.2) * 2) * 2 : 0;
    ctx.fillStyle = PICO.orange;
    ctx.fillRect(x + 24, y + 4 - lift, 48, 8);
    for (let k = 0; k < 3; k++) ctx.fillRect(x + 24 + k * 20, y - 8 - lift, 8, 12);
    ctx.fillStyle = PICO.yellow;
    ctx.fillRect(x + 24, y + 4 - lift, 48, 4);
    if (daze) {
      ctx.fillStyle = Math.floor(world.time / 6) % 2 ? PICO.white : PICO.blue;
      ctx.fillRect(x + 40, y + 4, 16, 8); // the core
      U.glow(ctx, x + 48, y + 8, 30, PICO.blue, 0.6);
    }
    // Phase pips.
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < 4 - e.phase ? PICO.yellow : PICO.dgray; ctx.fillRect(x + 32 + i * 12, y + 92, 8, 4); }
    ctx.globalAlpha = 1;
  },
});

// A quarter of the split king. Positions are driven by the Glitch King.
registerEntity("kingShard", {
  size: [30, 30],
  layer: 2,
  props: { transient: true, alwaysActive: true, alwaysDraw: true, hurts: true },
  draw(e, ctx, world) {
    const flash = e.flashT && Math.floor(world.time / 4) % 2;
    const x = Math.round(e.x / 2) * 2, y = Math.round(e.y / 2) * 2;
    ctx.fillStyle = flash ? PICO.white : PICO.plum; ctx.fillRect(x, y, 30, 30);
    ctx.fillStyle = PICO.yellow; ctx.fillRect(x, y, 30, 4); ctx.fillRect(x, y, 4, 30);
    ctx.fillStyle = flash ? PICO.red : PICO.orange; ctx.fillRect(x + 11, y + 11, 8, 8);
  },
});

// Falling pixel block with a floor marker.
registerEntity("pixelDrop", {
  size: [24, 24],
  layer: 2,
  props: { transient: true, alwaysActive: true, alwaysDraw: true, freezable: true },
  init(e) { e.warn = 50; e.vy = 0; },
  update(e, world) {
    if (e.t <= e.warn) return;
    e.vy = Math.min(10, e.vy + 0.8);
    e.y += e.vy;
    if (e.y + e.h >= e.floorY) { e.dead = true; world.particles.burst(U.cx(e), e.floorY - 4, 10, PICO.orange, 4, { shape: "square" }); }
  },
  onTouch(e, world) { if (e.t > e.warn) world.hurtPlayer(1, e); },
  draw(e, ctx, world) {
    if (e.t <= e.warn) {
      ctx.fillStyle = world.time % 8 < 4 ? PICO.red : PICO.plum;
      ctx.fillRect(e.x, e.floorY - 4, e.w, 4);
      return;
    }
    ctx.fillStyle = PICO.orange; ctx.fillRect(e.x, e.y, 24, 24);
    ctx.fillStyle = PICO.yellow; ctx.fillRect(e.x, e.y, 24, 4); ctx.fillRect(e.x, e.y, 4, 24);
    ctx.fillStyle = PICO.brown; ctx.fillRect(e.x + 8, e.y + 8, 8, 8);
  },
});

/* =========================================================================
 * entities/boss_daemon.js — ADMIN DAEMON (World 2 boss)
 *
 * A floating terminal window around a crystal core.
 *   Phase 1 SUDO          teleports, code volleys, summons antivirus drones
 *   Phase 2 FORK          + purge waves (a sweeping firewall with a gap —
 *                           stand in the gap, or Data Dash straight through)
 *   Phase 3 KERNEL PANIC  + falling glitch blocks, faster everything
 * Unique mechanic: FREEZE PROCESS locks it up — while frozen it stops dead
 * and its core is open (shoot it). After each attack string it also COMPILES:
 * it sinks to the floor and opens — stomp, shoot, dash or infect it.
 * 9 hits (3 per phase). Health pickups at the start of each phase and every
 * ~14 s during the fight.
 *
 * overrides: hp (multiple of 3), title, arena: [col, row, cols, rows]
 * ========================================================================= */
"use strict";

const DAEMON_COLORS = ["#39ff88", "#ffd23d", "#ff3df0"];

registerEntity("adminDaemon", {
  info: { name: "Admin Daemon", desc: "Freeze it, then shoot. It also opens while compiling." },
  size: [84, 72],
  anchor: "center",
  props: {
    enemy: true, hurts: true, isBoss: true, alwaysActive: true, alwaysDraw: true,
    hp: 9, title: "ADMIN DAEMON", color: "#39ff88",
    stompable: (e) => (e.open ? true : "bounce"),
    shootable: (e) => e.open,
    dashable: (e) => e.open,
  },
  init(e, world) {
    const a = e.opts.arena || [e.col - 15, e.row - 4, 30, 17];
    e.arena = { x: a[0] * TILE, y: a[1] * TILE, w: a[2] * TILE, h: a[3] * TILE };
    let r = e.row + 1;
    while (r < world.h && !Physics.solidAt(world, e.col, r)) r++;
    e.floorY = r * TILE;
    e.hoverY = e.floorY - 6.5 * TILE - e.h / 2;
    const ax = e.arena.x, aw = e.arena.w;
    e.anchors = [ax + 5 * TILE, ax + aw / 2, ax + aw - 5 * TILE].map((x) => x - e.w / 2);
    this.onRespawn(e, world);
  },
  onRespawn(e) {
    e.x = e.home.x; e.y = e.home.y;
    e.hp = e.maxHp;
    e.mode = "sleep"; e.timer = 0; e.step = 0;
    e.phase = 1; e.open = false; e.alpha = 1; e.spin = 0;
    e.anchor = 1; e.healT = 0;
  },
  phaseOf(e) {
    const q = e.maxHp / 3;
    return e.hp > q * 2 ? 1 : e.hp > q ? 2 : 3;
  },
  pattern(e) {
    if (e.phase === 1) return ["teleport", "volley", "drones", "compile"];
    if (e.phase === 2) return ["teleport", "purge", "volley", "compile"];
    return ["storm", "purge", "teleport", "compile"];
  },
  next(e) {
    const pat = this.pattern(e);
    e.mode = pat[e.step % pat.length];
    e.step++;
    e.timer = 0;
  },
  rest(e, frames) { e.mode = "rest"; e.timer = frames; },

  /** Drop a repair capsule on the arena floor. */
  dropHealth(e, world) {
    const x = e.arena.x + 3 * TILE + Math.random() * (e.arena.w - 6 * TILE);
    const h = world.spawn("powerup", x, e.floorY - 40, {}, "health");
    if (h) { h.transient = true; h.daemonDrop = true; world.particles.ring(U.cx(h), U.cy(h), "#ff4d6d", 26); }
  },

  update(e, world) {
    const p = world.player;
    const fast = [1, 1.15, 1.3][e.phase - 1];
    const cx = U.cx(e), cy = U.cy(e);
    e.spin += e.open ? 0.01 : 0.03 * fast;
    e.hurts = !["sleep", "compile", "dying", "teleport"].includes(e.mode) || (e.mode === "teleport" && e.alpha > 0.6);
    // Freeze Process locks it up: frozen in place, core open.
    // (at most 2 hits per freeze, so it stays a fight)
    if (world.frozen > 0 && !["sleep", "intro", "dying"].includes(e.mode)) {
      if (!e.frozenLock) { e.frozenLock = true; e.lockHits = 0; e.wasOpen = e.open; world.showHint("LOCKED UP! Shoot the core"); }
      e.open = e.lockHits < 2; e.hurts = false; e.alpha = 1;
      return;
    }
    if (e.frozenLock) { e.frozenLock = false; e.open = e.mode === "compile" && e.wasOpen; }

    // Repair capsules every ~14 s while the fight is on (one at a time).
    if (e.mode !== "sleep" && e.mode !== "intro" && e.mode !== "dying") {
      if (++e.healT >= 840) {
        e.healT = 0;
        if (!world.entities.some((o) => o.daemonDrop && !o.dead)) this.dropHealth(e, world);
      }
    }

    switch (e.mode) {
      case "sleep":
        if (p.alive && U.overlap(p, e.arena) && p.x > e.arena.x + 5 * TILE) {
          e.mode = "intro"; e.timer = 100;
          world.startBoss(e, e.arena);
        }
        return;
      case "intro":
        if (e.timer % 10 === 0) world.particles.ring(cx, cy, e.color, 30 + (100 - e.timer), 20);
        if (--e.timer <= 0) { this.dropHealth(e, world); this.rest(e, 40); }
        return;
      case "rest":
        e.x += (e.anchors[e.anchor] - e.x) * 0.06;
        e.y += (e.hoverY + Math.sin(world.time * 0.04) * 8 - e.y) * 0.06;
        if (--e.timer <= 0) this.next(e);
        return;

      case "teleport": {
        e.timer++;
        if (e.timer < 24) e.alpha = 1 - e.timer / 24;
        if (e.timer === 24) {
          let k; do { k = Math.floor(Math.random() * 3); } while (k === e.anchor);
          e.anchor = k;
          e.x = e.anchors[k]; e.y = e.hoverY;
          if (world.onScreen(e)) sfx.play("glitch");
        }
        if (e.timer > 24) e.alpha = Math.min(1, (e.timer - 24) / 20);
        if (e.timer >= 46) { e.alpha = 1; this.rest(e, Math.round(30 / fast)); }
        return;
      }

      case "volley": {
        // Telegraph a firing line at the player's height, then send code bars along it.
        e.timer++;
        const rows = e.phase === 3 ? 3 : 2;
        const per = 42;
        const k = Math.floor(e.timer / per), f = e.timer % per;
        if (k < rows) {
          if (f === 0) e.lineY = U.clamp(U.cy(p), e.arena.y + TILE * 2, e.floorY - 10);
          if (f === 26) {
            const dir = U.sign(U.cx(p) - cx) || 1;
            for (let i = 0; i < 3; i++) {
              const b = world.spawn("bullet", cx - 5 - dir * i * 26, e.lineY - 5, {});
              if (b) { b.vx = dir * 3.4 * fast; b.vy = 0; b.color = e.color; }
            }
            sfx.play("fire");
          }
        } else this.rest(e, Math.round(50 / fast));
        return;
      }

      case "drones": {
        e.timer++;
        if (e.timer === 20) {
          const alive = world.entities.filter((o) => o.minion && !o.dead).length;
          if (alive < 2) {
            const d = world.spawn("avDrone", cx - 14, cy + 20, { range: 3, sight: 12 });
            if (d) { d.transient = true; d.minion = true; d.alwaysActive = true; }
            world.particles.burst(cx, cy + 20, 14, e.color, 3);
          }
        }
        if (e.timer > 50) this.rest(e, 40);
        return;
      }

      case "purge": {
        e.timer++;
        if (e.timer === 10) {
          // Gap heights match the floor and the two platform levels.
          const plats = (e.opts.purgeGaps || [0, 4, 7]).map((rowsUp) => e.floorY - rowsUp * TILE);
          const gapBot = plats[Math.floor(Math.random() * plats.length)];
          const fromLeft = U.cx(p) > e.arena.x + e.arena.w / 2;
          const w = world.spawn("purgeWave", fromLeft ? e.arena.x + TILE : e.arena.x + e.arena.w - TILE - 20, e.arena.y, {});
          if (w) {
            w.h = e.floorY - e.arena.y; w.dir = fromLeft ? 1 : -1;
            w.gapBot = gapBot; w.gapTop = gapBot - 2.6 * TILE;
            w.speed = 2.4 * fast; w.xmin = e.arena.x; w.xmax = e.arena.x + e.arena.w;
            w.color = e.color;
          }
        }
        if (e.timer > 110) this.rest(e, Math.round(40 / fast));
        return;
      }

      case "storm": {
        e.timer++;
        if (e.timer === 10) {
          const xs = [U.cx(p)];
          while (xs.length < 6) {
            const x = e.arena.x + 2 * TILE + Math.random() * (e.arena.w - 4 * TILE);
            if (xs.every((o) => Math.abs(o - x) > 70)) xs.push(x);
          }
          xs.forEach((x, i) => {
            const d = world.spawn("glitchDrop", x - 14, e.arena.y + TILE, {});
            if (d) { d.floorY = e.floorY; d.warn = 50 + i * 8; }
          });
        }
        if (e.timer > 100) this.rest(e, 30);
        return;
      }

      case "compile": {
        e.timer++;
        const sit = e.floorY - e.h - 6;
        const openFor = [230, 200, 170][e.phase - 1];
        if (e.timer < 40) {
          e.x += (e.arena.x + e.arena.w / 2 - e.w / 2 - e.x) * 0.08;
          e.y += (sit - e.y) * 0.1;
        } else if (e.timer < 40 + openFor) {
          e.open = true;
          e.y = sit + Math.sin(e.timer * 0.1) * 2;
          if (e.timer % 10 === 0) world.particles.emit(cx + U.rand(-30, 30), e.y, { vy: -1.5, life: 30, size: 3, color: e.color });
        } else {
          e.open = false;
          e.y += (e.hoverY - e.y) * 0.06;
          if (Math.abs(e.y - e.hoverY) < 4) { e.anchor = 1; this.rest(e, 30); }
        }
        return;
      }

      case "dying":
        e.timer--;
        e.x += U.rand(-2, 2);
        if (e.timer % 6 === 0) {
          world.particles.burst(e.x + Math.random() * e.w, e.y + Math.random() * e.h, 16, U.pick(DAEMON_COLORS.concat("#ffffff")), 6, { glow: true });
          world.camera.shake(8);
        }
        if (e.timer <= 0) world.killEntity(e);
        return;
    }
  },

  onDamage(e, world) {
    if (!e.open || e.iframes > 0 || e.mode === "dying" || e.mode === "sleep") return false;
    if (e.frozenLock) e.lockHits = (e.lockHits || 0) + 1;
    e.hp -= 1;
    e.flash = 10;
    e.iframes = 22;
    world.camera.shake(8);
    sfx.play("bossHit");
    world.particles.burst(U.cx(e), U.cy(e), 24, "#ffffff", 6);
    if (e.hp <= 0) {
      e.mode = "dying"; e.timer = 150; e.open = true;
      for (const o of world.entities) if (o.name === "bullet" || o.name === "purgeWave" || o.name === "glitchDrop" || o.minion) o.dead = true;
      world.banner = { text: "PROCESS KILLED", sub: "", t: 140, max: 140, color: "#39ff88" };
      return true;
    }
    const ph = this.phaseOf(e);
    if (ph !== e.phase) {
      e.phase = ph;
      e.step = 0; e.timer = 999; e.open = false; e.frozenLock = false; // rise and start the new phase
      e.color = DAEMON_COLORS[ph - 1];
      for (const o of world.entities) if (o.name === "bullet") o.dead = true;
      this.dropHealth(e, world);
      e.healT = 0;
      world.banner = { text: ph === 2 ? "FORK" : "KERNEL PANIC", sub: "", t: 90, max: 90, color: e.color };
    }
    return true;
  },

  onDeath(e, world) {
    world.endBoss(e);
    world.particles.burst(U.cx(e), U.cy(e), 120, "#39ff88", 10, { glow: true });
    world.particles.ring(U.cx(e), U.cy(e), "#ffffff", 150, 50);
    for (const o of world.entities) if (o.minion) world.killEntity(o);
  },

  draw(e, ctx, world) {
    const cx = U.cx(e), cy = U.cy(e);
    const col = e.flash ? "#ffffff" : e.color;
    if (e.mode === "sleep") {
      ctx.strokeStyle = U.rgba("#39ff88", 0.25 + 0.15 * Math.sin(world.time * 0.04));
      ctx.lineWidth = 2;
      U.roundRect(ctx, e.x, e.y, e.w, e.h, 6); ctx.stroke();
      ctx.fillStyle = U.rgba("#39ff88", 0.4);
      if (world.time % 60 < 30) ctx.fillRect(e.x + 12, e.y + 30, 10, 3); // blinking cursor
      return;
    }
    ctx.globalAlpha = e.alpha;
    U.glow(ctx, cx, cy, 100, col, 0.3);
    // Orbiting permission blocks.
    for (let i = 0; i < 4; i++) {
      const a = e.spin + (i * Math.PI) / 2;
      const r = e.open ? 70 : 58;
      ctx.save(); ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8); ctx.rotate(a);
      ctx.fillStyle = "#04120a"; ctx.fillRect(-7, -7, 14, 14);
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(-7, -7, 14, 14);
      ctx.restore();
    }
    // Window: two halves that slide apart while compiling.
    const split = e.open ? 14 : 0;
    const glitchRow = (world.time % 47 < 4 || e.mode === "teleport") ? U.rand(-6, 6) : 0;
    for (const side of [-1, 1]) {
      const hx = side < 0 ? e.x - split : cx + split;
      ctx.fillStyle = "#020a05";
      ctx.fillRect(hx, e.y, e.w / 2, e.h);
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.strokeRect(hx + 1, e.y + 1, e.w / 2 - 2, e.h - 2);
      ctx.fillStyle = U.rgba(col, 0.85);
      ctx.fillRect(hx + 1, e.y + 1, e.w / 2 - 2, 10); // title bar
      ctx.fillStyle = U.rgba(col, 0.35);
      for (let i = 0; i < 4; i++) ctx.fillRect(hx + 6 + (i % 2) * 6 + (i === 1 ? glitchRow : 0), e.y + 20 + i * 11, 18 - i * 3, 3); // code lines
    }
    ctx.fillStyle = "#020a05";
    for (let i = 0; i < 3; i++) ctx.fillRect(e.x - split + 5 + i * 6, e.y + 4, 3, 3); // title-bar buttons
    // Crystal core.
    const s = e.open ? 16 : 11;
    ctx.fillStyle = e.open ? "#eafff2" : col;
    ctx.beginPath(); ctx.moveTo(cx, cy - s * 1.4); ctx.lineTo(cx + s, cy + 4); ctx.lineTo(cx, cy + s * 1.4 + 4); ctx.lineTo(cx - s, cy + 4); ctx.closePath(); ctx.fill();
    U.glow(ctx, cx, cy + 4, s * 4, col, 0.9);
    // Phase pips under the window.
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < 4 - e.phase ? col : "#15301f";
      ctx.fillRect(cx - 16 + i * 12, e.y + e.h + 8, 8, 4);
    }
    ctx.globalAlpha = 1;
  },
});

// Sweeping firewall column with one safe gap. Freeze Process holds it still.
registerEntity("purgeWave", {
  size: [20, 32],
  layer: 2,
  props: { transient: true, alwaysActive: true, alwaysDraw: true, freezable: true, color: "#39ff88" },
  init(e) { e.dir = 1; e.speed = 2.4; e.warn = 40; },
  update(e) {
    if (e.t <= e.warn) return;
    e.x += e.dir * e.speed;
    if (e.x < e.xmin - 30 || e.x > e.xmax + 10) e.dead = true;
  },
  onTouch(e, world, p) {
    if (e.t <= e.warn) return;
    const inGap = p.y >= e.gapTop && p.y + p.h <= e.gapBot;
    if (!inGap) world.hurtPlayer(1, e);
  },
  draw(e, ctx, world) {
    const warn = e.t <= e.warn;
    ctx.globalAlpha = warn ? (world.time % 8 < 4 ? 0.5 : 0.2) : 1;
    for (const [y0, y1] of [[e.y, e.gapTop], [e.gapBot, e.y + e.h]]) {
      if (y1 <= y0) continue;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = U.rgba(e.color, 0.35);
      ctx.fillRect(e.x - 4, y0, e.w + 8, y1 - y0);
      ctx.fillStyle = U.rgba("#eafff2", 0.9);
      ctx.fillRect(e.x + e.w / 2 - 2, y0, 4, y1 - y0);
      ctx.globalCompositeOperation = "source-over";
    }
    // Gap brackets.
    ctx.strokeStyle = e.color; ctx.lineWidth = 2;
    ctx.strokeRect(e.x - 8, e.gapTop, e.w + 16, e.gapBot - e.gapTop);
    ctx.globalAlpha = 1;
  },
});

// Corrupted block that falls from the arena ceiling after a marker warning.
registerEntity("glitchDrop", {
  size: [28, 28],
  layer: 2,
  props: { transient: true, alwaysActive: true, alwaysDraw: true, freezable: true },
  init(e) { e.warn = 50; e.vy = 0; },
  update(e, world) {
    if (e.t <= e.warn) return;
    e.vy = Math.min(10, e.vy + 0.8);
    e.y += e.vy;
    if (e.y + e.h >= e.floorY) {
      e.dead = true;
      world.particles.burst(U.cx(e), e.floorY - 4, 14, "#39ff88", 4);
      if (world.onScreen(e)) sfx.play("glitch");
    }
  },
  onTouch(e, world) { if (e.t > e.warn) world.hurtPlayer(1, e); },
  draw(e, ctx, world) {
    if (e.t <= e.warn) {
      // Target marker on the floor.
      ctx.fillStyle = U.rgba("#ff3df0", world.time % 8 < 4 ? 0.6 : 0.25);
      ctx.fillRect(e.x, e.floorY - 4, e.w, 4);
      ctx.fillRect(e.x + e.w / 2 - 1, e.y + e.h, 2, e.floorY - e.y - e.h);
      return;
    }
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? "#0c2a16" : "#174a26";
      ctx.fillRect(e.x + U.rand(-2, 2), e.y + i * 7, e.w, 7);
    }
    ctx.strokeStyle = "#ff3df0"; ctx.lineWidth = 2; ctx.strokeRect(e.x, e.y, e.w, e.h);
  },
});

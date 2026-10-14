/* =========================================================================
 * entities/boss_warden.js — CORE WARDEN (mini-boss, level 3; Mk-II in level 5)
 *
 * Attack cycle:  HOP (×3, shockwaves on landing) → SPREAD SHOT → CHARGE
 * Tactic: its armoured top can't be hurt. Bait the CHARGE into a wall —
 * it overheats (stunned, top hatch opens) and THEN it can be stomped,
 * shot or dashed. Jump over shockwaves. Below half health it gets faster.
 *
 * overrides: hp, speedMul, title, arena: [col, row, cols, rows] (camera lock)
 * ========================================================================= */
"use strict";

registerEntity("warden", {
  size: [76, 60],
  props: {
    enemy: true, hurts: true, isBoss: true, alwaysActive: true, alwaysDraw: true,
    hp: 6, speedMul: 1, title: "CORE WARDEN", color: "#ff9d00",
    stompable: (e) => (e.mode === "stun" ? true : "bounce"),
    shootable: (e) => e.mode === "stun",
    dashable: (e) => e.mode === "stun",
  },
  init(e, world) {
    const a = e.opts.arena || [e.col - 20, e.row - 14, 30, 17];
    e.arena = { x: a[0] * TILE, y: a[1] * TILE, w: a[2] * TILE, h: a[3] * TILE };
    this.onRespawn(e, world);
  },
  onRespawn(e) {
    e.x = e.home.x; e.y = e.home.y;
    e.vx = 0; e.vy = 0;
    e.hp = e.maxHp;
    e.mode = "sleep"; e.timer = 0;
    e.step = 0; e.dir = -1;
    e.onGround = true;
    e.enraged = false;
  },

  pattern(e) {
    return e.enraged ? ["hop", "charge", "spread", "charge"] : ["hop", "spread", "charge"];
  },
  next(e) {
    const pat = this.pattern(e);
    e.mode = pat[e.step % pat.length];
    e.step++;
    e.timer = 0;
    e.hops = 3;
    e.volleys = e.enraged ? 2 : 1;
  },

  update(e, world) {
    const p = world.player;
    const mul = e.speedMul * (e.enraged ? 1.3 : 1);
    const toward = U.sign(U.cx(p) - U.cx(e)) || e.dir;
    e.hurts = e.mode !== "stun" && e.mode !== "sleep";

    // Gravity + movement for every mode except sleep.
    const physics = () => {
      e.vy = Math.min(14, e.vy + 0.7);
      const wasGround = e.onGround;
      const res = Physics.move(world, e, e.vx, e.vy, { oneway: false }); // too heavy for thin platforms
      if (res.hitY) e.vy = 0;
      e.onGround = res.onGround;
      return { res, landed: res.onGround && !wasGround };
    };

    switch (e.mode) {
      case "sleep": {
        const inside = U.overlap(p, e.arena) && p.x > e.arena.x + 5 * TILE;
        if (inside && p.alive) {
          e.mode = "intro"; e.timer = 90;
          world.startBoss(e, e.arena);
        }
        return;
      }
      case "intro":
        if (e.timer % 10 === 0) world.particles.burst(U.cx(e), e.y + e.h, 6, e.color, 3);
        physics();
        if (--e.timer <= 0) { e.mode = "rest"; e.timer = 30; }
        return;
      case "rest":
        e.vx = U.approach(e.vx, 0, 0.5);
        physics();
        if (--e.timer <= 0) this.next(e);
        return;

      case "hop": {
        e.vx = U.approach(e.vx, e.onGround ? 0 : e.vx, 0.3);
        const { landed } = physics();
        if (landed) {
          for (const d of [-1, 1]) {
            const s = world.spawn("shockwave", d > 0 ? e.x + e.w : e.x - 18, e.y + e.h - 20, {});
            if (s) { s.dir = d; s.speed = 4.2 * mul; }
          }
          world.camera.shake(8);
          sfx.play("slam");
          world.particles.dust(U.cx(e), e.y + e.h, "#ffb400", 16);
          e.timer = Math.round(26 / mul);
        }
        if (e.onGround) {
          if (e.timer > 0) e.timer--;
          else if (e.hops > 0) {
            e.hops--;
            e.vy = -12.5;
            e.vx = U.clamp((U.cx(p) - U.cx(e)) / 42, -5, 5) * mul;
            e.dir = toward;
            e.onGround = false;
          } else { e.mode = "rest"; e.timer = 30; }
        }
        return;
      }

      case "spread": {
        e.vx = 0;
        physics();
        e.timer++;
        e.dir = toward;
        if (e.timer === 40 || (e.volleys > 1 && e.timer === 70)) {
          const n = e.enraged ? 7 : 5;
          const mx = U.cx(e), my = e.y + 14;
          const base = Math.atan2(U.cy(p) - my, U.cx(p) - mx);
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.22;
            const b = world.spawn("bullet", mx - 5, my - 5, {});
            if (b) { b.vx = Math.cos(a) * 4 * mul; b.vy = Math.sin(a) * 4 * mul; b.color = "#ffb400"; }
          }
          world.particles.burst(mx, my, 12, "#ffb400", 3);
          sfx.play("fire");
          world.camera.shake(3);
        }
        if (e.timer > (e.volleys > 1 ? 100 : 70)) { e.mode = "rest"; e.timer = 20; }
        return;
      }

      case "charge": {
        e.timer++;
        if (e.timer < 50) {
          // Telegraph: face the player and rev.
          e.dir = toward; e.vx = 0;
          physics();
          if (e.timer % 4 === 0) world.particles.dust(U.cx(e) - e.dir * 34, e.y + e.h, "#ff3355", 3, -e.dir * 3);
          return;
        }
        e.vx = e.dir * 8 * mul;
        const { res } = physics();
        if (world.time % 2 === 0)
          world.particles.emit(U.cx(e) - e.dir * 38, U.cy(e) + U.rand(-15, 15), { vx: -e.dir * 3, life: 14, size: 4, color: "#ff6a2a", shape: "square" });
        if (res.hitX || e.timer > 240) {
          e.mode = "stun"; e.timer = 160; e.vx = -e.dir * 3; e.vy = -5;
          world.camera.shake(12);
          sfx.play("slam");
          world.particles.burst(e.dir > 0 ? e.x + e.w : e.x, U.cy(e), 30, "#ffe14d", 6, { glow: true });
          world.showHint("OVERHEATED! STRIKE THE CORE!", 2);
        }
        return;
      }

      case "stun":
        e.vx = U.approach(e.vx, 0, 0.2);
        physics();
        if (world.time % 6 === 0) world.particles.emit(U.cx(e) + U.rand(-20, 20), e.y, { vy: -1.5, life: 24, size: 3, color: "#ffe14d" });
        if (--e.timer <= 0) { e.mode = "rest"; e.timer = 20; }
        return;
    }
  },

  onDamage(e, world, amount, source) {
    if (e.mode !== "stun" || e.iframes > 0) return false;
    e.hp -= 1;
    e.flash = 10;
    e.iframes = 30;
    world.camera.shake(7);
    sfx.play("bossHit");
    world.particles.burst(U.cx(e), e.y + 10, 20, "#ffffff", 5);
    if (e.hp <= 0) { world.killEntity(e); return true; }
    if (!e.enraged && e.hp <= e.maxHp / 2) {
      e.enraged = true;
      e.timer = Math.min(e.timer, 40);
      world.banner = { text: "WARDEN OVERCLOCKED", sub: "", t: 90, max: 90, color: "#ff3355" };
    }
    return true;
  },

  onDeath(e, world) {
    world.endBoss(e);
    for (let i = 0; i < 6; i++)
      world.particles.burst(e.x + Math.random() * e.w, e.y + Math.random() * e.h, 20, U.pick(["#ff9d00", "#ffe14d", "#ffffff"]), 7, { glow: true });
    // Clear stray projectiles.
    for (const o of world.entities) if (o.name === "bullet" || o.name === "shockwave") o.dead = true;
    // A reward.
    world.spawn("powerup", U.cx(e) - 11, e.y, {}, "health");
  },

  draw(e, ctx, world) {
    const stun = e.mode === "stun";
    const col = e.flash ? "#ffffff" : stun ? "#ffe14d" : e.enraged ? "#ff3355" : e.color;
    const x = e.x + (e.mode === "charge" && e.timer < 50 ? U.rand(-2, 2) : 0), y = e.y;
    if (e.mode === "sleep") {
      // Dormant: dark shell with a slow pulse.
      ctx.fillStyle = "#1e1a24";
      U.roundRect(ctx, x, y + 8, e.w, e.h - 8, 8); ctx.fill();
      ctx.strokeStyle = U.rgba(e.color, 0.3 + 0.2 * Math.sin(world.time * 0.05)); ctx.lineWidth = 2; ctx.stroke();
      return;
    }
    U.glow(ctx, U.cx(e), U.cy(e), 70, col, 0.25);
    // Treads.
    ctx.fillStyle = "#14141f";
    U.roundRect(ctx, x - 2, y + e.h - 14, e.w + 4, 14, 6); ctx.fill();
    ctx.fillStyle = "#3a3a4a";
    for (let i = 0; i < 6; i++) ctx.fillRect(x + 4 + ((i * 14 + (e.vx ? world.time * 2 : 0)) % (e.w - 4)), y + e.h - 10, 6, 6);
    // Body.
    ctx.fillStyle = "#2a1c10";
    U.roundRect(ctx, x, y + 8, e.w, e.h - 20, 8); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
    // Armour plates / open hatch.
    if (stun) {
      ctx.fillStyle = "#ffe14d";
      U.glow(ctx, U.cx(e), y + 10, 40, "#ffe14d", 0.8 + Math.sin(world.time * 0.4) * 0.2);
      ctx.fillRect(x + 22, y + 4, e.w - 44, 8);
      ctx.fillStyle = "#4a3a10";
      ctx.fillRect(x + 4, y - 2, 16, 6);
      ctx.fillRect(x + e.w - 20, y - 2, 16, 6);
    } else {
      ctx.fillStyle = "#4a3420";
      ctx.fillRect(x + 6, y + 2, e.w - 12, 8);
      ctx.fillStyle = col;
      for (let i = 0; i < 4; i++) ctx.fillRect(x + 12 + i * 15, y + 4, 8, 3);
    }
    // Visor bar — a single horizontal light that tracks facing.
    const vx = U.cx(e) + e.dir * 10;
    ctx.fillStyle = "#120c06";
    ctx.fillRect(x + 10, y + 22, e.w - 20, 10);
    ctx.fillStyle = col;
    ctx.fillRect(vx - 12, y + 24, 24, 6);
    U.glow(ctx, vx, y + 27, 22, col, 0.8);
  },
});

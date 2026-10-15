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
  info: { name: "Core Warden", desc: "Bait its charge into a wall, then hit it while it's stunned." },
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
    Save.markSeen("warden");
    world.camera.shake(7);
    sfx.play("bossHit");
    world.particles.burst(U.cx(e), e.y + 10, 20, "#ffffff", 5);
    if (e.hp <= 0) { world.killEntity(e); return true; }
    if (!e.enraged && e.hp <= e.maxHp / 2) {
      e.enraged = true;
      e.timer = Math.min(e.timer, 40);
      world.banner = { text: "OVERCLOCKED", sub: "", t: 90, max: 90, color: "#ff3355" };
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
    const t = world.time, stun = e.mode === "stun";
    const col = e.flash ? "#ffffff" : stun ? "#ffe14d" : e.enraged ? "#ff3355" : e.color;
    const rev = e.mode === "charge" && e.timer < 50, charging = e.mode === "charge" && e.timer >= 50;
    const x = e.x + (rev ? U.rand(-2, 2) : 0), y = e.y, d = e.dir || 1, cx = x + e.w / 2;
    Look.shadow(ctx, U.cx(e), e.y + e.h, e.w + 16, 0.45);
    if (e.mode === "sleep") {
      // Dormant: dark shell, plates closed, a slow pulse behind the visor.
      U.roundRect(ctx, x, y + 8, e.w, e.h - 8, 8); Look.fill(ctx, y + 8, e.h - 8, "#1e1a24", 0.1, 0.3);
      ctx.strokeStyle = U.rgba(e.color, 0.3 + 0.2 * Math.sin(t * 0.05)); ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#0c0a10"; ctx.fillRect(x + 10, y + 22, e.w - 20, 10);
      ctx.fillStyle = U.rgba(e.color, 0.25 + 0.2 * Math.sin(t * 0.05)); ctx.fillRect(cx - 10, y + 25, 20, 4);
      return;
    }
    U.glow(ctx, U.cx(e), U.cy(e), 80, col, 0.25);
    // Treads with moving links and road wheels.
    U.roundRect(ctx, x - 3, y + e.h - 15, e.w + 6, 15, 7); Look.fill(ctx, y + e.h - 15, 15, "#1a1a26", 0.15, 0.35);
    ctx.fillStyle = "#4a4a5e";
    const sp = (e.vx ? t * 2 * U.sign(e.vx) : 0);
    for (let i = 0; i < 8; i++) ctx.fillRect(x + 2 + (((i * 11 + sp) % (e.w + 2)) + e.w + 2) % (e.w + 2), y + e.h - 14, 5, 3);
    for (let i = 0; i < 5; i++) { const wx = x + 8 + i * ((e.w - 16) / 4); ctx.fillStyle = "#2a2a3a"; ctx.beginPath(); ctx.arc(wx, y + e.h - 7, 4.5, 0, 6.28); ctx.fill(); ctx.fillStyle = "#6a6a80"; ctx.beginPath(); ctx.arc(wx, y + e.h - 7, 1.5, 0, 6.28); ctx.fill(); }
    // Hull: bevelled armour with seams and rivets.
    U.roundRect(ctx, x, y + 8, e.w, e.h - 20, 8); Look.fill(ctx, y + 8, e.h - 20, "#3a2614", 0.2, 0.4);
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(x + 6, y + 36, e.w - 12, 2);
    for (let i = 0; i < 5; i++) Look.bolt(ctx, x + 10 + i * ((e.w - 20) / 4), y + 41, 1.6);
    // Front ram (glows hot while charging).
    const rx = d > 0 ? x + e.w - 2 : x + 2;
    ctx.fillStyle = charging ? "#ffb070" : "#8a8070";
    ctx.beginPath(); ctx.moveTo(rx, y + 16); ctx.lineTo(rx + d * 9, y + 26); ctx.lineTo(rx + d * 9, y + 38); ctx.lineTo(rx, y + 46); ctx.closePath(); ctx.fill();
    if (charging) U.glow(ctx, rx + d * 6, y + 32, 26, "#ff6a2a", 0.8);
    // Twin side cannons (glow up before a spread volley).
    const spreading = e.mode === "spread";
    const sk = spreading ? U.clamp(((e.timer % 30) - 10) / 20, 0, 1) : 0;
    for (const sx of [x + 8, x + e.w - 8]) {
      ctx.fillStyle = "#2a1a10"; ctx.fillRect(sx - 4, y + 10, 8, 10);
      ctx.fillStyle = spreading ? U.mix("#ffb400", "#ffffff", sk) : "#6a4a20"; ctx.fillRect(sx - 3, y + 6, 6, 5);
      if (spreading && sk > 0) Look.telegraph(ctx, sx, y + 7, 5, "#ffb400", sk);
    }
    // Armour plates on top, or the open hatch with an exposed core when stunned.
    if (stun) {
      ctx.fillStyle = "#4a3a10"; ctx.fillRect(x + 2, y - 3, 18, 7); ctx.fillRect(x + e.w - 20, y - 3, 18, 7);
      const g = ctx.createRadialGradient(cx, y + 9, 2, cx, y + 9, 20);
      g.addColorStop(0, "#ffffff"); g.addColorStop(0.4, "#ffe14d"); g.addColorStop(1, "rgba(255,180,0,0)");
      ctx.fillStyle = g; ctx.fillRect(x + 18, y - 6, e.w - 36, 26);
      U.glow(ctx, cx, y + 8, 44, "#ffe14d", 0.8 + Math.sin(t * 0.4) * 0.2);
      if (t % 5 === 0 && Game.state === "play") world.particles.emit(cx + U.rand(-16, 16), y + 4, { vy: -1.2, vx: U.rand(-0.5, 0.5), life: 26, size: 4, grow: 0.15, color: "#5a5048", shape: "smoke", alpha: 0.45 });
    } else {
      ctx.beginPath(); ctx.rect(x + 6, y + 1, e.w - 12, 9); Look.fill(ctx, y + 1, 9, "#5a4026", 0.3, 0.3);
      for (let i = 0; i < 4; i++) { ctx.fillStyle = col; ctx.fillRect(x + 12 + i * 15, y + 4, 8, 3); }
    }
    // Exhaust stacks: smoke, or flames while revving.
    const ex = d > 0 ? x + 6 : x + e.w - 10;
    ctx.fillStyle = "#3a3a4a"; ctx.fillRect(ex, y - 6, 5, 10);
    if (rev) Look.thruster(ctx, ex + 2.5, y - 6, -d * 0.3, -1, 14, "#ff6a2a", t);
    else if (t % 18 === 0 && Game.state === "play") world.particles.emit(ex + 2.5, y - 7, { vy: -0.8, life: 30, size: 3, grow: 0.15, color: "#4a4450", shape: "smoke", alpha: 0.4 });
    // Visor bar: a single light that tracks facing (no face).
    const vx = cx + d * 10;
    ctx.fillStyle = "#120c06"; U.roundRect(ctx, x + 10, y + 21, e.w - 20, 12, 4); ctx.fill();
    ctx.fillStyle = col; ctx.fillRect(vx - 12, y + 24, 24, 6);
    ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.fillRect(vx - 12 + ((t * 0.6) % 22), y + 24, 2, 6);
    U.glow(ctx, vx, y + 27, 24, col, 0.85);
    if (rev) Look.warn(ctx, cx, y - 20, "#ff3355", t);
    if (e.mode === "hop" && e.onGround && e.timer > 0) {
      // Crouch before the next hop: coils glow.
      for (const sx of [x + 14, x + e.w - 14]) U.glow(ctx, sx, y + e.h - 16, 14, "#ffb400", 0.5);
    }
  },
});

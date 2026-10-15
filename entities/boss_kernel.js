/* =========================================================================
 * entities/boss_kernel.js — THE KERNEL (final boss, level 10)
 *
 * A spinning crystal core guarded by orbiting shield nodes.
 *   Destroy every node (shoot, stomp or dash them) → the core drops to the
 *   floor and opens → hit it. Four hits ends a phase; if the window runs
 *   out first, the nodes come back.
 *   Phase 1: spiral bullet streams           (3 nodes)
 *   Phase 2: + two rotating laser arms        (4 nodes)
 *   Phase 3: + three faster arms, floor slams (5 nodes, 2 hp each)
 *
 * overrides: hp (multiple of 3 recommended), title, arena: [col, row, cols, rows]
 * ========================================================================= */
"use strict";

registerEntity("kernel", {
  size: [80, 80],
  anchor: "center",
  props: {
    enemy: true, hurts: true, isBoss: true, alwaysActive: true, alwaysDraw: true,
    hp: 12, title: "THE KERNEL", color: "#7d5cff",
    stompable: (e) => (e.mode === "open" ? true : "bounce"),
    shootable: (e) => e.mode === "open",
    dashable: (e) => e.mode === "open",
  },
  init(e, world) {
    const a = e.opts.arena || [e.col - 15, e.row - 4, 30, 17];
    e.arena = { x: a[0] * TILE, y: a[1] * TILE, w: a[2] * TILE, h: a[3] * TILE };
    let r = e.row + 1;
    while (r < world.h && !Physics.solidAt(world, e.col, r)) r++;
    e.floorY = r * TILE;
    e.hoverY = e.floorY - 6 * TILE - e.h / 2;
    this.onRespawn(e, world);
  },
  onRespawn(e) {
    e.x = e.home.x; e.y = e.home.y;
    e.hp = e.maxHp;
    e.mode = "sleep"; e.timer = 0; e.phase = 1;
    e.nodes = []; e.arms = []; e.armAngle = 0; e.spin = 0; e.spiral = 0;
    e.hitsThisPhase = 0;
  },
  perPhase(e) { return Math.ceil(e.maxHp / 3); },
  phaseOf(e) {
    const q = this.perPhase(e);
    return e.hp > q * 2 ? 1 : e.hp > q ? 2 : 3;
  },

  spawnNodes(e, world) {
    const n = [3, 4, 5][e.phase - 1];
    e.nodes = [];
    for (let i = 0; i < n; i++) {
      const node = world.spawn("kernelNode", U.cx(e), U.cy(e), { hp: e.phase === 3 ? 2 : 1 });
      if (!node) continue;
      node.transient = true; node.alwaysActive = true;
      node.slot = i; node.slots = n;
      e.nodes.push(node);
    }
    world.particles.ring(U.cx(e), U.cy(e), "#3df5ff", 160, 30);
  },

  shoot(world, x, y, a, speed, color) {
    const b = world.spawn("bullet", x - 5, y - 5, {});
    if (b) { b.vx = Math.cos(a) * speed; b.vy = Math.sin(a) * speed; b.color = color; }
    sfx.play("fire");
  },

  update(e, world) {
    const p = world.player;
    const cx = U.cx(e), cy = U.cy(e);
    e.spin += e.mode === "open" ? 0.01 : 0.04 + e.phase * 0.01;
    e.hurts = !(e.mode === "sleep" || e.mode === "open" || e.mode === "dying");

    // Orbiting nodes follow the core.
    e.nodes = e.nodes.filter((n) => !n.dead);
    e.nodes.forEach((n, i) => {
      const a = e.spin * 0.6 + (i / Math.max(1, e.nodes.length)) * Math.PI * 2;
      n.x = cx + Math.cos(a) * 150 - n.w / 2;
      n.y = cy + Math.sin(a) * 150 - n.h / 2;
    });

    // Rotating laser arms (phase 2+, only while shielded).
    e.arms = [];
    if (e.phase >= 2 && (e.mode === "shield" || e.mode === "slam")) {
      const count = e.phase === 3 ? 3 : 2;
      e.armAngle += e.phase === 3 ? 0.016 : 0.011;
      const hot = e.armWarm >= 60;
      e.armWarm = (e.armWarm || 0) + 1;
      for (let i = 0; i < count; i++) e.arms.push({ a: e.armAngle + (i / count) * Math.PI * 2, hot });
      if (hot && p.alive) {
        const px = U.cx(p), py = U.cy(p), L = 280;
        for (const arm of e.arms) {
          const dx = Math.cos(arm.a), dy = Math.sin(arm.a);
          const t = U.clamp((px - cx) * dx + (py - cy) * dy, 0, L);
          const d = Math.hypot(cx + dx * t - px, cy + dy * t - py);
          if (d < 14) { world.hurtPlayer(1, e); break; }
        }
      }
    } else e.armWarm = 0;

    switch (e.mode) {
      case "sleep":
        if (p.alive && U.overlap(p, e.arena) && p.x > e.arena.x + 5 * TILE) {
          e.mode = "intro"; e.timer = 100;
          world.startBoss(e, e.arena);
        }
        return;
      case "intro":
        if (e.timer % 10 === 0) world.particles.ring(cx, cy, e.color, 40 + (100 - e.timer), 20);
        if (--e.timer <= 0) { this.spawnNodes(e, world); e.mode = "shield"; e.timer = 0; }
        return;

      case "shield": {
        e.timer++;
        // Drift side to side above the arena.
        const tx = e.arena.x + e.arena.w / 2 - e.w / 2 + Math.sin(world.time * 0.01) * 5 * TILE;
        e.x += (tx - e.x) * 0.03;
        e.y += (e.hoverY - e.y) * 0.05;
        // Spiral stream.
        const every = [13, 11, 9][e.phase - 1];
        if (e.timer % every === 0 && e.timer % 240 < 170) {
          e.spiral += 0.32;
          const sp = 2.4 + e.phase * 0.2;
          this.shoot(world, cx, cy, e.spiral, sp, "#b78cff");
          this.shoot(world, cx, cy, e.spiral + Math.PI, sp, "#b78cff");
        }
        // Aimed triple shot between spirals.
        if (e.timer % 240 === 200) {
          const a = Math.atan2(U.cy(p) - cy, U.cx(p) - cx);
          for (const o of [-0.2, 0, 0.2]) this.shoot(world, cx, cy, a + o, 4, "#ff3df0");
        }
        // Phase 3: periodic slam.
        if (e.phase === 3 && e.timer % 300 === 150) { e.mode = "slam"; e.slamT = 0; }
        if (e.nodes.length === 0) {
          e.mode = "open"; e.timer = 0;
          world.camera.shake(8);
          for (const o of world.entities) if (o.name === "bullet") o.dead = true;
        }
        return;
      }

      case "slam": {
        e.slamT++;
        const ground = e.floorY - e.h - 2;
        if (e.slamT < 30) { e.x += (U.cx(p) - cx) * 0.06; }        // line up
        else if (e.slamT < 50) { e.y = Math.min(ground, e.y + 14); } // drop
        if (e.slamT === 50) {
          world.camera.shake(12);
          sfx.play("slam");
          for (const d of [-1, 1]) {
            const s = world.spawn("shockwave", d > 0 ? e.x + e.w : e.x - 18, e.floorY - 20, {});
            if (s) { s.dir = d; s.speed = 5; }
          }
        }
        if (e.slamT > 70) { e.y += (e.hoverY - e.y) * 0.06; }
        if (e.slamT > 130) { e.mode = "shield"; }
        if (e.nodes.length === 0 && e.slamT > 70) { e.mode = "open"; e.timer = 0; }
        return;
      }

      case "open": {
        e.timer++;
        const sit = e.floorY - e.h - 6;
        e.y += (sit - e.y) * 0.1;
        if (e.timer % 10 === 0) world.particles.emit(cx + U.rand(-30, 30), e.y, { vy: -1.5, life: 30, size: 3, color: "#ffe14d" });
        const openFor = [260, 230, 200][e.phase - 1];
        if (e.timer > openFor) {
          // Window missed: shields regenerate.
          e.mode = "shield"; e.timer = 0; e.hitsThisPhase = 0;
          this.spawnNodes(e, world);
        }
        return;
      }

      case "dying":
        e.timer--;
        e.x += U.rand(-2, 2);
        if (e.timer % 6 === 0) {
          world.particles.burst(e.x + Math.random() * e.w, e.y + Math.random() * e.h, 16, U.pick(["#7d5cff", "#3df5ff", "#ffe14d", "#ffffff"]), 6, { glow: true });
          world.camera.shake(8);
        }
        if (e.timer <= 0) world.killEntity(e);
        return;
    }
  },

  onDamage(e, world, amount, source) {
    if (e.mode !== "open" || e.iframes > 0) return false;
    e.hp -= 1;
    e.flash = 10;
    e.iframes = 22;
    world.camera.shake(8);
    sfx.play("bossHit");
    world.particles.burst(U.cx(e), U.cy(e), 24, "#ffffff", 6);
    if (e.hp <= 0) {
      e.mode = "dying"; e.timer = 160; e.arms = [];
      for (const o of world.entities) if (o.name === "bullet" || o.name === "shockwave") o.dead = true;
      world.banner = { text: "MELTDOWN", sub: "", t: 140, max: 140, color: "#ffe14d" };
      return true;
    }
    const ph = this.phaseOf(e);
    if (ph !== e.phase) {
      e.phase = ph;
      e.mode = "shield"; e.timer = 0; e.armWarm = 0;
      this.spawnNodes(e, world);
      world.banner = { text: `PHASE ${ph}`, sub: "", t: 90, max: 90, color: e.color };
    }
    return true;
  },

  onDeath(e, world) {
    world.endBoss(e);
    world.particles.burst(U.cx(e), U.cy(e), 120, "#3df5ff", 10, { glow: true });
    world.particles.ring(U.cx(e), U.cy(e), "#ffffff", 160, 50);
    for (const n of e.nodes) n.dead = true;
  },

  draw(e, ctx, world) {
    const cx = U.cx(e), cy = U.cy(e);
    const open = e.mode === "open";
    const col = e.flash ? "#ffffff" : open ? "#ffe14d" : ["#7d5cff", "#ff3df0", "#ff3b3b"][e.phase - 1];
    if (e.mode === "sleep") {
      ctx.strokeStyle = U.rgba(e.color, 0.3 + 0.15 * Math.sin(world.time * 0.04));
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx, cy - 36); ctx.lineTo(cx + 28, cy); ctx.lineTo(cx, cy + 36); ctx.lineTo(cx - 28, cy); ctx.closePath(); ctx.stroke();
      return;
    }
    // Laser arms.
    for (const arm of e.arms) {
      const x2 = cx + Math.cos(arm.a) * 280, y2 = cy + Math.sin(arm.a) * 280;
      ctx.lineCap = "round";
      if (arm.hot) {
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = U.rgba("#ff2a6d", 0.4); ctx.lineWidth = 14;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = "#ffd0dd"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      } else {
        ctx.strokeStyle = U.rgba("#ff2a6d", world.time % 8 < 4 ? 0.35 : 0.15); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x2, y2); ctx.stroke();
      }
    }
    U.glow(ctx, cx, cy, 110, col, 0.35);
    // Outer rotating frame.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(e.spin);
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    const R = open ? 48 : 40;
    ctx.strokeRect(-R, -R, R * 2, R * 2);
    ctx.rotate(-e.spin * 2 + Math.PI / 4);
    ctx.strokeStyle = U.mix(col, "#000000", 0.35);
    ctx.strokeRect(-R * 0.8, -R * 0.8, R * 1.6, R * 1.6);
    ctx.restore();
    // Crystal core (diamond).
    const s = open ? 30 : 24;
    ctx.fillStyle = "#120a24";
    ctx.beginPath(); ctx.moveTo(cx, cy - s * 1.3); ctx.lineTo(cx + s, cy); ctx.lineTo(cx, cy + s * 1.3); ctx.lineTo(cx - s, cy); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = open ? "#fff6c0" : col;
    const k = 8 + Math.sin(world.time * (open ? 0.3 : 0.1)) * 3;
    ctx.beginPath(); ctx.moveTo(cx, cy - k * 1.3); ctx.lineTo(cx + k, cy); ctx.lineTo(cx, cy + k * 1.3); ctx.lineTo(cx - k, cy); ctx.closePath(); ctx.fill();
    U.glow(ctx, cx, cy, k * 4, col, 0.9);
    // Phase pips.
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < 4 - e.phase ? col : "#2a2240";
      ctx.fillRect(cx - 16 + i * 12, cy + 52, 8, 4);
    }
  },
});

// Orbiting shield node. Must all be destroyed before the Kernel opens.
registerEntity("kernelNode", {
  size: [26, 26],
  layer: 2,
  props: { enemy: true, hurts: true, stompable: true, shootable: true, dashable: true, hp: 1, color: "#3df5ff" },
  update() { /* positioned by the Kernel every frame */ },
  draw(e, ctx, world) {
    const cx = U.cx(e), cy = U.cy(e);
    const col = e.flash ? "#ffffff" : e.color;
    U.glow(ctx, cx, cy, 26, col, 0.6);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(world.time * 0.08 + (e.slot || 0));
    ctx.fillStyle = "#0c1a2a";
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(11, 7); ctx.lineTo(-11, 7); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    if (e.maxHp > 1 && e.hp > 1) {
      ctx.strokeStyle = U.rgba(col, 0.6); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, 16, 0, 6.28); ctx.stroke();
    }
  },
});

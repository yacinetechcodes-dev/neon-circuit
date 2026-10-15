/* =========================================================================
 * entities/linux.js — World 6 "Linux World": a terminal / command-line
 * world. Original generic shapes only (no logos or mascots): prompts,
 * directory trees, package crates, process-monitor bars.
 *
 *   zombieProcess   shambling process; "killed" it turns <defunct> and gets
 *                   back up — stomp the defunct body (or Kill Process) to reap it
 *   memoryLeak      blob that keeps growing (and speeding up); shots shrink it
 *   forkChild       tiny hopping process spawned by a fork bomb
 *   kernelPanicOrb  shielded orb; blows a panic ring, then its shield drops
 *   forkBomb        spawner: forks children that fork again; destroy it to end them
 *   permDoor        permission-locked door: only passable while Sudo is active
 *   loopPlatform    platform stuck in an infinite loop: travels a rectangle,
 *                   or ("wrap") slides along and snaps back to the start
 *   packageBox      a package crate — a plain solid block to stand on
 *
 * Also adds the World 6 abilities (Sudo, Pipe, Kill Process) to the upgrade
 * banner table, and their sounds.
 * ========================================================================= */
"use strict";

const TERM = {
  bg: "#141414", panel: "#1e1e1e", line: "#3a3a3a", text: "#d3d7cf", white: "#eeeeec",
  green: "#8ae234", amber: "#fcaf3e", red: "#ef2929", blue: "#729fcf", purple: "#ad7fa8", gray: "#888a85",
};

Object.assign(UPGRADE_INFO, {
  sudo: { name: "SUDO", hud: "SUDO", desc: "For 4 s, pass permission doors and ignore shields (10 s recharge).", how: "{sudo}", action: "sudo", label: "SUDO", world: 6 },
  pipe: { name: "PIPE", desc: "Mark two spots, then travel between them.", how: "{pipe} at two spots, {pipe} in one to travel", action: "pipe", label: "PIPE", world: 6 },
  killProcess: { name: "KILL PROCESS", hud: "KILL", desc: "Instantly remove the enemy under the red reticle (15 s recharge).", how: "{kill}", action: "kill", label: "KILL", world: 6 },
});

sfx.define("sudo", (s, t) => {
  s.tone(t, { type: "square", f0: 220, dur: 0.06, vol: 0.07 });
  s.tone(t, { type: "square", f0: 440, dur: 0.06, vol: 0.07, delay: 0.06 });
  s.tone(t, { type: "square", f0: 880, dur: 0.1, vol: 0.07, delay: 0.12 });
}, 0.1);
sfx.define("pipe", (s, t) => s.tone(t, { type: "triangle", f0: 300, f1: 1200, dur: 0.16, vol: 0.09 }), 0.08);
sfx.define("pipeSet", (s, t) => s.tone(t, { type: "triangle", f0: 700, dur: 0.06, vol: 0.07 }), 0.06);
sfx.define("kill", (s, t) => {
  s.tone(t, { type: "sawtooth", f0: 900, f1: 60, dur: 0.3, vol: 0.12 });
  s.noise(t, { filter: "highpass", f0: 1800, dur: 0.2, vol: 0.1 });
}, 0.1);
sfx.define("panic", (s, t) => s.tone(t, { type: "square", f0: 160, f1: 90, dur: 0.35, vol: 0.1 }), 0.2);
sfx.define("fork", (s, t) => s.tone(t, { type: "square", f0: 600, f1: 900, dur: 0.05, vol: 0.05 }), 0.05);

/** Little monospace label (used for tags like <defunct>). */
function termLabel(ctx, text, x, y, color, size = 9) {
  ctx.font = `bold ${size}px monospace`; ctx.textAlign = "center";
  ctx.fillStyle = color; ctx.fillText(text, x, y);
  ctx.textAlign = "left";
}

// ---------------------------------------------------------------- zombieProcess
registerEntity("zombieProcess", {
  info: { name: "Zombie Process", desc: "Gets back up after you 'kill' it: stomp the <defunct> body." },
  size: [24, 30],
  props: { enemy: true, hurts: true, stompable: true, shootable: true, dashable: true, hp: 2,
    speed: 0.8, revive: 240, color: TERM.gray },
  init(e) { e.dir = e.opts.dir === "right" ? 1 : -1; e.defunct = 0; },
  onDamage(e, world, amount, source) {
    if (e.iframes > 0) return false;
    if (e.defunct > 0) {
      if (source === "stomp") { world.killEntity(e); return true; } // reaped for good
      return false;
    }
    e.hp -= amount; e.flash = 8; e.iframes = 10;
    world.particles.burst(U.cx(e), U.cy(e), 8, TERM.gray, 3);
    if (e.hp <= 0) {
      e.defunct = e.revive; e.hurts = false; e.iframes = 16;
      sfx.play("hit");
    } else sfx.play("hit");
    return true;
  },
  update(e, world) {
    if (e.defunct > 0) {
      e.vy = Math.min(10, e.vy + 0.6);
      const res = Physics.move(world, e, 0, e.vy);
      if (res.hitY) e.vy = 0;
      if (--e.defunct <= 0) { e.hp = e.maxHp; e.hurts = true; world.particles.burst(U.cx(e), U.cy(e), 10, TERM.green, 3); }
      return;
    }
    walkStep(e, world, e.speed + (Math.sin(e.t * 0.08) > 0.6 ? 0.8 : 0));
  },
  draw(e, ctx, world) {
    const x = e.x, y = e.y, col = e.flash ? "#ffffff" : e.color, t = e.t;
    if (e.defunct > 0) {
      // Lying flat, greyed out, with a <defunct> tag; flickers and twitches before getting up.
      const blink = e.defunct < 60 && world.time % 8 < 4;
      const tw = e.defunct < 60 ? U.rand(-1, 1) : 0;
      Look.shadow(ctx, U.cx(e), y + 30, 34);
      ctx.beginPath(); ctx.rect(x - 4 + tw, y + 20, 32, 10); Look.fill(ctx, y + 20, 10, blink ? TERM.green : "#4a4a48", 0.2, 0.3);
      ctx.fillStyle = "#2a2a28"; ctx.fillRect(x - 2 + tw, y + 22, 8, 6);
      ctx.fillStyle = "rgba(0,0,0,0.3)"; for (let i = 0; i < 3; i++) ctx.fillRect(x + 10 + i * 5 + tw, y + 22, 3, 6);
      termLabel(ctx, "<defunct>", U.cx(e), y + 14, TERM.gray);
      if (world.time % 30 < 15) { ctx.fillStyle = U.rgba(TERM.gray, 0.6); ctx.fillRect(U.cx(e) + 22, y + 6, 4, 4); }
      return;
    }
    const lean = Math.sin(t * 0.1) * 2, d = e.dir;
    Look.shadow(ctx, U.cx(e), y + 30, 24);
    // Shuffling legs.
    const s = Math.sin(t * 0.15) * 2;
    ctx.fillStyle = "#3a3a38"; ctx.fillRect(x + 5 + s, y + 24, 5, 6); ctx.fillRect(x + 14 - s, y + 24, 5, 6);
    // A monitor-like body with a flickering prompt.
    ctx.beginPath(); ctx.rect(x + 2 + lean, y + 6, 20, 18); Look.fill(ctx, y + 6, 18, "#2e2e2c", 0.12, 0.3);
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(x + 2 + lean, y + 6, 20, 18);
    ctx.fillStyle = "#0e0e0e"; ctx.fillRect(x + 5 + lean, y + 9, 14, 9);
    ctx.fillStyle = U.rgba(TERM.green, 0.8);
    ctx.fillRect(x + 6 + lean, y + 10, 6, 1); if (Math.floor(world.time / 20) % 2) ctx.fillRect(x + 13 + lean, y + 10, 2, 2);
    ctx.fillRect(x + 6 + lean, y + 13, 9 - (Math.floor(world.time / 7) % 4), 1);
    // Arms out in front, swaying.
    const ay = y + 12 + Math.sin(t * 0.12) * 1.5;
    ctx.fillStyle = col; ctx.fillRect(d > 0 ? x + 18 + lean : x - 8 + lean, ay, 14, 4);
    ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(d > 0 ? x + 18 + lean : x - 8 + lean, ay, 14, 1);
    Look.core(ctx, U.cx(e) + d * 5 + lean, y + 21, 1.6, TERM.red, t);
    termLabel(ctx, "Z", U.cx(e) + lean, y + 3 - Math.abs(Math.sin(t * 0.05)) * 2, TERM.gray, 8);
  },
});

// ---------------------------------------------------------------- memoryLeak
registerEntity("memoryLeak", {
  info: { name: "Memory Leak", desc: "Keeps growing; shots shrink it." },
  size: [18, 18],
  props: { enemy: true, hurts: true, shootable: true, dashable: true, hp: 99, grow: 14, max: 56, color: TERM.purple,
    stompable: (e) => (e.w < 32 ? true : "bounce") },
  init(e) { e.dir = e.opts.dir === "right" ? 1 : -1; e.size = e.w; },
  resize(e, world, s) {
    const cx = U.cx(e), by = e.y + e.h;
    e.size = s; e.w = e.h = Math.round(s);
    e.x = cx - e.w / 2; e.y = by - e.h;
    if (Physics.bodyBlocked(world, e, false)) e.y -= 2;
  },
  onDamage(e, world, amount, source) {
    if (e.iframes > 0) return false;
    e.iframes = 8; e.flash = 8;
    const s = e.size - (source === "stomp" ? 14 : 9 * amount);
    world.particles.burst(U.cx(e), U.cy(e), 10, TERM.purple, 3, { shape: "square" });
    if (s < 14) { world.killEntity(e); return true; }
    this.resize(e, world, s);
    sfx.play("hit");
    return true;
  },
  update(e, world) {
    if (e.t % e.grow === 0 && e.size < e.max) this.resize(e, world, e.size + 1);
    const p = world.player;
    if (p.alive && Math.abs(U.cx(p) - U.cx(e)) < 8 * TILE && Math.abs(U.cy(p) - U.cy(e)) < 64) e.dir = U.sign(U.cx(p) - U.cx(e)) || e.dir;
    walkStep(e, world, 0.4 + e.size / 80);
  },
  draw(e, ctx, world) {
    const x = e.x, y = e.y, s = e.w, t = world.time;
    const wob = Math.sin(t * 0.15) * 2;
    Look.shadow(ctx, x + s / 2, y + s, s + 6);
    // Gooey body with a gradient and a wet highlight; drips off the bottom.
    U.roundRect(ctx, x - wob / 2, y + wob, s + wob, s - wob, Math.max(4, s / 3));
    if (e.flash) { ctx.fillStyle = "#ffffff"; ctx.fill(); }
    else Look.fill(ctx, y + wob, s - wob, "#8a5a86", 0.3, 0.35);
    ctx.strokeStyle = U.rgba(TERM.purple, 0.9); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.35)"; U.roundRect(ctx, x + s * 0.18, y + wob + s * 0.12, s * 0.3, s * 0.12, 3); ctx.fill();
    // Leaked "memory blocks" inside, cycling.
    ctx.fillStyle = U.rgba(TERM.white, 0.55);
    const n = Math.floor(s / 10);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if ((i + j + (t >> 4)) % 3 === 0) ctx.fillRect(x + 4 + i * 9, y + 4 + j * 9, 5, 5);
    const dk = ((t + e.col * 9) % 60) / 60;
    ctx.fillStyle = U.rgba(TERM.purple, 1 - dk); ctx.fillRect(x + s * 0.7, y + s + dk * 8, 3, 4);
    U.glow(ctx, x + s / 2, y + s / 2, s, TERM.purple, 0.25);
    if (s >= 32) termLabel(ctx, `${Math.round(s * 12)}MB`, U.cx(e), y - 3, TERM.purple);
  },
});

// ---------------------------------------------------------------- forkChild
registerEntity("forkChild", {
  info: { name: "Fork", desc: "A tiny process that copies itself.", tip: false },
  size: [12, 12],
  props: { enemy: true, hurts: true, stompable: true, shootable: true, dashable: true, hp: 1,
    transient: true, alwaysActive: true, split: 150, color: TERM.amber },
  init(e) { e.dir = Math.random() < 0.5 ? -1 : 1; e.hop = 20 + Math.floor(Math.random() * 30); },
  update(e, world) {
    const p = world.player;
    e.vy = Math.min(10, e.vy + 0.5);
    const res = Physics.move(world, e, e.vx, e.vy);
    if (res.hitX) e.vx = -e.vx;
    if (res.hitY) { e.vy = 0; e.vx *= 0.8; }
    if (res.onGround && --e.hop <= 0) {
      e.hop = 30 + Math.floor(Math.random() * 30);
      e.vy = -6; e.vx = (U.sign(U.cx(p) - U.cx(e)) || e.dir) * 2;
    }
    // Fork: split in two (the parent spawner keeps a cap).
    if (e.t % e.split === 0 && e.parent && !e.parent.dead && e.parent.def.room(e.parent, world)) {
      const c = world.spawn("forkChild", e.x, e.y, {});
      if (c) { c.parent = e.parent; c.vy = -5; c.vx = -e.vx || 2; sfx.play("fork"); }
    }
    if (e.y > world.ph + 100) e.dead = true;
  },
  draw(e, ctx, world) {
    const col = e.flash ? "#ffffff" : e.color;
    ctx.beginPath(); ctx.rect(e.x, e.y, 12, 12); Look.fill(ctx, e.y, 12, col, 0.3, 0.3);
    ctx.fillStyle = TERM.bg; ctx.fillRect(e.x + 3, e.y + 3, 6, 2); ctx.fillRect(e.x + 3, e.y + 7, 6, 2);
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(e.x, e.y, 12, 1);
    U.glow(ctx, e.x + 6, e.y + 6, 10, col, 0.4);
  },
});

// ---------------------------------------------------------------- forkBomb
// overrides: cap (max children alive), rate (frames between forks), sight (tiles)
registerEntity("forkBomb", {
  info: { name: "Fork Bomb", desc: "Spawns processes that copy themselves: destroy the bomb." },
  size: [30, 30],
  props: { enemy: true, hurts: true, stompable: "bounce", shootable: true, dashable: false, hp: 5,
    cap: 5, rate: 100, sight: 11, color: TERM.amber, alwaysActive: true },
  init(e) { e.timer = 40; },
  room(e, world) { return world.entities.filter((o) => o.parent === e && !o.dead).length < e.cap; },
  update(e, world) {
    const p = world.player;
    if (!p.alive || Math.abs(U.cx(p) - U.cx(e)) > e.sight * TILE || Math.abs(U.cy(p) - U.cy(e)) > 8 * TILE) return;
    if (--e.timer <= 0) {
      e.timer = e.rate;
      if (this.room(e, world)) {
        const c = world.spawn("forkChild", U.cx(e) - 6, e.y - 12, {});
        if (c) { c.parent = e; c.vy = -6; c.vx = (U.sign(U.cx(p) - U.cx(e)) || 1) * 2; }
        if (world.onScreen(e)) sfx.play("fork");
      }
    }
  },
  onDeath(e, world) {
    for (const o of world.entities) if (o.parent === e && !o.dead) world.killEntity(o); // the whole process tree
  },
  onRespawn(e, world) { for (const o of world.entities) if (o.parent === e) o.dead = true; },
  draw(e, ctx, world) {
    const x = e.x, y = e.y, col = e.flash ? "#ffffff" : e.color, t = world.time;
    const arming = e.timer < 20;
    Look.shadow(ctx, x + 15, y + 30, 32);
    ctx.beginPath(); ctx.rect(x, y, 30, 30); Look.fill(ctx, y, 30, TERM.panel, 0.15, 0.35);
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, 28, 28);
    for (const [bx, by] of [[4, 4], [26, 4], [4, 26], [26, 26]]) Look.bolt(ctx, x + bx, y + by, 1.3);
    // Rune strip of plain bars, pulsing in sequence.
    for (let i = 0; i < 4; i++) {
      const on = Math.floor(t / 6) % 4 === i || (arming && t % 6 < 3);
      ctx.fillStyle = on ? TERM.white : col;
      ctx.fillRect(x + 5 + i * 6, y + 8 + (i % 2) * 6, 4, 4);
    }
    ctx.fillStyle = col; ctx.fillRect(x + 5, y + 22, 20 * (arming ? 1 - e.timer / 20 : 1), 3);
    if (arming) { Look.telegraph(ctx, x + 15, y + 15, 14, col, 1 - e.timer / 20); }
  },
});

// ---------------------------------------------------------------- kernelPanicOrb
registerEntity("kernelPanicOrb", {
  info: { name: "Kernel Panic Orb", desc: "Shielded until it blows its ring: strike then, or use Sudo." },
  size: [28, 28],
  anchor: "center",
  props: { enemy: true, hurts: true, shootable: true, hp: 3, rate: 170, ring: 110, sight: 9, color: TERM.red,
    stompable: (e, world) => (e.vuln > 0 || world.player.sudo > 0 ? true : "bounce"),
    dashable: (e, world) => e.vuln > 0 || world.player.sudo > 0 },
  init(e) { e.timer = 60 + Math.floor(Math.random() * 80); e.vuln = 0; e.ringR = 0; e.phase = Math.random() * 6.28; },
  /** Shield up (blocks shots and dashes) unless dumping or the player has Sudo. */
  blocks(e, world) { return !(e.vuln > 0 || world.player.sudo > 0); },
  update(e, world) {
    const p = world.player;
    if (e.vuln > 0) e.vuln--;
    const near = p.alive && U.dist(U.cx(e), U.cy(e), U.cx(p), U.cy(p)) < e.sight * TILE;
    const tx = near ? U.cx(p) - e.w / 2 : e.home.x + Math.sin(e.t * 0.02 + e.phase) * 30;
    const ty = near ? U.cy(p) - e.h / 2 - 70 : e.home.y + Math.sin(e.t * 0.05) * 8;
    e.x += U.clamp((tx - e.x) * 0.02, -1, 1);
    e.y += U.clamp((ty - e.y) * 0.02, -1, 1);
    if (e.ringR > 0) {
      e.ringR += 3.5;
      if (Math.abs(U.dist(U.cx(e), U.cy(e), U.cx(p), U.cy(p)) - e.ringR) < 12) world.hurtPlayer(1, e);
      if (e.ringR > e.ring) { e.ringR = 0; e.vuln = 80; }
    } else if (near && --e.timer <= 0) {
      e.timer = e.rate; e.ringR = 10;
      if (world.onScreen(e)) sfx.play("panic");
    }
  },
  draw(e, ctx, world) {
    const cx = U.cx(e), cy = U.cy(e), t = world.time;
    const charging = e.ringR === 0 && e.timer < 36;
    const warn = charging && Math.floor(e.timer / 4) % 2;
    U.glow(ctx, cx, cy, 32, e.color, 0.55);
    // Core sphere with bands.
    ctx.beginPath(); ctx.arc(cx, cy, 10, 0, 6.28);
    if (e.flash || warn) { ctx.fillStyle = "#ffffff"; ctx.fill(); } else Look.fill(ctx, cy - 10, 20, e.color, 0.4, 0.4);
    ctx.fillStyle = TERM.bg; ctx.fillRect(cx - 6, cy - 1.5, 12, 3);
    ctx.fillStyle = Math.floor(t / 10) % 2 ? TERM.white : e.color; ctx.fillRect(cx - 4 + ((t >> 2) % 8), cy - 1, 2, 2);
    // Orbiting debris.
    for (let i = 0; i < 3; i++) { const a = t * 0.07 + i * 2.09 + e.phase; ctx.fillStyle = U.rgba(e.color, 0.8); ctx.fillRect(cx + Math.cos(a) * 18 - 1.5, cy + Math.sin(a) * 18 - 1.5, 3, 3); }
    if (charging) Look.telegraph(ctx, cx, cy, 16, e.color, 1 - e.timer / 36);
    // Shield ring (dashed, rotating) unless it's dumping.
    if (e.vuln <= 0) {
      const sudo = world.player.sudo > 0;
      ctx.strokeStyle = sudo ? U.rgba(TERM.amber, 0.4) : TERM.white; ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]); ctx.lineDashOffset = -t * 0.5;
      ctx.beginPath(); ctx.arc(cx, cy, 14, 0, 6.28); ctx.stroke(); ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = U.rgba(TERM.green, 0.6); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, 14, t * 0.2, t * 0.2 + 1); ctx.stroke();
    }
    if (e.ringR > 0) {
      const a = 1 - e.ringR / e.ring;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = U.rgba(e.color, a * 0.35); ctx.lineWidth = 16;
      ctx.beginPath(); ctx.arc(cx, cy, e.ringR, 0, 6.28); ctx.stroke();
      ctx.strokeStyle = U.rgba("#ffffff", a); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, e.ringR, 0, 6.28); ctx.stroke();
      ctx.restore();
    }
  },
});

// ---------------------------------------------------------------- permDoor
// One cell of a permission-locked door. Solid unless Sudo is active.
registerEntity("permDoor", {
  info: { name: "Permission Door", desc: "Locked: only Sudo gets you through." },
  size: [32, 32],
  anchor: "topleft",
  props: { solid: true, alwaysActive: true },
  update(e, world) {
    const p = world.player;
    const open = p.sudo > 0;
    if (!open && !e.solid && U.overlap(p, e)) return; // never lock shut around the player
    e.solid = !open;
  },
  draw(e, ctx, world) {
    const open = !e.solid, t = world.time;
    ctx.globalAlpha = open ? 0.25 : 1;
    ctx.beginPath(); ctx.rect(e.x + 2, e.y, 28, 32); Look.fill(ctx, e.y, 32, "#2e1c1c", 0.1, 0.3);
    ctx.strokeStyle = open ? TERM.amber : TERM.red; ctx.lineWidth = 2; ctx.strokeRect(e.x + 3, e.y + 1, 26, 30);
    // Padlock (plain shapes) on cells whose top is open, bars elsewhere.
    if (e.row === 0 || !Physics.solidAt(world, e.col, e.row - 1) && !world.entities.some((o) => o.name === "permDoor" && o.col === e.col && o.row === e.row - 1)) {
      ctx.fillStyle = open ? TERM.amber : TERM.red;
      ctx.fillRect(e.x + 10, e.y + 14, 12, 10);
      ctx.strokeStyle = ctx.fillStyle; ctx.beginPath(); ctx.arc(e.x + 16, e.y + 14, 4, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = "#1a0a0a"; ctx.fillRect(e.x + 15, e.y + 17, 2, 4);
    } else {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = U.rgba(TERM.red, 0.45 + 0.25 * Math.sin(t * 0.1 + i + e.row));
        ctx.fillRect(e.x + 8 + i * 7, e.y + 4, 3, 24);
      }
    }
    ctx.globalAlpha = 1;
    if (!open) { termLabel(ctx, "r--", e.x + 16, e.y + 31, U.rgba(TERM.red, 0.8), 8); U.glow(ctx, e.x + 16, e.y + 16, 18, TERM.red, 0.2); }
  },
});

// ---------------------------------------------------------------- loopPlatform
// overrides: width (tiles), lw / lh (loop size in tiles), speed (px/frame),
// offset (s), mode: "rect" (travels a rectangle, clockwise) | "wrap" (slides
// lw tiles, then snaps back to the start — stand on it too long and you drop).
registerEntity("loopPlatform", {
  info: { name: "Loop Platform", desc: "Stuck in an infinite loop; some snap back to the start." },
  size: [96, 16],
  anchor: "topleft",
  props: { solid: true, width: 3, lw: 4, lh: 3, speed: 1.4, offset: 0, mode: "rect", alwaysActive: true },
  init(e, world, arg) {
    if (arg === "wrap") e.mode = "wrap";
    e.w = e.width * TILE;
    e.perim = e.mode === "wrap" ? e.lw * TILE : 2 * (e.lw + e.lh) * TILE;
    e.period = Math.max(30, Math.round(e.perim / e.speed));
  },
  /** {x, y} at time t (pure function). */
  posAt(e, t) {
    const L = e.lw * TILE, Hh = e.lh * TILE;
    let s = ((((t + Math.round(e.offset * FPS)) % e.period) + e.period) % e.period) * e.speed;
    if (e.mode === "wrap") return { x: e.home.x + s, y: e.home.y };
    if (s < L) return { x: e.home.x + s, y: e.home.y };
    s -= L;
    if (s < Hh) return { x: e.home.x + L, y: e.home.y + s };
    s -= Hh;
    if (s < L) return { x: e.home.x + L - s, y: e.home.y + Hh };
    s -= L;
    return { x: e.home.x, y: e.home.y + Hh - s };
  },
  update(e, world) {
    const q = this.posAt(e, world.htime);
    if (Math.abs(q.x - e.x) > 40 || Math.abs(q.y - e.y) > 40) {
      // Infinite loop wrapped around: jump back without carrying anyone.
      const p = world.player;
      if (p.ground === e) { p.ground = null; p.onGround = false; }
      e.x = q.x; e.y = q.y;
      world.particles.burst(U.cx(e), U.cy(e), 8, TERM.green, 3, { shape: "square" });
      return;
    }
    Physics.moveSolid(world, e, q.x - e.x, q.y - e.y);
  },
  draw(e, ctx, world) {
    const t = world.time;
    // Faint loop path with a moving dash.
    ctx.strokeStyle = U.rgba(TERM.green, 0.18); ctx.lineWidth = 1; ctx.setLineDash([4, 6]); ctx.lineDashOffset = -t * 0.4;
    if (e.mode === "wrap") { ctx.beginPath(); ctx.moveTo(e.home.x, e.home.y + 8); ctx.lineTo(e.home.x + e.lw * TILE + e.w, e.home.y + 8); ctx.stroke(); }
    else ctx.strokeRect(e.home.x + e.w / 2, e.home.y + 8, e.lw * TILE, e.lh * TILE);
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.rect(e.x, e.y, e.w, e.h); Look.fill(ctx, e.y, e.h, TERM.panel, 0.15, 0.35);
    ctx.fillStyle = TERM.green; ctx.fillRect(e.x, e.y, e.w, 3);
    ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.fillRect(e.x, e.y, e.w, 1);
    // "while(true)" arrows.
    ctx.fillStyle = U.rgba(TERM.green, 0.7);
    const k = (t >> 2) % 12;
    for (let x = e.x + 4 + k; x < e.x + e.w - 8; x += 12) { ctx.fillRect(x, e.y + 7, 6, 2); ctx.fillRect(x + 4, e.y + 6, 2, 4); }
    U.glow(ctx, e.x + e.w / 2, e.y + 2, e.w * 0.4, TERM.green, 0.2);
    // Warn before a wrap-around snap.
    const near = e.mode === "wrap" && (this.posAt(e, world.htime + 40).x < e.x);
    if (near && t % 6 < 3) { ctx.strokeStyle = TERM.red; ctx.lineWidth = 2; ctx.strokeRect(e.x, e.y, e.w, e.h); U.glow(ctx, e.x + e.w / 2, e.y + 4, 24, TERM.red, 0.4); }
  },
});

// ---------------------------------------------------------------- packageBox
registerEntity("packageBox", {
  info: { name: "Package", desc: "A crate to stand on.", tip: false },
  size: [32, 32],
  anchor: "topleft",
  props: { solid: true },
  draw(e, ctx) {
    const x = e.x, y = e.y;
    ctx.beginPath(); ctx.rect(x + 1, y + 1, 30, 31); Look.fill(ctx, y + 1, 31, "#8f6a3e", 0.2, 0.3);
    ctx.fillStyle = "#a8804e"; ctx.fillRect(x + 1, y + 1, 30, 6);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x + 1, y + 7, 30, 1);
    ctx.fillStyle = "#d9c9a3"; ctx.fillRect(x + 13, y + 1, 6, 31);  // tape
    ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.fillRect(x + 13, y + 1, 1, 31);
    ctx.fillStyle = "#3a2a1a"; ctx.fillRect(x + 4, y + 18, 7, 2); ctx.fillRect(x + 4, y + 22, 5, 2);
    ctx.fillStyle = "rgba(60,40,20,0.4)"; ctx.fillRect(x + 22, y + 12, 6, 6);
    ctx.strokeStyle = "#5a4024"; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, y + 1.5, 29, 30);
  },
});

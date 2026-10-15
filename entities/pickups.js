/* =========================================================================
 * entities/pickups.js — cores, checkpoints, exit, power-ups, refills.
 * ========================================================================= */
"use strict";

// Shared helper: magnet power pulls collectibles toward the player.
function magnetPull(e, world) {
  const p = world.player;
  if (p.powers.magnet <= 0 || !p.alive) return;
  const dx = U.cx(p) - U.cx(e), dy = U.cy(p) - U.cy(e);
  const d = Math.hypot(dx, dy);
  if (d < 230 && d > 1) {
    const s = Math.min(9, 160 / d + 2);
    e.x += (dx / d) * s; e.y += (dy / d) * s;
  }
}

// ---------------------------------------------------------------- core
registerEntity("core", {
  info: { name: "Core", desc: "Collect them all for a perfect run.", tip: false, kind: "item" },
  size: [16, 16],
  anchor: "center",
  props: { color: "#00f0ff" },
  init(e) { e.phase = (e.col || 0) * 0.7; },
  update(e, world) { magnetPull(e, world); },
  onTouch(e, world) {
    e.dead = true;
    world.cores++;
    sfx.play("core");
    world.particles.pickup(U.cx(e), U.cy(e), "#00f0ff");
  },
  draw(e, ctx, world) {
    const t = world.time;
    const cx = U.cx(e), cy = U.cy(e) + Math.sin(t * 0.07 + e.phase) * 3;
    U.glow(ctx, cx, cy, 20, "#00f0ff", 0.55);
    // A faceted data crystal that turns (width follows the spin).
    const s = 8, k = Math.cos(t * 0.06 + e.phase), w = s * Math.abs(k) + 1;
    const lit = k > 0;
    ctx.fillStyle = lit ? "#dffcff" : "#7fe8f5";
    ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + w, cy); ctx.lineTo(cx, cy + s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = lit ? "#7fe8f5" : "#3ac8dc";
    ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx - w, cy); ctx.lineTo(cx, cy + s); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#00f0ff"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + w, cy); ctx.lineTo(cx, cy + s); ctx.lineTo(cx - w, cy); ctx.closePath(); ctx.stroke();
    // An occasional sparkle.
    if (((t + e.phase * 40) % 90) < 10) {
      const a = ((t + e.phase * 40) % 90) / 10;
      ctx.fillStyle = `rgba(255,255,255,${1 - a})`;
      ctx.fillRect(cx + 3 - 4 * a, cy - 5, 8 * a, 1); ctx.fillRect(cx + 3 - 0.5, cy - 5 - 4 * a, 1, 8 * a);
    }
  },
});

// ---------------------------------------------------------- secret core
registerEntity("secretCore", {
  info: { name: "Secret Core", desc: "Hidden off the main path.", tip: false, kind: "item" },
  size: [22, 22],
  anchor: "center",
  props: { color: "#ffd23d" },
  update(e, world) { magnetPull(e, world); },
  onTouch(e, world) {
    e.dead = true;
    world.secrets++;
    sfx.play("secret");
    world.particles.pickup(U.cx(e), U.cy(e), "#ffd23d");
    world.particles.burst(U.cx(e), U.cy(e), 24, "#ffd23d", 5, { glow: true });
    world.particles.ring(U.cx(e), U.cy(e), "#ffd23d", 40, 30);
    world.flash(U.cx(e), U.cy(e), 160, "#ffd23d", 24);
    world.camera.shake(3);
  },
  draw(e, ctx, world) {
    const t = world.time;
    const cx = U.cx(e), cy = U.cy(e) + Math.sin(t * 0.05) * 3;
    U.glow(ctx, cx, cy, 34, "#ffd23d", 0.75);
    // Orbiting sparks.
    for (let i = 0; i < 3; i++) {
      const a = t * 0.06 + i * 2.09;
      ctx.fillStyle = "#fff3b0"; ctx.fillRect(cx + Math.cos(a) * 15 - 1, cy + Math.sin(a) * 6 - 1, 2, 2);
    }
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.03);
    ctx.strokeStyle = "#ffd23d"; ctx.lineWidth = 2;
    ctx.strokeRect(-10, -10, 20, 20);
    ctx.rotate(Math.PI / 4 - t * 0.05);
    const g = ctx.createLinearGradient(-7, -7, 7, 7);
    g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#ffb400");
    ctx.fillStyle = g; ctx.fillRect(-6.5, -6.5, 13, 13);
    ctx.strokeStyle = "rgba(120,70,0,0.6)"; ctx.lineWidth = 1; ctx.strokeRect(-3, -3, 6, 6);
    ctx.restore();
  },
});

// ---------------------------------------------------------- checkpoint
registerEntity("checkpoint", {
  info: { name: "Checkpoint", desc: "Touch it: you restart here after a fall.", kind: "item" },
  size: [24, 56],
  layer: 0,
  init(e) { e.on = false; },
  onTouch(e, world) {
    if (e.on) return;
    for (const o of world.entities) if (o.name === "checkpoint") o.on = false;
    e.on = true;
    world.setCheckpoint(e);
    sfx.play("checkpoint");
    const p = world.player;
    if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 1);
    world.particles.pickup(U.cx(e), e.y + 8, "#7dff4a");
    world.particles.burst(U.cx(e), e.y + 8, 16, "#7dff4a", 4, { glow: true });
    world.flash(U.cx(e), e.y + 8, 140, "#7dff4a", 20);
  },
  draw(e, ctx, world) {
    const t = world.time, cx = U.cx(e), col = e.on ? "#7dff4a" : "#3a5a7a";
    Look.shadow(ctx, cx, e.y + e.h, 22);
    // Base plate and mast.
    ctx.beginPath(); ctx.rect(cx - 11, e.y + e.h - 6, 22, 6);
    Look.fill(ctx, e.y + e.h - 6, 6, "#22345c");
    ctx.fillStyle = col; ctx.fillRect(cx - 8, e.y + e.h - 6, 16, 1);
    ctx.beginPath(); ctx.rect(cx - 3, e.y + 12, 6, e.h - 18);
    Look.fill(ctx, e.y + 12, e.h - 18, "#1c2b4e");
    for (let i = 0; i < 3; i++) {
      const lit = e.on && Math.floor(t / 10) % 3 === i;
      ctx.fillStyle = lit ? "#d8ffcc" : col; ctx.fillRect(cx - 3, e.y + 16 + i * 6, 6, 2);
    }
    // Beacon head: a ring that unfolds once activated.
    const open = e.on ? 1 : 0.4;
    const pulse = e.on ? 0.6 + Math.sin(t * 0.1) * 0.3 : 0.2;
    U.glow(ctx, cx, e.y + 8, e.on ? 34 : 14, col, pulse);
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, e.y + 8, 9, Math.PI * (1 - open * 0.5) - 0.3, Math.PI * (2 + open * 0.5) + 0.3 - Math.PI * (1 - open)); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(cx, e.y + 8, 5, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(cx - 1.5, e.y + 6.5, 1.8, 0, 6.28); ctx.fill();
    if (e.on) {
      // Light column and rising motes.
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const g = ctx.createLinearGradient(0, e.y - 70, 0, e.y + 8);
      g.addColorStop(0, U.rgba(col, 0)); g.addColorStop(1, U.rgba(col, 0.35));
      ctx.fillStyle = g; ctx.fillRect(cx - 2, e.y - 70, 4, 78);
      for (let i = 0; i < 3; i++) { const k = ((t * 0.6 + i * 23) % 70); ctx.fillStyle = U.rgba(col, 1 - k / 70); ctx.fillRect(cx - 1 + Math.sin(t * 0.05 + i) * 3, e.y + 4 - k, 2, 2); }
      ctx.restore();
    }
  },
});

// ---------------------------------------------------------------- exit
registerEntity("exit", {
  info: { name: "Exit", desc: "Step in to finish the level (locked while a boss lives).", tip: false, kind: "item" },
  size: [40, 64],
  layer: 0,
  onTouch(e, world) {
    if (world.bossesAlive()) {
      if (!e.warned) { world.showHint("LOCKED", 1); e.warned = 120; }
      return;
    }
    world.completeLevel();
  },
  update(e) { if (e.warned > 0) e.warned--; },
  draw(e, ctx, world) {
    const t = world.time;
    const locked = world.bossesAlive();
    const col = locked ? "#ff3355" : "#7dff4a";
    const cx = U.cx(e), cy = U.cy(e);
    ctx.font = "bold 13px monospace"; ctx.textAlign = "center";
    ctx.fillStyle = col; ctx.fillText(locked ? "LOCKED" : "EXIT", cx, e.y - 12 + Math.sin(t * 0.08) * 2);
    ctx.textAlign = "left";
    U.glow(ctx, cx, cy, 64, col, 0.35 + Math.sin(t * 0.08) * 0.1);
    // Frame: two pylons with lights, joined at the top.
    for (const px of [e.x - 3, e.x + e.w - 3]) {
      ctx.beginPath(); ctx.rect(px, e.y - 2, 6, e.h + 2);
      Look.fill(ctx, e.y, e.h, "#1c2b4e");
      for (let i = 0; i < 4; i++) { ctx.fillStyle = Math.floor(t / 6 + i) % 4 === 0 ? "#ffffff" : col; ctx.fillRect(px + 2, e.y + 4 + i * (e.h / 4), 2, 3); }
    }
    ctx.fillStyle = "#1c2b4e"; ctx.fillRect(e.x - 3, e.y - 6, e.w + 6, 5);
    ctx.fillStyle = col; ctx.fillRect(e.x, e.y - 5, e.w, 1);
    // Swirling portal field.
    ctx.save();
    ctx.beginPath(); ctx.rect(e.x + 3, e.y, e.w - 6, e.h); ctx.clip();
    ctx.fillStyle = U.rgba(col, 0.14); ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5; i++) {
      const k = ((t * 0.8 + i * 13) % 64) / 64;
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.fillStyle = col;
      ctx.fillRect(e.x + 4, e.y + e.h - 6 - k * (e.h - 10), e.w - 8, 2);
    }
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(cx, cy, (e.w / 2 - 4) * (0.5 + 0.5 * Math.sin(t * 0.05 + i * 3)), e.h / 2 - 4, 0, 0, 6.28); ctx.stroke(); }
    ctx.restore();
    ctx.globalAlpha = 1;
    if (locked) {
      // Padlock with a shackle.
      ctx.fillStyle = "#3a0a14"; U.roundRect(ctx, cx - 9, cy - 3, 18, 14, 3); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy - 3, 6, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = col; ctx.fillRect(cx - 1, cy + 2, 2, 5);
    }
  },
});

// ------------------------------------------------------------ power-ups
// Temporary power-ups. Arg selects the kind: shield | magnet | speed | health
const POWERUPS = {
  shield: { color: "#59a7ff", label: "SHIELD", frames: 60 * 20, text: "SHIELD", desc: "Blocks the next hit." },
  magnet: { color: "#ff3df0", label: "MAGNET", frames: 60 * 12, text: "MAGNET", desc: "Pulls cores toward you." },
  speed: { color: "#ffb400", label: "BOOST", frames: 60 * 10, text: "SPEED", desc: "Run faster for a while." },
  health: { color: "#ff4d6d", label: "REPAIR", frames: 0, text: "+1 HP", desc: "Restores one heart." },
};

registerEntity("powerup", {
  size: [22, 22],
  anchor: "center",
  init(e, world, arg) {
    e.kind = POWERUPS[arg] ? arg : "shield";
    if (!POWERUPS[arg]) console.warn(`[powerup] unknown kind "${arg}", using shield.`);
    e.color = POWERUPS[e.kind].color;
  },
  onTouch(e, world, p) {
    const P = POWERUPS[e.kind];
    if (e.kind === "health") {
      if (p.hp >= p.maxHp) return; // keep it for later
      p.hp++;
    } else {
      p.powers[e.kind] = P.frames;
    }
    e.dead = true;
    sfx.play("powerup");
    // First time: what it does. After that just its name.
    if (!Save.seen("power_" + e.kind)) { Save.markSeen("power_" + e.kind); world.showHint(`${P.label}: ${P.desc}`, 2.5); }
    else world.showHint(P.text, 1.2);
    Guide.discover("p:" + e.kind);
    world.particles.pickup(U.cx(e), U.cy(e), P.color);
    world.particles.burst(U.cx(e), U.cy(e), 14, P.color, 4, { glow: true });
  },
  draw(e, ctx, world) {
    const t = world.time;
    const cx = U.cx(e), cy = U.cy(e) + Math.sin(t * 0.06) * 3;
    U.glow(ctx, cx, cy, 28, e.color, 0.6);
    // Rotating outer ring segments around a capsule.
    ctx.strokeStyle = U.rgba(e.color, 0.7); ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const a = t * 0.05 + i * 2.09; ctx.beginPath(); ctx.arc(cx, cy, 16, a, a + 1.2); ctx.stroke(); }
    U.roundRect(ctx, cx - 11, cy - 11, 22, 22, 6);
    Look.fill(ctx, cy - 11, 22, "#16203e", 0.25, 0.4);
    ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.stroke();
    PowerIcon(ctx, e.kind, cx, cy, e.color);
  },
});

/** Tiny vector icons shared by the HUD and pickups. */
function PowerIcon(ctx, kind, cx, cy, color) {
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2;
  switch (kind) {
    case "shield":
      ctx.beginPath();
      ctx.moveTo(cx, cy - 7); ctx.lineTo(cx + 6, cy - 4); ctx.lineTo(cx + 5, cy + 3);
      ctx.lineTo(cx, cy + 7); ctx.lineTo(cx - 5, cy + 3); ctx.lineTo(cx - 6, cy - 4);
      ctx.closePath(); ctx.stroke();
      break;
    case "magnet":
      ctx.beginPath(); ctx.arc(cx, cy, 5, Math.PI, 0); ctx.stroke();
      ctx.fillRect(cx - 7, cy, 4, 6); ctx.fillRect(cx + 3, cy, 4, 6);
      break;
    case "speed":
      ctx.beginPath();
      ctx.moveTo(cx + 2, cy - 7); ctx.lineTo(cx - 5, cy + 1); ctx.lineTo(cx, cy + 1);
      ctx.lineTo(cx - 2, cy + 7); ctx.lineTo(cx + 5, cy - 1); ctx.lineTo(cx, cy - 1);
      ctx.closePath(); ctx.fill();
      break;
    case "health":
      ctx.fillRect(cx - 2, cy - 6, 4, 12); ctx.fillRect(cx - 6, cy - 2, 12, 4);
      break;
    case "doubleJump":
      ctx.beginPath(); ctx.moveTo(cx - 5, cy); ctx.lineTo(cx, cy - 5); ctx.lineTo(cx + 5, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 5, cy + 5); ctx.lineTo(cx, cy); ctx.lineTo(cx + 5, cy + 5); ctx.stroke();
      break;
    case "dash":
      ctx.fillRect(cx - 7, cy - 1, 9, 3);
      ctx.beginPath(); ctx.moveTo(cx + 1, cy - 5); ctx.lineTo(cx + 7, cy + 0.5); ctx.lineTo(cx + 1, cy + 6); ctx.fill();
      break;
    case "pulse":
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, 6.5, -1, 1); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 6.5, Math.PI - 1, Math.PI + 1); ctx.stroke();
      break;
    case "dataDash": // arrow made of bits
      ctx.fillRect(cx - 7, cy - 1, 3, 3); ctx.fillRect(cx - 3, cy - 1, 3, 3);
      ctx.beginPath(); ctx.moveTo(cx + 1, cy - 5); ctx.lineTo(cx + 7, cy + 0.5); ctx.lineTo(cx + 1, cy + 6); ctx.fill();
      break;
    case "freeze": // pause bars inside a ring
      ctx.beginPath(); ctx.arc(cx, cy, 7, 0, 6.28); ctx.stroke();
      ctx.fillRect(cx - 3, cy - 3.5, 2, 7); ctx.fillRect(cx + 1, cy - 3.5, 2, 7);
      break;
    case "minimize": // window → bar
      ctx.strokeRect(cx - 6, cy - 6, 12, 8); ctx.fillRect(cx - 6, cy + 4, 12, 2);
      break;
    case "maximize": // small → big window
      ctx.strokeRect(cx - 7, cy - 7, 14, 14); ctx.fillRect(cx - 7, cy - 7, 14, 3);
      break;
    case "grapple": // hook on a line
      ctx.fillRect(cx - 1, cy - 7, 2, 7);
      ctx.beginPath(); ctx.arc(cx, cy + 2, 4.5, 0, Math.PI); ctx.stroke();
      ctx.fillRect(cx - 6, cy + 0, 2, 3);
      break;
    case "groundSlam": // arrow down onto a line
      ctx.fillRect(cx - 1, cy - 7, 3, 7);
      ctx.beginPath(); ctx.moveTo(cx - 5, cy - 1); ctx.lineTo(cx + 0.5, cy + 4); ctx.lineTo(cx + 6, cy - 1); ctx.fill();
      ctx.fillRect(cx - 7, cy + 5, 14, 2);
      break;
    case "jetpack": // tank with a flame
      ctx.strokeRect(cx - 4, cy - 7, 8, 9);
      ctx.beginPath(); ctx.moveTo(cx - 3, cy + 3); ctx.lineTo(cx, cy + 8); ctx.lineTo(cx + 3, cy + 3); ctx.fill();
      break;
    case "sudo": // "#" prompt
      ctx.fillRect(cx - 4, cy - 7, 2, 14); ctx.fillRect(cx + 2, cy - 7, 2, 14);
      ctx.fillRect(cx - 7, cy - 3, 14, 2); ctx.fillRect(cx - 7, cy + 2, 14, 2);
      break;
    case "pipe": // "|" between two dots
      ctx.fillRect(cx - 1, cy - 8, 2, 16);
      ctx.fillRect(cx - 7, cy - 1, 3, 3); ctx.fillRect(cx + 4, cy - 1, 3, 3);
      break;
    case "killProcess": // crosshair
      ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 6.28); ctx.stroke();
      ctx.fillRect(cx - 1, cy - 9, 2, 5); ctx.fillRect(cx - 1, cy + 4, 2, 5); ctx.fillRect(cx - 9, cy - 1, 5, 2); ctx.fillRect(cx + 4, cy - 1, 5, 2);
      break;
    case "altTab": // two overlapping windows
      ctx.strokeRect(cx - 7, cy - 5, 9, 8); ctx.strokeRect(cx - 2, cy - 1, 9, 8);
      break;
    case "shrink": // big square → small square
      ctx.strokeRect(cx - 7, cy - 7, 10, 10); ctx.fillRect(cx + 2, cy + 2, 5, 5);
      break;
    case "blockPlace": // block with a plus
      ctx.strokeRect(cx - 6, cy - 6, 12, 12); ctx.fillRect(cx - 1, cy - 4, 2, 8); ctx.fillRect(cx - 4, cy - 1, 8, 2);
      break;
    case "rewind": // double left arrow
      for (const o of [0, 6]) { ctx.beginPath(); ctx.moveTo(cx + 2 - o, cy - 5); ctx.lineTo(cx - 4 - o, cy); ctx.lineTo(cx + 2 - o, cy + 5); ctx.fill(); }
      break;
    case "rootAccess": // key: ring + bit
      ctx.beginPath(); ctx.arc(cx - 3, cy, 3.5, 0, 6.28); ctx.stroke();
      ctx.fillRect(cx, cy - 1, 7, 2); ctx.fillRect(cx + 4, cy + 1, 2, 3);
      break;
    case "hpUp":
      ctx.beginPath();
      ctx.moveTo(cx, cy - 7); ctx.lineTo(cx + 6, cy); ctx.lineTo(cx, cy + 7); ctx.lineTo(cx - 6, cy);
      ctx.closePath(); ctx.stroke();
      ctx.fillRect(cx - 1, cy - 3, 2, 6); ctx.fillRect(cx - 3, cy - 1, 6, 2);
      break;
  }
}

// ---------------------------------------------------- permanent upgrade
// Optional in-level pickup that grants a permanent upgrade right away.
// Usage in a legend: "J": "upgrade:dash"
/** Abilities, keyed by upgrade name. Each world's entity file adds its own.
 *   hud    short label: shown in the HUD with its recharge (abilities that recharge)
 *   name   shown on unlock and in the Codex      desc  what it does (one line)
 *   how    how to use it ({jump}-style key tokens, see UI.keys)
 *   action input action that triggers it (only abilities you press)
 *   weapon a weapon this ability gives (e.g. Pulse Shot → the Pulse Blaster)
 *   label  its on-screen touch button              world  world that teaches it */
const UPGRADE_INFO = {
  doubleJump: { name: "DOUBLE JUMP", desc: "Jump again in mid-air.", how: "{jump} in mid-air", world: 1 },
  dash: { name: "DASH", hud: "DASH", desc: "A quick burst sideways; dash into enemies to hit them.", how: "{dash}", world: 1 },
  pulse: { name: "PULSE SHOT", desc: "Your first blaster.", how: "{shoot}", world: 1, weapon: "pulseBlaster" },
};

registerEntity("upgrade", {
  size: [26, 26],
  anchor: "center",
  init(e, world, arg) {
    e.kind = arg;
    if (world.player.has(arg)) e.dead = true; // already owned
  },
  onTouch(e, world, p) {
    p.upgrades.add(e.kind);
    const gift = UPGRADE_INFO[e.kind] && UPGRADE_INFO[e.kind].weapon;
    if (gift) { p.giveWeapon(gift, true); Save.addWeapon(gift); }
    world.pickedUpgrades = (world.pickedUpgrades || []).concat(e.kind);
    sfx.play("powerup");
    e.dead = true;
    const info = UPGRADE_INFO[e.kind] || { name: e.kind, how: "" };
    world.banner = { text: info.name, sub: UI.keys([info.desc, info.how].filter(Boolean).join("   ")), t: 180, max: 180, color: "#ffd23d" };
    Save.markSeen("ability_" + e.kind);
    Guide.discover("a:" + e.kind);
    world.particles.pickup(U.cx(e), U.cy(e), "#ffd23d");
    world.particles.burst(U.cx(e), U.cy(e), 36, "#ffd23d", 6, { glow: true });
    world.flash(U.cx(e), U.cy(e), 220, "#ffd23d", 30);
  },
  draw(e, ctx, world) {
    const t = world.time;
    const cx = U.cx(e), cy = U.cy(e) + Math.sin(t * 0.05) * 4;
    U.glow(ctx, cx, cy, 46, "#ffd23d", 0.7);
    // Rays.
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.translate(cx, cy); ctx.rotate(t * 0.01);
    for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.fillStyle = "rgba(255,210,61,0.12)"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-4, -34); ctx.lineTo(4, -34); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, 14, 0, 6.28);
    Look.fill(ctx, cy - 14, 28, "#2a2050", 0.25, 0.4);
    ctx.strokeStyle = "#ffd23d"; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = "rgba(255,243,176,0.5)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, 17, t * 0.04, t * 0.04 + 2); ctx.stroke();
    PowerIcon(ctx, e.kind, cx, cy, "#ffd23d");
  },
});

// ---------------------------------------------------------- dash refill
// Crystal that restores the air dash (and double jump). Respawns.
registerEntity("dashRefill", {
  info: { name: "Dash Crystal", desc: "Refills your dash and double jump in mid-air.", tip: false, kind: "item" },
  size: [20, 24],
  anchor: "center",
  init(e) { e.cool = 0; },
  update(e) { if (e.cool > 0) e.cool--; },
  onTouch(e, world, p) {
    if (e.cool > 0) return;
    if (p.canDash && (p.airJumps > 0 || !p.has("doubleJump")) && p.dashing <= 0) return;
    p.canDash = true;
    p.dashCool = 0;
    if (p.has("doubleJump")) p.airJumps = 1;
    e.cool = 150;
    sfx.play("refill");
    Save.markSeen("crystal");
    world.particles.pickup(U.cx(e), U.cy(e), "#ff3df0");
  },
  draw(e, ctx, world) {
    const t = world.time;
    const cx = U.cx(e), cy = U.cy(e) + Math.sin(t * 0.08) * 2;
    if (e.cool > 0) {
      // Recharging: a dim outline that fills up from the bottom.
      ctx.strokeStyle = U.rgba("#ff3df0", 0.3); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy - 11); ctx.lineTo(cx + 7, cy); ctx.lineTo(cx, cy + 11); ctx.lineTo(cx - 7, cy); ctx.closePath(); ctx.stroke();
      return;
    }
    U.glow(ctx, cx, cy, 26, "#ff3df0", 0.7);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(Math.cos(t * 0.05) * 0.25 + 0.85, 1);
    const g = ctx.createLinearGradient(0, -11, 0, 11);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, "#ffb3f6"); g.addColorStop(1, "#ff3df0");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(7, 0); ctx.lineTo(0, 12); ctx.lineTo(-7, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#ff3df0"; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, 12); ctx.stroke();
    ctx.restore();
  },
});

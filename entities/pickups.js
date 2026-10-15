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
    world.particles.burst(U.cx(e), U.cy(e), 10, "#00f0ff", 3);
    world.particles.ring(U.cx(e), U.cy(e), "#00f0ff", 16, 16);
  },
  draw(e, ctx, world) {
    const cx = U.cx(e), cy = U.cy(e) + Math.sin(world.time * 0.07 + e.phase) * 3;
    U.glow(ctx, cx, cy, 18, "#00f0ff", 0.55);
    const s = 7, k = Math.cos(world.time * 0.06 + e.phase);
    ctx.fillStyle = "#bff8ff";
    ctx.beginPath();
    ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s * k, cy); ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s * k, cy);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#00f0ff"; ctx.lineWidth = 1.5; ctx.stroke();
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
    world.particles.burst(U.cx(e), U.cy(e), 30, "#ffd23d", 5, { glow: true });
    world.particles.ring(U.cx(e), U.cy(e), "#ffd23d", 40, 30);
    world.camera.shake(3);
  },
  draw(e, ctx, world) {
    const cx = U.cx(e), cy = U.cy(e) + Math.sin(world.time * 0.05) * 3;
    U.glow(ctx, cx, cy, 30, "#ffd23d", 0.7);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(world.time * 0.03);
    ctx.strokeStyle = "#ffd23d"; ctx.lineWidth = 2;
    ctx.strokeRect(-9, -9, 18, 18);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#fff3b0";
    ctx.fillRect(-6, -6, 12, 12);
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
    world.particles.burst(U.cx(e), e.y + 8, 24, "#7dff4a", 4, { glow: true });
    world.particles.ring(U.cx(e), e.y + 8, "#7dff4a", 30);
  },
  draw(e, ctx, world) {
    const cx = U.cx(e), col = e.on ? "#7dff4a" : "#3a5a7a";
    ctx.fillStyle = "#16233f";
    ctx.fillRect(cx - 3, e.y + 12, 6, e.h - 12);
    ctx.fillRect(cx - 10, e.y + e.h - 6, 20, 6);
    ctx.fillStyle = col;
    ctx.fillRect(cx - 3, e.y + 18, 6, 2);
    ctx.fillRect(cx - 3, e.y + 28, 6, 2);
    const pulse = e.on ? 0.6 + Math.sin(world.time * 0.1) * 0.3 : 0.2;
    U.glow(ctx, cx, e.y + 8, e.on ? 30 : 14, col, pulse);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(cx, e.y + 8, 6, 0, 6.28); ctx.fill();
    if (e.on) {
      ctx.globalAlpha = 0.25;
      ctx.fillRect(cx - 1, e.y - 60, 2, 60 * (0.5 + 0.5 * Math.sin(world.time * 0.05)));
      ctx.globalAlpha = 1;
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
    const locked = world.bossesAlive();
    const col = locked ? "#ff3355" : "#7dff4a";
    // Clear label above the portal.
    ctx.font = "bold 13px monospace"; ctx.textAlign = "center";
    ctx.fillStyle = col; ctx.fillText(locked ? "LOCKED" : "EXIT", U.cx(e), e.y - 10 + Math.sin(world.time * 0.08) * 2);
    ctx.textAlign = "left";
    const cx = U.cx(e), cy = U.cy(e);
    U.glow(ctx, cx, cy, 60, col, 0.35 + Math.sin(world.time * 0.08) * 0.1);
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    U.roundRect(ctx, e.x, e.y, e.w, e.h, 8); ctx.stroke();
    ctx.fillStyle = U.rgba(col, 0.12); ctx.fill();
    // Rising rings.
    for (let i = 0; i < 4; i++) {
      const k = ((world.time * 0.8 + i * 16) % 64) / 64;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = col;
      ctx.fillRect(e.x + 6, e.y + e.h - 6 - k * (e.h - 10), e.w - 12, 2);
    }
    ctx.globalAlpha = 1;
    if (locked) {
      ctx.fillStyle = col;
      ctx.fillRect(cx - 8, cy - 2, 16, 12);
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy - 2, 6, Math.PI, 0); ctx.stroke();
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
    world.particles.burst(U.cx(e), U.cy(e), 20, P.color, 4, { glow: true });
    world.particles.ring(U.cx(e), U.cy(e), P.color, 30);
  },
  draw(e, ctx, world) {
    const cx = U.cx(e), cy = U.cy(e) + Math.sin(world.time * 0.06) * 3;
    U.glow(ctx, cx, cy, 26, e.color, 0.6);
    ctx.fillStyle = "#0b1328";
    U.roundRect(ctx, cx - 11, cy - 11, 22, 22, 6); ctx.fill();
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
 *   label  its on-screen touch button              world  world that teaches it */
const UPGRADE_INFO = {
  doubleJump: { name: "DOUBLE JUMP", desc: "Jump again in mid-air.", how: "{jump} in mid-air", world: 1 },
  dash: { name: "DASH", hud: "DASH", desc: "A quick burst sideways; dash into enemies to hit them.", how: "{dash}", world: 1 },
  pulse: { name: "PULSE SHOT", desc: "Your first blaster.", how: "{shoot}", world: 1 },
  hpUp: { name: "ARMOR", desc: "+1 max health.", how: "always on", world: 1 },
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
    if (e.kind === "hpUp") { p.maxHp++; p.hp = p.maxHp; }
    world.pickedUpgrades = (world.pickedUpgrades || []).concat(e.kind);
    sfx.play("powerup");
    e.dead = true;
    const info = UPGRADE_INFO[e.kind] || { name: e.kind, how: "" };
    world.banner = { text: info.name, sub: UI.keys([info.desc, info.how].filter(Boolean).join("   ")), t: 180, max: 180, color: "#ffd23d" };
    Save.markSeen("ability_" + e.kind);
    Guide.discover("a:" + e.kind);
    world.particles.burst(U.cx(e), U.cy(e), 40, "#ffd23d", 6, { glow: true });
  },
  draw(e, ctx, world) {
    const cx = U.cx(e), cy = U.cy(e) + Math.sin(world.time * 0.05) * 4;
    U.glow(ctx, cx, cy, 40, "#ffd23d", 0.7);
    ctx.fillStyle = "#1a1530";
    ctx.beginPath(); ctx.arc(cx, cy, 13, 0, 6.28); ctx.fill();
    ctx.strokeStyle = "#ffd23d"; ctx.lineWidth = 2; ctx.stroke();
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
    world.particles.burst(U.cx(e), U.cy(e), 16, "#ff3df0", 4);
    world.particles.ring(U.cx(e), U.cy(e), "#ff3df0", 24);
  },
  draw(e, ctx, world) {
    const cx = U.cx(e), cy = U.cy(e) + Math.sin(world.time * 0.08) * 2;
    if (e.cool > 0) {
      ctx.strokeStyle = U.rgba("#ff3df0", 0.3); ctx.lineWidth = 1;
      ctx.strokeRect(cx - 5, cy - 8, 10, 16);
      return;
    }
    U.glow(ctx, cx, cy, 24, "#ff3df0", 0.7);
    ctx.fillStyle = "#ffb3f6";
    ctx.beginPath();
    ctx.moveTo(cx, cy - 11); ctx.lineTo(cx + 7, cy); ctx.lineTo(cx, cy + 11); ctx.lineTo(cx - 7, cy);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#ff3df0"; ctx.lineWidth = 2; ctx.stroke();
  },
});

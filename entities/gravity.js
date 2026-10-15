/* =========================================================================
 * entities/gravity.js — gravity-flip and heavy-gravity zones (level 7+).
 * Paint an area with the character; like "~" low gravity, each cell
 * applies its effect to the player every frame they overlap it.
 * ========================================================================= */
"use strict";

// Gravity flips upward inside the field: you fall to the ceiling and walk on it.
registerEntity("flipField", {
  info: { name: "Flip Field", desc: "Gravity points up inside it.", tip: false },
  size: [32, 32],
  anchor: "topleft",
  layer: 0,
  update(e, world) {
    const p = world.player;
    if (p.alive && U.overlap(p, e)) { p.gravFlip = true; Save.markSeen("flip"); }
    if (Math.random() < 0.008)
      world.particles.emit(e.x + Math.random() * 32, e.y, { vy: 0.8, life: 45, size: 2, color: "#3dffd8", drag: 1 });
  },
  draw(e, ctx, world) {
    ctx.globalAlpha = 0.07 + 0.03 * Math.sin(world.time * 0.04 + e.col * 0.5 - e.row * 0.4);
    ctx.fillStyle = "#3dffd8";
    ctx.fillRect(e.x, e.y, 32, 32);
    // Faint upward chevrons.
    if ((e.col + e.row) % 3 === 0) {
      ctx.globalAlpha = 0.18;
      const y = e.y + 20 - ((world.time * 0.5 + e.row * 7) % 16);
      ctx.beginPath(); ctx.moveTo(e.x + 10, y + 5); ctx.lineTo(e.x + 16, y); ctx.lineTo(e.x + 22, y + 5);
      ctx.strokeStyle = "#3dffd8"; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
});

// Gravity is much stronger inside: shorter jumps, faster falls.
registerEntity("heavyField", {
  info: { name: "Heavy Field", desc: "Much stronger gravity inside: short jumps." },
  size: [32, 32],
  anchor: "topleft",
  layer: 0,
  update(e, world) {
    const p = world.player;
    if (p.alive && U.overlap(p, e)) p.heavy = true;
  },
  draw(e, ctx, world) {
    ctx.globalAlpha = 0.08 + 0.02 * Math.sin(world.time * 0.05 + e.col * 0.3);
    ctx.fillStyle = "#ff8a3d";
    ctx.fillRect(e.x, e.y, 32, 32);
    if ((e.col * 2 + e.row) % 4 === 0) {
      ctx.globalAlpha = 0.2;
      const y = e.y + 6 + ((world.time * 1.2 + e.row * 5) % 18);
      ctx.beginPath(); ctx.moveTo(e.x + 10, y); ctx.lineTo(e.x + 16, y + 5); ctx.lineTo(e.x + 22, y);
      ctx.strokeStyle = "#ff8a3d"; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
});

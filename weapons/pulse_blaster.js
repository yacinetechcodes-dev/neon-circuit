/* weapons/pulse_blaster.js — fast, weak, unlimited. */
registerWeapon("pulseBlaster", {
  label: "PULSE",
  color: "#7dff4a",
  order: 1,
  cooldown: 12,
  ammo: null,
  icon(ctx, cx, cy, color) {
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 6.5, -1, 1); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 6.5, Math.PI - 1, Math.PI + 1); ctx.stroke();
  },
  fire(world, p) {
    Weapons.shot(world, p, { speed: 10, dmg: 1, life: 45, kind: "pulse", color: "#7dff4a", size: 10 });
    sfx.play("pulse");
  },
});

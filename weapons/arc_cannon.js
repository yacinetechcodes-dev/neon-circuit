/* weapons/arc_cannon.js — slow, strong orb that pierces one enemy. */
sfx.define("arc", (s, t) => {
  s.tone(t, { type: "sawtooth", f0: 160, f1: 60, dur: 0.22, vol: 0.12 });
  s.noise(t, { f0: 3000, f1: 600, dur: 0.18, vol: 0.12 });
}, 0.1);

registerWeapon("arcCannon", {
  desc: "Slow, strong orb that pierces one enemy.",
  label: "ARC",
  color: "#3df5ff",
  order: 2,
  cooldown: 20,
  ammo: 6,
  regen: 75,
  icon(ctx, cx, cy, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 6.28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 2, cy - 5); ctx.lineTo(cx + 1, cy); ctx.lineTo(cx - 1, cy); ctx.lineTo(cx + 2, cy + 5); ctx.stroke();
  },
  fire(world, p) {
    Weapons.shot(world, p, { speed: 5, dmg: 3, life: 80, kind: "arc", color: "#3df5ff", size: 18, pierce: 1 });
    world.camera.shake(2);
    sfx.play("arc");
  },
});

/* weapons/scatter_burst.js — five-pellet spread, short range. */
registerWeapon("scatterBurst", {
  desc: "A five-pellet spread at short range.",
  label: "SCATTER",
  color: "#ffb400",
  order: 3,
  cooldown: 24,
  ammo: 8,
  regen: 55,
  icon(ctx, cx, cy, color) {
    ctx.fillStyle = color;
    for (const [dx, dy] of [[4, -5], [6, 0], [4, 5], [-2, -3], [-2, 3]]) ctx.fillRect(cx + dx - 1.5, cy + dy - 1.5, 3, 3);
  },
  fire(world, p) {
    for (const a of [-0.36, -0.18, 0, 0.18, 0.36]) {
      Weapons.shot(world, p, { speed: 9, angle: a, dmg: 1, life: 15, kind: "pellet", color: "#ffb400", size: 8 });
    }
    sfx.play("fire");
  },
});

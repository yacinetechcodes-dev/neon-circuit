/* weapons/popup_shotgun.js — a spread of five little pop-up windows, short
 * range. Uses the shared player-projectile logic. (World 4 reward) */
sfx.define("popupShot", (s, t) => {
  s.tone(t, { type: "square", f0: 520, f1: 260, dur: 0.08, vol: 0.07 });
  s.noise(t, { filter: "highpass", f0: 2500, dur: 0.06, vol: 0.08 });
}, 0.06);

registerWeapon("popupShotgun", {
  desc: "A spread of five pop-up windows, short range.",
  label: "POPUPS",
  color: "#4fc3ff",
  order: 6,
  cooldown: 30,
  ammo: 6,
  regen: 70,
  icon(ctx, cx, cy, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 7, cy - 6, 9, 7); ctx.strokeRect(cx - 1, cy - 1, 9, 7);
    ctx.fillStyle = color; ctx.fillRect(cx - 7, cy - 6, 9, 2); ctx.fillRect(cx - 1, cy - 1, 9, 2);
  },
  fire(world, p) {
    for (const a of [-0.32, -0.16, 0, 0.16, 0.32]) {
      const e = world.spawn("popupShot", p.facing > 0 ? p.x + p.w : p.x - 12, p.y + 8, {});
      if (!e) continue;
      e.vx = Math.cos(a) * 8 * p.facing; e.vy = Math.sin(a) * 8;
      e.dmg = 1; e.life = 20; e.kind = "popup"; e.color = "#4fc3ff"; e.pierce = 0;
    }
    sfx.play("popupShot");
  },
});

// Same hit rules as every player projectile; only the look differs.
registerEntity("popupShot", {
  size: [12, 9],
  layer: 2,
  props: { transient: true, alwaysActive: true },
  init(e) { e.life = 20; e.hit = []; },
  update(e, world) { Registry.entities.playerShot.update(e, world); },
  draw(e, ctx) {
    const x = Math.round(e.x), y = Math.round(e.y);
    ctx.fillStyle = "#f4f8fc"; ctx.fillRect(x, y, 12, 9);
    ctx.fillStyle = "#1e88e5"; ctx.fillRect(x, y, 12, 3);
    ctx.fillStyle = "#e53935"; ctx.fillRect(x + 9, y + 1, 2, 1);
  },
});

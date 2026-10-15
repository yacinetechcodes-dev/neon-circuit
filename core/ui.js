/* =========================================================================
 * core/ui.js — HUD, boss bar, hints, banners and reusable menus.
 * All drawing here is in screen space (VIEW_W × VIEW_H).
 * ========================================================================= */
"use strict";

const FONT = "'Consolas', 'Menlo', 'DejaVu Sans Mono', monospace";

const UI = {
  /** Replace {jump}-style tokens with the right key names for the device. */
  keys(text, touch = Input.touchMode) {
    const map = touch
      ? { move: "◀ ▶", jump: "JUMP", dash: "DASH", shoot: "FIRE", down: "▼", pause: "II", swap: "WPN", freeze: "FRZ", shrink: "MINI", block: "BLK", minimize: "MIN", maximize: "MAX", alttab: "TAB", grapple: "HOOK", slam: "SLAM", jetpack: "JET", sudo: "SUDO", pipe: "PIPE", kill: "KILL", map: "MAP" }
      : { move: "← → / A D", jump: "SPACE", dash: "SHIFT", shoot: "F", down: "↓ / S", pause: "ESC", swap: "Q / E", freeze: "R", shrink: "T", block: "B", minimize: "Y", maximize: "U", alttab: "TAB / I", grapple: "G", slam: "↓ / N", jetpack: "H", sudo: "O", pipe: "\\ / .", kill: "DEL / ,", map: "0 / `" };
    return text.replace(/\{(\w+)\}/g, (m, k) => map[k] || m);
  },

  /** Split text into lines that fit `width` (uses the current ctx.font). */
  wrap(ctx, text, width) {
    const out = [];
    let line = "";
    for (const w of String(text).split(" ")) {
      const t = line ? line + " " + w : w;
      if (ctx.measureText(t).width > width && line) { out.push(line); line = w; } else line = t;
    }
    if (line) out.push(line);
    return out;
  },

  text(ctx, str, x, y, o = {}) {
    ctx.font = `${o.weight || "bold"} ${o.size || 16}px ${FONT}`;
    ctx.textAlign = o.align || "left";
    ctx.textBaseline = o.base || "alphabetic";
    if (o.glow) {
      ctx.fillStyle = U.rgba(o.glow, 0.35);
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) ctx.fillText(str, x + dx, y + dy);
    }
    ctx.fillStyle = o.color || "#dff6ff";
    ctx.fillText(str, x, y);
  },

  panel(ctx, x, y, w, h, accent = "#00f0ff", alpha = 0.78) {
    ctx.fillStyle = `rgba(6,10,26,${alpha})`;
    U.roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = U.rgba(accent, 0.55);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  },

  // ------------------------------------------------------------------ HUD
  drawHUD(ctx, world) {
    const p = world.player;
    const th = world.theme;
    // Health.
    this.panel(ctx, 12, 12, 40 + p.maxHp * 24, 34, th.accent, 0.6);
    for (let i = 0; i < p.maxHp; i++) {
      const x = 32 + i * 24, y = 29, full = i < p.hp;
      ctx.save();
      ctx.translate(x, y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = full ? "#ff4d6d" : "#2a1a2a";
      ctx.fillRect(-7, -7, 14, 14);
      ctx.strokeStyle = full ? "#ffb3c0" : "#5a3a4a"; ctx.lineWidth = 1.5;
      ctx.strokeRect(-7, -7, 14, 14);
      ctx.restore();
      if (full && p.hp === 1) U.glow(ctx, x, y, 20, "#ff4d6d", 0.4 + Math.sin(world.time * 0.2) * 0.3);
    }
    if (p.powers.shield > 0) {
      const sx = 32 + p.maxHp * 24;
      PowerIcon(ctx, "shield", sx - 4, 29, "#59a7ff");
    }

    // Cores & secrets.
    const cx = 60 + p.maxHp * 24;
    this.panel(ctx, cx, 12, 170, 34, th.accent, 0.6);
    ctx.fillStyle = "#00f0ff";
    ctx.beginPath(); ctx.moveTo(cx + 18, 21); ctx.lineTo(cx + 25, 29); ctx.lineTo(cx + 18, 37); ctx.lineTo(cx + 11, 29); ctx.fill();
    this.text(ctx, `${world.cores}/${world.coresTotal}`, cx + 32, 35, { size: 15 });
    ctx.fillStyle = "#ffd23d";
    ctx.fillRect(cx + 104, 23, 12, 12);
    this.text(ctx, `${world.secrets}/${world.secretsTotal}`, cx + 122, 35, { size: 15, color: "#ffe9a0" });

    // Lives (per attempt): small visor icons, dim when lost.
    const lx = cx + 178;
    this.panel(ctx, lx, 12, 120, 34, th.accent, 0.6);
    for (let i = 0; i < 5; i++) {
      const on = i < (world.lives == null ? 5 : world.lives);
      ctx.fillStyle = on ? "#3a4f86" : "#0c1222";
      U.roundRect(ctx, lx + 8 + i * 22, 20, 16, 18, 4); ctx.fill();
      ctx.strokeStyle = on ? "#9fdcff" : "#1c2a40"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = on ? "#00f0ff" : "#1c2a40";
      ctx.fillRect(lx + 11 + i * 22, 25, 10, 3);
    }

    // Level name + time.
    const sec = world.sections && world.sections[world.sectionIdx];
    this.text(ctx, (sec ? sec.name : world.def.name).toUpperCase(), VIEW_W / 2 + 60, 30, { size: 14, align: "center", color: U.mix(th.accent, "#ffffff", 0.45), glow: "#000000" });
    this.panel(ctx, VIEW_W - 132, 12, 120, 34, th.accent, 0.6);
    this.text(ctx, U.fmtTime(world.levelTime / FPS), VIEW_W - 72, 35, { size: 15, align: "center" });

    // Active timed power-ups: icon, name and time left.
    let px = 14;
    for (const k of ["shield", "magnet", "speed"]) {
      const f = p.powers[k];
      if (f <= 0) continue;
      const P = POWERUPS[k], color = P.color, max = P.frames;
      this.panel(ctx, px, 54, 92, 30, color, 0.6);
      PowerIcon(ctx, k, px + 14, 69, color);
      this.text(ctx, P.label, px + 28, 66, { size: 9, color });
      ctx.fillStyle = U.rgba(color, 0.3); ctx.fillRect(px + 28, 72, 56, 5);
      ctx.fillStyle = color; ctx.fillRect(px + 28, 72, 56 * Math.min(1, f / max), 5);
      px += 100;
    }

    // Owned upgrades (bottom-left), dash shows readiness.
    // (On touch screens they sit under the HUD, away from the buttons.)
    let ux = Input.touchMode ? px : 14;
    const uy = Input.touchMode ? 54 : VIEW_H - 40;
    // Abilities that recharge (UPGRADE_INFO[k].hud): icon, short label, recharge sweep.
    const uyy = Input.touchMode ? uy : uy - 12;
    for (const k of Object.keys(UPGRADE_INFO)) {
      const inf = UPGRADE_INFO[k];
      if (!inf.hud || !p.has(k) || (k === "dash" && p.has("dataDash"))) continue;
      const cool = p.abilityCooldown(world, k), active = (k === "sudo" && p.sudo > 0);
      const color = active ? "#fcaf3e" : cool > 0 ? "#6a5a2a" : "#ffd23d";
      this.panel(ctx, ux, uyy, 34, 40, color, 0.5);
      PowerIcon(ctx, k, ux + 17, uyy + 14, color);
      if (cool > 0) {
        ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(ux + 3, uyy + 3, 28, 24 * cool);
      }
      this.text(ctx, inf.hud, ux + 17, uyy + 36, { size: 9, align: "center", color });
      ux += 38;
    }

    // Current weapon: icon, name, charges.
    const wd = p.weaponDef && p.weaponDef();
    if (wd) {
      const name = p.weapons[p.weaponIdx];
      const wy = Input.touchMode ? 100 : uy;
      const wx = Input.touchMode ? 14 : ux;
      this.panel(ctx, wx, wy, 112, 28, wd.color, 0.55);
      if (wd.icon) wd.icon(ctx, wx + 14, wy + 14, p.shootCool <= 0 ? wd.color : U.mix(wd.color, "#000000", 0.5));
      this.text(ctx, wd.label, wx + 28, wy + 13, { size: 11, color: wd.color });
      if (wd.ammo != null) {
        for (let i = 0; i < wd.ammo; i++) {
          const pw = 76 / wd.ammo - 2, x = wx + 28 + i * (76 / wd.ammo);
          ctx.fillStyle = i < p.ammo[name] ? wd.color : U.rgba(wd.color, 0.2);
          ctx.fillRect(x, wy + 18, pw, 4);
          // The charge being refilled fills up as it recharges.
          if (i === Math.floor(p.ammo[name]) && wd.regen) { ctx.fillStyle = U.rgba(wd.color, 0.7); ctx.fillRect(x, wy + 18, pw * (p.ammoT[name] / wd.regen), 4); }
        }
      } else this.text(ctx, "∞", wx + 28, wy + 24, { size: 11, color: U.rgba(wd.color, 0.7) });
      if (p.weapons.length > 1) this.text(ctx, `${p.weaponIdx + 1}/${p.weapons.length}`, wx + 106, wy + 13, { size: 10, align: "right", color: "#7f9fc0", weight: "normal" });
    }
    this.drawBossBar(ctx, world);
    this.drawExitMarker(ctx, world);
    if (typeof MiniMap !== "undefined") MiniMap.draw(ctx, world);
  },

  /** When the exit is off screen, an arrow at the screen edge points to it. */
  drawExitMarker(ctx, world) {
    if (world._exit === undefined) world._exit = world.entities.find((e) => e.name === "exit") || null;
    const e = world._exit;
    if (!e || world.onScreen(e, 0) || world.state !== "play") return;
    const cam = world.camera, cx = VIEW_W / 2, cy = VIEW_H / 2;
    const dx = U.cx(e) - cam.x - cx, dy = U.cy(e) - cam.y - cy;
    const k = Math.min((VIEW_W / 2 - 50) / Math.abs(dx || 1e-6), (VIEW_H / 2 - 110) / Math.abs(dy || 1e-6));
    const x = cx + dx * k, y = cy + dy * k + 20, a = Math.atan2(dy, dx);
    const col = world.bossesAlive() ? "#ff3355" : "#7dff4a";
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.translate(x, y);
    ctx.fillStyle = col;
    ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, -9); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 0.75;
    this.text(ctx, "EXIT", x - Math.cos(a) * 22, y - Math.sin(a) * 22 + 4, { size: 10, align: "center", color: col });
    ctx.globalAlpha = 1;
  },

  /** Thin boss health bar at the top centre, name above — clear of the action. */
  drawBossBar(ctx, world) {
    const b = world.boss;
    if (!b || b.dead || b.mode === "sleep") return;
    const w = 360, x = VIEW_W / 2 - w / 2, y = 66;
    this.text(ctx, b.title || "BOSS", VIEW_W / 2, y - 6, { size: 12, align: "center", color: "#ffb3f6" });
    ctx.fillStyle = "rgba(42,15,46,0.85)"; ctx.fillRect(x, y, w, 5);
    ctx.fillStyle = b.flash ? "#ffffff" : "#ff3df0";
    ctx.fillRect(x, y, w * Math.max(0, b.hp / b.maxHp), 5);
  },

  drawHint(ctx, world) {
    const h = world.hint;
    if (h) {
      const a = Math.min(1, h.t / 20, (h.max - h.t) / 10 + 0.2);
      ctx.globalAlpha = a;
      const txt = this.keys(h.text);
      ctx.font = `bold 15px ${FONT}`;
      const lines = this.wrap(ctx, txt, 520).slice(0, 3);
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 36, hh = 14 + lines.length * 20;
      this.panel(ctx, VIEW_W / 2 - w / 2, 92, w, hh, world.theme.accent, 0.82);
      lines.forEach((l, i) => this.text(ctx, l, VIEW_W / 2, 113 + i * 20, { size: 15, align: "center" }));
      ctx.globalAlpha = 1;
    }
    const bn = world.banner;
    if (bn) {
      const a = Math.min(1, bn.t / 30, (bn.max - bn.t) / 15);
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(4,6,18,0.55)";
      ctx.fillRect(0, 200, VIEW_W, 100);
      ctx.fillStyle = bn.color;
      ctx.fillRect(0, 200, VIEW_W, 2); ctx.fillRect(0, 298, VIEW_W, 2);
      this.text(ctx, bn.text, VIEW_W / 2, 258, { size: 40, align: "center", glow: bn.color });
      if (bn.sub) this.text(ctx, bn.sub, VIEW_W / 2, 286, { size: 14, align: "center", color: U.rgba(bn.color, 0.9) });
      ctx.globalAlpha = 1;
    }
  },
};

/**
 * Vertical keyboard/mouse/touch menu.
 * items: [{ label, action, disabled, hint }]
 */
class Menu {
  constructor(items, opts = {}) {
    this.items = items;
    this.sel = items.findIndex((i) => !i.disabled);
    if (this.sel < 0) this.sel = 0;
    this.rects = [];
    this.opts = opts;
  }
  /** Returns the chosen item's action (or null). */
  update() {
    const n = this.items.length;
    const step = (d) => {
      for (let k = 0; k < n; k++) {
        this.sel = (this.sel + d + n) % n;
        if (!this.items[this.sel].disabled) break;
      }
    };
    if (Input.menuPressed("up")) { step(-1); sfx.play("menu"); }
    if (Input.menuPressed("down")) { step(1); sfx.play("menu"); }
    if (Input.menuPressed("confirm") && !this.items[this.sel].disabled) {
      sfx.play("menuConfirm");
      return this.items[this.sel].action;
    }
    for (const c of Input.clicks) {
      this.rects.forEach((r, i) => {
        if (c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h && !this.items[i].disabled) {
          this.sel = i;
          this.clicked = this.items[i].action;
        }
      });
    }
    if (this.clicked) { const a = this.clicked; this.clicked = null; sfx.play("menuConfirm"); return a; }
    return null;
  }
  draw(ctx, cx, y, time, accent = "#00f0ff") {
    const w = this.opts.width || 320, h = this.opts.compact ? 32 : 40, gap = this.opts.compact ? 6 : 10;
    this.rects = [];
    this.items.forEach((it, i) => {
      const x = cx - w / 2, yy = y + i * (h + gap);
      this.rects.push({ x, y: yy, w, h });
      const on = i === this.sel;
      ctx.fillStyle = on ? U.rgba(accent, 0.18) : "rgba(8,12,30,0.7)";
      U.roundRect(ctx, x, yy, w, h, 6); ctx.fill();
      ctx.strokeStyle = on ? accent : U.rgba(accent, 0.25);
      ctx.lineWidth = on ? 2 : 1;
      ctx.stroke();
      if (on) {
        ctx.fillStyle = accent;
        const o = Math.sin(time * 0.15) * 3;
        const m = h / 2;
        ctx.beginPath(); ctx.moveTo(x + 14 + o, yy + m - 7); ctx.lineTo(x + 22 + o, yy + m); ctx.lineTo(x + 14 + o, yy + m + 7); ctx.fill();
      }
      UI.text(ctx, it.label, cx, yy + (this.opts.compact ? 22 : 26), {
        size: this.opts.compact ? 15 : 17, align: "center",
        color: it.disabled ? "#4a5a70" : on ? "#ffffff" : "#a8c8e0",
      });
    });
  }
}

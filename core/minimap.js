/* =========================================================================
 * core/minimap.js — small, semi-transparent mini map in the HUD corner.
 *
 * Built automatically from the level's tile map (no per-level work): each
 * level gets an offscreen canvas at 3 px per tile, and tiles are painted onto
 * it only once the camera has shown them — so the map shows exactly the parts
 * of the level already seen. Drawn on top: the player, the exit, checkpoints,
 * the boss arena and enemy dots (only inside explored parts).
 *
 * Toggle: 0 or ` (touch: MAP). The choice is saved (Save.data.settings.minimap).
 * Cost: a few hundred array checks every 4 frames plus one drawImage per frame.
 * ========================================================================= */
"use strict";

const MiniMap = {
  S: 3,                 // map pixels per tile
  W: 160, H: 92,        // window size on screen

  enabled() { return !(Save.data && Save.data.settings && Save.data.settings.minimap === false); },
  toggle(world) {
    if (!Save.data.settings) Save.data.settings = {};
    Save.data.settings.minimap = !this.enabled();
    Save.write();
    if (world) world.showHint(this.enabled() ? "MAP ON" : "MAP OFF", 1);
    sfx.play("menu");
  },

  /** Per-level state: which tiles were seen, and the painted canvas. */
  state(world) {
    if (world.mm) return world.mm;
    const mm = { seen: new Uint8Array(world.w * world.h), canvas: null, g: null };
    if (typeof document !== "undefined") {
      mm.canvas = document.createElement("canvas");
      mm.canvas.width = world.w * this.S; mm.canvas.height = world.h * this.S;
      mm.g = mm.canvas.getContext("2d");
    }
    return (world.mm = mm);
  },

  /** Reveal the tiles currently on screen (plus a small margin). */
  update(world) {
    if (Input.pressed("map")) this.toggle(world);
    if (world.time % 4) return;
    const mm = this.state(world), cam = world.camera, T = TILE, W = world.w;
    const c0 = Math.max(0, Math.floor(cam.x / T) - 1), c1 = Math.min(W - 1, Math.floor((cam.x + VIEW_W) / T) + 1);
    const r0 = Math.max(0, Math.floor(cam.y / T) - 1), r1 = Math.min(world.h - 1, Math.floor((cam.y + VIEW_H) / T) + 1);
    const g = mm.g, S = this.S, acc = world.theme.accent;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const i = r * W + c;
      if (mm.seen[i]) continue;
      mm.seen[i] = 1;
      if (!g) continue;
      const t = world.tiles[i];
      if (t === T_SOLID) { g.fillStyle = "rgba(200,225,255,0.85)"; g.fillRect(c * S, r * S, S, S); }
      else if (t === T_ONEWAY) { g.fillStyle = acc; g.fillRect(c * S, r * S, S, 1); }
      else { g.fillStyle = "rgba(255,255,255,0.07)"; g.fillRect(c * S, r * S, S, S); }
    }
  },

  seenAt(world, px, py) {
    const mm = world.mm;
    if (!mm) return false;
    const c = Math.floor(px / TILE), r = Math.floor(py / TILE);
    return c >= 0 && r >= 0 && c < world.w && r < world.h && mm.seen[r * world.w + c] === 1;
  },

  draw(ctx, world) {
    if (!this.enabled() || !world.mm || !world.mm.canvas) return;
    const mm = world.mm, S = this.S, W = this.W, H = this.H;
    const x0 = Input.touchMode ? VIEW_W - 248 : VIEW_W - 172, y0 = 54;
    const p = world.player;
    const mw = world.w * S, mh = world.h * S;
    // Window centred on the player, kept inside the map.
    const sx = mw <= W ? (mw - W) / 2 : U.clamp((U.cx(p) / TILE) * S - W / 2, 0, mw - W);
    const sy = mh <= H ? (mh - H) / 2 : U.clamp((U.cy(p) / TILE) * S - H / 2, 0, mh - H);
    const toX = (px) => x0 - sx + (px / TILE) * S, toY = (py) => y0 - sy + (py / TILE) * S;

    ctx.save();
    ctx.fillStyle = "rgba(6,10,26,0.5)"; ctx.fillRect(x0, y0, W, H);
    ctx.strokeStyle = U.rgba(world.theme.accent, 0.4); ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, W - 1, H - 1);
    ctx.beginPath(); ctx.rect(x0 + 1, y0 + 1, W - 2, H - 2); ctx.clip();
    ctx.globalAlpha = 0.85;
    ctx.drawImage(mm.canvas, Math.round(x0 - sx), Math.round(y0 - sy));
    ctx.globalAlpha = 1;

    const inView = (x, y) => x >= x0 - 4 && x <= x0 + W + 4 && y >= y0 - 4 && y <= y0 + H + 4;
    for (const e of world.entities) {
      if (e.dead) continue;
      const cx = U.cx(e), cy = U.cy(e);
      const X = toX(cx), Y = toY(cy);
      if (!inView(X, Y) || !this.seenAt(world, cx, cy)) continue;
      if (e.enemy && !e.isBoss) { ctx.fillStyle = "#ff4d6d"; ctx.fillRect(X - 1, Y - 1, 2, 2); }
      else if (e.name === "checkpoint") { ctx.fillStyle = world.checkpoint.entity === e ? "#ffe14d" : "#a08a2a"; ctx.fillRect(X - 1.5, Y - 2, 3, 4); }
      else if (e.name === "exit") { ctx.fillStyle = world.bossesAlive() ? "#ff3355" : "#7dff4a"; ctx.fillRect(X - 2.5, Y - 3, 5, 6); }
      else if (e.isBoss) {
        ctx.strokeStyle = "#ff3df0"; ctx.lineWidth = 1;
        if (e.arena) ctx.strokeRect(toX(e.arena.x) + 0.5, toY(e.arena.y) + 0.5, (e.arena.w / TILE) * S, (e.arena.h / TILE) * S);
        ctx.fillStyle = "#ff3df0"; ctx.fillRect(X - 2.5, Y - 2.5, 5, 5);
      }
    }
    // The player (blinks).
    if (Math.floor(world.time / 15) % 4 !== 0) {
      ctx.fillStyle = "#00f0ff";
      ctx.fillRect(toX(U.cx(p)) - 1.5, toY(U.cy(p)) - 2, 3, 4);
    }
    ctx.restore();
  },
};

// The mini map toggle shows up on the Controls page automatically.
Guide.BASE_CONTROLS.push({ name: "MINI MAP ON/OFF", how: "{map}" });

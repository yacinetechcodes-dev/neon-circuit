/* =========================================================================
 * core/engine.js — main loop and game-state machine (title, level select,
 * play, pause, game over, level complete, victory).
 * ========================================================================= */
"use strict";

const Game = {
  state: "boot",
  world: null,
  levelIndex: 0,
  time: 0,
  menu: null,
  fade: 0,
  levelErrors: {},     // level index → [error strings]
  loadErrors: [],      // files that failed to load
  debug: typeof location !== "undefined" && /[?&]debug/.test(location.search),
  fps: 60, _fpsFrames: 0, _fpsTime: 0,

  isPlaying() { return this.state === "play"; },

  // ------------------------------------------------------------- boot
  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    Input.init(canvas);
    if (this.debug) Object.assign(Input.keyMap, { KeyG: "debugGod", KeyN: "debugNext" });
    Save.load();
    this.resize();
    window.addEventListener("resize", () => this.resize());
  },

  /** Called by the loader once every entity and level file has loaded. */
  start() {
    Registry.levels.forEach((def, i) => {
      const { errors } = LevelLoader.validate(def);
      if (errors.length) this.levelErrors[i] = errors;
    });
    const firstTheme = (Registry.levels[0] && Registry.levels[0].theme) || {};
    this.menuBg = new Background(Object.assign({ bgTop: "#050818", bgBottom: "#0a1a3a", accent: "#00f0ff", gridColor: "#0b3a5a", style: "boot" }, firstTheme), 3);
    this.setState("title");
    if (this.debug) this.debugStart();
    let last = performance.now(), acc = 0;
    const step = 1 / FPS;
    const frame = (now) => {
      acc += Math.min(0.25, (now - last) / 1000);
      // FPS meter.
      this._fpsFrames++; this._fpsTime += now - last;
      if (this._fpsTime > 500) { this.fps = Math.round((this._fpsFrames * 1000) / this._fpsTime); this._fpsFrames = 0; this._fpsTime = 0; }
      last = now;
      let n = 0;
      while (acc >= step && n < 5) {
        this.update();
        Input.endStep();
        acc -= step; n++;
      }
      if (n === 5) acc = 0; // way behind (tab was hidden) — drop the backlog
      this.draw();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  },

  resize() {
    const ww = window.innerWidth, wh = window.innerHeight;
    const scale = Math.min(ww / VIEW_W, wh / VIEW_H);
    const cssW = Math.floor(VIEW_W * scale), cssH = Math.floor(VIEW_H * scale);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.style.width = cssW + "px";
    this.canvas.style.height = cssH + "px";
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx.setTransform(this.canvas.width / VIEW_W, 0, 0, this.canvas.height / VIEW_H, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    if (Input.touchMode) Input.layoutButtons();
  },

  // ------------------------------------------------------------- states
  setState(s) {
    this.state = s;
    this.fade = 1;
    this.menu = null;
    const L = Registry.levels;
    switch (s) {
      case "title": {
        const started = Save.data.unlocked > 1 || Object.keys(Save.data.best).length > 0;
        const cont = Math.min(Save.data.unlocked, L.length) - 1;
        this.menu = new Menu([
          { label: started ? `CONTINUE  (LEVEL ${cont + 1})` : "START GAME", action: "continue" },
          { label: "LEVEL SELECT", action: "select" },
          { label: "CONTROLS", action: "controls" },
          { label: "RESET PROGRESS", action: "reset" },
        ]);
        break;
      }
      case "pause":
        this.menu = new Menu([
          { label: "RESUME", action: "resume" },
          { label: "RESTART FROM CHECKPOINT", action: "checkpoint" },
          { label: "RESTART LEVEL", action: "restart" },
          { label: this.soundLabel(), action: "mute" },
          { label: "LEVEL SELECT", action: "select" },
          { label: "QUIT TO TITLE", action: "title" },
        ], { width: 380 });
        break;
      case "gameover":
        this.menu = new Menu([
          { label: "RETRY FROM CHECKPOINT", action: "checkpoint" },
          { label: "RESTART LEVEL", action: "restart" },
          { label: "LEVEL SELECT", action: "select" },
          { label: "QUIT TO TITLE", action: "title" },
        ], { width: 380 });
        break;
      case "complete": {
        const last = this.levelIndex >= L.length - 1;
        this.menu = new Menu(last
          ? [{ label: "CONTINUE", action: "victory" }, { label: "REPLAY LEVEL", action: "restart" }]
          : [{ label: "NEXT LEVEL", action: "next" }, { label: "REPLAY LEVEL", action: "restart" }, { label: "LEVEL SELECT", action: "select" }],
          { width: 300 });
        break;
      }
      case "victory":
        this.menu = new Menu([{ label: "RETURN TO TITLE", action: "title" }]);
        break;
      case "reset":
        this.menu = new Menu([
          { label: "NO, KEEP MY PROGRESS", action: "title" },
          { label: "YES, ERASE EVERYTHING", action: "doReset" },
        ], { width: 380 });
        break;
      case "select":
        this.selIndex = U.clamp(this.selIndex == null ? Math.min(Save.data.unlocked, L.length) - 1 : this.selIndex, 0, Math.max(0, L.length - 1));
        this.cardRects = [];
        break;
    }
  },

  soundLabel() { return sfx.muted ? "SOUND: OFF  (M)" : "SOUND: ON  (M)"; },

  /** Mute toggle shared by the M key and the pause-menu button. */
  toggleMute() {
    const muted = sfx.toggleMute();
    if (this.menu) {
      const item = this.menu.items.find((i) => i.action === "mute");
      if (item) item.label = this.soundLabel();
    }
    if (this.state === "play" && this.world) this.world.showHint(muted ? "SOUND OFF" : "SOUND ON", 1.2);
  },

  isUnlocked(i) {
    return this.debug || i < Save.data.unlocked;
  },

  startLevel(index) {
    const def = Registry.levels[index];
    if (!def) { this.setState("title"); return; }
    if (this.levelErrors[index]) { this.selIndex = index; this.setState("select"); return; }
    // Upgrades: everything saved + everything earlier levels grant (so level
    // select can never put you in a level you lack the tools for).
    const ups = new Set(Save.data.upgrades);
    for (let i = 0; i < index; i++) for (const u of Registry.levels[i].unlocks || []) ups.add(u);
    this.levelIndex = index;
    this.world = new World(def, index, [...ups]);
    this.setState("play");
  },

  onPlayerDied() { this.setState("gameover"); },

  onLevelComplete(world) {
    const def = world.def;
    const stats = {
      time: world.levelTime / FPS, cores: world.cores, coresTotal: world.coresTotal,
      secrets: world.secrets, secretsTotal: world.secretsTotal, deaths: world.deaths,
    };
    const unlocks = (def.unlocks || []).concat(world.pickedUpgrades || []);
    const newUnlocks = unlocks.filter((u) => !Save.data.upgrades.includes(u));
    const isBest = Save.recordLevel(world.index, def.id, stats, unlocks);
    if (world.index >= Registry.levels.length - 1) { Save.data.finished = true; Save.write(); }
    this.completeInfo = { stats, newUnlocks, isBest, name: def.name };
    this.setState("complete");
  },

  doAction(a) {
    switch (a) {
      case "continue": this.startLevel(Math.min(Save.data.unlocked, Registry.levels.length) - 1); break;
      case "select": this.setState("select"); break;
      case "controls": this.setState("controls"); break;
      case "reset": this.setState("reset"); break;
      case "doReset": Save.reset(); this.selIndex = null; this.setState("title"); break;
      case "title": this.world = null; this.setState("title"); break;
      case "resume": this.state = "play"; break;
      case "checkpoint": this.world.respawn(true); this.state = "play"; break;
      case "restart": this.startLevel(this.levelIndex); break;
      case "next": this.startLevel(this.levelIndex + 1); break;
      case "victory": this.setState("victory"); break;
      case "mute": this.toggleMute(); break;
    }
  },

  // ------------------------------------------------------------- update
  update() {
    this.time++;
    if (this.fade > 0) this.fade = Math.max(0, this.fade - 0.06);
    if (Input.pressed("mute")) this.toggleMute();
    switch (this.state) {
      case "play": {
        if (Input.pressed("pause")) { this.setState("pause"); this.fade = 0; return; }
        if (this.debug) this.debugKeys();
        this.world.update();
        return;
      }
      case "select": return this.updateSelect();
      case "controls":
        if (Input.menuPressed("confirm") || Input.menuPressed("back") || Input.clicks.length) { sfx.play("menu"); this.setState("title"); }
        return;
      case "pause":
        if (Input.pressed("pause")) { this.state = "play"; return; }
        break;
      case "gameover": case "complete":
        if (this.world) { this.world.particles.update(); this.world.time++; }
        break;
    }
    if (this.menu) {
      const a = this.menu.update();
      if (a) this.doAction(a);
      else if (this.state === "reset" && Input.menuPressed("back")) this.setState("title");
    }
  },

  updateSelect() {
    const n = Registry.levels.length;
    const perRow = 5;
    const prev = this.selIndex;
    if (Input.menuPressed("left")) this.selIndex = (this.selIndex - 1 + n) % n;
    if (Input.menuPressed("right")) this.selIndex = (this.selIndex + 1) % n;
    if (Input.menuPressed("up")) this.selIndex = Math.max(0, this.selIndex - perRow);
    if (Input.menuPressed("down")) this.selIndex = Math.min(n - 1, this.selIndex + perRow);
    if (this.selIndex !== prev) sfx.play("menu");
    if (Input.menuPressed("back")) { sfx.play("menu"); this.setState("title"); return; }
    let go = Input.menuPressed("confirm");
    for (const c of Input.clicks) {
      if (this.backRect && c.x >= this.backRect.x && c.x <= this.backRect.x + this.backRect.w && c.y >= this.backRect.y && c.y <= this.backRect.y + this.backRect.h) {
        this.setState("title"); return;
      }
      this.cardRects.forEach((r, i) => {
        if (c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h) {
          if (this.selIndex === i || Input.touchMode) go = true;
          this.selIndex = i;
        }
      });
    }
    if (go && this.isUnlocked(this.selIndex) && !this.levelErrors[this.selIndex]) {
      sfx.play("menuConfirm");
      this.startLevel(this.selIndex);
    }
  },

  /** ?debug&level=3&x=120 → jump straight into level 3 at tile column 120. */
  debugStart() {
    const q = new URLSearchParams(location.search);
    if (q.has("touch")) { Input.touchMode = true; Input.layoutButtons(); } // preview touch UI
    const lv = parseInt(q.get("level"), 10);
    const col = parseInt(q.get("x"), 10);
    if (lv > 0) this.startLevel(lv - 1);
    if (lv > 0 && col >= 0 && this.world) {
      const w = this.world, p = w.player;
      // Find the first standable spot in that column (air above solid).
      for (let r = 1; r < w.h; r++) {
        if (Physics.solidAt(w, col, r) && !Physics.solidAt(w, col, r - 1)) {
          p.x = col * TILE + 6; p.y = r * TILE - p.h;
          break;
        }
      }
      w.checkpoint = { x: p.x, y: p.y, entity: null };
      w.camera.snap(p);
    }
    // &ff=N fast-forwards N frames (handy for screenshots).
    const ff = Math.min(6000, parseInt(q.get("ff"), 10) || 0);
    for (let i = 0; i < ff; i++) { this.update(); Input.endStep(); }
  },

  debugKeys() {
    const w = this.world, p = w.player;
    if (Input.pressed("debugGod")) { w.god = !w.god; w.showHint(w.god ? "GOD MODE ON" : "GOD MODE OFF", 1); }
    if (w.god) { p.invuln = Math.max(p.invuln, 2); p.hp = p.maxHp; }
    if (Input.pressed("debugNext")) {
      // Teleport to the next checkpoint / boss / exit to the right.
      const targets = w.entities
        .filter((e) => ["checkpoint", "exit", "warden", "mainframe"].includes(e.name) && e.x > p.x + 64)
        .sort((a, b) => a.x - b.x);
      const t = targets[0];
      if (t) { p.x = t.x - 40; p.y = t.y + t.h - p.h - 4; p.vx = p.vy = 0; w.camera.snap(p); }
    }
  },

  // ------------------------------------------------------------- draw
  draw() {
    const ctx = this.ctx;
    switch (this.state) {
      case "play": this.drawPlay(ctx); break;
      case "pause":
        this.drawPlay(ctx, true);
        this.dim(ctx, 0.6);
        UI.text(ctx, "PAUSED", VIEW_W / 2, 140, { size: 44, align: "center", glow: "#00f0ff" });
        this.menu.draw(ctx, VIEW_W / 2, 180, this.time);
        UI.text(ctx, UI.keys("{move} move   {jump} jump   {dash} dash   {shoot} fire"), VIEW_W / 2, 512, { size: 13, align: "center", color: "#7f9fc0", weight: "normal" });
        break;
      case "gameover":
        this.world.draw(ctx);
        this.dim(ctx, 0.65);
        UI.text(ctx, "SYSTEM FAILURE", VIEW_W / 2, 150, { size: 48, align: "center", color: "#ff4d6d", glow: "#ff3355" });
        UI.text(ctx, `Deaths this run: ${this.world.deaths}`, VIEW_W / 2, 186, { size: 15, align: "center", color: "#ffb3c0", weight: "normal" });
        this.menu.draw(ctx, VIEW_W / 2, 220, this.time, "#ff4d6d");
        break;
      case "complete": this.drawComplete(ctx); break;
      case "victory": this.drawVictory(ctx); break;
      case "select": this.drawMenuBg(ctx); this.drawSelect(ctx); break;
      case "controls": this.drawMenuBg(ctx); this.drawControls(ctx); break;
      case "reset":
        this.drawMenuBg(ctx);
        UI.text(ctx, "ERASE ALL PROGRESS?", VIEW_W / 2, 200, { size: 32, align: "center", color: "#ff4d6d", glow: "#ff3355" });
        this.menu.draw(ctx, VIEW_W / 2, 250, this.time, "#ff4d6d");
        break;
      case "title": this.drawMenuBg(ctx); this.drawTitle(ctx); break;
      default:
        ctx.fillStyle = "#050818"; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        UI.text(ctx, "LOADING…", VIEW_W / 2, VIEW_H / 2, { align: "center" });
    }
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(5,8,24,${this.fade})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.debug) UI.text(ctx, `${this.fps} FPS${this.world && this.world.god ? "  GOD" : ""}`, VIEW_W - 12, VIEW_H - 10, { size: 12, align: "right", color: "#7dff4a" });
  },

  drawPlay(ctx, paused) {
    const w = this.world;
    w.draw(ctx);
    if (!paused) {
      UI.drawHUD(ctx, w);
      UI.drawBossBarTouch(ctx, w);
      UI.drawHint(ctx, w);
      Input.drawTouch(ctx);
    }
  },

  dim(ctx, a) {
    ctx.fillStyle = `rgba(3,5,16,${a})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  },

  drawMenuBg(ctx) {
    const cam = { x: this.time * 0.8, y: 0 };
    this.menuBg.draw(ctx, cam, this.time);
    // Perspective floor grid.
    ctx.strokeStyle = "rgba(0,240,255,0.18)";
    ctx.lineWidth = 1;
    const hy = 360;
    ctx.beginPath();
    for (let i = -20; i <= 20; i++) { ctx.moveTo(VIEW_W / 2 + i * 20, hy); ctx.lineTo(VIEW_W / 2 + i * 140, VIEW_H); }
    for (let k = 0; k < 10; k++) {
      const t = ((k + (this.time * 0.02) % 1) / 10);
      const y = hy + (VIEW_H - hy) * t * t;
      ctx.moveTo(0, y); ctx.lineTo(VIEW_W, y);
    }
    ctx.stroke();
  },

  drawTitle(ctx) {
    const t = this.time;
    UI.text(ctx, "NEON", VIEW_W / 2, 118, { size: 74, align: "center", color: "#e6fdff", glow: "#00f0ff" });
    UI.text(ctx, "CIRCUIT", VIEW_W / 2, 186, { size: 74, align: "center", color: "#ffd6fb", glow: "#ff3df0" });
    // Scanline sweep over the logo.
    const sy = 60 + ((t * 2) % 160);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(VIEW_W / 2 - 220, sy, 440, 3);
    UI.text(ctx, "A DATA-STREAM PLATFORMER", VIEW_W / 2, 216, { size: 14, align: "center", color: "#7fb8d8", weight: "normal" });
    this.menu.draw(ctx, VIEW_W / 2, 250, t);
    // Little robot mascot idling on the left.
    const bx = 170, by = 420 + Math.sin(t * 0.05) * 4;
    U.glow(ctx, bx, by, 60, "#00c8ff", 0.4);
    ctx.fillStyle = "#14203c"; U.roundRect(ctx, bx - 24, by - 30, 48, 56, 10); ctx.fill();
    ctx.strokeStyle = "#00f0ff"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "#00f0ff"; ctx.fillRect(bx - 16, by - 16, 32, 8);
    const loadErr = this.loadErrors.length;
    const lvlErr = Object.keys(this.levelErrors).length;
    if (loadErr || lvlErr) {
      UI.text(ctx, `⚠ ${loadErr} file(s) failed to load, ${lvlErr} level(s) invalid — see browser console (F12)`, VIEW_W / 2, VIEW_H - 16, { size: 12, align: "center", color: "#ff4d6d", weight: "normal" });
    } else {
      UI.text(ctx, "v1.0  ·  progress saves automatically", VIEW_W / 2, VIEW_H - 16, { size: 12, align: "center", color: "#4f6f8f", weight: "normal" });
    }
  },

  drawControls(ctx) {
    UI.text(ctx, "CONTROLS", VIEW_W / 2, 80, { size: 36, align: "center", glow: "#00f0ff" });
    UI.panel(ctx, 160, 110, 640, 330);
    const rows = [
      ["MOVE", "← → / A D"],
      ["JUMP", "SPACE / ↑ / W / Z  (hold = higher)"],
      ["WALL-JUMP", "jump while sliding on a wall"],
      ["DROP DOWN", "↓ + JUMP on thin platforms"],
      ["DASH", "SHIFT / X  (unlocked in level 2)"],
      ["PULSE SHOT", "F / C / J  (unlocked in level 3)"],
      ["PAUSE / MUTE", "ESC / P  ·  M toggles sound"],
      ["TOUCH", "on-screen buttons appear on touch devices"],
    ];
    rows.forEach(([a, b], i) => {
      UI.text(ctx, a, 200, 150 + i * 36, { size: 16, color: "#00f0ff" });
      UI.text(ctx, b, 380, 150 + i * 36, { size: 16, weight: "normal" });
    });
    UI.text(ctx, "Stomp most robots. Some need a different tactic — watch them!", VIEW_W / 2, 470, { size: 14, align: "center", color: "#ffd23d", weight: "normal" });
    UI.text(ctx, "Press ENTER / ESC or tap to go back", VIEW_W / 2, 505, { size: 13, align: "center", color: "#7f9fc0", weight: "normal" });
  },

  drawSelect(ctx) {
    const L = Registry.levels;
    UI.text(ctx, "LEVEL SELECT", VIEW_W / 2, 70, { size: 34, align: "center", glow: "#00f0ff" });
    const perRow = 5, cw = 164, ch = 220, gap = 16;
    const rowsN = Math.ceil(L.length / perRow);
    const totalW = Math.min(L.length, perRow) * (cw + gap) - gap;
    const x0 = VIEW_W / 2 - totalW / 2, y0 = rowsN > 1 ? 100 : 130;
    this.cardRects = [];
    L.forEach((def, i) => {
      const x = x0 + (i % perRow) * (cw + gap), y = y0 + Math.floor(i / perRow) * (ch + gap);
      this.cardRects.push({ x, y, w: cw, h: ch });
      const unlocked = this.isUnlocked(i), sel = i === this.selIndex, bad = this.levelErrors[i];
      const acc = bad ? "#ff4d6d" : (def.theme && def.theme.accent) || "#00f0ff";
      ctx.fillStyle = sel ? U.rgba(acc, 0.16) : "rgba(8,12,30,0.8)";
      U.roundRect(ctx, x, y, cw, ch, 10); ctx.fill();
      ctx.strokeStyle = sel ? acc : U.rgba(acc, 0.3); ctx.lineWidth = sel ? 3 : 1; ctx.stroke();
      // Mini theme swatch.
      const g = ctx.createLinearGradient(0, y + 10, 0, y + 80);
      g.addColorStop(0, (def.theme && def.theme.bgTop) || "#050818");
      g.addColorStop(1, (def.theme && def.theme.bgBottom) || "#0a1a3a");
      ctx.fillStyle = g; ctx.fillRect(x + 10, y + 10, cw - 20, 70);
      ctx.fillStyle = acc; ctx.fillRect(x + 10, y + 78, cw - 20, 2);
      UI.text(ctx, String(i + 1).padStart(2, "0"), x + cw / 2, y + 60, { size: 34, align: "center", color: unlocked ? "#ffffff" : "#33445a" });
      UI.text(ctx, def.name.toUpperCase(), x + cw / 2, y + 106, { size: 13, align: "center", color: unlocked ? acc : "#4a5a70" });
      if (bad) {
        UI.text(ctx, "INVALID LEVEL", x + cw / 2, y + 140, { size: 12, align: "center", color: "#ff4d6d" });
        UI.text(ctx, "see console (F12)", x + cw / 2, y + 160, { size: 11, align: "center", color: "#ff9db0", weight: "normal" });
      } else if (!unlocked) {
        UI.text(ctx, "LOCKED", x + cw / 2, y + 150, { size: 14, align: "center", color: "#4a5a70" });
      } else {
        const b = Save.data.best[def.id];
        if (b) {
          UI.text(ctx, `TIME  ${U.fmtTime(b.time)}`, x + 14, y + 140, { size: 12, color: "#a8c8e0", weight: "normal" });
          UI.text(ctx, `CORES ${b.cores}/${b.coresTotal}`, x + 14, y + 160, { size: 12, color: "#a8c8e0", weight: "normal" });
          UI.text(ctx, `SECRET ${b.secrets}/${b.secretsTotal}`, x + 14, y + 180, { size: 12, color: "#ffe9a0", weight: "normal" });
          UI.text(ctx, `DEATHS ${b.deaths}`, x + 14, y + 200, { size: 12, color: "#ffb3c0", weight: "normal" });
        } else {
          UI.text(ctx, "NOT CLEARED", x + cw / 2, y + 150, { size: 12, align: "center", color: "#7f9fc0" });
        }
      }
    });
    const by = y0 + rowsN * (ch + gap) + 10;
    this.backRect = { x: VIEW_W / 2 - 80, y: by, w: 160, h: 36 };
    UI.panel(ctx, this.backRect.x, by, 160, 36);
    UI.text(ctx, "◀ BACK", VIEW_W / 2, by + 24, { size: 15, align: "center" });
    UI.text(ctx, Input.touchMode ? "Tap a level to play" : "← → choose · ENTER play · ESC back", VIEW_W / 2, VIEW_H - 18, { size: 13, align: "center", color: "#7f9fc0", weight: "normal" });
  },

  drawComplete(ctx) {
    this.world.draw(ctx);
    this.dim(ctx, 0.7);
    const info = this.completeInfo, s = info.stats;
    UI.text(ctx, "SECTOR CLEARED", VIEW_W / 2, 92, { size: 44, align: "center", color: "#d8ffcc", glow: "#7dff4a" });
    UI.text(ctx, info.name.toUpperCase(), VIEW_W / 2, 122, { size: 15, align: "center", color: "#7dff4a" });
    UI.panel(ctx, VIEW_W / 2 - 220, 140, 440, 150, "#7dff4a");
    const rows = [
      ["TIME", U.fmtTime(s.time) + (info.isBest ? "   NEW BEST!" : "")],
      ["ENERGY CORES", `${s.cores} / ${s.coresTotal}` + (s.cores === s.coresTotal && s.coresTotal ? "   ALL!" : "")],
      ["SECRET CORES", `${s.secrets} / ${s.secretsTotal}`],
      ["DEATHS", String(s.deaths)],
    ];
    rows.forEach(([a, b], i) => {
      UI.text(ctx, a, VIEW_W / 2 - 196, 174 + i * 32, { size: 16, color: "#7dff4a" });
      UI.text(ctx, b, VIEW_W / 2 + 196, 174 + i * 32, { size: 16, align: "right" });
    });
    let y = 312;
    for (const u of info.newUnlocks) {
      const inf = UPGRADE_INFO[u] || { name: u, how: "" };
      UI.text(ctx, `UPGRADE UNLOCKED: ${inf.name}`, VIEW_W / 2, y, { size: 18, align: "center", color: "#ffd23d", glow: "#ffd23d" });
      UI.text(ctx, UI.keys(inf.how), VIEW_W / 2, y + 20, { size: 13, align: "center", color: "#ffe9a0", weight: "normal" });
      y += 46;
    }
    this.menu.draw(ctx, VIEW_W / 2, Math.max(y + 4, 350), this.time, "#7dff4a");
  },

  drawVictory(ctx) {
    this.drawMenuBg(ctx);
    const t = this.time;
    for (let i = 0; i < 3; i++) U.glow(ctx, VIEW_W / 2 + Math.sin(t * 0.02 + i * 2) * 200, 180 + Math.cos(t * 0.03 + i) * 40, 120, ["#00f0ff", "#ff3df0", "#7dff4a"][i], 0.3);
    UI.text(ctx, "MAINFRAME LIBERATED", VIEW_W / 2, 110, { size: 46, align: "center", color: "#ffffff", glow: "#00f0ff" });
    UI.text(ctx, "The grid hums quietly again. UNIT-01 powers down, mission complete.", VIEW_W / 2, 150, { size: 15, align: "center", color: "#a8c8e0", weight: "normal" });
    let time = 0, cores = 0, coresT = 0, sec = 0, secT = 0, deaths = 0;
    for (const def of Registry.levels) {
      const b = Save.data.best[def.id];
      if (!b) continue;
      time += b.time; cores += b.cores; coresT += b.coresTotal; sec += b.secrets; secT += b.secretsTotal; deaths += b.deaths;
    }
    UI.panel(ctx, VIEW_W / 2 - 220, 180, 440, 140, "#00f0ff");
    [["TOTAL BEST TIME", U.fmtTime(time)], ["CORES", `${cores} / ${coresT}`], ["SECRETS", `${sec} / ${secT}`], ["FEWEST DEATHS", String(deaths)]]
      .forEach(([a, b], i) => {
        UI.text(ctx, a, VIEW_W / 2 - 196, 212 + i * 30, { size: 16, color: "#00f0ff" });
        UI.text(ctx, b, VIEW_W / 2 + 196, 212 + i * 30, { size: 16, align: "right" });
      });
    if (sec < secT) UI.text(ctx, "Some secret cores are still hidden behind suspicious walls…", VIEW_W / 2, 346, { size: 13, align: "center", color: "#ffd23d", weight: "normal" });
    this.menu.draw(ctx, VIEW_W / 2, 370, t);
  },
};

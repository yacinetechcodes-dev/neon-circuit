/* =========================================================================
 * core/engine.js — main loop and game-state machine
 * (title, world select, level select, play, pause, game over, level
 * complete, victory).
 *
 * Structure: worlds (worlds/*.js) contain levels (levels/worldNN/*.js).
 * A world unlocks when the previous world's boss level is beaten.
 * ========================================================================= */
"use strict";

// Entity types every world may use without listing them.
const ALWAYS_ALLOWED = ["core", "secretCore", "checkpoint", "exit", "powerup", "upgrade", "weapon", "fakeWall", "gate"];

const Game = {
  state: "boot",
  world: null,         // the running level (class World)
  worldIndex: 0,       // which world (index into Registry.worlds)
  levelIndex: 0,       // which level inside that world
  time: 0,
  menu: null,
  fade: 0,
  levelErrors: {},     // "worldIndex:levelIndex" → [error strings]
  worldErrors: {},     // worldIndex → [error strings]
  loadErrors: [],      // files that failed to load
  debug: typeof location !== "undefined" && /[?&]debug/.test(location.search),
  fps: 60, _fpsFrames: 0, _fpsTime: 0,

  isPlaying() { return this.state === "play"; },
  worlds() { return Registry.worlds; },
  worldDef(wi = this.worldIndex) { return Registry.worlds[wi]; },
  levelsOf(wi = this.worldIndex) { const w = Registry.worlds[wi]; return w ? w.levelDefs : []; },

  // ------------------------------------------------------------- boot
  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    Input.init(canvas);
    if (this.debug) Object.assign(Input.keyMap, { F9: "debugGod", F10: "debugNext" });
    Save.load();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("orientationchange", () => setTimeout(() => this.resize(), 200));
  },

  /** Called by the loader once every entity, world and level file has loaded. */
  start() {
    this.validateWorlds();
    this.repairProgress();
    const w0 = Registry.worlds[0];
    const firstTheme = Object.assign({}, (w0 && w0.theme) || {}, (w0 && w0.levelDefs[0] && w0.levelDefs[0].theme) || {});
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

  /** A world counts as beaten if its boss level was ever cleared (repairs saves
   *  made while a world file used an older format and the win wasn't recorded). */
  repairProgress() {
    let changed = false;
    for (const w of Registry.worlds) {
      const li = w.boss && w.boss.level ? (w.levels || []).indexOf(w.boss.level) : -1;
      const def = li >= 0 ? w.levelDefs[li] : null;
      if (def && Save.best(w.id, def.id) && !Save.world(w.id).bossBeaten) { Save.world(w.id).bossBeaten = true; changed = true; }
    }
    if (changed) Save.write();
  },

  /** Validate every world and level; log clear errors / warnings. */
  validateWorlds() {
    Registry.worlds.forEach((w, wi) => {
      const tag = `[world ${w.id} "${w.name}"]`;
      const errs = [];
      if (!w.levels || !w.levels.length) errs.push("lists no levels.");
      if (w.levelDefs.length !== (w.levels || []).length) errs.push(`expected ${(w.levels || []).length} levels, loaded ${w.levelDefs.length} (see loader errors).`);
      if (w.boss && w.boss.level && !(w.levels || []).includes(w.boss.level)) errs.push(`boss level "${w.boss.level}" is not in its levels list.`);
      for (const e of errs) console.error(`${tag} ERROR: ${e}`);
      if (errs.length) this.worldErrors[wi] = errs;
      const allowed = new Set(ALWAYS_ALLOWED.concat(w.enemies || [], w.hazards || [], w.boss && w.boss.entity ? [w.boss.entity] : []));
      w.levelDefs.forEach((def, li) => {
        const { errors } = LevelLoader.validate(def);
        if (errors.length) { this.levelErrors[wi + ":" + li] = errors; return; }
        // Types the level uses but its world doesn't list (warning only).
        const used = new Set(LevelLoader.parse(def).spawns.map((s) => s.name));
        const extra = [...used].filter((n) => !allowed.has(n));
        if (extra.length && (w.enemies || w.hazards)) console.warn(`${tag} level "${def.name}" uses types not listed by the world: ${extra.join(", ")}`);
      });
    });
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

  // ------------------------------------------------------------- progress
  worldUnlocked(wi) {
    if (this.debug || wi === 0) return true;
    const prev = Registry.worlds[wi - 1];
    return !!(prev && Save.world(prev.id).bossBeaten);
  },
  levelUnlocked(wi, li) {
    const w = Registry.worlds[wi];
    return this.debug || (!!w && this.worldUnlocked(wi) && li < Save.world(w.id).unlocked);
  },
  /** Furthest playable spot: last unlocked world, its last unlocked level. */
  furthest() {
    let wi = 0;
    for (let i = 0; i < Registry.worlds.length; i++) if (this.worldUnlocked(i)) wi = i;
    const w = Registry.worlds[wi];
    const n = w ? w.levelDefs.length : 1;
    return { wi, li: w ? Math.max(0, Math.min(Save.world(w.id).unlocked, n) - 1) : 0 };
  },
  isBossLevel(wi, li) {
    const w = Registry.worlds[wi];
    return !!(w && w.boss && w.boss.level === (w.levels || [])[li]);
  },

  /** Abilities for a level: saved + earlier worlds' + earlier levels' in this world. */
  abilitiesFor(wi, li) {
    const ups = new Set(Save.data.upgrades);
    for (let i = 0; i < wi; i++) for (const a of Registry.worlds[i].abilities || []) ups.add(a);
    this.levelsOf(wi).slice(0, li).forEach((d) => (d.unlocks || []).forEach((u) => ups.add(u)));
    return [...ups];
  },
  /** Weapons for a level: saved + rewards of everything before it. */
  weaponsFor(wi, li) {
    const ws = new Set(Save.data.weapons);
    const rewards = (w, upto) => {
      const r = (w.weapons && w.weapons.rewards) || {};
      ((w.weapons && w.weapons.start) || []).forEach((x) => ws.add(x));
      (w.levels || []).slice(0, upto).forEach((f) => (r[f] || []).forEach((x) => ws.add(x)));
    };
    for (let i = 0; i < wi; i++) rewards(Registry.worlds[i], Infinity);
    rewards(Registry.worlds[wi], li);
    return [...ws];
  },

  // ------------------------------------------------------------- states
  setState(s) {
    this.state = s;
    this.fade = 1;
    this.menu = null;
    switch (s) {
      case "title": {
        const started = Object.keys(Save.data.best).length > 0;
        const f = this.furthest();
        const label = Registry.worlds.length > 1 ? `CONTINUE  ${f.wi + 1}-${f.li + 1}` : `CONTINUE  ${f.li + 1}`;
        this.menu = new Menu([
          { label: started ? label : "START", action: "continue" },
          { label: "WORLDS", action: "worlds" },
          { label: "CONTROLS", action: "controls" },
          { label: "RESET", action: "reset" },
        ]);
        break;
      }
      case "pause":
        this.menu = new Menu([
          { label: "RESUME", action: "resume" },
          { label: "CHECKPOINT", action: "checkpoint" },
          { label: "RESTART", action: "restart" },
          { label: this.soundLabel(), action: "mute" },
          ...(Input.touchMode && document.fullscreenEnabled ? [{ label: document.fullscreenElement ? "EXIT FULLSCREEN" : "FULLSCREEN", action: "fullscreen" }] : []),
          { label: "LEVELS", action: "select" },
          { label: "QUIT", action: "title" },
        ], { width: 300 });
        break;
      case "gameover":
        this.menu = new Menu([
          { label: "RETRY", action: "restart" },
          { label: "LEVELS", action: "select" },
          { label: "QUIT", action: "title" },
        ], { width: 300 });
        break;
      case "complete": {
        const lastInWorld = this.levelIndex >= this.levelsOf().length - 1;
        const nextWorld = Registry.worlds[this.worldIndex + 1];
        let items;
        if (!lastInWorld) items = [{ label: "NEXT", action: "next" }, { label: "REPLAY", action: "restart" }, { label: "LEVELS", action: "select" }];
        else if (nextWorld && this.worldUnlocked(this.worldIndex + 1)) items = [{ label: "NEXT WORLD", action: "nextWorld" }, { label: "REPLAY", action: "restart" }, { label: "WORLDS", action: "worlds" }];
        else items = [{ label: "CONTINUE", action: nextWorld ? "worlds" : "victory" }, { label: "REPLAY", action: "restart" }];
        this.menu = new Menu(items, { width: 300 });
        break;
      }
      case "victory":
        this.menu = new Menu([{ label: "TITLE", action: "title" }]);
        break;
      case "reset":
        this.menu = new Menu([
          { label: "NO", action: "title" },
          { label: "ERASE", action: "doReset" },
        ], { width: 240 });
        break;
      case "worlds":
        this.selIndex = U.clamp(this.worldSel == null ? this.furthest().wi : this.worldSel, 0, Math.max(0, Registry.worlds.length - 1));
        this.cardRects = [];
        break;
      case "select": {
        const n = this.levelsOf().length;
        const f = this.furthest();
        const def = f.wi === this.worldIndex ? f.li : 0;
        this.selIndex = U.clamp(this.levelSel == null ? def : this.levelSel, 0, Math.max(0, n - 1));
        this.cardRects = [];
        break;
      }
    }
  },

  soundLabel() { return sfx.muted ? "SOUND OFF" : "SOUND ON"; },

  /** Mute toggle shared by the M key and the pause-menu button. */
  toggleMute() {
    const muted = sfx.toggleMute();
    if (this.menu) {
      const item = this.menu.items.find((i) => i.action === "mute");
      if (item) item.label = this.soundLabel();
    }
    if (this.state === "play" && this.world) this.world.showHint(muted ? "SOUND OFF" : "SOUND ON", 1.2);
  },

  startLevel(wi, li) {
    const wdef = Registry.worlds[wi];
    const def = wdef && wdef.levelDefs[li];
    if (!def) { this.setState("title"); return; }
    if (this.levelErrors[wi + ":" + li]) { this.worldIndex = wi; this.levelSel = li; this.setState("select"); return; }
    this.worldIndex = wi;
    this.levelIndex = li;
    this.levelSel = li;
    this.world = new World(def, li, this.abilitiesFor(wi, li), {
      worldDef: wdef,
      weapons: this.weaponsFor(wi, li),
      weapon: Save.data.weapon,
    });
    this.setState("play");
  },

  onPlayerDied() { this.setState("gameover"); },

  onLevelComplete(world) {
    const def = world.def, wdef = this.worldDef();
    const stats = {
      time: world.levelTime / FPS, cores: world.cores, coresTotal: world.coresTotal,
      secrets: world.secrets, secretsTotal: world.secretsTotal, deaths: world.deaths,
    };
    const unlocks = (def.unlocks || []).concat(world.pickedUpgrades || []);
    const file = (wdef.levels || [])[this.levelIndex];
    const weapons = (((wdef.weapons && wdef.weapons.rewards) || {})[file] || []).concat(world.pickedWeapons || []);
    const newUnlocks = unlocks.filter((u) => !Save.data.upgrades.includes(u));
    const newWeapons = weapons.filter((w) => !Save.data.weapons.includes(w));
    const bossBeaten = this.isBossLevel(this.worldIndex, this.levelIndex);
    const firstBossWin = bossBeaten && !Save.world(wdef.id).bossBeaten;
    const isBest = Save.recordLevel({ worldId: wdef.id, index: this.levelIndex, levelId: def.id, stats, unlocks, weapons, bossBeaten });
    this.completeInfo = { stats, newUnlocks, newWeapons, isBest, name: def.name, worldClear: firstBossWin };
    this.setState("complete");
  },

  /** Phones: fullscreen hides the browser bars (and lets us ask for landscape). */
  toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().then(() => {
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {});
      }).catch(() => {});
    } catch (e) { /* not supported */ }
    this.state = "play";
  },

  doAction(a) {
    switch (a) {
      case "continue": { const f = this.furthest(); this.startLevel(f.wi, f.li); break; }
      case "worlds": this.world = null; this.setState("worlds"); break;
      case "select": this.world = null; this.setState("select"); break;
      case "controls": this.setState("controls"); break;
      case "reset": this.setState("reset"); break;
      case "doReset": Save.reset(); this.worldSel = this.levelSel = null; this.setState("title"); break;
      case "title": this.world = null; this.setState("title"); break;
      case "resume": this.state = "play"; break;
      case "checkpoint": this.world.respawn(true); this.state = "play"; break;
      case "restart": this.startLevel(this.worldIndex, this.levelIndex); break;
      case "next": this.startLevel(this.worldIndex, this.levelIndex + 1); break;
      case "nextWorld": this.startLevel(this.worldIndex + 1, 0); break;
      case "victory": this.setState("victory"); break;
      case "mute": this.toggleMute(); break;
      case "fullscreen": this.toggleFullscreen(); break;
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
      case "worlds": return this.updateCards(Registry.worlds.length, {
        locked: (i) => !this.worldUnlocked(i) || !!this.worldErrors[i],
        pick: (i) => { this.worldSel = i; this.worldIndex = i; this.levelSel = null; this.setState("select"); },
        back: () => this.setState("title"),
      });
      case "select": return this.updateCards(this.levelsOf().length, {
        locked: (i) => !this.levelUnlocked(this.worldIndex, i) || !!this.levelErrors[this.worldIndex + ":" + i],
        pick: (i) => this.startLevel(this.worldIndex, i),
        back: () => this.setState("worlds"),
      });
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

  /** Shared keyboard / mouse / touch handling for card grids. */
  updateCards(n, h) {
    const perRow = 5;
    const prev = this.selIndex;
    if (n > 0) {
      if (Input.menuPressed("left")) this.selIndex = (this.selIndex - 1 + n) % n;
      if (Input.menuPressed("right")) this.selIndex = (this.selIndex + 1) % n;
      if (Input.menuPressed("up")) this.selIndex = Math.max(0, this.selIndex - perRow);
      if (Input.menuPressed("down")) this.selIndex = Math.min(n - 1, this.selIndex + perRow);
    }
    if (this.selIndex !== prev) sfx.play("menu");
    if (Input.menuPressed("back")) { sfx.play("menu"); h.back(); return; }
    let go = Input.menuPressed("confirm");
    for (const c of Input.clicks) {
      const r = this.backRect;
      if (r && c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h) { sfx.play("menu"); h.back(); return; }
      this.cardRects.forEach((cr, i) => {
        if (c.x >= cr.x && c.x <= cr.x + cr.w && c.y >= cr.y && c.y <= cr.y + cr.h) {
          if (this.selIndex === i || Input.touchMode) go = true;
          this.selIndex = i;
        }
      });
    }
    if (go && n > 0 && !h.locked(this.selIndex)) {
      sfx.play("menuConfirm");
      h.pick(this.selIndex);
    }
  },

  /** ?debug&level=3&x=120 (&world=1) → jump straight into a level at tile column 120. */
  debugStart() {
    const q = new URLSearchParams(location.search);
    if (q.has("touch")) { Input.touchMode = true; Input.layoutButtons(); } // preview touch UI
    if (q.has("select")) this.setState("select");
    if (q.has("worlds")) this.setState("worlds");
    const wi = (parseInt(q.get("world"), 10) || 1) - 1;
    const lv = parseInt(q.get("level"), 10);
    const col = parseInt(q.get("x"), 10);
    if (lv > 0) this.startLevel(wi, lv - 1);
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
        .filter((e) => (["checkpoint", "exit"].includes(e.name) || e.isBoss) && e.x > p.x + 64)
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
        break;
      case "gameover":
        this.world.draw(ctx);
        this.dim(ctx, 0.65);
        UI.text(ctx, "SYSTEM FAILURE", VIEW_W / 2, 150, { size: 48, align: "center", color: "#ff4d6d", glow: "#ff3355" });
        this.menu.draw(ctx, VIEW_W / 2, 220, this.time, "#ff4d6d");
        break;
      case "complete": this.drawComplete(ctx); break;
      case "victory": this.drawVictory(ctx); break;
      case "worlds": this.drawMenuBg(ctx); this.drawWorlds(ctx); break;
      case "select": this.drawMenuBg(ctx); this.drawSelect(ctx); break;
      case "controls": this.drawMenuBg(ctx); this.drawControls(ctx); break;
      case "reset":
        this.drawMenuBg(ctx);
        UI.text(ctx, "ERASE PROGRESS?", VIEW_W / 2, 200, { size: 32, align: "center", color: "#ff4d6d", glow: "#ff3355" });
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
    this.menu.draw(ctx, VIEW_W / 2, 250, t);
    // Little robot mascot idling on the left.
    const bx = 170, by = 420 + Math.sin(t * 0.05) * 4;
    U.glow(ctx, bx, by, 60, "#00c8ff", 0.4);
    ctx.fillStyle = "#14203c"; U.roundRect(ctx, bx - 24, by - 30, 48, 56, 10); ctx.fill();
    ctx.strokeStyle = "#00f0ff"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "#00f0ff"; ctx.fillRect(bx - 16, by - 16, 32, 8);
    const errs = this.loadErrors.length + Object.keys(this.levelErrors).length + Object.keys(this.worldErrors).length;
    if (errs) {
      UI.text(ctx, `⚠ ${errs} error(s) — see console`, VIEW_W / 2, VIEW_H - 16, { size: 12, align: "center", color: "#ff4d6d", weight: "normal" });
    }
  },

  drawControls(ctx) {
    UI.text(ctx, "CONTROLS", VIEW_W / 2, 80, { size: 36, align: "center", glow: "#00f0ff" });
    UI.panel(ctx, 240, 110, 480, 326);
    const rows = [
      ["MOVE", "← → / A D"],
      ["JUMP", "SPACE / ↑ / W / Z"],
      ["DROP", "↓ + JUMP"],
      ["DASH", "SHIFT / X"],
      ["FIRE", "F / C / J"],
      ["WEAPON", "Q / E / 1-9"],
      ["PAUSE", "ESC / P"],
      ["SOUND", "M"],
    ];
    rows.forEach(([a, b], i) => {
      UI.text(ctx, a, 290, 150 + i * 36, { size: 16, color: "#00f0ff" });
      UI.text(ctx, b, 420, 150 + i * 36, { size: 16, weight: "normal" });
    });
  },

  /**
   * Shared card grid (world select + level select).
   * cards: [{ num, name, theme, locked, bad, lines: [[text, color]], empty }]
   */
  drawCards(ctx, title, cards) {
    const perRow = 5, rowsN = Math.max(1, Math.ceil(cards.length / perRow));
    const compact = rowsN > 1;
    const cw = 164, ch = compact ? 168 : 220, gap = compact ? 14 : 16;
    UI.text(ctx, title, VIEW_W / 2, compact ? 58 : 70, { size: compact ? 28 : 34, align: "center", glow: "#00f0ff" });
    const totalW = Math.min(cards.length, perRow) * (cw + gap) - gap;
    const x0 = VIEW_W / 2 - totalW / 2, y0 = compact ? 80 : 130;
    const Y = compact
      ? { sw: 8, swH: 52, num: 48, name: 80, msg: 116, stats: [102, 120, 138, 156] }
      : { sw: 10, swH: 70, num: 60, name: 106, msg: 150, stats: [140, 160, 180, 200] };
    this.cardRects = [];
    cards.forEach((c, i) => {
      const x = x0 + (i % perRow) * (cw + gap), y = y0 + Math.floor(i / perRow) * (ch + gap);
      this.cardRects.push({ x, y, w: cw, h: ch });
      const sel = i === this.selIndex, th = c.theme || {};
      const acc = c.bad ? "#ff4d6d" : th.accent || "#00f0ff";
      ctx.fillStyle = sel ? U.rgba(acc, 0.16) : "rgba(8,12,30,0.8)";
      U.roundRect(ctx, x, y, cw, ch, 10); ctx.fill();
      ctx.strokeStyle = sel ? acc : U.rgba(acc, 0.3); ctx.lineWidth = sel ? 3 : 1; ctx.stroke();
      const g = ctx.createLinearGradient(0, y + Y.sw, 0, y + Y.sw + Y.swH);
      g.addColorStop(0, th.bgTop || "#050818");
      g.addColorStop(1, th.bgBottom || "#0a1a3a");
      ctx.fillStyle = g; ctx.fillRect(x + 10, y + Y.sw, cw - 20, Y.swH);
      ctx.fillStyle = acc; ctx.fillRect(x + 10, y + Y.sw + Y.swH - 2, cw - 20, 2);
      UI.text(ctx, c.num, x + cw / 2, y + Y.num, { size: compact ? 28 : 34, align: "center", color: c.locked ? "#33445a" : "#ffffff" });
      UI.text(ctx, c.name.toUpperCase(), x + cw / 2, y + Y.name, { size: compact ? 12 : 13, align: "center", color: c.locked ? "#4a5a70" : acc });
      if (c.bad) UI.text(ctx, "INVALID", x + cw / 2, y + Y.msg, { size: 12, align: "center", color: "#ff4d6d" });
      else if (c.locked) UI.text(ctx, "LOCKED", x + cw / 2, y + Y.msg, { size: 14, align: "center", color: "#4a5a70" });
      else if (c.lines && c.lines.length) c.lines.forEach(([t, col], k) => UI.text(ctx, t, x + 14, y + Y.stats[k], { size: 12, weight: "normal", color: col }));
      else UI.text(ctx, "—", x + cw / 2, y + Y.msg, { size: 14, align: "center", color: "#7f9fc0" });
    });
    const by = y0 + rowsN * (ch + gap) + (compact ? 0 : 10);
    this.backRect = { x: VIEW_W / 2 - 80, y: by, w: 160, h: 36 };
    UI.panel(ctx, this.backRect.x, by, 160, 36);
    UI.text(ctx, "◀ BACK", VIEW_W / 2, by + 24, { size: 15, align: "center" });
  },

  drawWorlds(ctx) {
    const cards = Registry.worlds.map((w, i) => {
      const prog = Save.world(w.id);
      const n = w.levelDefs.length;
      const cleared = w.levelDefs.filter((d) => Save.best(w.id, d.id)).length;
      return {
        num: String(i + 1), name: w.name, theme: w.theme,
        locked: !this.worldUnlocked(i), bad: !!this.worldErrors[i],
        lines: [[`LEVELS ${cleared}/${n}`, "#a8c8e0"], [`BOSS   ${prog.bossBeaten ? "✓" : "—"}`, prog.bossBeaten ? "#7dff4a" : "#7f9fc0"]],
      };
    });
    this.drawCards(ctx, "WORLDS", cards);
  },

  drawSelect(ctx) {
    const w = this.worldDef();
    const cards = this.levelsOf().map((def, i) => {
      const b = Save.best(w.id, def.id);
      return {
        num: String(i + 1).padStart(2, "0"), name: def.name,
        theme: Object.assign({}, w.theme || {}, def.theme || {}),
        locked: !this.levelUnlocked(this.worldIndex, i), bad: !!this.levelErrors[this.worldIndex + ":" + i],
        lines: b ? [
          [`TIME   ${U.fmtTime(b.time)}`, "#a8c8e0"],
          [`CORES  ${b.cores}/${b.coresTotal}`, "#a8c8e0"],
          [`SECRET ${b.secrets}/${b.secretsTotal}`, "#ffe9a0"],
          [`DEATHS ${b.deaths}`, "#ffb3c0"],
        ] : null,
      };
    });
    this.drawCards(ctx, w ? w.name.toUpperCase() : "LEVELS", cards);
  },

  drawComplete(ctx) {
    this.world.draw(ctx);
    this.dim(ctx, 0.7);
    const info = this.completeInfo, s = info.stats;
    UI.text(ctx, info.worldClear ? "WORLD CLEAR" : "CLEARED", VIEW_W / 2, 92, { size: 44, align: "center", color: "#d8ffcc", glow: "#7dff4a" });
    UI.text(ctx, info.name.toUpperCase(), VIEW_W / 2, 122, { size: 15, align: "center", color: "#7dff4a" });
    UI.panel(ctx, VIEW_W / 2 - 220, 140, 440, 150, "#7dff4a");
    const rows = [
      ["TIME", U.fmtTime(s.time) + (info.isBest ? "  BEST" : "")],
      ["CORES", `${s.cores} / ${s.coresTotal}`],
      ["SECRETS", `${s.secrets} / ${s.secretsTotal}`],
      ["DEATHS", String(s.deaths)],
    ];
    rows.forEach(([a, b], i) => {
      UI.text(ctx, a, VIEW_W / 2 - 196, 174 + i * 32, { size: 16, color: "#7dff4a" });
      UI.text(ctx, b, VIEW_W / 2 + 196, 174 + i * 32, { size: 16, align: "right" });
    });
    let y = 312;
    const gains = info.newUnlocks.map((u) => UPGRADE_INFO[u] || { name: u, how: "" })
      .concat((info.newWeapons || []).map((n) => ({ name: (Registry.weapons[n] && Registry.weapons[n].label) || n, how: "{swap}" })));
    for (const inf of gains) {
      UI.text(ctx, `+ ${inf.name}`, VIEW_W / 2, y, { size: 18, align: "center", color: "#ffd23d", glow: "#ffd23d" });
      if (inf.how) UI.text(ctx, UI.keys(inf.how), VIEW_W / 2, y + 20, { size: 13, align: "center", color: "#ffe9a0", weight: "normal" });
      y += 46;
    }
    this.menu.draw(ctx, VIEW_W / 2, Math.max(y + 4, 350), this.time, "#7dff4a");
  },

  drawVictory(ctx) {
    this.drawMenuBg(ctx);
    const t = this.time;
    for (let i = 0; i < 3; i++) U.glow(ctx, VIEW_W / 2 + Math.sin(t * 0.02 + i * 2) * 200, 180 + Math.cos(t * 0.03 + i) * 40, 120, ["#00f0ff", "#ff3df0", "#7dff4a"][i], 0.3);
    UI.text(ctx, "SYSTEM RESTORED", VIEW_W / 2, 110, { size: 46, align: "center", color: "#ffffff", glow: "#00f0ff" });
    let time = 0, cores = 0, coresT = 0, sec = 0, secT = 0, deaths = 0;
    for (const w of Registry.worlds) for (const def of w.levelDefs) {
      const b = Save.best(w.id, def.id);
      if (!b) continue;
      time += b.time; cores += b.cores; coresT += b.coresTotal; sec += b.secrets; secT += b.secretsTotal; deaths += b.deaths;
    }
    UI.panel(ctx, VIEW_W / 2 - 220, 180, 440, 140, "#00f0ff");
    [["TIME", U.fmtTime(time)], ["CORES", `${cores} / ${coresT}`], ["SECRETS", `${sec} / ${secT}`], ["DEATHS", String(deaths)]]
      .forEach(([a, b], i) => {
        UI.text(ctx, a, VIEW_W / 2 - 196, 212 + i * 30, { size: 16, color: "#00f0ff" });
        UI.text(ctx, b, VIEW_W / 2 + 196, 212 + i * 30, { size: 16, align: "right" });
      });
    this.menu.draw(ctx, VIEW_W / 2, 370, t);
  },
};

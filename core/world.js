/* =========================================================================
 * core/world.js — one running level: tiles, entities, player, rules.
 * ========================================================================= */
"use strict";

class World {
  /**
   * @param def       level definition (from registerLevel)
   * @param index     position of the level inside its world
   * @param upgrades  permanent upgrades the player owns when starting
   * @param opts      { worldDef, weapons: [names], weapon: selected name, lives, maxHp, section }
   */
  constructor(def, index, upgrades, opts = {}) {
    this.def = def;
    this.index = index;
    this.worldDef = opts.worldDef || def.world || null;
    const lv = LevelLoader.parse(def);
    this.w = lv.w; this.h = lv.h; this.tiles = lv.tiles;
    this.pw = lv.w * TILE; this.ph = lv.h * TILE;
    this.gravity = def.gravity || 1;

    // Theme: engine defaults ← world theme ← level theme ← section theme.
    this.skins = ((this.worldDef && this.worldDef.theme) || {}).skins || {};   // per-entity look overrides
    this.sections = def.sections || [];   // named parts of a world level (see levels/_TEMPLATE.js)
    this.sectionIdx = -1;
    const th = this.buildTheme(null);
    this.theme = th;

    this.entities = [];
    this.solids = [];
    this.particles = new Particles();
    this.camera = new Camera();
    this.camera.setBounds(this.pw, this.ph);
    this.background = new Background(th, def.id || index + 1);
    this._bgCache = {};

    this.flags = {};
    this.time = 0;            // frames since the level started
    this.levelTime = 0;       // frames counted for the stats (not while dying)
    this.deaths = 0;
    this.lives = opts.lives == null ? 5 : opts.lives; // per attempt; all gone → restart the level
    this.cores = 0; this.coresTotal = 0;
    this.secrets = 0; this.secretsTotal = 0;
    this.hint = null;         // { text, t, max }
    this.banner = null;       // big centred text { text, sub, t, max, color }
    this.cutscene = null;
    this.boss = null;
    this.state = "play";      // play | dying | complete
    this.stateTimer = 0;
    this.fade = 0;            // white/black flash overlay
    this.hurtFlash = 0;
    this.scripts = (def.scripts || []).map((s) => Object.assign({ fired: false, once: true }, s));

    // Player.
    const sx = lv.start.x * TILE + (TILE - Player.W) / 2;
    const sy = (lv.start.y + 1) * TILE - Player.H;
    this.player = new Player(this, sx, sy, upgrades, opts.weapons || [], opts.weapon);
    if (opts.maxHp) { this.player.maxHp = opts.maxHp; this.player.hp = opts.maxHp; }
    this.checkpoint = { x: sx, y: sy, entity: null };

    // Entities from the map.
    for (const s of lv.spawns) {
      const e = this.spawnAtCell(s.name, s.col, s.row, s.opts, s.arg);
      if (s.name === "core") this.coresTotal++;
      if (s.name === "secretCore") this.secretsTotal++;
      void e;
    }
    // Start part-way in (section select): at that section's first checkpoint.
    if (opts.section > 0 && this.sections[opts.section]) {
      const sec = this.sections[opts.section];
      const cp = this.entities.filter((e) => e.name === "checkpoint" && e.col >= sec.from && e.col <= sec.to).sort((a, b) => a.col - b.col)[0];
      if (cp) { this.setCheckpoint(cp); cp.on = true; this.player.x = this.checkpoint.x; this.player.y = this.checkpoint.y; }
    }
    this.camera.snap(this.player);
    this.banner = { text: def.name.toUpperCase(), sub: "", t: 120, max: 120, color: th.accent };
  }

  /** Theme for a section (null = the level's own). */
  buildTheme(sec) {
    const wTheme = Object.assign({}, (this.worldDef && this.worldDef.theme) || {});
    delete wTheme.skins;
    const th = Object.assign(
      { bgTop: "#050818", bgBottom: "#0a1a3a", accent: "#00f0ff", gridColor: "#0b3a5a", style: "boot" },
      wTheme, this.def.theme || {}, (sec && sec.theme) || {}
    );
    th.tileFill = th.tileFill || U.mix(th.bgBottom, th.gridColor, 0.55);
    th.tileInner = th.tileInner || U.mix(th.bgTop, th.gridColor, 0.35);
    th.edgeDim = U.rgba(th.accent, 0.35);
    th.edgeGlow = U.rgba(th.accent, 0.13);
    return th;
  }

  /** Which section the player is in (by column); announce and re-theme on change. */
  updateSection() {
    if (!this.sections.length) return;
    const c = Math.floor(U.cx(this.player) / TILE);
    let i = this.sections.findIndex((s) => c >= s.from && c <= s.to);
    if (i < 0 || i === this.sectionIdx) return;
    const first = this.sectionIdx < 0;
    this.sectionIdx = i;
    const sec = this.sections[i];
    if (sec.theme || first) {
      this.theme = this.buildTheme(sec);
      const key = sec.theme ? i : "base";
      this.background = this._bgCache[key] || (this._bgCache[key] = new Background(this.theme, (this.def.id || 1) * 10 + i));
    }
    if (typeof Game !== "undefined" && Game.onSectionReached) Game.onSectionReached(this, i);
    if (!first) this.banner = { text: sec.name.toUpperCase(), sub: (sec.desc || "").toUpperCase(), t: 150, max: 150, color: this.theme.accent };
  }

  // ---------------------------------------------------------------- spawning
  /** Create an entity of a registered type at pixel position (x, y). */
  spawn(name, x, y, opts = {}, arg) {
    const def = Registry.entities[name];
    if (!def) { console.error(`[world] unknown entity type "${name}"`); return null; }
    const size = def.size || [32, 32];
    const e = {
      name, def, x, y, w: size[0], h: size[1], vx: 0, vy: 0, t: 0,
      dead: false, active: false, hp: 1, maxHp: 1, flash: 0, iframes: 0,
      layer: def.layer == null ? 1 : def.layer, opts, arg,
    };
    if (def.props) for (const k in def.props) {
      const v = def.props[k];
      e[k] = v && typeof v === "object" && !Array.isArray(v) ? Object.assign({}, v) : v;
    }
    // World skin (colours etc.), then per-entity overrides.
    if (this.skins && this.skins[name]) Object.assign(e, this.skins[name]);
    // Overrides may set any simple property directly (speed, hp, range…).
    for (const k in opts) if (typeof opts[k] !== "object") e[k] = opts[k];
    e.maxHp = e.hp;
    e.home = { x, y };
    if (this._cell) { e.col = this._cell[0]; e.row = this._cell[1]; this._cell = null; }
    if (def.init) def.init(e, this, arg);
    this.entities.push(e);
    return e;
  }

  /** Spawn using the type's anchor inside map cell (col,row). */
  spawnAtCell(name, col, row, opts, arg) {
    const def = Registry.entities[name];
    if (!def) return null;
    const [w, h] = def.size || [32, 32];
    let x = col * TILE + (TILE - w) / 2, y = (row + 1) * TILE - h;
    switch (def.anchor) {
      case "center": y = row * TILE + (TILE - h) / 2; break;
      case "top": y = row * TILE; break;
      case "topleft": x = col * TILE; y = row * TILE; break;
    }
    this._cell = [col, row];
    return this.spawn(name, x, y, opts, arg);
  }

  // ------------------------------------------------------------------ update
  /** Clock for time-driven hazards: stands still while a Freeze Process runs. */
  get htime() { return this.time - (this.frozenFrames || 0); }

  /** Freeze Process: stop enemies, projectiles and moving hazards for a while. */
  freeze(frames) {
    this.frozen = frames;
    this.camera.shake(3);
  }

  update() {
    this.time++;
    const p = this.player;
    if (this.frozen > 0) { this.frozen--; this.frozenFrames = (this.frozenFrames || 0) + 1; }
    if (this.freezeCool > 0) this.freezeCool--;
    if (this.state === "play" && !this.cutscene) this.levelTime++;

    // Which entities are simulated this frame (near the camera).
    const ar = this.camera.activeRect();
    this.solids.length = 0;
    for (const e of this.entities) {
      e.active = !e.dead && (e.alwaysActive || U.overlap(e, ar));
      if (e.active && e.solid) this.solids.push(e);
    }

    // Entities.
    // Iterate a stable reference: a respawn (e.g. crushed by a crusher during
    // its own update) may replace this.entities mid-loop.
    const list = this.entities, n = list.length;
    for (let i = 0; i < n; i++) {
      const e = list[i];
      if (!e || !e.active || e.dead) continue;
      if (this.frozen > 0 && World.freezes(e)) continue; // held in place by Freeze Process
      if (e.stun > 0) { e.stun--; continue; }            // knocked out by a Ground Slam
      e.t++;
      if (e.flash > 0) e.flash--;
      if (e.iframes > 0) e.iframes--;
      if (e.def.update) e.def.update(e, this);
    }

    // Player.
    if (this.state === "play") {
      p.update(this);
      this.interactions();
      this.runScripts();
      this.updateSection();
      if (typeof Guide !== "undefined") Guide.update(this);
      if (typeof MiniMap !== "undefined") MiniMap.update(this);
      if (p.y > this.ph + 80) this.fallOut();
    } else if (this.state === "dying") {
      if (--this.stateTimer <= 0) Game.onPlayerDied(this);
    } else if (this.state === "complete") {
      p.warpAnim(this);
      if (--this.stateTimer <= 0) Game.onLevelComplete(this);
    }

    // Cutscene camera pan.
    if (this.cutscene) {
      this.camera.focus = this.cutscene.focus;
      if (--this.cutscene.t <= 0) { this.cutscene = null; this.camera.focus = null; }
    }

    // Cleanup.
    if (this.entities.some((e) => e.dead)) this.entities = this.entities.filter((e) => !e.dead);
    this.particles.update();
    this.camera.update(p);
    // Every message stays up long enough to read: 1.5 s + 0.4 s per word.
    for (const m of [this.hint, this.banner]) {
      if (!m || m.timed) continue;
      m.timed = true;
      const need = World.readFrames(`${m.text} ${m.sub || ""}`);
      if (need > m.max) { m.t += need - m.max; m.max = need; }
    }
    if (this.hint && --this.hint.t <= 0) this.hint = null;
    if (this.banner && --this.banner.t <= 0) this.banner = null;
    if (this.fade > 0) this.fade -= 0.04;
    if (this.hurtFlash > 0) this.hurtFlash--;
  }

  /** Player ↔ entity contact rules. */
  interactions() {
    const p = this.player;
    if (!p.alive) return;
    for (const e of this.entities) {
      if (!e.active || e.dead || !U.overlap(p, e)) continue;
      if (e.def.onTouch) e.def.onTouch(e, this, p);
      else if (e.enemy) this.enemyContact(e);
      else if (e.hurts) this.hurtPlayer(1, e);
      if (!p.alive || this.state !== "play") return;
    }
  }

  /** Standard enemy contact: dash-hit, stomp, or get hurt. */
  enemyContact(e) {
    const p = this.player;
    if (p.dashing > 0 && e.def.blocks && e.def.blocks(e, this, p.dashDir) && !p.has("dataDash") && !(p.sudo > 0)) {
      // Shield in the way: deflected, nobody is hurt.
      p.dashing = 0;
      p.vx = -p.dashDir * 6;
      p.vy = -4;
      p.invuln = Math.max(p.invuln, 20);
      sfx.play("shield");
      this.particles.burst(U.cx(p), U.cy(p), 10, "#5ef0ff", 3);
      this.camera.shake(4);
      return;
    }
    if (p.dashing > 0 && U.flag(e.dashable, e, this)) {
      this.damageEntity(e, 2, "dash");
      return;
    }
    const falling = p.vy > 0 || p.lastVy > 0;
    if (falling && p.prevY + p.h <= e.y + 12) {
      const s = e.stun > 0 ? true : U.flag(e.stompable, e, this);
      if (s === true) {
        sfx.play("stomp");
        this.damageEntity(e, 1, "stomp");
        p.bounce(this, Input.down("jump") ? -11 : -8);
        return;
      }
      if (s === "bounce") {           // armoured top: safe, no damage
        p.bounce(this, -8);
        sfx.play("blocked");
        this.particles.burst(p.x + p.w / 2, p.y + p.h, 6, "#ffffff", 2);
        return;
      }
    }
    if (p.dashing > 0) return;       // dashing = immune to enemy contact
    if (e.stun > 0) return;          // stunned enemies are harmless
    if (e.hurts !== false) this.hurtPlayer(1, e);
  }

  /** Damage an entity. Returns true if the damage landed. */
  damageEntity(e, amount, source) {
    if (e.dead) return false;
    if (e.def.onDamage) return e.def.onDamage(e, this, amount, source);
    if (e.iframes > 0) return false;
    e.hp -= amount;
    e.flash = 8;
    e.iframes = 8;
    this.particles.burst(U.cx(e), U.cy(e), 8, e.color || "#ff3df0", 3);
    if (e.hp <= 0) this.killEntity(e);
    else sfx.play("hit");
    return true;
  }

  killEntity(e) {
    if (e.dead) return;
    e.dead = true;
    const col = e.color || "#ff3df0";
    this.particles.burst(U.cx(e), U.cy(e), 26, col, 6, { glow: true });
    this.particles.burst(U.cx(e), U.cy(e), 10, "#ffffff", 3);
    this.particles.ring(U.cx(e), U.cy(e), col, 30);
    this.camera.shake(5);
    if (!e.isBoss) sfx.play("enemyDefeat"); // bosses play "bossDefeat" in endBoss()
    if (e.def.onDeath) e.def.onDeath(e, this);
  }

  // ----------------------------------------------------------- player harm
  /** Hurt the player (1 heart). src is used for knockback direction. */
  hurtPlayer(amount, src, opts = {}) {
    const p = this.player;
    if (this.state !== "play" || !p.alive || p.invuln > 0) return false;
    if (p.dashing > 0 && p.has("dataDash")) return false; // Data Dash: untouchable
    if (p.powers.shield > 0) {
      p.powers.shield = 0;
      p.invuln = 60;
      this.particles.burst(U.cx(p), U.cy(p), 24, "#59a7ff", 5);
      this.particles.ring(U.cx(p), U.cy(p), "#59a7ff", 34);
      this.camera.shake(5);
      sfx.play("shield");
      return true;
    }
    p.hp -= amount;
    p.hook = null; p.slamming = false;
    this.hurtFlash = 14;
    this.camera.shake(8);
    this.particles.burst(U.cx(p), U.cy(p), 16, "#ff3355", 4);
    if (p.hp <= 0) { this.killPlayer(); return true; }
    sfx.play("damage");
    p.invuln = 80;
    const dir = src ? U.sign(U.cx(p) - U.cx(src)) || -p.facing : -p.facing;
    p.vx = dir * 5;
    p.vy = opts.up || -6.5;
    p.dashing = 0;
    return true;
  }

  killPlayer() {
    const p = this.player;
    if (!p.alive) return;
    // Rewind (World 3 ability): once per level, undo a death.
    if (p.has("rewind") && !this.rewindUsed && p.rewindTo(this)) {
      this.rewindUsed = true;
      this.rewindFx = 45;
      this.camera.snap(p);
      this.camera.shake(6);
      sfx.play("rewind");
      Save.markSeen("rewind");
      return;
    }
    p.alive = false;
    p.hp = 0;
    this.deaths++;
    this.state = "dying";
    this.stateTimer = 70;
    this.camera.shake(14);
    sfx.play("death");
    this.particles.burst(U.cx(p), U.cy(p), 50, "#00f0ff", 7, { glow: true });
    this.particles.burst(U.cx(p), U.cy(p), 20, "#ffffff", 4);
    this.particles.ring(U.cx(p), U.cy(p), "#00f0ff", 50);
  }

  /** Fell into a pit or got crushed: lose a heart, return to checkpoint. */
  fallOut() {
    const p = this.player;
    if (!p.alive || this.state !== "play") return;
    if (p.powers.shield > 0) p.powers.shield = 0;
    else p.hp -= 1;
    if (p.hp <= 0) { this.killPlayer(); return; }
    sfx.play("damage");
    this.camera.shake(6);
    this.respawn(false);
  }
  crushPlayer() {
    const p = this.player;
    if (!p.alive || this.state !== "play") return;
    this.particles.burst(U.cx(p), U.cy(p), 30, "#ff3355", 6);
    this.camera.shake(12);
    this.fallOut();
  }

  /** Return the player to the last checkpoint. full=true after a death. */
  respawn(full) {
    const p = this.player;
    p.reset(this.checkpoint.x, this.checkpoint.y, full);
    this.state = "play";
    this.fade = 1;
    this.flags.bossFight = false;
    this.boss = null;
    this.camera.lock = null;
    this.cutscene = null;
    this.camera.focus = null;
    for (const e of this.entities) if (e.def.onRespawn) e.def.onRespawn(e, this);
    this.entities = this.entities.filter((e) => !e.dead && !e.transient);
    this.camera.snap(p);
  }

  setCheckpoint(e) {
    this.checkpoint = {
      x: e.x + e.w / 2 - Player.W / 2,
      y: e.y + e.h - Player.H,
      entity: e,
    };
  }

  // ----------------------------------------------------------- level flow
  completeLevel() {
    if (this.state !== "play") return;
    this.state = "complete";
    this.stateTimer = 80;
    this.player.invuln = 999;
    this.camera.shake(4);
    sfx.play("levelComplete");
  }

  /** Is the entity inside the visible screen? (used to keep off-screen sounds quiet) */
  onScreen(e, margin = 32) {
    const c = this.camera;
    return U.overlap(e, { x: c.x - margin, y: c.y - margin, w: VIEW_W + margin * 2, h: VIEW_H + margin * 2 });
  }

  /** Is a boss that locks the exit still alive? Only the world's main boss
   *  (worldDef.boss.entity) locks it; mini-bosses (e.g. the Warden Mk-II
   *  before the Mainframe) only close their own arena. */
  bossesAlive() {
    const main = this.worldDef && this.worldDef.boss && this.worldDef.boss.entity;
    return this.entities.some((e) => e.isBoss && !e.dead && (!main || e.name === main));
  }

  /** Called by a boss when it wakes up. arena = {x,y,w,h} in pixels. */
  startBoss(e, arena) {
    this.flags.bossFight = true;
    this.boss = e;
    sfx.play("bossWake");
    if (arena) this.camera.lock = arena;
    this.camera.shake(10);
    // Boss name card: name + how to beat it.
    const info = e.def.info;
    this.banner = { text: e.title || "WARNING", sub: info ? info.desc.toUpperCase() : "", t: 170, max: 170, color: "#ff3df0" };
  }
  endBoss(e) {
    this.flags.bossFight = false;
    if (this.boss === e) this.boss = null;
    this.camera.lock = null;
    this.camera.shake(16);
    sfx.play("bossDefeat");
    this.fade = 0.8;
    this.banner = { text: (e.title || "BOSS") + " OFFLINE", sub: "", t: 120, max: 150, color: "#7dff4a" };
  }

  // ------------------------------------------------------------- scripts
  /** Short on-screen message; it stays at least as long as it takes to read. */
  showHint(text, seconds = 0) {
    const f = Math.max(Math.round(seconds * FPS), World.readFrames(text));
    this.hint = { text, t: f, max: f, timed: true };
  }

  runScripts() {
    const p = this.player;
    for (const s of this.scripts) {
      if (s.fired && s.once) continue;
      const [c, r] = s.at;
      const [w, h] = s.size || [1, 1];
      const rect = { x: c * TILE, y: r * TILE, w: w * TILE, h: h * TILE };
      const inside = U.overlap(p, rect);
      if (inside && !s.inside) {
        s.fired = true;
        for (const a of s.actions || []) this.runAction(a);
      }
      s.inside = inside;
    }
  }

  runAction(a) {
    switch (a.type) {
      case "hint":
        // Keyed hints show once ever, and never after the mechanic was used.
        if (a.key) { if (Save.seen(a.key)) break; Save.markSeen(a.key); }
        this.showHint(a.text);
        break;
      case "banner":
        this.banner = { text: a.text, sub: a.sub || "", t: (a.time || 2.5) * FPS, max: (a.time || 2.5) * FPS, color: a.color || this.theme.accent };
        break;
      case "shake": this.camera.shake(a.amount || 8); break;
      case "flag": this.flags[a.name] = a.value === undefined ? true : a.value; break;
      case "pan":
        this.cutscene = {
          focus: { x: a.to[0] * TILE + TILE / 2, y: a.to[1] * TILE + TILE / 2 },
          t: Math.round((a.time || 2) * FPS),
        };
        break;
      case "particles": {
        const x = a.at[0] * TILE + 16, y = a.at[1] * TILE + 16;
        this.particles.burst(x, y, a.count || 30, a.color || this.theme.accent, 5, { glow: true });
        break;
      }
      default: console.warn(`[script] unknown action type "${a.type}"`);
    }
  }

  // ---------------------------------------------------------------- draw
  draw(ctx) {
    const cam = this.camera;
    this.background.draw(ctx, cam, this.time);
    ctx.save();
    ctx.translate(-Math.round(cam.x + cam.ox), -Math.round(cam.y + cam.oy));
    const vis = { x: cam.x - 64, y: cam.y - 64, w: VIEW_W + 128, h: VIEW_H + 128 };
    const drawLayer = (L) => {
      for (const e of this.entities) {
        if (e.layer !== L || e.dead || !e.def.draw) continue;
        if (!e.alwaysDraw && !U.overlap(e, vis)) continue;
        e.def.draw(e, ctx, this);
        if (e.stun > 0) drawStun(ctx, e, this.time);
      }
    };
    drawLayer(0);
    drawTiles(ctx, this, cam);
    drawLayer(1);
    this.player.draw(ctx, this);
    drawLayer(2);
    this.particles.draw(ctx, cam);
    drawLayer(3);
    ctx.restore();

    if (this.rewindFx > 0) {
      // Rewind: VHS-style tracking bands.
      this.rewindFx--;
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = `rgba(255,236,39,${0.05 + (this.rewindFx / 45) * 0.12})`;
        ctx.fillRect(0, ((this.time * 9 + i * 97) % VIEW_H), VIEW_W, 6 + i * 2);
      }
    }
    if (this.frozen > 0) {
      // Freeze Process: cold tint + drifting scanlines.
      ctx.fillStyle = `rgba(80,255,200,${Math.min(0.12, this.frozen / 300)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = "rgba(160,255,220,0.06)";
      for (let y = (this.time * 2) % 6; y < VIEW_H; y += 6) ctx.fillRect(0, y, VIEW_W, 1);
    }
    if (this.hurtFlash > 0) {
      ctx.fillStyle = `rgba(255,30,70,${this.hurtFlash / 40})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(5,8,24,${Math.min(1, this.fade)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }
}

/** Which entities Freeze Process stops: regular enemies, enemy projectiles
 *  and moving / cycling hazards. Bosses and pickups keep running. */
World.FREEZE_TYPES = new Set(["bullet", "shockwave", "movingPlatform", "fallingPlatform", "crusher",
  "laser", "electric", "laserWall", "timedGate", "glitchBlock", "pixelWall", "vanishBlock", "closingWindow", "bluePanel"]);
/** Frames needed to read a message: 1.5 s + 0.4 s per word. */
World.readFrames = (text) => Math.round((1.5 + 0.4 * String(text).trim().split(/\s+/).filter(Boolean).length) * FPS);
World.freezes = (e) => !e.noFreeze && ((e.enemy && !e.isBoss) || World.FREEZE_TYPES.has(e.name) || !!e.freezable);

/** Ground Slam stun: little squares circling above the enemy. */
function drawStun(ctx, e, time) {
  const cx = e.x + e.w / 2, cy = e.y - 6;
  ctx.fillStyle = "#ffe08a";
  for (let i = 0; i < 3; i++) {
    const a = time * 0.15 + i * 2.1;
    ctx.fillRect(cx + Math.cos(a) * 12 - 2, cy + Math.sin(a) * 4 - 2, 4, 4);
  }
}

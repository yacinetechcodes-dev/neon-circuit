/* =========================================================================
 * entities/player.js — the player robot ("UNIT-01").
 * Abstract design: a rounded chassis with a glowing visor strip.
 *
 * Movement features: acceleration-based running, variable-height jump,
 * coyote time, jump buffering, wall-slide + wall-jump, double jump,
 * horizontal dash, pulse shot. Units: pixels and frames (60 per second).
 * ========================================================================= */
"use strict";

class Player {
  constructor(world, x, y, upgrades, weapons, weapon) {
    this.x = x; this.y = y;
    this.w = Player.W; this.h = Player.H;
    this.upgrades = new Set(upgrades || []);
    // Weapons: names in HUD order, the selected index, and charges per weapon.
    this.weapons = Weapons.sort(weapons || []);
    this.weaponIdx = Math.max(0, this.weapons.indexOf(weapon));
    this.ammo = {}; this.ammoT = {};
    for (const w of this.weapons) this.refill(w);
    this.maxHp = 3 + (this.has("hpUp") ? 1 : 0);
    this.powers = { shield: 0, magnet: 0, speed: 0 };
    this.sudoCool = 0; this.killCool = 0;
    this.pipeA = null; this.pipeB = null;   // Pipe ends (world 6)
    this.reset(x, y, true);
  }

  static get W() { return 20; }
  static get H() { return 28; }
  static get SW() { return 10; }  // Pixel Shrink size (see Player.FORMS)
  static get SH() { return 14; }

  has(u) { return this.upgrades.has(u); }

  // ---- Size forms (World 3 Pixel Shrink, World 4 Minimize / Maximize) ----
  /** Switch body size; feet and centre stay put. Getting bigger needs room. */
  setForm(world, form, force) {
    const F = Player.FORMS[form];
    if (!F || form === this.form) return true;
    const next = { x: this.x + (this.w - F.w) / 2, y: this.y + this.h - F.h, w: F.w, h: F.h };
    const grows = F.w > this.w || F.h > this.h;
    if (grows && !force && Physics.bodyBlocked(world, next)) { sfx.play("blocked"); return false; }
    this.x = next.x; this.y = next.y; this.w = F.w; this.h = F.h;
    this.form = form;
    this.small = form === "pixel" || form === "mini";
    world.particles.burst(U.cx(this), U.cy(this), 10, F.color, 2, { shape: "square" });
    return true;
  }
  /** Toggle a form on/off (back to normal). */
  toggleForm(world, form, sound) {
    const target = this.form === form ? "normal" : form;
    if (this.setForm(world, target)) sfx.play(target === "normal" ? "grow" : sound);
  }
  /** Pixel Shrink (World 3): 10×14. */
  toggleShrink(world) { this.toggleForm(world, "pixel", "shrink"); Save.markSeen("shrink"); }
  /** Block Place: drop a temporary block under your feet (mid-air) or in front (on the ground). */
  placeBlock(world) {
    let c = Math.floor(U.cx(this) / TILE), r;
    if (this.onGround) { c += this.facing; r = Math.floor((this.y + this.h - 1) / TILE); }
    else r = Math.floor((this.y + this.h + 2) / TILE);
    const cell = { x: c * TILE, y: r * TILE, w: TILE, h: TILE };
    const free = Physics.tileAt(world, c, r) === T_EMPTY && !world.solids.some((o) => U.overlap(o, cell));
    if (!free) { sfx.play("blocked"); return; }
    for (const o of world.entities) if (o.name === "placedBlock") o.dead = true; // one at a time
    const b = world.spawn("placedBlock", cell.x, cell.y, {});
    if (!b) return;
    // Mid-air: land on it straight away.
    if (U.overlap(this, b)) {
      const top = { x: this.x, y: cell.y - this.h, w: this.w, h: this.h };
      if (!Physics.bodyBlocked(world, top, false)) { this.y = top.y; this.vy = 0; }
    }
    this.blockCool = Player.C.blockCool;
    world.particles.burst(cell.x + 16, cell.y + 16, 10, "#ffa300", 3, { shape: "square" });
    sfx.play("place");
    Save.markSeen("blockPlace");
  }
  /** Rewind: jump back to a safe spot from a couple of seconds ago. */
  rewindTo(world) {
    const h = this.history;
    if (!h.length) return false;
    let snap = h[0];
    for (const s of h) if (s.t <= world.time - 100) snap = s;
    this.setForm(world, "normal", true);
    this.x = snap.x; this.y = snap.y;
    this.vx = this.vy = 0; this.dashing = 0;
    this.hp = Math.max(1, Math.min(this.maxHp, snap.hp));
    this.invuln = 120;
    this.history = [];
    return true;
  }

  // ---- World 5: Grapple Hook, Ground Slam, Jetpack Burst ----
  /** Hook the best anchor in range (in front and above preferred, needs line of sight). */
  tryHook(world) {
    const cx = U.cx(this), cy = U.cy(this);
    let best = null, bs = 1e9;
    for (const a of world.entities) {
      if (a.name !== "grappleAnchor" || a.dead) continue;
      const ax = U.cx(a), ay = U.cy(a), d = U.dist(cx, cy, ax, ay);
      if (d > a.range * TILE || ay > cy + 8) continue;
      let clear = true;
      for (let k = 1; k < 10 && clear; k++) if (Physics.solidAtPx(world, cx + (ax - cx) * k / 10, cy + (ay - cy) * k / 10)) clear = false;
      if (!clear) continue;
      const score = d - (U.sign(ax - cx) === this.facing ? 40 : 0);
      if (score < bs) { bs = score; best = a; }
    }
    if (!best) { sfx.play("blocked"); return false; }
    const d = U.dist(cx, cy, U.cx(best), U.cy(best));
    const target = Math.max(64, d - 48);
    this.hook = { x: U.cx(best), y: U.cy(best), len: d, min: target, reel: Math.ceil((d - target) / 5), t: 0 };
    this.dashing = 0; this.slamming = false; this.jumping = false;
    this.airJumps = this.has("doubleJump") ? 1 : 0; this.canDash = true;
    world.particles.burst(U.cx(best), U.cy(best), 8, "#ffe08a", 3);
    sfx.play("hook");
    Save.markSeen("grapple");
    return true;
  }
  /** Let go of the rope; jumping off pops you up a little. */
  unhook(jump) {
    if (!this.hook) return;
    this.hook = null;
    if (jump) { this.vy = Math.max(-13, Math.min(this.vy, 0) - 4.5); this.jumpBuffer = 0; this.coyote = 0; }
    this.airJumps = this.has("doubleJump") ? 1 : 0; this.canDash = true;
  }
  /** Pendulum motion around the hook point (rope never stretches). */
  swing(world, move) {
    const h = this.hook;
    h.t++;
    if (h.reel > 0) { h.reel--; h.len = Math.max(h.min, h.len - 5); }
    this.vy += Player.C.gravity * world.gravity;
    this.vx += move * 0.3;
    this.vx *= 0.996; this.vy *= 0.996;
    if (move) this.facing = move;
    const px = U.cx(this), py = U.cy(this);
    const dx = px + this.vx - h.x, dy = py + this.vy - h.y, d = Math.hypot(dx, dy);
    if (d > h.len) {
      const k = h.len / d;
      this.vx = h.x + dx * k - px; this.vy = h.y + dy * k - py;
    }
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > 14) { this.vx *= 14 / sp; this.vy *= 14 / sp; }
    this.jumping = false;
  }
  /** Ground Slam landing: break cracked floors under you, stun nearby enemies. */
  slamLand(world) {
    const feet = { x: this.x - 4, y: this.y + this.h, w: this.w + 8, h: 6 };
    let broke = 0;
    for (const o of world.entities) if (!o.dead && o.name === "crackedFloor" && U.overlap(feet, o)) broke += breakCracked(world, o);
    for (const o of world.entities) {
      if (o.dead || !o.active || !o.enemy) continue;
      if (Math.abs(U.cx(o) - U.cx(this)) < 3.5 * TILE && Math.abs(o.y + o.h - (this.y + this.h)) < 1.5 * TILE) {
        if (o.isBoss) world.damageEntity(o, 1, "slam");
        else { o.stun = 150; o.flash = 6; }
      }
    }
    world.particles.ring(U.cx(this), this.y + this.h, "#ffb347", 50, 20);
    world.particles.dust(U.cx(this), this.y + this.h, "#8a7a6a", 14);
    world.camera.shake(8);
    sfx.play("slamImpact");
    Save.markSeen("groundSlam");
    if (broke) { this.onGround = false; this.vy = 6; return; } // keep slamming through
    this.slamming = false;
  }

  // ---- World 6: Sudo, Pipe, Kill Process ----
  /** Kill Process target: the nearest visible regular enemy, in front first. */
  findKillTarget(world) {
    const cx = U.cx(this), cy = U.cy(this);
    let best = null, bs = 1e9;
    for (const o of world.entities) {
      if (!o.enemy || o.dead || !o.active || o.isBoss) continue;
      const ox = U.cx(o), oy = U.cy(o), d = U.dist(cx, cy, ox, oy);
      if (d > Player.C.killRange * TILE) continue;
      let clear = true;
      for (let k = 1; k < 12 && clear; k++) if (Physics.solidAtPx(world, cx + (ox - cx) * k / 12, cy + (oy - cy) * k / 12)) clear = false;
      if (!clear) continue;
      const score = d + (U.sign(ox - cx) === this.facing ? 0 : 160);
      if (score < bs) { bs = score; best = o; }
    }
    return best;
  }
  /** Pipe: first press marks one end, second press (elsewhere) the other;
   *  pressing inside a linked end travels to its partner. */
  usePipe(world) {
    const here = { x: U.cx(this), y: this.y + this.h };
    const inside = (q) => q && Math.abs(here.x - q.x) < 18 && Math.abs(here.y - q.y) < 20;
    const a = this.pipeA, b = this.pipeB;
    if (a && b && (inside(a) || inside(b))) {
      const to = inside(a) ? b : a;
      world.particles.burst(U.cx(this), U.cy(this), 14, "#8ae234", 4, { shape: "square" });
      this.x = to.x - this.w / 2; this.y = to.y - this.h; this.vx = this.vy = 0;
      this.dashing = 0; this.hook = null; this.slamming = false;
      world.particles.ring(to.x, to.y - 14, "#8ae234", 30);
      world.camera.snap(this);
      world.fade = 0.15;
      sfx.play("pipe");
      Save.markSeen("pipe");
      return;
    }
    if (!this.onGround) { sfx.play("blocked"); return; }
    if (a && !b && Math.abs(here.x - a.x) + Math.abs(here.y - a.y) >= 2 * TILE) this.pipeB = here;
    else { this.pipeA = here; this.pipeB = null; }
    world.particles.burst(here.x, here.y - 6, 8, "#8ae234", 3, { shape: "square" });
    sfx.play("pipeSet");
  }

  /** Remaining recharge of an ability, 0 (ready) … 1 (just used). Used by
   *  the HUD and the touch buttons. */
  abilityCooldown(world, name) {
    const C = Player.C, f = (v, max) => U.clamp((v || 0) / max, 0, 1);
    switch (name) {
      case "dash": case "dataDash": return this.dashCool > 0 || !this.canDash ? 1 : 0;
      case "doubleJump": return this.airJumps > 0 || this.onGround ? 0 : 1;
      case "freeze": return f(world.freezeCool, C.freezeCool);
      case "blockPlace": return f(this.blockCool, C.blockCool);
      case "rewind": return world.rewindUsed ? 1 : 0;
      case "jetpack": return f(this.jetCool, C.jetCool);
      case "sudo": return this.sudo > 0 ? 0 : f(this.sudoCool, C.sudoCool);
      case "killProcess": return f(this.killCool, C.killCool);
      default: return 0;
    }
  }

  // ---- weapons ----
  weaponDef() { return Weapons.get(this.weapons[this.weaponIdx]); }
  refill(name) {
    const def = Weapons.get(name);
    this.ammo[name] = def && def.ammo != null ? def.ammo : Infinity;
    this.ammoT[name] = 0;
  }
  /** Add a weapon (select it if asked). */
  giveWeapon(name, select) {
    if (!this.weapons.includes(name)) {
      const cur = this.weapons[this.weaponIdx];
      this.weapons = Weapons.sort(this.weapons.concat(name));
      this.refill(name);
      this.weaponIdx = Math.max(0, this.weapons.indexOf(cur));
    }
    if (select) this.selectWeapon(this.weapons.indexOf(name));
  }
  selectWeapon(i) {
    if (!this.weapons.length) return;
    const n = this.weapons.length;
    i = ((i % n) + n) % n;
    if (i === this.weaponIdx) return;
    this.weaponIdx = i;
    this.shootCool = Math.max(this.shootCool, 8);
    Save.setWeapon(this.weapons[i]);
    sfx.play("menu");
  }

  reset(x, y, full) {
    this.x = x; this.y = y;
    this.prevY = y;
    this.vx = 0; this.vy = 0; this.lastVy = 0;
    this.facing = 1;
    this.onGround = false; this.ground = null;
    this.coyote = 0; this.jumpBuffer = 0; this.jumping = false;
    this.airJumps = 0; this.canDash = true;
    this.dashing = 0; this.dashDir = 1; this.dashCool = 0;
    this.wallDir = 0; this.wallSliding = false; this.wallCoyote = 0; this.lastWall = 0;
    this.wallLock = 0;
    this.dropTimer = 0;
    this.shootCool = 0;
    this.invuln = 60;
    this.lowGrav = false;
    this.gravFlip = false;   // set each frame by flip fields (gravity points up)
    this.heavy = false;      // set each frame by heavy-gravity fields
    this.flipped = false;    // last frame's flip state (for drawing)
    this.tpLock = null;      // teleporter pad the player just arrived on
    this.small = false;      // tiny form (Pixel Shrink / Minimize)
    this.form = "normal";    // normal | pixel | mini | max
    this.w = Player.W; this.h = Player.H;
    this.blockCool = 0;      // Block Place cooldown (world 3)
    this.history = [];       // recent safe spots for Rewind (world 3)
    this.hook = null;        // Grapple Hook rope { x, y, len, ... } (world 5)
    this.slamming = false;   // Ground Slam in progress (world 5)
    this.jetCool = 0; this.jetT = 0; // Jetpack Burst cooldown / flame (world 5)
    this.sudo = 0;           // Sudo time left (world 6); sudoCool / killCool are kept across respawns
    this.killTarget = null;  // Kill Process target (world 6)
    this.alive = true;
    this.squashX = 1; this.squashY = 1;
    this.trail = [];
    this.runAnim = 0;
    this.warp = 0;
    if (full) {
      this.hp = this.maxHp;
      this.powers.magnet = 0; this.powers.speed = 0;
    }
  }

  /** Bounce off something (stomp / spring). Refreshes air moves. */
  bounce(world, vy) {
    this.vy = vy;
    this.jumping = vy < -9;
    this.airJumps = this.has("doubleJump") ? 1 : 0;
    this.canDash = true;
    this.dashing = 0;
    this.squashX = 0.75; this.squashY = 1.3;
  }

  update(world) {
    const C = Player.C;
    const frozen = !!world.cutscene;
    const inp = (a) => !frozen && Input.down(a);
    const press = (a) => !frozen && Input.pressed(a);

    this.prevY = this.y;
    if (this.invuln > 0) this.invuln--;
    if (this.dashCool > 0) this.dashCool--;
    if (this.shootCool > 0) this.shootCool--;
    if (this.dropTimer > 0) this.dropTimer--;
    for (const k in this.powers) if (this.powers[k] > 0) this.powers[k]--;
    if (this.blockCool > 0) this.blockCool--;
    if (this.jetCool > 0) this.jetCool--;
    if (this.sudo > 0) this.sudo--;
    if (this.sudoCool > 0) this.sudoCool--;
    if (this.killCool > 0) this.killCool--;
    // ---- World 6 abilities ----
    if (this.has("sudo") && press("sudo") && this.sudoCool <= 0) {
      this.sudo = C.sudoFrames; this.sudoCool = C.sudoCool;
      world.particles.ring(U.cx(this), U.cy(this), "#fcaf3e", 40, 18);
      sfx.play("sudo");
      Save.markSeen("sudo");
    }
    if (this.has("pipe") && press("pipe")) this.usePipe(world);
    if (this.has("killProcess")) {
      this.killTarget = this.killCool <= 0 ? this.findKillTarget(world) : null;
      if (press("kill") && this.killTarget) {
        const o = this.killTarget;
        world.particles.burst(U.cx(o), U.cy(o), 30, "#ef2929", 6, { shape: "square" });
        world.particles.ring(U.cx(o), U.cy(o), "#ef2929", 40);
        world.killEntity(o);
        this.killCool = C.killCool; this.killTarget = null;
        sfx.play("kill");
        Save.markSeen("killProcess");
      } else if (press("kill")) sfx.play("blocked");
    }
    if (this.jetT > 0) this.jetT--;
    // ---- World 3 abilities: Pixel Shrink (toggle) and Block Place ----
    if (this.has("shrink") && press("shrink")) this.toggleShrink(world);
    if (this.has("minimize") && press("minimize")) { this.toggleForm(world, "mini", "minimize"); Save.markSeen("minimize"); }
    if (this.has("maximize") && press("maximize")) { this.toggleForm(world, "max", "maximize"); Save.markSeen("maximize"); }
    if (this.has("blockPlace") && press("block") && this.blockCool <= 0) this.placeBlock(world);

    // Gravity: s = +1 normally, -1 inside a flip field (everything mirrors).
    const s = this.gravFlip ? -1 : 1;
    const gmul = world.gravity * (this.lowGrav ? C.lowGrav : 1) * (this.heavy ? C.heavyGrav : 1);
    const g = C.gravity * gmul;
    const maxFall = C.maxFall * Math.sqrt(gmul);
    const form = Player.FORMS[this.form] || Player.FORMS.normal;
    const speed = C.runSpeed * (this.powers.speed > 0 ? 1.4 : 1) * form.speed;

    // ---- timers that depend on contact ----
    if (this.onGround) {
      this.coyote = C.coyote;
      this.airJumps = this.has("doubleJump") ? 1 : 0;
      this.canDash = true;
    } else if (this.coyote > 0) this.coyote--;
    if (press("jump")) this.jumpBuffer = C.buffer;
    else if (this.jumpBuffer > 0) this.jumpBuffer--;

    let move = (inp("right") ? 1 : 0) - (inp("left") ? 1 : 0);
    if (this.wallLock > 0) { this.wallLock--; if (move === this.lastWall) move = 0; }

    // ---- World 5 abilities ----
    if (this.hook && press("jump")) this.unhook(true);
    else if (this.has("grapple") && press("grapple") && s > 0) { if (this.hook) this.unhook(false); else this.tryHook(world); }
    if (this.has("jetpack") && press("jetpack") && this.jetCool <= 0 && s > 0) {
      this.unhook(false);
      this.slamming = false; this.dashing = 0; this.jumping = false;
      this.vy = Math.min(this.vy, -C.jetV); this.onGround = false; this.coyote = 0;
      this.jetCool = C.jetCool; this.jetT = 14;
      world.particles.burst(U.cx(this), this.y + this.h, 12, "#ffb347", 4, { glow: true });
      sfx.play("jet");
      Save.markSeen("jetpack");
    }
    if (this.has("groundSlam") && !this.onGround && !this.slamming && !this.hook && s > 0 && (press("slam") || press("down"))) {
      this.slamming = true; this.dashing = 0; this.jumping = false;
      this.vx = 0; this.vy = Math.max(this.vy, 4);
      world.particles.ring(U.cx(this), U.cy(this), "#ffb347", 18, 14);
    }

    if (this.hook) this.swing(world, move);
    else if (this.dashing > 0) {
      // ---- dash: fixed speed, no gravity ----
      this.dashing--;
      this.vx = this.dashDir * C.dashSpeed;
      this.vy = 0;
      if (world.time % 2 === 0) this.trail.push({ x: this.x, y: this.y, life: 12 });
      world.particles.emit(U.cx(this), U.cy(this) + U.rand(-8, 8), {
        vx: -this.dashDir * 2, vy: U.rand(-0.5, 0.5), life: 14, size: 3, color: this.has("dataDash") ? "#39ff88" : "#ff3df0", shape: "square",
      });
      if (this.dashing === 0) this.vx = this.dashDir * speed;
    } else {
      // ---- horizontal ----
      const target = move * speed;
      let accel;
      if (this.onGround) accel = move !== 0 ? C.accelGround : C.friction;
      else accel = move !== 0 ? C.accelAir : C.airFriction;
      if (Math.abs(this.vx) > speed && Math.sign(this.vx) === move) accel = C.airFriction; // keep momentum
      this.vx = U.approach(this.vx, target, accel);
      if (move !== 0) this.facing = move;

      // ---- gravity ----
      this.vy += g * s;

      // ---- walls ----
      this.wallDir = Physics.touchingWall(world, this, -1) ? -1 : Physics.touchingWall(world, this, 1) ? 1 : 0;
      this.wallSliding = !this.onGround && this.wallDir !== 0 && move === this.wallDir && this.vy * s > 0;
      if (this.wallDir !== 0 && !this.onGround) {
        this.wallCoyote = C.wallCoyote; this.lastWall = this.wallDir;
        this.airJumps = this.has("doubleJump") ? 1 : 0;
      } else if (this.wallCoyote > 0) this.wallCoyote--;
      if (this.wallSliding) {
        this.vy = s * Math.min(this.vy * s, C.wallSlide);
        this.canDash = true;
        if (world.time % 5 === 0)
          world.particles.emit(this.wallDir > 0 ? this.x + this.w : this.x, this.y + this.h - 4, {
            vx: -this.wallDir * 0.6, vy: -0.5, life: 14, size: 2.5, color: "#9fe8ff", shape: "square",
          });
      }
      this.vy = s * Math.min(this.vy * s, this.wallSliding ? C.wallSlide : maxFall);
      if (this.slamming) { this.vx *= 0.7; this.vy = Math.min(16, Math.max(this.vy, 6) + 1.2); this.jumpBuffer = 0; this.wallSliding = false; }

      // ---- drop through one-way platforms ----
      const dropRequest = s > 0 && inp("down") && this.jumpBuffer > 0 && this.onGround && this.standingOnOneway(world);
      if (dropRequest) {
        this.dropTimer = 12; this.jumpBuffer = 0; this.onGround = false; this.coyote = 0;
        this.y += 1;
        Save.markSeen("drop");
      }

      // ---- jumping ----
      if (this.jumpBuffer > 0) {
        if (this.coyote > 0) {
          this.vy = -C.jumpV * s * form.jump; this.jumping = true;
          this.coyote = 0; this.jumpBuffer = 0; this.onGround = false;
          this.squashX = 0.7; this.squashY = 1.35;
          world.particles.dust(U.cx(this), this.y + this.h);
          sfx.play("jump");
        } else if (this.wallCoyote > 0) {
          const d = this.wallDir || this.lastWall;
          this.vy = -C.wallJumpVY * s * form.jump; this.vx = -d * C.wallJumpVX;
          this.jumping = true; this.facing = -d;
          this.wallLock = C.wallLock; this.lastWall = d; this.wallCoyote = 0; this.jumpBuffer = 0;
          this.squashX = 0.75; this.squashY = 1.3;
          world.particles.dust(d > 0 ? this.x + this.w : this.x, U.cy(this), "#9fe8ff", 6, -d * 1.5);
          sfx.play("jump");
          Save.markSeen("wallJump");
        } else if (this.airJumps > 0) {
          this.airJumps--;
          this.vy = -C.doubleJumpV * s * form.jump; this.jumping = true; this.jumpBuffer = 0;
          this.squashX = 0.75; this.squashY = 1.3;
          world.particles.ring(U.cx(this), this.y + this.h, "#00f0ff", 18, 18);
          world.particles.burst(U.cx(this), this.y + this.h, 8, "#00f0ff", 2);
          sfx.play("doubleJump");
          Save.markSeen("doubleJump");
        }
      }
      // Variable jump height: releasing jump early cuts the rise.
      if (this.jumping && this.vy * s < 0 && !inp("jump")) { this.vy *= C.jumpCut; this.jumping = false; }
      if (this.vy * s >= 0) this.jumping = false;

      // ---- dash ----
      if (this.has("dash") && press("dash") && this.canDash && this.dashCool <= 0) {
        this.dashing = C.dashFrames;
        this.slamming = false;
        this.dashDir = move || this.facing;
        this.facing = this.dashDir;
        this.canDash = false;
        this.dashCool = C.dashCool;
        this.jumping = false;
        world.camera.shake(2);
        world.particles.ring(U.cx(this), U.cy(this), "#ff3df0", 20, 16);
        sfx.play("dash");
        Save.markSeen("dash");
        if (this.has("dataDash")) Save.markSeen("dataDash");
      }
    }

    // ---- Freeze Process (world 2 ability): stop enemies and moving hazards ----
    if (this.has("freeze") && press("freeze") && !(world.freezeCool > 0)) {
      world.freeze(C.freezeFrames);
      world.freezeCool = C.freezeCool;
      sfx.play("freeze");
      Save.markSeen("freeze");
    }

    // ---- weapons: switch (Q/E, 1-9, touch WPN) and fire ----
    if (this.weapons.length) {
      if (press("weaponNext")) this.selectWeapon(this.weaponIdx + 1);
      if (press("weaponPrev")) this.selectWeapon(this.weaponIdx - 1);
      for (let k = 1; k <= 9; k++) if (press("weapon" + k) && k <= this.weapons.length) this.selectWeapon(k - 1);
      // Charges recharge for every weapon, selected or not.
      for (const name of this.weapons) {
        const d = Weapons.get(name);
        if (!d || d.ammo == null || this.ammo[name] >= d.ammo) continue;
        if (++this.ammoT[name] >= d.regen) { this.ammoT[name] = 0; this.ammo[name]++; }
      }
      const def = this.small ? null : this.weaponDef(); // too tiny to hold a weapon
      if (def && press("shoot") && this.shootCool <= 0) {
        const name = this.weapons[this.weaponIdx];
        if (this.ammo[name] >= 1) {
          this.shootCool = def.cooldown;
          if (def.ammo != null) this.ammo[name]--;
          def.fire(world, this);
          world.particles.burst(this.facing > 0 ? this.x + this.w + 4 : this.x - 4, this.y + 13, 5, def.color, 2);
          Save.markSeen("shoot");
        } else {
          this.shootCool = 10;
          sfx.play("blocked"); // empty: wait for it to recharge
        }
      }
    }

    // ---- move ----
    this.lastVy = this.vy;
    const wasGround = this.onGround;
    const res = Physics.move(world, this, this.vx, this.vy, { drop: this.dropTimer > 0 });
    if (res.hitX) {
      if (this.dashing > 0) { this.dashing = 0; world.camera.shake(3); }
      this.vx = 0;
    }
    const slamHit = this.slamming && res.hitY && this.lastVy > 0;
    if (res.hitY) {
      if (!wasGround && this.vy * s > 3) {
        this.squashX = 1.3; this.squashY = 0.72;
        world.particles.dust(U.cx(this), this.y + this.h, "#8fb8ff", Math.min(10, Math.floor(this.vy)));
        sfx.play("land");
      }
      this.vy = 0;
    }
    if (s > 0) {
      this.onGround = res.onGround;
      this.ground = res.ground;
    } else {
      // Flipped: the "ground" is whatever stopped us moving up.
      this.onGround = res.hitY && this.lastVy < 0;
      this.ground = null;
    }
    this.flipped = s < 0;
    if (slamHit) this.slamLand(world);
    if (this.hook && this.onGround && this.hook.t > 12 && this.hook.reel <= 0) this.unhook(false);
    if (this.onGround && this.form === "normal" && world.time % 6 === 0 && this.invuln <= 0) {
      this.history.push({ x: this.x, y: this.y, hp: this.hp, t: world.time });
      if (this.history.length > 40) this.history.shift();
    }
    // Gravity fields set these again each frame.
    this.lowGrav = false; this.gravFlip = false; this.heavy = false;
    // Falling "up" out of the top of the map works like a pit.
    if (this.flipped && this.y < -4 * TILE) world.fallOut();

    // ---- cosmetics ----
    if (this.jetT > 0 || this.slamming)
      world.particles.emit(U.cx(this) + U.rand(-5, 5), this.slamming ? this.y : this.y + this.h, {
        vx: U.rand(-0.6, 0.6), vy: this.slamming ? -2 : 3, life: 16, size: 4, color: this.slamming ? "#ffb347" : U.pick(["#ffb347", "#ff6a1a", "#fff3c4"]), glow: true });
    this.squashX = U.lerp(this.squashX, 1, 0.2);
    this.squashY = U.lerp(this.squashY, 1, 0.2);
    if (this.onGround && Math.abs(this.vx) > 0.5) {
      this.runAnim += Math.abs(this.vx) * 0.08;
      if (world.time % 9 === 0) world.particles.dust(U.cx(this), this.y + this.h, "#5d7fb8", 1);
    }
    for (const t of this.trail) t.life--;
    this.trail = this.trail.filter((t) => t.life > 0);
    if (this.powers.speed > 0 && world.time % 3 === 0 && Math.abs(this.vx) > 1)
      world.particles.emit(U.cx(this), U.cy(this), { vx: -this.vx * 0.2, life: 16, size: 3, color: "#ffb400", shape: "square" });
  }

  standingOnOneway(world) {
    const r = Math.floor((this.y + this.h + 1) / TILE);
    const c0 = Math.floor(this.x / TILE), c1 = Math.floor((this.x + this.w - 0.01) / TILE);
    let one = false;
    for (let c = c0; c <= c1; c++) {
      const t = Physics.tileAt(world, c, r);
      if (Physics.isSolidCode(t)) return false;
      if (t === T_ONEWAY) one = true;
    }
    return one && !this.ground;
  }

  /** Exit animation (rising beam). */
  warpAnim(world) {
    this.warp++;
    this.vx = 0;
    this.y -= Math.min(4, this.warp * 0.08);
    if (world.time % 2 === 0)
      world.particles.emit(U.cx(this) + U.rand(-12, 12), this.y + this.h, { vy: -3, life: 26, size: 3, color: "#7dff4a", shape: "square" });
  }

  draw(ctx, world) {
    if (!this.alive) return;
    if (this.invuln > 0 && world.state === "play" && Math.floor(this.invuln / 4) % 2 === 0) return;

    // Pipe ends (and the link between them).
    for (const q of [this.pipeA, this.pipeB]) {
      if (!q) continue;
      ctx.fillStyle = "#1e1e1e"; ctx.fillRect(q.x - 10, q.y - 30, 20, 30);
      ctx.fillStyle = "#8ae234"; ctx.fillRect(q.x - 12, q.y - 32, 24, 4); ctx.fillRect(q.x - 2, q.y - 26, 4, 22);
    }
    if (this.pipeA && this.pipeB) {
      ctx.strokeStyle = "rgba(138,226,52,0.25)"; ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
      ctx.beginPath(); ctx.moveTo(this.pipeA.x, this.pipeA.y - 32); ctx.lineTo(this.pipeB.x, this.pipeB.y - 32); ctx.stroke(); ctx.setLineDash([]);
    }
    // Kill Process target reticle.
    const kt = this.killTarget;
    if (kt && !kt.dead) {
      const tx = U.cx(kt), ty = U.cy(kt), r = Math.max(kt.w, kt.h) / 2 + 6 + Math.sin(world.time * 0.2) * 2;
      ctx.strokeStyle = "#ef2929"; ctx.lineWidth = 2;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.beginPath(); ctx.moveTo(tx + sx * r, ty + sy * (r - 6)); ctx.lineTo(tx + sx * r, ty + sy * r); ctx.lineTo(tx + sx * (r - 6), ty + sy * r); ctx.stroke();
      }
    }
    // Grapple rope.
    if (this.hook) {
      ctx.strokeStyle = "#c9c2ba"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(U.cx(this), U.cy(this)); ctx.lineTo(this.hook.x, this.hook.y); ctx.stroke();
    }
    // Dash afterimages.
    for (const t of this.trail) {
      ctx.globalAlpha = t.life / 24;
      ctx.fillStyle = "#ff3df0";
      U.roundRect(ctx, t.x, t.y, this.w, this.h, 5);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const drawScale = (Player.FORMS[this.form] || Player.FORMS.normal).draw;
    if (drawScale !== 1) {
      const fx = this.x + this.w / 2, fy = this.y + this.h;
      ctx.save();
      ctx.translate(fx, fy); ctx.scale(drawScale, drawScale); ctx.translate(-fx, -fy);
    }
    if (this.flipped) {
      ctx.save();
      ctx.translate(0, (this.y + this.h / 2) * 2);
      ctx.scale(1, -1);
    }
    const cx = this.x + this.w / 2, by = this.y + this.h;
    const w = 24 * this.squashX, h = 30 * this.squashY;
    const x = cx - w / 2, y = by - h;
    const warpA = this.warp ? Math.max(0, 1 - this.warp / 70) : 1;
    ctx.globalAlpha = warpA;

    // Body glow (amber while Sudo is active).
    U.glow(ctx, cx, by - h / 2, 34, this.sudo > 0 ? "#fcaf3e" : this.dashing > 0 ? "#ff3df0" : "#00c8ff", 0.45);

    // Shield bubble.
    if (this.powers.shield > 0) {
      const a = this.powers.shield < 120 && Math.floor(this.powers.shield / 6) % 2 ? 0.2 : 0.55;
      ctx.strokeStyle = U.rgba("#59a7ff", a);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, by - h / 2, 24 + Math.sin(world.time * 0.2) * 1.5, 0, 6.28); ctx.stroke();
      ctx.fillStyle = U.rgba("#59a7ff", 0.08); ctx.fill();
    }

    // Feet / treads.
    const step = this.onGround && Math.abs(this.vx) > 0.5 ? Math.sin(this.runAnim * 3) * 2 : 0;
    ctx.fillStyle = "#1b2a4a";
    ctx.fillRect(x + 3, by - 5 + step, 7, 5 - step);
    ctx.fillRect(x + w - 10, by - 5 - step, 7, 5 + step);

    // Chassis.
    ctx.fillStyle = "#14203c";
    U.roundRect(ctx, x, y, w, h - 4, 6);
    ctx.fill();
    ctx.strokeStyle = this.sudo > 0 ? (this.sudo < 60 && world.time % 8 < 4 ? "#00f0ff" : "#fcaf3e") : this.dashing > 0 ? "#ff3df0" : "#00f0ff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Visor strip (glows; shifts toward facing direction).
    const vx = x + 4 + (this.facing > 0 ? 3 : 0), vy = y + 7;
    ctx.fillStyle = "#00f0ff";
    ctx.fillRect(vx, vy, w - 11, 5);
    U.glow(ctx, vx + (w - 11) / 2, vy + 2, 14, "#00f0ff", 0.8);

    // Chest light shows upgrades: lime = pulse, magenta = dash.
    ctx.fillStyle = this.has("pulse") ? "#7dff4a" : this.has("dash") ? "#ff3df0" : "#2b4a7a";
    ctx.fillRect(cx - 2, y + h - 14, 4, 4);

    // Antenna light.
    ctx.strokeStyle = "#2b4a7a";
    ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx - this.facing * 3, y - 6); ctx.stroke();
    ctx.fillStyle = this.airJumps > 0 || this.onGround ? "#ffe14d" : "#4a4a2a";
    ctx.fillRect(cx - this.facing * 3 - 2, y - 8, 4, 4);

    ctx.globalAlpha = 1;
    if (this.flipped) ctx.restore();
    if (drawScale !== 1) ctx.restore();
  }
}

/** Tunable movement constants. */
Player.C = {
  runSpeed: 4.2,
  accelGround: 0.85,
  friction: 0.9,
  accelAir: 0.55,
  airFriction: 0.2,
  gravity: 0.6,
  lowGrav: 0.42,
  maxFall: 12,
  jumpV: 11.5,
  doubleJumpV: 10,
  jumpCut: 0.45,
  coyote: 7,
  buffer: 8,
  wallSlide: 2.4,
  wallCoyote: 6,
  wallJumpVX: 5.5,
  wallJumpVY: 10.5,
  wallLock: 9,
  heavyGrav: 1.7,
  freezeFrames: 180,  // Freeze Process lasts 3 s…
  freezeCool: 540,    // …and recharges in 9 s
  smallJump: 0.85,    // Pixel Shrink: slightly lower jumps
  blockCool: 70,      // Block Place cooldown (frames)
  jetV: 10,           // Jetpack Burst: upward speed...
  jetCool: 80,        // ...and its cooldown (frames)
  sudoFrames: 240,    // Sudo lasts 4 s...
  sudoCool: 720,      // ...and is ready again 12 s after use
  killCool: 900,      // Kill Process: 15 s cooldown
  killRange: 10,      // tiles
  dashSpeed: 12,
  dashFrames: 11,
  dashCool: 16,
  shootCool: 16,
};

/** Body forms: hitbox size, draw scale, run-speed and jump multipliers. */
Player.FORMS = {
  normal: { w: 20, h: 28, draw: 1, speed: 1, jump: 1, color: "#00f0ff" },
  pixel: { w: 10, h: 14, draw: 0.5, speed: 1, jump: 0.85, color: "#ffec27" },   // World 3: Pixel Shrink
  mini: { w: 12, h: 10, draw: 0.38, speed: 1.3, jump: 0.72, color: "#4fc3ff" },  // World 4: Minimize
  max: { w: 30, h: 42, draw: 1.5, speed: 0.85, jump: 0.95, color: "#ffffff" },   // World 4: Maximize
};

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
    this.maxHp = 3;   // the World sets the real value (3, +1 every 2 worlds)
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
    // Solid right away (the solid list is otherwise rebuilt next frame, and
    // falling into it this frame would push you off its side).
    b.active = true;
    if (!world.solids.includes(b)) world.solids.push(b);
    // Mid-air: land on it straight away (the block appears under your feet,
    // so you never get pushed off its side).
    if (!this.onGround) {
      const top = { x: this.x, y: cell.y - this.h, w: this.w, h: this.h };
      if (!Physics.bodyBlocked(world, top, false)) { this.y = top.y; this.vy = Math.min(this.vy, 0); }
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
    this.hurtT = 0; this.spawnT = 0; this.flipT = 0;
    this.scarf = null;
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
      if (world.time % 2 === 0) this.trail.push({ x: this.x, y: this.y, life: 12, pose: this.pose(world) });
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
          this.flipT = 24;
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
          const mx = this.facing > 0 ? this.x + this.w + 4 : this.x - 4;
          world.particles.burst(mx, this.y + 13, 5, def.color, 2);
          world.particles.emit(mx, this.y + 13, { shape: "glow", size: 16, life: 6, color: def.color });   // muzzle flash
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
        world.particles.dust(U.cx(this), this.y + this.h, "#8fb8ff", Math.min(8, Math.floor(this.vy)));
        world.particles.puff(U.cx(this), this.y + this.h, "#9fb4d8", Math.min(1.4, this.vy / 9));
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
    if (this.hurtT > 0) this.hurtT--;
    if (this.spawnT > 0) this.spawnT--;
    if (this.flipT > 0) this.flipT--;
    this.updateScarf();
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
    // Hurt frames flicker (dim, not invisible, so you never lose sight of yourself).
    const blink = this.invuln > 0 && world.state === "play" && Math.floor(this.invuln / 4) % 2 === 0;

    // Pipe ends (and the link between them).
    for (const q of [this.pipeA, this.pipeB]) {
      if (!q) continue;
      ctx.fillStyle = "#1e1e1e"; ctx.fillRect(q.x - 10, q.y - 30, 20, 30);
      ctx.fillStyle = "#8ae234"; ctx.fillRect(q.x - 12, q.y - 32, 24, 4); ctx.fillRect(q.x - 2, q.y - 26, 4, 22);
      U.glow(ctx, q.x, q.y - 30, 26, "#8ae234", 0.4);
    }
    if (this.pipeA && this.pipeB) {
      ctx.strokeStyle = "rgba(138,226,52,0.25)"; ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
      ctx.lineDashOffset = -world.time * 0.5;
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
    // Grapple rope: a taut line with a glint running along it.
    if (this.hook) {
      const hx = this.hook.x, hy = this.hook.y, px = U.cx(this), py = U.cy(this) - 4;
      ctx.strokeStyle = "#8a827a"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.strokeStyle = "#e8e0d8"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(hx, hy); ctx.stroke();
      const k = (world.time * 0.06) % 1;
      U.glow(ctx, px + (hx - px) * k, py + (hy - py) * k, 10, "#ffb347", 0.8);
    }

    const form = Player.FORMS[this.form] || Player.FORMS.normal;
    const drawScale = form.draw;
    const accent = this.sudo > 0 ? (this.sudo < 60 && world.time % 8 < 4 ? "#00f0ff" : "#fcaf3e") : this.dashing > 0 ? (this.has("dataDash") ? "#39ff88" : "#ff3df0") : this.form === "pixel" ? "#ffec27" : "#00f0ff";
    const pose = this.pose(world);

    // Dash afterimages: ghost silhouettes along the path.
    for (const t of this.trail) {
      ctx.save();
      ctx.globalAlpha = (t.life / 12) * 0.45;
      Player.drawFigure(ctx, t.x + this.w / 2, t.y + this.h, this.facing, t.pose || pose, { ghost: this.has("dataDash") ? "#39ff88" : "#ff3df0", scale: drawScale });
      ctx.restore();
    }

    // Energy scarf (behind the body), in world coordinates.
    if (this.scarf && this.form !== "mini") this.drawScarf(ctx, world, accent);

    const cx = this.x + this.w / 2, by = this.y + this.h;
    ctx.save();
    if (this.flipped) { ctx.translate(0, (this.y + this.h / 2) * 2); ctx.scale(1, -1); }
    let alpha = this.warp ? Math.max(0, 1 - this.warp / 70) : 1;
    if (blink) alpha *= 0.35;
    if (this.spawnT > 0) alpha *= 1 - this.spawnT / 30;
    ctx.globalAlpha = alpha;
    // Soft body glow.
    U.glow(ctx, cx, by - 15 * drawScale, 36 * drawScale, accent, 0.4);
    // Contact shadow on the ground.
    if (this.onGround && !this.flipped) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath(); ctx.ellipse(cx, by, 11 * drawScale * this.squashX, 2.5, 0, 0, 6.28); ctx.fill();
    }
    // Shield bubble.
    if (this.powers.shield > 0) {
      const a = this.powers.shield < 120 && Math.floor(this.powers.shield / 6) % 2 ? 0.2 : 0.55;
      const r = 24 * Math.max(0.6, drawScale) + Math.sin(world.time * 0.2) * 1.5, sy = by - 15 * drawScale;
      ctx.strokeStyle = U.rgba("#59a7ff", a); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, sy, r, 0, 6.28); ctx.stroke();
      ctx.fillStyle = U.rgba("#59a7ff", 0.08); ctx.fill();
      ctx.strokeStyle = U.rgba("#cfe6ff", a * 0.8); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, sy, r - 3, -2.4 + world.time * 0.05, -1.6 + world.time * 0.05); ctx.stroke();
    }
    Player.drawFigure(ctx, cx, by, this.facing, pose, {
      scale: drawScale, sx: this.squashX, sy: this.squashY, accent,
      chest: this.has("pulse") ? "#7dff4a" : this.has("dash") ? "#ff3df0" : "#2b4a7a",
      tip: this.airJumps > 0 || this.onGround ? "#ffe14d" : "#4a4a2a",
      hurt: this.hurtT > 0 && Math.floor(this.hurtT / 3) % 2 === 0,
      time: world.time, jet: this.jetT > 0 || this.slamming, pixel: this.form === "pixel",
    });
    ctx.restore();
    // Respawn: a column of light that the body materialises in.
    if (this.spawnT > 0) {
      const k = this.spawnT / 30;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const g = ctx.createLinearGradient(0, by - 140, 0, by);
      g.addColorStop(0, U.rgba(accent, 0)); g.addColorStop(1, U.rgba(accent, 0.5 * k));
      ctx.fillStyle = g; ctx.fillRect(cx - 14 * k - 4, by - 140, 28 * k + 8, 140);
      ctx.restore();
    }
  }

  /** The current animation pose (joint angles, radians; 0 = straight down,
   *  positive = toward the facing direction). Purely cosmetic. */
  pose(world) {
    const t = world.time;
    const P = { lean: 0, bob: 0, hipF: 0.1, kneeF: 0.15, hipB: -0.1, kneeB: 0.15, shF: 0.15, elF: 0.4, shB: -0.15, elB: 0.4, head: 0 };
    const s = this.flipped ? -1 : 1, vy = this.vy * s;
    if (this.hurtT > 0) {
      Object.assign(P, { lean: -0.45, hipF: 0.5, kneeF: 0.6, hipB: -0.2, kneeB: 0.8, shF: -2.3, elF: 0.6, shB: -1.9, elB: 0.8, head: -0.2 });
    } else if (this.hook) {
      Object.assign(P, { lean: 0.1, hipF: 0.4, kneeF: 0.9, hipB: -0.2, kneeB: 0.5, shF: -2.8, elF: 0.1, shB: -2.5, elB: 0.2 });
    } else if (this.slamming) {
      Object.assign(P, { lean: 0.15, hipF: -1.4, kneeF: 2.2, hipB: -1.1, kneeB: 2.0, shF: -2.6, elF: 0.4, shB: -2.4, elB: 0.4 });
    } else if (this.dashing > 0) {
      Object.assign(P, { lean: 0.75, hipF: 0.6, kneeF: 0.6, hipB: 1.3, kneeB: 0.3, shF: 1.4, elF: 0.3, shB: 1.7, elB: 0.2, head: -0.3 });
    } else if (this.wallSliding) {
      const k = Math.sin(t * 0.3) * 0.05;
      Object.assign(P, { lean: -0.1, hipF: -0.9, kneeF: 1.5, hipB: 0.2, kneeB: 0.6, shF: -2.5 + k, elF: 0.5, shB: -0.6, elB: 0.9, head: -0.15 });
    } else if (!this.onGround) {
      if (vy < -1) {
        Object.assign(P, { lean: 0.1, hipF: -0.95, kneeF: 1.7, hipB: 0.35, kneeB: 0.7, shF: -2.3, elF: 0.3, shB: 0.9, elB: 0.6 });
        if (this.flipT > 0) P.lean = (1 - this.flipT / 24) * Math.PI * 2;   // a flip on the double jump
      } else {
        const fl = Math.sin(t * 0.35) * 0.2;
        Object.assign(P, { lean: 0.05, hipF: -0.3, kneeF: 0.4, hipB: 0.35, kneeB: 0.5, shF: -1.4 + fl, elF: 0.5, shB: -1.7 - fl, elB: 0.5, head: 0.1 });
      }
    } else if (Math.abs(this.vx) > 0.5) {
      const ph = this.runAnim * 1.6, sp = U.clamp(Math.abs(this.vx) / 4.2, 0.4, 1.3);
      P.lean = 0.2 * sp;
      P.bob = -Math.abs(Math.sin(ph)) * 1.6 * sp;
      P.hipF = Math.sin(ph) * 0.95 * sp; P.kneeF = 0.25 + Math.max(0, -Math.cos(ph)) * 1.3 * sp;
      P.hipB = -Math.sin(ph) * 0.95 * sp; P.kneeB = 0.25 + Math.max(0, Math.cos(ph)) * 1.3 * sp;
      P.shF = -Math.sin(ph) * 0.9 * sp; P.elF = 0.9; P.shB = Math.sin(ph) * 0.9 * sp; P.elB = 0.9;
    } else {
      // Idle: breathing, a slow look around.
      const b = Math.sin(t * 0.06);
      P.bob = b * 0.7; P.shF = 0.12 + b * 0.05; P.shB = -0.12 - b * 0.05;
      P.head = Math.sin(t * 0.013) > 0.85 ? 0.12 : 0;
    }
    if (this.shootCool > (Player.C.shootCool - 6) && !this.dashing) { P.shF = -1.5; P.elF = 0; } // aim the front arm
    return P;
  }

  /** Energy scarf: a short chain that trails behind the neck (cosmetic). */
  updateScarf() {
    const n = 7, seg = 3.4 * ((Player.FORMS[this.form] || {}).draw || 1);
    const s = this.flipped ? -1 : 1;
    const ax = this.x + this.w / 2 - this.facing * 3, ay = this.flipped ? this.y + this.h * 0.3 : this.y + this.h * 0.32;
    if (!this.scarf || this.scarf.length !== n) this.scarf = Array.from({ length: n }, (_, i) => ({ x: ax - this.facing * i * seg, y: ay }));
    const sc = this.scarf;
    sc[0].x = ax; sc[0].y = ay;
    for (let i = 1; i < n; i++) {
      const p = sc[i], q = sc[i - 1];
      p.y += 0.55 * s; p.x -= this.vx * 0.06; p.x += Math.sin(this.runAnim * 2 + i) * 0.15;
      const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1;
      p.x = q.x + (dx / d) * seg; p.y = q.y + (dy / d) * seg;
    }
  }
  drawScarf(ctx, world, accent) {
    const sc = this.scarf;
    ctx.save();
    ctx.lineCap = "round";
    const col = this.dashing > 0 ? accent : "#ff3df0";
    for (let i = 1; i < sc.length; i++) {
      ctx.strokeStyle = U.rgba(col, 0.95 - i * 0.1);
      ctx.lineWidth = Math.max(1, 4.2 - i * 0.5);
      ctx.beginPath(); ctx.moveTo(sc[i - 1].x, sc[i - 1].y); ctx.lineTo(sc[i].x, sc[i].y); ctx.stroke();
    }
    U.glow(ctx, sc[sc.length - 1].x, sc[sc.length - 1].y, 10, col, 0.5);
    ctx.restore();
  }

  /**
   * Draw the robot from shapes at feet position (cx, by). No face: a helmet
   * with a glowing visor band. o: { scale, sx, sy, accent, chest, tip, hurt,
   * time, jet, ghost (single-colour silhouette), pixel }
   */
  static drawFigure(ctx, cx, by, facing, P, o = {}) {
    const f = facing >= 0 ? 1 : -1, sc = o.scale || 1;
    const accent = o.accent || "#00f0ff";
    const ghost = o.ghost;
    const body = ghost || (o.hurt ? "#5a1a2a" : "#16233f");
    const plate = ghost || (o.hurt ? "#ff4d6d" : "#2a3f6e");
    const dark = ghost || "#0c1428";
    ctx.save();
    ctx.translate(cx, by);
    ctx.scale(sc * (o.sx || 1), sc * (o.sy || 1));
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const lean = P.lean || 0;
    // A full flip spins the whole body around its middle.
    if (Math.abs(lean) > 1.2) { ctx.translate(0, -14); ctx.rotate(lean * f); ctx.translate(0, 14); }
    const tl = Math.abs(lean) > 1.2 ? 0 : lean;
    const hipY = -11 + (P.bob || 0);
    // Joint helper: angle 0 = down, positive = toward facing.
    const pt = (x, y, a, l) => [x + Math.sin(a) * l * f, y + Math.cos(a) * l];
    const limb = (x, y, a1, l1, a2, l2, w, col, leg) => {
      const [kx, ky] = pt(x, y, a1, l1);
      const [ex, ey] = pt(kx, ky, a1 + a2 * (leg ? -1 : 1), l2);
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(kx, ky); ctx.lineTo(ex, ey); ctx.stroke();
      return [ex, ey];
    };
    // Back limbs (darker, behind the body).
    const [bfx, bfy] = limb(-1 * f, hipY, P.hipB, 5.6, P.kneeB, 5.6, 4.2, dark, true);
    if (!ghost) { ctx.fillStyle = dark; U.roundRect(ctx, bfx - 3.5 + f, bfy - 2, 7, 3.5, 1.5); ctx.fill(); }
    const sh = pt(0, hipY, Math.PI + tl, 8.5);
    limb(sh[0] - f, sh[1], P.shB, 4.6, P.elB, 4.4, 3.4, dark);
    // Backpack with a thruster light.
    const bp = pt(-3.5 * f, hipY, Math.PI + tl, 6);
    ctx.save(); ctx.translate(bp[0], bp[1]); ctx.rotate(tl * f);
    ctx.fillStyle = body; U.roundRect(ctx, -2.5 - 2 * f, -4, 5, 8, 1.5); ctx.fill();
    if (!ghost) {
      ctx.fillStyle = o.jet ? "#ffb347" : U.rgba(accent, 0.6);
      ctx.fillRect(-1.5 - 2 * f, 3, 3, 2);
      if (o.jet) U.glow(ctx, -2 * f, 6, 12, "#ffb347", 0.9);
    }
    ctx.restore();
    // Torso.
    ctx.save(); ctx.translate(0, hipY); ctx.rotate(tl * f);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.lineTo(6.5, -9.5); ctx.lineTo(-6.5, -9.5); ctx.closePath(); ctx.fill();
    if (!ghost) {
      ctx.strokeStyle = accent; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = plate; ctx.fillRect(-5.5, -9.5, 11, 3);                 // shoulder plate
      ctx.fillStyle = o.chest || "#2b4a7a"; ctx.fillRect(-1.5 + f * 1.5, -6, 3, 3); // chest light
      ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(-4, -2.5, 8, 1);
      ctx.fillStyle = dark; ctx.fillRect(-5, -1.5, 10, 1.5);                   // belt
    }
    ctx.restore();
    // Front leg.
    const [ffx, ffy] = limb(1 * f, hipY, P.hipF, 5.6, P.kneeF, 5.6, 4.6, body, true);
    if (!ghost) {
      ctx.fillStyle = body; U.roundRect(ctx, ffx - 3.5 + f, ffy - 2, 7.5, 3.8, 1.5); ctx.fill();
      ctx.fillStyle = accent; ctx.fillRect(ffx - 3 + f, ffy + 1.2, 6.5, 0.9);   // sole light
    }
    // Helmet.
    const hd = pt(0, hipY, Math.PI + tl, 15.5);
    ctx.save(); ctx.translate(hd[0], hd[1]); ctx.rotate((tl + (P.head || 0)) * f);
    ctx.fillStyle = body;
    if (o.pixel) ctx.fillRect(-7, -6, 14, 12); else { U.roundRect(ctx, -7.5, -6.5, 15, 13, 5); ctx.fill(); }
    if (!ghost) {
      ctx.strokeStyle = accent; ctx.lineWidth = 1.4;
      if (o.pixel) ctx.strokeRect(-7, -6, 14, 12); else ctx.stroke();
      // Visor band (no face): glows and sits toward the facing side.
      ctx.fillStyle = "#03101c"; ctx.fillRect(-6 + f, -2.5, 12, 5);
      ctx.fillStyle = accent; ctx.fillRect(-4 + f * 2, -1.5, 8, 2.6);
      const sweep = ((o.time || 0) % 240) / 240;
      if (sweep < 0.12) { ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fillRect(-4 + f * 2 + (sweep / 0.12) * 7, -1.5, 1.2, 2.6); }
      U.glow(ctx, f * 2, -0.5, 12, accent, 0.7);
      // Ear fin and antenna (its tip shows the air jump).
      ctx.fillStyle = plate; ctx.fillRect(-f * 7.5 - (f > 0 ? 1 : 0), -3, 2, 6);
      ctx.strokeStyle = plate; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-f * 3, -6.5); ctx.lineTo(-f * 6, -12); ctx.stroke();
      ctx.fillStyle = o.tip || "#ffe14d"; ctx.fillRect(-f * 6 - 1.5, -13.5, 3, 3);
    }
    ctx.restore();
    // Front arm (over the torso) with a hand light.
    const [hx, hy] = limb(sh[0] + f, sh[1], P.shF, 4.6, P.elF, 4.4, 3.8, plate);
    if (!ghost) { ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(hx, hy, 1.6, 0, 6.28); ctx.fill(); }
    ctx.restore();
  }

  // ---- death: the body breaks apart into glowing pieces ----
  static deathPieces(p, world) {
    const cx = U.cx(p), cy = U.cy(p);
    const parts = [["helmet", 15, 13], ["torso", 13, 10], ["limb", 4, 11], ["limb", 4, 11], ["limb", 4, 10], ["limb", 4, 10], ["pack", 5, 8], ["bolt", 3, 3], ["bolt", 3, 3]];
    return {
      world, t: 0,
      pieces: parts.map(([kind, w, h], i) => {
        const a = -Math.PI / 2 + (i - parts.length / 2) * 0.45 + U.rand(-0.2, 0.2), s = U.rand(3, 7);
        return { kind, w, h, x: cx, y: cy - (kind === "helmet" ? 8 : 0), vx: Math.cos(a) * s + p.vx * 0.3, vy: Math.sin(a) * s - 2, rot: 0, vr: U.rand(-0.35, 0.35) };
      }),
    };
  }
  static updateDeath(fx) {
    fx.t++;
    for (const q of fx.pieces) {
      q.vy += 0.32; q.vx *= 0.99; q.x += q.vx; q.y += q.vy; q.rot += q.vr;
      if (fx.t % 3 === 0 && fx.t < 50 && fx.world) fx.world.particles.emit(q.x, q.y, { life: 14, size: 2, color: "#00f0ff", shape: "spark", vx: -q.vx * 0.2, vy: -q.vy * 0.2 });
    }
  }
  static drawDeath(ctx, fx) {
    const a = Math.max(0, 1 - fx.t / 70);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    for (const q of fx.pieces) {
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot);
      ctx.fillStyle = q.kind === "limb" ? "#2a3f6e" : "#16233f";
      U.roundRect(ctx, -q.w / 2, -q.h / 2, q.w, q.h, Math.min(3, q.w / 2)); ctx.fill();
      ctx.strokeStyle = "#00f0ff"; ctx.lineWidth = 1.2; ctx.stroke();
      if (q.kind === "helmet") { ctx.fillStyle = "#00f0ff"; ctx.fillRect(-4, -1.5, 8, 2.6); }
      ctx.restore();
      U.glow(ctx, q.x, q.y, 12, "#00f0ff", a * 0.5);
    }
    ctx.restore();
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
  sudoCool: 600,      // ...and is ready again 10 s after use
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

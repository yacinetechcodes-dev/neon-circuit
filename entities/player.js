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
  constructor(world, x, y, upgrades) {
    this.x = x; this.y = y;
    this.w = Player.W; this.h = Player.H;
    this.upgrades = new Set(upgrades || []);
    this.maxHp = 3 + (this.has("hpUp") ? 1 : 0);
    this.powers = { shield: 0, magnet: 0, speed: 0 };
    this.reset(x, y, true);
  }

  static get W() { return 20; }
  static get H() { return 28; }

  has(u) { return this.upgrades.has(u); }

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

    const g = C.gravity * world.gravity * (this.lowGrav ? C.lowGrav : 1);
    const maxFall = C.maxFall * Math.sqrt(world.gravity * (this.lowGrav ? C.lowGrav : 1));
    const speed = C.runSpeed * (this.powers.speed > 0 ? 1.4 : 1);

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

    if (this.dashing > 0) {
      // ---- dash: fixed speed, no gravity ----
      this.dashing--;
      this.vx = this.dashDir * C.dashSpeed;
      this.vy = 0;
      if (world.time % 2 === 0) this.trail.push({ x: this.x, y: this.y, life: 12 });
      world.particles.emit(U.cx(this), U.cy(this) + U.rand(-8, 8), {
        vx: -this.dashDir * 2, vy: U.rand(-0.5, 0.5), life: 14, size: 3, color: "#ff3df0", shape: "square",
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
      this.vy += g;

      // ---- walls ----
      this.wallDir = Physics.touchingWall(world, this, -1) ? -1 : Physics.touchingWall(world, this, 1) ? 1 : 0;
      this.wallSliding = !this.onGround && this.wallDir !== 0 && move === this.wallDir && this.vy > 0;
      if (this.wallDir !== 0 && !this.onGround) {
        this.wallCoyote = C.wallCoyote; this.lastWall = this.wallDir;
        this.airJumps = this.has("doubleJump") ? 1 : 0;
      } else if (this.wallCoyote > 0) this.wallCoyote--;
      if (this.wallSliding) {
        this.vy = Math.min(this.vy, C.wallSlide);
        this.canDash = true;
        if (world.time % 5 === 0)
          world.particles.emit(this.wallDir > 0 ? this.x + this.w : this.x, this.y + this.h - 4, {
            vx: -this.wallDir * 0.6, vy: -0.5, life: 14, size: 2.5, color: "#9fe8ff", shape: "square",
          });
      }
      this.vy = Math.min(this.vy, this.wallSliding ? C.wallSlide : maxFall);

      // ---- drop through one-way platforms ----
      const dropRequest = inp("down") && this.jumpBuffer > 0 && this.onGround && this.standingOnOneway(world);
      if (dropRequest) {
        this.dropTimer = 12; this.jumpBuffer = 0; this.onGround = false; this.coyote = 0;
        this.y += 1;
      }

      // ---- jumping ----
      if (this.jumpBuffer > 0) {
        if (this.coyote > 0) {
          this.vy = -C.jumpV; this.jumping = true;
          this.coyote = 0; this.jumpBuffer = 0; this.onGround = false;
          this.squashX = 0.7; this.squashY = 1.35;
          world.particles.dust(U.cx(this), this.y + this.h);
          sfx.play("jump");
        } else if (this.wallCoyote > 0) {
          const d = this.wallDir || this.lastWall;
          this.vy = -C.wallJumpVY; this.vx = -d * C.wallJumpVX;
          this.jumping = true; this.facing = -d;
          this.wallLock = C.wallLock; this.lastWall = d; this.wallCoyote = 0; this.jumpBuffer = 0;
          this.squashX = 0.75; this.squashY = 1.3;
          world.particles.dust(d > 0 ? this.x + this.w : this.x, U.cy(this), "#9fe8ff", 6, -d * 1.5);
          sfx.play("jump");
        } else if (this.airJumps > 0) {
          this.airJumps--;
          this.vy = -C.doubleJumpV; this.jumping = true; this.jumpBuffer = 0;
          this.squashX = 0.75; this.squashY = 1.3;
          world.particles.ring(U.cx(this), this.y + this.h, "#00f0ff", 18, 18);
          world.particles.burst(U.cx(this), this.y + this.h, 8, "#00f0ff", 2);
          sfx.play("doubleJump");
        }
      }
      // Variable jump height: releasing jump early cuts the rise.
      if (this.jumping && this.vy < 0 && !inp("jump")) { this.vy *= C.jumpCut; this.jumping = false; }
      if (this.vy >= 0) this.jumping = false;

      // ---- dash ----
      if (this.has("dash") && press("dash") && this.canDash && this.dashCool <= 0) {
        this.dashing = C.dashFrames;
        this.dashDir = move || this.facing;
        this.facing = this.dashDir;
        this.canDash = false;
        this.dashCool = C.dashCool;
        this.jumping = false;
        world.camera.shake(2);
        world.particles.ring(U.cx(this), U.cy(this), "#ff3df0", 20, 16);
        sfx.play("dash");
      }
    }

    // ---- shooting ----
    if (this.has("pulse") && press("shoot") && this.shootCool <= 0) {
      this.shootCool = C.shootCool;
      const sx = this.facing > 0 ? this.x + this.w : this.x - 14;
      const shot = world.spawn("pulseShot", sx, this.y + 9, {});
      if (shot) shot.vx = this.facing * 10;
      world.particles.burst(sx + 7, this.y + 13, 5, "#7dff4a", 2);
      sfx.play("pulse");
    }

    // ---- move ----
    this.lastVy = this.vy;
    const wasGround = this.onGround;
    const res = Physics.move(world, this, this.vx, this.vy, { drop: this.dropTimer > 0 });
    if (res.hitX) {
      if (this.dashing > 0) { this.dashing = 0; world.camera.shake(3); }
      this.vx = 0;
    }
    if (res.hitY) {
      if (this.vy > 0 && !wasGround && this.vy > 3) {
        this.squashX = 1.3; this.squashY = 0.72;
        world.particles.dust(U.cx(this), this.y + this.h, "#8fb8ff", Math.min(10, Math.floor(this.vy)));
        sfx.play("land");
      }
      this.vy = 0;
    }
    this.onGround = res.onGround;
    this.ground = res.ground;
    this.lowGrav = false; // gravity fields set this again each frame

    // ---- cosmetics ----
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

    // Dash afterimages.
    for (const t of this.trail) {
      ctx.globalAlpha = t.life / 24;
      ctx.fillStyle = "#ff3df0";
      U.roundRect(ctx, t.x, t.y, this.w, this.h, 5);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const cx = this.x + this.w / 2, by = this.y + this.h;
    const w = 24 * this.squashX, h = 30 * this.squashY;
    const x = cx - w / 2, y = by - h;
    const warpA = this.warp ? Math.max(0, 1 - this.warp / 70) : 1;
    ctx.globalAlpha = warpA;

    // Body glow.
    U.glow(ctx, cx, by - h / 2, 34, this.dashing > 0 ? "#ff3df0" : "#00c8ff", 0.45);

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
    ctx.strokeStyle = this.dashing > 0 ? "#ff3df0" : "#00f0ff";
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
  dashSpeed: 12,
  dashFrames: 11,
  dashCool: 16,
  shootCool: 16,
};

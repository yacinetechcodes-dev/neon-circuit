/* =========================================================================
 * core/input.js — keyboard + touch + mouse, mapped to abstract actions.
 *
 *   Input.down("jump")     → held this frame
 *   Input.pressed("jump")  → went down since the last simulation step
 *   Input.clicks           → queue of {x, y} taps/clicks in screen space
 * ========================================================================= */
"use strict";

const Input = {
  keyMap: {
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    ArrowUp: "up", KeyW: "up",
    ArrowDown: "down", KeyS: "down",
    Space: "jump", KeyZ: "jump", KeyK: "jump",
    ShiftLeft: "dash", ShiftRight: "dash", KeyX: "dash", KeyL: "dash",
    KeyF: "shoot", KeyC: "shoot", KeyJ: "shoot",
    Escape: "pause", KeyP: "pause",
    Enter: "confirm", NumpadEnter: "confirm",
    Backspace: "back",
    KeyM: "mute",
    KeyQ: "weaponPrev", KeyE: "weaponNext", KeyR: "freeze", KeyV: "freeze", KeyT: "shrink", KeyB: "block",
    KeyY: "minimize", KeyU: "maximize", Tab: "altTab", KeyI: "altTab",
    KeyG: "grapple", KeyN: "slam", KeyH: "jetpack",
    KeyO: "sudo", Backslash: "pipe", Period: "pipe", Delete: "kill", Comma: "kill",
    Digit1: "weapon1", Digit2: "weapon2", Digit3: "weapon3", Digit4: "weapon4", Digit5: "weapon5",
    Digit6: "weapon6", Digit7: "weapon7", Digit8: "weapon8", Digit9: "weapon9",
  },
  // Up/W also jump during gameplay (handled in down()/pressed()).
  _down: {},
  _pressed: {},
  _touchDown: {},
  clicks: [],
  touchMode: false,
  canvas: null,
  buttons: [],   // on-screen touch buttons (screen space)

  init(canvas) {
    this.canvas = canvas;
    // Browsers only allow audio after a user gesture: unlock on first input.
    const unlockAudio = () => sfx.unlock();
    for (const type of ["keydown", "mousedown", "touchstart", "pointerdown"]) {
      window.addEventListener(type, unlockAudio, { passive: true });
    }
    window.addEventListener("keydown", (ev) => {
      const a = this.keyMap[ev.code];
      if (!a) return;
      ev.preventDefault();
      if (!this._down[a]) this._pressed[a] = true;
      this._down[a] = true;
    });
    window.addEventListener("keyup", (ev) => {
      const a = this.keyMap[ev.code];
      if (a) this._down[a] = false;
    });
    window.addEventListener("blur", () => { this._down = {}; this._touchDown = {}; });

    // Mouse clicks (menus only).
    canvas.addEventListener("mousedown", (ev) => {
      if (this.touchMode) return;
      const p = this.toScreen(ev.clientX, ev.clientY);
      this.clicks.push(p);
    });

    const onTouch = (ev) => {
      ev.preventDefault();
      if (!this.touchMode) { this.touchMode = true; this.layoutButtons(); }
      if (ev.type === "touchstart") {
        for (const t of ev.changedTouches) {
          const p = this.toScreen(t.clientX, t.clientY);
          const hitButton = this.buttons.some((b) => this.inButton(b, p));
          if (!hitButton || !Game.isPlaying()) this.clicks.push(p);
        }
      }
      // Recompute which buttons are held from every active touch.
      const held = {};
      for (const t of ev.touches) {
        const p = this.toScreen(t.clientX, t.clientY);
        for (const b of this.buttons) if (this.inButton(b, p)) held[b.action] = true;
      }
      for (const b of this.buttons) {
        if (held[b.action] && !this._touchDown[b.action]) this._pressed[b.action] = true;
      }
      this._touchDown = held;
    };
    canvas.addEventListener("touchstart", onTouch, { passive: false });
    canvas.addEventListener("touchmove", onTouch, { passive: false });
    canvas.addEventListener("touchend", onTouch, { passive: false });
    canvas.addEventListener("touchcancel", onTouch, { passive: false });
  },

  layoutButtons() {
    const r = 46, y = VIEW_H - 62;
    this.buttons = [
      { action: "left", x: 62, y, r, label: "◀" },
      { action: "right", x: 168, y, r, label: "▶" },
      { action: "down", x: 115, y: y - 78, r: 30, label: "▼" },
      { action: "jump", x: VIEW_W - 70, y, r, label: "JUMP" },
      { action: "dash", x: VIEW_W - 176, y: y + 6, r: 38, label: "DASH" },
      { action: "shoot", x: VIEW_W - 92, y: y - 102, r: 36, label: "FIRE" },
      { action: "weaponNext", x: VIEW_W - 196, y: y - 92, r: 26, label: "WPN" },
      { action: "freeze", x: VIEW_W - 256, y: y - 30, r: 26, label: "FRZ" },
      { action: "shrink", x: VIEW_W - 160, y: y - 176, r: 24, label: "MINI" },
      { action: "block", x: VIEW_W - 226, y: y - 160, r: 24, label: "BLK" },
      { action: "minimize", x: VIEW_W - 290, y: y - 96, r: 22, label: "MIN" },
      { action: "maximize", x: VIEW_W - 300, y: y - 40, r: 22, label: "MAX" },
      { action: "altTab", x: VIEW_W - 92, y: y - 186, r: 24, label: "TAB" },
      { action: "grapple", x: VIEW_W - 160, y: y - 176, r: 24, label: "HOOK" },
      { action: "slam", x: VIEW_W - 290, y: y - 96, r: 22, label: "SLAM" },
      { action: "jetpack", x: VIEW_W - 300, y: y - 40, r: 22, label: "JET" },
      { action: "sudo", x: VIEW_W - 226, y: y - 160, r: 24, label: "SUDO" },
      { action: "pipe", x: VIEW_W - 92, y: y - 186, r: 24, label: "PIPE" },
      { action: "kill", x: VIEW_W - 256, y: y - 30, r: 26, label: "KILL" },
      { action: "pause", x: VIEW_W - 34, y: 84, r: 22, label: "II" },
    ];
  },
  inButton(b, p) {
    return Math.hypot(p.x - b.x, p.y - b.y) <= b.r * 1.15;
  },

  /** Convert client (CSS pixel) coordinates to logical screen coordinates. */
  toScreen(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((cx - r.left) / r.width) * VIEW_W, y: ((cy - r.top) / r.height) * VIEW_H };
  },

  down(a) {
    if (a === "jump" && this.jumpWithUp && (this._down.up || this._touchDown.up)) return true;
    return !!(this._down[a] || this._touchDown[a]);
  },
  pressed(a) {
    if (a === "jump" && this.jumpWithUp && this._pressed.up) return true;
    return !!this._pressed[a];
  },
  /** Menus: "confirm" accepts Enter or Space. */
  menuPressed(a) {
    if (a === "confirm") return !!(this._pressed.confirm || this._pressed.jump);
    if (a === "back") return !!(this._pressed.back || this._pressed.pause);
    return !!this._pressed[a];
  },
  /** Called at the end of every simulation step. */
  endStep() {
    this._pressed = {};
    this.clicks.length = 0;
  },
  jumpWithUp: true,

  drawTouch(ctx) {
    if (!this.touchMode || !Game.isPlaying()) return;
    ctx.save();
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const b of this.buttons) {
      const pl = Game.world && Game.world.player;
      if (b.action === "shoot" && !(pl && pl.weapons.length)) continue;
      if (b.action === "weaponNext" && !(pl && pl.weapons.length > 1)) continue;
      if (b.action === "freeze" && !(pl && pl.has("freeze"))) continue;
      if (b.action === "shrink" && !(pl && pl.has("shrink"))) continue;
      if (b.action === "block" && !(pl && pl.has("blockPlace"))) continue;
      if (b.action === "minimize" && !(pl && pl.has("minimize"))) continue;
      if (b.action === "maximize" && !(pl && pl.has("maximize"))) continue;
      if (b.action === "altTab" && !(pl && pl.has("altTab"))) continue;
      if (b.action === "grapple" && !(pl && pl.has("grapple"))) continue;
      if (b.action === "slam" && !(pl && pl.has("groundSlam"))) continue;
      if (b.action === "jetpack" && !(pl && pl.has("jetpack"))) continue;
      if (b.action === "sudo" && !(pl && pl.has("sudo"))) continue;
      if (b.action === "pipe" && !(pl && pl.has("pipe"))) continue;
      if (b.action === "kill" && !(pl && pl.has("killProcess"))) continue;
      if (b.action === "dash" && !(Game.world && Game.world.player.has("dash"))) continue;
      const on = this.down(b.action);
      ctx.globalAlpha = on ? 0.55 : 0.28;
      ctx.fillStyle = "#0a1630";
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = on ? 1 : 0.6;
      ctx.strokeStyle = "#00f0ff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#bff8ff";
      ctx.fillText(b.label, b.x, b.y);
    }
    ctx.restore();
  },
};

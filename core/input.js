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
      if (b.action === "shoot" && !(Game.world && Game.world.player.has("pulse"))) continue;
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

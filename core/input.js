/* =========================================================================
 * core/input.js — keyboard + touch + mouse, mapped to abstract actions.
 *
 *   Input.down("jump")     → held this frame
 *   Input.pressed("jump")  → went down since the last simulation step
 *   Input.clicks           → queue of {x, y} taps/clicks in screen space
 *
 * Touch: on touch devices a semi-transparent control layer is drawn over the
 * game: a left/right pad (+ ▼) on the left; JUMP, DASH, FIRE and WPN on the
 * right; pause top-right. Ability buttons are built from UPGRADE_INFO
 * (entries with an `action` and a `label`), so a new ability gets a button
 * automatically: the current world's abilities get their own buttons, older
 * ones sit in a pop-out tray (the ••• button). Every finger is tracked, so you
 * can hold a direction and jump at the same time.
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
    Digit0: "map", Backquote: "map",
    Digit1: "weapon1", Digit2: "weapon2", Digit3: "weapon3", Digit4: "weapon4", Digit5: "weapon5",
    Digit6: "weapon6", Digit7: "weapon7", Digit8: "weapon8", Digit9: "weapon9",
  },
  // Up/W also jump during gameplay (handled in down()/pressed()).
  _down: {},
  _pressed: {},
  _touchDown: {},
  clicks: [],
  touchMode: false,
  trayOpen: false,
  canvas: null,
  buttons: [],   // fixed on-screen touch buttons (screen space)

  init(canvas) {
    this.canvas = canvas;
    // Phones and tablets start with the touch controls showing.
    try {
      this.touchMode = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    } catch (e) { this.touchMode = false; }
    this.layoutButtons();
    // Browsers only allow audio after a user gesture: unlock on first input.
    const unlockAudio = () => sfx.unlock();
    for (const type of ["keydown", "mousedown", "touchstart", "pointerdown"]) {
      window.addEventListener(type, unlockAudio, { passive: true });
    }
    window.addEventListener("keydown", (ev) => {
      const a = this.keyMap[ev.code];
      if (!a) return;
      ev.preventDefault();
      this.touchMode = false;          // a real keyboard: hide the touch layer
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
      const live = Game.isPlaying() ? this.activeButtons() : [];
      if (ev.type === "touchstart") {
        for (const t of ev.changedTouches) {
          const p = this.toScreen(t.clientX, t.clientY);
          const hit = live.find((b) => this.inButton(b, p));
          if (hit && hit.action === "tray") this.trayOpen = !this.trayOpen;
          if (!hit) this.clicks.push(p);   // menus, cards, and taps outside the buttons
        }
      }
      // Recompute which buttons are held from every active touch (multi-touch).
      const held = {};
      for (const t of ev.touches) {
        const p = this.toScreen(t.clientX, t.clientY);
        // Each finger presses the closest button it is on.
        let best = null, bd = 1e9;
        for (const b of live) {
          const d = Math.hypot(p.x - b.x, p.y - b.y);
          if (d <= b.r * 1.2 && d < bd) { bd = d; best = b; }
        }
        if (best && best.action !== "tray") held[best.action] = true;
      }
      for (const a in held) if (!this._touchDown[a]) this._pressed[a] = true;
      this._touchDown = held;
    };
    for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) canvas.addEventListener(type, onTouch, { passive: false });
    // No pinch-zoom, double-tap zoom or long-press menus while playing.
    for (const type of ["gesturestart", "gesturechange", "dblclick", "contextmenu"]) {
      document.addEventListener(type, (ev) => ev.preventDefault(), { passive: false });
    }
  },

  /** Fixed buttons (thumb-sized). `need(p)` hides a button until it's useful. */
  layoutButtons() {
    const y = VIEW_H - 72;
    this.buttons = [
      { action: "left", x: 72, y, r: 54, label: "◀" },
      { action: "right", x: 196, y, r: 54, label: "▶" },
      { action: "down", x: 134, y: y - 104, r: 36, label: "▼" },
      { action: "jump", x: VIEW_W - 74, y: y - 6, r: 60, label: "JUMP" },
      { action: "dash", x: VIEW_W - 196, y: y + 18, r: 44, label: "DASH", need: (p) => p.has("dash") },
      { action: "shoot", x: VIEW_W - 84, y: y - 146, r: 46, label: "FIRE", need: (p) => p.weapons.length > 0 },
      { action: "weaponNext", x: VIEW_W - 196, y: y - 88, r: 32, label: "WPN", need: (p) => p.weapons.length > 1 },
      { action: "pause", x: VIEW_W - 34, y: 86, r: 26, label: "II" },
      { action: "map", x: VIEW_W - 34, y: 148, r: 22, label: "MAP" },
    ];
  },
  // Ability button slots (around the right-hand cluster) and the tray row.
  SLOTS: [[-318, -44], [-296, -134], [-252, -220], [-170, -274]],

  /** Owned abilities that have a touch button: this world's first. */
  abilityButtons(p) {
    if (typeof UPGRADE_INFO === "undefined" || !p) return { main: [], tray: [] };
    const wd = Game.worldDef && Game.worldDef();
    const here = (wd && wd.abilities) || [];
    const all = Object.keys(UPGRADE_INFO).filter((k) => UPGRADE_INFO[k].action && UPGRADE_INFO[k].label && p.has(k));
    const mine = all.filter((k) => here.includes(k)), others = all.filter((k) => !here.includes(k));
    const slots = this.SLOTS.length;
    let main = mine.slice(0, slots), tray = mine.slice(slots).concat(others);
    if (tray.length && main.length === slots) { tray = main.slice(slots - 1).concat(tray); main = main.slice(0, slots - 1); }
    return { main, tray };
  },

  /** Every touch button that is live right now (fixed + abilities + tray). */
  activeButtons() {
    const p = Game.world && Game.world.player;
    if (!p) return this.buttons.filter((b) => b.action === "pause");
    const out = this.buttons.filter((b) => !b.need || b.need(p));
    const { main, tray } = this.abilityButtons(p);
    const by = VIEW_H - 72;
    main.forEach((k, i) => {
      const [dx, dy] = this.SLOTS[i];
      out.push({ action: UPGRADE_INFO[k].action, x: VIEW_W + dx, y: by + dy, r: 32, label: UPGRADE_INFO[k].label, ability: k });
    });
    if (tray.length) {
      const [dx, dy] = this.SLOTS[main.length];
      out.push({ action: "tray", x: VIEW_W + dx, y: by + dy, r: 30, label: this.trayOpen ? "✕" : "•••" });
      if (this.trayOpen) {
        // Rows of up to 7, left of the ability slots.
        const per = 7, gap = 72;
        tray.forEach((k, i) => {
          const row = Math.floor(i / per), inRow = Math.min(per, tray.length - row * per);
          const x0 = 400 - ((inRow - 1) * gap) / 2;
          out.push({ action: UPGRADE_INFO[k].action, x: x0 + (i % per) * gap, y: 168 + row * 74, r: 32, label: UPGRADE_INFO[k].label, ability: k });
        });
      }
    }
    return out;
  },

  inButton(b, p) {
    return Math.hypot(p.x - b.x, p.y - b.y) <= b.r * 1.2;
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
    const p = Game.world && Game.world.player;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const b of this.activeButtons()) {
      const on = this.down(b.action) || (b.action === "tray" && this.trayOpen);
      const cool = b.ability && p ? p.abilityCooldown(Game.world, b.ability) : 0;
      ctx.globalAlpha = on ? 0.5 : 0.26;
      ctx.fillStyle = "#0a1630";
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = on ? 1 : cool > 0 ? 0.3 : 0.6;
      ctx.strokeStyle = b.ability ? "#ffd23d" : "#00f0ff";
      ctx.lineWidth = 2;
      ctx.stroke();
      if (cool > 0) {
        // Recharge ring.
        ctx.globalAlpha = 0.8; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - cool)); ctx.stroke();
        ctx.globalAlpha = 0.35;
      }
      ctx.fillStyle = b.ability ? "#fff2b8" : "#bff8ff";
      ctx.font = `bold ${b.r > 40 ? 16 : 13}px ${typeof FONT !== "undefined" ? FONT : "monospace"}`;
      ctx.fillText(b.label, b.x, b.y);
    }
    ctx.restore();
  },
};

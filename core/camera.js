/* =========================================================================
 * core/camera.js — smooth follow with look-ahead, bounds, locks and shake.
 * ========================================================================= */
"use strict";

class Camera {
  constructor() {
    this.x = 0; this.y = 0;       // top-left of the view in world pixels
    this.shakeAmt = 0;
    this.ox = 0; this.oy = 0;     // shake offset applied when drawing
    this.lookX = 0;
    this.bounds = { x: 0, y: 0, w: VIEW_W, h: VIEW_H };
    this.lock = null;             // optional rect the camera is confined to
    this.focus = null;            // optional {x,y} to look at (cutscenes)
  }

  setBounds(w, h) {
    this.bounds = { x: 0, y: 0, w: Math.max(w, VIEW_W), h: Math.max(h, VIEW_H) };
  }

  shake(amount) {
    this.shakeAmt = Math.min(18, Math.max(this.shakeAmt, amount));
  }

  /** Snap straight to a target (used on spawn/respawn). */
  snap(target) {
    this.lookX = 0;
    const t = this._target(target);
    this.x = t.x; this.y = t.y;
  }

  _target(p) {
    let tx, ty;
    if (this.focus) {
      tx = this.focus.x - VIEW_W / 2;
      ty = this.focus.y - VIEW_H / 2;
    } else {
      tx = p.x + p.w / 2 - VIEW_W / 2 + this.lookX;
      ty = p.y + p.h / 2 - VIEW_H * 0.55;
    }
    const b = this.lock || this.bounds;
    tx = U.clamp(tx, b.x, b.x + Math.max(0, b.w - VIEW_W));
    ty = U.clamp(ty, b.y, b.y + Math.max(0, b.h - VIEW_H));
    return { x: tx, y: ty };
  }

  update(p) {
    // Look ahead in the direction the player is moving.
    const want = U.clamp(p.vx * 18, -110, 110);
    this.lookX = U.lerp(this.lookX, want, 0.04);
    const t = this._target(p);
    const k = this.focus ? 0.06 : 0.12;
    this.x = U.lerp(this.x, t.x, k);
    // Vertical: follow faster when falling so the player never leaves the view.
    const ky = p.vy > 6 ? 0.25 : 0.1;
    this.y = U.lerp(this.y, t.y, this.focus ? 0.06 : ky);

    if (this.shakeAmt > 0.2) {
      this.ox = U.rand(-1, 1) * this.shakeAmt;
      this.oy = U.rand(-1, 1) * this.shakeAmt;
      this.shakeAmt *= 0.86;
    } else {
      this.shakeAmt = 0; this.ox = 0; this.oy = 0;
    }
  }

  /** The rectangle in which entities are simulated. */
  activeRect(margin = 320) {
    return { x: this.x - margin, y: this.y - margin, w: VIEW_W + margin * 2, h: VIEW_H + margin * 2 };
  }
}

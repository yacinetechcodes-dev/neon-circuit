/* =========================================================================
 * core/physics.js — tile + solid-entity collision for axis-aligned boxes.
 *
 * A "body" is any object with {x, y, w, h}. Bodies move one axis at a time
 * and are snapped out of whatever they hit. Speeds are always < TILE, so a
 * single leading-edge check per axis is enough (no tunnelling).
 * ========================================================================= */
"use strict";

const Physics = {
  isSolidCode: (t) => t === T_SOLID || t === T_HIDDEN_SOLID,

  /** Tile code at a cell. Left/right of the map are walls; below is open
   *  (bottomless pits); above copies row 0 so tall walls can't be hopped. */
  tileAt(world, c, r) {
    if (c < 0 || c >= world.w) return T_SOLID;
    if (r >= world.h) return T_EMPTY;
    if (r < 0) r = 0;
    return world.tiles[r * world.w + c];
  },
  solidAt(world, c, r) {
    return this.isSolidCode(this.tileAt(world, c, r));
  },
  solidAtPx(world, x, y) {
    return this.solidAt(world, Math.floor(x / TILE), Math.floor(y / TILE));
  },

  /** Does the body overlap any solid tile (or solid entity)? */
  bodyBlocked(world, b, withSolids = true) {
    const c0 = Math.floor(b.x / TILE), c1 = Math.floor((b.x + b.w - 0.01) / TILE);
    const r0 = Math.floor(b.y / TILE), r1 = Math.floor((b.y + b.h - 0.01) / TILE);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) if (this.solidAt(world, c, r)) return true;
    if (withSolids) for (const e of world.solids) if (e !== b && U.overlap(b, e)) return true;
    return false;
  },

  /**
   * Move a body by (dx, dy) with collision.
   * opts: { solids: true, drop: false (ignore one-way), ignore: entity, oneway: true }
   * Returns { hitX, hitY, onGround, ground } where ground is the solid
   * entity stood on (or null for tiles).
   */
  move(world, b, dx, dy, opts = {}) {
    const res = { hitX: false, hitY: false, onGround: false, ground: null };
    const useSolids = opts.solids !== false;
    const T = TILE;

    // ---- X axis ----
    if (dx !== 0) {
      b.x += dx;
      const r0 = Math.floor(b.y / T), r1 = Math.floor((b.y + b.h - 0.01) / T);
      if (dx > 0) {
        const c = Math.floor((b.x + b.w - 0.01) / T);
        for (let r = r0; r <= r1; r++) {
          if (this.solidAt(world, c, r)) { b.x = c * T - b.w; res.hitX = true; break; }
        }
      } else {
        const c = Math.floor(b.x / T);
        for (let r = r0; r <= r1; r++) {
          if (this.solidAt(world, c, r)) { b.x = (c + 1) * T; res.hitX = true; break; }
        }
      }
      if (useSolids) {
        for (const e of world.solids) {
          if (e === b || e === opts.ignore || !U.overlap(b, e)) continue;
          b.x = dx > 0 ? e.x - b.w : e.x + e.w;
          res.hitX = true;
        }
      }
    }

    // ---- Y axis ----
    if (dy !== 0) {
      const prevBottom = b.y + b.h, prevTop = b.y;
      b.y += dy;
      const c0 = Math.floor(b.x / T), c1 = Math.floor((b.x + b.w - 0.01) / T);
      if (dy > 0) {
        const r = Math.floor((b.y + b.h - 0.01) / T);
        for (let c = c0; c <= c1; c++) {
          const t = this.tileAt(world, c, r);
          const oneway = t === T_ONEWAY && opts.oneway !== false && !opts.drop && prevBottom <= r * T + 0.01;
          if (this.isSolidCode(t) || oneway) {
            b.y = r * T - b.h; res.hitY = true; res.onGround = true; break;
          }
        }
      } else {
        const r = Math.floor(b.y / T);
        for (let c = c0; c <= c1; c++) {
          if (this.solidAt(world, c, r)) { b.y = (r + 1) * T; res.hitY = true; break; }
        }
      }
      if (useSolids) {
        for (const e of world.solids) {
          if (e === b || e === opts.ignore || !U.overlap(b, e)) continue;
          if (dy > 0 && prevBottom <= e.y + 0.5 + Math.max(0, dy)) {
            b.y = e.y - b.h; res.hitY = true; res.onGround = true; res.ground = e;
          } else if (dy < 0 && prevTop >= e.y + e.h - 0.5 + Math.min(0, dy)) {
            b.y = e.y + e.h; res.hitY = true;
          }
        }
      }
    }
    return res;
  },

  /** Is there a wall directly beside the body? dir = -1 left, 1 right. */
  touchingWall(world, b, dir) {
    const x = dir > 0 ? b.x + b.w + 1 : b.x - 1;
    const c = Math.floor(x / TILE);
    const r0 = Math.floor((b.y + 3) / TILE), r1 = Math.floor((b.y + b.h - 3) / TILE);
    for (let r = r0; r <= r1; r++) if (this.solidAt(world, c, r)) return true;
    const probe = { x: dir > 0 ? b.x + b.w : b.x - 1, y: b.y + 3, w: 1, h: b.h - 6 };
    for (const e of world.solids) if (e !== b && U.overlap(probe, e)) return true;
    return false;
  },

  /** Is there ground just below the point (x, footY)? Used by walkers to avoid ledges. */
  groundBelow(world, x, footY) {
    const c = Math.floor(x / TILE), r = Math.floor((footY + 2) / TILE);
    const t = this.tileAt(world, c, r);
    return this.isSolidCode(t) || t === T_ONEWAY;
  },

  /**
   * Move a solid entity (platform, crusher…) and carry / push / crush the
   * player. Call this instead of changing e.x / e.y directly.
   */
  moveSolid(world, e, dx, dy) {
    const p = world.player;
    const riding = p && p.alive && p.ground === e;
    e.x += dx; e.y += dy;
    if (!p || !p.alive) return;
    if (riding) {
      // Carry the player: horizontally with collision, vertically snapped on top.
      if (dx) this.move(world, p, dx, 0, { ignore: e });
      p.y = e.y - p.h;
      if (dy < 0 && this.bodyBlocked(world, p, false)) world.crushPlayer();
      return;
    }
    if (!U.overlap(p, e)) return;
    if (dy < 0) { p.y = e.y - p.h; p.ground = e; if (p.vy > 0) p.vy = 0; }
    else if (dy > 0) { p.y = e.y + e.h; if (p.vy < dy) p.vy = dy; }
    else if (dx > 0) p.x = e.x + e.w;
    else if (dx < 0) p.x = e.x - p.w;
    if (this.bodyBlocked(world, p, false)) world.crushPlayer();
  },
};

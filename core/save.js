/* =========================================================================
 * core/save.js — progress stored in localStorage (fails safely if blocked).
 *
 *   data.worlds[worldId] = { unlocked: n, bossBeaten: bool }
 *   data.best["worldId-levelId"] = { time, cores, coresTotal, secrets, secretsTotal, deaths }
 *   data.upgrades / data.weapons  permanent abilities / weapons owned
 *   data.weapon                   last selected weapon
 *   data.seen                     tutorial hints already shown / mechanics used
 * ========================================================================= */
"use strict";

const Save = {
  KEY: "neonCircuit.save.v1",
  data: null,

  defaults() {
    return { worlds: {}, upgrades: [], weapons: [], weapon: null, best: {}, seen: {} };
  },

  load() {
    this.data = this.defaults();
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch (e) {
      console.warn("[save] could not read progress:", e.message);
    }
    this.migrate();
    return this.data;
  },

  /** Older saves had one flat level list: move it into world 1. */
  migrate() {
    const d = this.data;
    if (typeof d.unlocked === "number") {
      d.worlds[1] = d.worlds[1] || {
        unlocked: Math.min(d.unlocked, 5),
        bossBeaten: !!d.finished || d.unlocked > 5,
      };
      const best = {};
      for (const k in d.best) if (String(k).includes("-")) best[k] = d.best[k]; else if (+k <= 5) best["1-" + k] = d.best[k];
      d.best = best;
      delete d.unlocked; delete d.finished;
    }
    // The old "pulse" ability is the Pulse Blaster weapon now.
    if (d.upgrades.includes("pulse") && !d.weapons.includes("pulseBlaster")) d.weapons.push("pulseBlaster");
  },

  write() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn("[save] could not write progress:", e.message);
    }
  },

  /** Progress record for a world (created on first use). */
  world(id) {
    const w = this.data.worlds;
    if (!w[id]) w[id] = { unlocked: 1, bossBeaten: false };
    return w[id];
  },

  /** Keep a weapon for good (found in a level or awarded). */
  addWeapon(name) {
    if (!this.data.weapons.includes(name)) { this.data.weapons.push(name); this.write(); }
  },
  /** Remember the selected weapon so it stays selected next level. */
  setWeapon(name) {
    if (this.data.weapon !== name) { this.data.weapon = name; this.write(); }
  },

  bestKey(worldId, levelId) { return `${worldId}-${levelId}`; },
  best(worldId, levelId) { return this.data.best[this.bestKey(worldId, levelId)]; },

  /** Has this hint key been shown, or its mechanic already used? */
  seen(key) {
    return !!(this.data && this.data.seen && this.data.seen[key]);
  },
  /** Remember a hint key (called when shown, and when the mechanic is used). */
  markSeen(key) {
    if (!this.data) return;
    if (!this.data.seen) this.data.seen = {};
    if (this.data.seen[key]) return;
    this.data.seen[key] = true;
    this.write();
  },

  reset() {
    this.data = this.defaults();
    this.write();
  },

  /**
   * Record a finished level. Returns true if it was a new best time.
   * r: { worldId, index, levelId, stats, unlocks, weapons, bossBeaten }
   */
  recordLevel(r) {
    const d = this.data;
    const w = this.world(r.worldId);
    w.unlocked = Math.max(w.unlocked, r.index + 2);
    if (r.bossBeaten) w.bossBeaten = true;
    for (const u of r.unlocks || []) if (!d.upgrades.includes(u)) d.upgrades.push(u);
    for (const wp of r.weapons || []) if (!d.weapons.includes(wp)) d.weapons.push(wp);
    const key = this.bestKey(r.worldId, r.levelId), prev = d.best[key], s = r.stats;
    const isBest = !prev || s.time < prev.time;
    d.best[key] = {
      time: isBest ? s.time : prev.time,
      cores: Math.max(s.cores, prev ? prev.cores : 0),
      coresTotal: s.coresTotal,
      secrets: Math.max(s.secrets, prev ? prev.secrets : 0),
      secretsTotal: s.secretsTotal,
      deaths: prev ? Math.min(prev.deaths, s.deaths) : s.deaths,
    };
    this.write();
    return isBest;
  },
};

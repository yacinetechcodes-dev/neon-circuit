/* =========================================================================
 * core/save.js — progress stored in localStorage (fails safely if blocked).
 * ========================================================================= */
"use strict";

const Save = {
  KEY: "neonCircuit.save.v1",
  data: null,

  defaults() {
    return {
      unlocked: 1,     // how many levels (in manifest order) are playable
      upgrades: [],    // permanent upgrades earned so far
      best: {},        // levelId → { time, cores, coresTotal, secrets, secretsTotal, deaths }
      finished: false, // beat the final level at least once
    };
  },

  load() {
    this.data = this.defaults();
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch (e) {
      console.warn("[save] could not read progress:", e.message);
    }
    return this.data;
  },

  write() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn("[save] could not write progress:", e.message);
    }
  },

  reset() {
    this.data = this.defaults();
    this.write();
  },

  /** Record a finished level. Returns true if it was a new best time. */
  recordLevel(index, levelId, stats, unlocks) {
    const d = this.data;
    d.unlocked = Math.max(d.unlocked, index + 2);
    for (const u of unlocks || []) if (!d.upgrades.includes(u)) d.upgrades.push(u);
    const prev = d.best[levelId];
    const isBest = !prev || stats.time < prev.time;
    d.best[levelId] = {
      time: isBest ? stats.time : prev.time,
      cores: Math.max(stats.cores, prev ? prev.cores : 0),
      coresTotal: stats.coresTotal,
      secrets: Math.max(stats.secrets, prev ? prev.secrets : 0),
      secretsTotal: stats.secretsTotal,
      deaths: prev ? Math.min(prev.deaths, stats.deaths) : stats.deaths,
    };
    this.write();
    return isBest;
  },
};

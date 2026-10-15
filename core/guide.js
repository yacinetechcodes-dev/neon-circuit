/* =========================================================================
 * core/guide.js — player guidance, all driven by data that lives next to
 * each thing it describes:
 *
 *   enemies / hazards / items / bosses  →  registerEntity(name, { info: { name, desc } })
 *                                           (tip: false = no first-sight tip: it's obvious,
 *                                            or a level hint already explains it)
 *   weapons                             →  registerWeapon(name, { label, desc })
 *   abilities                           →  UPGRADE_INFO[name] = { name, desc, how, action, label }
 *   power-ups                           →  POWERUPS[kind] = { label, desc }
 *   mechanic hints                      →  level scripts: { type: "hint", text, key }
 *
 * From that it shows one-time tips the first time something appears, a short
 * objective when a level starts, one-time intros for new weapons/abilities,
 * the Controls page rows, and the Help / Codex page (filled in as the player
 * discovers things; stored in Save.data.codex).
 * ========================================================================= */
"use strict";

const Guide = {
  /** Base controls for the Controls page ({token} → keys via UI.keys).
   *  Other systems may push rows here (e.g. the mini map toggle). */
  BASE_CONTROLS: [
    { name: "MOVE", how: "{move}" },
    { name: "JUMP (hold = higher)", how: "{jump}" },
    { name: "DROP THROUGH", how: "{down} + {jump}" },
    { name: "FIRE", how: "{shoot}" },
    { name: "SWITCH WEAPON", how: "{swap}", touch: "WPN", key: "Q / E / 1-9" },
    { name: "PAUSE", how: "{pause}" },
    { name: "SOUND", how: "M", touch: "pause menu" },
  ],

  // ---------------------------------------------------------------- discovery
  known(key) { return !!(Save.data && Save.data.codex && Save.data.codex[key]); },
  discover(key) {
    if (!Save.data) return false;
    if (!Save.data.codex) Save.data.codex = {};
    if (Save.data.codex[key]) return false;
    Save.data.codex[key] = true;
    Save.write();
    return true;
  },

  /** Queue a one-time tip (key = never again once shown or used). */
  tip(world, text, key) {
    if (key) { if (Save.seen(key)) return; Save.markSeen(key); }
    if (!world.tips) world.tips = [];
    world.tips.push(text);
  },

  /** Every few frames: note what's on screen, tip about new things. */
  update(world) {
    if (world.time % 6 === 0 && world.state === "play") {
      for (const e of world.entities) {
        const info = e.def.info;
        if (!info || e.dead || !e.active || this.known("e:" + e.name) || !world.onScreen(e, -8)) continue;
        this.discover("e:" + e.name);
        if (e.isBoss || info.tip === false) continue;   // bosses get a name card instead
        this.tip(world, `${info.name}: ${info.desc}`, "meet_" + e.name);
      }
    }
    if (!world.hint && world.tips && world.tips.length && !world.cutscene) world.showHint(world.tips.shift(), 4);
  },

  /** Level start: objective under the title, intros for anything new. */
  levelStart(world, wi, li) {
    const boss = world.entities.some((e) => e.isBoss);
    const goal = world.def.goal || (boss ? "Defeat the boss, then reach the exit" : "Reach the exit");
    if (world.banner) { world.banner.sub = goal.toUpperCase(); world.banner.t = world.banner.max = 150; }
    // Intros for abilities/weapons owned but never introduced. Things from
    // earlier worlds (e.g. an old save) are marked as known without a tip.
    const p = world.player, wd = world.worldDef || {}, wid = wd.id;
    const rewards = Object.values((wd.weapons && wd.weapons.rewards) || {}).flat().concat((wd.weapons && wd.weapons.start) || []);
    for (const k of Object.keys(UPGRADE_INFO)) {
      if (!p.has(k)) continue;
      this.discover("a:" + k);
      const inf = UPGRADE_INFO[k];
      if (inf.world && inf.world !== wid) { Save.markSeen("ability_" + k); continue; }
      this.tip(world, `NEW ABILITY ${inf.name}: ${inf.desc} (${inf.how})`, "ability_" + k);
    }
    for (const name of p.weapons) {
      const d = Weapons.get(name);
      if (!d) continue;
      this.discover("w:" + name);
      if (!rewards.includes(name)) { Save.markSeen("weapon_" + name); continue; }
      this.tip(world, `NEW WEAPON ${d.label}: ${d.desc || ""} {shoot} fire · {swap} switch`, "weapon_" + name);
    }
  },

  /** Mechanic hints from every level (key → text), for the Help page. */
  hints() {
    if (this._hints) return this._hints;
    const out = [], seen = new Set();
    for (const w of Registry.worlds) for (const def of w.levelDefs) for (const s of def.scripts || []) {
      for (const a of s.actions || []) {
        if (a.type === "hint" && a.key && !seen.has(a.key)) { seen.add(a.key); out.push({ key: a.key, text: a.text }); }
      }
    }
    return (this._hints = out);
  },

  // ---------------------------------------------------------------- codex
  TABS: ["TIPS", "ENEMIES", "HAZARDS", "BOSSES", "WEAPONS", "ABILITIES", "ITEMS"],

  /** Codex entries for a tab: [{ name, desc, icon(ctx, cx, cy) }] plus how many exist. */
  entries(tab) {
    const ents = Object.keys(Registry.entities).map((n) => [n, Registry.entities[n]]).filter(([, d]) => d.info);
    const isEnemy = (d) => d.props && d.props.enemy;
    const isBoss = (d) => d.props && d.props.isBoss;
    const ent = (filter) => {
      const all = ents.filter(([, d]) => filter(d));
      return { total: all.length, list: all.filter(([n]) => this.known("e:" + n)).map(([n, d]) => ({ name: d.info.name, desc: d.info.desc, icon: (ctx, x, y) => this.entityIcon(ctx, n, x, y) })) };
    };
    switch (tab) {
      case "TIPS": {
        const all = this.hints();
        return { total: all.length, list: all.filter((h) => Save.seen(h.key)).map((h) => ({ name: "", desc: UI.keys(h.text), icon: (ctx, x, y) => PowerIcon(ctx, "pulse", x, y, "#00f0ff") })) };
      }
      case "ENEMIES": return ent((d) => isEnemy(d) && !isBoss(d));
      case "BOSSES": return ent((d) => isBoss(d));
      case "HAZARDS": return ent((d) => !isEnemy(d) && !isBoss(d) && d.info.kind !== "item");
      case "WEAPONS": {
        const all = Object.keys(Registry.weapons).sort((a, b) => Registry.weapons[a].order - Registry.weapons[b].order);
        return { total: all.length, list: all.filter((n) => this.known("w:" + n)).map((n) => {
          const d = Registry.weapons[n];
          return { name: d.label, desc: d.desc || "", icon: (ctx, x, y) => d.icon && d.icon(ctx, x, y, d.color) };
        }) };
      }
      case "ABILITIES": {
        const all = Object.keys(UPGRADE_INFO);
        return { total: all.length, list: all.filter((k) => this.known("a:" + k)).map((k) => {
          const inf = UPGRADE_INFO[k];
          return { name: inf.name, desc: `${inf.desc} ${UI.keys(inf.how)}`, icon: (ctx, x, y) => PowerIcon(ctx, k, x, y, "#ffd23d") };
        }) };
      }
      case "ITEMS": {
        const ups = Object.keys(POWERUPS), items = ents.filter(([, d]) => d.info.kind === "item");
        const list = ups.filter((k) => this.known("p:" + k)).map((k) => ({ name: POWERUPS[k].label, desc: POWERUPS[k].desc || "", icon: (ctx, x, y) => PowerIcon(ctx, k, x, y, POWERUPS[k].color) }))
          .concat(items.filter(([n]) => this.known("e:" + n)).map(([n, d]) => ({ name: d.info.name, desc: d.info.desc, icon: (ctx, x, y) => this.entityIcon(ctx, n, x, y) })));
        return { total: ups.length + items.length, list };
      }
    }
    return { total: 0, list: [] };
  },

  /** Draw a small live preview of an entity type, centred at (cx, cy), fitting
   *  a 40 px box. Uses the entity's own draw() on a stand-in world. */
  entityIcon(ctx, name, cx, cy, box = 40) {
    const def = Registry.entities[name];
    if (!def || !def.draw) return;
    if (!this._stub) {
      const quiet = { emit() {}, burst() {}, ring() {}, dust() {} };
      this._stub = {
        time: 0, htime: 0, w: 1, h: 1, pw: 32, ph: 32, tiles: new Uint8Array(1), entities: [], solids: [], flags: {},
        theme: { accent: "#00f0ff", bgTop: "#050818", bgBottom: "#0a1a3a", gridColor: "#0b3a5a" }, skins: {},
        particles: quiet, camera: { shake() {} }, onScreen: () => false, bossesAlive: () => false, boss: null,
        player: { x: -9999, y: -9999, w: 20, h: 28, alive: true, has: () => false, sudo: 0, form: "normal", upgrades: new Set(), weapons: [] },
      };
    }
    const S = this._stub;
    S.time = S.htime = Game.time;
    let e = this._icons && this._icons[name];
    if (!e) {
      const size = def.size || [32, 32];
      e = { name, def, x: 0, y: 0, w: size[0], h: size[1], vx: 0, vy: 0, t: 30, dead: false, active: true, hp: 1, maxHp: 1,
        flash: 0, iframes: 0, layer: 1, opts: {}, col: 0, row: 0, home: { x: 0, y: 0 }, dir: 1 };
      if (def.props) for (const k in def.props) { const v = def.props[k]; e[k] = v && typeof v === "object" && !Array.isArray(v) ? Object.assign({}, v) : v; }
      e.maxHp = e.hp;
      try { if (def.init) def.init(e, S); } catch (err) { /* preview only */ }
      e.x = e.home.x = 0; e.y = e.home.y = 0;
      (this._icons = this._icons || {})[name] = e;
    }
    e.t = Game.time;
    const s = Math.min(box / Math.max(1, e.w), box / Math.max(1, e.h), 1.4);
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - box / 2 - 4, cy - box / 2 - 4, box + 8, box + 8); ctx.clip();
    ctx.translate(cx - (e.w * s) / 2, cy - (e.h * s) / 2);
    ctx.scale(s, s);
    try { def.draw(e, ctx, S); } catch (err) {
      ctx.restore(); ctx.save();
      ctx.fillStyle = "#33445a"; ctx.fillRect(cx - 12, cy - 12, 24, 24);
    }
    ctx.restore();
    ctx.globalAlpha = 1; ctx.setLineDash([]); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  },

  // ---------------------------------------------------------------- controls page rows
  /** [{ name, key, touch, dim }] for the Controls page; abilities come from UPGRADE_INFO. */
  controlRows(player) {
    const row = (name, how, o = {}) => ({ name, key: o.key || UI.keys(how, false), touch: o.touch || UI.keys(how, true), dim: !!o.dim });
    const base = this.BASE_CONTROLS.map((c) => row(c.name, c.how, c));
    base.splice(3, 0, row("DASH", "{dash}", { dim: player ? !player.has("dash") : !Save.data.upgrades.includes("dash") }));
    const owned = (k) => (player ? player.has(k) : (Save.data.upgrades || []).includes(k));
    const abil = Object.keys(UPGRADE_INFO).filter((k) => UPGRADE_INFO[k].action).map((k) => {
      const inf = UPGRADE_INFO[k], have = owned(k), tok = "{" + inf.action.toLowerCase() + "}";
      const air = k === "groundSlam" ? " in air" : "";
      return row(have ? inf.name : `${inf.name} · W${inf.world || "?"}`, tok, { dim: !have, key: UI.keys(tok, false) + air, touch: inf.label + air });
    });
    return { base, abil };
  },
};

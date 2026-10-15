/* =========================================================================
 * entities/pixel.js — World 3 "Pixel World" enemies, hazards and helpers.
 * Everything is drawn from chunky squares in the PICO-8 16-colour palette.
 *
 *   pixelSlime      hops at you; splits into two smaller slimes when hit
 *   blockBat        hangs from a ceiling, swoops when you pass below
 *   bouncingSquare  flies in straight lines and bounces off walls (armoured top)
 *   vanishBlock     solid block that blinks out after you stand on it
 *   pixelWall       solid column that slides back and forth — don't get pinned
 *   halfBlock       half-height block: crawlspaces only a shrunken player fits
 *   placedBlock     the temporary block made by Block Place
 *
 * Also adds the World 3 abilities (Pixel Shrink, Block Place, Rewind) to the
 * upgrade banner table, and their sounds.
 * ========================================================================= */
"use strict";

const PICO = {
  black: "#000000", navy: "#1d2b53", plum: "#7e2553", green: "#008751", brown: "#ab5236",
  dgray: "#5f574f", lgray: "#c2c3c7", white: "#fff1e8", red: "#ff004d", orange: "#ffa300",
  yellow: "#ffec27", lime: "#00e436", blue: "#29adff", lilac: "#83769c", pink: "#ff77a8", peach: "#ffccaa",
};

/** Draw a sprite from strings: each char is a palette key, "." is empty. */
function pixelSprite(ctx, rows, x, y, s, pal) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const k = row[c];
      if (k === ".") continue;
      ctx.fillStyle = pal[k];
      ctx.fillRect(Math.round(x + c * s), Math.round(y + r * s), Math.ceil(s), Math.ceil(s));
    }
  }
}

Object.assign(UPGRADE_INFO, {
  shrink: { name: "PIXEL SHRINK", how: "{shrink}" },
  blockPlace: { name: "BLOCK PLACE", how: "{block}" },
  rewind: { name: "REWIND", how: "once per level, on death" },
});

sfx.define("shrink", (s, t) => s.tone(t, { type: "square", f0: 880, f1: 1760, dur: 0.12, vol: 0.07 }), 0.08);
sfx.define("grow", (s, t) => s.tone(t, { type: "square", f0: 1760, f1: 660, dur: 0.12, vol: 0.07 }), 0.08);
sfx.define("place", (s, t) => {
  s.tone(t, { type: "square", f0: 220, dur: 0.05, vol: 0.09 });
  s.tone(t, { type: "square", f0: 330, dur: 0.06, vol: 0.08, delay: 0.05 });
}, 0.08);
sfx.define("rewind", (s, t) => {
  s.tone(t, { type: "sawtooth", f0: 1200, f1: 150, dur: 0.5, vol: 0.09 });
  s.arp(t, [784, 659, 523, 392], { type: "square", step: 0.07, vol: 0.06, delay: 0.25 });
}, 0.5);
sfx.define("slime", (s, t) => s.tone(t, { type: "square", f0: 160, f1: 320, dur: 0.07, vol: 0.06 }), 0.1);

// ---------------------------------------------------------------- pixelSlime
// override: size 1-3 (3 = big, splits twice)
const SLIME_DIMS = { 3: [30, 22], 2: [20, 15], 1: [12, 9] };
registerEntity("pixelSlime", {
  size: [30, 22],
  props: { enemy: true, hurts: true, stompable: true, shootable: true, dashable: true, hp: 1, size: 3, color: PICO.lime },
  init(e) {
    const [w, h] = SLIME_DIMS[e.size] || SLIME_DIMS[3];
    e.x += (e.w - w) / 2; e.y += e.h - h; e.w = w; e.h = h;
    e.hopT = 30 + Math.floor(Math.random() * 40);
    e.dir = -1;
  },
  update(e, world) {
    const p = world.player;
    e.vy = Math.min(10, e.vy + 0.5);
    const res = Physics.move(world, e, e.vx, e.vy);
    if (res.hitY) { e.vy = 0; if (res.onGround) e.vx = U.approach(e.vx, 0, 0.4); }
    if (res.hitX) e.vx = -e.vx;
    if (res.onGround && --e.hopT <= 0) {
      e.hopT = [0, 40, 55, 70][e.size];
      const dx = U.cx(p) - U.cx(e);
      e.dir = U.sign(dx) || e.dir;
      const near = Math.abs(dx) < 9 * TILE;
      e.vx = near ? e.dir * (1.2 + (4 - e.size) * 0.5) : 0;
      e.vy = -(4.5 + e.size * 0.8);
      if (near && world.onScreen(e)) sfx.play("slime");
    }
    e.squash = res.onGround ? Math.min(1, (e.squash || 0) + 0.15) : 0;
    if (e.y > world.ph + 100) e.dead = true;
  },
  onDeath(e, world) {
    if (e.size <= 1) return;
    for (const d of [-1, 1]) {
      const kid = world.spawn("pixelSlime", U.cx(e) - 10, e.y, { size: e.size - 1 });
      if (kid) { kid.vx = d * 2.2; kid.vy = -5; kid.transient = true; kid.hopT = 40; }
    }
  },
  draw(e, ctx) {
    const s = e.w / 10;                          // pixel size scales with the slime
    const flat = e.squash > 0.5 ? 1 : 0;
    const pal = { g: e.flash ? PICO.white : e.color, d: PICO.green, w: PICO.white };
    pixelSprite(ctx, [
      flat ? ".........." : "...gggg...",
      "..gggggg..",
      ".gwggggggg",
      "gggggggggg",
      "dddddddddd",
    ].slice(flat), e.x, e.y + e.h - (5 - flat) * (e.h / 5), s, pal);
  },
});

// ---------------------------------------------------------------- blockBat
registerEntity("blockBat", {
  size: [26, 18],
  anchor: "top",
  props: { enemy: true, hurts: true, stompable: true, shootable: true, dashable: true, hp: 1,
    reach: 5, depth: 5, color: PICO.pink },
  init(e) { e.mode = "hang"; e.k = 0; e.cool = 0; },
  update(e, world) {
    const p = world.player;
    if (e.cool > 0) e.cool--;
    if (e.mode === "hang") {
      const dx = U.cx(p) - U.cx(e), dy = p.y - e.y;
      if (p.alive && e.cool <= 0 && Math.abs(dx) < e.reach * TILE && dy > 0 && dy < (e.depth + 2) * TILE) {
        e.mode = "swoop"; e.k = 0;
        e.sx = e.home.x; e.tx = U.cx(p) - e.w / 2 + U.sign(dx || 1) * 2 * TILE;
        e.dy = Math.min(e.depth * TILE, dy + 8);
      }
      return;
    }
    if (e.mode === "swoop") {
      e.k += 1 / 70;
      e.x = U.lerp(e.sx, e.tx, e.k);
      e.y = e.home.y + Math.sin(Math.min(1, e.k) * Math.PI) * e.dy;
      if (e.k >= 1) { e.mode = "return"; e.k = 0; e.rx = e.x; }
      return;
    }
    // return home
    e.k += 1 / 50;
    e.x = U.lerp(e.rx, e.home.x, e.k);
    e.y = e.home.y - Math.sin(Math.min(1, e.k) * Math.PI) * 12;
    if (e.k >= 1) { e.mode = "hang"; e.x = e.home.x; e.y = e.home.y; e.cool = 60; }
  },
  draw(e, ctx, world) {
    const flap = e.mode !== "hang" && Math.floor(world.time / 6) % 2 === 0;
    const pal = { b: e.flash ? PICO.white : PICO.plum, p: e.color, y: PICO.yellow };
    const rows = e.mode === "hang"
      ? [".....bbbb....", "....bpppb....", "....bpypb....", "....bpppb....", ".....bbbb...."]
      : flap
        ? ["p...........p", "pp..bbbbb..pp", ".ppbpppppbpp.", "...bppyppb...", "....bbbbb...."]
        : ["....bbbbb....", "...bpppppb...", ".ppbppyppbpp.", "pp..bbbbb..pp", "p...........p"];
    pixelSprite(ctx, rows, e.x, e.y + 1, 2, pal);
  },
});

// ---------------------------------------------------------------- bouncingSquare
// overrides: speed, angle ("dl" | "dr" | "ul" | "ur" start direction)
registerEntity("bouncingSquare", {
  size: [22, 22],
  anchor: "center",
  props: { enemy: true, hurts: true, stompable: "bounce", shootable: true, dashable: true, hp: 3, speed: 2.4, color: PICO.orange },
  init(e) {
    const d = { dl: [-1, 1], dr: [1, 1], ul: [-1, -1], ur: [1, -1] }[e.opts.angle] || [1, 1];
    e.vx = d[0] * e.speed; e.vy = d[1] * e.speed;
  },
  update(e, world) {
    const res = Physics.move(world, e, e.vx, e.vy, { oneway: false });
    if (res.hitX) e.vx = -e.vx;
    if (res.hitY) e.vy = -e.vy;
    if (e.y > world.ph + 100 || e.y < -200) e.dead = true;
  },
  draw(e, ctx, world) {
    const c = e.flash ? PICO.white : e.color;
    ctx.fillStyle = PICO.brown; ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.fillStyle = c; ctx.fillRect(e.x + 2, e.y + 2, e.w - 4, e.h - 4);
    ctx.fillStyle = PICO.yellow;
    const k = Math.floor(world.time / 8) % 2 ? 6 : 8;
    ctx.fillRect(e.x + k, e.y + k, e.w - k * 2, e.h - k * 2);
    ctx.fillStyle = PICO.white; ctx.fillRect(e.x + 4, e.y + 4, 4, 4);
  },
});

// ---------------------------------------------------------------- vanishBlock
registerEntity("vanishBlock", {
  size: [32, 32],
  anchor: "topleft",
  props: { solid: true, delay: 28, away: 150, alwaysActive: true }, // timers keep running off-screen
  init(e) { this.onRespawn(e); },
  onRespawn(e) { e.mode = "idle"; e.timer = 0; e.solid = true; },
  update(e, world) {
    const p = world.player;
    if (e.mode === "idle") {
      const onTop = p.alive && p.ground === e;
      const touching = p.alive && U.overlap(p, { x: e.x - 2, y: e.y - 2, w: e.w + 4, h: e.h + 4 });
      if (onTop || (touching && e.opts.touch)) { e.mode = "blink"; e.timer = e.delay; }
    } else if (e.mode === "blink") {
      if (--e.timer <= 0) { e.mode = "gone"; e.timer = e.away; e.solid = false; world.particles.burst(U.cx(e), U.cy(e), 10, PICO.blue, 3); }
    } else if (--e.timer <= 0 && !U.overlap(e, p)) {
      e.mode = "idle"; e.solid = true;
    }
  },
  draw(e, ctx, world) {
    if (e.mode === "gone") {
      ctx.fillStyle = U.rgba(PICO.blue, 0.25);
      for (let i = 0; i < 4; i++) ctx.fillRect(e.x + i * 8 + 2, e.y + 14, 4, 4);
      return;
    }
    if (e.mode === "blink" && Math.floor(e.timer / 4) % 2) return;
    ctx.fillStyle = PICO.navy; ctx.fillRect(e.x, e.y, 32, 32);
    ctx.fillStyle = PICO.blue; ctx.fillRect(e.x, e.y, 32, 4); ctx.fillRect(e.x, e.y, 4, 32);
    ctx.fillStyle = PICO.lilac; ctx.fillRect(e.x + 28, e.y + 4, 4, 28); ctx.fillRect(e.x + 4, e.y + 28, 28, 4);
    ctx.fillStyle = PICO.white; ctx.fillRect(e.x + 12, e.y + 12, 8, 8);
  },
});

// ---------------------------------------------------------------- pixelWall
// One char at the top of the wall; it reaches down to the floor and slides.
// overrides: range (tiles, sign = direction), speed (px/frame), offset (frames)
registerEntity("pixelWall", {
  size: [32, 32],
  anchor: "topleft",
  layer: 1,
  props: { solid: true, range: 4, speed: 1.2, offset: 0, alwaysActive: true },
  init(e, world) {
    let r = e.row;
    while (r < world.h && !Physics.solidAt(world, e.col, r)) r++;
    e.h = Math.max(TILE, (r - e.row) * TILE);
    e.dist = Math.abs(e.range) * TILE;
    e.sgn = e.range < 0 ? -1 : 1;
    e.period = Math.max(60, Math.round((2 * e.dist) / e.speed));
  },
  posAt(e, t) {
    const ph = (((t + e.offset) % e.period) + e.period) % e.period / e.period;
    const k = ph < 0.5 ? ph * 2 : 2 - ph * 2;
    return e.home.x + e.sgn * e.dist * k;
  },
  update(e, world) {
    Physics.moveSolid(world, e, this.posAt(e, world.htime) - e.x, 0);
  },
  draw(e, ctx, world) {
    for (let y = e.y, i = 0; y < e.y + e.h; y += 16, i++) {
      ctx.fillStyle = i % 2 ? PICO.red : PICO.plum;
      ctx.fillRect(e.x, y, 32, 16);
      ctx.fillStyle = PICO.black;
      ctx.fillRect(e.x + (i % 2 ? 16 : 0), y, 4, 16);
      ctx.fillRect(e.x, y + 12, 32, 4);
    }
    // Arrow pixels show which way it's heading.
    const dir = U.sign(this.posAt(e, world.htime + 2) - this.posAt(e, world.htime)) || 1;
    ctx.fillStyle = PICO.yellow;
    const ax = e.x + 12, ay = e.y + e.h / 2 - 6;
    for (let i = 0; i < 3; i++) ctx.fillRect(ax + (dir > 0 ? i * 4 : 8 - i * 4), ay + i * 4 - (i === 2 ? 4 : 0), 4, 4 + (i === 1 ? 4 : 0));
  },
});

// ---------------------------------------------------------------- halfBlock
// arg: "high" (default, upper half of the cell) | "low" (lower half)
registerEntity("halfBlock", {
  size: [32, 16],
  anchor: "top",
  props: { solid: true },
  init(e, world, arg) {
    e.x = e.col * TILE;
    e.y = arg === "low" ? e.row * TILE + 16 : e.row * TILE;
  },
  draw(e, ctx, world) {
    const th = world.theme;
    ctx.fillStyle = th.tileFill; ctx.fillRect(e.x, e.y, 32, 16);
    ctx.fillStyle = th.accent; ctx.fillRect(e.x, e.y + 12, 32, 4);
    ctx.fillStyle = PICO.black; ctx.fillRect(e.x + 14, e.y, 4, 12);
  },
});

// ---------------------------------------------------------------- placedBlock
registerEntity("placedBlock", {
  size: [32, 32],
  layer: 1,
  props: { solid: true, transient: true, alwaysActive: true, life: 240 },
  update(e) { if (--e.life <= 0) e.dead = true; },
  draw(e, ctx) {
    if (e.life < 60 && Math.floor(e.life / 4) % 2) return;
    ctx.fillStyle = PICO.orange; ctx.fillRect(e.x, e.y, 32, 32);
    ctx.fillStyle = PICO.yellow; ctx.fillRect(e.x, e.y, 32, 4); ctx.fillRect(e.x, e.y, 4, 32);
    ctx.fillStyle = PICO.brown; ctx.fillRect(e.x + 28, e.y + 4, 4, 28); ctx.fillRect(e.x + 4, e.y + 28, 28, 4);
    ctx.fillStyle = PICO.white; ctx.fillRect(e.x + 14, e.y + 8, 4, 16); ctx.fillRect(e.x + 8, e.y + 14, 16, 4);
  },
});

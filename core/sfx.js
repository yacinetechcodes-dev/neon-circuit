/* =========================================================================
 * core/sfx.js — procedural sound effects (Web Audio API, no audio files,
 * no music).
 *
 *   sfx.play("jump")            play a sound by name
 *   sfx.define("name", fn)      add a sound: fn(s, t) where s is a set of
 *                               synth helpers and t is the start time
 *   sfx.toggleMute()            mute / unmute (saved in localStorage)
 *
 * Browsers only allow audio after a user gesture, so the AudioContext is
 * created/resumed by sfx.unlock(), which core/input.js calls on the first
 * key press, click or touch. Until then play() silently does nothing.
 * ========================================================================= */
"use strict";

const sfx = {
  ctx: null,
  master: null,
  muted: false,
  volume: 0.22,           // master volume (kept low)
  sounds: {},
  _last: {},              // name → last play time (anti-stacking)
  _noise: null,
  KEY: "neonCircuit.muted",

  init() {
    try { this.muted = localStorage.getItem(this.KEY) === "1"; } catch (e) { /* storage blocked */ }
  },

  /** Create / resume the audio context. Safe to call many times. */
  unlock() {
    const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    if (!this.ctx) {
      try {
        this.ctx = new AC();
        // Gentle compressor so overlapping sounds never clip.
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.ratio.value = 6;
        comp.connect(this.ctx.destination);
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : this.volume;
        this.master.connect(comp);
      } catch (e) { this.ctx = null; return; }
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  },

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem(this.KEY, this.muted ? "1" : "0"); } catch (e) { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    if (!this.muted) this.play("menu");
    return this.muted;
  },

  define(name, fn, minGap = 0.03) {
    this.sounds[name] = { fn, minGap };
  },

  play(name) {
    const c = this.ctx;
    if (!c || this.muted || c.state !== "running") return;
    const snd = this.sounds[name];
    if (!snd) { console.warn(`[sfx] unknown sound "${name}"`); return; }
    const now = c.currentTime;
    if (now - (this._last[name] || -1) < snd.minGap) return; // avoid machine-gun stacking
    this._last[name] = now;
    try { snd.fn(this._helpers(), now + 0.005); } catch (e) { console.warn("[sfx]", name, e); }
  },

  // ---------------------------------------------------------- synth helpers
  _helpers() {
    const c = this.ctx, out = this.master, self = this;
    return {
      /** Oscillator with a pitch sweep and a quick attack/decay envelope.
       *  o: { type, f0, f1, dur, vol, delay, attack } */
      tone(t, o) {
        const st = t + (o.delay || 0), dur = o.dur || 0.1;
        const osc = c.createOscillator(), g = c.createGain();
        osc.type = o.type || "square";
        osc.frequency.setValueAtTime(o.f0, st);
        if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), st + dur);
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(o.vol || 0.3, st + (o.attack || 0.004));
        g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
        osc.connect(g); g.connect(out);
        osc.start(st); osc.stop(st + dur + 0.02);
      },
      /** Filtered white noise burst. o: { dur, vol, delay, filter, f0, f1, q } */
      noise(t, o) {
        const st = t + (o.delay || 0), dur = o.dur || 0.1;
        if (!self._noise) {
          const len = c.sampleRate;
          self._noise = c.createBuffer(1, len, c.sampleRate);
          const d = self._noise.getChannelData(0);
          for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        }
        const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        src.buffer = self._noise;
        f.type = o.filter || "bandpass";
        f.Q.value = o.q || 1;
        f.frequency.setValueAtTime(o.f0 || 1000, st);
        if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, st + dur);
        g.gain.setValueAtTime(o.vol || 0.3, st);
        g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
        src.connect(f); f.connect(g); g.connect(out);
        src.start(st, Math.random() * 0.5); src.stop(st + dur + 0.02);
      },
      /** Quick note sequence. */
      arp(t, notes, o = {}) {
        notes.forEach((f, i) => this.tone(t, Object.assign({ f0: f, dur: o.step * 1.6 || 0.1 }, o, { delay: (o.delay || 0) + i * (o.step || 0.06) })));
      },
    };
  },
};

// ------------------------------------------------------------------ sounds
// Volumes are balanced against each other; frequent sounds are quieter.
sfx.define("jump", (s, t) => s.tone(t, { type: "square", f0: 220, f1: 560, dur: 0.09, vol: 0.12 }));
sfx.define("doubleJump", (s, t) => {
  s.tone(t, { type: "square", f0: 420, f1: 980, dur: 0.08, vol: 0.1 });
  s.tone(t, { type: "triangle", f0: 840, f1: 1600, dur: 0.07, vol: 0.1, delay: 0.035 });
});
sfx.define("dash", (s, t) => {
  s.noise(t, { f0: 2600, f1: 380, dur: 0.17, vol: 0.28, q: 2 });
  s.tone(t, { type: "sawtooth", f0: 320, f1: 90, dur: 0.13, vol: 0.07 });
});
sfx.define("land", (s, t) => {
  s.noise(t, { filter: "lowpass", f0: 500, dur: 0.06, vol: 0.18 });
  s.tone(t, { type: "sine", f0: 130, f1: 60, dur: 0.07, vol: 0.14 });
}, 0.08);
sfx.define("core", (s, t) => {
  s.tone(t, { type: "square", f0: 1318, dur: 0.05, vol: 0.07 });
  s.tone(t, { type: "square", f0: 1760, dur: 0.08, vol: 0.07, delay: 0.045 });
}, 0.02);
sfx.define("secret", (s, t) => s.arp(t, [880, 1108, 1318, 1760, 2217], { type: "triangle", step: 0.055, vol: 0.14 }));
sfx.define("powerup", (s, t) => s.arp(t, [523, 659, 784, 1046], { type: "square", step: 0.06, vol: 0.08 }));
sfx.define("shield", (s, t) => {
  s.tone(t, { type: "triangle", f0: 1400, f1: 300, dur: 0.22, vol: 0.18 });
  s.noise(t, { filter: "highpass", f0: 3000, dur: 0.09, vol: 0.12 });
}, 0.06);
sfx.define("damage", (s, t) => {
  s.tone(t, { type: "sawtooth", f0: 320, f1: 80, dur: 0.22, vol: 0.14 });
  s.noise(t, { f0: 900, dur: 0.12, vol: 0.2 });
}, 0.1);
sfx.define("death", (s, t) => {
  s.tone(t, { type: "sawtooth", f0: 480, f1: 35, dur: 0.7, vol: 0.16 });
  s.tone(t, { type: "square", f0: 240, f1: 30, dur: 0.6, vol: 0.07, delay: 0.05 });
  s.noise(t, { filter: "lowpass", f0: 2000, f1: 80, dur: 0.6, vol: 0.25 });
}, 0.3);
sfx.define("checkpoint", (s, t) => s.arp(t, [660, 990, 1320], { type: "triangle", step: 0.08, vol: 0.16 }));
sfx.define("enemyDefeat", (s, t) => {
  s.tone(t, { type: "square", f0: 700, f1: 90, dur: 0.14, vol: 0.1 });
  s.noise(t, { f0: 1500, f1: 300, dur: 0.12, vol: 0.18 });
}, 0.04);
sfx.define("pulse", (s, t) => s.tone(t, { type: "square", f0: 1500, f1: 520, dur: 0.08, vol: 0.07 }));
sfx.define("fire", (s, t) => s.tone(t, { type: "sawtooth", f0: 760, f1: 240, dur: 0.09, vol: 0.06 }), 0.05);
sfx.define("laser", (s, t) => {
  s.tone(t, { type: "square", f0: 1900, f1: 1500, dur: 0.12, vol: 0.035 });
  s.tone(t, { type: "sine", f0: 3800, f1: 3000, dur: 0.1, vol: 0.03 });
}, 0.12);
sfx.define("bossHit", (s, t) => {
  s.tone(t, { type: "square", f0: 180, f1: 70, dur: 0.18, vol: 0.18 });
  s.noise(t, { filter: "lowpass", f0: 1800, f1: 200, dur: 0.15, vol: 0.28 });
}, 0.08);
sfx.define("bossDefeat", (s, t) => {
  s.noise(t, { filter: "lowpass", f0: 3000, f1: 60, dur: 1.2, vol: 0.35 });
  s.tone(t, { type: "sawtooth", f0: 260, f1: 30, dur: 1.1, vol: 0.14 });
  s.arp(t, [392, 523, 659, 784, 1046], { type: "square", step: 0.09, vol: 0.07, delay: 0.7 });
}, 0.5);
sfx.define("levelComplete", (s, t) => {
  s.arp(t, [523, 659, 784, 1046, 1318], { type: "square", step: 0.075, vol: 0.08 });
  s.tone(t, { type: "triangle", f0: 1568, dur: 0.4, vol: 0.12, delay: 0.4 });
}, 0.5);
// Extra feedback sounds.
sfx.define("hit", (s, t) => {        // enemy damaged but not destroyed
  s.tone(t, { type: "square", f0: 520, f1: 260, dur: 0.07, vol: 0.08 });
  s.noise(t, { f0: 2200, dur: 0.05, vol: 0.1 });
}, 0.04);
sfx.define("stomp", (s, t) => s.tone(t, { type: "square", f0: 300, f1: 700, dur: 0.08, vol: 0.1 }), 0.05);
sfx.define("blocked", (s, t) => {    // shot / dash deflected by armour or a shield
  s.tone(t, { type: "triangle", f0: 2400, f1: 1800, dur: 0.06, vol: 0.08 });
  s.noise(t, { filter: "highpass", f0: 4000, dur: 0.04, vol: 0.08 });
}, 0.05);
sfx.define("refill", (s, t) => {     // dash crystal
  s.tone(t, { type: "triangle", f0: 1200, f1: 2400, dur: 0.1, vol: 0.1 });
  s.tone(t, { type: "sine", f0: 2400, dur: 0.08, vol: 0.06, delay: 0.05 });
}, 0.05);
sfx.define("slam", (s, t) => {       // crusher impact
  s.noise(t, { filter: "lowpass", f0: 700, f1: 90, dur: 0.22, vol: 0.3 });
  s.tone(t, { type: "sine", f0: 110, f1: 40, dur: 0.2, vol: 0.18 });
}, 0.1);
sfx.define("zap", (s, t) => {        // electric floor switching on
  s.noise(t, { filter: "highpass", f0: 3000, dur: 0.12, vol: 0.06 });
  s.tone(t, { type: "sawtooth", f0: 120, f1: 180, dur: 0.12, vol: 0.04 });
}, 0.15);
sfx.define("bossWake", (s, t) => {   // boss powers up
  s.tone(t, { type: "sawtooth", f0: 60, f1: 240, dur: 0.6, vol: 0.12 });
  s.noise(t, { filter: "lowpass", f0: 200, f1: 1600, dur: 0.6, vol: 0.18 });
}, 0.5);

sfx.define("menu", (s, t) => s.tone(t, { type: "square", f0: 880, dur: 0.035, vol: 0.06 }));
sfx.define("menuConfirm", (s, t) => {
  s.tone(t, { type: "square", f0: 660, dur: 0.04, vol: 0.07 });
  s.tone(t, { type: "square", f0: 990, dur: 0.07, vol: 0.07, delay: 0.04 });
});

sfx.init();

// Rooftop Cat 3D — synthesised sound, zero audio files.
// One file, one job: every blip, ding and sweep is an oscillator, never a sample.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
  }

  // Called on the first user gesture; headless runs never call it, and
  // every play() below no-ops until the context exists.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      this.ctx = null;
    }
  }

  tone(f0, f1, dur, amp, type = 'sine', when = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t0);
    if (f1 !== null && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(amp, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  jump() { this.tone(520, 940, 0.14, 0.45, 'sine'); }
  land() { this.tone(150, 90, 0.09, 0.35, 'triangle'); }
  score() {
    this.tone(880, null, 0.18, 0.34, 'sine');
    this.tone(1318, null, 0.18, 0.20, 'sine');
  }
  perfect() {
    [880, 1108, 1318].forEach((f, i) => this.tone(f, null, 0.16, 0.32, 'sine', i * 0.06));
  }
  edge() {
    this.tone(300, 900, 0.22, 0.35, 'sine');
    this.tone(1200, null, 0.15, 0.20, 'sine', 0.05);
  }
  fall() { this.tone(420, 90, 0.6, 0.30, 'sawtooth'); }
  gameOver() {
    this.tone(220, 196, 0.35, 0.30, 'triangle');
    this.tone(165, 147, 0.5, 0.30, 'triangle', 0.35);
  }
  toggleMute() {
    this.muted = !this.muted;
    if (this._ambGain) this._ambGain.gain.value = this.muted ? 0 : 0.05;
    return this.muted;
  }

  // Soft dusk ambience: a warm low pad (two detuned sines, slow swell)
  // under a breath of filtered noise. Starts on the first gesture, so
  // it never plays before the player has touched the game.
  startAmbience() {
    if (!this.ctx || this._ambGain) return;
    try {
      const ctx = this.ctx;
      const g = ctx.createGain();
      g.gain.value = 0.0;
      g.connect(this.master);
      g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 3);
      this._ambGain = g;
      for (const [f, a] of [[110, 0.5], [164.81, 0.32], [220, 0.14]]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const og = ctx.createGain();
        og.gain.value = a;
        o.connect(og);
        og.connect(g);
        o.start();
      }
      // Slow swell: the pad breathes on a ~14 s cycle.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      lfo.start();
      // Wind: looped noise through a lowpass, barely there.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      const ng = ctx.createGain();
      ng.gain.value = 0.012;
      noise.connect(lp);
      lp.connect(ng);
      ng.connect(g);
      noise.start();
    } catch (e) {
      this._ambGain = null;
    }
  }
}

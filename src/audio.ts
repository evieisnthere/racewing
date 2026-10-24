// All sound is synthesised with WebAudio: no asset files.
// Music is an ambient/electronic loop (pads, sub, arpeggio, soft pulse) whose layers fade in with `intensity`.

const BPM = 78;
const EIGHTH = 60 / BPM / 2;
/** Chord tones as MIDI notes; two bars per chord. */
const CHORDS = [
  [50, 57, 60, 64, 69], // Dm9
  [46, 53, 57, 62, 65], // Bbmaj7
  [53, 57, 60, 64, 67], // Fmaj7
  [48, 55, 59, 62, 64], // Cmaj9-ish
];
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface EngineVoice {
  osc1: OscillatorNode; osc2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode;
  noiseGain: GainNode; noiseFilter: BiquadFilterNode; src: AudioBufferSourceNode;
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private reverb!: ConvolverNode;
  private delay!: DelayNode;
  private noise!: AudioBuffer;
  private engines: EngineVoice[] = [];
  private nextTime = 0;
  private step = 0;
  private intensity = 0.2;
  private padFilter!: BiquadFilterNode;
  private volumes = { music: 0.6, sfx: 0.8 };
  private muted = false;

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.applyVolumes();

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.master);

    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = EIGHTH * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const dlp = ctx.createBiquadFilter();
    dlp.frequency.value = 2400;
    this.delay.connect(dlp).connect(fb).connect(this.delay);
    dlp.connect(this.musicBus);
    dlp.connect(this.reverb);

    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 700;
    this.padFilter.Q.value = 0.7;
    this.padFilter.connect(this.musicBus);
    this.padFilter.connect(this.reverb);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.nextTime = ctx.currentTime + 0.1;
    window.setInterval(() => this.schedule(), 40);
  }

  get ready(): boolean { return !!this.ctx; }

  setVolumes(music: number, sfx: number): void {
    this.volumes = { music, sfx };
    this.applyVolumes();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    this.musicBus.gain.value = this.volumes.music * 0.5;
    this.sfxBus.gain.value = this.volumes.sfx;
  }

  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  /** 0.2 menu (pads), 0.6 racing (+sub, arp, pulse), 0.85+ final lap (+hats, brighter). */
  setIntensity(v: number): void {
    this.intensity = v;
    if (this.ctx) this.padFilter.frequency.setTargetAtTime(500 + v * 1800, this.ctx.currentTime, 1.5);
  }

  private schedule(): void {
    const ctx = this.ctx!;
    while (this.nextTime < ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += EIGHTH;
      this.step++;
    }
  }

  private playStep(step: number, t: number): void {
    const ctx = this.ctx!;
    const bar = Math.floor(step / 8);
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    const beat = step % 8;
    const I = this.intensity;

    if (step % 16 === 0) {
      // Pad: detuned saw pairs, slow swell across two bars.
      const dur = EIGHTH * 16;
      for (const m of chord.slice(1)) {
        for (const det of [-7, 7]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = mtof(m);
          o.detune.value = det;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.025, t + 1.6);
          g.gain.setValueAtTime(0.025, t + dur - 0.4);
          g.gain.linearRampToValueAtTime(0, t + dur + 1.2);
          o.connect(g).connect(this.padFilter);
          o.start(t); o.stop(t + dur + 1.3);
        }
      }
    }
    if (I >= 0.45 && beat === 0) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = mtof(chord[0] - 12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + EIGHTH * 7.5);
      o.connect(g).connect(this.musicBus);
      o.start(t); o.stop(t + EIGHTH * 8);
    }
    if (I >= 0.3) {
      // Arpeggio: sparse in the menu, every eighth when racing.
      const play = I >= 0.55 || beat % 3 === 0;
      if (play) {
        const pattern = [0, 2, 1, 3, 4, 2, 3, 1];
        const m = chord[1 + (pattern[beat] % (chord.length - 1))] + 12 + (beat === 4 && I > 0.8 ? 12 : 0);
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = mtof(m);
        const g = ctx.createGain();
        const peak = 0.06 + I * 0.03;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        o.connect(g);
        g.connect(this.musicBus);
        g.connect(this.delay);
        o.start(t); o.stop(t + 0.5);
      }
    }
    if (I >= 0.55 && beat % 2 === 0) {
      // Soft kick.
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.32, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(this.musicBus);
      o.start(t); o.stop(t + 0.32);
    }
    if (I >= 0.8 && beat % 2 === 1) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      src.connect(f).connect(g).connect(this.musicBus);
      src.start(t, Math.random()); src.stop(t + 0.07);
    }
  }

  // ---------- engines ----------

  /** Create/destroy engine voices so there is one per local player. */
  setEngines(count: number): void {
    if (!this.ctx) return;
    while (this.engines.length > count) {
      const e = this.engines.pop()!;
      const t = this.ctx.currentTime;
      e.gain.gain.setTargetAtTime(0, t, 0.05);
      e.noiseGain.gain.setTargetAtTime(0, t, 0.05);
      e.osc1.stop(t + 0.3); e.osc2.stop(t + 0.3); e.src.stop(t + 0.3);
    }
    while (this.engines.length < count) this.engines.push(this.makeEngine());
  }

  private makeEngine(): EngineVoice {
    const ctx = this.ctx!;
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 3;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc1.connect(filter); osc2.connect(filter);
    filter.connect(gain).connect(this.sfxBus);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 2200;
    noiseFilter.Q.value = 0.9;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    src.connect(noiseFilter).connect(noiseGain).connect(this.sfxBus);
    osc1.start(); osc2.start(); src.start();
    return { osc1, osc2, filter, gain, noiseGain, noiseFilter, src };
  }

  updateEngine(i: number, speed: number, throttle: number, grinding: boolean, active: boolean): void {
    const e = this.engines[i];
    if (!e || !this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 42 + speed * 0.075;
    e.osc1.frequency.setTargetAtTime(f, t, 0.05);
    e.osc2.frequency.setTargetAtTime(f * 2.01, t, 0.05);
    e.filter.frequency.setTargetAtTime(180 + speed * 1.4 + (throttle > 0 ? 250 : 0), t, 0.06);
    const share = 1 / Math.max(1, this.engines.length);
    e.gain.gain.setTargetAtTime(active ? (throttle !== 0 ? 0.085 : 0.05) * share : 0, t, 0.08);
    e.noiseGain.gain.setTargetAtTime(active && grinding ? 0.11 * share : 0, t, 0.03);
    e.noiseFilter.frequency.setTargetAtTime(1600 + speed * 1.5, t, 0.05);
  }

  // ---------- one-shots ----------

  hit(strength: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const v = Math.min(1, strength / 500);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(g).connect(this.sfxBus);
    o.start(t); o.stop(t + 0.3);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.35 * v, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(f).connect(ng).connect(this.sfxBus);
    src.start(t, Math.random()); src.stop(t + 0.2);
  }

  private tone(freq: number, at: number, dur: number, vol: number, type: OscillatorType = 'sine', wet = true): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    o.connect(g).connect(this.sfxBus);
    if (wet) g.connect(this.reverb);
    o.start(at); o.stop(at + dur + 0.05);
  }

  pad(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(1300, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g).connect(this.sfxBus);
    g.connect(this.reverb);
    o.start(t); o.stop(t + 0.42);
  }

  countdown(go: boolean): void {
    if (!this.ctx) return;
    this.tone(go ? 880 : 440, this.ctx.currentTime, go ? 0.6 : 0.25, 0.18, 'square', false);
  }

  chime(kind: 'lap' | 'best' | 'record' | 'finish' | 'out' | 'star'): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes: Record<typeof kind, number[]> = {
      lap: [74, 81],
      best: [74, 78, 81, 86],
      record: [74, 78, 81, 86, 90],
      finish: [62, 69, 74, 78, 81, 86],
      out: [62, 57, 50],
      star: [86, 93],
    };
    notes[kind].forEach((m, i) => this.tone(mtof(m), t + i * 0.09, 0.9, 0.12, 'triangle'));
  }
}

export const sound = new Sound();

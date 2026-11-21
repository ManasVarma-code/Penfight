class SoundSynth {
  private ctx: AudioContext | null = null;
  private muted = false;

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private ready(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) this.unlock();
    if (!this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  playFlick(power01: number, turbo: boolean): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Crisp plastic desk flick whoosh + snap
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = turbo ? 'sawtooth' : 'triangle';
    const baseFreq = turbo ? 220 : 170 + power01 * 120;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(turbo ? 720 : 420 + power01 * 160, now + 0.085);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(turbo ? 0.24 : 0.14 + power01 * 0.08, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (turbo ? 0.22 : 0.12));

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (turbo ? 0.24 : 0.14));

    if (turbo) {
      // Sub-bass punch for Turbo Flick
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(140, now);
      sub.frequency.exponentialRampToValueAtTime(42, now + 0.18);
      subGain.gain.setValueAtTime(0.28, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      sub.connect(subGain);
      subGain.connect(ctx.destination);
      sub.start(now);
      sub.stop(now + 0.22);
    }
  }

  playClack(intensity01: number, isCrit = false): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    const clamped = Math.max(0.15, Math.min(1, intensity01));

    // Layered plastic-on-plastic clack: filtered noise transient + dual woody tone
    const bufferSize = Math.floor(ctx.sampleRate * 0.04);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.22));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1750 + clamped * 950, now);
    filter.Q.setValueAtTime(2.6, now);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.32 * clamped, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(ctx.destination);
    noise.start(now);

    // Resonant hollow barrel click
    const click = ctx.createOscillator();
    const cGain = ctx.createGain();
    click.type = 'triangle';
    click.frequency.setValueAtTime(920 + clamped * 440, now);
    click.frequency.exponentialRampToValueAtTime(340, now + 0.045);
    cGain.gain.setValueAtTime(0.22 * clamped, now);
    cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    click.connect(cGain);
    cGain.connect(ctx.destination);
    click.start(now);
    click.stop(now + 0.06);

    if (isCrit) {
      // Bright pentatonic Whip Crit shimmer!
      const notes = [880, 1174.66, 1567.98];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        const t = now + idx * 0.032;
        osc.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.16, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.24);
      });
    }
  }

  playRingOut(playerWon: boolean): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Dramatic falling whistle
    const fall = ctx.createOscillator();
    const fGain = ctx.createGain();
    fall.type = 'sine';
    fall.frequency.setValueAtTime(580, now);
    fall.frequency.exponentialRampToValueAtTime(140, now + 0.34);
    fGain.gain.setValueAtTime(0.16, now);
    fGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    fall.connect(fGain);
    fGain.connect(ctx.destination);
    fall.start(now);
    fall.stop(now + 0.38);

    // Victory or defeat chord sting
    const chord = playerWon ? [523.25, 659.25, 783.99, 1046.5] : [349.23, 311.13, 261.63];
    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = playerWon ? 'triangle' : 'sawtooth';
      const t = now + 0.16 + i * 0.06;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(playerWon ? 0.14 : 0.08, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  }

  playCoinBurst(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = [1046.5, 1318.5, 1567.98, 2093.0];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      const t = now + i * 0.055;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.21);
    });
  }

  playUiTap(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(840, now + 0.04);
    g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  }
}

export const soundSynth = new SoundSynth();

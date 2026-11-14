import { state } from './store.js';

class AudioManager {
  constructor() {
    this.manifest = null;
    this.slots = {};
    this.cache = new Map();
    this.activeLoops = new Map();
    this.unlocked = false;
    this.masterVolume = 0.7;
    this.musicVolume = 0.7;
    this.sfxVolume = 0.8;
    this.muted = false;
    this.lastPlayed = new Map(); // For debouncing rapid sounds
    this.synthContext = null;
    this.synthLoops = new Map();
    this._loadSettings();
    this._bindUnlock();
  }

  _getSynthContext() {
    if (!this.synthContext && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.synthContext = new AudioCtx();
      }
    }
    if (this.synthContext && this.synthContext.state === 'suspended' && this.unlocked) {
      this.synthContext.resume().catch(() => {});
    }
    return this.synthContext;
  }

  _synthesizeSound(slotId, volume = 1.0) {
    if (this.muted) return;
    const ctx = this._getSynthContext();
    if (!ctx) return;

    const cat = this.getCategory(slotId);
    const effVol = this.getEffectiveVolume(cat) * volume;
    if (effVol <= 0.001) return;

    const now = ctx.currentTime;

    if (slotId === 'ui_hover') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(680, now);
      osc.frequency.exponentialRampToValueAtTime(840, now + 0.035);
      gain.gain.setValueAtTime(effVol * 0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (slotId === 'ui_click' || slotId === 'ui_confirm') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(920, now);
      osc.frequency.exponentialRampToValueAtTime(460, now + 0.06);
      gain.gain.setValueAtTime(effVol * 0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    } else if (slotId === 'engine_ignition') {
      // Noise buffer for blast + low sweep
      const bufSize = Math.floor(ctx.sampleRate * 0.9);
      const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.25));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(280, now);
      filter.frequency.exponentialRampToValueAtTime(90, now + 0.8);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(effVol * 0.85, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);
    } else if (slotId === 'stage_separation') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.25);
      gain.gain.setValueAtTime(effVol * 0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (slotId === 'mission_success') {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.001, now + idx * 0.12);
        gain.gain.linearRampToValueAtTime(effVol * 0.3, now + idx * 0.12 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.65);
      });
    }
  }

  _startSynthLoop(slotId, volume = 1.0) {
    if (this.muted) return;
    const ctx = this._getSynthContext();
    if (!ctx) return;
    if (this.synthLoops.has(slotId)) return;

    const cat = this.getCategory(slotId);
    const effVol = this.getEffectiveVolume(cat) * volume;

    if (slotId === 'engine_loop') {
      const bufSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + 0.02 * white) / 1.02; // Brown noise approximation
        lastOut = data[i];
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, ctx.currentTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(effVol * 0.75, ctx.currentTime);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
      this.synthLoops.set(slotId, { source: noise, gain, filter, baseVolume: volume, category: cat });
    } else if (slotId === 'ambience_launch' || slotId === 'atmospheric_flight') {
      const bufSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 0.15 - 0.075;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(slotId === 'atmospheric_flight' ? 440 : 180, ctx.currentTime);
      filter.Q.setValueAtTime(1.2, ctx.currentTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(effVol * 0.35, ctx.currentTime);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
      this.synthLoops.set(slotId, { source: noise, gain, filter, baseVolume: volume, category: cat });
    } else if (slotId === 'rover_movement') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      gain.gain.setValueAtTime(effVol * 0.25, ctx.currentTime);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(380, ctx.currentTime);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      this.synthLoops.set(slotId, { source: osc, gain, filter, baseVolume: volume, category: cat });
    }
  }

  _stopSynthLoop(slotId) {
    const entry = this.synthLoops.get(slotId);
    if (!entry) return;
    try {
      entry.source.stop();
      entry.source.disconnect();
    } catch { }
    this.synthLoops.delete(slotId);
  }

  _loadSettings() {
    try {
      const saved = localStorage.getItem('missionforge.audio');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.masterVolume === 'number') this.masterVolume = parsed.masterVolume;
        if (typeof parsed.musicVolume === 'number') this.musicVolume = parsed.musicVolume;
        if (typeof parsed.sfxVolume === 'number') this.sfxVolume = parsed.sfxVolume;
        if (typeof parsed.muted === 'boolean') this.muted = parsed.muted;
      }
    } catch { }
  }

  saveSettings() {
    try {
      localStorage.setItem('missionforge.audio', JSON.stringify({
        masterVolume: this.masterVolume,
        musicVolume: this.musicVolume,
        sfxVolume: this.sfxVolume,
        muted: this.muted,
      }));
    } catch { }
  }

  _bindUnlock() {
    const unlock = () => {
      this.unlocked = true;
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
  }

  async init(manifestData = null) {
    try {
      if (!manifestData) {
        const res = await fetch('/api/audio-assets');
        if (res.ok) {
          manifestData = await res.json();
        }
      }
      if (manifestData) {
        this.manifest = manifestData;
        this.slots = manifestData.slots || {};
      }
    } catch (e) {
      // Missing or failed endpoint is handled gracefully
    }
  }

  getCategory(slotId) {
    if (slotId.startsWith('music_')) return 'music';
    if (slotId.startsWith('ambience_')) return 'ambience';
    if (slotId.startsWith('ui_')) return 'ui';
    return 'sfx';
  }

  getEffectiveVolume(category) {
    if (this.muted) return 0;
    const catVol = category === 'music' ? this.musicVolume : this.sfxVolume;
    return Math.max(0, Math.min(1, this.masterVolume * catVol));
  }

  _getOrCreateAudio(src) {
    if (!this.cache.has(src)) {
      const audio = new Audio(src);
      audio.preload = 'auto';
      this.cache.set(src, audio);
    }
    return this.cache.get(src);
  }

  play(slotId, { volume = 1.0, rate = 1.0, debounce = 50 } = {}) {
    if (this.muted) return null;
    const now = performance.now();
    const last = this.lastPlayed.get(slotId) || 0;
    if (now - last < debounce) return null;
    this.lastPlayed.set(slotId, now);

    const slot = this.slots[slotId];
    if (!slot || !slot.file) {
      this._synthesizeSound(slotId, volume);
      return null;
    }

    try {
      const category = this.getCategory(slotId);
      const effectiveVolume = this.getEffectiveVolume(category) * volume;
      if (effectiveVolume <= 0) return null;

      const audio = new Audio(slot.file);
      audio.volume = effectiveVolume;
      audio.playbackRate = rate;

      if (this.unlocked) {
        const playPromise = audio.play();
        if (playPromise) {
          playPromise.catch(() => {});
        }
      }
      return audio;
    } catch {
      this._synthesizeSound(slotId, volume);
      return null;
    }
  }

  playLoop(slotId, { volume = 1.0, rate = 1.0 } = {}) {
    if (this.activeLoops.has(slotId)) {
      return this.activeLoops.get(slotId);
    }
    const slot = this.slots[slotId];
    if (!slot || !slot.file) {
      this._startSynthLoop(slotId, volume);
      return null;
    }

    try {
      const category = this.getCategory(slotId);
      const effectiveVolume = this.getEffectiveVolume(category) * volume;

      const audio = new Audio(slot.file);
      audio.loop = true;
      audio.volume = effectiveVolume;
      audio.playbackRate = rate;

      this.activeLoops.set(slotId, { audio, baseVolume: volume, category });

      if (this.unlocked) {
        const playPromise = audio.play();
        if (playPromise) {
          playPromise.catch(() => {});
        }
      }
      return audio;
    } catch {
      this._startSynthLoop(slotId, volume);
      return null;
    }
  }

  stopLoop(slotId, fadeDuration = 0) {
    this._stopSynthLoop(slotId);
    const entry = this.activeLoops.get(slotId);
    if (!entry) return;

    const { audio } = entry;
    if (fadeDuration > 0 && audio.volume > 0) {
      const startVol = audio.volume;
      const startTime = performance.now();
      const fade = () => {
        const elapsed = (performance.now() - startTime) / 1000;
        const fraction = Math.max(0, 1 - elapsed / fadeDuration);
        audio.volume = startVol * fraction;
        if (fraction > 0) {
          requestAnimationFrame(fade);
        } else {
          audio.pause();
          audio.currentTime = 0;
          this.activeLoops.delete(slotId);
        }
      };
      requestAnimationFrame(fade);
    } else {
      audio.pause();
      audio.currentTime = 0;
      this.activeLoops.delete(slotId);
    }
  }

  stopAllLoops() {
    for (const slotId of Array.from(this.activeLoops.keys())) {
      this.stopLoop(slotId);
    }
    for (const slotId of Array.from(this.synthLoops.keys())) {
      this._stopSynthLoop(slotId);
    }
  }

  setEngineThrottle(throttle) {
    const t = Math.max(0, Math.min(1, Number(throttle) || 0));

    // Update synth loop if active
    const synth = this.synthLoops.get('engine_loop');
    if (synth && synth.gain && synth.filter) {
      const effVol = this.getEffectiveVolume(synth.category) * synth.baseVolume * (0.15 + 0.85 * t);
      synth.gain.gain.setValueAtTime(effVol * 0.75, this.synthContext.currentTime);
      synth.filter.frequency.setValueAtTime(140 + 480 * t, this.synthContext.currentTime);
    }

    const entry = this.activeLoops.get('engine_loop');
    if (!entry) return;
    const { audio, category } = entry;
    const targetVol = this.getEffectiveVolume(category) * (0.2 + 0.8 * t);
    audio.volume = targetVol;
    audio.playbackRate = 0.85 + 0.35 * t;
  }

  updateVolumes() {
    for (const [slotId, entry] of this.activeLoops.entries()) {
      const { audio, baseVolume, category } = entry;
      audio.volume = this.getEffectiveVolume(category) * baseVolume;
    }
  }

  setMasterVolume(val) {
    this.masterVolume = Math.max(0, Math.min(1, val));
    this.updateVolumes();
    this.saveSettings();
  }

  setMusicVolume(val) {
    this.musicVolume = Math.max(0, Math.min(1, val));
    this.updateVolumes();
    this.saveSettings();
  }

  setSfxVolume(val) {
    this.sfxVolume = Math.max(0, Math.min(1, val));
    this.updateVolumes();
    this.saveSettings();
  }

  setMuted(muted) {
    this.muted = !!muted;
    this.updateVolumes();
    this.saveSettings();
  }

  setupUIHooks() {
    document.addEventListener('mouseover', e => {
      const btn = e.target.closest('button, .mi, .mrow, a');
      if (btn && !btn.disabled) {
        this.play('ui_hover', { debounce: 80 });
      }
    }, { passive: true });

    document.addEventListener('click', e => {
      const btn = e.target.closest('button, .mi, .mrow, a');
      if (btn && !btn.disabled) {
        this.play('ui_click', { debounce: 60 });
      }
    }, { passive: true });
  }
}

export const audio = new AudioManager();

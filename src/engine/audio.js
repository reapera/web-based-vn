import audioData from "../data/audio.json";

// Audio manager supporting two source types per entry in data/audio.json:
//   { "type": "file", "src": "/audio/foo.mp3" }  — drop files in public/audio
//   { "type": "synth", ... }                     — built-in WebAudio synth, so
//                                                  the demo is audible with no assets
const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

class AudioManager {
  constructor() {
    this.ctx = null;
    this.musicGain = null;
    this.muted = false;
    this.currentMusic = null; // { name, stop() }
  }

  // Browsers block audio until a user gesture; call this from a click handler.
  unlock() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.musicGain) {
      this.musicGain.gain.value = muted ? 0 : 1;
    }
  }

  playMusic(name, { fade = 800 } = {}) {
    if (this.currentMusic?.name === name) return;
    this.stopMusic({ fade });
    if (!name) return;
    const def = audioData.music[name];
    if (!def) {
      console.warn(`Unknown music track: "${name}"`);
      return;
    }
    if (!this.ctx) return; // not unlocked yet; scene music is retried on unlock by the engine
    this.currentMusic =
      def.type === "file"
        ? this.#playFileMusic(name, def, fade)
        : this.#playSynthMusic(name, def, fade);
  }

  stopMusic({ fade = 800 } = {}) {
    this.currentMusic?.stop(fade);
    this.currentMusic = null;
  }

  #playFileMusic(name, def, fade) {
    const el = new Audio(def.src);
    el.loop = true;
    el.volume = 0;
    el.play().catch(() => {});
    const steps = 20;
    let i = 0;
    const target = def.volume ?? 0.5;
    const timer = setInterval(() => {
      el.volume = Math.min(target, (++i / steps) * target);
      if (i >= steps) clearInterval(timer);
    }, fade / steps);
    return {
      name,
      stop(fadeOut) {
        clearInterval(timer);
        const out = setInterval(() => {
          el.volume = Math.max(0, el.volume - 0.05);
          if (el.volume <= 0) {
            clearInterval(out);
            el.pause();
          }
        }, fadeOut / 20);
      },
    };
  }

  #playSynthMusic(name, def, fade) {
    const ctx = this.ctx;
    const trackGain = ctx.createGain();
    trackGain.gain.setValueAtTime(0, ctx.currentTime);
    trackGain.gain.linearRampToValueAtTime(def.volume ?? 0.15, ctx.currentTime + fade / 1000);
    trackGain.connect(this.musicGain);

    const beat = 60 / (def.tempo ?? 90);
    const loopLength = def.notes.reduce((sum, [, beats]) => sum + beats, 0) * beat;
    let nextLoopAt = ctx.currentTime + 0.05;
    let timer = null;

    const scheduleLoop = (startTime) => {
      let t = startTime;
      for (const [midi, beats] of def.notes) {
        const dur = beats * beat;
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();
        osc.type = def.wave ?? "triangle";
        osc.frequency.value = midiToFreq(midi);
        noteGain.gain.setValueAtTime(0, t);
        noteGain.gain.linearRampToValueAtTime(1, t + 0.02);
        noteGain.gain.setTargetAtTime(0, t + dur * 0.7, dur * 0.12);
        osc.connect(noteGain).connect(trackGain);
        osc.start(t);
        osc.stop(t + dur);
        t += dur;
      }
    };

    const tick = () => {
      // Schedule the next loop iteration just before the current one ends.
      if (ctx.currentTime > nextLoopAt - 0.3) {
        scheduleLoop(nextLoopAt);
        nextLoopAt += loopLength;
      }
    };
    scheduleLoop(nextLoopAt);
    nextLoopAt += loopLength;
    timer = setInterval(tick, 100);

    return {
      name,
      stop(fadeOut) {
        clearInterval(timer);
        trackGain.gain.cancelScheduledValues(ctx.currentTime);
        trackGain.gain.setValueAtTime(trackGain.gain.value, ctx.currentTime);
        trackGain.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeOut / 1000);
        setTimeout(() => trackGain.disconnect(), fadeOut + 100);
      },
    };
  }

  playSfx(name) {
    const def = audioData.sfx[name];
    if (!def) {
      console.warn(`Unknown sfx: "${name}"`);
      return;
    }
    if (def.type === "file") {
      const el = new Audio(def.src);
      el.volume = def.volume ?? 0.8;
      el.play().catch(() => {});
      return;
    }
    if (!this.ctx) return;
    this.#playSynthSfx(def.preset);
  }

  #playSynthSfx(preset) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = this.muted ? 0 : 1;
    out.connect(ctx.destination);
    const now = ctx.currentTime;

    const noiseBurst = (at, dur, freq, vol) => {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      src.connect(filter).connect(g).connect(out);
      src.start(at);
    };

    const tone = (at, dur, freq, vol, type = "sine") => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      osc.connect(g).connect(out);
      osc.start(at);
      osc.stop(at + dur);
    };

    switch (preset) {
      case "knock":
        noiseBurst(now, 0.08, 800, 0.6);
        noiseBurst(now + 0.18, 0.08, 700, 0.5);
        break;
      case "chime":
        tone(now, 0.5, 880, 0.25);
        tone(now + 0.12, 0.6, 1318, 0.2);
        break;
      case "whoosh": {
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.Q.value = 1.5;
        filter.frequency.setValueAtTime(300, now);
        filter.frequency.exponentialRampToValueAtTime(2400, now + 0.35);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.4, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        src.connect(filter).connect(g).connect(out);
        src.start(now);
        break;
      }
      case "thud":
        tone(now, 0.25, 90, 0.7, "sine");
        noiseBurst(now, 0.06, 200, 0.3);
        break;
      default:
        tone(now, 0.2, 600, 0.3);
    }
  }
}

export const audio = new AudioManager();

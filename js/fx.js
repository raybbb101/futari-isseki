// Particles, lasers, messages, screen shake and small chiptune sound effects.
(function () {
  const TAU = Math.PI * 2;
  const Sfx = {
    ac: null, on: true,
    unlock() { if (!this.ac) { try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ac = null; } } if (this.ac && this.ac.state === 'suspended') this.ac.resume(); },
    tone(f, d, type = 'square', v = 0.08, slide = 0, delay = 0) {
      const ac = this.ac; if (!ac || !this.on) return;
      const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0008, t + d);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
    },
    noise(d, v = 0.12, delay = 0) {
      const ac = this.ac; if (!ac || !this.on) return;
      const t = ac.currentTime + delay, n = Math.floor(ac.sampleRate * d), buf = ac.createBuffer(1, n, ac.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = ac.createBufferSource(), g = ac.createGain(), fl = ac.createBiquadFilter();
      fl.type = 'lowpass'; fl.frequency.value = 1400; s.buffer = buf; g.gain.value = v;
      s.connect(fl).connect(g).connect(ac.destination); s.start(t);
    },
    play(name) {
      switch (name) {
        case 'ok': this.tone(880, 0.06, 'square', 0.05); break;
        case 'miss': this.tone(140, 0.25, 'sawtooth', 0.07, -60); break;
        case 'fire': this.tone(1200, 0.18, 'square', 0.06, -900); break;
        case 'boom': this.noise(0.35, 0.16); this.tone(90, 0.3, 'triangle', 0.1, -50); break;
        case 'big': this.noise(0.9, 0.22); this.tone(70, 0.8, 'triangle', 0.14, -40); break;
        case 'hurt': this.noise(0.2, 0.18); this.tone(200, 0.2, 'square', 0.08, -120); break;
        case 'block': this.tone(600, 0.12, 'triangle', 0.08, 300); break;
        case 'power': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.09, 'square', 0.05, 0, i * 0.06)); break;
        case 'ping': this.tone(1320, 0.08, 'sine', 0.08); this.tone(1760, 0.12, 'sine', 0.07, 0, 0.09); break;
        case 'select': this.tone(660, 0.05, 'square', 0.04); break;
        case 'dodge': this.tone(300, 0.2, 'triangle', 0.06, 500); break;
        case 'special': this.tone(200, 0.5, 'sawtooth', 0.08, 1200); this.noise(0.5, 0.1, 0.1); break;
        case 'switch': this.tone(990, 0.04, 'square', 0.04); break;
      }
    },
  };

  const FX = {
    parts: [], lasers: [], msgs: [], pings: [], shake: 0, hurt: 0, block: 0, power: 0, special: 0, flashE: new Map(),
    reset() { this.parts = []; this.lasers = []; this.msgs = []; this.pings = []; this.shake = this.hurt = this.block = this.power = this.special = 0; this.flashE.clear(); },
    burst(x, y, n, cols, sp, life, z = 6, size = 1) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, s = sp * (0.3 + Math.random() * 0.7);
        this.parts.push({ x, y, z: z + Math.random() * 6, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: (Math.random() - 0.3) * sp * 0.6, life: life * (0.5 + Math.random() * 0.5), max: life, col: cols[(Math.random() * cols.length) | 0], size: size * (0.6 + Math.random() * 0.8) });
      }
    },
    explode(x, y, size) {
      const k = size === 3 ? 4 : size;
      this.burst(x, y, 26 * k, ['#fff3b0', '#ffc24a', '#ff7a2a', '#ff3a52'], 55 * k, 0.7 + 0.2 * k, 6, 1 + k * 0.3);
      this.burst(x, y, 12 * k, ['#5a5068', '#3a3448', '#7b7496'], 30 * k, 1.2, 6, 1.4);
      if (size >= 2) this.shake = Math.max(this.shake, 0.25 * k);
    },
    apply(ev, st) {
      const k = ev[0];
      if (k === 'kill') { this.explode(ev[2], ev[3], ev[4]); Sfx.play(ev[4] >= 3 ? 'big' : 'boom'); }
      else if (k === 'zap') { this.laser(st.ship.x, st.ship.y, ev[2], ev[3]); this.flashE.set(ev[1], 0.15); this.burst(ev[2], ev[3], 10, ['#bff6ff', '#7ff6ff', '#ffffff'], 60, 0.35); }
      else if (k === 'hurt') { this.shake = 0.4; this.hurt = 0.45; this.burst(ev[2], ev[3], 14, ['#ff9a3c', '#ff3a52', '#ffe68a'], 70, 0.4); Sfx.play('hurt'); }
      else if (k === 'block') { this.block = 0.3; Sfx.play('block'); }
      else if (k === 'msg') this.msgs.push({ text: ev[1], life: ev[2], max: ev[2] });
      else if (k === 'ping') { this.pings.push({ who: ev[1], x: ev[2], y: ev[3], life: 2.6 }); Sfx.play('ping'); }
      else if (k === 'power') { this.power = 0.6; Sfx.play('power'); }
      else if (k === 'special') { this.special = 0.6; Sfx.play('special'); }
    },
    laser(x1, y1, x2, y2) { this.lasers.push({ x1, y1, x2, y2, life: 0.2 }); Sfx.play('fire'); },
    step(dt) {
      for (const p of this.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 0.97; p.vy *= 0.97; p.vz -= 10 * dt; }
      this.parts = this.parts.filter(p => p.life > 0);
      if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
      for (const l of this.lasers) l.life -= dt; this.lasers = this.lasers.filter(l => l.life > 0);
      for (const m of this.msgs) m.life -= dt; this.msgs = this.msgs.filter(m => m.life > 0).slice(-2);
      for (const p of this.pings) p.life -= dt; this.pings = this.pings.filter(p => p.life > 0);
      for (const [id, v] of this.flashE) { if (v - dt <= 0) this.flashE.delete(id); else this.flashE.set(id, v - dt); }
      this.shake = Math.max(0, this.shake - dt); this.hurt = Math.max(0, this.hurt - dt); this.block = Math.max(0, this.block - dt);
      this.power = Math.max(0, this.power - dt); this.special = Math.max(0, this.special - dt);
    },
  };
  window.FX = FX; window.Sfx = Sfx;
})();

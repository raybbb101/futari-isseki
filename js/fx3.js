// Effects in 3D space (particles, beams, lightning, pulses, damage numbers), messages and chiptune sounds.
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
        case 'gun': this.tone(1500, 0.05, 'square', 0.025, -700); break;
        case 'beam': this.tone(400, 0.3, 'sawtooth', 0.06, 1400); break;
        case 'tick': this.tone(880, 0.05, 'square', 0.04); break;
        case 'skill': this.tone(600, 0.12, 'square', 0.06, 600); this.tone(1200, 0.1, 'square', 0.05, 0, 0.08); break;
        case 'fizzle': this.tone(160, 0.2, 'sawtooth', 0.06, -60); break;
        case 'boom': this.noise(0.35, 0.16); this.tone(90, 0.3, 'triangle', 0.1, -50); break;
        case 'big': this.noise(0.9, 0.22); this.tone(70, 0.8, 'triangle', 0.14, -40); break;
        case 'hurt': this.noise(0.2, 0.18); this.tone(200, 0.2, 'square', 0.08, -120); break;
        case 'block': this.tone(600, 0.12, 'triangle', 0.08, 300); break;
        case 'power': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.09, 'square', 0.05, 0, i * 0.06)); break;
        case 'select': this.tone(660, 0.05, 'square', 0.04); break;
        case 'dodge': this.tone(300, 0.2, 'triangle', 0.06, 500); break;
        case 'nova': this.tone(200, 0.6, 'sawtooth', 0.1, 1600); this.noise(0.7, 0.14, 0.1); break;
        case 'emp': this.tone(120, 0.5, 'sine', 0.12, 800); break;
        case 'scan': this.tone(1320, 0.08, 'sine', 0.06); this.tone(1760, 0.1, 'sine', 0.05, 0, 0.09); break;
        case 'book': [784, 988, 1318].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.07, 0, i * 0.08)); break;
        case 'alarm': this.tone(880, 0.12, 'square', 0.05); this.tone(660, 0.12, 'square', 0.05, 0, 0.14); break;
        case 'warn': this.tone(300, 0.08, 'square', 0.04); break;
      }
    },
  };

  const FX3 = {
    parts: [], lines: [], rings: [], pops: [], msgs: [], toasts: [], flashE: new Map(), shake: 0, hurt: 0, block: 0, flash: 0, flashCol: '255,255,255',
    reset() { this.parts = []; this.lines = []; this.rings = []; this.pops = []; this.msgs = []; this.toasts = []; this.flashE.clear(); this.shake = this.hurt = this.block = this.flash = 0; },
    burst(p, n, cols, sp, life, size = 1) {
      for (let i = 0; i < n; i++) {
        const z = Math.random() * 2 - 1, a = Math.random() * TAU, q = Math.sqrt(1 - z * z), s = sp * (0.3 + Math.random() * 0.7);
        this.parts.push({ p: [...p], v: [Math.cos(a) * q * s, Math.sin(a) * q * s, z * s], life: life * (0.5 + Math.random() * 0.5), max: life, col: cols[(Math.random() * cols.length) | 0], size: size * (0.6 + Math.random() * 0.8) });
      }
      if (this.parts.length > 1200) this.parts.splice(0, this.parts.length - 1200);
    },
    toast(text, col = '#7ff6ff', d = 2.5) { this.toasts.push({ text, col, life: d, max: d }); if (this.toasts.length > 3) this.toasts.shift(); },
    apply(ev, st, role) {
      const k = ev[0], sp = st.ship.p;
      switch (k) {
        case 'k': { const p = [ev[2], ev[3], ev[4]], r = ev[5], big = r > 40;
          this.burst(p, 20 + Math.min(80, r), ['#fff3b0', '#ffc24a', '#ff7a2a', '#ff3a52'], 40 + r * 2.2, 0.9, 1 + r / 12);
          this.burst(p, 10 + Math.min(40, r / 2), ['#5a5068', '#3a3448', '#7b7496'], 25 + r, 1.4, 1.4 + r / 14);
          Sfx.play(big ? 'big' : 'boom'); if (big) this.shake = Math.max(this.shake, 0.4); break; }
        case 'h': this.flashE.set(ev[1], 0.15); { const e = st.ents.get(ev[1]); if (e) this.pops.push({ p: [...e.p], text: String(ev[2]), col: ev[3] > 0 ? '#ffe14a' : ev[3] < 0 ? '#8b90b3' : '#ffffff', big: ev[3] > 0, life: 0.9, dz: e.r }); } break;
        case 'ping': this.burst([ev[1], ev[2], ev[3]], 4, ['#ffffff', '#8b90b3'], 60, 0.25, 0.8); break;
        case 'bm': this.lines.push({ a: null, b: [ev[1], ev[2], ev[3]], col: '127,246,255', w: 2 + ev[4] / 18, life: 0.22, max: 0.22 }); this.burst([ev[1], ev[2], ev[3]], 12, ['#bff6ff', '#7ff6ff'], 120, 0.4); break;
        case 'ln': this.lines.push({ a: null, b: [ev[1], ev[2], ev[3]], col: '255,240,170', w: 9, life: 0.35, max: 0.35 }); this.flash = 0.25; this.flashCol = '255,240,170'; break;
        case 'ch': { let prev = null; for (let i = 1; i + 2 < ev.length; i += 3) { const b = [ev[i], ev[i + 1], ev[i + 2]]; this.lines.push({ a: prev, b, col: '200,170,255', w: 3, life: 0.4, max: 0.4, zig: true }); prev = b; } if (ev.length < 4) this.toast('連鎖雷：ねらいの先に敵がいない', '#8b90b3'); break; }
        case 'emp': this.rings.push({ p: [...sp], r0: 20, r1: 520, life: 0.5, max: 0.5, col: '255,240,120' }); Sfx.play('emp'); break;
        case 'fz': this.burst([ev[1], ev[2], ev[3]], 30, ['#ffffff', '#bff6ff', '#7fc8ff'], 160, 0.7, 1.2); this.rings.push({ p: [ev[1], ev[2], ev[3]], r0: 10, r1: 160, life: 0.4, max: 0.4, col: '170,230,255' }); break;
        case 'nova': this.rings.push({ p: [...sp], r0: 50, r1: 1700, life: 0.9, max: 0.9, col: '255,200,255' }); this.flash = 0.6; this.flashCol = '255,220,255'; this.shake = 0.5; Sfx.play('nova'); break;
        case 'sk': if (role === 'pilot') this.toast(`ガンナー：${W3.SKILLS[ev[1]].jp}！`, '#ffe68a', 1.6); break;
        case 'hurt': this.shake = 0.45; this.hurt = 0.45; Sfx.play('hurt'); break;
        case 'blk': this.block = 0.3; Sfx.play('block'); break;
        case 'rep': this.toast('ステーションで修理中…', '#7dff8a', 1.2); break;
        case 'msg': this.msgs.push({ text: ev[1], life: ev[2], max: ev[2] }); break;
        case 'arm': Sfx.play('warn'); break;
        case 'aim': { const e = st.ents.get(ev[1]); if (e) this.pops.push({ p: [...e.p], text: '！', col: '#ff4a62', big: true, life: 1, dz: e.r }); break; }
        case 'cloud': this.burst([ev[1], ev[2], ev[3]], 40, ['#c8f070', '#8fd050', '#fff27a'], ev[4] * 0.8, 1.2, 1.6); break;
        case 'mode': this.toast(ev[1] ? '戦闘モード！' : '戦闘終了', ev[1] ? '#ff4a62' : '#7dff8a', 2); if (ev[1]) Sfx.play('alarm'); break;
      }
    },
    step(dt) {
      for (const p of this.parts) { p.life -= dt; p.p = W3.add(p.p, W3.mul(p.v, dt)); p.v = W3.mul(p.v, Math.exp(-1.2 * dt)); }
      this.parts = this.parts.filter(p => p.life > 0);
      for (const a of [this.lines, this.rings, this.pops, this.msgs, this.toasts]) for (const x of a) x.life -= dt;
      this.lines = this.lines.filter(x => x.life > 0); this.rings = this.rings.filter(x => x.life > 0); this.pops = this.pops.filter(x => x.life > 0);
      this.msgs = this.msgs.filter(x => x.life > 0).slice(-2); this.toasts = this.toasts.filter(x => x.life > 0);
      for (const [id, v] of this.flashE) { if (v - dt <= 0) this.flashE.delete(id); else this.flashE.set(id, v - dt); }
      this.shake = Math.max(0, this.shake - dt); this.hurt = Math.max(0, this.hurt - dt); this.block = Math.max(0, this.block - dt); this.flash = Math.max(0, this.flash - dt);
    },
    // world-space effects; origin = where the gunner's shots start on screen
    drawWorld(ctx, proj, opt) {
      for (const p of this.parts) { const s = proj(p.p); if (!s) continue; ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5); ctx.fillStyle = p.col; const z = Math.max(1, Math.min(18, s.k * p.size * 2.5)); ctx.fillRect(Math.round(s.x - z / 2), Math.round(s.y - z / 2), Math.round(z), Math.round(z)); }
      ctx.globalAlpha = 1;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (const l of this.lines) {
        const b = proj(l.b); if (!b) continue;
        const a = l.a ? proj(l.a) : opt.origin; if (!a) continue;
        const al = l.life / l.max;
        ctx.strokeStyle = `rgba(${l.col},${al})`; ctx.lineWidth = l.w * (opt.lineScale || 1);
        ctx.beginPath(); ctx.moveTo(a.x, a.y);
        if (l.zig) { const n = 6; for (let i = 1; i < n; i++) { const t = i / n; ctx.lineTo(a.x + (b.x - a.x) * t + (Math.random() - 0.5) * 14, a.y + (b.y - a.y) * t + (Math.random() - 0.5) * 14); } }
        ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${al})`; ctx.lineWidth = Math.max(1, l.w * 0.3 * (opt.lineScale || 1)); ctx.stroke();
      }
      for (const r of this.rings) {
        const c = proj(r.p); if (!c) continue; const t = 1 - r.life / r.max, rad = (r.r0 + (r.r1 - r.r0) * t) * c.k;
        ctx.strokeStyle = `rgba(${r.col},${r.life / r.max})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(c.x, c.y, Math.min(rad, 5000), 0, TAU); ctx.stroke();
      }
      ctx.restore();
      for (const p of this.pops) {
        const s = proj([p.p[0], p.p[1], p.p[2] + p.dz * 1.2]); if (!s) continue;
        const fs = p.big ? 22 : 16, y = s.y - (0.9 - p.life) * 40;
        ctx.globalAlpha = Math.min(1, p.life * 2); ctx.font = `${fs}px "DotGothic16", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#070812'; ctx.fillText(p.text, s.x + 2, y + 2); ctx.fillStyle = p.col; ctx.fillText(p.text, s.x, y);
      }
      ctx.globalAlpha = 1;
    },
    overlays(ctx, W, H) {
      if (this.hurt > 0) { ctx.fillStyle = `rgba(255,40,70,${this.hurt * 0.45})`; ctx.fillRect(0, 0, W, H); }
      if (this.flash > 0) { ctx.fillStyle = `rgba(${this.flashCol},${this.flash * 0.6})`; ctx.fillRect(0, 0, W, H); }
    },
  };
  window.FX3 = FX3; window.Sfx = Sfx;
})();

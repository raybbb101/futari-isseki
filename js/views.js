// The two screens. Pilot: the whole battlefield from above (landscape, X5 Lite).
// Gunner: the view out of the turret window (portrait, Pocket Taco, top part of the phone only).
(function () {
  const { C, F, JP, TYPES, wrap, clamp, effCombo, inArc } = Sim;
  const TAU = Math.PI * 2, D2R = Math.PI / 180;
  const FONT = '"DotGothic16", "Hiragino Kaku Gothic ProN", monospace';
  const KEYCOL = { A: '#5ad15a', B: '#ff5a5a', X: '#4aa3ff', Y: '#ffd23f' };
  const PAL = { ink: '#e6e9f7', dim: '#8b90b3', accent: '#ffb547', cyan: '#7ff6ff', red: '#ff4a62', hp: '#7dff8a', bg: '#070812' };

  // far planets (parallax layer) and decor along the course
  const FAR = [
    { id: 'gas', x: 200, y: -60, s: 1, a: 0.4 }, { id: 'moon', x: 520, y: 70, s: 0.6, a: 1 }, { id: 'earth', x: 860, y: -40, s: 0.8, a: 2 },
    { id: 'lava', x: 1180, y: 60, s: 0.7, a: 0 }, { id: 'violet', x: 1500, y: -70, s: 0.8, a: 1 }, { id: 'ice', x: 1820, y: 40, s: 0.7, a: 3 },
    { id: 'desert', x: 2120, y: -50, s: 0.7, a: 2 }, { id: 'planet', x: 2450, y: 50, s: 0.8, a: 0.5 },
  ];
  const DECOR = [{ id: 'station', x: -60, y: -96, a: 0.4 }, { id: 'satellite', x: 1250, y: 104, a: 1 }, { id: 'satellite', x: 2600, y: -104, a: 2.5 }, { id: 'satellite', x: 3500, y: 100, a: 4 }];

  function frameOf(id, t, seed) { const s = Stack.size(id); return s && s.F > 1 ? Math.floor(t * s.fps + seed * 3.7) % s.F : 0; }
  function bobOf(id, t, seed) { const s = Stack.size(id); return s && s.bob ? Math.sin(t * 1.7 + seed) * s.bob * 2 : 0; }
  function stars(n, seed) { const r = Sim.rngOf(seed), out = []; for (let i = 0; i < n; i++) out.push({ x: r(), y: r(), z: 0.15 + r() * 0.85, b: r() }); return out; }
  const STARS = stars(260, 7), SKY = stars(320, 11);

  // ---------- shared HUD bits ----------
  function text(ctx, s, x, y, size, col = PAL.ink, align = 'left', base = 'top') {
    ctx.font = `${Math.round(size)}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = base;
    ctx.fillStyle = 'rgba(7,8,18,0.85)'; ctx.fillText(s, x + Math.max(1, size / 12), y + Math.max(1, size / 12));
    ctx.fillStyle = col; ctx.fillText(s, x, y);
  }
  function bar(ctx, x, y, w, h, v, col, mark) {
    ctx.fillStyle = 'rgba(7,8,18,0.7)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#262a44'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = col; ctx.fillRect(x, y, Math.round(w * clamp(v, 0, 1)), h);
    if (mark) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(x + Math.round(w * mark), y - 2, 2, h + 4); }
  }
  function hpSegs(ctx, x, y, w, h, hp, max) {
    const g = Math.max(2, Math.round(w / max / 6)), sw = (w - g * (max - 1)) / max;
    ctx.fillStyle = 'rgba(7,8,18,0.7)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    for (let i = 0; i < max; i++) { ctx.fillStyle = i < hp ? (hp <= 3 ? PAL.red : PAL.hp) : '#262a44'; ctx.fillRect(Math.round(x + i * (sw + g)), y, Math.ceil(sw), h); }
  }
  // a controller key: arrows as triangles, face buttons as coloured circles
  function key(ctx, k, x, y, s, state, t) {
    const done = state === 'done', cur = state === 'cur';
    ctx.save(); ctx.translate(x, y);
    if (cur) { const p = 1 + Math.sin(t * 10) * 0.06; ctx.scale(p, p); }
    ctx.globalAlpha = done ? 0.35 : 1;
    const r = s / 2;
    ctx.fillStyle = 'rgba(7,8,18,0.85)'; ctx.fillRect(-r - 2, -r - 2, s + 4, s + 4);
    ctx.strokeStyle = cur ? PAL.accent : '#3a3f62'; ctx.lineWidth = Math.max(2, s / 14); ctx.strokeRect(-r, -r, s, s);
    if (KEYCOL[k]) {
      ctx.fillStyle = KEYCOL[k]; ctx.beginPath(); ctx.arc(0, 0, r * 0.68, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0b0d18'; ctx.font = `${Math.round(s * 0.5)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(k, 0, s * 0.03);
    } else {
      const a = { UP: -Math.PI / 2, DOWN: Math.PI / 2, LEFT: Math.PI, RIGHT: 0 }[k];
      ctx.rotate(a); ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.moveTo(r * 0.62, 0); ctx.lineTo(-r * 0.42, -r * 0.55); ctx.lineTo(-r * 0.42, r * 0.55); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function glowDot(ctx, x, y, r, col) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r * 2.6, y - r * 2.6, r * 5.2, r * 5.2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x - r / 2), Math.round(y - r / 2), Math.max(1, Math.round(r)), Math.max(1, Math.round(r)));
    ctx.restore();
  }
  function bossInfo(st) {
    let parts = 0, core = null, any = false;
    for (const e of st.ents.values()) { if (e.type === 'bpart') { parts += e.hp; any = true; } if (e.type === 'bcore') { core = e; any = true; } if (e.type === 'boss') any = true; }
    if (!any) return null;
    return core ? { v: core.hp / core.maxHp, label: '艦橋' } : { v: parts / 8, label: '砲台' };
  }
  function message(ctx, W, y, fs) {
    const m = FX.msgs[FX.msgs.length - 1]; if (!m) return;
    const a = Math.min(1, m.life * 3, (m.max - m.life) * 6);
    ctx.globalAlpha = a;
    ctx.font = `${Math.round(fs)}px ${FONT}`; const w = ctx.measureText(m.text).width;
    ctx.fillStyle = 'rgba(7,8,18,0.72)'; ctx.fillRect(W / 2 - w / 2 - fs, y - fs * 0.4, w + fs * 2, fs * 1.8);
    ctx.fillStyle = PAL.accent; ctx.fillRect(W / 2 - w / 2 - fs, y - fs * 0.4, 3, fs * 1.8);
    text(ctx, m.text, W / 2, y, fs, PAL.ink, 'center');
    ctx.globalAlpha = 1;
  }

  // ---------- pilot view ----------
  const ELEV = 55, SQ = Math.sin(ELEV * D2R), LF = Math.cos(ELEV * D2R);
  const PilotView = {
    draw(ctx, W, H, st, G, t) {
      const sh = st.ship;
      const art = Math.max(1, Math.round(Math.min(W / 430, H / (2 * C.BAND * SQ + 80)) / 2)), unit = art * 2;
      let ox = 0, oy = 0; if (FX.shake > 0) { ox = (Math.random() - 0.5) * FX.shake * 14 * art; oy = (Math.random() - 0.5) * FX.shake * 14 * art; }
      const cx = W / 2 - ((C.LEFT + C.RIGHT) / 2) * unit + ox, cy = H / 2 + 10 * art + oy;
      const P = (x, y) => [cx + (x - st.cam.x) * unit, cy + y * SQ * unit];
      // background
      ctx.fillStyle = PAL.bg; ctx.fillRect(0, 0, W, H);
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(60,30,110,0.25)'); g.addColorStop(1, 'rgba(20,60,110,0.18)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (const s of STARS) {
        const sx = ((s.x * W * 1.2 - st.cam.x * unit * s.z * 0.25) % (W * 1.2) + W * 1.2) % (W * 1.2) - W * 0.1;
        ctx.fillStyle = s.b > 0.93 ? '#ffd9a0' : s.b > 0.82 ? '#a8e8ff' : `rgba(220,225,255,${0.3 + s.z * 0.6})`;
        const sz = s.z > 0.8 ? art : Math.max(1, art / 2); ctx.fillRect(Math.round(sx), Math.round(s.y * H), sz, sz);
      }
      for (const p of FAR) {
        const span = 2700, px = ((p.x - st.cam.x * 0.08) % span + span) % span - 400;
        Stack.draw(ctx, p.id, 0, p.a + t * 0.02, ELEV, W / 2 + px * art, H / 2 + p.y * art, art * p.s * 0.75, { alpha: 0.42, noGlow: true });
      }
      ctx.fillStyle = 'rgba(7,8,18,0.25)'; ctx.fillRect(0, 0, W, H);
      // turret arc
      if (st.phase !== 'over') {
        ctx.beginPath(); const [sx0, sy0] = P(sh.x, sh.y); ctx.moveTo(sx0, sy0);
        for (let a = -C.ARC; a <= C.ARC + 0.01; a += C.ARC / 12) { const [x, y] = P(sh.x + Math.cos(sh.ang + a) * C.RANGE, sh.y + Math.sin(sh.ang + a) * C.RANGE); ctx.lineTo(x, y); }
        ctx.closePath(); ctx.fillStyle = 'rgba(127,246,255,0.045)'; ctx.fill(); ctx.strokeStyle = 'rgba(127,246,255,0.16)'; ctx.lineWidth = art; ctx.stroke();
      }
      // world objects sorted by depth
      const list = [];
      for (const d of DECOR) if (Math.abs(d.x - st.cam.x) < 420) list.push({ y: d.y, draw: () => { const [x, y] = P(d.x, d.y); Stack.draw(ctx, d.id, frameOf(d.id, t, 1), d.a + t * 0.05, ELEV, x, y, art, { alpha: 0.9 }); } });
      for (const e of st.ents.values()) {
        const T = TYPES[e.type]; if (!T || !T.m || isNaN(e.x)) continue;
        list.push({ y: e.y, draw: () => { const [x, y] = P(e.x, e.y); Stack.draw(ctx, T.m, frameOf(T.m, t, e.id), e.ang, ELEV, x, y - bobOf(T.m, t, e.id) * art, art, { flash: FX.flashE.has(e.id) ? 0.8 : 0 }); } });
      }
      const blink = FX.hurt > 0 && Math.floor(t * 20) % 2;
      list.push({ y: sh.y, draw: () => {
        const [x, y] = P(sh.x, sh.y), spin = sh.flags & F.DODGE ? (t * 14) % TAU : 0;
        Stack.draw(ctx, 'ship', frameOf('ship', t, 0), sh.ang + spin, ELEV, x, y, art, { alpha: blink ? 0.45 : 1 });
        if (sh.flags & F.SHIELD || FX.block > 0) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(127,246,255,${0.5 + FX.block})`; ctx.lineWidth = art * 1.5;
          ctx.fillStyle = 'rgba(80,180,255,0.12)'; ctx.beginPath(); ctx.ellipse(x, y - 6 * art, 25 * unit / 2, 25 * unit / 2 * SQ + 6 * art, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
        }
      } });
      list.sort((a, b) => a.y - b.y); for (const o of list) o.draw();
      // boss weak points
      for (const e of st.ents.values()) if ((e.type === 'bpart' || e.type === 'bcore') && !isNaN(e.x)) {
        const [x, y] = P(e.x, e.y), s = (4 + Math.sin(t * 6)) * art;
        ctx.strokeStyle = e.type === 'bcore' ? PAL.red : PAL.accent; ctx.lineWidth = art; ctx.beginPath(); ctx.moveTo(x, y - 12 * art - s); ctx.lineTo(x + s, y - 12 * art); ctx.lineTo(x, y - 12 * art + s); ctx.lineTo(x - s, y - 12 * art); ctx.closePath(); ctx.stroke();
      }
      // bullets, particles, lasers
      for (const b of st.bullets.values()) { const [x, y] = P(b.x, b.y); glowDot(ctx, x, y - 6 * art, 2.2 * art, b.kind ? 'rgba(255,90,220,0.9)' : 'rgba(255,150,60,0.9)'); }
      for (const p of FX.parts) { const [x, y] = P(p.x, p.y); ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5); ctx.fillStyle = p.col; const s = Math.max(1, Math.round(p.size * art)); ctx.fillRect(Math.round(x), Math.round(y - p.z * LF * unit), s, s); }
      ctx.globalAlpha = 1;
      for (const l of FX.lasers) {
        const [x1, y1] = P(l.x1, l.y1), [x2, y2] = P(l.x2, l.y2);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = l.life / 0.2;
        ctx.strokeStyle = '#7ff6ff'; ctx.lineWidth = 3 * art; ctx.beginPath(); ctx.moveTo(x1, y1 - 10 * art); ctx.lineTo(x2, y2 - 8 * art); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = art; ctx.stroke(); ctx.restore();
      }
      // the gunner's lock-on (the pilot sees which enemy, and how far the combo got, but not the buttons)
      const tg = st.ents.get(st.turret.tg);
      if (tg && !isNaN(tg.x) && tg.combos) {
        const [x, y] = P(tg.x, tg.y), r = (tg.r + 6) * unit / 2 + 4 * art, yy = y - 8 * art;
        ctx.strokeStyle = PAL.cyan; ctx.lineWidth = art;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.beginPath(); ctx.moveTo(x + sx * r, yy + sy * r * 0.6); ctx.lineTo(x + sx * r, yy + sy * (r * 0.6 - 5 * art)); ctx.moveTo(x + sx * r, yy + sy * r * 0.6); ctx.lineTo(x + sx * (r - 5 * art), yy + sy * r * 0.6); ctx.stroke(); }
        const n = effCombo(tg, st.power).length;
        for (let i = 0; i < n; i++) { ctx.fillStyle = i < st.turret.prog ? PAL.cyan : 'rgba(127,246,255,0.25)'; ctx.fillRect(Math.round(x - (n * 5 * art) / 2 + i * 5 * art), Math.round(yy + r * 0.6 + 4 * art), 3 * art, 3 * art); }
      }
      for (const p of FX.pings) {
        const [x, y] = P(p.x, p.y), a = Math.min(1, p.life);
        ctx.globalAlpha = a; ctx.strokeStyle = p.who === 'gunner' ? PAL.accent : PAL.cyan; ctx.lineWidth = art;
        ctx.beginPath(); ctx.arc(x, y, (10 + (2.6 - p.life) * 30) * art, 0, TAU); ctx.stroke();
        text(ctx, p.who === 'gunner' ? 'ガンナー：ここ！' : 'ここ！', x, y - 30 * art, 9 * art, ctx.strokeStyle, 'center'); ctx.globalAlpha = 1;
      }
      // HUD
      const fs = Math.max(12, Math.round(H * 0.032)), m = Math.round(fs * 0.8);
      text(ctx, '船体', m, m, fs * 0.8, PAL.dim); hpSegs(ctx, m + fs * 2.6, m + 2, W * 0.22, fs * 0.6, st.hp, C.MAXHP);
      text(ctx, 'エネルギー', m, m + fs * 1.3, fs * 0.8, PAL.dim); bar(ctx, m + fs * 4.6, m + fs * 1.3 + 2, W * 0.22 - fs * 2, fs * 0.6, st.en / 100, PAL.cyan, 0.6);
      if (st.power > 0) text(ctx, `パワーアップ ${Math.ceil(st.power)}`, m, m + fs * 2.6, fs * 0.8, '#fff27a');
      const bi = bossInfo(st);
      if (bi) { text(ctx, `戦艦ドレッド・${bi.label}`, W - m, m, fs * 0.8, PAL.red, 'right'); bar(ctx, W - m - W * 0.25, m + fs * 1.2, W * 0.25, fs * 0.5, bi.v, PAL.red); }
      else if (st.phase === 'play') { text(ctx, '戦艦まで', W - m - W * 0.2 - fs * 0.6, m - 2, fs * 0.8, PAL.dim, 'right'); bar(ctx, W - m - W * 0.2, m + 2, W * 0.2, fs * 0.45, st.T / 97, PAL.accent); }
      else if (st.phase === 'gate') text(ctx, 'ワープゲートへ！', W - m, m, fs, PAL.cyan, 'right');
      message(ctx, W, H * 0.16, fs * 1.1);
      text(ctx, 'パイロット　スティック：移動　A：回避　B：シールド　RT：加速　X：合図', m, H - m - fs * 0.8, fs * 0.7, PAL.dim);
      if (G.partnerText) text(ctx, G.partnerText, W - m, H - m - fs * 0.8, fs * 0.7, G.partnerOk ? PAL.dim : PAL.red, 'right');
      overlays(ctx, W, H);
    },
  };

  function overlays(ctx, W, H) {
    if (FX.hurt > 0) { ctx.fillStyle = `rgba(255,40,70,${FX.hurt * 0.45})`; ctx.fillRect(0, 0, W, H); }
    if (FX.special > 0) { ctx.fillStyle = `rgba(160,240,255,${FX.special * 0.5})`; ctx.fillRect(0, 0, W, H); }
    if (FX.power > 0) { ctx.fillStyle = `rgba(255,240,120,${FX.power * 0.3})`; ctx.fillRect(0, 0, W, H); }
  }

  // ---------- gunner view ----------
  const GE = 14; // sprite camera angle inside the turret view
  const SKYP = [{ id: 'gas', th: 0.9, el: 0.2, s: 1.6 }, { id: 'earth', th: -1.6, el: 0.16, s: 1.1 }, { id: 'violet', th: 2.7, el: 0.24, s: 1.2 }, { id: 'moon', th: -0.35, el: 0.33, s: 0.7 }, { id: 'lava', th: 1.9, el: 0.08, s: 0.9 }, { id: 'ice', th: -2.6, el: 0.28, s: 1 }];
  const GunnerView = {
    dust: [], roll: 0, dodgeT: 0, lastDodge: false,
    draw(ctx, W, H, st, G, t, dt, vis) {
      const VH = Math.round(H * vis), sh = st.ship, yaw = st.turret.ang;
      const focal = Math.min(W, VH * 1.4) * 0.85, hz = VH * 0.42, camH = 24, cy = Math.cos(yaw), sy = Math.sin(yaw);
      const dodging = !!(sh.flags & F.DODGE);
      if (dodging && !this.lastDodge) this.dodgeT = 0; this.lastDodge = dodging;
      this.dodgeT += dt;
      let roll = clamp(-(sh.vy || 0) / 500, -0.16, 0.16);
      if (dodging || this.dodgeT < 0.45) roll += Math.min(1, this.dodgeT / 0.45) * TAU;
      this.roll += (roll - this.roll) * (dodging ? 1 : Math.min(1, dt * 6));
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, VH); ctx.clip();
      let ox = 0, oy = 0; if (FX.shake > 0) { ox = (Math.random() - 0.5) * FX.shake * W * 0.04; oy = (Math.random() - 0.5) * FX.shake * W * 0.04; }
      ctx.save(); ctx.translate(W / 2 + ox, hz + oy); ctx.rotate(this.roll); ctx.translate(-W / 2, -hz);
      const R = Math.hypot(W, VH);
      const g = ctx.createLinearGradient(0, hz - VH, 0, hz + VH); g.addColorStop(0, '#0a0818'); g.addColorStop(0.5, '#1a1240'); g.addColorStop(0.53, '#101834'); g.addColorStop(1, '#05060d');
      ctx.fillStyle = g; ctx.fillRect(W / 2 - R, hz - R, R * 2, R * 2);
      // far stars turn with the turret
      for (const s of SKY) {
        const th = s.x * TAU, el = (s.y - 0.45) * 1.6, d = wrap(th - yaw);
        if (Math.abs(d) > 1.3) continue;
        const x = W / 2 + d * focal, y = hz - el * focal;
        ctx.fillStyle = s.b > 0.92 ? '#ffd9a0' : `rgba(220,225,255,${0.25 + s.z * 0.65})`; const sz = s.z > 0.85 ? 2 : 1; ctx.fillRect(Math.round(x), Math.round(y), sz, sz);
      }
      for (const p of SKYP) {
        const d = wrap(p.th - yaw); if (Math.abs(d) > 1.4) continue;
        Stack.draw(ctx, p.id, 0, t * 0.02 + p.th, 20, W / 2 + d * focal, hz - p.el * focal, Math.max(1, focal / 260 * p.s), { alpha: 0.9, noGlow: true });
      }
      // dust streaming past the ship
      const proj = (x, y, h) => { const dx = x - sh.x, dy = y - sh.y, f = dx * cy + dy * sy; if (f < 4) return null; const l = -dx * sy + dy * cy, k = focal / f; return { x: W / 2 + l * k, y: hz + (camH - h) * k, k, f }; };
      while (this.dust.length < 80) this.dust.push({ x: 0, y: 0, h: 0, dead: true });
      ctx.lineCap = 'round';
      for (const d of this.dust) {
        let p = d.dead ? null : proj(d.x, d.y, d.h);
        if (!p || p.f > 460 || Math.abs(p.x - W / 2) > W * 1.2) {
          const f = 40 + Math.random() * 420, l = (Math.random() - 0.5) * f * 2.2;
          d.x = sh.x + cy * f - sy * l; d.y = sh.y + sy * f + cy * l; d.h = (Math.random() - 0.35) * 90; d.dead = false; d.px = null; continue;
        }
        if (d.px != null) {
          const a = clamp(80 / p.f, 0.1, 0.9); ctx.strokeStyle = `rgba(190,210,255,${a})`; ctx.lineWidth = clamp(p.k * 0.5, 1, 3);
          ctx.beginPath(); ctx.moveTo(d.px, d.py); ctx.lineTo(p.x, p.y); ctx.stroke();
        }
        d.px = p.x; d.py = p.y;
      }
      // objects
      const list = [];
      for (const e of st.ents.values()) {
        const T = TYPES[e.type]; if (!T || isNaN(e.x)) continue;
        const p = proj(e.x, e.y, 0); if (!p || p.f < 10 || Math.abs(p.x - W / 2) > W) continue;
        list.push({ f: p.f, draw: () => {
          if (T.m) {
            const sc = Math.min(8, p.k / 2);
            Stack.draw(ctx, T.m, frameOf(T.m, t, e.id), e.ang - yaw - Math.PI / 2, GE, p.x, p.y - bobOf(T.m, t, e.id) * sc, sc, { flash: FX.flashE.has(e.id) ? 0.8 : 0 });
          } else {
            const q = proj(e.x, e.y, 12); if (!q) return;
            ctx.strokeStyle = e.type === 'bcore' ? PAL.red : PAL.accent; ctx.lineWidth = 2; const s = clamp(q.k * 4, 4, 30) * (1 + Math.sin(t * 6) * 0.15);
            ctx.beginPath(); ctx.moveTo(q.x, q.y - s); ctx.lineTo(q.x + s, q.y); ctx.lineTo(q.x, q.y + s); ctx.lineTo(q.x - s, q.y); ctx.closePath(); ctx.stroke();
          }
        } });
      }
      for (const b of st.bullets.values()) { const p = proj(b.x, b.y, 6); if (p && Math.abs(p.x - W / 2) < W) list.push({ f: p.f, draw: () => glowDot(ctx, p.x, p.y, clamp(p.k * 1.6, 1.5, 14), b.kind ? 'rgba(255,90,220,0.9)' : 'rgba(255,150,60,0.9)') }); }
      list.sort((a, b) => b.f - a.f); for (const o of list) o.draw();
      for (const pa of FX.parts) { const p = proj(pa.x, pa.y, pa.z); if (!p) continue; ctx.globalAlpha = Math.min(1, pa.life / pa.max * 1.5); ctx.fillStyle = pa.col; const s = clamp(p.k * pa.size, 1, 16); ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), Math.round(s), Math.round(s)); }
      ctx.globalAlpha = 1;
      for (const l of FX.lasers) {
        const p = proj(l.x2, l.y2, 8); if (!p) continue;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = l.life / 0.2;
        for (const s of [-1, 1]) { ctx.strokeStyle = '#7ff6ff'; ctx.lineWidth = W * 0.02; ctx.beginPath(); ctx.moveTo(W / 2 + s * W * 0.18, VH * 1.05); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = W * 0.006; ctx.stroke(); }
        ctx.restore();
      }
      ctx.restore(); // roll
      // target lock and combo
      const fs = Math.max(12, Math.round(Math.min(W, VH * 1.3) * 0.042));
      const tg = st.ents.get(st.turret.tg), ctl = G.gunnerCtl;
      if (tg && !isNaN(tg.x) && tg.combos) {
        const p = proj(tg.x, tg.y, 8);
        if (p) {
          const r = clamp(tg.r * p.k * 1.1, 18, W * 0.3);
          ctx.strokeStyle = ctl.flashMiss > 0 ? PAL.red : PAL.cyan; ctx.lineWidth = 3;
          for (const [sx, sy2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.beginPath(); ctx.moveTo(p.x + sx * r, p.y + sy2 * r - sy2 * r * 0.35); ctx.lineTo(p.x + sx * r, p.y + sy2 * r); ctx.lineTo(p.x + sx * r - sx * r * 0.35, p.y + sy2 * r); ctx.stroke(); }
        }
        const combo = effCombo(tg, st.power), ks = Math.min(W / (combo.length + 2), fs * 3.2), y = VH - ks * 1.25;
        ctx.fillStyle = 'rgba(7,8,18,0.6)'; ctx.fillRect(0, y - ks * 1.25, W, ks * 2.2);
        text(ctx, `${JP[tg.type] || ''}　あと${tg.hp}回`, W / 2, y - ks * 1.15, fs * 0.9, PAL.dim, 'center');
        combo.forEach((k, i) => key(ctx, k, W / 2 + (i - (combo.length - 1) / 2) * ks * 1.12, y + ks * 0.15, ks * 0.92, i < st.turret.prog ? 'done' : i === st.turret.prog ? 'cur' : 'todo', t));
        if (ctl.jam > 0) { ctx.fillStyle = `rgba(255,60,80,${ctl.jam * 0.6})`; ctx.fillRect(0, y - ks * 1.25, W, ks * 2.2); text(ctx, 'ジャム！', W / 2, y - ks * 0.3, fs * 1.6, '#fff', 'center'); }
      } else if (st.phase !== 'over' && st.phase !== 'clear') {
        const y = VH - fs * 3;
        ctx.fillStyle = 'rgba(7,8,18,0.6)'; ctx.fillRect(0, y - fs * 0.6, W, fs * 2.4);
        text(ctx, 'ねらえる敵がいない', W / 2, y, fs, PAL.dim, 'center');
      }
      // enemies outside the arc: arrows telling which way the pilot should turn
      let left = 0, right = 0;
      for (const e of st.ents.values()) {
        if (!e.combos || isNaN(e.x) || e.x > st.cam.x + C.RIGHT + 40 || e.x < st.cam.x + C.LEFT) continue;
        if (inArc(sh, e, st.cam.x)) continue;
        const a = wrap(Math.atan2(e.y - sh.y, e.x - sh.x) - sh.ang); if (a < 0) left++; else right++;
      }
      if (left) text(ctx, `◀ ${left}`, fs * 0.6, hz, fs * 1.2, PAL.accent, 'left', 'middle');
      if (right) text(ctx, `${right} ▶`, W - fs * 0.6, hz, fs * 1.2, PAL.accent, 'right', 'middle');
      // cockpit frame + crosshair
      const vg = ctx.createRadialGradient(W / 2, hz, Math.min(W, VH) * 0.35, W / 2, hz, Math.max(W, VH) * 0.8);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, VH);
      ctx.strokeStyle = 'rgba(127,246,255,0.35)'; ctx.lineWidth = 2; const c = fs * 0.8;
      ctx.beginPath(); ctx.moveTo(W / 2 - c * 2, hz); ctx.lineTo(W / 2 - c * 0.6, hz); ctx.moveTo(W / 2 + c * 0.6, hz); ctx.lineTo(W / 2 + c * 2, hz); ctx.moveTo(W / 2, hz - c * 2); ctx.lineTo(W / 2, hz - c * 0.6); ctx.stroke();
      if (sh.flags & F.SHIELD || FX.block > 0) { ctx.strokeStyle = `rgba(127,246,255,${0.35 + FX.block})`; ctx.lineWidth = fs * 0.5; ctx.strokeRect(0, 0, W, VH); }
      // HUD
      const m = fs * 0.7;
      text(ctx, '船体', m, m, fs * 0.8, PAL.dim); hpSegs(ctx, m + fs * 2.4, m + 2, W * 0.36, fs * 0.55, st.hp, C.MAXHP);
      text(ctx, 'エネルギー', m, m + fs * 1.2, fs * 0.8, PAL.dim); bar(ctx, m + fs * 4.4, m + fs * 1.2 + 2, W * 0.36 - fs * 2, fs * 0.55, st.en / 100, PAL.cyan, 0.6);
      text(ctx, st.en >= 60 ? 'R2 チャージ砲 OK' : 'R2 チャージ砲', W - m, m, fs * 0.8, st.en >= 60 ? PAL.cyan : '#3a3f62', 'right');
      if (st.power > 0) text(ctx, `パワーアップ ${Math.ceil(st.power)}`, W - m, m + fs * 1.2, fs * 0.8, '#fff27a', 'right');
      const bi = bossInfo(st); if (bi) { text(ctx, `戦艦・${bi.label}`, m, m + fs * 2.4, fs * 0.75, PAL.red); bar(ctx, m + fs * 4.6, m + fs * 2.4 + 3, W * 0.36 - fs * 2.2, fs * 0.45, bi.v, PAL.red); }
      message(ctx, W, VH * 0.2, fs);
      for (const p of FX.pings) if (p.who === 'pilot') { const a = Math.min(1, p.life); ctx.globalAlpha = a; text(ctx, 'パイロットからの合図！', W / 2, VH * 0.3, fs * 1.1, PAL.cyan, 'center'); ctx.globalAlpha = 1; }
      if (G.partnerText) text(ctx, G.partnerText, m, VH - m - fs * 0.6 - (tg ? 0 : fs * 3.2), fs * 0.6, G.partnerOk ? PAL.dim : PAL.red);
      overlays(ctx, W, VH);
      ctx.restore();
    },
  };

  window.Views = { PilotView, GunnerView, key, text, PAL, FONT };
})();

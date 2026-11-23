// The two screens. Pilot (X5 Lite, landscape): behind-the-ship or cockpit view, radar, planets, scan.
// Gunner (Pocket Taco, portrait, top part only): view from the turrets, centre crosshair, skills.
(function () {
  const { sub, add, mul, len, dot, norm, basis, fwdOf, wrapA, clamp, PLANETS, DEFS, SKILLS, ULT, STATION, F, MAXHP, TAU, nearestPlanet, scanDur } = W3;
  const FONT = '"DotGothic16", "Hiragino Kaku Gothic ProN", monospace';
  const C = { ink: '#e6e9f7', dim: '#8b90b3', accent: '#ffb547', cyan: '#7ff6ff', red: '#ff4a62', hp: '#7dff8a', yel: '#ffe14a' };
  const KEYCOL = { A: '#5ad15a', B: '#ff5a5a', X: '#4aa3ff', Y: '#ffd23f' };

  function text(ctx, s, x, y, size, col = C.ink, align = 'left', base = 'top') {
    ctx.font = `${Math.round(size)}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = base;
    ctx.fillStyle = 'rgba(5,6,13,0.85)'; ctx.fillText(s, x + Math.max(1, size / 12), y + Math.max(1, size / 12));
    ctx.fillStyle = col; ctx.fillText(s, x, y);
  }
  function bar(ctx, x, y, w, h, v, col, bg = '#262a44') {
    ctx.fillStyle = 'rgba(5,6,13,0.7)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = bg; ctx.fillRect(x, y, w, h); ctx.fillStyle = col; ctx.fillRect(x, y, Math.round(w * clamp(v, 0, 1)), h);
  }
  function segs(ctx, x, y, w, h, v, max) {
    const g = Math.max(1, Math.round(w / max / 7)), sw = (w - g * (max - 1)) / max;
    ctx.fillStyle = 'rgba(5,6,13,0.7)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    for (let i = 0; i < max; i++) { ctx.fillStyle = i < v ? (v <= 5 ? C.red : C.hp) : '#262a44'; ctx.fillRect(Math.round(x + i * (sw + g)), y, Math.ceil(sw), h); }
  }
  function key(ctx, k, x, y, s, state, t) {
    ctx.save(); ctx.translate(x, y);
    if (state === 'cur') { const p = 1 + Math.sin(t * 10) * 0.06; ctx.scale(p, p); }
    ctx.globalAlpha = state === 'dim' ? 0.35 : 1;
    const r = s / 2;
    ctx.fillStyle = 'rgba(5,6,13,0.85)'; ctx.fillRect(-r - 1, -r - 1, s + 2, s + 2);
    ctx.strokeStyle = state === 'cur' ? C.accent : '#3a3f62'; ctx.lineWidth = Math.max(1.5, s / 14); ctx.strokeRect(-r, -r, s, s);
    if (KEYCOL[k]) { ctx.fillStyle = KEYCOL[k]; ctx.beginPath(); ctx.arc(0, 0, r * 0.68, 0, TAU); ctx.fill(); ctx.fillStyle = '#0b0d18'; ctx.font = `${Math.round(s * 0.5)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(k, 0, s * 0.03); }
    else { const a = { UP: -Math.PI / 2, DOWN: Math.PI / 2, LEFT: Math.PI, RIGHT: 0 }[k]; ctx.rotate(a); ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(r * 0.62, 0); ctx.lineTo(-r * 0.42, -r * 0.55); ctx.lineTo(-r * 0.42, r * 0.55); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  function messages(ctx, W, y, fs) {
    const m = FX3.msgs[FX3.msgs.length - 1];
    if (m) {
      ctx.globalAlpha = Math.min(1, m.life * 3, (m.max - m.life) * 6);
      ctx.font = `${Math.round(fs)}px ${FONT}`; const w = Math.min(W - 20, ctx.measureText(m.text).width);
      ctx.fillStyle = 'rgba(5,6,13,0.75)'; ctx.fillRect(W / 2 - w / 2 - fs, y - fs * 0.4, w + fs * 2, fs * 1.8);
      ctx.fillStyle = C.accent; ctx.fillRect(W / 2 - w / 2 - fs, y - fs * 0.4, 3, fs * 1.8);
      text(ctx, m.text, W / 2, y, fs, C.ink, 'center'); ctx.globalAlpha = 1;
    }
    FX3.toasts.forEach((t, i) => { ctx.globalAlpha = Math.min(1, t.life * 3); text(ctx, t.text, W / 2, y + fs * (2.2 + i * 1.3), fs * 0.85, t.col, 'center'); });
    ctx.globalAlpha = 1;
  }
  // arrow at the screen edge pointing to a world position
  function edgeMark(ctx, W, H, p, col, label, fs, inset) {
    const B = R3.cam.B, d = sub(p, R3.cam.p);
    let x = dot(d, B.r), y = -dot(d, B.u); const z = dot(d, B.f);
    if (z > 0) { const s = R3.proj(p); if (s && s.x > inset && s.x < W - inset && s.y > inset && s.y < H - inset) return false; }
    const a = Math.atan2(y, x), cx = W / 2, cy = H / 2, rx = W / 2 - inset, ry = H / 2 - inset;
    const k = Math.min(Math.abs(rx / Math.cos(a)), Math.abs(ry / Math.sin(a))), px = cx + Math.cos(a) * k, py = cy + Math.sin(a) * k;
    ctx.save(); ctx.translate(px, py); ctx.rotate(a); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(fs * 0.8, 0); ctx.lineTo(-fs * 0.4, -fs * 0.5); ctx.lineTo(-fs * 0.4, fs * 0.5); ctx.closePath(); ctx.fill(); ctx.restore();
    if (label) text(ctx, label, px - Math.cos(a) * fs * 1.4, py - Math.sin(a) * fs * 1.4, fs * 0.7, col, 'center', 'middle');
    return true;
  }
  const km = d => (d / 100).toFixed(d < 1000 ? 1 : 0) + 'km';
  function scanTarget(st) { const np = nearestPlanet(st.ship.p); return np && np.d < np.pl.R * 2.9 && np.d > np.pl.R * 1.0 ? np : null; }

  // ---------- pilot ----------
  const camS = { yaw: 0, pitch: 0, init: false };
  function pilot(ctx, W, H, st, G, t, dt) {
    const sh = st.ship, cockpit = G.view === 1;
    if (!camS.init) { camS.yaw = sh.yaw; camS.pitch = sh.pitch; camS.init = true; }
    camS.yaw += wrapA(sh.yaw - camS.yaw) * Math.min(1, dt * 7); camS.pitch += (sh.pitch - camS.pitch) * Math.min(1, dt * 7);
    let ox = 0, oy = 0; if (FX3.shake > 0) { ox = (Math.random() - 0.5) * FX3.shake * 26; oy = (Math.random() - 0.5) * FX3.shake * 26; }
    const focal = W * 0.62;
    if (cockpit) { const B = basis(sh.yaw, sh.pitch); R3.setCam(add(add(sh.p, mul(B.f, 14)), mul(B.u, 4)), sh.yaw, sh.pitch, sh.roll, W, H, focal, H / 2 + oy); }
    else { const B = basis(camS.yaw, camS.pitch); R3.setCam(add(add(sh.p, mul(B.f, -100)), mul(B.u, 30)), camS.yaw, camS.pitch - 0.1, 0, W, H, focal, H / 2 + oy); }
    R3.cam.cx += ox;
    R3.drawSky(ctx, t);
    R3.drawDust(ctx, sh.v, 1);
    const fs = Math.max(12, Math.round(H * 0.032));
    const hostile = [];
    const shipScr = R3.proj(sh.p);
    R3.drawScene(ctx, st, t, { ship: !cockpit, origin: shipScr || { x: W / 2, y: H }, onEnt: (e, pr) => { if (e.st === 'attack' && e.d.cat === 'hostile') hostile.push([e, pr]); } });
    // scan beam
    if (st.scan) { const pl = PLANETS[st.scan.pi], pp = R3.proj(pl.p), a = shipScr || { x: W / 2, y: H * 0.8 }; if (pp) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 3; i++) { const o = Math.sin(t * 3 + i * 2) * pl.R * pp.k * 0.8; ctx.strokeStyle = `rgba(127,246,255,${0.25 + 0.15 * i})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(pp.x + o, pp.y + o * 0.3); ctx.stroke(); } ctx.restore(); } }
    // brackets on attackers
    for (const [e, pr] of hostile) { const r = Math.max(10, e.r * pr.k * 1.3); ctx.strokeStyle = C.red; ctx.lineWidth = 2; for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.beginPath(); ctx.moveTo(pr.x + sx * r, pr.y + sy * r * 0.6); ctx.lineTo(pr.x + sx * r, pr.y + sy * r); ctx.lineTo(pr.x + sx * r * 0.6, pr.y + sy * r); ctx.stroke(); } }
    // planet labels
    PLANETS.forEach((pl, i) => {
      const pp = R3.proj(pl.p); if (!pp) return; const rad = pl.R * pp.k; if (rad > W * 0.45) return;
      const known = Book.has('p', i);
      text(ctx, `${known ? pl.name : '未知の惑星'}　${km(len(sub(pl.p, sh.p)) - pl.R)}${known ? ' ✓' : ''}`, pp.x, pp.y + rad + 6, fs * 0.7, known ? C.dim : C.cyan, 'center');
    });
    // where the gunner is aiming
    const gd = fwdOf(sh.yaw + st.gun.gy, sh.pitch + st.gun.gp), gp = R3.proj(add(sh.p, mul(gd, 700)));
    if (gp && (Math.abs(st.gun.gy) > 0.05 || Math.abs(st.gun.gp) > 0.05)) { ctx.strokeStyle = 'rgba(255,225,74,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(gp.x, gp.y, fs * 0.6, 0, TAU); ctx.moveTo(gp.x - fs, gp.y); ctx.lineTo(gp.x + fs, gp.y); ctx.moveTo(gp.x, gp.y - fs); ctx.lineTo(gp.x, gp.y + fs); ctx.stroke(); }
    // nose reticle
    const nose = R3.proj(add(sh.p, mul(fwdOf(sh.yaw, sh.pitch), 900)));
    if (nose) { ctx.strokeStyle = 'rgba(127,246,255,0.7)'; ctx.lineWidth = 2; const r = fs * 0.9; ctx.beginPath(); ctx.moveTo(nose.x - r * 1.6, nose.y); ctx.lineTo(nose.x - r * 0.6, nose.y); ctx.moveTo(nose.x + r * 0.6, nose.y); ctx.lineTo(nose.x + r * 1.6, nose.y); ctx.moveTo(nose.x, nose.y + r * 0.6); ctx.lineTo(nose.x, nose.y + r * 1.4); ctx.stroke(); }
    if (cockpit) cockpitFrame(ctx, W, H, t);
    // edge markers: attackers, home, nearest unscanned planet
    const inset = fs * 2;
    for (const e of st.ents.values()) if (!e.dead && e.st === 'attack' && e.d.cat === 'hostile' && len(sub(e.p, sh.p)) < 2600 && !(st.rep && st.T - e.seen > 1)) edgeMark(ctx, W, H, e.p, C.red, '', fs * 0.8, inset);
    edgeMark(ctx, W, H, STATION, C.hp, 'ホーム', fs, inset);
    let near = null; PLANETS.forEach((pl, i) => { if (Book.has('p', i)) return; const d = len(sub(pl.p, sh.p)); if (!near || d < near.d) near = { pl, d }; });
    if (near) edgeMark(ctx, W, H, near.pl.p, C.cyan, '未知の惑星', fs, inset);
    // HUD
    const m = Math.round(fs * 0.8);
    text(ctx, '船体', m, m, fs * 0.8, C.dim); segs(ctx, m + fs * 2.6, m + 2, W * 0.24, fs * 0.6, Math.ceil(st.hp), MAXHP);
    text(ctx, 'エネルギー', m, m + fs * 1.3, fs * 0.8, C.dim); bar(ctx, m + fs * 4.6, m + fs * 1.3 + 2, W * 0.24 - fs * 2, fs * 0.6, st.en / 100, C.cyan);
    text(ctx, `速度 ${Math.round(len(sh.v))}`, m, m + fs * 2.6, fs * 0.75, C.dim);
    if (st.pow > 0) text(ctx, `攻撃力アップ ${Math.ceil(st.pow)}`, m, m + fs * 3.7, fs * 0.75, C.yel);
    const chip = st.scan ? `スキャン中 ${Math.min(100, Math.floor(st.scan.t / st.scan.dur * 100))}%` : st.mode === 'combat' ? '戦闘モード' : '探索中';
    const chipCol = st.scan ? C.cyan : st.mode === 'combat' ? C.red : C.hp;
    text(ctx, chip, W / 2, m, fs, chipCol, 'center');
    text(ctx, `図鑑　惑星 ${Book.count('p')}/${PLANETS.length}　生きもの ${Book.count('e')}/${W3.BOOK_ORDER.length}`, W - m, m, fs * 0.7, C.dim, 'right');
    // scan prompt / progress
    if (st.scan) { const pl = PLANETS[st.scan.pi]; bar(ctx, W / 2 - W * 0.18, m + fs * 1.4, W * 0.36, fs * 0.5, st.scan.t / st.scan.dur, C.cyan); text(ctx, `${Book.has('p', st.scan.pi) ? pl.name : '未知の惑星'}　X：中止`, W / 2, m + fs * 2.1, fs * 0.75, C.dim, 'center'); }
    else { const np = scanTarget(st); if (np) text(ctx, `X：${Book.has('p', np.i) ? np.pl.name + ' をもう一度' : 'この惑星を'}スキャン（約${scanDur(np.pl)}秒）`, W / 2, H * 0.72, fs, C.cyan, 'center'); }
    const g = G.pilotCtl.gmax || 0;
    if (g > 180 && !st.scan) { if (Math.floor(t * 4) % 2) text(ctx, g > 260 ? '強い引力！ RT（全力加速）で脱出！' : '引力圏に入った', W / 2, H * 0.62, fs * 1.1, g > 260 ? C.red : C.accent, 'center'); }
    radar(ctx, W - fs * 5.5, H - fs * 5.5, fs * 4.5, st, fs);
    messages(ctx, W, H * 0.16, fs * 1.05);
    text(ctx, `左スティック：移動　右スティック：向き　RB/LB：上下　RT：全力加速　LT：ブレーキ　A：回避　B：シールド　Y：視点　SELECT：図鑑`, m, H - m - fs * 0.75, fs * 0.6, C.dim);
    if (G.partnerText) text(ctx, G.partnerText, m, H - m - fs * 1.7, fs * 0.6, G.partnerOk ? C.dim : C.red);
    FX3.overlays(ctx, W, H);
  }
  function cockpitFrame(ctx, W, H) {
    ctx.fillStyle = 'rgba(16,18,31,0.92)';
    ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, H * 0.82); ctx.lineTo(W * 0.22, H * 0.78); ctx.lineTo(W * 0.35, H * 0.86); ctx.lineTo(W * 0.65, H * 0.86); ctx.lineTo(W * 0.78, H * 0.78); ctx.lineTo(W, H * 0.82); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    ctx.fillRect(0, 0, W * 0.025, H); ctx.fillRect(W * 0.975, 0, W * 0.025, H);
    ctx.strokeStyle = '#3a3f62'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, H * 0.82); ctx.lineTo(W * 0.22, H * 0.78); ctx.lineTo(W * 0.35, H * 0.86); ctx.lineTo(W * 0.65, H * 0.86); ctx.lineTo(W * 0.78, H * 0.78); ctx.lineTo(W, H * 0.82); ctx.stroke();
  }
  function radar(ctx, cx, cy, R, st, fs) {
    const sh = st.ship, range = 2600, c = Math.cos(-sh.yaw), s = Math.sin(-sh.yaw);
    ctx.fillStyle = 'rgba(5,6,13,0.65)'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(127,246,255,0.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
    const P = p => { const d = sub(p, sh.p), x = d[0] * c - d[1] * s, y = d[0] * s + d[1] * c, k = R / range; return [cx - y * k, cy - x * k, d[2]]; };
    for (const pl of PLANETS) { const d = len(sub(pl.p, sh.p)); if (d - pl.R > range * 1.5) continue; const [x, y] = P(pl.p); const r = Math.max(3, pl.R * R / range); ctx.strokeStyle = 'rgba(127,200,255,0.6)'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); }
    for (const e of st.ents.values()) {
      if (e.dead || e.d.cat === 'object' || (st.rep && !e.still && st.T - e.seen > 1)) continue;
      const d = sub(e.p, sh.p); if (Math.abs(d[0]) > range || Math.abs(d[1]) > range || Math.abs(d[2]) > range) continue;
      const [x, y, z] = P(e.p); if (Math.hypot(x - cx, y - cy) > R) continue;
      ctx.fillStyle = e.d.cat === 'hostile' ? (e.st === 'attack' ? C.red : '#b04050') : e.d.cat === 'friendly' ? C.hp : C.yel;
      const sz = z > 150 ? 5 : z < -150 ? 3 : 4; ctx.fillRect(Math.round(x - sz / 2), Math.round(y - sz / 2), sz, sz);
    }
    ctx.fillStyle = C.cyan; ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 4, cy + 4); ctx.lineTo(cx - 4, cy + 4); ctx.closePath(); ctx.fill();
  }

  // ---------- gunner ----------
  function gunner(ctx, W, H, st, G, t, dt, vis) {
    const VH = Math.round(H * vis), sh = st.ship, ctl = G.gunnerCtl;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, VH); ctx.clip();
    let ox = 0, oy = 0; if (FX3.shake > 0) { ox = (Math.random() - 0.5) * FX3.shake * 30; oy = (Math.random() - 0.5) * FX3.shake * 30; }
    const focal = Math.max(W, VH) * 0.78;
    const B = basis(sh.yaw, sh.pitch);
    R3.setCam(add(sh.p, mul(B.u, 7)), sh.yaw + st.gun.gy, W3.clamp(sh.pitch + st.gun.gp, -1.5, 1.5), 0, W, VH, focal, VH / 2 + oy);
    R3.cam.cx += ox;
    R3.drawSky(ctx, t);
    R3.drawDust(ctx, sh.v, 1.4);
    const fs = Math.max(12, Math.round(Math.min(W, VH * 1.2) * 0.042));
    const hostile = [];
    R3.drawScene(ctx, st, t, { ship: false, origin: { x: W / 2, y: VH * 1.05 }, lineScale: 1.6, onEnt: (e, pr) => { if (e.st === 'attack' && e.d.cat === 'hostile') hostile.push([e, pr]); } });
    for (const [e, pr] of hostile) { const r = Math.max(8, e.r * pr.k * 1.3); ctx.strokeStyle = 'rgba(255,74,98,0.8)'; ctx.lineWidth = 2; ctx.strokeRect(pr.x - r, pr.y - r, r * 2, r * 2); }
    const cx = W / 2, cy = VH / 2, cr = Math.round(Math.min(W, VH) * 0.06);
    // edge arrows for attackers out of view
    for (const e of st.ents.values()) if (!e.dead && e.st === 'attack' && e.d.cat === 'hostile' && len(sub(e.p, sh.p)) < 2600 && !(st.rep && st.T - e.seen > 1)) edgeMark(ctx, W, VH, e.p, C.red, '', fs * 0.9, fs * 1.8);
    // crosshair
    const tg = ctl.target, miss = ctl.missT > 0;
    ctx.strokeStyle = miss ? C.red : tg ? C.yel : C.cyan; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.stroke();
    ctx.beginPath(); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(cx + a * cr * 0.55, cy + b * cr * 0.55); ctx.lineTo(cx + a * cr * 1.45, cy + b * cr * 1.45); } ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    if (ctl.charge > 0) { ctx.strokeStyle = C.cyan; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, cr * 1.25, -Math.PI / 2, -Math.PI / 2 + TAU * ctl.charge / 1.2); ctx.stroke(); }
    if (ctl.scanT > 0) { ctx.strokeStyle = C.hp; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, cr * 1.5, -Math.PI / 2, -Math.PI / 2 + TAU * ctl.scanT / 1.2); ctx.stroke(); text(ctx, 'スキャン中…', cx, cy + cr * 1.7, fs * 0.8, C.hp, 'center'); }
    if (tg && !tg.dead) {
      const known = Book.has('e', tg.type), d = tg.d;
      text(ctx, known ? d.jp : '？？？（Y長押しでスキャン）', cx, cy - cr * 2.6, fs * 0.85, known ? (d.cat === 'hostile' ? C.red : d.cat === 'friendly' ? C.hp : C.yel) : C.dim, 'center');
      if (tg.maxHp > 0) bar(ctx, cx - cr * 1.6, cy - cr * 1.75, cr * 3.2, fs * 0.3, tg.hp / tg.maxHp, C.red);
      if (known && d.weak && d.weak.length) text(ctx, '弱点：' + d.weak.map(k => (SKILLS[k] ? SKILLS[k].jp : W3.KIND_JP[k])).join('・'), cx, cy + cr * 1.6 + (ctl.scanT > 0 ? fs : 0), fs * 0.7, C.yel, 'center');
    }
    // top HUD
    const m = Math.round(fs * 0.6);
    text(ctx, '船体', m, m, fs * 0.75, C.dim); segs(ctx, m + fs * 2.3, m + 2, W * 0.38, fs * 0.5, Math.ceil(st.hp), MAXHP);
    text(ctx, 'エネルギー', m, m + fs * 1.1, fs * 0.75, C.dim); bar(ctx, m + fs * 4.2, m + fs * 1.1 + 2, W * 0.38 - fs * 1.9, fs * 0.5, st.en / 100, C.cyan);
    text(ctx, 'ノヴァ', m, m + fs * 2.2, fs * 0.75, C.dim); bar(ctx, m + fs * 3, m + fs * 2.2 + 2, W * 0.38 - fs * 0.7, fs * 0.5, st.ult / 100, st.ult >= 100 ? (Math.floor(t * 6) % 2 ? '#ff8ad8' : '#ffe14a') : '#c69bff');
    const chip = st.mode === 'combat' ? '戦闘モード' : st.scan ? 'スキャン中：船は動けない' : '探索中';
    text(ctx, chip, m, m + fs * 3.3, fs * 0.75, st.mode === 'combat' ? C.red : st.scan ? C.cyan : C.hp);
    text(ctx, G.tiltOn ? 'スマホをかたむけて向きを変える（船が曲がっても向きは変わらない）' : 'L1/R1：左右　L2/R2：上下　L1+R1：船の前へ', m + fs * (st.mode === 'combat' ? 5 : st.scan ? 11.5 : 3.2), m + fs * 3.35, fs * 0.6, C.dim);
    if (st.scan && st.mode === 'combat') text(ctx, 'スキャン中で船は動けない！ 守って！', m, m + fs * 4.4, fs * 0.72, C.cyan);
    if (st.pow > 0) text(ctx, `攻撃力アップ ${Math.ceil(st.pow)}`, W - m, m, fs * 0.72, C.yel, 'right');
    // how far the gunner has turned from the ship's nose
    if (Math.abs(st.gun.gy) > 0.05 || Math.abs(st.gun.gp) > 0.05) text(ctx, `船首から ${st.gun.gy > 0 ? '左' : '右'}${Math.abs(Math.round(W3.wrapA(st.gun.gy) * 57.3))}°　${st.gun.gp > 0 ? '上' : '下'}${Math.abs(Math.round(st.gun.gp * 57.3))}°`, W - m, m + fs * 1.1, fs * 0.7, C.dim, 'right');
    messages(ctx, W, VH * 0.22, fs);
    // bottom: what you are typing; the full skill list only in training (otherwise it lives in the guidebook)
    let py;
    if (G.training) {
      const colW = (W - m * 2) / 2, ks = Math.min(colW / 6.2, fs * 1.15), cellH = fs * 0.75 + ks * 1.1;
      const rowsList = Object.entries(SKILLS).map(([k, s]) => [s.jp, s.combo, 'X', ctl.cds[k] || 0, k]).concat([[ULT.jp, ULT.combo, 'Y', st.ult >= 100 ? 0 : 1, 'ult']]);
      const panelH = Math.ceil(rowsList.length / 2) * cellH + ks * 1.5; py = VH - panelH;
      ctx.fillStyle = 'rgba(5,6,13,0.62)'; ctx.fillRect(0, py, W, panelH);
      if (ctl.buf.length) ctl.buf.forEach((k, i) => key(ctx, k, m + ks * 0.5 + i * ks * 1.05, py + ks * 0.65, ks * 0.9, 'on', t));
      else text(ctx, 'トレーニング：十字→X スキル　A 機関砲　B ためてビーム　Y長押し スキャン', W / 2, py + ks * 0.25, fs * 0.58, C.dim, 'center');
      rowsList.forEach(([name, combo, fin, cd, k], i) => {
        const x0 = m + (i % 2) * colW, y0 = py + ks * 1.4 + Math.floor(i / 2) * cellH;
        const ready = cd <= 0, w = tg && tg.d && tg.d.weak && tg.d.weak.includes(k) && Book.has('e', tg.type);
        ctx.globalAlpha = ready ? 1 : 0.38;
        text(ctx, name + (!ready && k !== 'ult' ? ` ${Math.ceil(cd)}` : ''), x0, y0, fs * 0.62, w ? C.yel : k === 'ult' ? '#ff8ad8' : C.ink);
        combo.concat([fin]).forEach((kk, j) => key(ctx, kk, x0 + ks * 0.45 + j * ks * 0.95, y0 + fs * 0.75 + ks * 0.45, ks * 0.8, 'on', t));
        ctx.globalAlpha = 1;
      });
    } else {
      const ks = Math.min(W / 9, fs * 1.6), h = ks * 1.5; py = VH - h;
      if (ctl.buf.length) { ctx.fillStyle = 'rgba(5,6,13,0.55)'; ctx.fillRect(0, py, W, h); ctl.buf.forEach((k, i) => key(ctx, k, W / 2 + (i - (ctl.buf.length - 1) / 2) * ks * 1.1, py + h / 2, ks * 0.9, 'on', t)); }
      else text(ctx, 'スキルのコンボは 図鑑（SELECT）で', W / 2, VH - fs * 1.2, fs * 0.6, C.dim, 'center');
      // cooldowns as small dots so you know when skills are back
      const cds = Object.keys(SKILLS).filter(k => ctl.cds[k] > 0);
      if (cds.length) text(ctx, cds.map(k => `${SKILLS[k].jp} ${Math.ceil(ctl.cds[k])}`).join('　'), W / 2, py - fs * 1.0, fs * 0.58, C.dim, 'center');
    }
    if (G.partnerText) text(ctx, G.partnerText, m, py - fs * 1.1, fs * 0.6, G.partnerOk ? C.dim : C.red);
    FX3.overlays(ctx, W, VH);
    ctx.restore();
  }

  window.HUD = { pilot, gunner, text, key, camS, scanTarget };
})();

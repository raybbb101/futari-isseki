// Sprite-stack renderer for the game: lit (v2) models, cached per model/frame/angle/camera angle.
(function () {
  const SS2 = window.SS2, TAU = Math.PI * 2;
  const OUT = [7, 6, 13];
  const nrm3 = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
  const SUN = nrm3(-0.62, 0.28, 0.73), FILL = nrm3(0.75, -0.55, 0.25);
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const BY_ID = {};
  for (const m of SS2.MODELS) BY_ID[m.id] = m;

  function ensureArt(m) {
    if (m.art) return;
    const S = Math.ceil(m.diag) + 4, H = S + m.d + 6;
    m.S = S; m.H = H;
    const mk = () => { const c = document.createElement('canvas'); c.width = S; c.height = H; return c; };
    m.art = mk(); m.actx = m.art.getContext('2d', { willReadFrequently: true });
    m.nrm = mk(); m.nctx = m.nrm.getContext('2d', { willReadFrequently: true });
    m.gart = mk(); m.gctx = m.gart.getContext('2d');
  }

  // renders into m.art (lit colours + outline) and m.gart (emissive only); returns crop box
  function render(m, fi, ang, elev) {
    ensureArt(m);
    const fr = m.frames[fi], sq = Math.sin(elev), lf = Math.cos(elev);
    const cx = m.S / 2, cy = m.H - m.S / 2 - 2;
    const draw = (ctx, list, part) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, m.S, m.H); ctx.imageSmoothingEnabled = false;
      for (let z = 0; z < fr.d; z++) {
        const s = list[z]; if (!s) continue;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.translate(cx, cy - Math.round(z * lf)); ctx.scale(1, sq); ctx.rotate(ang);
        ctx.drawImage(s.c, part * s.bw, 0, s.bw, s.bh, -fr.w / 2 + s.ox, -fr.h / 2 + s.oy, s.bw, s.bh);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };
    draw(m.actx, fr.slices, 0);
    draw(m.nctx, fr.slices, 1);
    const box = shade(m, ang, elev);
    if (fr.hasGlow) draw(m.gctx, fr.glows, 0);
    return { cx, cy, box, glow: fr.hasGlow };
  }

  function shade(m, ang, elev) {
    const w = m.S, h = m.H, A = m.actx.getImageData(0, 0, w, h), N = m.nctx.getImageData(0, 0, w, h), a = A.data, n = N.data;
    const c = Math.cos(ang), s = Math.sin(ang), HV = nrm3(SUN[0], SUN[1] + Math.cos(elev), SUN[2] + Math.sin(elev));
    const { LUT, SPEC, EMC, STEPS, IMAX } = SS2, mask = new Uint8Array(w * h), dith = IMAX / STEPS * 0.9;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x, i = p * 4; if (!a[i + 3]) continue;
      const id = a[i], em = EMC[id];
      if (a[i + 3] < 250 || (!em && !LUT[id])) { a[i + 3] = 0; continue; }
      mask[p] = 1;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (em) { a[i] = em[0]; a[i + 1] = em[1]; a[i + 2] = em[2]; continue; }
      const nx = n[i] / 127.5 - 1, ny = n[i + 1] / 127.5 - 1, nz = n[i + 2] / 127.5 - 1;
      const wx = nx * c - ny * s, wy = nx * s + ny * c;
      const ao = a[i + 1] / 200, v = a[i + 2] / 170;
      const nl = wx * SUN[0] + wy * SUN[1] + nz * SUN[2];
      let I = (0.3 + 0.1 * nz + (nl > -0.2 ? (nl + 0.2) / 1.2 : 0) * 0.95) * ao * v;
      const sp = SPEC[id];
      if (sp && nl > 0) { const nh = wx * HV[0] + wy * HV[1] + nz * HV[2]; if (nh > 0) I += sp * Math.pow(nh, 28); }
      I += (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.47) * dith;
      let k = Math.round(I / IMAX * (STEPS - 1)); k = k < 0 ? 0 : k >= STEPS ? STEPS - 1 : k;
      const col = LUT[id][k];
      let r = col[0], g = col[1], b = col[2];
      const fl = wx * FILL[0] + wy * FILL[1] + nz * FILL[2];
      if (fl > 0.2) { const q = Math.round((fl - 0.2) * 4) / 4 * 0.55 * Math.min(1, ao); r += 40 * q; g += 70 * q; b += 150 * q; }
      a[i] = r; a[i + 1] = g; a[i + 2] = b;
    }
    // outline
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (mask[i]) continue;
      if ((x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1]) || (y > 0 && mask[i - w]) || (y < h - 1 && mask[i + w])) {
        const j = i * 4; a[j] = OUT[0]; a[j + 1] = OUT[1]; a[j + 2] = OUT[2]; a[j + 3] = 255;
      }
    }
    m.actx.putImageData(A, 0, 0);
    if (x1 < 0) return null;
    return { x: Math.max(0, x0 - 1), y: Math.max(0, y0 - 1), w: Math.min(w, x1 + 2) - Math.max(0, x0 - 1), h: Math.min(h, y1 + 2) - Math.max(0, y0 - 1) };
  }

  // ---------- LRU cache of finished sprites ----------
  const cache = new Map(), MAX = 900, AB = 64;
  function sprite(id, fi, ang, elevDeg) {
    const m = BY_ID[id]; if (!m || !m.frames) return null;
    fi = fi % m.F;
    const ai = ((Math.round(ang / (TAU / AB)) % AB) + AB) % AB;
    const key = id + '|' + fi + '|' + ai + '|' + elevDeg;
    let sp = cache.get(key);
    if (sp) { cache.delete(key); cache.set(key, sp); return sp; }
    const r = render(m, fi, ai * TAU / AB, elevDeg * Math.PI / 180);
    if (!r.box) { sp = { empty: true }; cache.set(key, sp); return sp; }
    const b = r.box, c = document.createElement('canvas'); c.width = b.w; c.height = b.h;
    c.getContext('2d').drawImage(m.art, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    sp = { c, w: b.w, h: b.h, cx: r.cx - b.x, cy: r.cy - b.y, mid: r.cy - b.y - m.d * Math.cos(elevDeg * Math.PI / 180) / 2 };
    if (r.glow) {
      const P = 4, g = document.createElement('canvas'); g.width = b.w + P * 2; g.height = b.h + P * 2;
      const gx = g.getContext('2d'); gx.filter = 'blur(1.6px)';
      gx.drawImage(m.gart, b.x, b.y, b.w, b.h, P, P, b.w, b.h);
      gx.filter = 'none'; gx.globalAlpha = 0.6; gx.drawImage(m.gart, b.x, b.y, b.w, b.h, P, P, b.w, b.h);
      sp.g = g; sp.gp = P;
    }
    cache.set(key, sp);
    if (cache.size > MAX) cache.delete(cache.keys().next().value);
    return sp;
  }

  // draw so that the model's base centre (or its middle, with opt.center) lands on (x, y);
  // scale = screen px per art px; opt.roll turns the sprite on screen, opt.flip shows it from below
  function draw(ctx, id, fi, ang, elevDeg, x, y, scale, opt) {
    opt = opt || {};
    const sp = sprite(id, fi, ang, elevDeg); if (!sp || sp.empty) return false;
    const ay = opt.center ? sp.mid : sp.cy;
    const tf = opt.roll || opt.flip;
    let dx, dy;
    if (tf) { ctx.save(); ctx.translate(x, y); if (opt.roll) ctx.rotate(opt.roll); if (opt.flip) ctx.scale(1, -1); dx = -sp.cx * scale; dy = -ay * scale; }
    else { dx = Math.round(x - sp.cx * scale); dy = Math.round(y - ay * scale); }
    const dw = Math.max(1, Math.round(sp.w * scale)), dh = Math.max(1, Math.round(sp.h * scale));
    if (opt.alpha != null) ctx.globalAlpha = opt.alpha;
    ctx.drawImage(sp.c, dx, dy, dw, dh);
    if (opt.flash) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = opt.flash; ctx.drawImage(sp.c, dx, dy, dw, dh); ctx.restore(); }
    if (sp.g && !opt.noGlow) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (opt.alpha != null ? opt.alpha : 1) * 0.9;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(sp.g, dx - sp.gp * scale, dy - sp.gp * scale, sp.g.width * scale, sp.g.height * scale);
      ctx.restore();
    }
    if (opt.alpha != null) ctx.globalAlpha = 1;
    if (tf) ctx.restore();
    return true;
  }
  const ready = id => { const m = BY_ID[id]; return !!(m && m.frames); };
  function size(id) { const m = BY_ID[id]; return m ? { w: m.w, h: m.h, d: m.d, diag: m.diag, F: m.F, fps: m.fps || 10, bob: m.bob || 0 } : null; }

  window.Stack = { draw, sprite, size, ready, BY_ID, cacheSize: () => cache.size };
})();

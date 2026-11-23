// High-quality planets: each planet has a painted surface map (made from the same noise as the voxel
// planets) and is drawn as a real sphere, pixel by pixel, lit by the sun, spinning on its tilted axis,
// with clouds, glowing lava, atmosphere and rings. Sized to the screen, so it stays smooth up close.
(function () {
  const { fbm, vnoise, hash3, PAL } = window.SS;
  const TAU = Math.PI * 2, TW = 512, TH = 256;
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const RAMPS = {}; for (const k in PAL) RAMPS[k] = PAL[k].map(hex);
  function ramp(name, t) { const r = RAMPS[name]; t = Math.max(0, Math.min(0.999, t)) * (r.length - 1); const i = Math.floor(t), f = t - i, a = r[i], b = r[i + 1]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function craters(seed, n, min, max) { const r = W3.rngOf(seed), out = []; for (let i = 0; i < n; i++) { const z = r() * 2 - 1, a = r() * TAU, q = Math.sqrt(1 - z * z); out.push([Math.cos(a) * q, Math.sin(a) * q, z, min + r() * (max - min)]); } return out; }
  function crater(list, x, y, z) { let k = 1; for (const [cx, cy, cz, r] of list) { const a = Math.acos(Math.max(-1, Math.min(1, x * cx + y * cy + z * cz))); if (a < r) k = Math.min(k, 0.72 + 0.2 * (a / r)); else if (a < r * 1.25) k = Math.max(k, 1.12); } return k; }
  const MOONC = craters(51, 46, 0.04, 0.22), DESC = craters(131, 14, 0.04, 0.14);

  // surface paint per planet type: returns [r, g, b, emissive 0..1, cloud 0..1]
  const SURF = {
    earth(x, y, z) {
      const n = fbm(x * 1.8 + 5, y * 1.8, z * 1.8, 91), m = fbm(x * 4 + 1, y * 4, z * 4, 93);
      const cl = sm(0.55, 0.7, fbm(x * 3.2, y * 3.2, z * 5, 95) + Math.abs(z) * 0.08);
      if (Math.abs(z) > 0.9 - n * 0.1) return [...ramp('white', 0.55 + n * 0.4), 0, cl];
      if (n > 0.53) { const c = m > 0.6 ? ramp('sand', 0.35 + m * 0.6) : ramp('green', 0.25 + (n - 0.53) * 3 + m * 0.2); return [...c, 0, cl]; }
      return [...ramp('ocean', 0.15 + n * 1.25), 0, cl];
    },
    moon(x, y, z) { const c = ramp('moon', 0.3 + fbm(x * 3, y * 3, z * 3, 51) * 0.65), k = crater(MOONC, x, y, z); return [c[0] * k, c[1] * k, c[2] * k, 0, 0]; },
    lava(x, y, z) {
      const v = vnoise(x * 5 + 3, y * 5, z * 5, 71), v2 = vnoise(x * 11, y * 11, z * 11, 72);
      const crack = Math.max(sm(0.045, 0.0, Math.abs(v - 0.5)), sm(0.03, 0, Math.abs(v2 - 0.5)) * 0.7);
      const c = v > 0.6 ? ramp('rock', 0.2 + v * 0.5) : ramp('dark', 0.4 + v);
      return [c[0] * (1 - crack) + 255 * crack, c[1] * (1 - crack) + 120 * crack, c[2] * (1 - crack) + 40 * crack, crack, 0];
    },
    ice(x, y, z) {
      if (Math.abs(z) > 0.72) return [...ramp('white', 0.7 + fbm(x * 4, y * 4, z * 4, 81) * 0.3), 0, 0];
      const f = fbm(x * 2, y * 2, z * 4, 82), cre = Math.abs(vnoise(x * 6, y * 6, z * 6, 83) - 0.5) < 0.02;
      if (cre) return [...ramp('glass', 0.45), 0, 0];
      return [...(Math.sin(z * 10 + f * 4) > 0.2 ? ramp('ice', 0.45 + f * 0.5) : ramp('white', 0.5 + f * 0.4)), 0, 0];
    },
    gas(x, y, z) {
      const lon = Math.atan2(y, x), lat = Math.asin(z);
      const st = ((lon - 1.0) / 0.32) ** 2 + ((lat + 0.32) / 0.13) ** 2;
      const t = fbm(x * 1.5, y * 1.5, z * 4, 101), b = Math.sin(z * 7 + t * 3.5);
      let c = b > 0.6 ? ramp('sand', 0.5 + t * 0.5) : b > 0 ? ramp('orange', 0.45 + t * 0.5) : b > -0.5 ? ramp('pink', 0.4 + t * 0.4) : ramp('red', 0.45 + t * 0.4);
      if (st < 1) { const s = ramp('red', 0.55 + Math.sin(st * 9 + lon * 6) * 0.2); c = s; }
      return [...c, 0, 0];
    },
    violet(x, y, z) { const t = fbm(x * 1.6, y * 1.6, z * 1.6, 111); return [...(Math.sin(z * 8 + t * 3) > 0.2 ? ramp('purp', 0.4 + t * 0.5) : ramp('pink', 0.35 + t * 0.5)), 0, 0]; },
    desert(x, y, z) { const t = fbm(x * 2, y * 2, z * 2, 121), d = Math.sin(x * 14 + y * 6 + t * 7); const c = d > 0.55 ? ramp('orange', 0.45 + t * 0.4) : ramp('sand', 0.4 + t * 0.5), k = crater(DESC, x, y, z); return [c[0] * k, c[1] * k, c[2] * k, 0, 0]; },
    planet(x, y, z) { const t = fbm(x * 1.2, y * 1.2, z * 3, 21), b = Math.sin(z * 9 + t * 3); return [...(b > 0.5 ? ramp('orange', 0.5 + t * 0.4) : b > -0.2 ? ramp('gold', 0.45 + t * 0.4) : ramp('red', 0.4 + t * 0.4)), 0, 0]; },
  };
  const LOOK = {
    earth: { atm: [110, 175, 255, 0.9] }, moon: { atm: null }, lava: { atm: [255, 120, 60, 0.5] }, ice: { atm: [170, 225, 255, 0.6] },
    gas: { atm: [255, 200, 150, 0.6] }, violet: { atm: [200, 140, 255, 0.7], ring: { ri: 1.35, ro: 1.95, col: r => (r > 1.58 && r < 1.64) ? null : r < 1.6 ? [80, 220, 200, 0.75] : [60, 140, 220, 0.55] } },
    desert: { atm: [255, 200, 140, 0.35] }, planet: { atm: [255, 210, 160, 0.5], ring: { ri: 1.4, ro: 2.3, col: r => { if (r > 1.78 && r < 1.86) return null; const b = Math.sin(r * 38) * 0.15; return r < 1.8 ? [235 + b * 60, 225 + b * 60, 205, 0.8] : [160 + b * 80, 170 + b * 80, 200, 0.6]; } } },
  };

  const TEX = {};
  function build(id) {
    const f = SURF[id]; if (!f) return;
    const col = new Uint8ClampedArray(TW * TH * 3), em = new Uint8ClampedArray(TW * TH), cl = new Uint8ClampedArray(TW * TH);
    let avg = [0, 0, 0];
    for (let v = 0; v < TH; v++) {
      const lat = Math.PI / 2 - (v + 0.5) / TH * Math.PI, cz = Math.sin(lat), cr = Math.cos(lat);
      for (let u = 0; u < TW; u++) {
        const lon = (u + 0.5) / TW * TAU - Math.PI, r = f(cr * Math.cos(lon), cr * Math.sin(lon), cz), i = v * TW + u;
        col[i * 3] = r[0]; col[i * 3 + 1] = r[1]; col[i * 3 + 2] = r[2]; em[i] = r[3] * 255; cl[i] = r[4] * 255;
        avg[0] += r[0]; avg[1] += r[1]; avg[2] += r[2];
      }
    }
    const n = TW * TH; TEX[id] = { col, em, cl, avg: avg.map(a => Math.round(a / n)), hasCl: id === 'earth', hasEm: id === 'lava' };
  }
  const ids = () => Object.keys(SURF);

  // ---------- drawing ----------
  const { sub, len, dot, norm, cross } = W3;
  const cache = new Map();
  let frame = 0;
  const MAXS = matchMedia('(pointer: coarse)').matches ? 230 : 300; // phones: a bit smaller, still smooth
  function draw(ctx, pl, T) {
    const pr = R3.proj(pl.p); if (!pr) return;
    const tex = TEX[pl.m], look = LOOK[pl.m] || {}, ring = look.ring, ext = ring ? ring.ro : 1.25;
    const rad = pl.R * pr.k; if (rad * ext < 0.6) return;
    const W = R3.cam.W, H = R3.cam.H;
    if (pr.x + rad * ext < 0 || pr.x - rad * ext > W || pr.y + rad * ext < 0 || pr.y - rad * ext > H) return;
    const L = norm(sub(W3.SUN.p, pl.p));
    if (!tex || rad < 2.5) { if (!tex) return; const [r, g, b] = tex.avg; ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.beginPath(); ctx.arc(pr.x, pr.y, Math.max(1, rad), 0, TAU); ctx.fill(); return; }
    // size of the offscreen image; re-render every other frame (or when the size jumps)
    const S = Math.max(8, Math.min(MAXS, Math.ceil(rad * ext * 2)));
    let c = cache.get(pl.name);
    const stale = !c || Math.abs(c.S - S) > S * 0.15 || (frame + pl.R) % 2 === 0;
    if (!c || c.S !== S && stale) { const cv = c && c.cv || document.createElement('canvas'); cv.width = S; cv.height = S; c = { cv, ctx: cv.getContext('2d'), S, img: cv.getContext('2d').createImageData(S, S) }; cache.set(pl.name, c); }
    if (stale) render(c, pl, tex, look, ring, ext, L, T);
    const D = rad * ext * 2;
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    // atmosphere halo
    if (look.atm) { const [r, g, b, a] = look.atm, glow = ctx.createRadialGradient(pr.x, pr.y, rad * 0.95, pr.x, pr.y, rad * 1.22); glow.addColorStop(0, `rgba(${r},${g},${b},${0.35 * a})`); glow.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = glow; ctx.fillRect(pr.x - rad * 1.25, pr.y - rad * 1.25, rad * 2.5, rad * 2.5); }
    ctx.drawImage(c.cv, pr.x - D / 2, pr.y - D / 2, D, D);
    ctx.restore();
  }
  function render(c, pl, tex, look, ring, ext, L, T) {
    const { S, img } = c, d = img.data, B = R3.cam.B, R = B.r, U = B.u, Fw = B.f;
    const t = pl.tilt || 0, ct = Math.cos(t), st = Math.sin(t), spin = (pl.spin || 0.02) * T;
    const N = [0, -st, ct];                       // the planet's axis (and ring plane normal)
    const cl = tex.hasCl, emOn = tex.hasEm, atm = look.atm;
    const toU = lon => { let u = ((lon / TAU + 0.5) % 1 + 1) % 1; return Math.floor(u * TW); };
    const fN = dot(Fw, N);
    for (let y = 0; y < S; y++) {
      const qy = -((y + 0.5) / S * 2 - 1) * ext;
      for (let x = 0; x < S; x++) {
        const qx = ((x + 0.5) / S * 2 - 1) * ext, i = (y * S + x) * 4, d2 = qx * qx + qy * qy;
        let r = 0, g = 0, b = 0, a = 0;
        const inDisc = d2 < 1, qz = inDisc ? Math.sqrt(1 - d2) : 0;
        if (inDisc) {
          const n = [qx * R[0] + qy * U[0] - qz * Fw[0], qx * R[1] + qy * U[1] - qz * Fw[1], qx * R[2] + qy * U[2] - qz * Fw[2]];
          const by = n[1] * ct + n[2] * st, bz = -n[1] * st + n[2] * ct;
          const lon = Math.atan2(by, n[0]) - spin, lat = Math.asin(Math.max(-1, Math.min(1, bz)));
          const u = toU(lon), v = Math.min(TH - 1, Math.floor((0.5 - lat / Math.PI) * TH)), k = v * TW + u;
          const dl = n[0] * L[0] + n[1] * L[1] + n[2] * L[2], lit = sm(-0.12, 0.35, dl);
          r = tex.col[k * 3]; g = tex.col[k * 3 + 1]; b = tex.col[k * 3 + 2];
          if (cl) { const cu = toU(Math.atan2(by, n[0]) - spin * 1.25), ca = tex.cl[v * TW + cu] / 255; r += (245 - r) * ca; g += (248 - g) * ca; b += (255 - b) * ca; }
          const amb = 0.05;
          r *= amb + lit * 0.98; g *= amb + lit * 0.98; b *= amb + lit * 0.98;
          if (emOn) { const e = tex.em[k] / 255 * (1 - lit * 0.6); r += 255 * e * 0.9; g += 110 * e * 0.9; b += 40 * e * 0.9; }
          if (atm) { const fr = Math.pow(1 - qz, 3) * atm[3] * (0.15 + 0.85 * sm(-0.3, 0.4, dl)); r += atm[0] * fr; g += atm[1] * fr; b += atm[2] * fr; }
          a = 255;
          if (qz < 0.06) a = Math.round(255 * qz / 0.06);
        }
        if (ring && Math.abs(fN) > 1e-4) {
          const q0 = [qx * R[0] + qy * U[0], qx * R[1] + qy * U[1], qx * R[2] + qy * U[2]];
          const tR = -(q0[0] * N[0] + q0[1] * N[1] + q0[2] * N[2]) / fN;
          const p = [q0[0] + Fw[0] * tR, q0[1] + Fw[1] * tR, q0[2] + Fw[2] * tR], rr = Math.hypot(p[0], p[1], p[2]);
          if (rr > ring.ri && rr < ring.ro && (!inDisc || tR < -qz)) {
            const rc = ring.col(rr);
            if (rc) {
              // planet shadow on the ring
              const sd = -(p[0] * L[0] + p[1] * L[1] + p[2] * L[2]);
              const shadow = sd > 0 && Math.sqrt(Math.max(0, rr * rr - sd * sd)) < 1 ? 0.25 : 1;
              const lk = (0.6 + 0.4 * Math.abs(N[0] * L[0] + N[1] * L[1] + N[2] * L[2])) * shadow, ra = rc[3] * (1 - sm(ring.ro - 0.08, ring.ro, rr)) * (sm(ring.ri, ring.ri + 0.05, rr));
              r = r * (1 - ra) + rc[0] * lk * ra; g = g * (1 - ra) + rc[1] * lk * ra; b = b * (1 - ra) + rc[2] * lk * ra; a = Math.max(a, ra * 255);
            }
          }
        }
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
      }
    }
    c.ctx.putImageData(img, 0, 0);
  }
  // the sun: a bright disc with a soft corona
  function drawSun(ctx) {
    const sun = W3.SUN, pr = R3.proj(sun.p); if (!pr) return;
    const rad = Math.max(3, sun.R * pr.k);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(pr.x, pr.y, rad * 0.6, pr.x, pr.y, rad * 4);
    g.addColorStop(0, 'rgba(255,220,150,0.55)'); g.addColorStop(0.35, 'rgba(255,150,70,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(pr.x - rad * 4, pr.y - rad * 4, rad * 8, rad * 8);
    ctx.restore();
    const c = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, rad);
    c.addColorStop(0, '#fffdf2'); c.addColorStop(0.75, '#ffe9a8'); c.addColorStop(1, '#ffb347');
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(pr.x, pr.y, rad, 0, TAU); ctx.fill();
  }
  window.PR = { build, ids, draw, drawSun, tick() { frame++; }, TEX };
})();

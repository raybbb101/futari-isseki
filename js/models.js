// Sprite-stacking voxel models for the space co-op demo.
// Each model is built as a small voxel volume (x right, y down, z up), then baked
// into horizontal slices (ground slice first), exactly like a sprite-stack strip.
(function () {
  const TAU = Math.PI * 2;

  // ---------- palette (4-tone hue-shifted ramps: deep, side, top, rim) ----------
  const PAL = {
    hull:   ['#232842', '#45507a', '#8593c0', '#d6def5'],
    red:    ['#43142c', '#8e2242', '#d9404c', '#ff9c78'],
    glass:  ['#0d2547', '#1a5a8c', '#38b4dc', '#bff6ff'],
    purp:   ['#201038', '#47206b', '#8840ad', '#d27de6'],
    metal:  ['#14121c', '#2a2738', '#4a4560', '#7b7496'],
    rock:   ['#241a22', '#46323c', '#73575a', '#a5877c'],
    cryst:  ['#0f2b40', '#1b7286', '#47d9c3', '#c6ffee'],
    gold:   ['#3f220e', '#94561a', '#eaa92e', '#fff0a2'],
    green:  ['#0d3326', '#1b6e45', '#45b86a', '#b4f0a0'],
    orange: ['#371820', '#82352a', '#d27236', '#f6c272'],
    pink:   ['#3a1238', '#7a2468', '#d0569e', '#ffb0d8'],
    white:  ['#4d5576', '#8f99bb', '#d3d9ee', '#ffffff'],
    dark:   ['#0c0a14', '#14111f', '#1d1a2b', '#262238'],
    moon:   ['#1f1e26', '#4a4856', '#8e8b9c', '#d6d3df'],
    ice:    ['#1c3350', '#4b7fa8', '#a8d8f0', '#f2fbff'],
    ocean:  ['#0b1d4a', '#14408a', '#2f78c8', '#8fd0ff'],
    sand:   ['#3b2416', '#8a5a2e', '#d9a35c', '#f8e0a8'],
  };
  const NOISY = { rock: 1, cryst: 1, moon: 1, sand: 1 };
  const EMIS = {
    fire: '#ffe68a', fire2: '#ff9a3c', fire3: '#ff4a62', cyan: '#7ff6ff', red: '#ff3a52',
    green: '#7dff8a', yellow: '#fff27a', pinkL: '#ff8ad8', violet: '#c69bff', white: '#ffffff',
    blue: '#3b5cff', lava: '#ff7a2a',
  };
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const MATS = [null], MID = {};
  for (const k in PAL) { MID[k] = MATS.length; MATS.push({ name: k, rgbs: PAL[k].map(hex), noise: !!NOISY[k] }); }
  for (const k in EMIS) { MID['e_' + k] = MATS.length; MATS.push({ name: 'e_' + k, emis: hex(EMIS[k]) }); }

  // ---------- noise ----------
  function hash3(x, y, z, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177) ^ Math.imul((s | 0) + 1, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, z, s) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    let r = 0;
    for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++)
      r += hash3(xi + dx, yi + dy, zi + dz, s) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    return r;
  }
  const fbm = (x, y, z, s) => vnoise(x, y, z, s) * 0.6 + vnoise(x * 2.1, y * 2.1, z * 2.1, s + 7) * 0.3 + vnoise(x * 4.3, y * 4.3, z * 4.3, s + 13) * 0.1;

  // ---------- voxel volume ----------
  class Vol {
    constructor(w, h, d) { this.w = w; this.h = h; this.d = d; this.m = new Uint8Array(w * h * d); }
    idx(x, y, z) { return (z * this.h + y) * this.w + x; }
    inb(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.h && z < this.d; }
    get(x, y, z) { return this.inb(x, y, z) ? this.m[this.idx(x, y, z)] : 0; }
    put(x, y, z, mat) { x |= 0; y |= 0; z |= 0; if (this.inb(x, y, z)) this.m[this.idx(x, y, z)] = mat ? MID[mat] : 0; }
    // test(px,py,pz) is evaluated at voxel centres; mat is a name, '' to clear, or fn -> name|''|undefined(skip)
    region(bb, test, mat) {
      const x0 = Math.max(0, Math.floor(bb[0])), x1 = Math.min(this.w - 1, Math.ceil(bb[1]));
      const y0 = Math.max(0, Math.floor(bb[2])), y1 = Math.min(this.h - 1, Math.ceil(bb[3]));
      const z0 = Math.max(0, Math.floor(bb[4])), z1 = Math.min(this.d - 1, Math.ceil(bb[5]));
      for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5, pz = z + 0.5;
        if (!test(px, py, pz, x, y, z)) continue;
        const m = typeof mat === 'function' ? mat(px, py, pz, x, y, z) : mat;
        if (m !== undefined) this.m[this.idx(x, y, z)] = m ? MID[m] : 0;
      }
    }
    all(test, mat) { this.region([0, this.w, 0, this.h, 0, this.d], test, mat); }
    paint(test, mat) {
      for (let z = 0; z < this.d; z++) for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        const i = this.idx(x, y, z); if (!this.m[i]) continue;
        const px = x + 0.5, py = y + 0.5, pz = z + 0.5;
        if (!test(px, py, pz, x, y, z)) continue;
        const m = typeof mat === 'function' ? mat(px, py, pz, x, y, z) : mat;
        if (m !== undefined) this.m[i] = m ? MID[m] : 0;
      }
    }
    box(x0, y0, z0, x1, y1, z1, mat) {
      this.region([x0, x1, y0, y1, z0, z1], (x, y, z) => x >= x0 && x < x1 && y >= y0 && y < y1 && z >= z0 && z < z1, mat);
    }
    ell(cx, cy, cz, rx, ry, rz, mat) {
      this.region([cx - rx, cx + rx, cy - ry, cy + ry, cz - rz, cz + rz],
        (x, y, z) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 <= 1, mat);
    }
    cyl(cx, cy, r, z0, z1, mat) {
      this.region([cx - r, cx + r, cy - r, cy + r, z0, z1], (x, y, z) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r && z >= z0 && z < z1, mat);
    }
    cone(ax, ay, az, bx, by, bz, r0, r1, mat) {
      const R = Math.max(r0, r1), dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx * dx + dy * dy + dz * dz || 1;
      this.region([Math.min(ax, bx) - R, Math.max(ax, bx) + R, Math.min(ay, by) - R, Math.max(ay, by) + R, Math.min(az, bz) - R, Math.max(az, bz) + R],
        (x, y, z) => {
          let t = ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = ax + dx * t - x, qy = ay + dy * t - y, qz = az + dz * t - z, r = r0 + (r1 - r0) * t;
          return qx * qx + qy * qy + qz * qz <= r * r;
        }, mat);
    }
    seg(ax, ay, az, bx, by, bz, r, mat) { this.cone(ax, ay, az, bx, by, bz, r, r, mat); }
    torus(cx, cy, cz, R, r, mat, axis) {
      if (axis === 'y') this.region([cx - R - r, cx + R + r, cy - r, cy + r, cz - R - r, cz + R + r],
        (x, y, z) => (Math.hypot(x - cx, z - cz) - R) ** 2 + (y - cy) ** 2 <= r * r, mat);
      else this.region([cx - R - r, cx + R + r, cy - R - r, cy + R + r, cz - r, cz + r],
        (x, y, z) => (Math.hypot(x - cx, y - cy) - R) ** 2 + (z - cz) ** 2 <= r * r, mat);
    }
  }

  // ---------- bake volume -> slice canvases ----------
  function bake(vol) {
    const { w, h, d } = vol, slices = [], glows = [];
    let count = 0, hasGlow = false;
    for (let z = 0; z < d; z++) {
      let img = null, gimg = null;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const id = vol.m[vol.idx(x, y, z)]; if (!id) continue;
        const M = MATS[id];
        if (!img) img = new ImageData(w, h);
        const i = (y * w + x) * 4;
        let col;
        if (M.emis) {
          col = M.emis;
          if (!gimg) gimg = new ImageData(w, h);
          gimg.data[i] = col[0]; gimg.data[i + 1] = col[1]; gimg.data[i + 2] = col[2]; gimg.data[i + 3] = 255;
        } else {
          const up = vol.get(x, y, z + 1);
          const side = !vol.get(x - 1, y, z) || !vol.get(x + 1, y, z) || !vol.get(x, y - 1, z) || !vol.get(x, y + 1, z);
          let t;
          if (!up) t = side ? 3 : 2;
          else t = side ? (vol.get(x, y, z - 1) ? 1 : 0) : 0;
          if (M.noise) { const n = hash3(x, y, z, 9); if (n < 0.2) t = Math.max(0, t - 1); else if (n > 0.92) t = Math.min(3, t + 1); }
          col = M.rgbs[t];
        }
        img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
      }
      if (img) {
        const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(img, 0, 0);
        slices.push(c); count++;
      } else slices.push(null);
      if (gimg) {
        const g = document.createElement('canvas'); g.width = w; g.height = h; g.getContext('2d').putImageData(gimg, 0, 0);
        glows.push(g); hasGlow = true;
      } else glows.push(null);
    }
    return { w, h, d, slices, glows, count, hasGlow };
  }

  // ---------- models ----------
  const MODELS = [
    {
      id: 'ship', jp: 'ふたり号', role: '自機', w: 40, h: 30, d: 16, F: 16, fps: 12,
      desc: '2人が乗る宇宙船。上の金色の砲台がガンナーの席で、ゆっくり首をふる。うしろのエンジンの炎がゆらぐ。',
      build(V, f, F) {
        const cy = 15, ph = f / F * TAU;
        V.ell(21, cy, 6, 15, 5, 3.6, 'hull');
        V.region([8, 27, 0, 30, 4, 6.2], (x, y, z) => Math.abs(y - cy) <= Math.min(13.6, 3 + (26 - x) * 0.62) && z >= 4 && z < 6.2 && x >= 8, 'hull');
        V.paint((x, y) => Math.abs(y - cy) > 10.5, 'red');
        V.paint((x, y, z) => x > 22 && x < 24.6 && z > 7, 'red');
        V.ell(28.5, cy, 8, 5, 2.6, 2.2, 'glass');
        const fl = 2 + ((f * 5) % 3);
        for (const s of [-5, 5]) {
          V.seg(6, cy + s, 5.5, 15, cy + s, 5.5, 2.4, 'metal');
          V.seg(5.5 - fl, cy + s, 5.5, 6, cy + s, 5.5, 1.6, 'e_fire2');
          V.seg(6 - fl * 0.6, cy + s, 5.5, 6, cy + s, 5.5, 1.0, 'e_fire');
        }
        V.cyl(17, cy, 3.2, 8, 10.5, 'gold'); V.ell(17, cy, 10.5, 3, 3, 1.7, 'gold');
        const a = Math.sin(ph) * 1.3, c = Math.cos(a), s = Math.sin(a);
        for (const k of [-1.1, 1.1]) {
          const bx = 17 - s * k, by = cy + c * k;
          V.seg(bx + c * 1.5, by + s * 1.5, 11, bx + c * 9.5, by + s * 9.5, 11, 1.0, 'metal');
        }
        const on = (f % 8) < 4;
        V.put(9, cy - 13, 5, on ? 'e_red' : 'red'); V.put(9, cy + 13, 5, on ? 'e_green' : 'green');
      },
    },
    {
      id: 'raider', jp: 'レイダー', role: '敵', w: 32, h: 34, d: 12, F: 8, fps: 10,
      desc: '前向きの翼をもつ敵の戦闘機。赤い目と、むらさきのエンジンが脈打つ。',
      build(V, f, F) {
        const cy = 17;
        V.ell(15, cy, 5, 11, 4, 3, 'purp');
        V.region([5, 22, 0, 34, 3.5, 5.5], (x, y, z) => { const dy = Math.abs(y - cy); return x >= 6 + dy * 0.3 && x <= 8 + dy * 0.85 && dy <= 15 && z >= 3.5 && z < 5.5; }, 'purp');
        V.paint((x, y) => Math.abs(y - cy) > 11, 'metal');
        V.paint((x, y) => Math.abs(y - cy) > 13.5, 'red');
        for (const s of [-3, 3]) V.seg(20, cy + s, 5, 28, cy + s, 5, 1.2, 'metal');
        V.region([5, 13, cy - 1, cy + 1, 7, 10.5], (x, y, z) => Math.abs(y - cy) < 0.8 && x >= 6 + (z - 7) * 0.8 && x < 12, 'purp');
        V.ell(22, cy, 6.3, 2.2, 2, 1.6, 'e_red');
        const pl = 2 + Math.round((Math.sin(f / F * TAU) + 1) * 1.5);
        V.seg(4 - pl, cy, 5, 4.5, cy, 5, 1.7, 'e_violet');
      },
    },
    {
      id: 'drone', jp: 'オービット・ドローン', role: '敵', w: 30, h: 30, d: 16, F: 16, fps: 12, bob: 1.5,
      desc: 'まわりを4つのポッドが回る見はりドローン。ふわふわ浮く。',
      build(V, f, F) {
        const c = 15, cz = 8, sp = f / F * TAU / 4;
        V.ell(c, c, cz, 5, 5, 5, 'metal');
        V.paint((x, y, z) => Math.abs(z - cz) < 1, 'purp');
        V.ell(c + 4.2, c, cz, 1.4, 2.2, 2.2, 'e_red');
        V.seg(c, c, cz + 4, c, c, cz + 7.5, 0.8, 'metal');
        V.put(c, c, 15, (f % 8) < 4 ? 'e_cyan' : 'glass');
        V.torus(c, c, cz, 11, 1.2, 'gold');
        for (let k = 0; k < 4; k++) {
          const a = sp + k * TAU / 4, px = c + Math.cos(a) * 11, py = c + Math.sin(a) * 11;
          V.ell(px, py, cz, 2.2, 2.2, 2.2, 'purp');
          V.put(px, py, 9, 'e_cyan');
        }
      },
    },
    {
      id: 'mine', jp: 'スパイク機雷', role: '障害物', w: 28, h: 28, d: 24, F: 16, fps: 10, bob: 0.8,
      desc: 'トゲだらけの機雷。赤いランプが点滅する。さわると爆発する障害物。',
      build(V, f, F) {
        const c = 14, cz = 12, on = (f % 8) < 4;
        V.ell(c, c, cz, 6.5, 6.5, 6.5, 'metal');
        V.paint((x, y, z) => Math.abs(z - cz) < 1.3, 'red');
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
          const n = Math.abs(i) + Math.abs(j) + Math.abs(k); if (n !== 1 && n !== 3) continue;
          const L = Math.hypot(i, j, k), dx = i / L, dy = j / L, dz = k / L;
          V.cone(c + dx * 5.5, c + dy * 5.5, cz + dz * 5.5, c + dx * 10.5, c + dy * 10.5, cz + dz * 10.5, 1.6, 0.5, 'hull');
        }
        for (let k = 0; k < 4; k++) {
          const a = TAU / 8 + k * TAU / 4;
          V.ell(c + Math.cos(a) * 6.2, c + Math.sin(a) * 6.2, cz, 1.2, 1.2, 1.2, on ? 'e_red' : 'red');
        }
      },
    },
    {
      id: 'turret', jp: '砲台', role: '敵', w: 30, h: 30, d: 16, F: 16, fps: 10,
      desc: '動かない敵の砲台。2本の砲身が左右をねらい、4フレームごとに撃つ（反動つき）。',
      build(V, f, F) {
        const c = 15;
        V.region([4, 26, 4, 26, 0, 4], (x, y, z) => { const dx = Math.abs(x - c), dy = Math.abs(y - c); return dx <= 10.5 && dy <= 10.5 && dx + dy <= 14.5 && z < 4; },
          (x, y, z) => { const dx = Math.abs(x - c), dy = Math.abs(y - c); if (z >= 3 && dx + dy > 11.5) return (Math.floor((x + y) / 2) % 2) ? 'gold' : 'metal'; return 'metal'; });
        V.region([7, 23, 7, 23, 4, 10], (x, y, z) => z >= 4 && ((x - c) / 7.5) ** 2 + ((y - c) / 7.5) ** 2 + ((z - 4) / 6) ** 2 <= 1, 'purp');
        V.paint((x, y, z) => z >= 4 && z < 5.2, 'red');
        const a = Math.sin(f / F * TAU) * 0.9, fire = f % 4 === 0, rec = fire ? 1.5 : 0;
        const ca = Math.cos(a), sa = Math.sin(a);
        for (const k of [-1.4, 1.4]) {
          const bx = c - sa * k, by = c + ca * k;
          V.seg(bx + ca * 3, by + sa * 3, 8, bx + ca * (11 - rec), by + sa * (11 - rec), 8, 1.1, 'metal');
          if (fire) V.ell(bx + ca * 11.4, by + sa * 11.4, 8, 1.4, 1.4, 1.4, 'e_fire');
        }
        const on = (f % 8) < 4;
        for (const [dx, dy] of [[9, 0], [-9, 0], [0, 9], [0, -9]]) V.put(c + dx, c + dy, 3, on ? 'e_red' : 'red');
      },
    },
    {
      id: 'boss', jp: '戦艦ドレッド', role: 'ボス', w: 76, h: 40, d: 20, F: 12, fps: 8,
      desc: 'ボスの戦艦。4つの砲台がそれぞれ動き、横のランプが前へ流れる。艦橋の窓が光る。',
      build(V, f, F) {
        const cy = 20, hw = x => x < 56 ? 14 : 14 * (70 - x) / 14;
        V.region([6, 70, 0, 40, 2, 7], (x, y, z) => x >= 6 && Math.abs(y - cy) <= hw(x) - (z < 3 ? 2 : 0), 'metal');
        V.region([10, 58, 0, 40, 7, 9], (x, y, z) => x >= 10 && x < 58 && Math.abs(y - cy) <= hw(x) - 3, 'purp');
        V.paint((x, y, z) => z >= 7 && z < 9 && Math.abs(y - cy) > hw(x) - 4.2, 'red');
        V.box(16, cy - 5, 9, 28, cy + 5, 15, 'purp');
        V.box(18, cy - 3, 15, 26, cy + 3, 17, 'metal');
        V.paint((x, y, z) => x >= 16 && x < 28 && z >= 12 && z < 13.6 && (x > 27 || Math.abs(y - cy) > 4) && (Math.floor(x + y) % 2 === 0), 'e_cyan');
        V.seg(22, cy, 17, 22, cy, 19.5, 0.8, 'metal');
        V.put(22, cy, 19, (f % 6) < 3 ? 'e_red' : 'red');
        const T = [[38, cy], [50, cy], [43, cy - 8], [43, cy + 8]];
        T.forEach(([px, py], i) => {
          V.cyl(px, py, 2.6, 9, 11, 'gold');
          const a = Math.sin(f / F * TAU + i * 1.7) * 0.8 + (i === 2 ? -0.5 : i === 3 ? 0.5 : 0);
          V.seg(px, py, 10.5, px + Math.cos(a) * 6.5, py + Math.sin(a) * 6.5, 10.5, 0.95, 'metal');
        });
        const fl = 2 + (f % 3);
        for (const s of [-8, 0, 8]) {
          V.seg(4, cy + s, 5, 11, cy + s, 5, 3, 'metal');
          V.seg(3.5 - fl, cy + s, 5, 4, cy + s, 5, 2, 'e_violet');
        }
        V.paint((x, y, z, xi) => z >= 4 && z < 5 && Math.abs(y - cy) > hw(x) - 1 && xi % 4 === 0,
          (x, y, z, xi) => ((xi / 4 | 0) + F - f) % 6 === 0 ? 'e_yellow' : 'dark');
        V.cone(66, cy, 4.5, 75.5, cy, 4, 2.6, 0.6, 'gold');
      },
    },
    {
      id: 'jelly', jp: '宇宙クラゲ', role: '敵', w: 28, h: 28, d: 26, F: 16, fps: 10, bob: 2,
      desc: '宇宙をただよう生きもの。かさが脈打ち、足がゆれる。低い角度から見ると足がよく見える。',
      build(V, f, F) {
        const c = 14, p = f / F * TAU, pulse = Math.sin(p);
        const rx = 9 + pulse * 0.8, rz = 7 - pulse * 0.6;
        V.region([0, 28, 0, 28, 15, 26], (x, y, z) => z >= 15 && ((x - c) / rx) ** 2 + ((y - c) / rx) ** 2 + ((z - 15) / rz) ** 2 <= 1, 'pink');
        V.paint((x, y, z) => z < 16.2 && Math.hypot(x - c, y - c) > rx - 1.6, 'purp');
        V.paint((x, y, z, xi, yi, zi) => z > 18 && hash3(xi, yi, zi, 4) < 0.07, 'e_pinkL');
        for (let k = 0; k < 8; k++) {
          const ang = k * TAU / 8 + 0.2, ox = Math.cos(ang), oy = Math.sin(ang);
          let prev = [c + ox * 6, c + oy * 6, 15];
          for (let z = 14; z >= 2; z -= 1) {
            const amt = (15 - z) / 13, sway = Math.sin(z * 0.5 + p + k) * 1.8 * amt, out = 6 + amt * 2;
            const pt = [c + ox * out - oy * sway, c + oy * out + ox * sway, z];
            V.seg(prev[0], prev[1], prev[2], pt[0], pt[1], pt[2], 0.9, 'purp');
            prev = pt;
          }
        }
        for (let k = 0; k < 4; k++) {
          const ang = k * TAU / 4 + 0.6, ox = Math.cos(ang), oy = Math.sin(ang);
          let prev = [c + ox * 2, c + oy * 2, 15];
          for (let z = 14; z >= 6; z--) {
            const sway = Math.sin(z * 0.4 - p + k * 2) * 1.2;
            const pt = [c + ox * 2.5 - oy * sway, c + oy * 2.5 + ox * sway, z];
            V.seg(prev[0], prev[1], prev[2], pt[0], pt[1], pt[2], 1.3, 'pink');
            prev = pt;
          }
        }
      },
    },
    {
      id: 'asteroid', jp: '小惑星', role: '障害物', w: 34, h: 30, d: 24, F: 1,
      desc: 'でこぼこの岩とクレーター。いちばんよく出てくる障害物。',
      build(V) {
        const cx = 17, cy = 15, cz = 12;
        V.all((x, y, z) => {
          const dx = (x - cx) / 14, dy = (y - cy) / 12, dz = (z - cz) / 10;
          return Math.sqrt(dx * dx + dy * dy + dz * dz) < 0.78 + 0.32 * fbm(x * 0.14, y * 0.14, z * 0.14, 3);
        }, 'rock');
        for (const [x, y, z, r] of [[22, 10, 21, 4], [10, 18, 20, 3.5], [28, 20, 14, 3], [7, 9, 14, 2.6]]) V.ell(x, y, z, r, r, r, '');
        V.paint((x, y, z, xi, yi, zi) => hash3(xi, yi, zi, 2) < 0.03, 'orange');
      },
    },
    {
      id: 'crystal', jp: '結晶の小惑星', role: '障害物', w: 32, h: 32, d: 26, F: 1,
      desc: '光る結晶が生えた岩。こわすとアイテムが出る、などに使えそう。',
      build(V) {
        V.all((x, y, z) => {
          const dx = (x - 16) / 11, dy = (y - 16) / 10, dz = (z - 8) / 7;
          return Math.sqrt(dx * dx + dy * dy + dz * dz) < 0.8 + 0.3 * fbm(x * 0.16, y * 0.16, z * 0.16, 8);
        }, 'rock');
        const C = [[16, 16, 12, 0, 0, 1, 12, 2.6], [10, 14, 10, -0.6, -0.2, 0.8, 9, 2.2], [22, 19, 10, 0.6, 0.3, 0.75, 10, 2.2],
          [18, 9, 10, 0.2, -0.7, 0.7, 8, 1.8], [12, 22, 9, -0.3, 0.7, 0.6, 7, 1.8], [24, 11, 8, 0.8, -0.4, 0.4, 6, 1.5]];
        for (const [x, y, z, dx, dy, dz, L, r] of C) {
          const n = Math.hypot(dx, dy, dz), ex = x + dx / n * L, ey = y + dy / n * L, ez = z + dz / n * L;
          V.cone(x, y, z, ex, ey, ez, r, 0.5, 'cryst');
          V.put(ex - dx / n * 0.8, ey - dy / n * 0.8, ez - dz / n * 0.8, 'e_cyan');
        }
      },
    },
    {
      id: 'cargo', jp: '補給コンテナ', role: 'アイテム', w: 30, h: 18, d: 14, F: 1,
      desc: 'ただよう補給コンテナ。こわすと回復やエネルギーが出る。',
      build(V) {
        V.box(2, 2, 0, 28, 16, 12, 'orange');
        V.paint((x, y, z) => (y < 3.5 || y > 14.5) && Math.floor(x) % 3 === 0 && z > 1.5 && z < 10.5, 'red');
        V.paint((x, y, z) => { const ex = x < 3.5 || x > 26.5, ey = y < 3.5 || y > 14.5, ez = z < 1.5 || z > 10.5; return (ex + ey + ez) >= 2; }, 'metal');
        V.paint((x, y, z) => z > 10.5 && Math.abs(y - 9) < 1.6 && x > 6 && x < 24, 'white');
        V.paint((x, y, z) => z > 10.5 && x > 12 && x < 18 && y > 4 && y < 7, 'gold');
        V.put(25, 4, 11, 'e_green');
      },
    },
    {
      id: 'satellite', jp: '人工衛星', role: '背景', w: 44, h: 24, d: 20, F: 1,
      desc: '太陽電池パネルとアンテナのついた衛星。背景の飾りや、守るミッションの目標に。',
      build(V) {
        const cy = 12;
        V.box(18, 8, 5, 26, 16, 13, 'gold');
        V.paint((x, y, z, xi, yi, zi) => (xi + zi + yi) % 4 === 0, 'orange');
        V.seg(10, cy, 9.5, 18, cy, 9.5, 0.9, 'metal'); V.seg(26, cy, 9.5, 34, cy, 9.5, 0.9, 'metal');
        V.box(2, 5, 9, 16, 19, 10, 'glass'); V.box(28, 5, 9, 42, 19, 10, 'glass');
        V.paint((x, y, z, xi, yi) => z < 10 && z >= 9 && (x < 16.5 || x > 27.5) && (xi % 4 === 1 || yi % 5 === 4), 'metal');
        V.region([15, 29, 5, 19, 13, 19], (x, y, z) => { const r = Math.hypot(x - 22, y - cy); return r < 6.5 && Math.abs(z - (13.5 + r * r / 10)) < 0.9; }, 'white');
        V.seg(22, cy, 13, 22, cy, 18.5, 0.8, 'metal');
        V.put(22, cy, 18, 'e_red');
      },
    },
    {
      id: 'wreck', jp: '船の残骸', role: '障害物', w: 36, h: 30, d: 18, F: 1,
      desc: 'こわれた船の一部。切れ目がこげていて、ところどころ火花が残っている。',
      build(V) {
        V.ell(18, 15, 7, 15, 8, 5, 'hull');
        V.paint((x, y, z) => Math.abs(y - 15) < 1.3 && z > 9, 'red');
        V.box(8, 2, 5, 18, 28, 7, 'hull');
        V.paint((x, y) => y < 4 || y > 26, 'red');
        const orig = V.m.slice();
        V.all((x, y, z) => x > 22 + fbm(y * 0.3, z * 0.3, 1, 5) * 9 || fbm(x * 0.2, y * 0.2, z * 0.2, 11) > 0.66 || (y < 9 && x < 12 + fbm(x * 0.4, z * 0.4, 2, 6) * 8), '');
        const was = (x, y, z) => V.inb(x, y, z) && orig[V.idx(x, y, z)] && !V.m[V.idx(x, y, z)];
        V.paint((x, y, z, xi, yi, zi) => was(xi - 1, yi, zi) || was(xi + 1, yi, zi) || was(xi, yi - 1, zi) || was(xi, yi + 1, zi) || was(xi, yi, zi + 1),
          (x, y, z, xi, yi, zi) => { const n = hash3(xi, yi, zi, 5); return n < 0.1 ? 'e_fire2' : n < 0.55 ? 'dark' : 'metal'; });
        V.box(30, 4, 2, 33, 7, 4, 'hull'); V.box(31, 22, 8, 34, 25, 9, 'metal'); V.box(2, 25, 3, 5, 28, 5, 'hull');
      },
    },
    {
      id: 'station', jp: '宇宙ステーション', role: '背景', w: 48, h: 48, d: 22, F: 24, fps: 8,
      desc: '回転するリングをもつステーション。窓の光が流れていく。スタート地点や補給地点に。',
      build(V, f, F) {
        const c = 24, cz = 11, sp = f / F * TAU / 4;
        V.cyl(c, c, 5, 3, 19, 'hull'); V.ell(c, c, 19, 5, 5, 2, 'hull'); V.ell(c, c, 3, 5, 5, 2, 'hull');
        V.paint((x, y, z) => z > 10 && z < 12.5, 'red');
        V.seg(c, c, 20, c, c, 21.9, 0.7, 'metal');
        V.put(c, c, 21, (f % 8) < 4 ? 'e_red' : 'red');
        V.torus(c, c, cz, 19, 2.6, 'hull');
        V.paint((x, y, z) => {
          if (Math.hypot(x - c, y - c) < 20.4 || Math.abs(z - cz) > 1.2) return false;
          let a = Math.atan2(y - c, x - c) - sp; a = ((a % TAU) + TAU) % TAU;
          return Math.floor(a / (TAU / 24)) % 2 === 0;
        }, 'e_yellow');
        for (let k = 0; k < 4; k++) {
          const a = sp + k * TAU / 4, ca = Math.cos(a), sa = Math.sin(a);
          V.seg(c + ca * 5, c + sa * 5, cz, c + ca * 17, c + sa * 17, cz, 1.2, 'metal');
          const b = a + TAU / 8;
          V.ell(c + Math.cos(b) * 19, c + Math.sin(b) * 19, cz + 2.4, 2.4, 2.4, 1.6, 'white');
        }
      },
    },
    {
      id: 'gate', jp: 'ワープゲート', role: 'ゴール', w: 34, h: 20, d: 34, F: 16, fps: 12,
      desc: 'ステージのゴール。中のうずが回り、まわりのランプが順番に光る。',
      build(V, f, F) {
        const cx = 17, cy = 10, cz = 17, p = f / F * TAU;
        V.torus(cx, cy, cz, 13, 2.6, 'metal', 'y');
        for (let k = 0; k < 8; k++) { const a = k * TAU / 8; V.ell(cx + Math.cos(a) * 13, cy, cz + Math.sin(a) * 13, 2.6, 3.4, 2.6, 'gold'); }
        const lit = Math.floor(f / F * 8);
        for (let k = 0; k < 8; k++) { const a = k * TAU / 8 + TAU / 16; V.ell(cx + Math.cos(a) * 15.2, cy, cz + Math.sin(a) * 15.2, 1.1, 1.3, 1.1, k === lit ? 'e_cyan' : 'glass'); }
        // the portal is 3 units thick so it never thins into gaps at low camera angles,
        // and every part of it glows (deep blue between the arms instead of dark glass)
        V.region([cx - 11, cx + 11, cy - 2, cy + 2, cz - 11, cz + 11], (x, y, z) => Math.hypot(x - cx, z - cz) < 10.8 && Math.abs(y - cy) < 1.6,
          (x, y, z) => { const r = Math.hypot(x - cx, z - cz), th = Math.atan2(z - cz, x - cx), s = Math.sin(th * 3 + r * 0.55 - p); return s > 0.35 ? 'e_cyan' : s > -0.2 ? 'e_violet' : 'e_blue'; });
      },
    },
    {
      id: 'capsule', jp: 'パワーアップ', role: 'アイテム', w: 16, h: 16, d: 20, F: 16, fps: 12, bob: 1.5,
      desc: '中の宝石が回るカプセル。とるとコンボが短くなる、などの効果に。',
      build(V, f, F) {
        const c = 8, p = f / F * TAU / 4, ca = Math.cos(p), sa = Math.sin(p);
        V.cyl(c, c, 6, 0, 2, 'white'); V.cyl(c, c, 4.5, 2, 3, 'gold');
        V.cyl(c, c, 6, 17, 19, 'white'); V.cyl(c, c, 4.5, 16, 17, 'gold');
        for (let k = 0; k < 4; k++) { const a = p + TAU / 8 + k * TAU / 4; V.seg(c + Math.cos(a) * 5, c + Math.sin(a) * 5, 3, c + Math.cos(a) * 5, c + Math.sin(a) * 5, 16, 0.9, 'metal'); }
        V.region([2, 14, 2, 14, 4, 15], (x, y, z) => {
          const dx = x - c, dy = y - c, dz = z - 9.5, rx = dx * ca - dy * sa, ry = dx * sa + dy * ca;
          return Math.abs(rx) + Math.abs(ry) + Math.abs(dz) * 0.8 <= 4.4;
        }, (x, y, z) => z > 9.5 ? 'e_yellow' : 'gold');
      },
    },
    {
      id: 'planet', jp: '環のある惑星', role: '背景', w: 56, h: 56, d: 30, F: 1,
      desc: 'しま模様と、ななめの環をもつ惑星。遠くの背景に置く。',
      build(V) {
        const c = 28, cz = 15, R = 12;
        V.ell(c, c, cz, R, R, R, (x, y, z) => { const n = fbm(x * 0.12, y * 0.12, z * 0.5, 21), b = Math.sin((z - cz) * 0.9 + n * 3); return b > 0.5 ? 'orange' : b > -0.2 ? 'gold' : 'red'; });
        V.region([0, 56, 0, 56, 0, 30], (x, y, z) => { const r = Math.hypot(x - c, y - c); return r >= 16 && r <= 26 && Math.abs(z - (cz + (x - c) * 0.28)) < 0.55; },
          (x, y) => { const r = Math.hypot(x - c, y - c); return (r > 19.5 && r < 20.7) ? undefined : r < 22 ? 'white' : 'hull'; });
      },
    },
  ];

  // ---------- planet variants ----------
  function planetModel(o) {
    const ro = o.ring ? o.ring[1] : 0, half = Math.max(o.R, ro) + 2;
    const w = Math.ceil(half * 2), c = w / 2;
    const d = Math.ceil(Math.max(o.R * 2 + 4, o.ring ? 2 * ro * Math.abs(o.tilt) + 4 : 0)), cz = d / 2;
    return {
      id: o.id, jp: o.jp, role: '惑星', desc: o.desc, w, h: w, d, F: 1,
      build(V) {
        V.ell(c, c, cz, o.R, o.R, o.R, (x, y, z, xi, yi, zi) => o.surf(x - c, y - c, z - cz, o.R, x, y, z));
        if (o.extra) o.extra(V, c, cz);
        if (o.ring) {
          const [ri, rr] = o.ring;
          V.region([0, w, 0, w, 0, d], (x, y, z) => { const r = Math.hypot(x - c, y - c); return r >= ri && r <= rr && Math.abs(z - (cz + (x - c) * o.tilt)) < 0.55; },
            (x, y) => o.ringMat(Math.hypot(x - c, y - c)));
        }
      },
    };
  }
  const craters = (V, c, cz, R, n, seed, mat) => {
    for (let k = 0; k < n; k++) {
      const u = hash3(k, 1, 2, seed) * TAU, v = hash3(k, 3, 4, seed + 1) * 2 - 1, r = 1 + hash3(k, 5, 6, seed + 2) * (R * 0.22);
      const s = Math.sqrt(1 - v * v);
      V.ell(c + Math.cos(u) * s * R, c + Math.sin(u) * s * R, cz + v * R, r, r, r * 0.7, mat);
    }
  };
  MODELS.push(
    planetModel({ id: 'moon', jp: '灰色の月', desc: 'クレーターだらけの小さな月。', R: 11,
      surf: (x, y, z, R, ax, ay, az) => fbm(ax * 0.2, ay * 0.2, az * 0.2, 51) > 0.62 ? 'metal' : 'moon',
      extra: (V, c, cz) => craters(V, c, cz, 11, 16, 60, '') }),
    planetModel({ id: 'lava', jp: '溶岩の星', desc: '黒い岩のすきまから溶岩が光る星。', R: 12,
      surf: (x, y, z, R, ax, ay, az) => { const v = vnoise(ax * 0.22, ay * 0.22, az * 0.22, 71); return Math.abs(v - 0.5) < 0.045 ? 'e_lava' : v > 0.6 ? 'rock' : 'dark'; } }),
    planetModel({ id: 'ice', jp: '氷の星', desc: '白い極と、青い割れ目のある氷の星。', R: 12,
      surf: (x, y, z, R, ax, ay, az) => { if (Math.abs(z) > R * 0.62) return 'white'; const v = vnoise(ax * 0.3, ay * 0.3, az * 0.12, 81); return Math.abs(v - 0.5) < 0.04 ? 'glass' : (Math.sin(z * 1.3 + v * 4) > 0.3 ? 'ice' : 'white'); } }),
    planetModel({ id: 'earth', jp: '青い星', desc: '海と大陸と雲のある星。', R: 13,
      surf: (x, y, z, R, ax, ay, az) => { if (Math.abs(z) > R * 0.8) return 'white'; const v = fbm(ax * 0.12, ay * 0.12, az * 0.12, 91); return v > 0.66 ? 'sand' : v > 0.55 ? 'green' : 'ocean'; },
      extra: (V, c, cz) => V.region([0, 40, 0, 40, 0, 40], (x, y, z) => Math.abs(Math.hypot(x - c, y - c, z - cz) - 13.6) < 0.5 && fbm(x * 0.15, y * 0.15, z * 0.3, 95) > 0.6, 'white') }),
    planetModel({ id: 'gas', jp: 'ガス巨星', desc: 'しま模様と、赤い大きな嵐のある巨大な星。', R: 15,
      surf: (x, y, z, R, ax, ay, az) => { if (((x - 8) / 4) ** 2 + ((y + 6) / 4) ** 2 + ((z - 3) / 2) ** 2 < 1.2) return 'red'; const b = Math.sin(z * 0.8 + fbm(ax * 0.1, ay * 0.1, az * 0.4, 101) * 4); return b > 0.6 ? 'sand' : b > 0 ? 'orange' : b > -0.5 ? 'pink' : 'red'; } }),
    planetModel({ id: 'violet', jp: '紫の星', desc: '細い結晶の環をもつ、紫色の星。', R: 10, ring: [13, 19], tilt: -0.22,
      surf: (x, y, z, R, ax, ay, az) => Math.sin(z * 1.1 + fbm(ax * 0.15, ay * 0.15, az * 0.15, 111) * 3) > 0.2 ? 'purp' : 'pink',
      ringMat: r => (r > 15.5 && r < 16.3) ? undefined : r < 16 ? 'cryst' : 'glass' }),
    planetModel({ id: 'desert', jp: '砂の星', desc: '砂丘とクレーターの、かわいた星。', R: 10,
      surf: (x, y, z, R, ax, ay, az) => Math.sin(ax * 0.9 + fbm(ax * 0.2, ay * 0.2, az * 0.2, 121) * 6) > 0.55 ? 'orange' : 'sand',
      extra: (V, c, cz) => craters(V, c, cz, 10, 8, 130, '') }),
  );

  for (const m of MODELS) { m.F = m.F || 1; m.kind = m.F > 1 ? 'dynamic' : 'static'; m.diag = Math.hypot(m.w, m.h); }

  function bakeModel(m) {
    m.frames = [];
    for (let f = 0; f < m.F; f++) { const V = new Vol(m.w, m.h, m.d); m.build(V, f, m.F); m.frames.push(bake(V)); }
    m.slices = m.frames[0].count;
    m.hasGlow = m.frames.some(fr => fr.hasGlow);
  }

  window.SS = { MODELS, bakeModel, TAU, Vol, MID, MATS, PAL, EMIS, hash3, fbm, vnoise };
})();

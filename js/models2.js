// Version 2: the same 16 objects at twice the resolution (8x the voxels, 2x the slices),
// extra small details, and real lighting. Each slice stores material + ambient occlusion +
// surface normal, and the viewer lights every pixel at draw time, so the lit side stays
// toward the sun while the object turns.
(function () {
  const { MODELS: M1, Vol, MID, MATS, PAL, EMIS, hash3, fbm, TAU } = window.SS;
  const K = 2;

  // ---------- high-res volume: same API as v1, coordinates stay in model units ----------
  class VolK extends Vol {
    constructor(w, h, d, k = K) { super(w * k, h * k, d * k); this.K = k; }
    region(bb, test, mat) {
      const K = this.K;
      const x0 = Math.max(0, Math.floor(bb[0] * K)), x1 = Math.min(this.w - 1, Math.ceil(bb[1] * K));
      const y0 = Math.max(0, Math.floor(bb[2] * K)), y1 = Math.min(this.h - 1, Math.ceil(bb[3] * K));
      const z0 = Math.max(0, Math.floor(bb[4] * K)), z1 = Math.min(this.d - 1, Math.ceil(bb[5] * K));
      for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = (x + 0.5) / K, py = (y + 0.5) / K, pz = (z + 0.5) / K;
        if (!test(px, py, pz, x, y, z)) continue;
        const m = typeof mat === 'function' ? mat(px, py, pz, x, y, z) : mat;
        if (m !== undefined) this.m[this.idx(x, y, z)] = m ? MID[m] : 0;
      }
    }
    all(test, mat) { const K = this.K; this.region([0, this.w / K, 0, this.h / K, 0, this.d / K], test, mat); }
    paint(test, mat) {
      const K = this.K;
      for (let z = 0; z < this.d; z++) for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        const i = this.idx(x, y, z); if (!this.m[i]) continue;
        const px = (x + 0.5) / K, py = (y + 0.5) / K, pz = (z + 0.5) / K;
        if (!test(px, py, pz, x, y, z)) continue;
        const m = typeof mat === 'function' ? mat(px, py, pz, x, y, z) : mat;
        if (m !== undefined) this.m[i] = m ? MID[m] : 0;
      }
    }
    put(x, y, z, mat) {
      const K = this.K;
      const bx = Math.floor(x) * K, by = Math.floor(y) * K, bz = Math.floor(z) * K, v = mat ? MID[mat] : 0;
      for (let k = 0; k < K; k++) for (let j = 0; j < K; j++) for (let i = 0; i < K; i++)
        if (this.inb(bx + i, by + j, bz + k)) this.m[this.idx(bx + i, by + j, bz + k)] = v;
    }
    is(xi, yi, zi, name) { return this.inb(xi, yi, zi) && this.m[this.idx(xi, yi, zi)] === MID[name]; }
  }

  // ---------- extra detail per model (model units; xi/yi/zi are fine voxel indices) ----------
  const DETAIL = {
    ship(V) {
      const cy = 15;
      V.paint((x, y, z, xi, yi, zi) => V.is(xi, yi, zi, 'glass') && (Math.abs(x - 26.6) < 0.35 || (Math.abs(y - cy) < 0.3 && x < 30)), 'metal');
      for (const s of [-1, 1]) {
        const my = cy + s * 8.5;
        V.seg(11, my, 3.3, 19, my, 3.3, 0.8, 'white');
        V.cone(19, my, 3.3, 21, my, 3.3, 0.8, 0.2, 'red');
        V.box(11, my - 1.4, 3.1, 12.5, my + 1.4, 3.5, 'red');
      }
      V.paint((x, y, z, xi, yi, zi) => V.is(xi, yi, zi, 'metal') && x < 9 && x > 5.5 && Math.abs(Math.abs(y - cy) - 5) < 2.6, (x) => (Math.floor(x * 2) % 2) ? 'dark' : undefined);
      V.paint((x, y, z, xi, yi, zi) => V.is(xi, yi, zi, 'hull') && x > 16 && x < 24 && Math.abs(y - cy) > 3.4 && z > 4.6 && z < 7.6 && xi % 2 === 0, 'dark');
      V.paint((x, y, z, xi, yi, zi) => V.is(xi, yi, zi, 'hull') && z < 6.4 && x > 14 && x < 15.4 && Math.abs(y - cy) > 5.5, 'gold');
      V.seg(23.5, cy, 9.2, 21, cy, 12, 0.4, 'metal');
      V.put(20.5, cy, 12, 'e_cyan');
    },
    raider(V) {
      const cy = 17;
      V.ell(17.5, cy, 7.6, 4, 1.3, 1, 'glass');
      for (let k = 0; k < 4; k++) { const x = 8 + k * 2.4; V.cone(x, cy, 7.2, x - 1.6, cy, 9.8 - k * 0.4, 0.8, 0.2, 'red'); }
      for (const s of [-1, 1]) V.seg(13, cy + s * 11, 4.6, 21.5, cy + s * 11, 4.6, 0.55, 'metal');
      V.paint((x, y, z, xi, yi, zi) => V.is(xi, yi, zi, 'purp') && z >= 5 && Math.abs(Math.abs(y - cy) - 8) < 0.35, 'e_violet');
    },
    drone(V) {
      const c = 15, cz = 8;
      V.paint((x, y, z, xi, yi, zi) => V.is(xi, yi, zi, 'metal') && z > cz + 1.5 && Math.abs(Math.hypot(x - c, y - c) - 2.6) < 0.45, 'dark');
      V.paint((x, y, z, xi, yi, zi) => V.is(xi, yi, zi, 'gold') && z > cz + 0.5 && Math.floor((Math.atan2(y - c, x - c) + Math.PI) / (TAU / 40)) % 2 === 0, 'orange');
      V.seg(c - 1.5, c, cz + 4, c - 3, c, cz + 7, 0.35, 'metal');
    },
    mine(V) {
      V.paint((x, y, z, xi, yi, zi) => V.is(xi, yi, zi, 'red') && Math.floor((Math.atan2(y - 14, x - 14) + Math.PI) / (TAU / 24)) % 3 === 0, 'gold');
      V.paint((x, y, z, xi, yi, zi) => V.is(xi, yi, zi, 'metal') && hash3(xi >> 1, yi >> 1, zi >> 1, 12) < 0.06, 'white');
    },
    turret(V) {
      const c = 15;
      V.paint((x, y, z, xi, yi, zi) => V.is(xi, yi, zi, 'metal') && z < 2.6 && xi % 3 === 0 && (Math.abs(x - c) > 8 || Math.abs(y - c) > 8), 'dark');
      V.ell(c - 5.6, c, 7.2, 1, 1.4, 1, 'e_red');
      for (const s of [-1, 1]) V.seg(c - 3, c + s * 5, 4.5, c - 7, c + s * 7.5, 3.5, 0.45, 'gold');
    },
    boss(V) {
      const cy = 20;
      V.paint((x, y, z, xi, yi, zi) => V.is(xi, yi, zi, 'metal') && z > 3.6 && z < 5.4 && x > 30 && x < 47 && Math.abs(y - cy) > 13.1, 'e_cyan');
      for (let k = 0; k < 5; k++) V.seg(17 + k * 2, cy - 4, 15, 17 + k * 2, cy - 4, 16.6 + (k % 2), 0.35, 'metal');
      for (const s of [-1, 1]) {
        V.box(29, cy + s * 9 - 2, 9, 34, cy + s * 9 + 2, 10.5, 'metal');
        V.paint((x, y, z, xi, yi, zi) => V.is(xi, yi, zi, 'metal') && x > 29 && x < 34 && z > 10 && Math.abs(y - (cy + s * 9)) < 2 && xi % 2 === 0 && yi % 2 === 0, 'dark');
      }
      V.region([8, 15, cy - 1, cy + 1, 9, 15], (x, y, z) => Math.abs(y - cy) < 0.5 && x >= 8 + (z - 9) * 0.9 && x < 15, 'purp');
      V.paint((x, y, z, xi, yi, zi) => V.is(xi, yi, zi, 'purp') && z > 8.6 && x > 30 && x < 56 && Math.abs(y - cy) < 0.6, 'red');
    },
    jelly(V) {
      V.paint((x, y, z, xi, yi, zi) => V.is(xi, yi, zi, 'purp') && z > 14.5 && z < 16.5 && Math.floor((Math.atan2(y - 14, x - 14) + Math.PI) / (TAU / 28)) % 2 === 0, 'pink');
      V.paint((x, y, z, xi, yi, zi) => V.is(xi, yi, zi, 'pink') && z > 16 && Math.abs(Math.sin(Math.atan2(y - 14, x - 14) * 4)) < 0.12, 'purp');
    },
    asteroid(V) {
      for (let k = 0; k < 14; k++) {
        const u = hash3(k, 1, 2, 30) * TAU, v = hash3(k, 3, 4, 31) * 0.9 + 0.1, r = 0.9 + hash3(k, 5, 6, 32) * 1.2;
        const dx = Math.cos(u) * Math.sqrt(1 - v * v), dy = Math.sin(u) * Math.sqrt(1 - v * v), dz = v;
        V.ell(17 + dx * 12.5, 15 + dy * 10.5, 12 + dz * 9, r, r, r, '');
      }
      for (let k = 0; k < 5; k++) {
        const u = hash3(k, 7, 8, 33) * TAU;
        V.ell(17 + Math.cos(u) * 12, 15 + Math.sin(u) * 10, 9 + hash3(k, 1, 1, 34) * 6, 1.2, 1, 0.9, 'rock');
      }
    },
    crystal(V) {
      for (let k = 0; k < 9; k++) {
        const u = hash3(k, 2, 2, 40) * TAU, bx = 16 + Math.cos(u) * 8, by = 16 + Math.sin(u) * 7, bz = 9 + hash3(k, 3, 3, 41) * 3;
        const L = 2.5 + hash3(k, 4, 4, 42) * 3.5;
        V.cone(bx, by, bz, bx + Math.cos(u) * L * 0.7, by + Math.sin(u) * L * 0.7, bz + L * 0.7, 0.9, 0.25, 'cryst');
      }
    },
    cargo(V) {
      for (const x of [1.6, 28.4]) for (const y of [6, 12]) V.seg(x, y, 1.5, x, y, 10.5, 0.35, 'white');
      V.paint((x, y, z, xi, yi, zi) => V.is(xi, yi, zi, 'orange') && (x < 2.6 || x > 27.4) && yi % 3 === 0, 'dark');
      for (const [x, y] of [[2, 2], [28, 2], [2, 16], [28, 16]]) V.ell(x, y, 11.5, 1.2, 1.2, 0.8, 'gold');
      V.paint((x, y, z, xi, yi, zi) => V.is(xi, yi, zi, 'white') && Math.floor(x) % 4 === 0, 'red');
    },
    satellite(V) {
      V.torus(22, 12, 17.6, 6.3, 0.45, 'gold');
      for (const [x, y] of [[18, 8], [26, 8], [18, 16], [26, 16]]) V.cone(x, y, 5.5, x + (x < 22 ? -1 : 1) * 1.2, y + (y < 12 ? -1 : 1) * 1.2, 4.6, 0.7, 0.4, 'metal');
      V.box(20, 6.6, 7, 24, 8, 10, 'white');
    },
    wreck(V) {
      V.seg(22, 11, 6, 26.5, 9, 8.5, 0.5, 'gold');
      V.seg(22, 18, 5, 27, 20, 4, 0.45, 'metal');
      for (let k = 0; k < 3; k++) V.torus(14 + k * 3.5, 15, 7, 5.2, 0.35, 'metal', 'x');
    },
    station(V) {
      const c = 24;
      V.box(13, c - 0.8, 17.4, 35, c + 0.8, 17.9, 'metal');
      V.box(14, c - 3, 17.9, 21, c + 3, 18.3, 'glass'); V.box(27, c - 3, 17.9, 34, c + 3, 18.3, 'glass');
      V.paint((x, y, z, xi, yi, zi) => V.is(xi, yi, zi, 'glass') && z > 17.5 && (xi % 3 === 0), 'metal');
      V.paint((x, y, z, xi, yi, zi) => V.is(xi, yi, zi, 'hull') && Math.hypot(x - c, y - c) < 6 && z > 4 && z < 18 && Math.floor(z * 2) % 5 === 0, 'dark');
    },
    gate(V) {
      V.torus(17, 10, 17, 10.9, 0.55, 'gold', 'y');
      for (let k = 0; k < 8; k++) {
        const a = k * TAU / 8, b = a + TAU / 8;
        V.seg(17 + Math.cos(a) * 13, 12.4, 17 + Math.sin(a) * 13, 17 + Math.cos(b) * 13, 12.4, 17 + Math.sin(b) * 13, 0.4, 'red');
      }
    },
    capsule(V) {
      V.paint((x, y, z, xi, yi, zi) => V.is(xi, yi, zi, 'white') && Math.floor((Math.atan2(y - 8, x - 8) + Math.PI) / (TAU / 16)) % 2 === 0, 'hull');
    },
    planet(V) {
      const c = 28;
      V.paint((x, y, z) => Math.hypot(x - c, y - c, z - 15) < 12.6 && ((x - 33) / 3.2) ** 2 + ((y - 24) / 3.2) ** 2 + ((z - 18) / 1.6) ** 2 < 1, 'pink');
      V.paint((x, y, z) => { const r = Math.hypot(x - c, y - c); return r >= 16 && Math.hypot(x - c, y - c, z - 15) > 13; }, (x, y) => { const r = Math.hypot(x - c, y - c); return Math.floor(r * 2.2) % 3 === 0 ? 'gold' : undefined; });
    },
  };

  // torus around x (used by the wreck ribs)
  const baseTorus = Vol.prototype.torus;
  VolK.prototype.torus = function (cx, cy, cz, R, r, mat, axis) {
    if (axis === 'x') return this.region([cx - r, cx + r, cy - R - r, cy + R + r, cz - R - r, cz + R + r],
      (x, y, z) => (Math.hypot(y - cy, z - cz) - R) ** 2 + (x - cx) ** 2 <= r * r && z > cz - 1, mat);
    return baseTorus.call(this, cx, cy, cz, R, r, mat, axis);
  };

  // ---------- shading tables ----------
  const SPEC_N = { hull: 0.55, metal: 0.5, glass: 1.1, gold: 0.8, cryst: 1.0, white: 0.5, purp: 0.35, red: 0.3, orange: 0.25, pink: 0.45, green: 0.3, rock: 0.04, dark: 0.15, moon: 0.04, ice: 0.7, ocean: 0.9, sand: 0.08 };
  const TEX_N = { hull: 'panel', metal: 'panel', purp: 'panel', white: 'panel', orange: 'panel', rock: 'rock', cryst: 'cryst', gold: 'foil', moon: 'rock', sand: 'rock' };
  const PLANETS = { moon: 1, lava: 1, ice: 1, earth: 1, gas: 1, violet: 1, desert: 1, planet: 1 };
  const STEPS = 14, IMAX = 1.6;
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const LUT = [], SPEC = [], EMC = [], TEX = [];
  MATS.forEach((M, id) => {
    if (!M) return;
    if (M.emis) { EMC[id] = M.emis; return; }
    const r = PAL[M.name].map(hex);
    const stops = [[0, r[0].map(v => v * 0.4)], [0.22, r[0]], [0.5, r[1]], [0.85, r[2]], [1.15, r[3]], [1.6, r[3].map(v => v + (255 - v) * 0.7)]];
    const lut = [];
    for (let k = 0; k < STEPS; k++) {
      const I = k / (STEPS - 1) * IMAX;
      let j = 0; while (j < stops.length - 2 && I > stops[j + 1][0]) j++;
      const [a0, c0] = stops[j], [a1, c1] = stops[j + 1], t = Math.max(0, Math.min(1, (I - a0) / (a1 - a0)));
      lut.push(c0.map((v, q) => Math.round(v + (c1[q] - v) * t)));
    }
    LUT[id] = lut; SPEC[id] = SPEC_N[M.name] || 0; TEX[id] = TEX_N[M.name] || 'plain';
  });

  // ---------- bake: per slice, left half = material/AO/texture, right half = normal ----------
  const OFFS = [];
  for (let dz = -2; dz <= 2; dz++) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const d2 = dx * dx + dy * dy + dz * dz; if (d2 > 0 && d2 <= 6.25) OFFS.push([dx, dy, dz, 1 / Math.sqrt(d2)]);
  }
  function texture(t, x, y, z, nx, ny, nz) {
    if (t === 'panel') {
      const P = 10;
      if ((x % P === 0 && Math.abs(nx) < 0.7) || (y % P === 0 && Math.abs(ny) < 0.7) || (z % P === 0 && Math.abs(nz) < 0.7)) return 0.85;
      return 0.95 + hash3(Math.floor(x / P), Math.floor(y / P), Math.floor(z / P), 3) * 0.12;
    }
    if (t === 'rock') return 0.74 + 0.42 * fbm(x * 0.11, y * 0.11, z * 0.11, 17) + (hash3(x, y, z, 2) - 0.5) * 0.1;
    if (t === 'cryst') return 0.82 + hash3(x / 3 | 0, y / 3 | 0, z / 3 | 0, 5) * 0.38;
    if (t === 'foil') return 0.86 + hash3(x >> 1, y >> 1, z >> 1, 8) * 0.26;
    return 0.96 + hash3(x, y, z, 1) * 0.08;
  }
  function bakeLit(V) {
    const { w, h, d, m } = V, slices = [], glows = [];
    let count = 0, hasGlow = false;
    const filled = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < w && y < h && z < d && m[(z * h + y) * w + x] !== 0;
    for (let z = 0; z < d; z++) {
      let x0 = w, x1 = -1, y0 = h, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[(z * h + y) * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) { slices.push(null); glows.push(null); continue; }
      // 1px transparent border: the canvas anti-aliases the edges of each rotated quad,
      // and those blended pixels must never carry material ids
      const ix0 = x0, ix1 = x1, iy0 = y0, iy1 = y1;
      x0--; y0--; x1++; y1++;
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, img = new ImageData(bw * 2, bh), D = img.data;
      let gimg = null;
      for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) {
        const id = m[(z * h + y) * w + x]; if (!id) continue;
        const li = ((y - y0) * bw * 2 + (x - x0)) * 4, ni = li + bw * 4, M = MATS[id];
        let nx = 0, ny = 0, nz = 1, ao = 0.6;
        const exposed = !filled(x - 1, y, z) || !filled(x + 1, y, z) || !filled(x, y - 1, z) || !filled(x, y + 1, z) || !filled(x, y, z + 1) || !filled(x, y, z - 1) || !filled(x, y + 1, z + 1);
        if (exposed) {
          let gx = 0, gy = 0, gz = 0, f = 0;
          for (const o of OFFS) if (filled(x + o[0], y + o[1], z + o[2])) { gx -= o[0] * o[3]; gy -= o[1] * o[3]; gz -= o[2] * o[3]; f++; }
          const L = Math.hypot(gx, gy, gz);
          if (L > 1e-4) { nx = gx / L; ny = gy / L; nz = gz / L; }
          ao = Math.max(0.45, Math.min(1.15, 1 - (f / OFFS.length - 0.5) * 1.5));
        }
        if (M.emis) {
          if (!gimg) gimg = new ImageData(bw, bh);
          const gi = ((y - y0) * bw + (x - x0)) * 4;
          gimg.data[gi] = M.emis[0]; gimg.data[gi + 1] = M.emis[1]; gimg.data[gi + 2] = M.emis[2]; gimg.data[gi + 3] = 255;
        }
        const v = M.emis ? 1 : texture(TEX[id], x, y, z, nx, ny, nz);
        D[li] = id; D[li + 1] = Math.min(255, Math.round(ao * 200)); D[li + 2] = Math.min(255, Math.round(v * 170)); D[li + 3] = 255;
        D[ni] = Math.round((nx * 0.5 + 0.5) * 255); D[ni + 1] = Math.round((ny * 0.5 + 0.5) * 255); D[ni + 2] = Math.round((nz * 0.5 + 0.5) * 255); D[ni + 3] = 255;
      }
      const c = document.createElement('canvas'); c.width = bw * 2; c.height = bh; c.getContext('2d').putImageData(img, 0, 0);
      slices.push({ c, ox: x0, oy: y0, bw, bh }); count++;
      if (gimg) {
        const g = document.createElement('canvas'); g.width = bw; g.height = bh; g.getContext('2d').putImageData(gimg, 0, 0);
        glows.push({ c: g, ox: x0, oy: y0, bw, bh }); hasGlow = true;
      } else glows.push(null);
    }
    return { w, h, d, slices, glows, count, hasGlow };
  }

  // finer voxels for the ship and the fighters you see up close most often
  const KS = { ship: 3, raider: 3, raider_g: 3, interceptor: 3 };
  const FRAMES = { ship: 12, raider: 6, drone: 12, mine: 8, turret: 12, boss: 8, jelly: 12, station: 12, gate: 12, capsule: 12 };
  const FPS = { station: 4 };
  const MODELS = M1.map(m => {
    const n = Object.assign({}, m);
    delete n.frames; delete n.art; delete n.gart;
    n.lit = true; n.K = KS[m.id] || K; n.mw = m.w; n.mh = m.h; n.md = m.d;
    n.w = m.w * n.K; n.h = m.h * n.K; n.d = m.d * n.K; n.diag = Math.hypot(n.w, n.h);
    n.F = FRAMES[m.id] || 1; n.fps = FPS[m.id] || m.fps;
    return n;
  });
  function bakeModel(n) {
    const base = M1.find(m => m.id === n.id);
    n.frames = [];
    for (let f = 0; f < n.F; f++) {
      const V = new VolK(n.mw, n.mh, n.md, n.K);
      base.build(V, f, n.F);
      const det = DETAIL[n.id] || DETAIL[base.baseId];
      if (det) det(V, f, n.F);
      if (base.remap) window.SS.applyRemap(V, base.remap);
      n.frames.push(bakeLit(V));
    }
    n.slices = n.frames[0].count;
    n.hasGlow = n.frames.some(fr => fr.hasGlow);
  }

  window.SS2 = { MODELS, bakeModel, LUT, SPEC, EMC, STEPS, IMAX };
})();

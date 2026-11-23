// 3D view of the world. Every object is a sprite stack chosen for the angle you see it from
// (around it and from above or below), turned to match the camera, and sized by distance.
(function () {
  const { sub, add, mul, len, dot, norm, cross, basis, wrapA, clamp, PLANETS, DEFS, TAU } = W3;
  const D2R = Math.PI / 180;
  const cam = { p: [0, 0, 0], B: basis(0, 0), focal: 500, cx: 0, cy: 0, W: 0, H: 0 };
  function setCam(p, yaw, pitch, roll, W, H, focal, cy) { cam.p = p; cam.B = basis(yaw, pitch, roll); cam.W = W; cam.H = H; cam.focal = focal; cam.cx = W / 2; cam.cy = cy; }
  function proj(p) {
    const d = sub(p, cam.p), z = dot(d, cam.B.f); if (z < 3) return null;
    const x = dot(d, cam.B.r), y = dot(d, cam.B.u), k = cam.focal / z;
    return { x: cam.cx + x * k, y: cam.cy - y * k, z, k };
  }
  function projDir(v) { const z = dot(v, cam.B.f); if (z <= 0.05) return null; const k = cam.focal / z; return { x: cam.cx + dot(v, cam.B.r) * k, y: cam.cy - dot(v, cam.B.u) * k, k }; }
  const ELEVS = [10, 20, 30, 45, 60, 75, 90];
  const bucket = deg => { let b = ELEVS[0]; for (const e of ELEVS) if (Math.abs(e - deg) < Math.abs(b - deg)) b = e; return b; };

  // draws model `mid` at world position p, with its own forward/up vectors, `s` = world units per model unit
  function drawObj(ctx, mid, fi, p, fwd, up, s, opt) {
    const pr = proj(p); if (!pr) return null;
    const size = pr.k * s;
    const toC = norm(sub(cam.p, p));
    const e = Math.asin(clamp(dot(toC, up), -1, 1));
    const left = cross(up, fwd), a = Math.atan2(dot(toC, left), dot(toC, fwd));
    let ang = Math.PI / 2 + a;
    const roll = Math.atan2(dot(up, cam.B.r), dot(up, cam.B.u));
    const flip = e < 0; if (flip) ang = -ang;
    const ok = Stack.draw(ctx, mid, fi, ang, bucket(Math.abs(e) / D2R), pr.x, pr.y, size / 2, Object.assign({ center: true, roll, flip }, opt));
    if (!ok) { ctx.fillStyle = 'rgba(200,210,255,0.6)'; const r = Math.max(2, size * 8); ctx.fillRect(pr.x - r / 2, pr.y - r / 2, r, r); }
    return pr;
  }

  // ---------- sky: stars, nebula and far (fake) planets that never get closer ----------
  const SKY = (() => { const r = W3.rngOf(77), s = []; for (let i = 0; i < 700; i++) { const z = r() * 2 - 1, a = r() * TAU, q = Math.sqrt(1 - z * z); s.push({ v: [Math.cos(a) * q, Math.sin(a) * q, z], b: r(), z: r() }); } return s; })();
  const NEB = [{ v: norm([1, 0.4, 0.3]), c: 'rgba(120,60,190,0.22)', s: 0.9 }, { v: norm([-0.6, -0.8, -0.2]), c: 'rgba(40,110,190,0.2)', s: 1.1 }, { v: norm([0.1, -0.2, 1]), c: 'rgba(190,70,120,0.14)', s: 0.8 }, { v: norm([-0.3, 0.9, -0.6]), c: 'rgba(60,160,150,0.12)', s: 0.9 }];
  const FAKE = [{ m: 'gas', v: norm([0.8, -0.5, 0.35]), a: 0.09 }, { m: 'violet', v: norm([-0.7, 0.6, 0.2]), a: 0.04 }, { m: 'moon', v: norm([0.2, 0.9, -0.3]), a: 0.025 }, { m: 'ice', v: norm([-0.4, -0.6, 0.65]), a: 0.035 }, { m: 'lava', v: norm([0.5, 0.2, -0.8]), a: 0.03 }];
  function drawSky(ctx, t) {
    const { W, H, focal } = cam;
    ctx.fillStyle = '#05060d'; ctx.fillRect(0, 0, W, H);
    for (const n of NEB) { const p = projDir(n.v); if (!p) continue; const r = focal * n.s; const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); g.addColorStop(0, n.c); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2); }
    for (const s of SKY) {
      const p = projDir(s.v); if (!p || p.x < 0 || p.y < 0 || p.x > W || p.y > H) continue;
      ctx.fillStyle = s.b > 0.95 ? '#ffd9a0' : s.b > 0.85 ? '#a8e8ff' : `rgba(220,225,255,${0.3 + s.z * 0.6})`;
      const sz = s.z > 0.85 ? 2 : 1; ctx.fillRect(Math.round(p.x), Math.round(p.y), sz, sz);
    }
    for (const f of FAKE) {
      const p = projDir(f.v); if (!p) continue;
      const pl = PLANETS.find(x => x.m === f.m), px = focal * f.a * 2;
      if (p.x < -px || p.y < -px || p.x > W + px || p.y > H + px) continue;
      Stack.draw(ctx, f.m, 0, t * 0.01, 30, p.x, p.y, px / (pl.mr * 2) / 2 * 1.05, { center: true, alpha: 0.75, noGlow: true });
    }
  }

  // ---------- motion dust ----------
  const dust = [];
  function drawDust(ctx, vel, extra) {
    while (dust.length < 110) dust.push(null);
    const sp = len(vel);
    ctx.lineCap = 'round';
    for (let i = 0; i < dust.length; i++) {
      let d = dust[i];
      const rel = d && sub(d, cam.p);
      if (!d || len(rel) > 650 || dot(rel, cam.B.f) < 5) {
        const f = 80 + Math.random() * 560, x = (Math.random() - 0.5) * f * 1.8, y = (Math.random() - 0.5) * f * 1.4;
        dust[i] = add(cam.p, add(add(mul(cam.B.f, f), mul(cam.B.r, x)), mul(cam.B.u, y))); continue;
      }
      const a = proj(d), b = proj(sub(d, mul(vel, 0.05 * (extra || 1)))); if (!a) continue;
      const al = clamp(60 / a.z, 0.08, 0.8);
      ctx.strokeStyle = `rgba(190,210,255,${al})`; ctx.lineWidth = clamp(a.k * 1.2, 1, 3);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b && sp > 20 ? b.x : a.x + 0.5, b && sp > 20 ? b.y : a.y + 0.5); ctx.stroke();
    }
  }

  function glow(ctx, x, y, r, col) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r * 2.6, y - r * 2.6, r * 5.2, r * 5.2);
    ctx.fillStyle = '#fff'; const c = Math.max(1, r * 0.7); ctx.fillRect(x - c / 2, y - c / 2, c, c);
    ctx.restore();
  }
  const frameOf = (id, t, seed) => { const s = Stack.size(id); return s && s.F > 1 ? Math.floor(t * s.fps + seed * 3.7) % s.F : 0; };

  // ---------- the scene ----------
  function drawScene(ctx, st, t, opt) {
    const list = [];
    // planets (real ones get bigger as you approach)
    PLANETS.forEach((pl, i) => {
      const pr = proj(pl.p); if (!pr) return;
      const rad = pr.k * pl.R; if (rad < 0.6) return;
      if (pr.x + rad < -50 || pr.x - rad > cam.W + 50 || pr.y + rad < -50 || pr.y - rad > cam.H + 50) return;
      list.push({ z: pr.z + pl.R * 0.5, draw: () => {
        const g = ctx.createRadialGradient(pr.x, pr.y, rad * 0.85, pr.x, pr.y, rad * 1.35);
        g.addColorStop(0, 'rgba(120,180,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(pr.x - rad * 1.4, pr.y - rad * 1.4, rad * 2.8, rad * 2.8);
        drawObj(ctx, pl.m, 0, pl.p, W3.fwdOf(t * 0.004 + i, 0), [0, 0, 1], pl.R / pl.mr, { noGlow: rad > 400 });
      } });
    });
    for (const e of st.ents.values()) {
      if (e.dead) continue;
      if (st.rep && !e.still && st.T - e.seen > 1) continue;
      const d = sub(e.p, cam.p); const far = 4200 + e.r * 20;
      if (Math.abs(d[0]) > far || Math.abs(d[1]) > far || Math.abs(d[2]) > far) continue;
      const z = dot(d, cam.B.f); if (z < 3) continue;
      const k = cam.focal / z, sx = cam.cx + dot(d, cam.B.r) * k, sy = cam.cy - dot(d, cam.B.u) * k, rr = e.r * k * 1.6 + 4;
      if (sx < -rr || sx > cam.W + rr || sy < -rr || sy > cam.H + rr) continue;
      list.push({ z, draw: () => {
        const yaw = e.still ? e.yaw + e.spin * st.T : e.yaw;
        const fwd = W3.fwdOf(yaw, e.still ? 0 : (e.pitch || 0) * 0.5);
        const flash = FX3.flashE.get(e.id);
        const pr = drawObj(ctx, e.d.m, frameOf(e.d.m, t, e.id), e.p, fwd, [0, 0, 1], e.s, { flash: flash ? Math.min(1, flash * 6) : 0 });
        if (pr && (e.frz || e.stun)) { ctx.strokeStyle = e.frz ? 'rgba(160,230,255,0.8)' : 'rgba(255,240,120,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pr.x, pr.y, e.r * pr.k * 1.2, 0, TAU); ctx.stroke(); }
        if (pr && e.arm) { glow(ctx, pr.x, pr.y, Math.max(4, e.r * pr.k), 'rgba(255,60,60,0.9)'); }
        if (opt.onEnt && pr) opt.onEnt(e, pr);
      } });
    }
    // the ship itself (third-person view only)
    if (opt.ship) {
      const sh = st.ship, B = basis(sh.yaw, sh.pitch, sh.roll), pr = proj(sh.p);
      if (pr) list.push({ z: pr.z, draw: () => {
        drawObj(ctx, 'ship', frameOf('ship', t, 0), sh.p, B.f, B.u, 1, { alpha: FX3.hurt > 0 && Math.floor(t * 20) % 2 ? 0.5 : 1 });
        if (sh.flags & W3.F.SHIELD || FX3.block > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(127,246,255,${0.5 + FX3.block})`; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(80,180,255,0.1)'; ctx.beginPath(); ctx.arc(pr.x, pr.y, 30 * pr.k, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore(); }
        if (sh.flags & W3.F.BOOST) { const bk = proj(add(sh.p, mul(B.f, -26))); if (bk) glow(ctx, bk.x, bk.y, 6 * pr.k + 3, 'rgba(255,170,80,0.9)'); }
      } });
    }
    list.sort((a, b) => b.z - a.z);
    for (const o of list) o.draw();
    // spore clouds
    for (const c of st.clouds) { const p = proj(c.p); if (!p) continue; ctx.fillStyle = 'rgba(160,230,90,0.16)'; ctx.beginPath(); ctx.arc(p.x, p.y, c.r * p.k, 0, TAU); ctx.fill(); }
    // projectiles
    for (const s of st.shots.values()) { const p = proj(s.p); if (p) glow(ctx, p.x, p.y, clamp(p.k * 5, 1.5, 18), s.kind ? 'rgba(255,90,220,0.95)' : 'rgba(255,150,60,0.95)'); }
    ctx.lineCap = 'round';
    for (const b of st.bul.values()) {
      const a = proj(b.p), c = proj(sub(b.p, mul(b.v, 0.025))); if (!a) continue;
      ctx.strokeStyle = b.kind === 2 ? '#bff6ff' : b.kind === 1 ? '#ffe68a' : '#7ff6ff'; ctx.lineWidth = clamp(a.k * 3, 1.5, 6);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c ? c.x : a.x, c ? c.y : a.y); ctx.stroke();
    }
    FX3.drawWorld(ctx, proj, opt);
  }

  window.R3 = { cam, setCam, proj, projDir, drawObj, drawSky, drawDust, drawScene, glow, frameOf };
})();

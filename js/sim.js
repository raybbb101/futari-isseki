// Game rules. The host runs World (the authority for enemies, bullets, damage, energy).
// The guest runs Replica (interpolates the host's snapshots). Each player's own controls are
// simulated on their own device: the pilot moves the ship, the gunner aims and checks combos.
(function () {
  const TAU = Math.PI * 2;
  const C = { SCROLL: 40, BAND: 118, LEFT: -205, RIGHT: 190, ARC: 1.31, RANGE: 430, SHIP_R: 9, MAXHP: 12 };
  const F = { DODGE: 1, SHIELD: 2, BOOST: 4 };
  const TYPES = {
    asteroid: { m: 'asteroid', r: 15, dmg: 2 },
    crystal: { m: 'crystal', r: 13, hp: 1, combo: 2, dmg: 2, drop: 'capsule' },
    wreck: { m: 'wreck', r: 15, dmg: 2 },
    cargo: { m: 'cargo', r: 12, hp: 1, combo: 2, dmg: 1, drop: 'energy' },
    mine: { m: 'mine', r: 11, hp: 1, combo: 1, dmg: 3, boom: 1 },
    drone: { m: 'drone', r: 13, hp: 1, combo: 2, dmg: 1 },
    raider: { m: 'raider', r: 13, hp: 1, combo: 3, dmg: 1 },
    turret: { m: 'turret', r: 14, hp: 2, combo: 3, dmg: 1 },
    jelly: { m: 'jelly', r: 13, hp: 2, combo: 3, dmg: 1 },
    capsule: { m: 'capsule', r: 9, pick: 1 },
    boss: { m: 'boss', r: 34, dmg: 2 },
    bpart: { m: null, r: 6, hp: 2, combo: 4 },
    bcore: { m: null, r: 8, hp: 4, combo: 5 },
    gate: { m: 'gate', r: 22, goal: 1 },
  };
  const JP = { crystal: '結晶', cargo: 'コンテナ', mine: '機雷', drone: 'ドローン', raider: 'レイダー', turret: '砲台', jelly: '宇宙クラゲ', bpart: '戦艦の砲台', bcore: '戦艦の艦橋' };
  const ARROWS = ['UP', 'DOWN', 'LEFT', 'RIGHT'], FACES = ['A', 'B', 'X', 'Y'];
  const wrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  function rngOf(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // combos: up/down/left/right and A/B/X/Y only (no diagonals); always end on a face button
  function genCombo(rng, len) {
    const c = [];
    for (let i = 0; i < len; i++) {
      let k, guard = 0;
      do { k = (i === len - 1 || rng() < 0.3) ? FACES[(rng() * 4) | 0] : ARROWS[(rng() * 4) | 0]; }
      while (guard++ < 10 && c.length && c[c.length - 1] === k);
      c.push(k);
    }
    return c;
  }
  function inArc(sh, e, camx) {
    const dx = e.x - sh.x, dy = e.y - sh.y, d = Math.hypot(dx, dy);
    if (d > C.RANGE || d < 3 || e.x > camx + C.RIGHT + 45) return false;
    return Math.abs(wrap(Math.atan2(dy, dx) - sh.ang)) <= C.ARC;
  }
  function effCombo(e, power) {
    const c = e.combos[Math.max(0, Math.min(e.combos.length - 1, e.maxHp - e.hp))];
    return power > 0 && c.length > 1 ? c.slice(1) : c;
  }

  // ---------- stage script ----------
  function buildScript(w) {
    const r = w.rng, L = [], at = (t, f) => L.push({ t, f });
    const X = () => w.cam.x + C.RIGHT + 60, Y = (m = 100) => (r() * 2 - 1) * m;
    at(1, () => w.say('ふたり号、発進！', 2.5));
    at(3.6, () => w.say('パイロットはよける、ガンナーはコンボで撃つ！', 3.5));
    for (let t = 6; t < 92; t += 1.7 + r() * 1.3) {
      if (t > 27 && t < 33) continue;
      at(t, () => w.spawn('asteroid', X() + r() * 40, Y(112), { vx: (r() - 0.5) * 14, vy: (r() - 0.5) * 8, spin: (r() - 0.5) * 0.8, ang: r() * TAU }));
    }
    for (const t of [9, 14, 19, 24]) at(t, () => { for (let k = 0; k < 2; k++) { const y = Y(85); w.spawn('drone', X() + k * 30, y, { off: 30 + r() * 130, stay: 7 + r() * 3, y0: y }); } });
    at(27, () => w.say('機雷に注意！ ボタン1つで撃てる', 3));
    for (let t = 28; t < 50; t += 2.3) at(t, () => w.spawn('mine', X(), Y(108), { ang: r() * TAU }));
    for (const t of [31, 37, 43, 48]) at(t, () => { const y = Y(65), n = r() < 0.5 ? 3 : 2; for (let k = 0; k < n; k++) w.spawn('raider', X() + k * 34, y + k * 14, { ph: k * 0.7 }); });
    for (const t of [52, 60, 67]) at(t, () => w.spawn('turret', X(), Y(88)));
    at(55, () => w.spawn('wreck', X(), Y(80), { spin: 0.15, ang: r() * TAU }));
    for (const t of [57, 69]) at(t, () => w.spawn('cargo', X(), Y(88), { spin: 0.3, ang: r() * TAU }));
    at(57.5, () => w.say('コンテナを撃つとエネルギー回復', 2.5));
    at(63, () => w.spawn('crystal', X(), Y(80), { spin: 0.2 }));
    at(63.5, () => w.say('結晶を撃つとパワーアップが出る', 2.5));
    for (const t of [73, 79, 85]) at(t, () => { for (let k = 0; k < 2; k++) w.spawn('jelly', X() + k * 40, Y(100)); });
    for (const t of [75, 82, 88]) at(t, () => { const y = Y(80); w.spawn('drone', X(), y, { off: 80 + r() * 90, stay: 6, y0: y }); });
    at(92.5, () => w.say('大きな反応が近づいている…', 3));
    at(97, () => {
      w.phase = 'boss';
      const b = w.spawn('boss', w.cam.x + 430, 0, { ang: Math.PI });
      for (const [ox, oy] of [[0, 0], [-12, 0], [-5, 8], [-5, -8]]) w.spawn('bpart', b.x + ox, b.y + oy, { parent: b.id, ox, oy });
      w.say('戦艦ドレッド！ まず4つの砲台をこわせ', 3.5);
    });
    return L.sort((a, b) => a.t - b.t);
  }

  // ---------- host world ----------
  class World {
    constructor(seed) {
      this.rng = rngOf(seed); this.T = 0; this.cam = { x: 0 }; this.phase = 'play';
      this.hp = C.MAXHP; this.en = 100; this.power = 0; this.inv = 0; this.paused = false;
      this.ship = { x: -110, y: 0, ang: 0, flags: 0, vx: C.SCROLL, vy: 0 };
      this.turret = { ang: 0, tg: 0, prog: 0 };
      this.ents = new Map(); this.bullets = new Map(); this.nid = 1; this.bid = 1; this.out = [];
      this.stats = { kills: 0, hits: 0, combos: 0, miss: 0, specials: 0 };
      this.script = buildScript(this); this.si = 0;
    }
    get scrolling() { return this.phase === 'play' || this.phase === 'gate'; }
    ev(...a) { this.out.push(a); }
    say(text, dur = 2.5) { this.ev('msg', text, dur); }
    spawn(type, x, y, o = {}) {
      const T = TYPES[type];
      const e = Object.assign({ id: this.nid++, type, x, y, vx: 0, vy: 0, ang: Math.PI, spin: 0, hp: T.hp || 0, maxHp: T.hp || 0, r: T.r, age: 0, sT: 1.2 + this.rng() * 1.4, ph: this.rng() * TAU }, o);
      if (T.combo) { e.combos = []; for (let i = 0; i < e.maxHp; i++) e.combos.push(genCombo(this.rng, T.combo + i)); }
      this.ents.set(e.id, e);
      this.ev('spawn', e.id, type, e.combos || 0, e.maxHp, e.parent || 0);
      return e;
    }
    fire(x, y, ang, sp, kind = 0) {
      const id = this.bid++, vx = Math.cos(ang) * sp + (this.scrolling ? C.SCROLL : 0), vy = Math.sin(ang) * sp;
      this.bullets.set(id, { id, x, y, vx, vy, t: 0, kind });
      this.ev('bul', id, Math.round(x), Math.round(y), Math.round(vx * 10) / 10, Math.round(vy * 10) / 10, kind);
    }
    aim(e) { return Math.atan2(this.ship.y - e.y, this.ship.x - e.x); }
    onScreen(e) { return e.x < this.cam.x + C.RIGHT + 10 && e.x > this.cam.x + C.LEFT; }
    shoot(e, dt, every, fn) { if (!this.onScreen(e)) return; e.sT -= dt; if (e.sT <= 0) { e.sT = every * (0.8 + this.rng() * 0.4); fn(); } }

    step(dt) {
      if (this.paused || this.phase === 'over' || this.phase === 'clear') return;
      this.T += dt;
      if (this.scrolling) this.cam.x += C.SCROLL * dt;
      while (this.si < this.script.length && this.script[this.si].t <= this.T) { const s = this.script[this.si++]; if (this.phase === 'play') s.f(); }
      const sh = this.ship, f = sh.flags;
      let drain = 0; if (f & F.SHIELD) drain += 32; if (f & F.BOOST) drain += 22;
      this.en = drain ? Math.max(0, this.en - drain * dt) : Math.min(100, this.en + 9 * dt);
      this.power = Math.max(0, this.power - dt); this.inv = Math.max(0, this.inv - dt);
      for (const e of [...this.ents.values()]) {
        if (!this.ents.has(e.id)) continue;
        e.age += dt; this.think(e, dt);
        e.x += e.vx * dt; e.y += e.vy * dt; e.ang += e.spin * dt;
        if (e.x < this.cam.x - 330 || Math.abs(e.y) > 300) { this.ents.delete(e.id); this.ev('del', e.id); continue; }
        const T = TYPES[e.type], d = Math.hypot(e.x - sh.x, e.y - sh.y);
        if (T.pick && d < e.r + 12) { this.power = 12; this.ents.delete(e.id); this.ev('del', e.id); this.ev('power'); this.say('パワーアップ！ 12秒間コンボが短くなる', 2.5); continue; }
        if (T.goal && this.phase === 'gate' && d < e.r + 6) { this.finish(true); return; }
        if (e.hitT > 0) e.hitT -= dt;
        if (T.dmg && d < e.r + C.SHIP_R && !(e.hitT > 0)) {
          if (T.boom) { this.hurt(T.dmg); this.kill(e, false); continue; }
          e.hitT = 1; this.hurt(T.dmg);
        }
      }
      for (const b of [...this.bullets.values()]) {
        b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.t > 8 || b.x < this.cam.x - 300 || b.x > this.cam.x + 340 || Math.abs(b.y) > 220) { this.bullets.delete(b.id); continue; }
        if (Math.hypot(b.x - sh.x, b.y - sh.y) < C.SHIP_R + 3 && !(sh.flags & F.DODGE)) { this.bullets.delete(b.id); this.ev('bdel', b.id); this.hurt(1); }
      }
    }
    think(e, dt) {
      const S = this.scrolling ? C.SCROLL : 0, cam = this.cam.x, sh = this.ship;
      switch (e.type) {
        case 'drone': {
          const tx = cam + e.off;
          e.vx = e.age < e.stay ? S + clamp((tx - e.x) * 1.4, -90, 40) : S - 110;
          e.vy = Math.sin(e.age * 1.4 + e.ph) * 26 + ((e.y0 || 0) - e.y) * 0.5;
          e.ang = Math.PI + Math.sin(e.age) * 0.3;
          this.shoot(e, dt, 2.4, () => this.fire(e.x, e.y, this.aim(e), 85));
          break;
        }
        case 'raider':
          e.vx = S - 80; e.vy = Math.cos(e.age * 1.8 + e.ph) * 55; e.ang = Math.atan2(e.vy, -80);
          this.shoot(e, dt, 1.8, () => this.fire(e.x, e.y, this.aim(e), 95));
          break;
        case 'mine': e.spin = 0.6; break;
        case 'turret': {
          e.ang += clamp(wrap(this.aim(e) - e.ang), -dt * 2, dt * 2);
          this.shoot(e, dt, 2.6, () => { for (const o of [-0.28, 0, 0.28]) this.fire(e.x, e.y, e.ang + o, 80); });
          break;
        }
        case 'jelly':
          e.vx = S - 22; e.vy += ((sh.y - e.y) * 0.6 - e.vy) * dt * 0.8 + Math.sin(e.age * 2 + e.ph) * 20 * dt; e.ang += dt * 0.4;
          break;
        case 'capsule': e.vx = S - 28; e.vy = Math.sin(e.age * 2) * 10; e.ang += dt; break;
        case 'gate': e.vx = e.x < cam + 120 ? S : 0; break;
        case 'boss': {
          if (!e.ready) { e.vx = Math.max(-75, (cam + 150 - e.x) * 1.2); if (e.x < cam + 158) { e.ready = true; this.say('砲台はコンボ4つ、2回ずつ', 2.5); } }
          else e.vx = (cam + 150 + Math.sin(e.age * 0.3) * 30 - e.x) * 1.5;
          e.vy = (Math.sin(e.age * 0.45) * 70 - e.y) * 0.8; e.ang = Math.PI;
          break;
        }
        case 'bpart': case 'bcore': {
          const b = this.ents.get(e.parent); if (!b) { this.ents.delete(e.id); this.ev('del', e.id); break; }
          e.x = b.x + e.ox; e.y = b.y + e.oy; e.vx = b.vx; e.vy = b.vy; e.ang = b.ang;
          if (b.ready) this.shoot(e, dt, e.type === 'bcore' ? 2.6 : 2.3, () => {
            if (e.type === 'bcore') { for (let k = 0; k < 12; k++) this.fire(e.x, e.y, k * TAU / 12 + e.age, 70, 1); this.fire(e.x, e.y, this.aim(e), 110, 1); }
            else this.fire(e.x, e.y, this.aim(e), 100, 1);
          });
          break;
        }
      }
    }
    hurt(n) {
      const sh = this.ship;
      if (sh.flags & F.DODGE || this.inv > 0) return;
      if ((sh.flags & F.SHIELD) && this.en > 0) { this.en = Math.max(0, this.en - 12 * n); this.ev('block', Math.round(sh.x), Math.round(sh.y)); return; }
      this.hp -= n; this.inv = 0.9; this.stats.hits++;
      this.ev('hurt', n, Math.round(sh.x), Math.round(sh.y));
      if (this.hp <= 0) { this.hp = 0; this.finish(false); }
    }
    kill(e, credit = true) {
      if (!this.ents.has(e.id)) return;
      this.ents.delete(e.id);
      const T = TYPES[e.type];
      this.ev('kill', e.id, Math.round(e.x), Math.round(e.y), e.type === 'boss' ? 3 : T.boom ? 2 : 1);
      if (!credit) return;
      this.stats.kills++;
      if (T.drop === 'energy') { this.en = Math.min(100, this.en + 50); this.say('エネルギー回復！', 1.8); }
      if (T.drop === 'capsule') this.spawn('capsule', e.x, e.y);
      if (e.type === 'bpart' && ![...this.ents.values()].some(o => o.type === 'bpart')) {
        const b = this.ents.get(e.parent);
        if (b) { this.spawn('bcore', b.x + 16, b.y, { parent: b.id, ox: 16, oy: 0 }); this.say('砲台ぜんぶ撃破！ 艦橋をねらえ', 3); }
      }
      if (e.type === 'bcore') {
        const b = this.ents.get(e.parent); if (b) this.kill(b, false);
        this.phase = 'gate'; this.say('戦艦をたおした！ ワープゲートへ飛びこめ', 4);
        this.spawn('gate', this.cam.x + 250, 0, { ang: Math.PI / 2 });
      }
    }
    damage(e) {
      if (!e || !e.combos || !this.ents.has(e.id)) return;
      e.hp--; this.ev('zap', e.id, Math.round(e.x), Math.round(e.y));
      if (e.hp <= 0) this.kill(e); else this.ev('dmg', e.id, e.hp);
    }
    finish(win) {
      if (this.phase === 'over' || this.phase === 'clear') return;
      this.phase = win ? 'clear' : 'over';
      this.ev('end', win ? 1 : 0, Object.assign({ time: Math.round(this.T), hp: this.hp }, this.stats));
    }
    handle(m) {
      switch (m.t) {
        case 'p': { const s = this.ship; s.x = m.x; s.y = m.y; s.vx = m.vx; s.vy = m.vy; s.ang = m.a / 100; s.flags = m.f; break; }
        case 'g': this.turret.ang = m.ta / 100; this.turret.tg = m.tg; this.turret.prog = m.pr; break;
        case 'hit': this.stats.combos++; this.damage(this.ents.get(m.id)); break;
        case 'miss': this.stats.miss++; break;
        case 'sp':
          if (this.en >= 60) {
            this.en -= 60; this.stats.specials++; this.ev('special');
            for (const e of [...this.ents.values()]) if (e.combos && inArc(this.ship, e, this.cam.x)) this.damage(e);
          }
          break;
        case 'ping': this.ev('ping', m.who, Math.round(m.x), Math.round(m.y)); break;
        case 'pause': if (this.phase !== 'over' && this.phase !== 'clear') { this.paused = !!m.on; this.ev('pause', this.paused ? 1 : 0); } break;
      }
    }
    snap() {
      const s = this.ship;
      return {
        t: 's', T: Math.round(this.T * 100) / 100, cx: Math.round(this.cam.x * 10) / 10, hp: this.hp, en: Math.round(this.en), ph: this.phase, pw: Math.round(this.power * 10) / 10,
        sh: [Math.round(s.x), Math.round(s.y), Math.round(s.ang * 100), s.flags],
        tu: [Math.round(this.turret.ang * 100), this.turret.tg, this.turret.prog],
        e: [...this.ents.values()].map(e => [e.id, Math.round(e.x), Math.round(e.y), Math.round(e.ang * 100), e.hp]),
      };
    }
  }

  // ---------- guest replica ----------
  class Replica {
    constructor() {
      this.T = 0; this.cam = { x: 0 }; this.phase = 'play'; this.hp = C.MAXHP; this.en = 100; this.power = 0; this.paused = false;
      this.ship = { x: -110, y: 0, ang: 0, flags: 0, vx: C.SCROLL, vy: 0 }; this.shipT = null;
      this.turret = { ang: 0, tg: 0, prog: 0 }; this.turretT = null;
      this.ents = new Map(); this.bullets = new Map();
    }
    get scrolling() { return this.phase === 'play' || this.phase === 'gate'; }
    event(ev) {
      const [k] = ev;
      if (k === 'spawn') { const [, id, type, combos, maxHp, parent] = ev; this.ents.set(id, { id, type, combos: combos || null, maxHp, hp: maxHp, parent, x: NaN, y: NaN, ang: Math.PI }); }
      else if (k === 'bul') { const [, id, x, y, vx, vy, kind] = ev; this.bullets.set(id, { id, x, y, vx, vy, t: 0, kind }); }
      else if (k === 'bdel') this.bullets.delete(ev[1]);
      else if (k === 'kill' || k === 'del') this.ents.delete(ev[1]);
      else if (k === 'dmg') { const e = this.ents.get(ev[1]); if (e) e.hp = ev[2]; }
      else if (k === 'pause') this.paused = !!ev[1];
      else if (k === 'end') this.phase = ev[1] ? 'clear' : 'over';
    }
    snap(m, mine) {
      this.T = m.T; this.cam.x = m.cx; this.hp = m.hp; this.en = m.en; this.phase = m.ph; this.power = m.pw;
      if (mine !== 'pilot') this.shipT = { x: m.sh[0], y: m.sh[1], ang: m.sh[2] / 100, flags: m.sh[3] };
      if (mine !== 'gunner') { this.turretT = m.tu[0] / 100; this.turret.tg = m.tu[1]; this.turret.prog = m.tu[2]; }
      const seen = new Set();
      for (const [id, x, y, a, hp] of m.e) {
        let e = this.ents.get(id);
        if (!e) { e = { id, type: '?', combos: null, maxHp: hp, hp, x: NaN, y: NaN, ang: a / 100 }; this.ents.set(id, e); }
        if (isNaN(e.x)) { e.x = x; e.y = y; e.ang = a / 100; }
        e.fx = e.x; e.fy = e.y; e.fa = e.ang; e.tx = x; e.ty = y; e.ta = a / 100; e.lt = 0; e.hp = hp;
        seen.add(id);
      }
      for (const id of [...this.ents.keys()]) if (!seen.has(id)) this.ents.delete(id);
    }
    step(dt) {
      if (this.paused || this.phase === 'over' || this.phase === 'clear') return;
      this.T += dt;
      if (this.scrolling) this.cam.x += C.SCROLL * dt;
      for (const e of this.ents.values()) {
        if (e.tx === undefined) continue;
        e.lt = Math.min(1.6, e.lt + dt / 0.1);
        const k = Math.min(1, e.lt), ex = e.lt > 1 ? (e.lt - 1) : 0;
        e.x = e.fx + (e.tx - e.fx) * k + (e.tx - e.fx) * ex; e.y = e.fy + (e.ty - e.fy) * k + (e.ty - e.fy) * ex;
        e.ang = e.fa + wrap(e.ta - e.fa) * k;
      }
      for (const b of [...this.bullets.values()]) {
        b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.t > 8 || b.x < this.cam.x - 300 || b.x > this.cam.x + 340 || Math.abs(b.y) > 220) this.bullets.delete(b.id);
      }
      if (this.shipT) {
        const s = this.ship, t = this.shipT, k = Math.min(1, dt * 14);
        s.x += (t.x - s.x) * k + (this.scrolling ? C.SCROLL * dt : 0) * (1 - k); s.y += (t.y - s.y) * k; s.ang += wrap(t.ang - s.ang) * k; s.flags = t.flags;
        t.x += (this.scrolling ? C.SCROLL * dt : 0);
      }
      if (this.turretT !== null) this.turret.ang += wrap(this.turretT - this.turret.ang) * Math.min(1, dt * 12);
    }
  }

  // ---------- pilot controls (human or bot input) ----------
  class PilotCtl {
    constructor() { this.cd = 0; this.dodge = 0; this.vx = 0; this.vy = 0; this.pingCd = 0; }
    update(dt, st, inp) {
      if (st.paused || st.phase === 'over' || st.phase === 'clear') { st.ship.flags = 0; return null; }
      const sh = st.ship, scroll = st.scrolling ? C.SCROLL : 0, en = st.en > 1;
      const boost = inp.boost && en, shield = inp.shield && en, sp = boost ? 175 : 118;
      this.vx += (inp.x * sp - this.vx) * Math.min(1, dt * 8); this.vy += (inp.y * sp - this.vy) * Math.min(1, dt * 8);
      this.cd -= dt; this.pingCd -= dt;
      let ev = null;
      if (inp.dodge && this.cd <= 0) { this.dodge = 0.45; this.cd = 1.1; ev = 'dodge'; }
      if (this.dodge > 0) this.dodge -= dt;
      const kick = this.dodge > 0 ? 1.5 : 1;
      sh.x += (scroll + this.vx * kick) * dt; sh.y += this.vy * kick * dt;
      sh.x = clamp(sh.x, st.cam.x + C.LEFT + 15, st.cam.x + C.RIGHT - 15); sh.y = clamp(sh.y, -C.BAND, C.BAND);
      const ta = clamp(Math.atan2(this.vy, 95 + this.vx * 0.5), -0.55, 0.55);
      sh.ang += (ta - sh.ang) * Math.min(1, dt * 6);
      sh.vx = scroll + this.vx; sh.vy = this.vy;
      sh.flags = (this.dodge > 0 ? F.DODGE : 0) | (shield ? F.SHIELD : 0) | (boost ? F.BOOST : 0);
      if (inp.ping && this.pingCd <= 0) { this.pingCd = 1; ev = 'ping'; }
      return ev;
    }
    msg(sh) { return { t: 'p', x: Math.round(sh.x * 10) / 10, y: Math.round(sh.y * 10) / 10, vx: Math.round(sh.vx), vy: Math.round(sh.vy), a: Math.round(sh.ang * 100), f: sh.flags }; }
  }

  // ---------- gunner controls ----------
  class GunnerCtl {
    constructor() { this.tg = 0; this.prog = 0; this.jam = 0; this.rel = 0; this.lastHp = -1; this.fireT = 0; this.botT = 0; this.flashMiss = 0; }
    candidates(st) {
      const sh = st.ship, out = [];
      for (const e of st.ents.values()) if (e.combos && e.hp > 0 && !isNaN(e.x) && inArc(sh, e, st.cam.x)) out.push(e);
      return out.sort((a, b) => Math.hypot(a.x - sh.x, a.y - sh.y) - Math.hypot(b.x - sh.x, b.y - sh.y));
    }
    target(st) { return st.ents.get(this.tg); }
    // returns a list of messages for the host
    update(dt, st, inp) {
      const out = [];
      this.jam = Math.max(0, this.jam - dt); this.fireT = Math.max(0, this.fireT - dt); this.flashMiss = Math.max(0, this.flashMiss - dt);
      if (st.paused || st.phase === 'over' || st.phase === 'clear') return out;
      const c = this.candidates(st);
      let t = st.ents.get(this.tg);
      if (!t || !c.includes(t)) { t = c[0] || null; this.tg = t ? t.id : 0; this.prog = 0; this.lastHp = t ? t.hp : -1; }
      if (t && t.hp !== this.lastHp) { this.prog = 0; this.lastHp = t.hp; }
      if ((inp.next || inp.prev) && c.length > 1) {
        let i = c.indexOf(t); i = (i + (inp.next ? 1 : -1) + c.length) % c.length;
        t = c[i]; this.tg = t.id; this.prog = 0; this.lastHp = t.hp; out.push({ local: 'switch' });
      }
      const want = t ? wrap(Math.atan2(t.y - st.ship.y, t.x - st.ship.x) - st.ship.ang) : 0;
      this.rel += clamp(wrap(want - this.rel), -4.5 * dt, 4.5 * dt);
      st.turret.ang = st.ship.ang + this.rel; st.turret.tg = this.tg; st.turret.prog = this.prog;
      if (t && t.combos && this.jam <= 0 && inp.press.length) {
        const combo = effCombo(t, st.power);
        for (const k of inp.press) {
          if (k === combo[this.prog]) {
            this.prog++; out.push({ local: 'ok' });
            if (this.prog >= combo.length) { out.push({ t: 'hit', id: t.id }, { local: 'fire', id: t.id }); this.prog = 0; this.fireT = 0.25; break; }
          } else { this.prog = 0; this.jam = 0.6; this.flashMiss = 0.6; out.push({ t: 'miss' }, { local: 'miss' }); break; }
        }
        st.turret.prog = this.prog;
      }
      if (inp.special) out.push(st.en >= 60 ? { t: 'sp' } : { local: 'noenergy' });
      if (inp.ping) out.push({ local: 'ping' });
      return out;
    }
    msg(st) { return { t: 'g', ta: Math.round(st.turret.ang * 100), tg: this.tg, pr: this.prog }; }
  }

  // ---------- bots for the solo trials ----------
  function botGunnerInput(ctl, st, dt) {
    const inp = { press: [], next: false, prev: false, special: false, ping: false };
    ctl.botT -= dt;
    const t = st.ents.get(ctl.tg);
    if (t && t.combos && ctl.jam <= 0 && ctl.botT <= 0) {
      const combo = effCombo(t, st.power);
      if (combo[ctl.prog]) { inp.press.push(combo[ctl.prog]); ctl.botT = 0.24; }
    }
    if (st.en >= 95 && ctl.candidates(st).length >= 3) inp.special = true;
    return inp;
  }
  function botPilotInput(bot, st) {
    const sh = st.ship, scroll = st.scrolling ? C.SCROLL : 0;
    let best = sh.y, bestScore = -1e9, danger = 0;
    for (let y = -C.BAND + 6; y <= C.BAND - 6; y += 8) {
      let score = -Math.abs(y - sh.y) * 0.12 - Math.abs(y) * 0.04;
      for (const e of st.ents.values()) {
        const T = TYPES[e.type]; if (!T || !(T.dmg) || isNaN(e.x)) continue;
        const dx = e.x - sh.x; if (dx < -30 || dx > 230) continue;
        const dy = Math.abs(e.y - y), r = e.r + 24;
        if (dy < r) score -= (r - dy) * 5 * (1.2 - dx / 260);
      }
      for (const b of st.bullets.values()) {
        const rvx = b.vx - scroll, dx = b.x - sh.x; if (dx < -25 || dx > 220) continue;
        const tt = rvx < -1 ? dx / -rvx : 0.6; if (tt > 1.6) continue;
        const dy = Math.abs(b.y + b.vy * tt - y); if (dy < 20) score -= (20 - dy) * 3;
      }
      if (score > bestScore) { bestScore = score; best = y; }
    }
    for (const b of st.bullets.values()) if (Math.hypot(b.x - sh.x, b.y - sh.y) < 26) danger++;
    let tx = st.cam.x - 105;
    if (st.phase === 'gate') for (const e of st.ents.values()) if (e.type === 'gate' && !isNaN(e.x)) { tx = e.x; best = e.y; }
    return { x: clamp((tx - sh.x) / 40, -1, 1), y: clamp((best - sh.y) / 22, -1, 1), dodge: false, shield: danger > 0 && st.en > 25, boost: false, ping: false };
  }

  window.Sim = { C, F, TYPES, JP, World, Replica, PilotCtl, GunnerCtl, botGunnerInput, botPilotInput, inArc, effCombo, wrap, clamp, TAU, rngOf };
})();

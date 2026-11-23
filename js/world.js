// The 3D world: a wrap-around cube of space (fly far enough in any direction and you come back),
// real planets with gravity, the home station, fields of rocks and junk, and the things that live here.
// The host runs World (enemies, damage, scans). The guest runs Replica. Each player's own controls
// run on their own phone: the pilot moves the ship, the gunner aims and fires.
(function () {
  const TAU = Math.PI * 2, WS = 90000, HW = WS / 2, MAXHP = 20, SHIP_R = 13;
  const wd = d => { d = (d + HW) % WS; if (d < 0) d += WS; return d - HW; };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const wrapA = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  const sub = (a, b) => [wd(a[0] - b[0]), wd(a[1] - b[1]), wd(a[2] - b[2])];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], vadd = add;
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const len = v => Math.hypot(v[0], v[1], v[2]);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = v => { const l = len(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const wrapP = p => [wd(p[0]), wd(p[1]), wd(p[2])];
  const fwdOf = (y, p) => [Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), Math.sin(p)];
  function basis(y, p, r = 0) {
    const f = fwdOf(y, p); let rt = [Math.sin(y), -Math.cos(y), 0]; let u = cross(rt, f);
    if (r) { const c = Math.cos(r), s = Math.sin(r); const r2 = add(mul(rt, c), mul(u, s)); u = sub3(mul(u, c), mul(rt, s)); rt = r2; }
    return { f, r: rt, u };
  }
  function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function rngOf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const r1 = v => Math.round(v * 10) / 10;
  const F = { DODGE: 1, SHIELD: 2, BOOST: 4, SCAN: 8 };

  // ---------- gunner weapons ----------
  const SKILLS = {
    scatter: { jp: '拡散弾', combo: ['LEFT', 'RIGHT'], cd: 5, desc: '前に12発ばらまく。小さい敵の群れに強い。' },
    lance: { jp: '貫通ランス', combo: ['RIGHT', 'RIGHT'], cd: 8, desc: 'まっすぐ全部をつらぬく光の槍。かたい敵に強い。' },
    cryo: { jp: '冷凍弾', combo: ['DOWN', 'DOWN'], cd: 8, desc: '当たったまわりを凍らせて5秒おそくする。速い敵に強い。' },
    emp: { jp: 'EMPパルス', combo: ['UP', 'UP'], cd: 12, desc: '船のまわりに電磁波。機械を4秒止め、敵の弾を消す。生きものには効かない。' },
    chain: { jp: '連鎖雷', combo: ['UP', 'DOWN', 'UP'], cd: 9, desc: 'ねらった敵から近くの敵へ雷がとびうつる（最大6体）。' },
  };
  const ULT = { jp: 'ノヴァ・バースト', combo: ['UP', 'RIGHT', 'DOWN', 'LEFT'], desc: 'ゲージが満タンのとき、十字のあと Y。前にいる敵ぜんぶに大ダメージ。' };
  const KIND_JP = { gun: '機関砲', beam: 'チャージビーム', scatter: '拡散弾', lance: '貫通ランス', cryo: '冷凍弾', emp: 'EMPパルス', chain: '連鎖雷' };

  // ---------- everything that can be met ----------
  const DEFS = {
    raider: { m: 'raider', jp: 'レイダー', cat: 'hostile', hp: 40, r: 16, sp: 230, ai: 'fighter', shoot: 1.7, weak: ['scatter', 'cryo'], mach: 1, desc: '宇宙海賊の小型戦闘機。2〜3機の群れでまわりこみ、弾を撃ってくる。', note: '弾はまっすぐ飛んでくる。横にずれるか、A の回避でかわせる。' },
    raider_g: { m: 'raider_g', jp: '翠レイダー', cat: 'hostile', hp: 60, r: 16, sp: 250, ai: 'fighter', shoot: 1.3, weak: ['scatter', 'cryo'], mach: 1, desc: '緑にぬった海賊の精鋭。ふつうのレイダーよりかたく、撃つのが速い。', note: '群れの中に1機だけいることが多い。先にたおしてもらおう。' },
    interceptor: { m: 'interceptor', jp: 'インターセプター', cat: 'hostile', hp: 32, r: 15, sp: 420, ai: 'fighter', shoot: 1.1, weak: ['cryo', 'chain'], mach: 1, desc: 'とても速い迎撃機。全力加速でも引きはなすのはむずかしい。', note: '逃げるより、ガンナーがねらいやすいように動きをおさえるのも手。' },
    gunship: { m: 'gunship', jp: 'ガンシップ', cat: 'hostile', hp: 180, r: 25, sp: 110, ai: 'gunship', shoot: 2.4, weak: ['lance', 'emp'], resist: ['gun', 'scatter'], mach: 1, desc: '重装甲の砲艦。動きはおそいが、3方向に弾をばらまく。', note: '正面にいると弾が当たりやすい。横か上下にまわりこもう。' },
    drone: { m: 'drone', jp: '見はりドローン', cat: 'hostile', hp: 28, r: 14, sp: 150, ai: 'drone', shoot: 2.2, weak: ['scatter', 'emp'], mach: 1, desc: '宙に浮かんで見はりをする機械。近づくと撃ってくる。', note: '動きはゆっくり。距離をとれば弾はよけやすい。' },
    drone_r: { m: 'drone_r', jp: '赤ドローン', cat: 'hostile', hp: 36, r: 14, sp: 170, ai: 'drone', shoot: 1.5, weak: ['emp', 'scatter'], mach: 1, desc: '赤くぬった警備ドローン。群れでいて、撃つのが速い。', note: '4機くらいの群れ。EMP でまとめて止めてもらおう。' },
    turret: { m: 'turret', jp: '浮遊砲台', cat: 'hostile', hp: 90, r: 17, sp: 0, ai: 'turret', shoot: 2.0, weak: ['emp', 'lance'], resist: ['gun'], mach: 1, still: 1, desc: '小惑星帯にしかけられた砲台。動かないが、遠くから3発ずつ撃つ。', note: '動かないので、距離をとって通りすぎてもいい。' },
    mine: { m: 'mine', jp: 'スパイク機雷', cat: 'hostile', hp: 10, r: 13, sp: 0, ai: 'mine', dmg: 3, weak: ['scatter', 'gun'], mach: 1, still: 1, desc: '近づくと爆発するトゲの機雷。撃てばかんたんにこわれる。', note: '赤く光ったら爆発の合図。すぐはなれよう。' },
    dread: { m: 'boss', jp: '戦艦ドレッド', cat: 'hostile', hp: 800, r: 38, sp: 70, ai: 'dread', shoot: 1.3, weak: ['lance', 'emp'], resist: ['gun', 'scatter'], mach: 1, sc: [1.8, 1.8], desc: '海賊団の旗艦。大きな砲台と、レイダーを出す格納庫をもつ。', note: 'まともに戦うと危ない。全力加速で逃げるのも作戦。' },
    jelly: { m: 'jelly', jp: '宇宙クラゲ', cat: 'hostile', hp: 50, r: 15, sp: 65, ai: 'jelly', dmg: 1, weak: ['cryo', 'lance'], resist: ['chain'], sc: [1, 4.5], desc: '電気をおびたクラゲ。ふれるとしびれる。大きいものは船の何倍もある。', note: '動きはおそい。大きい個体は近づかなければおとなしい。' },
    jelly_b: { m: 'jelly_b', jp: 'あおクラゲ', cat: 'neutral', hp: 40, r: 15, sp: 30, ai: 'drift', weak: ['cryo'], resist: ['chain'], sc: [1.5, 6], desc: '青く光る、おとなしいクラゲ。群れでただよう。', note: '攻撃してこない。ぶつからないように。' },
    eel: { m: 'eel', jp: '星くいウナギ', cat: 'hostile', hp: 90, r: 18, sp: 330, ai: 'eel', dmg: 2, weak: ['cryo', 'chain'], sc: [1.2, 2.4], desc: '長い体でくねくね泳ぎ、すばやくかみついてくる。', note: 'まっすぐ突っこんでくる。直前に A で回避！' },
    beetle: { m: 'beetle', jp: 'よろいコガネ', cat: 'hostile', hp: 150, r: 17, sp: 260, ai: 'charger', dmg: 2, weak: ['lance'], resist: ['gun', 'scatter', 'chain'], sc: [1, 1.7], desc: 'かたい殻をもつ甲虫。ツノをむけて体当たりしてくる。', note: '止まってこっちを向いたら突進の合図。横によけよう。' },
    spore: { m: 'spore', jp: 'ほうしダマ', cat: 'neutral', hp: 25, r: 14, sp: 20, ai: 'drift', weak: ['scatter', 'chain'], sc: [1, 2.2], burst: 1, desc: 'ふわふわ浮かぶ植物のような生きもの。こわすと胞子の雲が広がる。', note: 'こわれたあとの胞子の雲に入るとダメージ。' },
    manta: { m: 'manta', jp: '星エイ', cat: 'friendly', hp: 60, r: 20, sp: 120, ai: 'flock', sc: [1.5, 3], desc: 'つばさをはばたかせて群れで泳ぐ。人なつっこい。', note: '攻撃されると逃げる。' },
    whale: { m: 'whale', jp: 'そらクジラ', cat: 'friendly', hp: 500, r: 30, sp: 55, ai: 'whale', sc: [5, 8], desc: '星の海をゆっくり旅する、とても大きな生きもの。何百年も生きるらしい。', note: 'とても大きい。ぶつからないように。' },
    probe: { m: 'probe', jp: '迷子の探査機', cat: 'neutral', hp: 20, r: 12, sp: 170, ai: 'shy', weak: ['emp'], mach: 1, desc: 'どこかの星から来た古い探査機。近づくと逃げていく。', note: '追いかけて、ガンナーにスキャンしてもらおう。' },
    trader: { m: 'trader', jp: '行商船', cat: 'friendly', hp: 130, r: 26, sp: 150, ai: 'trader', mach: 1, desc: 'ステーションと惑星のあいだを行き来する商人の船。', note: '味方。撃たないように。' },
    asteroid: { m: 'asteroid', jp: '小惑星', cat: 'object', hp: 0, r: 15, dmg: 2, sc: [1, 5], still: 1, desc: '岩のかたまり。大きいものは船の何倍もある。', note: 'ぶつかるとダメージ。' },
    crystal: { m: 'crystal', jp: '結晶の小惑星', cat: 'object', hp: 40, r: 14, dmg: 1, drop: 'power', sc: [1, 2], still: 1, desc: '光る結晶が生えた岩。こわすと結晶のエネルギーが手に入る。', note: 'ガンナーがこわすと、しばらく攻撃力アップ。' },
    junk: { m: 'junk', jp: '宇宙ゴミ', cat: 'object', hp: 30, r: 18, dmg: 1, sc: [1, 2], still: 1, desc: 'こわれた鉄骨やパネル。昔の戦いの残り。', note: 'ぶつかるとダメージ。撃てばこわせる。' },
    wreck: { m: 'wreck', jp: '船の残骸', cat: 'object', hp: 0, r: 16, dmg: 2, sc: [1.5, 3], still: 1, desc: 'こわれた船の一部。まだ火花が出ている。', note: 'ぶつかるとダメージ。' },
    cargo: { m: 'cargo', jp: '補給コンテナ', cat: 'object', hp: 20, r: 14, drop: 'repair', still: 1, desc: 'ただよう補給物資。こわすと中の修理キットで船が直る。', note: 'ガンナーにこわしてもらうと船体が回復。' },
    satellite: { m: 'satellite', jp: '古い人工衛星', cat: 'object', hp: 0, r: 20, dmg: 1, sc: [1, 1.5], still: 1, desc: 'だれかが昔打ち上げた衛星。もう動いていない。', note: 'ぶつかるとダメージ。' },
    station: { m: 'station', jp: 'ホーム・ステーション', cat: 'friendly', hp: 0, r: 24, sc: [3, 3], still: 1, desc: 'わたしたちの基地。近くにいると船が修理される。', note: '近くで止まると船体とエネルギーが回復。' },
  };
  const BOOK_ORDER = ['raider', 'raider_g', 'interceptor', 'gunship', 'drone', 'drone_r', 'turret', 'mine', 'dread', 'jelly', 'eel', 'beetle', 'jelly_b', 'spore', 'probe', 'manta', 'whale', 'trader', 'station', 'asteroid', 'crystal', 'junk', 'wreck', 'cargo', 'satellite'];
  const CAT_JP = { hostile: '敵対', neutral: '中立', friendly: '友好', object: '物体' };

  // ---------- planets (real, with gravity) ----------
  const PLANETS = [
    { m: 'earth', mr: 13, name: 'アクア・ノヴァ', R: 900, a: 5900, per: 1800, ph: 0.9, inc: 0.02, spin: 0.03, tilt: 0.41, p: [0, 0, 0], v: [0, 0, 0], g: 380, type: '海の惑星', age: '約38億年', temp: '平均 14℃', atm: '窒素と酸素（少しうすい）', grav: '0.9G', live: 4, desc: '青い海と緑の大陸があり、雲も流れている。住めるかもしれない第一候補。' },
    { m: 'moon', mr: 11, name: 'セレネ', R: 420, a: 1500, per: 300, ph: 2.0, inc: 0.08, parent: 0, spin: 0.012, tilt: 0.1, p: [0, 0, 0], v: [0, 0, 0], g: 300, type: '衛星（月）', age: '約44億年', temp: '−120〜110℃', atm: 'ほとんどない', grav: '0.17G', live: 1, desc: 'クレーターだらけの月。アクア・ノヴァのまわりを回っている。' },
    { m: 'lava', mr: 12, name: 'イグニス', R: 700, a: 2600, per: 720, ph: 3.6, inc: 0.03, spin: 0.05, tilt: 0.1, p: [0, 0, 0], v: [0, 0, 0], g: 400, type: '溶岩の惑星', age: '約9億年（まだ若い）', temp: '地表 1100℃', atm: '二酸化硫黄', grav: '1.3G', live: 0, desc: 'まだ若く、地面のすきまから溶岩があふれている。近くに海賊の旗艦がいるといううわさ。' },
    { m: 'ice', mr: 12, name: 'グラシア', R: 800, a: 15600, per: 6000, ph: 5.2, inc: 0.04, spin: 0.02, tilt: 0.25, p: [0, 0, 0], v: [0, 0, 0], g: 360, type: '氷の惑星', age: '約61億年', temp: '平均 −160℃', atm: 'メタン（うすい）', grav: '0.8G', live: 2, desc: '表面は厚い氷。氷の下には海があるかもしれない。' },
    { m: 'gas', mr: 15, name: 'ゼフィール', R: 1500, a: 18400, per: 8400, ph: 4.1, inc: 0.01, spin: 0.06, tilt: 0.05, p: [0, 0, 0], v: [0, 0, 0], g: 520, type: 'ガス巨星', age: '約46億年', temp: '雲の上 −110℃', atm: '水素とヘリウム', grav: '2.4G', live: 0, desc: 'とても大きなガスの星。赤い嵐は何百年も続いている。地面はない。' },
    { m: 'violet', mr: 10, name: 'ヴィオラ', R: 700, a: 11600, per: 3600, ph: 1.7, inc: 0.05, spin: 0.035, tilt: -0.3, p: [0, 0, 0], v: [0, 0, 0], g: 380, type: '結晶の環をもつ惑星', age: '約27億年', temp: '平均 −20℃', atm: 'アルゴンと窒素', grav: '1.1G', live: 3, desc: '細い結晶の環が光る。ふしぎな電波がずっと出ている。' },
    { m: 'desert', mr: 10, name: 'デューナ', R: 650, a: 9400, per: 2700, ph: 0.2, inc: 0.03, spin: 0.015, tilt: 0.3, p: [0, 0, 0], v: [0, 0, 0], g: 330, type: '砂の惑星', age: '約52億年', temp: '昼 70℃／夜 −40℃', atm: '二酸化炭素（うすい）', grav: '0.7G', live: 2, desc: '砂丘がどこまでも続く。昔は海があったらしい。' },
    { m: 'planet', mr: 12, name: 'オルビス', R: 1000, a: 13600, per: 4800, ph: 2.6, inc: 0.02, spin: 0.045, tilt: 0.45, p: [0, 0, 0], v: [0, 0, 0], g: 420, type: '環のある惑星', age: '約71億年', temp: '平均 −60℃', atm: '水素とメタン', grav: '1.6G', live: 1, desc: '大きな環がななめに回る。環は氷と岩のつぶでできている。' },
  ];
  const scanDur = pl => Math.round(30 + pl.R / 60);
  // the sun sits at the centre; planets go round it (the moon goes round アクア・ノヴァ) and spin on their axes
  const SUN = { name: '太陽', R: 1400, g: 300, p: [0, 0, 0], v: [0, 0, 0], sun: true };
  function updatePlanets(T) {
    for (const pl of PLANETS) {
      const c = pl.parent != null ? PLANETS[pl.parent] : SUN, w = TAU / pl.per, a = pl.ph + w * T;
      pl.p = [c.p[0] + Math.cos(a) * pl.a, c.p[1] + Math.sin(a) * pl.a, c.p[2] + Math.sin(a) * pl.a * pl.inc];
      pl.v = [c.v[0] - Math.sin(a) * pl.a * w, c.v[1] + Math.cos(a) * pl.a * w, c.v[2] + Math.cos(a) * pl.a * w * pl.inc];
    }
  }
  updatePlanets(0);
  const BODIES = [...PLANETS, SUN];
  const STATION = [3000, 0, 2600];

  // ---------- world generation (same on both phones, from the shared seed) ----------
  function makeEnt(type, p, id, o, rng) {
    const d = DEFS[type];
    const s = o.s || (d.sc ? d.sc[0] + (d.sc[1] - d.sc[0]) * rng() : 1);
    const hp = d.cat === 'object' ? d.hp : Math.round(d.hp * Math.max(1, s * 0.8));
    return {
      id, type, d, p: wrapP(p), v: [0, 0, 0], yaw: o.yaw != null ? o.yaw : rng() * TAU, pitch: 0, s, r: d.r * s, hp, maxHp: hp,
      st: o.st || 'idle', home: wrapP(o.home || p), ph: rng() * TAU, sT: 1 + rng() * 2, spin: d.still && !d.ai ? (rng() - 0.5) * 0.3 : 0,
      g: o.g || 0, still: !!d.still, temp: !!o.temp, seen: 0,
    };
  }
  // keep fields away from the planets' orbit lanes, the sun and the station
  function farFromPlanets(p, margin) {
    if (len(p) < SUN.R * 2.5 + margin) return false;
    const dxy = Math.hypot(p[0], p[1]);
    for (const pl of PLANETS) {
      if (pl.parent != null) continue;
      const moon = PLANETS.find(q => q.parent === PLANETS.indexOf(pl)), w = pl.R * 1.8 + margin + (moon ? moon.a + moon.R * 1.8 : 0);
      if (Math.abs(dxy - pl.a) < w && Math.abs(p[2]) < w) return false;
    }
    return len(sub(p, STATION)) > 1800 + margin;
  }
  function generate(seed) {
    const r = rngOf(seed), list = []; let id = 1, gid = 1;
    const add = (type, p, o = {}) => { const e = makeEnt(type, p, id++, o, r); list.push(e); return e; };
    const rp = () => { const a = r() * TAU, d = 2500 + Math.sqrt(r()) * 19000; return [Math.cos(a) * d, Math.sin(a) * d, (r() * 2 - 1) * 4000]; };
    const spot = m => { for (let i = 0; i < 60; i++) { const p = rp(); if (farFromPlanets(p, m)) return p; } return rp(); };
    const around = (c, rad) => { const u = r() * TAU, v = r() * 2 - 1, q = Math.sqrt(1 - v * v), d = rad * Math.cbrt(r()); return [c[0] + Math.cos(u) * q * d, c[1] + Math.sin(u) * q * d, c[2] + v * d * 0.6]; };
    add('station', STATION, { yaw: 0 });
    for (let k = 0; k < 3; k++) add('cargo', around(vadd(STATION, [500, 300, 0]), 400));
    add('satellite', vadd(STATION, [-700, 500, 200]));
    for (let f = 0; f < 16; f++) {
      const c = spot(1200), n = 14 + Math.floor(r() * 16);
      for (let i = 0; i < n; i++) add(r() < 0.88 ? 'asteroid' : 'crystal', around(c, 1000));
      if (f < 5) { const g = gid++; for (let i = 0; i < 2; i++) add('turret', around(c, 500), { g }); for (let i = 0; i < 6; i++) add('mine', around(c, 800), { g }); }
    }
    for (let f = 0; f < 9; f++) {
      const c = spot(800), n = 6 + Math.floor(r() * 5);
      for (let i = 0; i < n; i++) add('junk', around(c, 600));
      add('wreck', around(c, 500)); if (r() < 0.6) add('satellite', around(c, 500)); add('cargo', around(c, 500)); if (r() < 0.5) add('cargo', around(c, 500));
    }
    const SQUADS = [['raider', 'raider', 'raider'], ['raider_g', 'raider', 'raider'], ['interceptor', 'interceptor'], ['gunship', 'drone', 'drone'], ['drone_r', 'drone_r', 'drone_r', 'drone_r'], ['eel'], ['eel', 'eel'], ['beetle', 'beetle'], ['jelly', 'jelly', 'jelly', 'jelly'], ['beetle'], ['raider', 'raider', 'drone']];
    for (let k = 0; k < 24; k++) {
      const c = spot(1500), sq = SQUADS[k % SQUADS.length], g = gid++;
      for (const t of sq) add(t, around(c, 250), { g });
    }
    add('dread', [-3000, -2000, 1900], { g: gid++ });
    const FRIENDS = [[['whale', 'manta', 'manta'], 3], [['manta', 'manta', 'manta', 'manta', 'manta'], 4], [['jelly_b', 'jelly_b', 'jelly_b', 'jelly_b'], 4], [['spore', 'spore', 'spore', 'spore', 'spore'], 5], [['probe'], 6], [['trader'], 3]];
    for (const [sq, n] of FRIENDS) for (let k = 0; k < n; k++) { const c = spot(600), g = gid++; for (const t of sq) add(t, around(c, 300), { g }); }
    add('whale', [STATION[0] - 1500, STATION[1] - 1200, STATION[2] + 400], { g: gid++ }); add('manta', [STATION[0] - 1300, STATION[1] - 1000, STATION[2] + 300], { g: gid }); add('manta', [STATION[0] - 1400, STATION[1] - 900, STATION[2] + 500], { g: gid++ });
    return { list, nextId: id, nextG: gid };
  }

  // ---------- host world ----------
  class World {
    constructor(seed, opt = {}) {
      this.seed = seed; this.rng = rngOf(seed ^ 0x5bd1e995); this.T = 0;
      const g = generate(seed); this.ents = new Map(g.list.map(e => [e.id, e])); this.nid = 100000; this.gid = g.nextG + 1000;
      this.ship = { p: add(STATION, [320, -40, 60]), v: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, flags: 0 };
      this.gun = { gy: 0, gp: 0, lk: 0 };
      this.hp = MAXHP; this.en = 100; this.ult = 0; this.pow = 0; this.inv = 0;
      this.mode = 'explore'; this.combatT = 0; this.scan = null;
      this.shots = new Map(); this.bul = new Map(); this.clouds = []; this.sid = 1;
      this.out = []; this.paused = false; this.over = false;
      this.encT = opt.training ? 25 : 50; this.training = !!opt.training;
      this.stats = { time: 0, kills: 0, scansE: 0, scansP: 0, hits: 0 };
      this.repT = 0; this.dead = [];
      if (opt.save) this.load(opt.save);
    }
    // ---------- save / continue ----------
    saveState() {
      const sh = this.ship;
      return { v: 1, seed: this.seed, T: Math.round(this.T * 10) / 10, at: Date.now(), ship: { p: sh.p.map(r1), v: sh.v.map(Math.round), yaw: sh.yaw, pitch: sh.pitch }, hp: this.hp, en: Math.round(this.en), ult: Math.round(this.ult), dead: [...this.dead], stats: Object.assign({}, this.stats) };
    }
    load(sv) {
      this.T = sv.T; updatePlanets(this.T);
      Object.assign(this.ship, { p: [...sv.ship.p], v: [...sv.ship.v], yaw: sv.ship.yaw, pitch: sv.ship.pitch });
      this.hp = sv.hp; this.en = sv.en; this.ult = sv.ult; this.dead = [...sv.dead]; Object.assign(this.stats, sv.stats);
      for (const id of sv.dead) { const e = this.ents.get(id); if (e) { e.dead = true; this.ents.delete(id); } }
    }
    ev(...a) { this.out.push(a); }
    say(t, d = 3) { this.ev('msg', t, d); }
    spawn(type, p, o = {}) { const e = makeEnt(type, p, this.nid++, o, this.rng); e.temp = o.temp !== false; this.ents.set(e.id, e); this.ev('sp', e.id, type, r1(e.p[0]), r1(e.p[1]), r1(e.p[2]), r1(e.s), Math.round(e.yaw * 100), e.st === 'hunt' ? 1 : 0); return e; }
    spawnGroup(types, center, st) { const g = this.gid++, out = []; for (const t of types) { const off = [(this.rng() - 0.5) * 400, (this.rng() - 0.5) * 400, (this.rng() - 0.5) * 200]; out.push(this.spawn(t, add(center, off), { g, st, temp: true })); } return out; }

    step(dt) {
      if (this.paused || this.over) return;
      this.T += dt; this.stats.time = this.T;
      updatePlanets(this.T);
      const sh = this.ship;
      for (const pl of BODIES) if (len(sub(sh.p, pl.p)) < pl.R * 0.95) { this.finish(pl.sun ? 'sun' : 'crash', pl.name); return; }
      const f = sh.flags; let drain = 0; if (f & F.SHIELD) drain += 28; if (f & F.BOOST) drain += 20;
      this.en = drain ? Math.max(0, this.en - drain * dt) : Math.min(100, this.en + 10 * dt);
      this.pow = Math.max(0, this.pow - dt); this.inv = Math.max(0, this.inv - dt);
      // home station repairs
      if (this.mode === 'explore' && len(sub(sh.p, STATION)) < 320) { this.repT += dt; if (this.repT > 1.2 && this.hp < MAXHP) { this.repT = 0; this.hp = Math.min(MAXHP, this.hp + 1); this.ev('rep'); } this.en = Math.min(100, this.en + 30 * dt); }
      // planet scan
      if (this.scan) {
        const s = this.scan; s.t += dt;
        if (s.amb > 0) { s.amb -= dt; if (s.amb <= 0) this.ambush(); }
        if (s.t >= s.dur) { const pl = PLANETS[s.pi]; this.scan = null; this.stats.scansP++; this.ev('scan', -1, 0); this.ev('book', 'p', s.pi); this.say(`${pl.name} のスキャン完了！ 図鑑に追加しました`, 4); }
      }
      // random encounters
      if (this.mode === 'explore' && !this.scan) {
        this.encT -= dt;
        if (this.encT <= 0) {
          this.encT = this.training ? 22 + this.rng() * 18 : 55 + this.rng() * 50;
          const dir = norm([this.rng() - 0.5, this.rng() - 0.5, (this.rng() - 0.5) * 0.5]);
          if (this.rng() < 0.72) { const SQ = [['raider', 'raider'], ['drone', 'drone', 'drone'], ['interceptor'], ['eel'], ['beetle'], ['raider_g', 'raider'], ['jelly', 'jelly']]; this.spawnGroup(SQ[Math.floor(this.rng() * SQ.length)], add(sh.p, mul(dir, 2300)), 'hunt'); }
          else this.spawnGroup(['manta', 'manta', 'manta'], add(sh.p, mul(dir, 1600)), 'idle');
        }
      }
      // creatures and machines
      let fighting = false;
      for (const e of [...this.ents.values()]) {
        if (e.dead) continue;
        const to = sub(sh.p, e.p), dS = len(to);
        if (dS > 6500) { if (e.temp && dS > 8000) { this.ents.delete(e.id); this.ev('del', e.id); } continue; }
        if (e.d.ai) this.think(e, dt, to, dS);
        if (!e.still) { e.p = wrapP(add(e.p, mul(e.v, dt))); }
        if ((e.st === 'attack') && dS < 2600) fighting = true;
        if (e.hitT > 0) e.hitT -= dt;
        if (e.d.dmg && dS < e.r + SHIP_R && !(e.hitT > 0) && e.d.ai !== 'mine') { e.hitT = 1; this.hurt(e.d.dmg); }
      }
      // enemy shots
      for (const s of [...this.shots.values()]) {
        s.t += dt; s.p = wrapP(add(s.p, mul(s.v, dt)));
        if (s.t > 4) { this.shots.delete(s.id); continue; }
        if (len(sub(s.p, sh.p)) < SHIP_R + 4 && !(sh.flags & F.DODGE)) { this.shots.delete(s.id); this.ev('ed', s.id); this.hurt(1); }
      }
      // gunner bullets
      for (const b of [...this.bul.values()]) {
        b.t += dt; const step = mul(b.v, dt), from = b.p; b.p = wrapP(add(b.p, step));
        if (b.t > b.life) { this.bul.delete(b.id); continue; }
        const L = len(step), dir = mul(step, 1 / (L || 1));
        let hit = null, best = 1e9;
        for (const e of this.ents.values()) {
          if (e.dead || e.type === 'station') continue;
          const rel = sub(e.p, from); if (Math.abs(rel[0]) > L + e.r + 40 || Math.abs(rel[1]) > L + e.r + 40 || Math.abs(rel[2]) > L + e.r + 40) continue;
          const t = clamp(dot(rel, dir), 0, L), c = len(sub3(rel, mul(dir, t)));
          if (c < e.r + 3 && t < best) { best = t; hit = { e, c }; }
        }
        if (hit) {
          this.bul.delete(b.id); this.ev('gd', b.id);
          if (b.k === 'cryo') this.freezeAt(add(from, mul(dir, best)));
          else this.damage(hit.e, b.dmg, b.k, hit.c < hit.e.r * 0.6 ? 1 : 0.6);
        }
      }
      for (const c of this.clouds) { c.t -= dt; if (len(sub(sh.p, c.p)) < c.r) { c.tick = (c.tick || 0) - dt; if (c.tick <= 0) { c.tick = 1; this.hurt(1); } } }
      this.clouds = this.clouds.filter(c => c.t > 0);
      if (fighting || (this.scan && this.scan.ambushed && this.scan.t < this.scan.dur && [...this.ents.values()].some(e => e.st === 'attack'))) this.combatT = 3; else this.combatT -= dt;
      const m = this.combatT > 0 ? 'combat' : 'explore';
      if (m !== this.mode) { this.mode = m; this.ev('mode', m === 'combat' ? 1 : 0); }
    }
    ambush() {
      const sh = this.ship, dir = norm([this.rng() - 0.5, this.rng() - 0.5, (this.rng() - 0.5) * 0.6]);
      const SQ = [['raider', 'raider', 'raider'], ['drone_r', 'drone_r', 'drone_r'], ['eel', 'eel'], ['interceptor', 'interceptor'], ['beetle', 'jelly', 'jelly']];
      this.spawnGroup(SQ[Math.floor(this.rng() * SQ.length)], add(sh.p, mul(dir, 1400)), 'hunt');
      this.scan.ambushed = true; this.say('スキャン中に敵が来た！ ガンナー、たのむ！', 4);
    }
    // ---------- behaviour ----------
    aggro(e) { if (e.d.cat !== 'hostile') return; if (e.g) { for (const o of this.ents.values()) if (o.g === e.g && o.d.cat === 'hostile' && o.st !== 'attack') { o.st = 'attack'; } } e.st = 'attack'; }
    provoke(e) { if (e.d.cat === 'hostile') this.aggro(e); else e.prov = 8; }
    steer(e, tgt, sp, dt, agi = 1.6) {
      const want = mul(norm(sub(tgt, e.p)), sp);
      e.v = add(e.v, mul(sub3(want, e.v), Math.min(1, dt * agi)));
      this.face(e, dt);
    }
    face(e, dt) { const s = len(e.v); if (s < 4) return; const y = Math.atan2(e.v[1], e.v[0]), p = Math.asin(clamp(e.v[2] / s, -1, 1)); e.yaw += wrapA(y - e.yaw) * Math.min(1, dt * 3); e.pitch += (p * 0.6 - e.pitch) * Math.min(1, dt * 3); }
    wander(e, dt, rad = 300, k = 0.35) {
      const T = this.T * 0.12 + e.ph;
      let h = e.home;
      if (e.d.sp > 0) { const q = this.T * 0.018 + (e.g || e.id) * 1.7; h = add(h, [Math.cos(q) * 2600, Math.sin(q * 0.8) * 2600, Math.sin(q * 0.6) * 900]); }
      this.steer(e, add(h, [Math.cos(T) * rad, Math.sin(T * 1.3) * rad, Math.sin(T * 0.7) * rad * 0.4]), e.d.sp * k, dt, 0.8);
    }
    flee(e, dt, k = 1.6) { const sh = this.ship; e.v = add(e.v, mul(sub3(mul(norm(sub(e.p, sh.p)), e.d.sp * k), e.v), Math.min(1, dt * 1.5))); this.face(e, dt); }
    shootAt(e, dt, speed, n = 1, spread = 0) {
      e.sT -= dt; if (e.sT > 0) return;
      e.sT = e.d.shoot * (0.8 + this.rng() * 0.4);
      const sh = this.ship, to = sub(sh.p, e.p), dS = len(to), lead = add(to, mul(sh.v, dS / speed * 0.7));
      const sloppy = 0.05 + (sh.flags & F.SCAN ? 0 : len(sh.v) / 9000);
      const dir = norm(add(norm(lead), [(this.rng() - 0.5) * sloppy, (this.rng() - 0.5) * sloppy, (this.rng() - 0.5) * sloppy])), side = norm(cross(dir, [0, 0, 1]));
      for (let k = 0; k < n; k++) { const o = (k - (n - 1) / 2) * spread; this.fireE(e.p, norm(add(dir, mul(side, o))), speed, e.d.ai === 'dread' || e.d.ai === 'gunship' ? 1 : 0); }
    }
    fireE(p, dir, speed, kind) { const id = this.sid++, v = mul(dir, speed); this.shots.set(id, { id, p: [...p], v, t: 0 }); this.ev('es', id, r1(p[0]), r1(p[1]), r1(p[2]), Math.round(v[0]), Math.round(v[1]), Math.round(v[2]), kind); }
    think(e, dt, to, dS) {
      const d = e.d, sh = this.ship;
      e.frz = Math.max(0, (e.frz || 0) - dt); e.stun = Math.max(0, (e.stun || 0) - dt); e.prov = Math.max(0, (e.prov || 0) - dt);
      if (e.stun > 0) { e.v = mul(e.v, Math.exp(-3 * dt)); return; }
      const slow = e.frz > 0 ? 0.25 : 1, sp = d.sp * slow;
      if (e.st === 'hunt') { if (dS < 1300) this.aggro(e); else { this.steer(e, sh.p, sp * 0.9, dt); return; } }
      if (e.prov > 0 && d.cat !== 'hostile' && !e.still) { this.flee(e, dt); return; }
      switch (d.ai) {
        case 'fighter':
          if (e.st !== 'attack' && dS < 1300) this.aggro(e);
          if (e.st === 'attack') {
            if (dS > 2800) { e.st = 'return'; break; }
            e.orb = (e.orb || 0) + dt * 0.6;
            const off = [Math.cos(e.orb + e.ph) * 380, Math.sin(e.orb + e.ph) * 380, Math.sin(e.orb * 0.7 + e.ph) * 160];
            this.steer(e, add(sh.p, off), sp, dt, 2.2);
            if (dS < 1200) this.shootAt(e, dt, 560);
          } else if (e.st === 'return') { this.steer(e, e.home, sp * 0.6, dt); if (len(sub(e.home, e.p)) < 2800) e.st = 'idle'; }
          else this.wander(e, dt, 300, 0.6);
          break;
        case 'gunship': case 'dread': {
          const far = d.ai === 'dread' ? 900 : 650;
          if (e.st !== 'attack' && dS < (d.ai === 'dread' ? 1800 : 1200)) this.aggro(e);
          if (e.st === 'attack') {
            if (dS > 3200) { e.st = 'return'; break; }
            this.steer(e, sub3(sh.p, mul(norm(to), far)), sp, dt, 0.8);
            if (dS < 1500) this.shootAt(e, dt, 460, d.ai === 'dread' ? 5 : 3, 0.12);
            if (d.ai === 'dread') { e.call = (e.call || 10) - dt; if (e.call <= 0) { e.call = 14; this.spawnGroup(['raider', 'raider'], e.p, 'attack'); this.say('ドレッドがレイダーを出した！', 2.5); } }
          } else if (e.st === 'return') { this.steer(e, e.home, sp * 0.6, dt); if (len(sub(e.home, e.p)) < 2800) e.st = 'idle'; }
          else this.wander(e, dt, 200, 0.3);
          break;
        }
        case 'drone':
          if (e.st !== 'attack' && dS < 1000) this.aggro(e);
          if (e.st === 'attack') { if (dS > 2400) { e.st = 'return'; break; } const off = [Math.cos(this.T * 0.4 + e.ph) * 500, Math.sin(this.T * 0.4 + e.ph) * 500, Math.sin(this.T * 0.3 + e.ph) * 200]; this.steer(e, add(sh.p, off), sp, dt, 1.2); if (dS < 1100) this.shootAt(e, dt, 480); }
          else if (e.st === 'return') { this.steer(e, e.home, sp * 0.6, dt); if (len(sub(e.home, e.p)) < 2800) e.st = 'idle'; }
          else this.wander(e, dt, 200, 0.5);
          break;
        case 'turret':
          if (dS < 1100) { e.st = 'attack'; e.yaw = Math.atan2(to[1], to[0]); this.shootAt(e, dt, 500, 3, 0.05); } else e.st = 'idle';
          break;
        case 'mine':
          if (!e.arm && dS < 150 + e.r) { e.arm = 0.7; this.ev('arm', e.id); }
          if (e.arm) { e.arm -= dt; if (e.arm <= 0) { if (dS < 200) this.hurt(3); this.kill(e, false); } }
          break;
        case 'jelly':
          if (e.s > 3 && !e.prov && e.st !== 'attack') { this.wander(e, dt, 200, 0.4); break; }
          if (dS < 650 || e.st === 'attack') { e.st = 'attack'; if (dS > 1800) { e.st = 'idle'; break; } this.steer(e, sh.p, sp, dt, 0.5); }
          else this.wander(e, dt, 200, 0.4);
          break;
        case 'eel':
          if (e.st !== 'attack' && dS < 1300) this.aggro(e);
          if (e.st === 'attack') {
            if (dS > 2600) { e.st = 'idle'; break; }
            e.cyc = (e.cyc || 0) - dt;
            if (e.mode2 === 'away') { this.steer(e, add(sh.p, mul(norm(sub(e.p, sh.p)), 650)), sp, dt, 2); if (e.cyc <= 0) e.mode2 = 'lunge'; }
            else { this.steer(e, sh.p, sp * 1.3, dt, 2.5); if (dS < e.r + 40) { e.mode2 = 'away'; e.cyc = 1.8; } }
          } else this.wander(e, dt, 400, 0.4);
          break;
        case 'charger':
          if (e.st !== 'attack' && dS < 1100) this.aggro(e);
          if (e.st === 'attack') {
            if (dS > 2400) { e.st = 'idle'; break; }
            e.cyc = (e.cyc || 0) - dt;
            if (!e.mode2 || (e.mode2 === 'rest' && e.cyc <= 0)) { e.mode2 = 'aim'; e.cyc = 1.0; this.ev('aim', e.id); }
            if (e.mode2 === 'aim') { e.v = mul(e.v, Math.exp(-4 * dt)); e.yaw += wrapA(Math.atan2(to[1], to[0]) - e.yaw) * Math.min(1, dt * 6); if (e.cyc <= 0) { e.mode2 = 'charge'; e.cyc = 1.4; e.v = mul(norm(to), sp * 1.8); } }
            else if (e.mode2 === 'charge') { this.face(e, dt); if (e.cyc <= 0) { e.mode2 = 'rest'; e.cyc = 1.2; } }
            else e.v = mul(e.v, Math.exp(-1.5 * dt));
          } else this.wander(e, dt, 250, 0.3);
          break;
        case 'drift': this.wander(e, dt, 300, 0.5); break;
        case 'flock': this.wander(e, dt, 700, 0.7); break;
        case 'whale': this.wander(e, dt, 900, 0.8); break;
        case 'shy': if (dS < 450) this.flee(e, dt, 1); else this.wander(e, dt, 500, 0.4); break;
        case 'trader': {
          e.wp = e.wp == null ? Math.floor(this.rng() * PLANETS.length) : e.wp;
          const pl = PLANETS[e.wp], tgt = add(pl.p, [pl.R * 2.4, 0, 0]);
          this.steer(e, tgt, sp, dt, 0.6); if (len(sub(tgt, e.p)) < 300) e.wp = (e.wp + 3) % PLANETS.length;
          break;
        }
      }
    }
    hurt(n) {
      const sh = this.ship;
      if (this.over || sh.flags & F.DODGE || this.inv > 0) return;
      if ((sh.flags & F.SHIELD) && this.en > 0) { this.en = Math.max(0, this.en - 10 * n); this.ev('blk'); return; }
      if (this.training) n *= 0.5;
      this.hp = Math.round((this.hp - n) * 10) / 10; this.inv = 1.1; this.stats.hits++;
      this.ev('hurt', n);
      if (this.hp <= 0) { this.hp = 0; this.finish('hp'); }
    }
    damage(e, base, kind, acc = 1) {
      if (!e || e.dead) return;
      if (!(e.hp > 0)) { this.ev('ping', r1(e.p[0]), r1(e.p[1]), r1(e.p[2])); return; }
      if (kind === 'emp' && !e.d.mach) return;
      let m = 1; if (e.d.weak && e.d.weak.includes(kind)) m = 2; else if (e.d.resist && e.d.resist.includes(kind)) m = 0.5;
      const amt = base * m * acc * (this.pow > 0 ? 1.5 : 1);
      e.hp -= amt; if (e.d.cat === 'hostile') this.ult = Math.min(100, this.ult + amt * 0.25);
      this.ev('h', e.id, Math.round(amt), m > 1 ? 1 : m < 1 ? -1 : 0, Math.max(0, Math.round(e.hp)));
      this.provoke(e);
      if (e.hp <= 0) this.kill(e, true);
    }
    kill(e, credit) {
      if (e.dead) return; e.dead = true; this.ents.delete(e.id); if (e.id < 100000) this.dead.push(e.id);
      this.ev('k', e.id, r1(e.p[0]), r1(e.p[1]), r1(e.p[2]), Math.round(e.r));
      if (e.d.burst) { const c = { p: [...e.p], r: 160 * e.s, t: 4 }; this.clouds.push(c); this.ev('cloud', r1(c.p[0]), r1(c.p[1]), r1(c.p[2]), Math.round(c.r)); }
      if (!credit) return;
      if (e.d.cat === 'hostile') this.stats.kills++;
      if (e.d.drop === 'power') { this.pow = 15; this.say('結晶のエネルギー！ 15秒間 攻撃力アップ', 3); }
      if (e.d.drop === 'repair') { this.hp = Math.min(MAXHP, this.hp + 4); this.say('修理キット！ 船体が回復した', 2.5); }
    }
    freezeAt(p) { this.ev('fz', r1(p[0]), r1(p[1]), r1(p[2])); for (const e of this.ents.values()) if (!e.dead && len(sub(e.p, p)) < 160 + e.r) { e.frz = 5; this.damage(e, 12, 'cryo'); } }
    rayHits(o, dir, L, tol) {
      const out = [];
      for (const e of this.ents.values()) {
        if (e.dead || e.type === 'station') continue;
        const rel = sub(e.p, o), t = dot(rel, dir); if (t < 0 || t > L) continue;
        const c = len(sub3(rel, mul(dir, t))); if (c < e.r + tol) out.push({ e, t, c });
      }
      return out.sort((a, b) => a.t - b.t);
    }
    bullet(dir, kind, speed, dmg, life, spread) {
      const sh = this.ship;
      // light aim assist: if the crosshair is near something, lead the shot toward where it will be
      let best = null, bestA = 0.11;
      for (const e of this.ents.values()) {
        if (e.dead || !(e.hp > 0) || e.type === 'station') continue;
        const rel = sub(e.p, sh.p), dl = len(rel); if (dl > speed * life || dl < 1) continue;
        const a = Math.acos(clamp(dot(rel, dir) / dl, -1, 1)) - Math.atan(e.r / dl); if (a < bestA) { bestA = a; best = e; }
      }
      if (best) { const rel = sub(best.p, sh.p), t = len(rel) / speed, aimP = add(rel, mul(sub3(best.v, sh.v), t)); dir = norm(add(mul(dir, 0.25), mul(norm(aimP), 0.75))); }
      const B = basis(Math.atan2(dir[1], dir[0]), Math.asin(clamp(dir[2], -1, 1)));
      const d = norm(add(dir, add(mul(B.r, (this.rng() - 0.5) * spread * 2), mul(B.u, (this.rng() - 0.5) * spread * 2))));
      const id = this.sid++, p = add(sh.p, mul(d, 18)), v = add(mul(d, speed), sh.v);
      this.bul.set(id, { id, p, v, t: 0, life, dmg, k: kind });
      this.ev('gs', id, r1(p[0]), r1(p[1]), r1(p[2]), Math.round(v[0]), Math.round(v[1]), Math.round(v[2]), kind === 'cryo' ? 2 : kind === 'scatter' ? 1 : 0, life);
    }
    handle(m) {
      const sh = this.ship;
      switch (m.t) {
        case 'p': sh.p = m.p; sh.v = m.v; sh.yaw = m.y / 1000; sh.pitch = m.pt / 1000; sh.roll = m.r / 1000; sh.flags = m.f; break;
        case 'g': this.gun.gy = m.gy / 1000; this.gun.gp = m.gp / 1000; this.gun.lk = m.lk || 0; break;
        case 'fire': this.bullet(norm(m.d), 'gun', 1500, 4, 1.1, 0.012); break;
        case 'beam': {
          const dir = norm(m.d), c = clamp(m.c, 0, 1), hits = this.rayHits(sh.p, dir, 2400, 22), h = hits[0];
          const end = h ? add(sh.p, mul(dir, h.t)) : add(sh.p, mul(dir, 2400));
          this.ev('bm', r1(end[0]), r1(end[1]), r1(end[2]), Math.round(c * 100));
          if (h) this.damage(h.e, 6 + 44 * c * c, 'beam', h.c < h.e.r * 0.5 ? 1 : h.c < h.e.r ? 0.6 : 0.3);
          break;
        }
        case 'skill': this.skill(m.k, norm(m.d)); break;
        case 'ult': {
          if (this.ult < 100) break; this.ult = 0; this.ev('nova');
          const dir = norm(m.d);
          for (const e of [...this.ents.values()]) { if (e.dead || e.d.cat !== 'hostile') continue; const rel = sub(e.p, sh.p), dl = len(rel); if (dl < 1700 && dot(rel, dir) / (dl || 1) > 0.2) this.damage(e, 140, 'ult'); }
          break;
        }
        case 'scanE': if (DEFS[m.type]) { this.stats.scansE++; this.ev('book', 'e', m.type); } break;
        case 'pscan': {
          if (m.on) {
            const pl = PLANETS[m.pi]; if (!pl || this.scan) break;
            const dl = len(sub(sh.p, pl.p)); if (dl > pl.R * 2.9 || dl < pl.R) break;
            this.scan = { pi: m.pi, t: 0, dur: scanDur(pl), amb: this.rng() < 0.55 ? 6 + this.rng() * 16 : 0, ambushed: false };
            this.ev('scan', m.pi, this.scan.dur); this.say(`${pl.name} をスキャン中… 終わるまで動けません`, 3);
          } else if (this.scan) { this.scan = null; this.ev('scan', -1, 0); this.say('スキャンを中止しました', 2); }
          break;
        }
        case 'pause': if (!this.over) { this.paused = !!m.on; this.ev('pause', this.paused ? 1 : 0); } break;
      }
    }
    skill(k, dir) {
      const sh = this.ship;
      this.ev('sk', k);
      if (k === 'scatter') for (let i = 0; i < 12; i++) this.bullet(dir, 'scatter', 1300, 6, 0.9, 0.1);
      else if (k === 'cryo') this.bullet(dir, 'cryo', 1000, 0, 1.6, 0);
      else if (k === 'lance') {
        const end = add(sh.p, mul(dir, 2600)); this.ev('ln', r1(end[0]), r1(end[1]), r1(end[2]));
        for (const h of this.rayHits(sh.p, dir, 2600, 10)) this.damage(h.e, 55, 'lance');
      } else if (k === 'emp') {
        this.ev('emp');
        for (const e of [...this.ents.values()]) if (!e.dead && e.d.mach && len(sub(e.p, sh.p)) < 520 + e.r) { e.stun = 4; this.damage(e, 15, 'emp'); }
        for (const s of [...this.shots.values()]) if (len(sub(s.p, sh.p)) < 520) { this.shots.delete(s.id); this.ev('ed', s.id); }
      } else if (k === 'chain') {
        let best = null, bestA = 0.3;
        for (const e of this.ents.values()) { if (e.dead || !(e.hp > 0)) continue; const rel = sub(e.p, sh.p), dl = len(rel); if (dl > 1900) continue; const a = Math.acos(clamp(dot(rel, dir) / dl, -1, 1)); if (a < bestA) { bestA = a; best = e; } }
        if (!best) { this.ev('ch'); return; }
        const pts = [], hit = new Set(); let cur = best;
        for (let j = 0; j < 6 && cur; j++) {
          hit.add(cur.id); pts.push(r1(cur.p[0]), r1(cur.p[1]), r1(cur.p[2])); this.damage(cur, 22, 'chain');
          let nx = null, nd = 520; for (const e of this.ents.values()) { if (e.dead || hit.has(e.id) || !(e.hp > 0)) continue; const dl = len(sub(e.p, cur.p)); if (dl < nd) { nd = dl; nx = e; } }
          cur = nx;
        }
        this.ev('ch', ...pts);
      }
    }
    finish(reason, info) { if (this.over) return; this.over = true; this.ev('end', reason, info || '', Object.assign({ hp: this.hp }, this.stats, { time: Math.round(this.T) })); }
    snap() {
      const sh = this.ship, e = [];
      for (const x of this.ents.values()) {
        if (x.still || x.dead) continue; const d = sub(x.p, sh.p);
        if (Math.abs(d[0]) > 3200 || Math.abs(d[1]) > 3200 || Math.abs(d[2]) > 3200) continue;
        e.push([x.id, Math.round(x.p[0]), Math.round(x.p[1]), Math.round(x.p[2]), Math.round(x.yaw * 100), Math.round(x.pitch * 100), Math.max(0, Math.round(x.hp)), (x.st === 'attack' ? 1 : 0) | (x.frz > 0 ? 2 : 0) | (x.stun > 0 ? 4 : 0)]);
      }
      return {
        t: 's', T: Math.round(this.T * 100) / 100, hp: this.hp, en: Math.round(this.en), u: Math.round(this.ult), pw: Math.round(this.pow), md: this.mode === 'combat' ? 1 : 0,
        sc: this.scan ? [this.scan.pi, r1(this.scan.t), this.scan.dur] : 0,
        sh: [r1(sh.p[0]), r1(sh.p[1]), r1(sh.p[2]), Math.round(sh.v[0]), Math.round(sh.v[1]), Math.round(sh.v[2]), Math.round(sh.yaw * 1000), Math.round(sh.pitch * 1000), Math.round(sh.roll * 1000), sh.flags],
        g: [Math.round(this.gun.gy * 1000), Math.round(this.gun.gp * 1000), this.gun.lk || 0], e,
      };
    }
  }

  // ---------- guest replica ----------
  class Replica {
    constructor(seed, save) {
      const g = generate(seed), r = rngOf(1);
      this.ents = new Map(g.list.map(e => [e.id, e])); this.rng = r;
      this.T = 0; this.ship = { p: add(STATION, [320, -40, 60]), v: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, flags: 0 }; this.shipT = null;
      this.gun = { gy: 0, gp: 0, lk: 0 }; this.gunT = null;
      this.hp = MAXHP; this.en = 100; this.ult = 0; this.pow = 0; this.mode = 'explore'; this.scan = null;
      this.shots = new Map(); this.bul = new Map(); this.clouds = []; this.paused = false; this.over = false; this.lastSnap = 0; this.rep = true;
      if (save) {
        this.T = save.T; updatePlanets(this.T); this.ship.p = [...save.ship.p]; this.ship.yaw = save.ship.yaw; this.ship.pitch = save.ship.pitch; this.hp = save.hp;
        for (const id of save.dead) this.ents.delete(id);
      }
    }
    event(ev) {
      const k = ev[0];
      if (k === 'sp') { const [, id, type, x, y, z, s, yw, hunt] = ev; const e = makeEnt(type, [x, y, z], id, { s, yaw: yw / 100, st: hunt ? 'hunt' : 'idle' }, this.rng); e.temp = true; e.seen = this.T; this.ents.set(id, e); }
      else if (k === 'k' || k === 'del') { const e = this.ents.get(ev[1]); if (e) e.dead = true; this.ents.delete(ev[1]); }
      else if (k === 'h') { const e = this.ents.get(ev[1]); if (e) e.hp = ev[4]; }
      else if (k === 'es') { const [, id, x, y, z, vx, vy, vz, kind] = ev; this.shots.set(id, { id, p: [x, y, z], v: [vx, vy, vz], t: 0, kind }); }
      else if (k === 'ed') this.shots.delete(ev[1]);
      else if (k === 'gs') { const [, id, x, y, z, vx, vy, vz, kind, life] = ev; this.bul.set(id, { id, p: [x, y, z], v: [vx, vy, vz], t: 0, kind, life }); }
      else if (k === 'gd') this.bul.delete(ev[1]);
      else if (k === 'cloud') this.clouds.push({ p: [ev[1], ev[2], ev[3]], r: ev[4], t: 4 });
      else if (k === 'scan') this.scan = ev[1] >= 0 ? { pi: ev[1], t: 0, dur: ev[2] } : null;
      else if (k === 'mode') this.mode = ev[1] ? 'combat' : 'explore';
      else if (k === 'pause') this.paused = !!ev[1];
      else if (k === 'end') this.over = true;
    }
    snap(m, role) {
      this.T = m.T; this.hp = m.hp; this.en = m.en; this.ult = m.u; this.pow = m.pw; this.mode = m.md ? 'combat' : 'explore';
      this.scan = m.sc ? { pi: m.sc[0], t: m.sc[1], dur: m.sc[2] } : null; this.lastSnap = this.T;
      if (role !== 'pilot') { const s = m.sh; this.shipT = { p: [s[0], s[1], s[2]], v: [s[3], s[4], s[5]], yaw: s[6] / 1000, pitch: s[7] / 1000, roll: s[8] / 1000, flags: s[9] }; this.ship.flags = s[9]; }
      if (role !== 'gunner') { this.gunT = { gy: m.g[0] / 1000, gp: m.g[1] / 1000 }; this.gun.lk = m.g[2] || 0; }
      for (const [id, x, y, z, yw, pt, hp, fl] of m.e) {
        const e = this.ents.get(id); if (!e) continue;
        if (!e.tp || this.T - e.seen > 1) { e.p = [x, y, z]; e.yaw = yw / 100; }
        e.fp = [...e.p]; e.tp = [x, y, z]; e.fy = e.yaw; e.ty = yw / 100; e.pitch = pt / 100; e.lt = 0; e.hp = hp; e.fl = fl; e.seen = this.T;
        e.st = fl & 1 ? 'attack' : 'idle'; e.frz = fl & 2 ? 1 : 0; e.stun = fl & 4 ? 1 : 0;
      }
    }
    step(dt) {
      if (this.paused || this.over) return;
      this.T += dt; updatePlanets(this.T);
      for (const e of this.ents.values()) {
        if (e.still) continue;
        if (!e.tp) continue;
        e.lt = Math.min(1.8, e.lt + dt / 0.125);
        const k = e.lt, d = sub(e.tp, e.fp);
        e.p = wrapP(add(e.fp, mul(d, k)));
        e.yaw = e.fy + wrapA(e.ty - e.fy) * Math.min(1, k);
      }
      for (const s of [...this.shots.values()]) { s.t += dt; s.p = wrapP(add(s.p, mul(s.v, dt))); if (s.t > 4) this.shots.delete(s.id); }
      for (const b of [...this.bul.values()]) { b.t += dt; b.p = wrapP(add(b.p, mul(b.v, dt))); if (b.t > b.life) this.bul.delete(b.id); }
      for (const c of this.clouds) c.t -= dt; this.clouds = this.clouds.filter(c => c.t > 0);
      if (this.shipT) {
        const s = this.ship, t = this.shipT, k = Math.min(1, dt * 12);
        t.p = wrapP(add(t.p, mul(t.v, dt)));
        s.p = wrapP(add(s.p, mul(sub(t.p, s.p), k))); s.v = t.v; s.yaw += wrapA(t.yaw - s.yaw) * k; s.pitch += (t.pitch - s.pitch) * k; s.roll += (t.roll - s.roll) * k;
      }
      if (this.gunT) { this.gun.gy += wrapA(this.gunT.gy - this.gun.gy) * Math.min(1, dt * 10); this.gun.gp += (this.gunT.gp - this.gun.gp) * Math.min(1, dt * 10); }
      if (this.scan) this.scan.t += dt;
    }
  }

  // ---------- pilot ----------
  function nearestPlanet(p) {
    let best = null;
    PLANETS.forEach((pl, i) => { const d = len(sub(pl.p, p)); if (!best || d - pl.R < best.d - best.pl.R) best = { pl, i, d }; });
    return best;
  }
  class PilotCtl {
    constructor() { this.cd = 0; this.dodgeT = 0; this.rollDir = 1; this.gmax = 0; this.crash = false; }
    update(dt, st, inp) {
      const sh = st.ship;
      if (st.paused || st.over) { sh.flags &= ~(F.BOOST | F.SHIELD); return null; }
      const scanning = !!st.scan;
      let ev = null;
      const yr = -(inp.rx || 0) * 1.7 - (inp.tl || 0) * 2.4;
      const pr = -(inp.ry || 0) * (inp.invert ? -1 : 1) * 1.3 + (inp.tp || 0) * 1.8;
      if (!scanning) { sh.yaw = wrapA(sh.yaw + yr * dt); sh.pitch = clamp(sh.pitch + pr * dt, -1.35, 1.35); }
      const B = basis(sh.yaw, sh.pitch), en = st.en > 1;
      const boost = !!inp.boost && en && !scanning, shield = !!inp.shield && en;
      let acc = [0, 0, 0];
      if (!scanning) acc = add(add(mul(B.f, -(inp.ly || 0) * 260 + (boost ? 620 : 0)), mul(B.r, (inp.lx || 0) * 220)), mul(B.u, (inp.up || 0) * 220));
      this.gmax = 0; this.gdir = null;
      const docked = len(sub(sh.p, STATION)) < 650;
      if (!scanning && !docked) for (const pl of BODIES) {
        const d = sub(pl.p, sh.p), r = len(d);
        if (r < pl.R * 6) { const g = pl.g * (pl.R / r) ** 2; acc = add(acc, mul(d, g / r)); if (g > this.gmax) { this.gmax = g; this.gdir = mul(d, 1 / r); } }
      }
      sh.v = add(sh.v, mul(acc, dt));
      sh.v = mul(sh.v, Math.exp(-(scanning ? 4 : inp.brake ? 2.6 : 0.85) * dt));
      const spd = len(sh.v); if (spd > 950) sh.v = mul(sh.v, 950 / spd);
      this.cd -= dt;
      if (inp.dodge && this.cd <= 0 && !scanning) { this.rollDir = (inp.lx || 0) < -0.2 ? -1 : 1; sh.v = add(sh.v, mul(B.r, this.rollDir * 430)); this.dodgeT = 0.5; this.cd = 1.1; ev = 'dodge'; }
      this.dodgeT -= dt;
      sh.p = wrapP(add(sh.p, mul(sh.v, dt)));
      if (scanning && PLANETS[st.scan.pi]) sh.p = wrapP(add(sh.p, mul(PLANETS[st.scan.pi].v, dt)));
      for (const e of st.ents.values()) {
        if (e.dead || (!e.still && !e.d.dmg && e.r < 60)) continue;
        const dd = sub(sh.p, e.p), R = e.r + SHIP_R;
        if (Math.abs(dd[0]) > R || Math.abs(dd[1]) > R || Math.abs(dd[2]) > R) continue;
        const dl = len(dd); if (dl >= R) continue;
        const n = mul(dd, 1 / (dl || 1)); sh.p = wrapP(add(e.p, mul(n, R)));
        const vn = dot(sh.v, n); if (vn < 0) sh.v = sub3(sh.v, mul(n, vn * 1.5));
      }
      const tRoll = clamp(-yr * 0.35 - (inp.lx || 0) * 0.25, -0.7, 0.7);
      sh.roll = this.dodgeT > 0 ? tRoll + this.rollDir * (1 - this.dodgeT / 0.5) * TAU : sh.roll + (wrapA(tRoll - sh.roll)) * Math.min(1, dt * 5);
      sh.flags = (this.dodgeT > 0 ? F.DODGE : 0) | (shield ? F.SHIELD : 0) | (boost ? F.BOOST : 0) | (scanning ? F.SCAN : 0);
      if (inp.scan) ev = 'scan';
      return ev;
    }
    msg(sh) { return { t: 'p', p: [r1(sh.p[0]), r1(sh.p[1]), r1(sh.p[2])], v: sh.v.map(Math.round), y: Math.round(sh.yaw * 1000), pt: Math.round(sh.pitch * 1000), r: Math.round(wrapA(sh.roll) * 1000), f: sh.flags }; }
  }

  // ---------- gunner ----------
  const sameTail = (buf, c) => buf.length >= c.length && c.every((k, i) => buf[buf.length - c.length + i] === k);
  function matchSkill(buf) { let best = null; for (const k in SKILLS) if (sameTail(buf, SKILLS[k].combo) && (!best || SKILLS[k].combo.length > SKILLS[best].combo.length)) best = k; return best; }
  class GunnerCtl {
    constructor() { this.gy = 0; this.gp = 0; this.fireT = 0; this.charge = 0; this.cds = {}; this.buf = []; this.bufT = 0; this.scanT = 0; this.scanId = 0; this.yUsed = false; this.target = null; this.botT = 0; }
    dir(st) { const sh = st.ship; return fwdOf(sh.yaw + this.gy, clamp(sh.pitch + this.gp, -1.5, 1.5)); }
    // nearest enemy (attackers first), else the nearest creature or machine
    nearest(st, range) {
      const sh = st.ship; let best = null, bs = 1e9;
      for (const e of st.ents.values()) {
        if (e.dead || !(e.hp > 0) || e.d.cat === 'object' || e.type === 'station' || (st.rep && !e.still && st.T - e.seen > 1)) continue;
        const dl = len(sub(e.p, sh.p)); if (dl > range) continue;
        const score = dl * (e.d.cat === 'hostile' ? (e.st === 'attack' ? 0.5 : 0.8) : 1.6);
        if (score < bs) { bs = score; best = e; }
      }
      return best;
    }
    // called when one of the gunner's shots hits something: lock on to it if nothing is locked
    onHit(st, id) {
      if (this.lock) return false;
      const e = st.ents.get(id); if (!e || e.dead || e.d.cat === 'object' || e.type === 'station') return false;
      this.lock = id; return true;
    }
    pick(st, dir) {
      const o = st.ship.p; let best = null, bestA = 1;
      for (const e of st.ents.values()) {
        if (e.dead || e.type === 'station' || (st.rep && !e.still && st.T - e.seen > 1)) continue;
        const rel = sub(e.p, o), dl = len(rel); if (dl > 2200 || dl < 1) continue;
        const a = Math.acos(clamp(dot(rel, dir) / dl, -1, 1)), lim = Math.atan(e.r / dl) + 0.03;
        if (a < lim && a / lim < bestA) { bestA = a / lim; best = e; }
      }
      return best;
    }
    update(dt, st, inp) {
      const out = [];
      for (const k in this.cds) this.cds[k] = Math.max(0, this.cds[k] - dt);
      if (st.paused || st.over) return out;
      // the turret view is stabilised: it keeps looking at the same place in space while the pilot turns,
      // and only moves when the gunner moves it.
      // Lock-on: hitting an enemy (or L1+R1) locks it, and the view then follows it on its own.
      const sh = st.ship;
      if (this.ay == null) { this.ay = sh.yaw; this.ap = sh.pitch; }
      if (this.lock) {
        const e = st.ents.get(this.lock);
        if (!e || e.dead || len(sub(e.p, sh.p)) > 2600 || (st.rep && !e.still && st.T - e.seen > 1)) { this.lock = 0; out.push({ local: 'unlock', lost: true }); }
      }
      const both = !!(inp.l1 && inp.r1);
      if (both && !this.bothHeld) {
        if (this.lock) { this.lock = 0; out.push({ local: 'unlock' }); }
        else { const e = this.nearest(st, 1800); if (e) { this.lock = e.id; out.push({ local: 'lock', type: e.type }); } else this.snap = 0.7; }
      }
      this.bothHeld = both;
      if (both) inp = Object.assign({}, inp, { l1: false, r1: false, tl: 0 });
      const manual = !both && (inp.l1 || inp.r1 || inp.l2 || inp.r2 || Math.abs(inp.tl || 0) > 0.45);
      if (this.lock && manual && !inp.aim) { this.lock = 0; out.push({ local: 'unlock' }); }
      if (this.snap > 0) { this.snap -= dt; this.ay += wrapA(sh.yaw - this.ay) * Math.min(1, dt * 6); this.ap += (sh.pitch - this.ap) * Math.min(1, dt * 6); }
      else if (inp.aim) { this.ay += wrapA(sh.yaw + inp.aim.gy - this.ay) * Math.min(1, dt * 5); this.ap += (sh.pitch + inp.aim.gp - this.ap) * Math.min(1, dt * 5); }
      else if (this.lock) {
        const e = st.ents.get(this.lock), rel = sub(e.p, sh.p), dl = len(rel) || 1;
        this.ay += wrapA(Math.atan2(rel[1], rel[0]) - this.ay) * Math.min(1, dt * 9); this.ap += (Math.asin(clamp(rel[2] / dl, -1, 1)) - this.ap) * Math.min(1, dt * 9);
      } else {
        const yr = ((inp.l1 ? 1 : 0) - (inp.r1 ? 1 : 0)) * 1.8 - (inp.tl || 0) * 2.6;
        this.ay = wrapA(this.ay + yr * dt);
        if (inp.tilt) this.ap += (clamp((inp.tp || 0) * 1.5, -1.4, 1.4) - this.ap) * Math.min(1, dt * 6);
        else this.ap = clamp(this.ap + ((inp.l2 ? 1 : 0) - (inp.r2 ? 1 : 0)) * 1.3 * dt, -1.45, 1.45);
      }
      st.gun.lk = this.lock || 0;
      this.gy = wrapA(this.ay - sh.yaw); this.gp = this.ap - sh.pitch;
      st.gun.gy = this.gy; st.gun.gp = this.gp;
      const dir = this.dir(st), q = dir.map(v => Math.round(v * 1000) / 1000);
      this.target = this.pick(st, dir);
      this.fireT -= dt;
      if (inp.fire && this.fireT <= 0) { this.fireT = 0.12; out.push({ t: 'fire', d: q }, { local: 'gun' }); }
      if (inp.beam) { this.charge = Math.min(1.2, this.charge + dt); }
      else if (this.charge > 0) { if (this.charge >= 0.25) out.push({ t: 'beam', d: q, c: Math.round(this.charge / 1.2 * 100) / 100 }, { local: 'beam' }); this.charge = 0; }
      this.bufT -= dt; if (this.bufT <= 0) this.buf = [];
      for (const k of inp.arrows || []) { this.buf.push(k); if (this.buf.length > 5) this.buf.shift(); this.bufT = 1.6; out.push({ local: 'tick' }); }
      const doSkill = k => { if (this.cds[k] > 0) { out.push({ local: 'cd', k }); return; } this.cds[k] = SKILLS[k].cd; out.push({ t: 'skill', k, d: q }, { local: 'skill', k }); };
      if (inp.botSkill) doSkill(inp.botSkill);
      if (inp.x) { const k = matchSkill(this.buf); if (k) doSkill(k); else out.push({ local: 'fizzle' }); this.buf = []; }
      if (inp.botUlt || (inp.yTap && this.buf.length)) {
        if (inp.botUlt || sameTail(this.buf, ULT.combo)) { if (st.ult >= 100) out.push({ t: 'ult', d: q }, { local: 'ult' }); else out.push({ local: 'noult' }); }
        else out.push({ local: 'fizzle' });
        this.buf = []; this.yUsed = true;
      }
      if (inp.yDown && !this.yUsed) {
        const tg = this.target;
        if (tg && tg.id === this.scanId) { this.scanT += dt; if (this.scanT >= 1.2) { out.push({ t: 'scanE', type: tg.type }, { local: 'scanned', type: tg.type }); this.yUsed = true; this.scanT = 0; } }
        else { this.scanId = tg ? tg.id : 0; this.scanT = 0; }
      } else { if (!inp.yDown) this.yUsed = false; this.scanT = 0; }
      return out;
    }
    msg() { return { t: 'g', gy: Math.round(this.gy * 1000), gp: Math.round(this.gp * 1000), lk: this.lock || 0 }; }
  }

  // ---------- solo trial helpers ----------
  function botGunnerInput(ctl, st, dt) {
    const inp = { arrows: [] };
    if (st.mode !== 'combat') return inp;
    const sh = st.ship; let best = null, bd = 1700;
    for (const e of st.ents.values()) { if (e.dead || e.d.cat !== 'hostile' || !(e.hp > 0)) continue; const dl = len(sub(e.p, sh.p)); if (dl < bd) { bd = dl; best = e; } }
    if (!best) return inp;
    const rel = sub(best.p, sh.p), yaw = Math.atan2(rel[1], rel[0]), pit = Math.asin(clamp(rel[2] / len(rel), -1, 1));
    inp.aim = { gy: wrapA(yaw - sh.yaw), gp: clamp(pit - sh.pitch, -1.25, 1.25) };
    const dir = ctl.dir(st), a = Math.acos(clamp(dot(rel, dir) / len(rel), -1, 1));
    inp.fire = a < 0.08;
    ctl.botT -= dt;
    if (ctl.botT <= 0 && a < 0.1) {
      ctl.botT = 2.5;
      const pref = (best.d.weak || []).find(k => SKILLS[k] && !(ctl.cds[k] > 0));
      if (pref) inp.botSkill = pref; else if (st.ult >= 100) inp.botUlt = true;
    }
    return inp;
  }
  // autopilot for the gunner trial: tours the planets, scans each one, then goes home
  function botPilotInput(bot, st) {
    const sh = st.ship, inp = { lx: 0, ly: 0, rx: 0, ry: 0, up: 0 };
    if (bot.wp == null) { bot.wp = 0; bot.order = [0, 1, 6, 3, 5, 4, 7, 2]; }
    if (st.scan) return inp;
    let target, scanAt = null;
    const pl = PLANETS[bot.order[bot.wp % bot.order.length]];
    const away = norm(sub(sh.p, pl.p));
    target = add(pl.p, mul(away, pl.R * 2.2)); scanAt = pl;
    let want = sub(target, sh.p);
    const dist = len(want);
    if (st.mode === 'combat') {
      let foe = null, fd = 2000; for (const e of st.ents.values()) { if (e.dead || e.st !== 'attack') continue; const dl = len(sub(e.p, sh.p)); if (dl < fd) { fd = dl; foe = e; } }
      if (foe) { want = sub(foe.p, sh.p); inp.lx = Math.sin(st.T * 0.8) * 0.8; inp.ly = fd < 500 ? 0.5 : -0.3; }
    }
    // go around planets that are in the way
    const wd0 = norm(want), wl = len(want);
    for (const p2 of BODIES) {
      if (p2 === pl) continue;
      const rel = sub(p2.p, sh.p), t = dot(rel, wd0); if (t < 0 || t > wl) continue;
      const off = sub3(mul(wd0, t), rel), c = len(off);
      if (c < p2.R * 1.8) { want = sub(add(p2.p, mul(norm(c > 1 ? off : cross(wd0, [0, 0, 1])), p2.R * 2.3)), sh.p); break; }
    }
    const B = basis(sh.yaw, sh.pitch);
    // keep out of strong gravity: thrust straight away from the planet, even before turning
    let np = nearestPlanet(sh.p); const ds = len(sub(sh.p, SUN.p));
    if (ds < SUN.R * 2.2) np = { pl: SUN, d: ds };
    // look ahead along our motion: if a (moving) planet will come too close, treat it as danger now
    for (const b of BODIES) {
      const rel = sub(b.p, sh.p), rv = sub3(sh.v, b.v), v2 = dot(rv, rv); if (v2 < 100) continue;
      const t = dot(rel, rv) / v2; if (t < 0 || t > 4) continue;
      if (len(sub3(rel, mul(rv, t))) < b.R * 1.9 && (b !== pl || len(rel) < b.R * 2.6)) { np = { pl: b, d: Math.min(len(rel), b.R * 1.8) }; inp.brake = true; break; }
    }
    if (np && np.d < np.pl.R * (np.pl === pl ? 1.6 : 1.9) || np.pl === SUN) {
      const awayP = norm(sub(sh.p, np.pl.p)); want = awayP; inp.boost = true;
      inp.ly = -dot(awayP, B.f); inp.lx = dot(awayP, B.r); inp.up = dot(awayP, B.u);
      const wy = Math.atan2(want[1], want[0]), wp = Math.asin(clamp(want[2], -1, 1));
      inp.rx = clamp(-wrapA(wy - sh.yaw) * 1.6, -1, 1); inp.ry = clamp(-(wp - sh.pitch) * 1.6, -1, 1);
      return inp;
    }
    // dodge rocks ahead
    for (const e of st.ents.values()) {
      if (e.dead || !e.d.dmg) continue; const rel = sub(e.p, sh.p), t = dot(rel, B.f); if (t < 0 || t > 450) continue;
      const side = len(sub3(rel, mul(B.f, t))); if (side < e.r + 40) { inp.up = dot(rel, B.u) > 0 ? -1 : 1; inp.lx = dot(rel, B.r) > 0 ? -1 : 1; }
    }
    const wy = Math.atan2(want[1], want[0]), wp = Math.asin(clamp(want[2] / (len(want) || 1), -1, 1));
    const ey = wrapA(wy - sh.yaw), ep = wp - sh.pitch;
    inp.rx = clamp(-ey * 1.6, -1, 1); inp.ry = clamp(-ep * 1.6, -1, 1);
    const aligned = Math.abs(ey) < 0.35 && Math.abs(ep) < 0.35;
    if (st.mode !== 'combat') {
      inp.ly = aligned ? -1 : -0.15; inp.boost = inp.boost || (aligned && dist > 2500);
      if (dist < 260) { inp.ly = 0; inp.brake = true; if (len(sh.v) < 60 && scanAt) { inp.scan = true; bot.wp++; } }
    }
    return inp;
  }

  window.W3 = {
    TAU, WS, HW, MAXHP, SHIP_R, F, wd, sub, add, mul, len, dot, norm, cross, basis, fwdOf, wrapP, wrapA, clamp,
    SKILLS, ULT, KIND_JP, DEFS, BOOK_ORDER, CAT_JP, PLANETS, SUN, BODIES, updatePlanets, STATION, scanDur, nearestPlanet,
    World, Replica, PilotCtl, GunnerCtl, botGunnerInput, botPilotInput, rngOf, generate,
  };
})();

// App flow: loading, menus, room code, role select, the game loop, guidebook, pause and results.
(function () {
  const { World, Replica, PilotCtl, GunnerCtl, botGunnerInput, botPilotInput, PLANETS, DEFS } = W3;
  const $ = id => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d');
  const store = { get(k, d) { try { const v = localStorage.getItem('futari.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('futari.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } } };

  const G = window.G = {
    mode: null, role: null, playing: false, world: null, rep: null, st: null, seed: 0,
    pilotCtl: null, gunnerCtl: new GunnerCtl(), bot: {}, sendT: 0, snapT: 0, view: store.get('view', 0),
    vis: store.get('vis', 64) / 100, visNow: 1, partnerText: '', partnerOk: true,
    tilt: { pilot: store.get('tiltPilot', false), gunner: store.get('tiltGunner', false) }, invert: store.get('invert', false),
    planetStyle: store.get('planetStyle', 'pixel'), saveT: 10,
    lobby: { pilot: null, gunner: null }, cursor: 'pilot', screen: 'load', loaded: false, ended: false, tiltOn: false,
  };
  Sfx.on = store.get('sound', true);

  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
    // in a game the role decides: the gunner (Pocket Taco) always uses the top part, the pilot the whole screen
    G.visNow = G.playing ? (G.role === 'gunner' ? G.vis : 1) : (innerHeight > innerWidth ? G.vis : 1);
    document.documentElement.style.setProperty('--uih', (G.visNow * 100) + '%');
  }
  addEventListener('resize', resize); resize();

  // ---------- menus ----------
  const Menu = {
    items: [], i: 0,
    set(sec) { this.items = sec ? [...sec.querySelectorAll('nav button')].filter(b => !b.hidden) : []; this.i = 0; this.paint(); },
    paint() { this.items.forEach((b, k) => b.classList.toggle('focus', k === this.i)); if (this.items[this.i]) this.items[this.i].scrollIntoView({ block: 'nearest' }); },
    move(d) { if (!this.items.length) return; this.i = (this.i + d + this.items.length) % this.items.length; this.paint(); Sfx.play('select'); },
    tick() {
      if (Input.nav('DOWN')) this.move(1);
      if (Input.nav('UP')) this.move(-1);
      if (Input.pressed('A') && this.items[this.i]) this.items[this.i].click();
      else if (Input.pressed('B')) back();
    },
  };
  function show(id) {
    for (const s of document.querySelectorAll('.screen')) if (s.id !== 's-book') s.hidden = s.id !== 's-' + id;
    G.screen = id; window.__typing = id === 'join';
    Menu.set(id ? $('s-' + id) : null);
  }
  function back() {
    const s = G.screen;
    if (s === 'host' || s === 'join' || s === 'lobby') { Net.close(); show('title'); }
    else if (s === 'solo' || s === 'howto' || s === 'settings') show('title');
    else if (s === 'start') { pendingStart = null; show(Net.connected() ? 'lobby' : 'title'); if (Net.connected()) paintLobby(); }
    else if (s === 'pause') resume();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    Sfx.unlock();
    if (b.dataset.back !== undefined) return back();
    if (b.dataset.go) return go(b.dataset.go);
    if (b.dataset.solo) return startSolo(b.dataset.solo);
  });
  function go(where) {
    if (where === 'host') {
      show('host'); $('hostCode').textContent = '····';
      if (!Net.available()) { $('hostStatus').textContent = 'マルチプレイにはインターネットが必要です。'; return; }
      $('hostStatus').textContent = 'ルームを準備しています…'; G.mode = 'host'; Net.host();
    } else if (where === 'join') { show('join'); joinState.slot = 0; paintSlots(); $('joinStatus').textContent = Net.available() ? '' : 'マルチプレイにはインターネットが必要です。'; }
    else if (where === 'book') { Book.show(store.get('lastRole', 'gunner')); }
    else { show(where); if (where === 'settings') paintSettings(); }
  }

  // ---------- join code entry ----------
  const joinState = { code: store.get('lastCode', 'AAAA').split(''), slot: 0 };
  function paintSlots() { [...$('slots').children].forEach((s, i) => { s.textContent = joinState.code[i]; s.classList.toggle('on', i === joinState.slot); }); }
  function joinTick() {
    const A = Net.ABC;
    if (Input.nav('LEFT')) { joinState.slot = (joinState.slot + 3) % 4; paintSlots(); Sfx.play('select'); }
    if (Input.nav('RIGHT')) { joinState.slot = (joinState.slot + 1) % 4; paintSlots(); Sfx.play('select'); }
    for (const [k, d] of [['UP', -1], ['DOWN', 1]]) if (Input.nav(k)) { const c = joinState.code[joinState.slot]; joinState.code[joinState.slot] = A[(A.indexOf(c) + d + A.length) % A.length] || 'A'; paintSlots(); Sfx.play('select'); }
    if (Input.pressed('A') || Input.pressed('START')) doJoin();
    if (Input.pressed('B')) back();
  }
  addEventListener('keydown', e => {
    if (G.screen !== 'join' || document.activeElement === $('codeInput')) return;
    if (/^Key[A-Z]$/.test(e.code)) { const ch = e.code.slice(3); if (!Net.ABC.includes(ch)) return; joinState.code[joinState.slot] = ch; joinState.slot = Math.min(3, joinState.slot + 1); paintSlots(); }
    else if (e.code === 'Backspace') { joinState.slot = Math.max(0, joinState.slot - 1); paintSlots(); }
  });
  $('codeInput').addEventListener('input', e => {
    const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').split('').filter(c => Net.ABC.includes(c)).slice(0, 4);
    v.forEach((c, i) => joinState.code[i] = c); joinState.slot = Math.min(3, v.length); paintSlots();
    if (v.length === 4) { e.target.blur(); doJoin(); }
  });
  $('joinType').onclick = () => { const i = $('codeInput'); i.value = ''; i.focus(); };
  $('joinGo').onclick = doJoin;
  function doJoin() {
    if (!Net.available()) return;
    const code = joinState.code.join(''); store.set('lastCode', code);
    $('joinStatus').textContent = 'つないでいます…'; $('joinStatus').style.color = 'var(--dim)';
    G.mode = 'guest'; Net.join(code);
  }

  // ---------- lobby ----------
  function enterLobby() { G.lobby = { pilot: null, gunner: null }; G.cursor = 'pilot'; show('lobby'); paintLobby(); if (Net.isHost) sendLobby(); }
  const me = () => Net.isHost ? 'host' : 'guest';
  function paintLobby() {
    for (const el of document.querySelectorAll('.role')) {
      const r = el.dataset.role, who = G.lobby[r];
      el.classList.toggle('cur', G.cursor === r); el.classList.toggle('mine', who === me()); el.classList.toggle('theirs', !!who && who !== me());
      el.querySelector('.who').textContent = who ? (who === me() ? 'あなた' : 'あいて') : '';
    }
    const ready = G.lobby.pilot && G.lobby.gunner;
    $('lobbyStart').hidden = !Net.isHost;
    $('lobbyStatus').textContent = ready ? (Net.isHost ? 'START で出発！' : 'ホストの出発を待っています…') : '役を決めてください';
    Menu.set($('s-lobby'));
  }
  function pickRole(who, role) { const other = role === 'pilot' ? 'gunner' : 'pilot'; if (G.lobby[role] && G.lobby[role] !== who) return false; if (G.lobby[other] === who) G.lobby[other] = null; G.lobby[role] = who; return true; }
  function sendLobby() { Net.send({ t: 'lobby', l: G.lobby }); }
  function lobbyTick() {
    if (Input.pressed('LEFT') || Input.pressed('RIGHT')) { G.cursor = G.cursor === 'pilot' ? 'gunner' : 'pilot'; paintLobby(); Sfx.play('select'); }
    if (Input.pressed('A')) choose(G.cursor);
    if (Input.pressed('START')) $('lobbyStart').click();
    if (Input.pressed('B')) back();
  }
  function choose(role) { if (Net.isHost) { if (pickRole('host', role)) { sendLobby(); Sfx.play('tick'); } paintLobby(); } else { Net.send({ t: 'pick', role }); Sfx.play('tick'); } }
  for (const el of document.querySelectorAll('.role')) el.addEventListener('click', () => { G.cursor = el.dataset.role; choose(el.dataset.role); });
  $('lobbyStart').onclick = () => {
    if (!Net.isHost || !(G.lobby.pilot && G.lobby.gunner)) return;
    askStart(sv => { const seed = sv ? sv.seed : newSeed(); Net.send({ t: 'start', seed, save: sv }); begin('host', G.lobby.pilot === 'host' ? 'pilot' : 'gunner', seed, sv); });
  };

  // ---------- network ----------
  Net.onState = (s, info) => {
    if (s === 'hosting') { $('hostCode').textContent = info; $('hostStatus').textContent = '相手にこのコードを伝えて、待っていてください。'; }
    else if (s === 'connected') { G.partnerOk = true; G.partnerText = 'あいて：接続中'; if (!G.playing) enterLobby(); }
    else if (s === 'error') {
      if (G.screen === 'join') { $('joinStatus').textContent = info; $('joinStatus').style.color = ''; }
      else if (G.screen === 'host') $('hostStatus').textContent = info;
      else if (G.playing) { G.partnerOk = false; G.partnerText = 'あいて：切断'; }
    } else if (s === 'closed') {
      G.partnerOk = false; G.partnerText = 'あいて：切断されました';
      if (!G.playing && G.screen === 'lobby') show('title');
      if (G.playing && !G.ended) FX3.apply(['msg', '相手との接続が切れました。START → タイトルへ', 6], G.st, G.role);
    }
  };
  Net.onMsg = m => {
    if (Net.isHost) {
      if (m.t === 'pick') { pickRole('guest', m.role); sendLobby(); paintLobby(); }
      else if (m.t === 'quit') { G.partnerOk = false; G.partnerText = 'あいて：タイトルにもどりました'; }
      else if (G.world && G.playing) G.world.handle(m);
    } else {
      if (m.t === 'lobby') { G.lobby = m.l; paintLobby(); }
      else if (m.t === 'start') begin('guest', G.lobby.pilot === 'guest' ? 'pilot' : 'gunner', m.seed, m.save || null);
      else if (m.t === 's' && G.rep) G.rep.snap(m, G.role);
      else if (m.t === 'e' && G.rep) for (const ev of m.l) { G.rep.event(ev); onEvent(ev, G.rep); }
      else if (m.t === 'quit') { G.partnerOk = false; G.partnerText = 'あいて：タイトルにもどりました'; }
    }
  };

  // ---------- game ----------
  // ---------- start: new voyage or continue the saved one ----------
  const newSeed = () => (Math.random() * 1e9) | 0;
  let pendingStart = null;
  function askStart(fn) {
    const sv = store.get('save', null);
    if (!sv) { fn(null); return; }
    pendingStart = fn;
    const d = new Date(sv.at), pad = n => String(n).padStart(2, '0');
    $('stInfo').textContent = `前回の旅：${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}　飛んだ時間 ${Math.floor(sv.T / 60)}分　船体 ${Math.ceil(sv.hp)}/${W3.MAXHP}　スキャンした惑星 ${sv.stats.scansP}`;
    show('start');
  }
  $('stCont').onclick = () => { const f = pendingStart; pendingStart = null; if (f) f(store.get('save', null)); };
  $('stNew').onclick = () => { const f = pendingStart; pendingStart = null; if (f) f(null); };
  function startSolo(role) { askStart(sv => begin('solo', role, sv ? sv.seed : newSeed(), sv)); }
  function begin(mode, role, seed, save) {
    G.mode = mode; G.role = role; G.seed = seed; G.playing = true; G.ended = false; store.set('lastRole', role);
    FX3.reset(); G.pilotCtl = new PilotCtl(); G.gunnerCtl = new GunnerCtl(); G.bot = {}; HUD.camS.init = false;
    if (mode === 'guest') { G.rep = new Replica(seed, save); G.world = null; G.st = G.rep; }
    else { G.world = new World(seed, { training: mode === 'solo' && role === 'gunner', save }); G.rep = null; G.st = G.world; }
    G.saveT = 10;
    G.partnerText = mode === 'solo' ? (role === 'pilot' ? 'ソロ：ガンナーは自動で撃ち続ける' : 'ソロ（トレーニング）：船は自動で飛ぶ') : G.partnerText;
    G.training = mode === 'solo' && role === 'gunner';
    applyTilt(); lockOrientation(role); resize();
    show(null);
    FX3.apply(['msg', role === 'pilot' ? '発進！ 惑星をさがしてスキャンしよう' : '砲台につきました。L1/R1・L2/R2 で見回せます', 4], G.st, role);
  }
  // pilot = landscape, gunner = portrait (works when installed as an app, or in full screen)
  async function lockOrientation(role) {
    const want = role === 'pilot' ? 'landscape' : 'portrait';
    try { const app = matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches; if (!app && !document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); } catch (e) { /* needs a tap */ }
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock(want); } catch (e) { /* not allowed here */ }
  }
  async function applyTilt() {
    const want = G.playing && G.tilt[G.role];
    if (want && !Tilt.on) { const ok = await Tilt.enable(); if (!ok) { G.tilt[G.role] = false; FX3.toast('チルトを使えませんでした（せっていで許可してください）', '#ff4a62', 3); } }
    else if (!want && Tilt.on) Tilt.disable();
    G.tiltOn = G.playing && G.tilt[G.role] && Tilt.on;
  }
  function pilotInput() {
    const s = Input.stick(), s2 = Input.stick2(), tl = G.tiltOn ? Tilt.read() : { lean: 0, pitch: 0 };
    return { lx: s.x, ly: s.y, rx: s2.x, ry: s2.y, up: (Input.down('R1') ? 1 : 0) - (Input.down('L1') ? 1 : 0), boost: Input.value('R2') > 0.3, brake: Input.value('L2') > 0.3, dodge: Input.pressed('A'), shield: Input.down('B'), scan: Input.pressed('X'), tl: clampT(tl.lean), tp: clampT(tl.pitch), invert: G.invert };
  }
  const clampT = v => Math.max(-1, Math.min(1, v / 0.6));
  function gunnerInput() {
    const tl = G.tiltOn ? Tilt.read() : { lean: 0, pitch: 0 };
    return { fire: Input.down('A'), beam: Input.down('B'), x: Input.pressed('X'), yTap: Input.pressed('Y'), yDown: Input.down('Y'), arrows: ['UP', 'DOWN', 'LEFT', 'RIGHT'].filter(k => Input.pressed(k)), l1: Input.down('L1'), r1: Input.down('R1'), l2: Input.down('L2'), r2: Input.down('R2'), tl: clampT(tl.lean), tp: tl.pitch, tilt: G.tiltOn };
  }
  const idleP = { lx: 0, ly: 0, rx: 0, ry: 0 }, idleG = { arrows: [] };
  function pilotEvent(ev, st, send) {
    if (ev === 'dodge') Sfx.play('dodge');
    if (ev === 'scan') {
      if (st.scan) send({ t: 'pscan', on: false });
      else { const np = HUD.scanTarget(st); if (np) { send({ t: 'pscan', on: true, pi: np.i }); Sfx.play('scan'); } else FX3.toast('スキャンできる惑星が近くにない', '#8b90b3', 1.6); }
    }
  }
  function gunnerOut(list, st, send) {
    for (const m of list) {
      if (!m.local) { send(m); continue; }
      const c = G.gunnerCtl;
      switch (m.local) {
        case 'gun': Sfx.play('gun'); break;
        case 'beam': Sfx.play('beam'); break;
        case 'tick': Sfx.play('tick'); break;
        case 'skill': Sfx.play('skill'); FX3.toast(W3.SKILLS[m.k].jp + '！', '#ffe68a', 1.2); break;
        case 'fizzle': Sfx.play('fizzle'); c.missT = 0.5; FX3.toast('不発…（コンボがちがう）', '#ff4a62', 1.2); break;
        case 'cd': Sfx.play('fizzle'); FX3.toast(`${W3.SKILLS[m.k].jp} はまだ使えない`, '#8b90b3', 1.2); break;
        case 'noult': Sfx.play('fizzle'); FX3.toast('ノヴァのゲージがまだたまっていない', '#8b90b3', 1.4); break;
        case 'ult': break;
        case 'scanned': Sfx.play('scan'); break;
        case 'lock': Sfx.play('tick'); FX3.toast(`ロックオン：${Book.has('e', m.type) ? DEFS[m.type].jp : '？？？'}（L1+R1 で解除）`, '#ffb547', 1.8); break;
        case 'unlock': FX3.toast(m.lost ? 'ロックが外れた' : 'ロック解除', '#8b90b3', 1.2); break;
      }
    }
  }
  function onEvent(ev, st) {
    FX3.apply(ev, st, G.role);
    const k = ev[0];
    // the gunner's shot hit something: lock on to it (if nothing is locked yet)
    if (k === 'h' && G.role === 'gunner' && G.gunnerCtl.onHit(st, ev[1])) { const e = st.ents.get(ev[1]); Sfx.play('tick'); FX3.toast(`ロックオン：${e && Book.has('e', e.type) ? e.d.jp : '？？？'}`, '#ffb547', 1.6); }
    if (k === 'book') {
      const fresh = Book.unlock(ev[1], ev[2]);
      const name = ev[1] === 'e' ? DEFS[ev[2]].jp : PLANETS[ev[2]].name;
      if (fresh) { Sfx.play('book'); FX3.toast(`図鑑に追加：${name}（SELECTで見る）`, '#7dff8a', 3.5); if (ev[1] === 'p' && Book.count('p') === PLANETS.length) FX3.apply(['msg', 'すべての惑星をスキャンした！ 探索完了！', 6], st, G.role); }
      else FX3.toast(`${name}：もう図鑑にのっています`, '#8b90b3', 2);
    }
    if (k === 'pause') { if (ev[1]) openPause(); else if (G.screen === 'pause') show(null); }
    if (k === 'end') { G.ended = true; if (G.mode !== 'guest') store.set('save', null); setTimeout(() => showResult(ev[1], ev[2], ev[3]), 1800); }
  }
  function gameTick(dt) {
    const st = G.st, inMenu = G.screen === 'pause' || G.screen === 'result';
    if (Book.open) { if (Book.tick() === 'close' && G.mode === 'solo' && G.world) G.world.paused = false; }
    else if (!inMenu && Input.pressed('SELECT')) { Book.show(G.role); if (G.mode === 'solo') G.world.paused = true; }
    else if (Input.pressed('START') && !inMenu && !G.ended) { togglePause(); }
    else if (inMenu) { Menu.tick(); if (G.screen === 'pause' && Input.pressed('START')) resume(); }
    const busy = Book.open || inMenu;
    if (!busy && G.role === 'pilot' && Input.pressed('Y')) { G.view = 1 - G.view; store.set('view', G.view); FX3.toast(G.view ? '視点：コックピット' : '視点：船のうしろ', '#7ff6ff', 1.2); }
    if (!busy && Input.pressed('L3') && Tilt.on) { Tilt.recenter(); FX3.toast('チルトの中心を合わせました', '#7ff6ff', 1.2); }
    if (G.mode !== 'guest') {
      const w = G.world, local = m => w.handle(m);
      if (G.role === 'pilot') pilotEvent(G.pilotCtl.update(dt, w, busy ? idleP : pilotInput()), w, local);
      else if (G.mode === 'solo') pilotEvent(G.pilotCtl.update(dt, w, botPilotInput(G.bot, w)), w, local);
      if (G.role === 'gunner') gunnerOut(G.gunnerCtl.update(dt, w, busy ? idleG : gunnerInput()), w, local);
      else if (G.mode === 'solo') for (const m of G.gunnerCtl.update(dt, w, botGunnerInput(G.gunnerCtl, w, dt))) if (!m.local) w.handle(m);
      w.step(dt);
      G.saveT -= dt; if (G.saveT <= 0 && !w.over) { G.saveT = 10; saveNow(); }
      const evs = w.out; w.out = [];
      for (const ev of evs) onEvent(ev, w);
      if (G.mode === 'host') { if (evs.length) Net.send({ t: 'e', l: evs }); G.snapT -= dt; if (G.snapT <= 0) { G.snapT = 0.125; Net.send(w.snap()); } }
    } else {
      const r = G.rep, send = m => Net.send(m);
      r.step(dt);
      if (G.role === 'pilot') { pilotEvent(G.pilotCtl.update(dt, r, busy ? idleP : pilotInput()), r, send); G.sendT -= dt; if (G.sendT <= 0) { G.sendT = 0.05; send(G.pilotCtl.msg(r.ship)); } }
      else { gunnerOut(G.gunnerCtl.update(dt, r, busy ? idleG : gunnerInput()), r, send); G.sendT -= dt; if (G.sendT <= 0) { G.sendT = 0.1; send(G.gunnerCtl.msg()); } }
    }
    if (G.gunnerCtl.missT > 0) G.gunnerCtl.missT -= dt;
    FX3.step(dt);
  }
  function saveNow() { if (G.world && !G.world.over && G.mode !== 'guest') store.set('save', G.world.saveState()); }
  function togglePause() {
    if (G.mode === 'solo') { G.world.paused = true; openPause(); }
    else if (G.mode === 'host') G.world.handle({ t: 'pause', on: true });
    else Net.send({ t: 'pause', on: true });
  }
  function openPause() {
    $('pSwap').hidden = G.mode !== 'solo';
    $('pTilt').innerHTML = `チルト（スマホをかたむけて操作）：${G.tilt[G.role] ? 'オン' : 'オフ'}<small>${G.role === 'pilot' ? 'スマホを左右にかたむけて旋回、手前に起こすと上・向こうへ倒すと下' : 'スマホを左右にかたむけると回り続け、手前に起こすと上・向こうへ倒すと下を見る'}</small>`;
    $('pauseInfo').textContent = G.mode === 'solo' ? 'ソロ（お試し）' : `通信量　送信 ${(Net.sentBytes / 1024).toFixed(0)}KB ／ 受信 ${(Net.recvBytes / 1024).toFixed(0)}KB`;
    show('pause');
  }
  function resume() {
    if (G.mode === 'solo') { G.world.paused = false; show(null); }
    else if (G.mode === 'host') G.world.handle({ t: 'pause', on: false });
    else Net.send({ t: 'pause', on: false });
  }
  $('pResume').onclick = resume;
  $('pTilt').onclick = async () => { G.tilt[G.role] = !G.tilt[G.role]; store.set(G.role === 'pilot' ? 'tiltPilot' : 'tiltGunner', G.tilt[G.role]); await applyTilt(); openPause(); Menu.i = 1; Menu.paint(); };
  $('pRecenter').onclick = () => { Tilt.recenter(); FX3.toast('チルトの中心を合わせました', '#7ff6ff', 1.2); };
  $('pSwap').onclick = () => { G.role = G.role === 'pilot' ? 'gunner' : 'pilot'; G.world.training = G.role === 'gunner'; G.training = G.world.training; lockOrientation(G.role); resize(); G.partnerText = G.role === 'pilot' ? 'ソロ：ガンナーは自動で撃ち続ける' : 'ソロ（トレーニング）：船は自動で飛ぶ'; G.bot = {}; applyTilt(); resume(); };
  $('pQuit').onclick = $('rQuit').onclick = () => { saveNow(); if (G.mode !== 'solo') { Net.send({ t: 'quit' }); setTimeout(() => Net.close(), 200); } G.playing = false; G.world = G.rep = null; Book.hide(); if (Tilt.on) Tilt.disable(); try { screen.orientation.unlock(); } catch (e) { /* ignore */ } resize(); show('title'); };
  $('rAgain').onclick = () => {
    if (G.mode === 'solo') begin('solo', G.role, newSeed(), null);
    else if (G.mode === 'host') { const seed = newSeed(); Net.send({ t: 'start', seed }); begin('host', G.role, seed, null); }
  };
  function showResult(reason, info, s) {
    $('rTitle').textContent = reason === 'crash' ? `${info} に墜落…` : reason === 'sun' ? '太陽に突入…' : 'ふたり号 撃沈…';
    $('rTitle').style.color = 'var(--red)';
    $('rStats').innerHTML = `<dt>飛んだ時間</dt><dd>${Math.floor(s.time / 60)}分${s.time % 60}秒</dd><dt>スキャンした惑星</dt><dd>${s.scansP}（図鑑 ${Book.count('p')}/${PLANETS.length}）</dd><dt>スキャンした生きもの・機体</dt><dd>${s.scansE}（図鑑 ${Book.count('e')}/${W3.BOOK_ORDER.length}）</dd><dt>たおした敵</dt><dd>${s.kills}</dd><dt>受けたダメージ</dt><dd>${s.hits}回</dd>`;
    $('rAgain').hidden = G.mode === 'guest';
    $('rNote').textContent = (reason === 'crash' || reason === 'sun' ? '惑星や太陽の近くでは引力に注意。RT の全力加速なら脱出できます。' : '') + (G.mode === 'guest' ? '　ホストが「もう一度」をえらぶと、また始まります。' : '　図鑑の記録は消えません。');
    show('result');
  }

  // ---------- settings ----------
  function paintSettings() {
    $('vis').value = Math.round(G.vis * 100); $('visV').textContent = Math.round(G.vis * 100) + '%';
    $('stTiltP').innerHTML = `パイロットのチルト：${G.tilt.pilot ? 'オン' : 'オフ'}<small>スマホを左右にかたむけて旋回、手前に起こすと上・向こうへ倒すと下（縦にまっすぐが中心）</small>`;
    $('stTiltG').innerHTML = `ガンナーのチルト：${G.tilt.gunner ? 'オン' : 'オフ'}<small>左右にかたむけると回り続け、手前に起こすと上・向こうへ倒すと下を見る</small>`;
    $('stInvert').innerHTML = `パイロットの上下：${G.invert ? '反転（スティック下で上を向く）' : 'ふつう'}`;
    $('soundBtn').innerHTML = '音：' + (Sfx.on ? 'オン' : 'オフ');
    $('stPlanet').innerHTML = `惑星の見た目：${G.planetStyle === 'smooth' ? 'なめらか' : 'ドット（スプライトスタック風）'}`;
  }
  $('stPlanet').onclick = () => { G.planetStyle = G.planetStyle === 'smooth' ? 'pixel' : 'smooth'; store.set('planetStyle', G.planetStyle); paintSettings(); };
  $('vis').addEventListener('input', e => { G.vis = +e.target.value / 100; $('visV').textContent = e.target.value + '%'; store.set('vis', +e.target.value); resize(); });
  $('stTiltP').onclick = async () => { G.tilt.pilot = !G.tilt.pilot; if (G.tilt.pilot && !(await Tilt.enable())) { G.tilt.pilot = false; alertTilt(); } else if (Tilt.on) Tilt.disable(); store.set('tiltPilot', G.tilt.pilot); paintSettings(); };
  $('stTiltG').onclick = async () => { G.tilt.gunner = !G.tilt.gunner; if (G.tilt.gunner && !(await Tilt.enable())) { G.tilt.gunner = false; alertTilt(); } else if (Tilt.on) Tilt.disable(); store.set('tiltGunner', G.tilt.gunner); paintSettings(); };
  const alertTilt = () => { $('stNote').textContent = 'このスマホではチルトを使えないか、許可されませんでした。'; };
  $('stInvert').onclick = () => { G.invert = !G.invert; store.set('invert', G.invert); paintSettings(); };
  $('soundBtn').onclick = () => { Sfx.on = !Sfx.on; store.set('sound', Sfx.on); paintSettings(); };
  function settingsTick() {
    if (Input.nav('LEFT') || Input.nav('RIGHT')) { const v = Math.max(40, Math.min(100, +$('vis').value + (Input.down('LEFT') ? -2 : 2))); $('vis').value = v; $('vis').dispatchEvent(new Event('input')); }
    Menu.tick();
  }

  // ---------- title background ----------
  function drawTitle(t) {
    const W = cv.width, H = cv.height, VH = H * G.visNow;
    if (!G.loaded) { ctx.fillStyle = '#05060d'; ctx.fillRect(0, 0, W, H); return; }
    R3.setCam([-260 + Math.sin(t * 0.05) * 40, -120, 60], 0.35 + Math.sin(t * 0.07) * 0.1, 0.05, 0, W, VH, Math.max(W, VH) * 0.7, VH / 2);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, VH); ctx.clip();
    R3.drawSky(ctx, t);
    const sh = [0, 0, 20 + Math.sin(t * 1.2) * 6];
    R3.drawObj(ctx, 'station', R3.frameOf('station', t, 0), [600, 260, -60], W3.fwdOf(t * 0.05, 0), [0, 0, 1], 3, {});
    R3.drawObj(ctx, 'ship', R3.frameOf('ship', t, 0), sh, W3.fwdOf(0.6, 0.05), W3.basis(0.6, 0.05, Math.sin(t * 0.8) * 0.25).u, 1, {});
    ctx.restore();
    if (VH < H) { ctx.fillStyle = '#000'; ctx.fillRect(0, VH, W, H - VH); }
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = now / 1000;
    Input.poll(dt);
    if (Input.anyPressed()) Sfx.unlock();
    if (G.playing) {
      gameTick(dt);
      if (G.playing && G.st) {
        if (G.role === 'pilot') HUD.pilot(ctx, cv.width, cv.height, G.st, G, t, dt);
        else HUD.gunner(ctx, cv.width, cv.height, G.st, G, t, dt, G.visNow);
      }
    } else {
      drawTitle(t);
      if (Book.open) Book.tick();
      else if (G.screen === 'join') joinTick();
      else if (G.screen === 'lobby') lobbyTick();
      else if (G.screen === 'settings') settingsTick();
      else if (G.screen !== 'load') Menu.tick();
      if (G.screen === 'title') $('padStatus').textContent = Input.padName() ? 'コントローラー：つながっています' : 'コントローラーのボタンを押すと使えます（キーボードでも遊べます）';
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  G.debugStep = (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) { Input.poll(dt); if (G.playing) gameTick(dt); } };

  // ---------- loading: bake sprite stacks (the rest keeps baking in the background) ----------
  const GAME_FRAMES = { ship: 6, raider: 4, raider_g: 4, drone: 8, drone_r: 8, mine: 8, turret: 8, boss: 6, jelly: 8, jelly_b: 8, station: 8, interceptor: 2, gunship: 2, trader: 2, probe: 4, manta: 6, whale: 6, eel: 8, beetle: 4, spore: 6 };
  const FIRST = ['ship', 'station', 'asteroid', 'junk', 'cargo', 'satellite', 'raider', 'drone'];
  const VOXEL_PLANETS = ['earth', 'gas', 'violet', 'moon', 'ice', 'lava', 'desert', 'planet'];
  (async () => {
    const L = SS2.MODELS.filter(m => m.id !== 'gate' && m.id !== 'capsule' && !VOXEL_PLANETS.includes(m.id));
    for (const m of L) if (GAME_FRAMES[m.id]) m.F = GAME_FRAMES[m.id];
    const first = FIRST.map(id => L.find(m => m.id === id)).filter(Boolean), rest = L.filter(m => !FIRST.includes(m.id));
    for (let i = 0; i < first.length; i++) {
      $('loadText').textContent = `宇宙を組み立てています… ${i + 1} / ${first.length}`;
      $('loadBar').style.width = (i / first.length * 100) + '%';
      await new Promise(r => setTimeout(r, 0)); SS2.bakeModel(first[i]);
    }
    const pids = PR.ids();
    for (let i = 0; i < pids.length; i++) { $('loadText').textContent = `惑星をえがいています… ${i + 1} / ${pids.length}`; await new Promise(r => setTimeout(r, 0)); PR.build(pids[i]); }
    try { await document.fonts.load('16px "DotGothic16"'); } catch (e) { /* fallback font */ }
    G.loaded = true; show('title');
    for (const m of rest) { await new Promise(r => setTimeout(r, 20)); SS2.bakeModel(m); }
  })();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();

// App flow: loading, menus, room code, role select, the game loop, pause and results.
(function () {
  const { World, Replica, PilotCtl, GunnerCtl, botGunnerInput, botPilotInput } = Sim;
  const $ = id => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d');
  const store = { get(k, d) { try { const v = localStorage.getItem('futari.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('futari.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } } };

  const G = window.G = {
    mode: null, role: null, playing: false, world: null, rep: null, st: null,
    pilotCtl: null, gunnerCtl: new GunnerCtl(), sendT: 0, snapT: 0,
    vis: store.get('vis', 64) / 100, visNow: 1, partnerText: '', partnerOk: true,
    lobby: { pilot: null, gunner: null }, cursor: 'pilot', screen: 'load', loaded: false, ended: false,
  };
  Sfx.on = store.get('sound', true);

  // ---------- layout ----------
  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
    const portrait = innerHeight > innerWidth;
    G.visNow = portrait ? G.vis : 1;
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
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== 's-' + id;
    G.screen = id;
    window.__typing = id === 'join';
    Menu.set(id ? $('s-' + id) : null);
  }
  function back() {
    const s = G.screen;
    if (s === 'host' || s === 'join' || s === 'lobby') { Net.close(); show('title'); }
    else if (s === 'solo' || s === 'howto' || s === 'settings') show('title');
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
      if (!Net.available()) { show('host'); $('hostCode').textContent = '····'; $('hostStatus').textContent = 'マルチプレイにはインターネットが必要です。'; return; }
      show('host'); $('hostCode').textContent = '····'; $('hostStatus').textContent = 'ルームを準備しています…'; G.mode = 'host'; Net.host();
    } else if (where === 'join') { show('join'); joinState.slot = 0; paintSlots(); $('joinStatus').textContent = Net.available() ? '' : 'マルチプレイにはインターネットが必要です。'; }
    else show(where);
  }

  // ---------- join code entry ----------
  const joinState = { code: store.get('lastCode', 'AAAA').split(''), slot: 0 };
  function paintSlots() { [...$('slots').children].forEach((s, i) => { s.textContent = joinState.code[i]; s.classList.toggle('on', i === joinState.slot); }); }
  function joinTick() {
    const A = Net.ABC;
    if (Input.nav('LEFT')) { joinState.slot = (joinState.slot + 3) % 4; paintSlots(); Sfx.play('select'); }
    if (Input.nav('RIGHT')) { joinState.slot = (joinState.slot + 1) % 4; paintSlots(); Sfx.play('select'); }
    for (const [k, d] of [['UP', -1], ['DOWN', 1]]) if (Input.nav(k)) {
      const c = joinState.code[joinState.slot]; joinState.code[joinState.slot] = A[(A.indexOf(c) + d + A.length) % A.length] || 'A'; paintSlots(); Sfx.play('select');
    }
    if (Input.pressed('A') || Input.pressed('START')) doJoin();
    if (Input.pressed('B')) back();
  }
  addEventListener('keydown', e => {
    if (G.screen !== 'join' || document.activeElement === $('codeInput')) return;
    if (/^Key[A-Z]$/.test(e.code)) {
      const ch = e.code.slice(3); if (!Net.ABC.includes(ch)) return;
      joinState.code[joinState.slot] = ch; joinState.slot = Math.min(3, joinState.slot + 1); paintSlots();
    } else if (e.code === 'Backspace') { joinState.slot = Math.max(0, joinState.slot - 1); paintSlots(); }
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
      el.classList.toggle('cur', G.cursor === r);
      el.classList.toggle('mine', who === me()); el.classList.toggle('theirs', !!who && who !== me());
      el.querySelector('.who').textContent = who ? (who === me() ? 'あなた' : 'あいて') : '';
    }
    const ready = G.lobby.pilot && G.lobby.gunner;
    $('lobbyStart').hidden = !Net.isHost;
    $('lobbyStatus').textContent = ready ? (Net.isHost ? 'START で出発！' : 'ホストの出発を待っています…') : '役を決めてください';
    Menu.set($('s-lobby'));
  }
  function pickRole(who, role) {
    const other = role === 'pilot' ? 'gunner' : 'pilot';
    if (G.lobby[role] && G.lobby[role] !== who) return false;
    if (G.lobby[other] === who) G.lobby[other] = null;
    G.lobby[role] = who; return true;
  }
  function sendLobby() { Net.send({ t: 'lobby', l: G.lobby }); }
  function lobbyTick() {
    if (Input.pressed('LEFT') || Input.pressed('RIGHT')) { G.cursor = G.cursor === 'pilot' ? 'gunner' : 'pilot'; paintLobby(); Sfx.play('select'); }
    if (Input.pressed('A')) choose(G.cursor);
    if (Input.pressed('START')) $('lobbyStart').click();
    if (Input.pressed('B')) back();
  }
  function choose(role) {
    if (Net.isHost) { if (pickRole('host', role)) { sendLobby(); Sfx.play('ok'); } paintLobby(); }
    else { Net.send({ t: 'pick', role }); Sfx.play('ok'); }
  }
  for (const el of document.querySelectorAll('.role')) el.addEventListener('click', () => { G.cursor = el.dataset.role; choose(el.dataset.role); });
  $('lobbyStart').onclick = () => {
    if (!Net.isHost || !(G.lobby.pilot && G.lobby.gunner)) return;
    const seed = (Math.random() * 1e9) | 0;
    Net.send({ t: 'start', seed });
    G.role = G.lobby.pilot === 'host' ? 'pilot' : 'gunner';
    begin('host', G.role, seed);
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
      if (!G.playing && G.screen === 'lobby') { show('title'); }
      if (G.playing && !G.ended) { FX.apply(['msg', '相手との接続が切れました。START → タイトルへ', 6], G.st); }
    }
  };
  Net.onMsg = m => {
    if (Net.isHost) {
      if (m.t === 'pick') { pickRole('guest', m.role); sendLobby(); paintLobby(); }
      else if (G.world && G.playing) G.world.handle(m);
      if (m.t === 'quit') { G.partnerOk = false; G.partnerText = 'あいて：タイトルにもどりました'; }
    } else {
      if (m.t === 'lobby') { G.lobby = m.l; paintLobby(); }
      else if (m.t === 'start') { G.role = G.lobby.pilot === 'guest' ? 'pilot' : 'gunner'; begin('guest', G.role, m.seed); }
      else if (m.t === 's' && G.rep) G.rep.snap(m, G.role);
      else if (m.t === 'e' && G.rep) for (const ev of m.l) { G.rep.event(ev); onEvent(ev, G.rep); }
      else if (m.t === 'quit') { G.partnerOk = false; G.partnerText = 'あいて：タイトルにもどりました'; }
    }
  };

  // ---------- game ----------
  function startSolo(role) { G.mode = 'solo'; begin('solo', role, (Math.random() * 1e9) | 0); }
  function begin(mode, role, seed) {
    G.mode = mode; G.role = role; G.playing = true; G.ended = false;
    FX.reset(); G.pilotCtl = new PilotCtl(); G.gunnerCtl = new GunnerCtl(); GunnerViewReset();
    if (mode === 'guest') { G.rep = new Replica(); G.world = null; G.st = G.rep; }
    else { G.world = new World(seed); G.rep = null; G.st = G.world; }
    if (mode === 'solo') G.partnerText = role === 'pilot' ? 'ソロ：ガンナーは自動' : 'ソロ：船は自動でよける';
    show(null);
  }
  function GunnerViewReset() { Views.GunnerView.dust = []; }
  const humanPilot = () => { const s = Input.stick(); return { x: s.x, y: s.y, dodge: Input.pressed('A'), shield: Input.down('B') || Input.down('L1'), boost: Input.down('R2') || Input.down('R1'), ping: Input.pressed('X') }; };
  const humanGunner = () => ({ press: ['UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B', 'X', 'Y'].filter(k => Input.pressed(k)), next: Input.pressed('R1'), prev: Input.pressed('L1'), special: Input.pressed('R2'), ping: Input.pressed('SELECT') });

  function pilotEvent(ev, st, sendFn) {
    if (ev === 'dodge') Sfx.play('dodge');
    if (ev === 'ping') sendFn({ t: 'ping', who: 'pilot', x: st.ship.x + 70, y: st.ship.y });
  }
  function gunnerOut(list, st, sendFn) {
    for (const m of list) {
      if (!m.local) { sendFn(m); continue; }
      if (m.local === 'ok') Sfx.play('ok');
      else if (m.local === 'miss') Sfx.play('miss');
      else if (m.local === 'switch') Sfx.play('switch');
      else if (m.local === 'noenergy') FX.apply(['msg', 'エネルギーが60たりない', 1.4], st);
      else if (m.local === 'ping') sendFn({ t: 'ping', who: 'gunner', x: st.ship.x + Math.cos(st.turret.ang) * 140, y: st.ship.y + Math.sin(st.turret.ang) * 140 });
    }
  }
  function onEvent(ev, st) {
    FX.apply(ev, st);
    if (ev[0] === 'pause') { if (ev[1]) openPause(); else if (G.screen === 'pause') show(null); }
    if (ev[0] === 'end') { G.ended = true; setTimeout(() => showResult(ev[1], ev[2]), 1600); }
  }
  function gameTick(dt) {
    if (Input.pressed('START') && G.screen !== 'pause' && !G.ended) { togglePause(true); return; }
    if (G.screen === 'pause') { Menu.tick(); if (Input.pressed('START')) resume(); }
    if (G.screen === 'result') Menu.tick();
    if (G.mode !== 'guest') {
      const w = G.world, local = m => w.handle(m);
      const pilotHuman = G.role === 'pilot', gunnerHuman = G.role === 'gunner';
      if (pilotHuman) pilotEvent(G.pilotCtl.update(dt, w, G.screen === 'pause' ? idlePilot : humanPilot()), w, local);
      else if (G.mode === 'solo') G.pilotCtl.update(dt, w, botPilotInput(null, w));
      if (gunnerHuman) gunnerOut(G.gunnerCtl.update(dt, w, G.screen === 'pause' ? idleGunner : humanGunner()), w, local);
      else if (G.mode === 'solo') gunnerOut(G.gunnerCtl.update(dt, w, botGunnerInput(G.gunnerCtl, w, dt)), w, local);
      w.step(dt);
      const evs = w.out; w.out = [];
      for (const ev of evs) onEvent(ev, w);
      if (G.mode === 'host') {
        if (evs.length) Net.send({ t: 'e', l: evs });
        G.snapT -= dt; if (G.snapT <= 0) { G.snapT = 0.1; Net.send(w.snap()); }
      }
    } else {
      const r = G.rep, send = m => Net.send(m);
      r.step(dt);
      if (G.role === 'pilot') {
        pilotEvent(G.pilotCtl.update(dt, r, G.screen === 'pause' ? idlePilot : humanPilot()), r, send);
        G.sendT -= dt; if (G.sendT <= 0) { G.sendT = 0.05; send(G.pilotCtl.msg(r.ship)); }
      } else {
        gunnerOut(G.gunnerCtl.update(dt, r, G.screen === 'pause' ? idleGunner : humanGunner()), r, send);
        G.sendT -= dt; if (G.sendT <= 0) { G.sendT = 0.1; send(G.gunnerCtl.msg(r)); }
      }
    }
    FX.step(dt);
  }
  const idlePilot = { x: 0, y: 0 }, idleGunner = { press: [] };
  function togglePause() {
    if (G.mode === 'solo') { G.world.paused = true; openPause(); }
    else if (G.mode === 'host') G.world.handle({ t: 'pause', on: true });
    else Net.send({ t: 'pause', on: true });
  }
  function openPause() {
    $('pSwap').hidden = G.mode !== 'solo';
    $('pauseInfo').textContent = G.mode === 'solo' ? 'ソロ（お試し）' : `通信量　送信 ${(Net.sentBytes / 1024).toFixed(0)}KB ／ 受信 ${(Net.recvBytes / 1024).toFixed(0)}KB`;
    show('pause');
  }
  function resume() {
    if (G.mode === 'solo') { G.world.paused = false; show(null); }
    else if (G.mode === 'host') G.world.handle({ t: 'pause', on: false });
    else Net.send({ t: 'pause', on: false });
  }
  $('pResume').onclick = resume;
  $('pSwap').onclick = () => { G.role = G.role === 'pilot' ? 'gunner' : 'pilot'; G.partnerText = G.role === 'pilot' ? 'ソロ：ガンナーは自動' : 'ソロ：船は自動でよける'; G.pilotCtl.vx = G.pilotCtl.vy = 0; resume(); };
  $('pQuit').onclick = $('rQuit').onclick = () => { if (G.mode !== 'solo') { Net.send({ t: 'quit' }); setTimeout(() => Net.close(), 200); } G.playing = false; G.world = G.rep = null; show('title'); };
  $('rAgain').onclick = () => {
    if (G.mode === 'solo') begin('solo', G.role, (Math.random() * 1e9) | 0);
    else if (G.mode === 'host') { const seed = (Math.random() * 1e9) | 0; Net.send({ t: 'start', seed }); begin('host', G.role, seed); }
  };
  function showResult(win, s) {
    $('rTitle').textContent = win ? 'ミッション クリア！' : 'ふたり号 撃沈…';
    $('rTitle').style.color = win ? 'var(--cyan)' : 'var(--red)';
    const acc = s.combos + s.miss ? Math.round(s.combos / (s.combos + s.miss) * 100) : 100;
    $('rStats').innerHTML = `<dt>時間</dt><dd>${Math.floor(s.time / 60)}分${s.time % 60}秒</dd><dt>たおした数</dt><dd>${s.kills}</dd><dt>コンボ成功</dt><dd>${s.combos}（正確さ ${acc}%）</dd><dt>チャージ砲</dt><dd>${s.specials}回</dd><dt>受けたダメージ</dt><dd>${s.hits}回（残り船体 ${s.hp}）</dd>`;
    $('rAgain').hidden = G.mode === 'guest';
    $('rNote').textContent = G.mode === 'guest' ? 'ホストが「もう一度」をえらぶと、また始まります。' : '';
    show('result');
  }

  // ---------- settings ----------
  $('vis').value = Math.round(G.vis * 100); $('visV').textContent = Math.round(G.vis * 100) + '%';
  $('vis').addEventListener('input', e => { G.vis = +e.target.value / 100; $('visV').textContent = e.target.value + '%'; store.set('vis', +e.target.value); resize(); });
  const paintSound = () => { $('soundBtn').innerHTML = '音：' + (Sfx.on ? 'オン' : 'オフ'); };
  paintSound(); $('soundBtn').onclick = () => { Sfx.on = !Sfx.on; store.set('sound', Sfx.on); paintSound(); };
  function settingsTick() {
    if (Input.nav('LEFT') || Input.nav('RIGHT')) { const v = Math.max(40, Math.min(100, +$('vis').value + (Input.down('LEFT') ? -2 : 2))); $('vis').value = v; $('vis').dispatchEvent(new Event('input')); }
    Menu.tick();
  }

  // ---------- title background ----------
  function drawTitle(t) {
    const W = cv.width, H = cv.height, VH = H * G.visNow;
    ctx.fillStyle = '#070812'; ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, 'rgba(70,30,120,0.35)'); g.addColorStop(1, 'rgba(10,40,90,0.25)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, VH);
    const r = Sim.rngOf(3);
    for (let i = 0; i < 220; i++) { const x = ((r() * W - t * 12 * (0.3 + r())) % W + W) % W, y = r() * VH; ctx.fillStyle = `rgba(220,225,255,${0.3 + r() * 0.6})`; ctx.fillRect(x | 0, y | 0, 2, 2); }
    if (!G.loaded) return;
    const s = Math.max(2, Math.round(Math.min(W, VH) / 140));
    Stack.draw(ctx, 'gas', 0, t * 0.03, 30, W * 0.82, VH * 0.36, Math.max(1, s * 0.8), { noGlow: true });
    Stack.draw(ctx, 'ship', Math.floor(t * 10) % 8, -0.5 + Math.sin(t * 0.6) * 0.3, 40, W * 0.18, VH * 0.72 + Math.sin(t * 1.3) * s * 3, s);
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
        if (G.role === 'pilot') Views.PilotView.draw(ctx, cv.width, cv.height, G.st, G, t);
        else Views.GunnerView.draw(ctx, cv.width, cv.height, G.st, G, t, dt, G.visNow);
      }
    } else {
      drawTitle(t);
      if (G.screen === 'join') joinTick();
      else if (G.screen === 'lobby') lobbyTick();
      else if (G.screen === 'settings') settingsTick();
      else if (G.screen !== 'load') Menu.tick();
      const pad = Input.padName();
      if (G.screen === 'title') $('padStatus').textContent = pad ? 'コントローラー：つながっています' : 'コントローラーのボタンを押すと使えます（キーボードでも遊べます）';
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  G.debugStep = (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) { Input.poll(dt); if (G.playing) gameTick(dt); } };

  // ---------- loading: bake every sprite stack ----------
  const GAME_FRAMES = { ship: 8, raider: 4, drone: 8, mine: 8, turret: 8, boss: 6, jelly: 8, station: 8, gate: 8, capsule: 8 };
  (async () => {
    const L = SS2.MODELS;
    for (const m of L) if (GAME_FRAMES[m.id]) m.F = GAME_FRAMES[m.id];
    for (let i = 0; i < L.length; i++) {
      $('loadText').textContent = `宇宙船を組み立てています… ${i + 1} / ${L.length}`;
      $('loadBar').style.width = (i / L.length * 100) + '%';
      await new Promise(r => setTimeout(r, 0));
      SS2.bakeModel(L[i]);
    }
    $('loadBar').style.width = '100%';
    try { await document.fonts.load('16px "DotGothic16"'); } catch (e) { /* fallback font */ }
    G.loaded = true; show('title');
  })();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();

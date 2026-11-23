// The guidebook (図鑑): enemies, creatures and objects the gunner has scanned, and planets the pilot
// has scanned. Shared by both players and kept on each phone. Each role sees its own notes.
(function () {
  const { DEFS, BOOK_ORDER, CAT_JP, PLANETS, SKILLS, ULT, KIND_JP, scanDur } = W3;
  const KEY = 'futari.book.v1';
  const AR = { UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→' };
  const comboText = c => c.map(k => AR[k] || k).join(' ');
  let data = { e: {}, p: {} };
  try { const v = JSON.parse(localStorage.getItem(KEY)); if (v && v.e && v.p) data = v; } catch (e) { /* fresh book */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* private mode */ } };
  const el = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const Book = {
    open: false, tab: 'e', idx: 0, role: 'pilot',
    has: (k, id) => !!data[k][id],
    count: k => Object.keys(data[k]).length,
    unlock(k, id) { if (data[k][id]) return false; data[k][id] = Date.now(); save(); if (this.open) this.render(); return true; },
    items() { return this.tab === 'e' ? BOOK_ORDER : PLANETS.map((_, i) => i); },
    show(role) { this.role = role; this.open = true; this.idx = Math.min(this.idx, this.items().length - 1); el('s-book').hidden = false; this.render(); },
    hide() { this.open = false; el('s-book').hidden = true; },
    tick() {
      const n = this.items().length;
      if (Input.nav('DOWN')) { this.idx = (this.idx + 1) % n; this.render(); Sfx.play('select'); }
      if (Input.nav('UP')) { this.idx = (this.idx - 1 + n) % n; this.render(); Sfx.play('select'); }
      if (Input.pressed('LEFT') || Input.pressed('RIGHT') || Input.pressed('L1') || Input.pressed('R1')) { this.tab = this.tab === 'e' ? 'p' : 'e'; this.idx = 0; this.render(); Sfx.play('select'); }
      if (Input.pressed('B') || Input.pressed('SELECT')) { this.hide(); return 'close'; }
      return null;
    },
    render() {
      el('bkTabE').classList.toggle('on', this.tab === 'e'); el('bkTabP').classList.toggle('on', this.tab === 'p');
      el('bkTabE').textContent = `敵・生きもの ${this.count('e')}/${BOOK_ORDER.length}`;
      el('bkTabP').textContent = `惑星 ${this.count('p')}/${PLANETS.length}`;
      const items = this.items();
      el('bkList').innerHTML = items.map((id, i) => {
        const known = this.tab === 'e' ? this.has('e', id) : this.has('p', id);
        const name = known ? (this.tab === 'e' ? DEFS[id].jp : PLANETS[id].name) : '？？？';
        const cat = this.tab === 'e' ? DEFS[id].cat : 'planet';
        return `<li class="${i === this.idx ? 'cur' : ''} c-${cat}" data-i="${i}">${esc(name)}</li>`;
      }).join('');
      const cur = el('bkList').children[this.idx]; if (cur) cur.scrollIntoView({ block: 'nearest' });
      el('bkDetail').innerHTML = this.tab === 'e' ? this.detailE(items[this.idx]) : this.detailP(items[this.idx]);
    },
    detailE(id) {
      const d = DEFS[id];
      if (!this.has('e', id)) return `<h3>？？？</h3><p class="dim">まだスキャンしていません。<br>ガンナーが照準を合わせて <b>Y 長押し</b>でスキャンすると、ここに記録されます。</p>`;
      const size = d.sc ? (d.sc[0] === d.sc[1] ? `船の約${(d.sc[0] * d.r / 20).toFixed(1)}倍` : `船の約${(d.sc[0] * d.r / 20).toFixed(1)}〜${(d.sc[1] * d.r / 20).toFixed(1)}倍（個体差あり）`) : `船の約${(d.r / 20).toFixed(1)}倍`;
      const tough = d.hp ? '★'.repeat(Math.min(5, Math.max(1, Math.round(Math.log2(d.hp / 10) + 0.5)))) : 'こわせない';
      let h = `<h3>${esc(d.jp)} <span class="chip c-${d.cat}">${CAT_JP[d.cat]}</span></h3><dl><dt>大きさ</dt><dd>${size}</dd><dt>かたさ</dt><dd>${tough}</dd></dl><p>${esc(d.desc)}</p>`;
      if (this.role === 'gunner') {
        const weak = (d.weak || []).map(k => SKILLS[k] ? `<li><b>${SKILLS[k].jp}</b>　${comboText(SKILLS[k].combo)} ＋ X</li>` : `<li><b>${KIND_JP[k]}</b></li>`).join('');
        const res = (d.resist || []).map(k => KIND_JP[k]).join('、');
        h += `<h4>ガンナー：有効な攻撃</h4>${weak ? `<ul>${weak}</ul>` : '<p class="dim">とくに弱点はない。どの攻撃でもふつうに効く。</p>'}`;
        if (res) h += `<p class="dim">効きにくい：${esc(res)}</p>`;
        if (d.mach) h += '<p class="dim">機械なので EMP パルスで止められる。</p>';
      } else {
        h += `<h4>パイロットへのメモ</h4><p>${esc(d.note || '—')}</p>`;
      }
      return h;
    },
    detailP(i) {
      const pl = PLANETS[i];
      if (!this.has('p', i)) return `<h3>？？？</h3><p class="dim">まだスキャンしていません。<br>パイロットが惑星に近づいて <b>X</b> でスキャンすると、ここに記録されます（約${scanDur(pl)}秒、そのあいだ船は動けません）。</p>`;
      return `<h3>${esc(pl.name)}</h3><dl><dt>種類</dt><dd>${esc(pl.type)}</dd><dt>年齢</dt><dd>${esc(pl.age)}</dd><dt>半径</dt><dd>約${(pl.R * 7).toLocaleString()} km</dd><dt>重力</dt><dd>${esc(pl.grav)}</dd><dt>気温</dt><dd>${esc(pl.temp)}</dd><dt>大気</dt><dd>${esc(pl.atm)}</dd><dt>住みやすさ</dt><dd>${'★'.repeat(pl.live) + '☆'.repeat(5 - pl.live)}</dd></dl><p>${esc(pl.desc)}</p>`;
    },
    comboText, ULT,
  };
  document.addEventListener('click', e => {
    const li = e.target.closest('#bkList li'); if (li) { Book.idx = +li.dataset.i; Book.render(); }
    if (e.target.id === 'bkTabE') { Book.tab = 'e'; Book.idx = 0; Book.render(); }
    if (e.target.id === 'bkTabP') { Book.tab = 'p'; Book.idx = 0; Book.render(); }
    if (e.target.id === 'bkClose') Book.hide();
  });
  window.Book = Book;
})();

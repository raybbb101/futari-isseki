// Two-player connection: the host makes a 4-letter room code, the guest types it.
// Peer-to-peer over WebRTC through PeerJS; only small JSON messages are sent.
(function () {
  const PREFIX = 'futari-isseki-v1-';
  const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const randCode = () => Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
  const Net = {
    ABC, peer: null, conn: null, isHost: false, code: '',
    onMsg: null, onState: null,
    sentBytes: 0, recvBytes: 0,
    available: () => typeof window.Peer === 'function',
    host(tries = 0) {
      this.close(); this.isHost = true; this.code = randCode();
      const peer = this.peer = new Peer(PREFIX + this.code, { debug: 0 });
      peer.on('open', () => this.state('hosting', this.code));
      peer.on('connection', c => {
        if (this.conn && this.conn.open) { c.on('open', () => { c.send('{"t":"full"}'); setTimeout(() => c.close(), 300); }); return; }
        this.bind(c);
      });
      peer.on('error', e => {
        if (e.type === 'unavailable-id' && tries < 4) return this.host(tries + 1);
        this.state('error', errText(e));
      });
      peer.on('disconnected', () => { if (!this.conn || !this.conn.open) try { peer.reconnect(); } catch (er) { /* ignore */ } });
    },
    join(code) {
      this.close(); this.isHost = false; this.code = code;
      const peer = this.peer = new Peer(undefined, { debug: 0 });
      peer.on('open', () => { this.state('joining', code); this.bind(peer.connect(PREFIX + code, { reliable: true })); });
      peer.on('error', e => this.state('error', errText(e)));
    },
    bind(c) {
      this.conn = c;
      c.on('open', () => this.state('connected'));
      c.on('data', d => {
        if (typeof d !== 'string') return;
        this.recvBytes += d.length;
        let m; try { m = JSON.parse(d); } catch (e) { return; }
        if (m.t === 'full') { this.state('error', 'このルームはもう2人そろっています。'); return; }
        this.onMsg && this.onMsg(m);
      });
      c.on('close', () => { if (this.conn === c) { this.conn = null; this.state('closed'); } });
      c.on('error', () => this.state('closed'));
    },
    send(m) {
      if (!this.conn || !this.conn.open) return;
      const s = JSON.stringify(m); this.sentBytes += s.length;
      try { this.conn.send(s); } catch (e) { /* closed */ }
    },
    connected() { return !!(this.conn && this.conn.open); },
    state(s, info) { this.onState && this.onState(s, info); },
    close() {
      try { this.conn && this.conn.close(); } catch (e) { /* ignore */ }
      try { this.peer && this.peer.destroy(); } catch (e) { /* ignore */ }
      this.conn = null; this.peer = null; this.sentBytes = 0; this.recvBytes = 0;
    },
  };
  function errText(e) {
    switch (e.type) {
      case 'peer-unavailable': return 'そのコードのルームが見つかりません。コードを確かめてください。';
      case 'network': case 'server-error': case 'socket-error': case 'socket-closed': return 'インターネットにつながりません。電波を確かめてください。';
      case 'browser-incompatible': return 'このブラウザではマルチプレイが使えません。Chrome で開いてください。';
      default: return 'つなげませんでした（' + e.type + '）。もう一度ためしてください。';
    }
  }
  window.Net = Net;
})();

// Controller input. Both GameSir X5 Lite ("controller") and GameSir Pocket Taco report the
// standard gamepad layout: A0 B1 X2 Y3 L1 4 R1 5 L2 6 R2 7 SELECT 8 START 9 L3 10 R3 11, d-pad 12-15,
// left stick axes 0/1, right stick axes 2/3 (the X5 Lite only; the Pocket Taco has no sticks).
(function () {
  const B = { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, L2: 6, R2: 7, SELECT: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  const NAMES = Object.keys(B);
  // keyboard: same keys as the TACO games (arrows = d-pad / left stick, X=A Z=B S=X A=Y Q=L1 R=R1 W=L2 E=R2
  // Enter=START Shift=SELECT), plus I J K L = right stick for testing the pilot on a computer
  const KEYS = {
    ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
    KeyX: 'A', KeyZ: 'B', KeyS: 'X', KeyA: 'Y', KeyQ: 'L1', KeyR: 'R1', KeyW: 'L2', KeyE: 'R2',
    Enter: 'START', ShiftLeft: 'SELECT', ShiftRight: 'SELECT', Space: 'A', Escape: 'START',
    KeyI: 'LOOK_U', KeyK: 'LOOK_D', KeyJ: 'LOOK_L', KeyL: 'LOOK_R',
  };
  const keys = new Set(), taps = new Set(); // taps: pressed since the last frame, even if already released
  addEventListener('keydown', e => {
    const k = KEYS[e.code]; if (!k) return;
    if (window.__typing && /^Key[A-Z]$/.test(e.code)) return; // typing a room code
    if (document.activeElement && document.activeElement.tagName === 'INPUT' && !['Enter', 'Escape', 'ArrowUp', 'ArrowDown'].includes(e.code)) return;
    keys.add(k); taps.add(k); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', e => { const k = KEYS[e.code]; if (k) keys.delete(k); });
  addEventListener('blur', () => keys.clear());

  const now = {}, prev = {}, rep = {}, val = {};
  let axes = [0, 0, 0, 0], padName = '';
  const dz = (x, y, d) => { const m = Math.hypot(x, y); if (m < d) return [0, 0]; const k = Math.min(1, (m - d) / (1 - d)) / m; return [x * k, y * k]; };
  const Input = {
    B, NAMES,
    poll(dt) {
      for (const n of NAMES) { prev[n] = now[n]; now[n] = keys.has(n) || (taps.has(n) && !prev[n]); val[n] = now[n] ? 1 : 0; }
      taps.clear();
      axes = [0, 0, 0, 0]; padName = '';
      let best = 0;
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) {
        if (!p || !p.connected) continue;
        padName = padName || p.id;
        for (const n of NAMES) { const b = p.buttons[B[n]]; if (!b) continue; if (b.pressed || b.value > 0.5) now[n] = true; val[n] = Math.max(val[n], b.value || (b.pressed ? 1 : 0)); }
        const m = Math.hypot(p.axes[0] || 0, p.axes[1] || 0) + Math.hypot(p.axes[2] || 0, p.axes[3] || 0);
        if (m >= best) { best = m; axes = [p.axes[0] || 0, p.axes[1] || 0, p.axes[2] || 0, p.axes[3] || 0]; }
      }
      for (const n of ['UP', 'DOWN', 'LEFT', 'RIGHT']) {
        if (now[n] && !prev[n]) rep[n] = 0.35; else if (now[n]) rep[n] -= dt; else rep[n] = 0;
      }
    },
    down: n => !!now[n] || (n.startsWith('LOOK') && keys.has(n)),
    pressed: n => !!now[n] && !prev[n],
    released: n => !now[n] && !!prev[n],
    value: n => val[n] || 0,
    nav(n) { if (this.pressed(n)) return true; if (now[n] && rep[n] < 0) { rep[n] = 0.09; return true; } return false; },
    // left stick (plus d-pad / arrow keys)
    stick() {
      let x = (now.RIGHT ? 1 : 0) - (now.LEFT ? 1 : 0), y = (now.DOWN ? 1 : 0) - (now.UP ? 1 : 0);
      const [ax, ay] = dz(axes[0], axes[1], 0.16); x += ax; y += ay;
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      return { x, y };
    },
    // right stick (plus I J K L keys)
    stick2() {
      let [x, y] = dz(axes[2], axes[3], 0.16);
      x += (keys.has('LOOK_R') ? 1 : 0) - (keys.has('LOOK_L') ? 1 : 0); y += (keys.has('LOOK_D') ? 1 : 0) - (keys.has('LOOK_U') ? 1 : 0);
      return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
    },
    padName: () => padName,
    anyPressed() { return NAMES.some(n => this.pressed(n)); },
  };
  window.Input = Input;
})();

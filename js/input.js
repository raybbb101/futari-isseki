// Controller input. Both GameSir X5 Lite ("controller") and GameSir Pocket Taco report the
// standard gamepad layout: A0 B1 X2 Y3 L1 4 R1 5 L2 6 R2 7 SELECT 8 START 9 L3 10 R3 11, d-pad 12-15.
(function () {
  const B = { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, L2: 6, R2: 7, SELECT: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  const NAMES = Object.keys(B);
  // keyboard: same keys as the TACO games (arrows = d-pad, X=A Z=B S=X A=Y Q=L1 R=R1 W=L2 E=R2 Enter=START Shift=SELECT)
  const KEYS = {
    ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
    KeyX: 'A', KeyZ: 'B', KeyS: 'X', KeyA: 'Y', KeyQ: 'L1', KeyR: 'R1', KeyW: 'L2', KeyE: 'R2',
    Enter: 'START', ShiftLeft: 'SELECT', ShiftRight: 'SELECT', Space: 'A', Escape: 'START',
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

  const now = {}, prev = {}, rep = {};
  let axes = [0, 0, 0, 0], padName = '', usedPad = false;
  const Input = {
    B, NAMES,
    poll(dt) {
      for (const n of NAMES) { prev[n] = now[n]; now[n] = keys.has(n) || (taps.has(n) && !prev[n]); }
      taps.clear();
      let best = 0; axes = [0, 0, 0, 0]; padName = '';
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) {
        if (!p || !p.connected) continue;
        padName = padName || p.id;
        for (const n of NAMES) { const b = p.buttons[B[n]]; if (b && (b.pressed || b.value > 0.5)) { now[n] = true; usedPad = true; } }
        const m = Math.hypot(p.axes[0] || 0, p.axes[1] || 0);
        if (m > best) { best = m; axes = [p.axes[0] || 0, p.axes[1] || 0, p.axes[2] || 0, p.axes[3] || 0]; }
      }
      // menu auto-repeat for held directions
      for (const n of ['UP', 'DOWN', 'LEFT', 'RIGHT']) {
        if (now[n] && !prev[n]) rep[n] = 0.35; else if (now[n]) rep[n] -= dt; else rep[n] = 0;
      }
    },
    down: n => !!now[n],
    pressed: n => !!now[n] && !prev[n],
    // menu navigation (d-pad with repeat, or the stick)
    nav(n) { if (this.pressed(n)) return true; if (now[n] && rep[n] < 0) { rep[n] = 0.09; return true; } return false; },
    stick() {
      let x = (now.RIGHT ? 1 : 0) - (now.LEFT ? 1 : 0), y = (now.DOWN ? 1 : 0) - (now.UP ? 1 : 0);
      const ax = axes[0], ay = axes[1], m = Math.hypot(ax, ay);
      if (m > 0.18) { const k = Math.min(1, (m - 0.18) / 0.82) / m; x += ax * k; y += ay * k; }
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      return { x, y };
    },
    padName: () => padName,
    usedPad: () => usedPad,
    anyPressed() { return NAMES.some(n => this.pressed(n)); },
  };
  window.Input = Input;
})();

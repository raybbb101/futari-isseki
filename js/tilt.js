// Tilt control, read from gravity so the phone held upright (screen facing you) is always the centre.
//   lean  = tilting the phone to the left / right, like a steering wheel   (+ = right)
//   pitch = tipping the top of the phone toward you (+) or away from you (−)
// Works the same whether the phone is in portrait (Pocket Taco) or landscape (X5 Lite).
(function () {
  let g = null, got = false;
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function onMotion(e) {
    const a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
    // "up" in device coordinates (Android reports the push against gravity; iOS the opposite sign)
    const s = iOS ? -1 : 1, x = a.x * s, y = a.y * s, z = a.z * s;
    g = g ? [g[0] * 0.75 + x * 0.25, g[1] * 0.75 + y * 0.25, g[2] * 0.75 + z * 0.25] : [x, y, z];
    got = true;
  }
  // rotate the device's up vector into screen coordinates (x right, y up, z toward you)
  function screenUp() {
    if (!g) return [0, 1, 0];
    const so = screen.orientation && screen.orientation.angle, ang = (((so != null ? so : window.orientation) || 0) + 360) % 360;
    const [x, y, z] = g;
    if (ang === 90) return [-y, x, z];
    if (ang === 270) return [y, -x, z];
    if (ang === 180) return [-x, -y, z];
    return [x, y, z];
  }
  const Tilt = {
    on: false, off: { lean: 0, pitch: 0 },
    supported: () => 'DeviceMotionEvent' in window,
    async enable() {
      try {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
          const r = await DeviceMotionEvent.requestPermission(); if (r !== 'granted') return false;
        }
      } catch (e) { return false; }
      addEventListener('devicemotion', onMotion); this.on = true; this.off = { lean: 0, pitch: 0 };
      return true;
    },
    disable() { this.on = false; removeEventListener('devicemotion', onMotion); },
    // optional: make the current pose the centre
    recenter() { const r = this.raw(); this.off = { lean: r.lean, pitch: r.pitch }; },
    working: () => got,
    raw() {
      const [ux, uy, uz] = screenUp(), m = Math.hypot(ux, uy, uz) || 1;
      return { lean: Math.atan2(-ux, uy), pitch: Math.asin(Math.max(-1, Math.min(1, uz / m))) };
    },
    // radians away from upright, with a small dead zone
    read() {
      if (!this.on || !got) return { lean: 0, pitch: 0 };
      const r = this.raw(), dz = v => { const s = Math.sign(v), a = Math.max(0, Math.abs(v) - 0.07); return s * a; };
      return { lean: dz(r.lean - this.off.lean), pitch: dz(r.pitch - this.off.pitch) };
    },
  };
  window.Tilt = Tilt;
})();

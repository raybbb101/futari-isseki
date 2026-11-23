// Tilt control: the phone clipped into the controller is the sensor.
// lean = tilting the phone left/right like a steering wheel, pitch = tipping its top toward/away from you.
(function () {
  const D2R = Math.PI / 180;
  let beta = 0, gamma = 0, got = false;
  function onOri(e) { if (e.beta == null) return; beta = e.beta; gamma = e.gamma; got = true; }
  function raw() {
    const a = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    if (a === 90) return { lean: beta, pitch: -gamma };
    if (a === 270 || a === -90) return { lean: -beta, pitch: gamma };
    return { lean: gamma, pitch: beta };
  }
  const Tilt = {
    on: false, n: { lean: 0, pitch: 0 },
    supported: () => 'DeviceOrientationEvent' in window,
    async enable() {
      try {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
          const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') return false;
        }
      } catch (e) { return false; }
      addEventListener('deviceorientation', onOri);
      this.on = true; setTimeout(() => this.recenter(), 250);
      return true;
    },
    disable() { this.on = false; removeEventListener('deviceorientation', onOri); },
    recenter() { this.n = raw(); },
    working: () => got,
    // radians away from the neutral pose, with a small dead zone
    read() {
      if (!this.on || !got) return { lean: 0, pitch: 0 };
      const r = raw(), f = (v, n) => { let d = v - n; if (d > 180) d -= 360; if (d < -180) d += 360; const s = Math.sign(d), m = Math.max(0, Math.abs(d) - 4); return s * m * D2R; };
      return { lean: f(r.lean, this.n.lean), pitch: f(r.pitch, this.n.pitch) };
    },
  };
  window.Tilt = Tilt;
})();

/* WebAudio 합성 효과음 — 외부 에셋 없이 동작 */
const Sfx = (() => {
  let ctx = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, { type = 'square', vol = 0.15, slide = 0 } = {}) {
    const ac = ensure();
    if (!ac) return;
    const t0 = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  function noise(dur, vol = 0.2) {
    const ac = ensure();
    if (!ac) return;
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource();
    const gain = ac.createGain();
    gain.gain.value = vol;
    src.buffer = buf;
    src.connect(gain).connect(ac.destination);
    src.start();
  }

  return {
    unlock() { ensure(); },
    jump()   { tone(320, 0.12, { slide: 260 }); },
    airJump(){ tone(520, 0.1,  { slide: 340, vol: 0.12 }); },
    shoot()  { tone(880, 0.07, { type: 'sawtooth', vol: 0.1, slide: -500 }); },
    hit()    { tone(200, 0.15, { type: 'triangle', slide: -120 }); noise(0.08, 0.12); },
    pop()    { noise(0.12, 0.25); tone(600, 0.1, { slide: -400 }); },
    coin()   { tone(988, 0.06, { vol: 0.12 }); setTimeout(() => tone(1319, 0.12, { vol: 0.12 }), 60); },
    hurt()   { tone(220, 0.3, { type: 'sawtooth', slide: -160 }); },
    board()  { tone(440, 0.1, { slide: 220 }); },
    hurry()  { tone(988, 0.09, { vol: 0.14 }); setTimeout(() => tone(988, 0.09, { vol: 0.14 }), 150); },
    rescue() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, { vol: 0.14 }), i * 130));
    },
  };
})();

/* Audio manager: tiny synthesized sounds via Web Audio (no files to download or cache).
   Silent until the first user gesture; suspended while the app is in the background. */
(function () {
  let ctx = null;
  let enabled = true;

  function ac() {
    if (!enabled) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  /** One soft enveloped tone. */
  function tone(freq, { at = 0, dur = 0.12, type = 'sine', gain = 0.08, slide = 0 } = {}) {
    const a = ac();
    if (!a) return;
    const t = a.currentTime + at;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(a.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  const SOUNDS = {
    tap: () => tone(880, { dur: 0.05, type: 'triangle', gain: 0.035 }),
    correct: () => { tone(660, { dur: 0.1, type: 'triangle' }); tone(990, { at: 0.07, dur: 0.16, type: 'triangle' }); },
    wrong: () => tone(220, { dur: 0.22, type: 'sine', gain: 0.07, slide: -60 }),
    tick: () => tone(1320, { dur: 0.03, type: 'square', gain: 0.015 }),
    rule: () => { tone(520, { dur: 0.1, type: 'square', gain: 0.03 }); tone(390, { at: 0.1, dur: 0.12, type: 'square', gain: 0.03 }); },
    complete: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.08, dur: 0.22, type: 'triangle' })),
    star: () => tone(1175, { dur: 0.14, type: 'sine', gain: 0.06 }),
    achievement: () => [784, 988, 1319].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.3, type: 'sine', gain: 0.06 })),
    boss: () => { tone(110, { dur: 0.6, type: 'sawtooth', gain: 0.03 }); tone(165, { at: 0.05, dur: 0.6, type: 'sawtooth', gain: 0.025 }); },
    fail: () => [392, 330, 262].forEach((f, i) => tone(f, { at: i * 0.11, dur: 0.2, type: 'triangle', gain: 0.06 })),
    pad: (i) => tone([330, 440, 554, 659][i] || 440, { dur: 0.22, type: 'triangle', gain: 0.07 }),
  };

  function play(name, arg) {
    if (!enabled) return;
    try { SOUNDS[name] && SOUNDS[name](arg); } catch (e) { /* audio is optional; never break gameplay */ }
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else if (enabled) ctx.resume().catch(() => {});
  });

  window.Sfx = { play, setEnabled: (v) => { enabled = !!v; if (!enabled && ctx) ctx.suspend().catch(() => {}); } };
})();

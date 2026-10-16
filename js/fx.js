/* Animation manager: reusable GSAP motion primitives. Every helper respects reduced motion
   (system preference OR the in-game setting). */
(function () {
  const gsap = window.gsap;
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  let forced = false;
  let hapticsOn = true;
  const reduced = () => forced || mq.matches;
  const setReduced = (v) => { forced = !!v; };
  const setHaptics = (v) => { hapticsOn = !!v; };

  /** MediaQueryList.addEventListener is Safari 14+; older iOS only has addListener. */
  function onMediaChange(list, fn) {
    if (list.addEventListener) list.addEventListener('change', fn);
    else if (list.addListener) list.addListener(fn);
  }
  const $$ = (root, sel) => Array.from(root.querySelectorAll(sel));

  function haptic(pattern = 8) {
    const active = !navigator.userActivation || navigator.userActivation.hasBeenActive;
    if (hapticsOn && navigator.vibrate && active) {
      try { navigator.vibrate(pattern); } catch (e) { /* unsupported: silently skip */ }
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /** Wrap characters in spans so text can be staggered; keeps words unbroken. */
  function splitText(el) {
    const text = el.textContent;
    el.setAttribute('aria-label', text);
    el.innerHTML = text.split(' ').map((w) =>
      `<span class="split-word" aria-hidden="true">${[...w].map((c) => `<span class="split-char">${escapeHtml(c)}</span>`).join('')}</span>`
    ).join(' ');
    return $$(el, '.split-char');
  }

  /** Screen in: stagger every [data-anim] child; [data-split] text gets a char reveal. */
  function enter(screen) {
    const items = $$(screen, '[data-anim]');
    if (!items.length) return gsap.timeline();
    if (reduced()) return gsap.fromTo(items, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 });
    const tl = gsap.timeline();
    tl.fromTo(items, { autoAlpha: 0, y: 26, scale: 0.98 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.6, ease: 'expo.out', stagger: 0.05 });
    $$(screen, '[data-split]').forEach((el) => {
      tl.fromTo(splitText(el), { yPercent: 110, autoAlpha: 0, rotateX: -70 },
        { yPercent: 0, autoAlpha: 1, rotateX: 0, duration: 0.6, ease: 'expo.out', stagger: 0.022 }, 0.05);
    });
    return tl;
  }

  function leave(screen) {
    if (reduced()) return gsap.to(screen, { autoAlpha: 0, duration: 0.15 });
    return gsap.to(screen, { autoAlpha: 0, y: -16, scale: 0.985, duration: 0.24, ease: 'power2.in' });
  }

  /** Touch feedback for any pressable element. Runs on pointerdown so it feels instant. */
  function bindPress(root) {
    const sel = '.btn, .icon-btn, .ans, .tile, .level-tile, .menu-tile, .seg button, .switch, .pad';
    root.addEventListener('pointerdown', (e) => {
      const el = e.target.closest(sel);
      if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
      gsap.to(el, { scale: 0.94, duration: 0.1, ease: 'power2.out', overwrite: 'auto' });
    });
    const release = (e) => {
      const el = e.target.closest && e.target.closest(sel);
      if (!el) return;
      gsap.to(el, { scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.45)', overwrite: 'auto' });
    };
    root.addEventListener('pointerup', release);
    root.addEventListener('pointercancel', release);
    root.addEventListener('pointerout', release);
  }

  function shake(el) {
    haptic([12, 40, 12]);
    if (reduced()) return gsap.fromTo(el, { autoAlpha: 0.6 }, { autoAlpha: 1, duration: 0.3 });
    return gsap.fromTo(el, { x: 0 }, { x: 0, duration: 0.42, ease: 'none', keyframes: { x: [0, -9, 8, -6, 4, -2, 0] } });
  }

  function pop(el, from = 0.6) {
    if (reduced()) return gsap.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 });
    return gsap.fromTo(el, { scale: from, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.55, ease: 'back.out(2.2)' });
  }

  function bounce(el) {
    if (reduced()) return null;
    return gsap.fromTo(el, { scale: 1 }, { scale: 1, duration: 0.5, keyframes: { scale: [1, 1.08, 0.97, 1] }, ease: 'power2.out' });
  }

  /** Count a number up inside an element. */
  function countUp(el, to, { duration = 1, from = 0, format = (v) => Math.round(v).toLocaleString() } = {}) {
    if (reduced()) { el.textContent = format(to); return null; }
    const o = { v: from };
    return gsap.to(o, { v: to, duration, ease: 'power2.out', onUpdate: () => { el.textContent = format(o.v); } });
  }

  /** Small radial burst of dots from an element's centre (success). */
  function burst(el, colors = ['#7d7aff', '#30d158', '#ffd60a', '#ff6482']) {
    if (reduced() || !el) return;
    const layer = document.getElementById('fx-layer');
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    for (let i = 0; i < 12; i++) {
      const p = document.createElement('i');
      p.className = 'spark';
      p.style.left = `${cx}px`;
      p.style.top = `${cy}px`;
      p.style.background = colors[i % colors.length];
      layer.appendChild(p);
      const a = (i / 12) * Math.PI * 2;
      const dist = 40 + Math.random() * 40;
      gsap.fromTo(p, { x: 0, y: 0, scale: 1, autoAlpha: 1 },
        { x: Math.cos(a) * dist, y: Math.sin(a) * dist, scale: 0, autoAlpha: 0, duration: 0.6 + Math.random() * 0.3, ease: 'expo.out', onComplete: () => p.remove() });
    }
  }

  /** Floating text that rises and fades (e.g. "+120", "NICE!"). */
  function floatText(text, anchor, cls = '') {
    const layer = document.getElementById('fx-layer');
    const r = anchor.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = `float-text ${cls}`;
    el.textContent = text;
    el.style.left = `${r.left + r.width / 2}px`;
    el.style.top = `${r.top + r.height / 2}px`;
    layer.appendChild(el);
    if (reduced()) {
      gsap.fromTo(el, { xPercent: -50, yPercent: -50, autoAlpha: 1 }, { autoAlpha: 0, duration: 0.6, delay: 0.5, onComplete: () => el.remove() });
      return;
    }
    gsap.timeline({ onComplete: () => el.remove() })
      .fromTo(el, { xPercent: -50, yPercent: -50, scale: 0.6, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.35, ease: 'back.out(2)' })
      .to(el, { y: -46, autoAlpha: 0, duration: 0.55, ease: 'power2.in' }, '+=0.25');
  }

  /**
   * Controlled glitch on a word: characters scramble/jitter through colours, then SETTLE to
   * the exact final text and colour. Resolves only once settled, so timers start after.
   */
  function glitchWord(el, finalText, finalColor, palette) {
    el.textContent = finalText;
    el.style.color = finalColor;
    if (reduced()) return gsap.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 });
    const chars = splitText(el);
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const finals = chars.map((c) => c.textContent);
    const tl = gsap.timeline();
    tl.fromTo(chars, { autoAlpha: 0, yPercent: 60, scale: 0.7 }, { autoAlpha: 1, yPercent: 0, scale: 1, duration: 0.32, ease: 'back.out(2)', stagger: 0.03 });
    const steps = 4;
    for (let s = 0; s < steps; s++) {
      tl.call(() => {
        chars.forEach((c, i) => {
          if (Math.random() < 0.5) c.textContent = letters[Math.floor(Math.random() * 26)];
          c.style.color = palette[(i + s) % palette.length];
        });
      }, null, 0.12 + s * 0.06);
      tl.to(chars, { x: () => (Math.random() - 0.5) * 8, y: () => (Math.random() - 0.5) * 6, duration: 0.05 }, 0.12 + s * 0.06);
    }
    tl.call(() => { chars.forEach((c, i) => { c.textContent = finals[i]; c.style.color = ''; }); });
    tl.to(chars, { x: 0, y: 0, duration: 0.18, ease: 'power2.out' });
    return tl;
  }

  /** Slowly drifting gradient blobs. Paused when the tab is hidden. */
  const ambientTweens = [];
  function ambient() {
    ambientTweens.forEach((t) => t.kill());
    ambientTweens.length = 0;
    if (reduced()) return;
    [['.blob-a', 12, 8], ['.blob-b', -10, -9], ['.blob-c', -14, 10]].forEach(([sel, x, y], i) => {
      ambientTweens.push(gsap.to(sel, { xPercent: x, yPercent: y, scale: 1.12, duration: 14 + i * 4, ease: 'sine.inOut', repeat: -1, yoyo: true }));
    });
  }
  document.addEventListener('visibilitychange', () => {
    ambientTweens.forEach((t) => (document.hidden ? t.pause() : t.resume()));
  });

  function confetti(count = 70) {
    if (reduced()) return;
    const layer = document.getElementById('fx-layer');
    const colors = ['#7d7aff', '#ff6482', '#30d158', '#ffd60a', '#64d2ff', '#da8fff'];
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('i');
      p.className = 'confetti';
      p.style.background = colors[i % colors.length];
      p.style.left = `${Math.random() * w}px`;
      layer.appendChild(p);
      gsap.fromTo(p, { y: -30 - Math.random() * 200, rotation: Math.random() * 360, scale: 0.6 + Math.random() * 0.6 }, {
        y: h + 40, x: (Math.random() - 0.5) * 160, rotation: `+=${360 + Math.random() * 540}`,
        duration: 2.2 + Math.random() * 1.6, ease: 'power1.in', delay: Math.random() * 0.4, onComplete: () => p.remove(),
      });
    }
  }

  let toastTween;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    if (toastTween) toastTween.kill();
    gsap.set(el, { xPercent: -50, y: -20 });
    toastTween = gsap.timeline()
      .to(el, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'expo.out' })
      .to(el, { autoAlpha: 0, y: -20, duration: 0.3, ease: 'power2.in' }, '+=1.8');
  }

  /** Achievement cards queue so several unlocks never overlap. */
  const achQueue = [];
  let achBusy = false;
  function achievementToast(a) {
    achQueue.push(a);
    if (!achBusy) nextAchievement();
  }
  function nextAchievement() {
    const a = achQueue.shift();
    if (!a) { achBusy = false; return; }
    achBusy = true;
    const root = document.getElementById('ach-root');
    const el = document.createElement('div');
    el.className = 'ach-toast';
    el.setAttribute('role', 'status');
    el.innerHTML = `<span class="ach-ico">${a.icon}</span><span><small>Achievement unlocked</small><b>${escapeHtml(a.name)}</b></span>`;
    root.appendChild(el);
    const done = () => { el.remove(); nextAchievement(); };
    if (reduced()) { gsap.timeline({ onComplete: done }).fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }).to(el, { autoAlpha: 0, duration: 0.2 }, '+=2.4'); return; }
    gsap.timeline({ onComplete: done })
      .fromTo(el, { y: -90, autoAlpha: 0, scale: 0.9 }, { y: 0, autoAlpha: 1, scale: 1, duration: 0.6, ease: 'back.out(1.6)' })
      .fromTo(el.querySelector('.ach-ico'), { rotation: -30, scale: 0.4 }, { rotation: 0, scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.5)' }, '-=0.3')
      .to(el, { y: -90, autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, '+=2.2');
  }

  window.FX = {
    onMediaChange, reduced, setReduced, setHaptics, haptic, splitText, escapeHtml, enter, leave, bindPress, shake, pop, bounce,
    countUp, burst, floatText, glitchWord, ambient, confetti, toast, achievementToast, mq,
  };
})();

/* Gameplay screen controller. Drives the pure engine (BGEngine) and renders each challenge.
   All gameplay timers run on a pausable Clock, separate from decorative animation timing. */
(function () {
  const E = window.BGEngine;
  const R = window.Render;
  const FX = window.FX;
  const gsap = window.gsap;
  const Sfx = window.Sfx;
  const { COLORS } = window.BGCore;
  const PALETTE = Object.values(COLORS).map((c) => c.hex);
  const esc = FX.escapeHtml;

  /** Game-time clock: timers and tracked tweens freeze together on pause. */
  function Clock() {
    let pausedAt = null;
    let offset = 0;
    let seq = 0;
    const timers = new Map();
    const tweens = new Set();
    const real = () => performance.now();
    const now = () => (pausedAt === null ? real() : pausedAt) - offset;
    const arm = (id) => {
      const t = timers.get(id);
      t.h = setTimeout(() => { timers.delete(id); t.fn(); }, Math.max(0, t.due - now()));
    };
    return {
      now,
      after(ms, fn) { const id = ++seq; timers.set(id, { due: now() + ms, fn }); if (pausedAt === null) arm(id); return id; },
      cancel(id) { const t = timers.get(id); if (t) { clearTimeout(t.h); timers.delete(id); } },
      track(tw) {
        tweens.forEach((t) => { if (t.progress() === 1) tweens.delete(t); });
        tweens.add(tw);
        if (pausedAt !== null) tw.pause();
        return tw;
      },
      pause() {
        if (pausedAt !== null) return;
        pausedAt = real();
        timers.forEach((t) => clearTimeout(t.h));
        tweens.forEach((t) => t.pause());
      },
      resume() {
        if (pausedAt === null) return;
        offset += real() - pausedAt;
        pausedAt = null;
        [...timers.keys()].forEach(arm);
        tweens.forEach((t) => t.resume());
      },
      clear() { timers.forEach((t) => clearTimeout(t.h)); timers.clear(); tweens.forEach((t) => t.kill()); tweens.clear(); },
    };
  }

  const pad3 = (n) => String(n).padStart(3, '0');
  const PRAISE = ['NICE!', 'SHARP!', 'PERFECT!', 'GOOD!', 'CLEAN!'];
  const icon = {
    pause: '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor"/></svg>',
    heart: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.2 4.3 2.4.7-1.2 2.1-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" fill="currentColor"/></svg>',
  };

  /**
   * @param {HTMLElement} el screen root
   * @param {object} session { mode, label, def?, challenges?, next?, total, mistakesAllowed, lives, intro, onAnswer, onFinish, onRestart, onQuit }
   */
  function mount(el, session) {
    const q = (s) => el.querySelector(s);
    const clock = Clock();
    let run = E.createRun({ mode: session.mode, challenges: session.challenges, mistakesAllowed: session.mistakesAllowed, lives: session.lives });
    if (session.mode === 'endless') run = { ...run, total: Infinity };
    let alive = true;
    let pendingReady = null; // entrance finished while paused
    let pendingAdvance = false; // feedback finished while paused
    let chCleanup = null;
    let startAt = 0;
    let timeoutId = null;
    let lastPhase = null;
    let finished = false;
    const hearts = session.lives ?? (Number.isFinite(session.mistakesAllowed) ? session.mistakesAllowed + 1 : null);

    const hud = {
      score: q('[data-score]'), fill: q('[data-progress]'), timer: q('[data-timer]'), timerFill: q('[data-timer] i'),
      hearts: q('[data-hearts]'), phase: q('[data-phase]'), count: q('[data-count]'),
    };
    const instr = q('[data-instr]');
    const hint = q('[data-hint]');
    const stage = q('[data-stage]');
    const answers = q('[data-answers]');
    const banner = q('[data-banner]');
    // Overlays live outside the app column so they cover the full screen, safe areas included.
    const overlays = document.getElementById('overlay-root');
    const introEl = document.createElement('div');
    introEl.className = 'intro';
    introEl.hidden = true;
    const pauseRoot = document.createElement('div');
    pauseRoot.className = 'pause';
    pauseRoot.hidden = true;
    overlays.append(introEl, pauseRoot);

    hud.hearts.innerHTML = hearts ? Array.from({ length: hearts }, () => `<span class="heart">${icon.heart}</span>`).join('') : '';
    const lock = (on) => { answers.classList.toggle('locked', on); stage.classList.toggle('locked', on); };

    /* ---------- HUD ---------- */
    let shownScore = 0;
    function setScore(v) {
      const o = { v: shownScore };
      shownScore = v;
      if (FX.reduced()) { hud.score.textContent = v.toLocaleString(); return; }
      gsap.to(o, { v, duration: 0.5, ease: 'power2.out', onUpdate: () => { hud.score.textContent = Math.round(o.v).toLocaleString(); } });
    }
    function setProgress() {
      if (session.mode === 'endless') {
        // Endless: the bar fills toward the next difficulty tier.
        const done = run.answers.length;
        hud.count.textContent = `Tier ${Math.floor(done / 10) + 1} · ${done} cleared`;
        gsap.to(hud.fill, { width: `${(done % 10) * 10}%`, duration: 0.6, ease: 'expo.out' });
        return;
      }
      const pct = (run.answers.length / run.total) * 100;
      gsap.to(hud.fill, { width: `${pct}%`, duration: 0.6, ease: 'expo.out' });
      hud.count.textContent = `${Math.min(run.answers.length + 1, run.total)} / ${run.total}`;
    }
    function loseHeart() {
      if (!hearts) return;
      const lost = run.lives !== null ? hearts - run.lives : run.mistakes;
      const h = hud.hearts.children[hearts - lost];
      if (!h) return;
      h.classList.add('lost');
      FX.shake(h);
    }
    function setPhase(ch) {
      if (!ch.phase || ch.phase === lastPhase) return;
      lastPhase = ch.phase;
      const phases = session.def && session.def.phases ? session.def.phases : [ch.phase];
      hud.phase.hidden = false;
      hud.phase.textContent = `Phase ${phases.indexOf(ch.phase) + 1}/${phases.length} · ${ch.phase}`;
      FX.pop(hud.phase, 0.8);
    }

    /* ---------- Timer ---------- */
    let timerTween = null;
    function startTimer(ms) {
      hud.timer.hidden = false;
      gsap.set(hud.timerFill, { scaleX: 1, backgroundColor: '' });
      timerTween = clock.track(gsap.to(hud.timerFill, { scaleX: 0, duration: ms / 1000, ease: 'none' }));
      clock.track(gsap.to(hud.timerFill, { backgroundColor: '#ff3b30', duration: 0.3, delay: (ms / 1000) * 0.7 }));
      timeoutId = clock.after(ms, () => answerChoice(null));
    }
    function stopTimer() {
      if (timeoutId) clock.cancel(timeoutId);
      timeoutId = null;
      if (timerTween) timerTween.pause();
    }

    /* ---------- Challenge flow ---------- */
    function next() {
      if (!alive) return;
      const nextCh = session.next ? session.next(run.index, run) : null;
      run = E.prepare(run, nextCh);
      const ch = E.current(run);
      lock(true);
      hud.timer.hidden = true;
      setPhase(ch);
      setProgress();
      const out = [instr, hint, stage, answers].filter((n) => n.childNodes.length);
      const go = () => { if (alive) build(ch); };
      if (!out.length || FX.reduced()) { go(); return; }
      gsap.to(out, { autoAlpha: 0, y: -10, duration: 0.18, ease: 'power2.in', onComplete: go });
    }

    function revealText(ch) {
      instr.textContent = ch.instruction;
      hint.textContent = ch.hint || '';
      gsap.set([instr, hint, stage, answers], { autoAlpha: 1, y: 0 });
      if (FX.reduced()) return gsap.fromTo([instr, hint], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 });
      const tl = gsap.timeline();
      tl.fromTo(FX.splitText(instr), { autoAlpha: 0, yPercent: 70 }, { autoAlpha: 1, yPercent: 0, duration: 0.4, ease: 'expo.out', stagger: 0.008 });
      if (ch.hint) tl.fromTo(hint, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, '-=0.2');
      return tl;
    }

    function build(ch) {
      if (chCleanup) { chCleanup(); chCleanup = null; }
      stage.innerHTML = '';
      answers.innerHTML = '';
      if (ch.input === 'stream') return buildStream(ch);
      if (ch.memorize && ch.memorize.kind === 'pads') return buildPads(ch);
      if (ch.memorize) return buildMemorize(ch);
      return buildQuestion(ch);
    }

    /** Stimulus + answers, then activate once everything has landed. */
    function buildQuestion(ch) {
      const tl = gsap.timeline();
      tl.add(revealText(ch));
      // Tile puzzles with nothing else to look at put the tiles centre stage.
      const host = ch.layout === 'tiles' && !ch.stimulus ? stage : answers;
      stage.innerHTML = R.stimulus(ch.stimulus);
      host.innerHTML = R.options(ch);
      tl.add(enterStimulus(ch), 0.1);
      if (!FX.reduced()) tl.fromTo(host.querySelector('.answers-grid').children, { autoAlpha: 0, y: 22, scale: 0.94 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.42, ease: 'back.out(1.6)', stagger: 0.04 }, '-=0.25');
      host.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => answerChoice(Number(b.dataset.i), b); });
      tl.call(() => ready(ch));
    }

    function enterStimulus(ch) {
      const st = ch.stimulus;
      const tl = gsap.timeline();
      if (!st) return tl;
      if (st.kind === 'word') {
        const w = stage.querySelector('[data-word]');
        const frame = stage.querySelector('.word-frame');
        if (frame && !FX.reduced()) tl.fromTo(frame, { scale: 0.4, rotation: -40, autoAlpha: 0 }, { scale: 1, rotation: 0, autoAlpha: 1, duration: 0.5, ease: 'back.out(1.7)' }, 0);
        tl.add(FX.glitchWord(w, R.cname(st.word), R.hex(st.color), PALETTE), 0);
      } else if (FX.reduced()) {
        tl.fromTo(stage.children, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 });
      } else if (st.kind === 'arrow') {
        tl.fromTo(stage.querySelector('.big-arrow'), { rotation: -220, scale: 0.4, autoAlpha: 0 }, { rotation: 0, scale: 1, autoAlpha: 1, duration: 0.6, ease: 'back.out(1.4)' });
        const lbl = stage.querySelector('.arrow-label');
        if (lbl) tl.fromTo(lbl, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.3 }, 0.15);
      } else {
        const kids = stage.querySelectorAll('.mini-cell, .seq-item, .mem-cell, .stim-target, .stim-label');
        tl.fromTo(kids, { autoAlpha: 0, scale: 0.5, rotation: -12 }, { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.45, ease: 'back.out(2)', stagger: 0.04 });
      }
      return tl;
    }

    /** Show items, hold for exposureMs (timer starts only after they are fully visible), hide, ask. */
    function buildMemorize(ch) {
      const m = ch.memorize;
      instr.textContent = 'MEMORIZE';
      hint.textContent = m.kind === 'swatch' ? '' : 'They will disappear.';
      gsap.set([instr, hint, stage, answers], { autoAlpha: 1, y: 0 });
      stage.innerHTML = `<div class="memo">${R.memorize(m)}<div class="expo"><i></i></div></div>`;
      const items = stage.querySelectorAll('.mem-item, .mem-cell, .mem-number, .mem-swatch');
      const bar = stage.querySelector('.expo i');
      const tl = gsap.timeline();
      if (!FX.reduced()) tl.fromTo(items, { autoAlpha: 0, rotationY: -90 }, { autoAlpha: 1, rotationY: 0, duration: 0.4, ease: 'back.out(1.6)', stagger: 0.06 });
      tl.call(() => {
        clock.track(gsap.fromTo(bar, { scaleX: 1 }, { scaleX: 0, duration: m.exposureMs / 1000, ease: 'none' }));
        clock.after(m.exposureMs, () => {
          if (!alive) return;
          const hide = FX.reduced() ? gsap.to(items, { autoAlpha: 0, duration: 0.15 })
            : gsap.to(items, { autoAlpha: 0, rotationY: 90, duration: 0.3, ease: 'power2.in', stagger: 0.03 });
          hide.eventCallback('onComplete', () => { if (alive) buildQuestion(ch); });
        });
      });
    }

    /** Simon pads: watch the flashes, then repeat. */
    function buildPads(ch) {
      instr.textContent = 'Watch the sequence';
      hint.textContent = '';
      gsap.set([instr, hint, stage, answers], { autoAlpha: 1, y: 0 });
      answers.innerHTML = R.options(ch);
      const pads = [...answers.querySelectorAll('.pad')];
      const { seq, stepMs } = ch.memorize;
      const tl = gsap.timeline();
      if (!FX.reduced()) tl.fromTo(pads, { scale: 0.6, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.4, ease: 'back.out(2)', stagger: 0.05, clearProps: 'opacity,visibility' });
      tl.call(() => {
        seq.forEach((p, i) => clock.after(400 + i * stepMs, () => { if (alive) flashPad(pads[p], p, stepMs * 0.7); }));
        clock.after(400 + seq.length * stepMs + 150, () => {
          if (!alive) return;
          instr.textContent = 'Your turn';
          hint.textContent = `Tap all ${seq.length} in order`;
          FX.pop(instr, 0.8);
          const taps = [];
          pads.forEach((b) => {
            b.onclick = () => {
              if (run.state !== 'active') return;
              const i = Number(b.dataset.i);
              taps.push(i);
              flashPad(b, i, 200);
              const k = taps.length - 1;
              if (taps[k] !== run.challenges[run.index].answer[k]) finishAnswer(taps.slice(), b, {});
              else if (taps.length === seq.length) finishAnswer(taps.slice(), b, {});
            };
          });
          ready(ch);
        });
      });
    }
    function flashPad(b, i, ms) {
      Sfx.play('pad', i);
      b.classList.add('lit');
      clock.after(ms, () => b.classList.remove('lit'));
    }

    /** Entrance done: accept input, start the challenge timer (if any). */
    function ready(ch) {
      if (!alive) return;
      if (document.hidden) pause(); // never start a clock while nobody is looking
      if (run.state === 'paused') { pendingReady = ch; return; }
      run = E.activate(run);
      lock(false);
      startAt = clock.now();
      if (ch.timeLimit) startTimer(ch.timeLimit);
      if (ch.input === 'stream' && chCleanup && chCleanup.start) chCleanup.start();
    }

    function answerChoice(i, btn) {
      if (run.state !== 'active') return; // double taps and late taps are ignored
      const ch = E.current(run);
      if (ch.input !== 'choice') return;
      finishAnswer(i, btn, { usedMs: clock.now() - startAt });
    }

    function finishAnswer(response, btn, timing, why) {
      if (run.state !== 'active') return;
      lock(true);
      stopTimer();
      const out = E.submit(run, response, timing);
      run = E.showFeedback(out.run);
      feedback(out.result, btn, why, timing);
    }

    /* ---------- Feedback ---------- */
    function feedback(result, btn, why, timing) {
      const ch = result.challenge;
      session.onAnswer(result, timing, ch);
      setProgress();
      if (result.correct) {
        Sfx.play('correct');
        FX.haptic(10);
        if (btn) { btn.classList.add('is-correct'); FX.bounce(btn); FX.burst(btn); }
        const word = run.streak >= 10 ? 'UNSTOPPABLE!' : run.streak >= 5 ? 'ON FIRE!' : PRAISE[(run.answers.length + run.streak) % PRAISE.length];
        showBanner(word, result.points.mult > 1 ? `+${result.points.total} · ×${result.points.mult} streak` : `+${result.points.total}`, 'ok');
        FX.floatText(`+${result.points.total}`, hud.score, 'pts');
        setScore(run.score);
        clock.after(FX.reduced() ? 500 : 750, advance);
        return;
      }
      Sfx.play('wrong');
      if (btn) { btn.classList.add('is-wrong'); FX.shake(btn); }
      if (ch.input === 'choice') {
        const right = el.querySelector(`.answers-grid [data-i="${ch.answer}"]`);
        if (right) { right.classList.add('is-correct', 'reveal'); FX.pop(right, 0.9); }
      }
      loseHeart();
      const title = result.timedOut ? "TIME'S UP!" : 'NOT QUITE!';
      showBanner(title, why || ch.explain, 'bad');
      // Long enough to read why; tap anywhere to move on sooner.
      let moved = false;
      const go = () => { if (!moved) { moved = true; el.removeEventListener('pointerdown', skip); advance(); } };
      const skip = (e) => {
        if (e.target.closest('[data-pause-btn]') || run.state === 'paused') return;
        if (clock.now() - shownAt > 450) go();
      };
      const shownAt = clock.now();
      el.addEventListener('pointerdown', skip);
      clock.after(2300, go);
    }

    function showBanner(title, sub, kind) {
      banner.className = `banner ${kind}`;
      banner.innerHTML = `<b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`;
      gsap.killTweensOf(banner);
      if (FX.reduced()) { gsap.set(banner, { autoAlpha: 1 }); return; }
      gsap.fromTo(banner, { autoAlpha: 0, y: 12, scale: 0.92 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.35, ease: 'back.out(2)' });
    }
    function hideBanner() { gsap.to(banner, { autoAlpha: 0, duration: 0.15 }); }

    function advance() {
      if (!alive) return;
      if (run.state === 'paused') { pendingAdvance = true; return; }
      hideBanner();
      run = E.advance(run);
      if (run.state === 'completed' || run.state === 'failed') return finish();
      next();
    }

    function finish() {
      if (finished) return;
      finished = true;
      lock(true);
      session.onFinish(run);
    }

    /* ---------- Streams: Don't Tap + Rule Switching ---------- */
    function buildStream(ch) {
      const s = ch.stream;
      const signal = s.items.some((it) => it.t === 'switch');
      const total = s.items.filter((it) => it.t !== 'rule').length;
      stage.innerHTML = `<div class="stream">
        <div class="rule-bar" data-rule></div>
        <button class="stream-pad" data-pad aria-label="Tap when it fits the rule"><div class="stream-item" data-item></div><div class="window"><i></i></div></button>
        <div class="stream-meta"><span data-left></span></div>
        <div class="rule-flash" data-flash hidden></div>
      </div>`;
      answers.innerHTML = '<p class="stream-help">Tap the card when it fits the rule. Otherwise, let it pass.</p>';
      const ruleEl = stage.querySelector('[data-rule]');
      const padEl = stage.querySelector('[data-pad]');
      const itemEl = stage.querySelector('[data-item]');
      const winEl = stage.querySelector('.window i');
      const leftEl = stage.querySelector('[data-left]');
      const flashEl = stage.querySelector('[data-flash]');
      const X = window.BGChallenges;
      let active = 0;
      let k = -1;
      let shown = 0;
      let flags = [];
      let reactions = [];
      let cur = null;
      let curStart = 0;
      let tapped = false;
      let expireId = null;
      let done = false;

      const showRule = () => {
        if (signal) {
          ruleEl.innerHTML = s.rules.map((r, i) => `<span class="${!s.hideActive && i === active ? 'on' : ''}">${esc(X.ruleText(r))}</span>`).join('<em>⚡</em>');
        } else ruleEl.innerHTML = `<span class="on">${esc(X.ruleText(s.rules[active]))}</span>`;
      };
      showRule();
      leftEl.textContent = `0 / ${total}`;

      const tl = gsap.timeline();
      tl.add(revealText(ch));
      if (!FX.reduced()) tl.fromTo([ruleEl, padEl], { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'expo.out', stagger: 0.08 }, '-=0.2');
      itemEl.innerHTML = '<span class="ready-txt">Ready…</span>';
      tl.to({}, { duration: 0.5 });
      tl.call(() => ready(ch));

      const end = (correct, why) => {
        if (done) return;
        done = true;
        clock.cancel(expireId);
        const resp = correct ? flags : [...flags, 'x'];
        finishAnswer(resp, correct ? null : padEl, { reactionMs: reactions }, why);
      };

      function step() {
        if (!alive || done) return;
        k += 1;
        if (k >= s.items.length) return end(true);
        cur = s.items[k];
        if (cur.t === 'rule') {
          active = cur.to;
          Sfx.play('rule');
          FX.haptic([8, 30, 8]);
          flashEl.hidden = false;
          flashEl.innerHTML = `<b>RULE CHANGED</b><span>${esc(X.ruleText(s.rules[active]))}</span>`;
          itemEl.innerHTML = '';
          showRule();
          const t = FX.reduced() ? gsap.fromTo(flashEl, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.15 })
            : gsap.fromTo(flashEl, { autoAlpha: 0, scale: 1.2 }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(2)' });
          clock.track(t);
          clock.after(1500, () => { flashEl.hidden = true; step(); });
          return;
        }
        shown += 1;
        leftEl.textContent = `${shown} / ${total}`;
        tapped = false;
        itemEl.innerHTML = R.item(cur, { cls: 'xl' });
        padEl.setAttribute('aria-label', `${R.describe(cur)}. Tap if it fits the rule.`);
        if (!FX.reduced()) gsap.fromTo(itemEl.firstElementChild, { scale: 0.3, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.22, ease: 'back.out(2.2)' });
        clock.track(gsap.fromTo(winEl, { scaleX: 1 }, { scaleX: 0, duration: s.windowMs / 1000, ease: 'none' }));
        curStart = clock.now();
        expireId = clock.after(s.windowMs, expire);
      }

      function isTarget(it) {
        if (it.t === 'switch') return false;
        return X.matchRule(s.rules[active], it);
      }

      function expire() {
        if (done) return;
        if (isTarget(cur)) return end(false, `You missed ${R.describe(cur)} — it fit the rule.`);
        flags.push(false);
        if (cur.t === 'switch') { active = 1 - active; showRule(); FX.haptic(6); }
        const it = itemEl.firstElementChild;
        if (it && !FX.reduced()) gsap.to(it, { autoAlpha: 0, scale: 0.7, duration: 0.15 });
        clock.after(180, step);
      }

      function tap() {
        if (run.state !== 'active' || done || !cur || cur.t === 'rule' || tapped || k < 0) return;
        tapped = true;
        if (!isTarget(cur)) {
          return end(false, cur.t === 'switch' ? "Don't tap the ⚡ — it only swaps the rule." : `That was ${R.describe(cur)} — not a target.`);
        }
        clock.cancel(expireId);
        reactions.push(clock.now() - curStart);
        flags.push(true);
        Sfx.play('tap');
        FX.haptic(6);
        const it = itemEl.firstElementChild;
        padEl.classList.remove('hit');
        void padEl.offsetWidth;
        padEl.classList.add('hit');
        if (it && !FX.reduced()) gsap.to(it, { scale: 1.3, autoAlpha: 0, duration: 0.2, ease: 'power2.out' });
        clock.after(200, step);
      }
      padEl.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(); });
      padEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); } });

      const ctl = () => { done = true; };
      ctl.start = () => step();
      chCleanup = ctl;
    }

    /* ---------- Intro / boss cinematic ---------- */
    function intro() {
      return new Promise((resolve) => {
        const ov = introEl;
        const i = session.intro;
        const boss = session.def && session.def.boss;
        ov.hidden = false;
        ov.className = `intro ${boss ? 'boss' : ''} ${session.def && session.def.major ? 'major' : ''}`;
        ov.innerHTML = `<div class="intro-card">
          <p class="eyebrow">${esc(i.eyebrow)}</p>
          <h1 class="intro-title" data-title>${esc(i.title)}</h1>
          ${i.sub ? `<p class="lead">${esc(i.sub)}</p>` : ''}
          ${i.teach ? `<div class="teach"><span class="badge new">NEW</span><b>${esc(i.teach.name)}</b><p>${esc(i.teach.text)}</p></div>` : ''}
          ${boss && session.def.phases ? `<div class="phase-chips">${session.def.phases.map((p, n) => `<span>${n + 1}. ${esc(p)}</span>`).join('')}</div>` : ''}
          ${i.teach || boss ? `<button class="btn btn-primary" data-go>${boss ? 'Begin' : 'Got it'}</button>` : '<p class="tap-hint">Tap to start</p>'}
        </div>`;
        let closed = false;
        const close = () => {
          if (closed) return;
          closed = true;
          const t = FX.reduced() ? gsap.to(ov, { autoAlpha: 0, duration: 0.15 }) : gsap.to(ov, { autoAlpha: 0, scale: 1.04, duration: 0.3, ease: 'power2.in' });
          t.eventCallback('onComplete', () => { ov.hidden = true; resolve(); });
        };
        gsap.set(ov, { autoAlpha: 1, scale: 1 });
        const card = ov.querySelector('.intro-card');
        if (boss) { Sfx.play('boss'); FX.haptic([20, 60, 20]); }
        if (!FX.reduced()) {
          const tl = gsap.timeline();
          tl.fromTo(card.children, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'expo.out', stagger: 0.07 });
          if (boss) {
            const title = ov.querySelector('[data-title]');
            tl.fromTo(title, { skewX: 0 }, { duration: 0.6, keyframes: { skewX: [0, 18, -12, 6, 0], x: [0, -6, 8, -3, 0] }, ease: 'none' }, 0.1);
            tl.fromTo(ov.querySelectorAll('.phase-chips span'), { autoAlpha: 0, scale: 0.7 }, { autoAlpha: 1, scale: 1, stagger: 0.08, duration: 0.35, ease: 'back.out(2)' }, '-=0.2');
          }
        }
        const go = ov.querySelector('[data-go]');
        if (go) go.onclick = close;
        else {
          ov.onclick = close;
          setTimeout(close, 1600);
        }
      });
    }

    /* ---------- Pause ---------- */
    function pause() {
      if (finished || run.state === 'paused' || !['active', 'preparing', 'submitted', 'feedback'].includes(run.state)) return;
      run = E.pause(run);
      clock.pause();
      pauseRoot.hidden = false;
      pauseRoot.innerHTML = `<div class="pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-t">
        <h2 id="pause-t">Paused</h2>
        <p>Your timer is frozen.</p>
        <button class="btn btn-primary" data-resume>Resume</button>
        <button class="btn btn-secondary" data-restart>Restart</button>
        <button class="btn btn-ghost" data-quit>Quit</button>
      </div>`;
      gsap.fromTo(pauseRoot, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 });
      gsap.fromTo(pauseRoot.firstElementChild, { y: 30, scale: 0.96 }, { y: 0, scale: 1, duration: 0.4, ease: 'expo.out' });
      pauseRoot.querySelector('[data-resume]').onclick = resume;
      pauseRoot.querySelector('[data-restart]').onclick = () => { alive = false; session.onRestart(); };
      pauseRoot.querySelector('[data-quit]').onclick = () => { alive = false; session.onQuit(); };
      pauseRoot.querySelector('[data-resume]').focus({ preventScroll: true });
    }
    function resume() {
      if (run.state !== 'paused') return;
      gsap.to(pauseRoot, { autoAlpha: 0, duration: 0.15, onComplete: () => { pauseRoot.hidden = true; } });
      run = E.resume(run);
      clock.resume();
      if (pendingReady) { const ch = pendingReady; pendingReady = null; ready(ch); }
      if (pendingAdvance) { pendingAdvance = false; advance(); }
    }
    q('[data-pause-btn]').onclick = pause;
    const onVis = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', onVis);

    /* ---------- Go ---------- */
    hud.score.textContent = '0';
    setProgress();
    intro().then(() => { if (alive) next(); });

    return () => {
      alive = false;
      clock.clear();
      if (chCleanup) chCleanup();
      document.removeEventListener('visibilitychange', onVis);
      gsap.killTweensOf([banner, hud.fill, hud.timerFill]);
      // Fade overlays out alongside the screen, then drop exactly these nodes.
      [introEl, pauseRoot].forEach((n) => {
        gsap.killTweensOf(n);
        if (n.hidden) n.remove();
        else gsap.to(n, { autoAlpha: 0, duration: 0.25, onComplete: () => n.remove() });
      });
    };
  }

  /** Screen markup for gameplay. */
  function html(label) {
    return `<section class="screen play">
      <div class="hud">
        <div class="hud-row">
          <button class="icon-btn" data-pause-btn aria-label="Pause">${icon.pause}</button>
          <div class="hud-title"><b>${esc(label)}</b><small data-count></small></div>
          <div class="hud-score" aria-live="polite"><span data-score>0</span></div>
        </div>
        <div class="hud-row slim"><div class="progress-track"><div class="progress-fill" data-progress></div></div><div class="hearts" data-hearts></div></div>
        <div class="timer" data-timer hidden><i></i></div>
        <div class="phase-pill" data-phase hidden></div>
      </div>
      <div class="arena">
        <p class="instruction" data-instr aria-live="polite"></p>
        <p class="hint" data-hint></p>
        <div class="stage" data-stage></div>
        <div class="banner" data-banner aria-live="assertive"></div>
      </div>
      <div class="answers" data-answers></div>
    </section>`;
  }

  window.Play = { mount, html, pad3 };
})();

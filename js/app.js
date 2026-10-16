/* App shell: state, persistence, routing, theme, sessions. */
(function () {
  const L = window.BGLevels;
  const S = window.BGStore;
  const E = window.BGEngine;
  const FX = window.FX;
  const gsap = window.gsap;
  const Sfx = window.Sfx;

  /* ---------- State ---------- */
  const storage = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const memStore = { data: {}, getItem(k) { return this.data[k] || null; }, setItem(k, v) { this.data[k] = v; } };
  const store = storage || memStore;
  let state = { ...S.load(store), view: 'home', lastResult: null };
  let saveFailed = false;

  function commit(next) {
    state = next;
    const { view, lastResult, ...persist } = state;
    if (!S.save(store, persist) && !saveFailed) { saveFailed = true; FX.toast('Storage is full or blocked — progress may not be saved'); }
  }
  /** Apply a store transform, then unlock any achievements it earned. */
  function apply(fn, event) {
    const next = fn(state);
    const { state: withAch, unlocked } = S.checkAchievements(next, event);
    commit({ ...withAch, view: state.view, lastResult: state.lastResult });
    unlocked.forEach((a, i) => setTimeout(() => { Sfx.play('achievement'); FX.achievementToast(a); }, 300 + i * 150));
  }

  /* ---------- Theme ---------- */
  const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
  const effectiveDark = () => (state.settings.theme === 'system' ? darkMq.matches : state.settings.theme === 'dark');
  function applyTheme() {
    const root = document.documentElement;
    if (state.settings.theme === 'system') delete root.dataset.theme; else root.dataset.theme = state.settings.theme;
    root.dataset.dark = effectiveDark() ? '1' : '0';
    const meta = document.getElementById('theme-color');
    if (meta) meta.setAttribute('content', effectiveDark() ? '#000000' : '#f5f5f7');
  }
  function applySettings() {
    const st = state.settings;
    applyTheme();
    document.documentElement.classList.toggle('reduce-motion', !!st.reducedMotion);
    FX.setReduced(st.reducedMotion);
    FX.setHaptics(st.haptics);
    Sfx.setEnabled(st.sound);
    window.Render.setMarks(st.colorMarks);
  }
  FX.onMediaChange(darkMq, applyTheme);
  FX.onMediaChange(FX.mq, () => FX.ambient());

  /* ---------- Sessions ---------- */
  function answerHook(result, timing, ch) {
    apply((s) => S.recordAnswer(s, {
      correct: result.correct, category: ch.category, timed: !!ch.timeLimit,
      usedMs: timing.usedMs || 0, limitMs: ch.timeLimit, reactions: result.correct && ch.input === 'stream' ? timing.reactionMs || [] : [],
    }));
  }

  function playLevel(n) {
    // First time ever: let the player pick how hard the game should push.
    if (!state.settings.difficultyChosen) { chooseDifficulty(() => playLevel(n)); return; }
    const mode = state.settings.difficulty;
    const seed = randomSeed(); // fresh questions on every play, still reproducible from the seed
    const def = L.levelFor(n, mode, seed);
    commit(S.recordAttempt(state, n));
    const world = L.WORLDS[def.world - 1];
    const modeTag = ` · ${L.modeOf(mode).name}`;
    const mistakes = def.mistakesAllowed === 0 ? 'no mistakes allowed' : `${def.mistakesAllowed} mistake${def.mistakesAllowed > 1 ? 's' : ''} allowed`;
    startPlay({
      mode: 'level', def, seed, label: `LEVEL ${String(n).padStart(3, '0')}`,
      challenges: L.buildLevel(n, seed, mode), mistakesAllowed: def.mistakesAllowed, lives: null,
      intro: def.boss
        ? { eyebrow: (def.major ? `Major boss · Level ${n}` : `Boss level · ${n}`) + modeTag, title: def.title, sub: def.final ? 'Five phases. Everything you learned.' : `${def.challenges.length} challenges · ${mistakes}` }
        : { eyebrow: `World ${world.id}${modeTag}`, title: `Level ${n}`, sub: `${def.title} · ${mistakes}`, teach: def.teach },
      onFinish(run) {
        const summary = E.summary(run);
        const completed = run.state === 'completed';
        const prevBest = state.progress.levels[n] ? state.progress.levels[n].best : 0;
        if (completed) {
          apply((s) => S.recordLevel(s, n, summary), { type: 'level', n, perfect: summary.perfect, stars: summary.stars, levelType: def.type });
          Sfx.play('complete');
        } else Sfx.play('fail');
        const timed = def.challenges.some((c) => c.timed);
        showResult({ mode: 'level', def, summary, completed, timed, newBest: completed && prevBest > 0 && summary.score > prevBest });
      },
    });
  }

  function playEndless() {
    if (!S.endlessUnlocked(state)) { go('endless'); return; }
    const seed = randomSeed();
    startPlay({
      mode: 'endless', label: 'ENDLESS', lives: 3, mistakesAllowed: Infinity,
      next: (i, run) => L.endlessChallenge(seed, i, run.challenges.map((c) => c.template)),
      intro: { eyebrow: 'Endless mode', title: 'Three lives', sub: 'It only gets harder. How far can you go?' },
      onFinish(run) {
        const summary = E.summary(run);
        const prev = state.endless.best;
        apply((s) => S.recordEndless(s, { score: summary.score, completed: summary.correct, bestStreak: summary.bestStreak }));
        Sfx.play('fail');
        showResult({ mode: 'endless', summary, newBest: summary.score > prev });
      },
    });
  }

  function playDaily() {
    const key = L.dateKey();
    startPlay({
      mode: 'daily', label: 'DAILY', challenges: L.dailyChallenges(key), mistakesAllowed: Infinity, lives: null,
      intro: { eyebrow: 'Daily challenge', title: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), sub: '10 puzzles · same for everyone today' },
      onFinish(run) {
        const summary = E.summary(run);
        const prev = state.daily.records[key];
        apply((s) => S.recordDaily(s, key, summary.score));
        Sfx.play('complete');
        showResult({ mode: 'daily', key, summary, newBest: prev !== undefined && summary.score > prev });
      },
    });
  }

  let session = null;
  function startPlay(cfg) {
    session = {
      ...cfg,
      onAnswer: answerHook,
      onRestart: () => (cfg.mode === 'level' ? playLevel(cfg.def.n) : cfg.mode === 'daily' ? playDaily() : playEndless()),
      onQuit: () => go(cfg.mode === 'level' ? 'levels' : 'home'),
    };
    go('play');
  }
  function showResult(r) {
    commit({ ...state, lastResult: r });
    go('result');
  }

  function randomSeed() {
    try { return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0; } catch (e) { return Math.floor(Math.random() * 2 ** 32) >>> 0; }
  }

  /* ---------- Bottom sheets ---------- */
  /** Slide up a sheet; returns close(then). Backdrop / [data-close] dismiss it. */
  function openSheet(inner) {
    const root = document.getElementById('sheet-root');
    root.innerHTML = `<div class="sheet-backdrop" data-close></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-t">${inner}</div>`;
    const sheet = root.querySelector('.sheet');
    const back = root.querySelector('.sheet-backdrop');
    gsap.fromTo(back, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 });
    gsap.fromTo(sheet, { yPercent: 100 }, { yPercent: 0, duration: 0.5, ease: 'expo.out' });
    if (!FX.reduced()) gsap.fromTo(sheet.children, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'expo.out', stagger: 0.04, delay: 0.1 });
    let closing = false;
    const close = (then) => {
      if (closing) return;
      closing = true;
      gsap.to(back, { autoAlpha: 0, duration: 0.2 });
      gsap.to(sheet, { yPercent: 100, duration: 0.3, ease: 'power2.in', onComplete: () => { root.innerHTML = ''; if (then) then(); } });
    };
    root.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => close(); });
    return { root, close };
  }

  /** Difficulty picker: shown before the very first level, and from Settings. */
  function chooseDifficulty(then) {
    const cur = state.settings.difficulty;
    const { root, close } = openSheet(`<h2 id="sheet-t">How hard should it push?</h2>
      <p>You can change this any time in Settings.</p>
      <div class="mode-list">${Object.values(L.MODES).map((m) => `<button class="mode-card ${m.id === cur ? 'on' : ''}" data-mode="${m.id}">
        <b>${m.name}${m.id === 'normal' ? ' <small>Recommended</small>' : ''}</b><span>${m.desc}</span></button>`).join('')}</div>`);
    root.querySelectorAll('[data-mode]').forEach((b) => {
      b.onclick = () => {
        root.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
        commit({ ...state, settings: { ...state.settings, difficulty: b.dataset.mode, difficultyChosen: true } });
        FX.haptic(8);
        setTimeout(() => close(then), 180);
      };
    });
  }

  /* ---------- Reset ---------- */
  function confirmReset() {
    const { root, close } = openSheet(`<h2 id="sheet-t">Reset all progress?</h2>
        <p>Levels, stars, achievements, stats and streaks will be erased from this device. This can't be undone.</p>
        <button class="btn btn-danger" data-reset>Erase Everything</button>
        <button class="btn btn-secondary" data-close>Cancel</button>`);
    root.querySelector('[data-reset]').onclick = () => close(() => {
      const keep = state.settings;
      commit({ ...S.defaults(), settings: keep, view: 'home', lastResult: null });
      FX.toast('Progress reset');
      go('home');
    });
  }

  /* ---------- Context for screens ---------- */
  const ctx = {
    get state() { return state; },
    go: (v) => go(v),
    playLevel, playEndless, playDaily, confirmReset,
    setSetting(key, value) {
      commit({ ...state, settings: { ...state.settings, [key]: value } });
      // Theme changes crossfade the whole page where the browser supports it.
      if (key === 'theme' && document.startViewTransition && !FX.reduced()) document.startViewTransition(applySettings);
      else applySettings();
      if (key === 'reducedMotion') FX.ambient();
      if (key === 'sound' && value) Sfx.play('tap');
    },
  };

  /* ---------- Router ---------- */
  const stage = document.getElementById('stage');
  const topbar = document.querySelector('.topbar');
  const backBtn = document.getElementById('btn-back');
  const titleEl = document.getElementById('topbar-title');
  const TITLES = { levels: 'Levels', achievements: 'Achievements', stats: 'Statistics', settings: 'Settings', endless: '', daily: '', result: '' };
  const PARENT = { levels: 'home', achievements: 'home', stats: 'home', settings: 'home', endless: 'home', daily: 'home', result: 'home' };

  let cleanup = null;
  let busy = false;
  let queued = null;

  function go(view) {
    commit({ ...state, view });
    render();
  }

  async function render() {
    if (busy) { queued = true; return; }
    busy = true;
    stage.style.pointerEvents = 'none'; // block taps mid-transition
    const name = state.view;
    const old = stage.firstElementChild;
    if (cleanup) { try { cleanup(); } catch (e) { /* screen already gone */ } cleanup = null; }
    // Never let a stalled animation (e.g. a backgrounded tab) hold navigation hostage.
    if (old) await Promise.race([FX.leave(old), new Promise((r) => setTimeout(r, 400))]);
    gsap.killTweensOf(stage.querySelectorAll('*'));
    stage.innerHTML = '';

    const isPlay = name === 'play' && session;
    topbar.hidden = name === 'home' || name === 'play';
    titleEl.textContent = TITLES[name] || '';
    const boss = isPlay && session.def && session.def.boss ? (session.def.major ? '2' : '1') : '0';
    if (document.documentElement.dataset.boss !== boss) {
      document.documentElement.dataset.boss = boss;
      // Ease the ambient light into its boss (or normal) colours instead of snapping.
      if (!FX.reduced()) gsap.fromTo('.bg-glow', { autoAlpha: 0.2 }, { autoAlpha: 1, duration: 1.1, ease: 'power2.out' });
    }
    if (isPlay) {
      stage.innerHTML = window.Play.html(session.label);
      const el = stage.firstElementChild;
      cleanup = window.Play.mount(el, session);
      FX.enter(el);
    } else {
      const view = window.Screens[name] ? window.Screens[name](ctx) : window.Screens.home(ctx);
      stage.innerHTML = view.html;
      const el = stage.firstElementChild;
      cleanup = view.mount(el) || null;
      FX.enter(el);
    }
    await new Promise((r) => setTimeout(r, 280));
    stage.style.pointerEvents = '';
    busy = false;
    if (queued) { queued = null; render(); }
  }

  backBtn.onclick = () => go(PARENT[state.view] || 'home');

  /* ---------- Browser back ---------- */
  // Back from a sub-screen returns to its parent; during play it pauses instead of leaving.
  history.replaceState({ bg: 1 }, '');
  history.pushState({ bg: 2 }, '');
  window.addEventListener('popstate', () => {
    history.pushState({ bg: 2 }, '');
    if (state.view === 'play') { const p = stage.querySelector('[data-pause-btn]'); if (p) p.click(); return; }
    if (state.view !== 'home') go(PARENT[state.view] || 'home');
  });

  /* ---------- Boot ---------- */
  applySettings();
  FX.bindPress(document.body);
  FX.ambient();
  if (state.view === 'result' || state.view === 'play') state.view = 'home';
  render().catch(showCrash);

  // Offline: cache the app after first load (PWA).
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  function showCrash(err) {
    stage.style.pointerEvents = '';
    stage.innerHTML = `<section class="screen"><div class="screen-body center">
      <h1 class="title">Something glitched</h1>
      <p class="lead">Your progress is safe. Try reloading.</p>
      <button class="btn btn-primary" onclick="location.reload()">Reload</button></div></section>`;
    if (window.console) console.error(err);
  }
  window.addEventListener('error', (e) => { if (!stage.firstElementChild) showCrash(e.error); });
})();

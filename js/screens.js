/* Screen views. Each returns { html, mount(el) -> cleanup? }. ctx comes from app.js. */
(function () {
  const L = window.BGLevels;
  const S = window.BGStore;
  const FX = window.FX;
  const gsap = window.gsap;
  const esc = FX.escapeHtml;
  const pad3 = (n) => String(n).padStart(3, '0');
  const pct = (v) => `${Math.round(v * 100)}%`;
  const secs = (ms) => (ms === null || ms === undefined ? '—' : `${(ms / 1000).toFixed(2)}s`);
  const starStr = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

  const icon = {
    grid: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg>',
    cal: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
    inf: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M7 8.5c-2 0-3.5 1.6-3.5 3.5S5 15.5 7 15.5c3.5 0 6.5-7 10-7 2 0 3.5 1.6 3.5 3.5S19 15.5 17 15.5c-3.5 0-6.5-7-10-7z"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/></svg>',
    chart: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 20V11M12 20V5M19 20v-6"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    lock: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    crown: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z" fill="currentColor"/></svg>',
  };

  function progressBar(value, label = '') {
    return `<div class="progress" ${label ? `aria-label="${esc(label)}"` : ''}><div class="progress-track"><div class="progress-fill" data-to="${Math.max(0, Math.min(1, value)) * 100}"></div></div></div>`;
  }
  function animateBars(el, delay = 0.2) {
    el.querySelectorAll('.progress-fill[data-to]').forEach((f, i) => {
      if (FX.reduced()) { f.style.width = `${f.dataset.to}%`; return; }
      gsap.fromTo(f, { width: '0%' }, { width: `${f.dataset.to}%`, duration: 1, ease: 'expo.out', delay: delay + i * 0.05 });
    });
  }
  function animateCounters(el) {
    el.querySelectorAll('[data-count-to]').forEach((n) => {
      const to = Number(n.dataset.countTo);
      const dec = Number(n.dataset.dec || 0);
      FX.countUp(n, to, { duration: 1.1, format: (v) => (dec ? v.toFixed(dec) : Math.round(v).toLocaleString()) + (n.dataset.suffix || '') });
    });
  }

  const quips = (lvl) => (lvl < 5 ? 'Warming up the neurons.' : lvl < 20 ? "You're getting sharper." : lvl < 60 ? 'Trust nothing. Especially your fingers.'
    : lvl < 100 ? 'Your memory is a muscle.' : lvl < 150 ? 'Overload? Never heard of it.' : lvl < 200 ? 'Almost a Glitch Master.' : 'Glitch Master. Respect.');

  /* ---------------- Home ---------------- */
  function home(ctx) {
    const s = ctx.state;
    const fresh = S.levelsCompleted(s) === 0;
    const lvl = s.progress.unlocked;
    const cleared = S.levelsCompleted(s);
    const tiles = [
      ['levels', 'Levels', icon.grid], ['daily', 'Daily', icon.cal], ['endless', 'Endless', icon.inf],
      ['achievements', 'Awards', icon.trophy], ['stats', 'Stats', icon.chart], ['settings', 'Settings', icon.gear],
    ];
    return {
      html: `<section class="screen">
        <div class="screen-body center home">
          <div class="hero-art" aria-hidden="true" data-anim>
            <div class="morph"></div>
            <div class="hero-word">RED</div>
            <i class="orb o1"></i><i class="orb o2"></i><i class="orb o3"></i>
          </div>
          <div data-anim>
            <h1 class="title-xl glitch-title" data-text="BRAIN GLITCH">BRAIN GLITCH</h1>
            <p class="lead tagline">Your brain knows the answer.<br>Your fingers disagree.</p>
          </div>
          ${fresh ? '' : `<div class="card level-card" data-anim>
            <div class="lc-row"><div><p class="eyebrow">Level ${pad3(Math.min(lvl, 200))}</p><p class="lc-quip">${quips(lvl)}</p></div>
              <div class="lc-stars">★ ${S.totalStars(s)}</div></div>
            <div class="lc-meta"><span>Progress</span><span>${cleared} / ${L.TOTAL}</span></div>
            ${progressBar(cleared / L.TOTAL)}
          </div>`}
        </div>
        <div class="screen-foot">
          <button class="btn btn-primary btn-xl btn-shine" data-anim data-act="play">${fresh ? 'Start Playing' : 'Continue Playing'}</button>
          <div class="menu-grid">
            ${tiles.map(([k, label, ic]) => `<button class="menu-tile" data-anim data-go="${k}">${ic}<span>${label}</span></button>`).join('')}
          </div>
        </div>
      </section>`,
      mount(el) {
        el.querySelector('[data-act="play"]').onclick = () => ctx.playLevel(Math.min(lvl, L.TOTAL));
        el.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => ctx.go(b.dataset.go); });
        animateBars(el, 0.5);
        return heroAnimation(el);
      },
    };
  }

  /** Welcome illustration: square morphs into a circle while "RED" is painted in the wrong colours. */
  function heroAnimation(el) {
    const morph = el.querySelector('.morph');
    const word = el.querySelector('.hero-word');
    const orbs = el.querySelectorAll('.orb');
    const title = el.querySelector('.glitch-title');
    if (FX.reduced()) { gsap.set(word, { color: '#1e7bff' }); return null; }
    const words = [['RED', '#1e7bff'], ['BLUE', '#ff3b30'], ['GREEN', '#f5b800'], ['RED', '#28c24a']];
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.4, delay: 0.6 });
    words.forEach(([w, c], i) => {
      // The word swaps mid-morph and is back on screen before the shape settles.
      tl.addLabel(`m${i}`)
        .to(morph, { borderRadius: i % 2 ? '22%' : '50%', rotation: (i + 1) * 90, backgroundColor: words[(i + 1) % 4][1], duration: 0.9, ease: 'expo.inOut' })
        .to(word, { autoAlpha: 0, y: -8, scale: 0.9, duration: 0.14 }, `m${i}+=0.2`)
        .call(() => { word.textContent = w; word.style.color = c; }, null, `m${i}+=0.34`)
        .to(word, { autoAlpha: 1, y: 0, scale: 1, duration: 0.32, ease: 'back.out(2)' }, `m${i}+=0.34`)
        .to(orbs, { x: (n) => [36, -40, 20][(n + i) % 3], y: (n) => [-24, 10, 34][(n + i) % 3], duration: 0.9, ease: 'sine.inOut' }, '<-0.4')
        .to({}, { duration: 0.8 });
    });
    const glitch = gsap.timeline({ repeat: -1, repeatDelay: 3.2, delay: 1.5 })
      .to(title, { duration: 0.35, keyframes: { x: [0, -3, 4, -2, 0], skewX: [0, 8, -6, 3, 0] }, ease: 'none' });
    return () => { tl.kill(); glitch.kill(); };
  }

  /* ---------------- Level select ---------------- */
  function levels(ctx) {
    const s = ctx.state;
    const unlocked = s.progress.unlocked;
    const worldHtml = L.WORLDS.map((w) => {
      const n = w.to - w.from + 1;
      let done = 0;
      let stars = 0;
      const tiles = [];
      for (let lv = w.from; lv <= w.to; lv++) {
        const rec = s.progress.levels[lv];
        if (rec) { done += 1; stars += rec.stars; }
        const isBoss = !!L.BOSSES[lv];
        const locked = lv > unlocked;
        tiles.push(`<button class="level-tile ${isBoss ? 'boss' : ''} ${locked ? 'locked' : ''} ${rec ? 'done' : ''} ${lv === unlocked ? 'current' : ''}"
          data-lv="${lv}" ${locked ? 'aria-disabled="true"' : ''} aria-label="Level ${lv}${isBoss ? ', boss' : ''}${locked ? ', locked' : rec ? `, ${rec.stars} stars` : ''}">
          ${isBoss ? `<span class="crown">${icon.crown}</span>` : ''}
          <b>${locked ? icon.lock : lv}</b>
          <span class="tile-stars ${rec ? '' : 'empty'}">${rec ? starStr(rec.stars) : locked ? '' : '☆☆☆'}</span>
        </button>`);
      }
      const open = w.from <= unlocked;
      return `<section class="world ${open ? '' : 'world-locked'}" data-world="${w.id}">
        <div class="world-head card">
          <div><p class="eyebrow">World ${w.id} · ${esc(w.tag)}</p><h2>${esc(w.name)}</h2>
          <p class="muted small">${n} levels · ${done ? `${Math.round((done / n) * 100)}% complete · ★ ${stars}/${n * 3}` : open ? 'Ready when you are' : `Clear Level ${w.from - 1} to unlock`}</p></div>
          ${progressBar(done / n)}
        </div>
        <div class="level-grid">${tiles.join('')}</div>
      </section>`;
    }).join('');
    return {
      html: `<section class="screen"><div class="screen-body top scroll" data-scroll>${worldHtml}<div style="height:24px"></div></div></section>`,
      mount(el) {
        const scroller = el.querySelector('[data-scroll]');
        const cur = el.querySelector('.level-tile.current') || el.querySelector('.level-tile');
        const world = cur.closest('.world');
        scroller.scrollTop = Math.max(0, world.offsetTop - 8);
        let opening = false; // one tap opens one level, even on a quick double tap
        el.querySelectorAll('.level-tile').forEach((b) => {
          b.onclick = () => {
            if (opening) return;
            if (b.classList.contains('locked')) { FX.shake(b); FX.toast('Clear the level before it first'); return; }
            opening = true;
            const lv = Number(b.dataset.lv);
            FX.haptic(8);
            if (FX.reduced()) { ctx.playLevel(lv); return; }
            // The chosen tile swells toward the viewer before gameplay takes over.
            gsap.to(b, { scale: 1.6, autoAlpha: 0, zIndex: 5, duration: 0.3, ease: 'power2.in', onComplete: () => ctx.playLevel(lv) });
          };
        });
        if (!FX.reduced()) {
          const visible = world.querySelectorAll('.level-tile');
          gsap.fromTo(visible, { autoAlpha: 0, y: 14, scale: 0.85 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.45, ease: 'back.out(1.8)', stagger: 0.012, delay: 0.15 });
          if (cur.classList.contains('current')) gsap.to(cur, { boxShadow: '0 0 0 3px var(--accent)', repeat: -1, yoyo: true, duration: 0.9, ease: 'sine.inOut' });
        }
        animateBars(el);
        return () => gsap.killTweensOf(cur);
      },
    };
  }

  /* ---------------- Results (level / endless / daily) ---------------- */
  function result(ctx) {
    const r = ctx.state.lastResult;
    const m = r.summary;
    if (r.mode === 'level' && !r.completed) return failed(ctx, r);
    const statCard = (label, value, extra = '') => `<div class="stat"><small>${label}</small><b ${extra}>${value}</b></div>`;
    let head;
    let stats;
    let buttons;
    let extraHtml = '';
    if (r.mode === 'level') {
      const def = r.def;
      head = `<p class="eyebrow">${def.boss ? 'Boss defeated' : `Level ${pad3(def.n)}`}</p>
        <h1 class="title" data-split>${def.final ? 'GLITCH MASTER' : def.boss ? def.title.toUpperCase() : 'LEVEL COMPLETE'}</h1>
        <p class="lead">${m.stars === 3 ? 'EXCELLENT WORK!' : m.stars === 2 ? 'GREAT JOB!' : 'YOU MADE IT!'}${r.newBest ? ' · New best!' : ''}</p>
        <div class="stars" aria-label="${m.stars} of 3 stars">${[1, 2, 3].map((i) => `<span class="star ${i <= m.stars ? 'on' : ''}">★</span>`).join('')}</div>`;
      stats = statCard('Score', '0', `data-count-to="${m.score}"`) + statCard('Accuracy', pct(m.accuracy))
        + statCard('Best reaction', secs(m.bestReaction)) + statCard('Best streak', m.bestStreak);
      extraHtml = `<details class="card how"><summary>How stars &amp; score work</summary>
          <p>★ complete · ★★ at most one mistake · ★★★ no mistakes${r.timed ? ' and under 60% of the clock on average' : ''}.</p>
          <p>Each right answer is 100 points, plus up to 50 for speed on timed challenges, times your streak (3 in a row ×1.2, 5 ×1.5, 10 ×2). A flawless level adds 200.</p>
          ${m.perfect ? '<p><b>Perfect level bonus: +200</b></p>' : ''}
        </details>
        <div class="card"><div class="lc-meta"><span>Game progress</span><span>${S.levelsCompleted(ctx.state)} / ${L.TOTAL}</span></div>${progressBar(S.levelsCompleted(ctx.state) / L.TOTAL)}</div>`;
      const nextLv = def.n + 1;
      buttons = def.n < L.TOTAL
        ? `<button class="btn btn-primary" data-act="next">Next Level</button>
           <div class="btn-row"><button class="btn btn-secondary" data-act="retry">Retry</button><button class="btn btn-secondary" data-act="levels">Levels</button></div>`
        : `<button class="btn btn-primary" data-act="endless">Play Endless Mode</button>
           <div class="btn-row"><button class="btn btn-secondary" data-act="retry">Retry</button><button class="btn btn-secondary" data-act="home">Home</button></div>`;
      r.nextLv = nextLv;
    } else if (r.mode === 'endless') {
      head = `<p class="eyebrow">Endless · Tier ${L.endlessTier(m.answered)}</p><h1 class="title" data-split>RUN OVER</h1>
        <p class="lead">${r.newBest ? 'New personal best!' : `Personal best: ${ctx.state.endless.best.toLocaleString()}`}</p>`;
      stats = statCard('Score', '0', `data-count-to="${m.score}"`) + statCard('Cleared', m.correct) + statCard('Longest streak', m.bestStreak)
        + statCard('Accuracy', pct(m.accuracy)) + statCard('Avg reaction', secs(m.avgReaction)) + statCard('Best reaction', secs(m.bestReaction));
      buttons = '<button class="btn btn-primary" data-act="again">Play Again</button><button class="btn btn-secondary" data-act="home">Home</button>';
    } else {
      head = `<p class="eyebrow">Daily · ${esc(r.key)}</p><h1 class="title" data-split>DAILY DONE</h1>
        <p class="lead">${r.newBest ? 'New best for today!' : `Today's best: ${(ctx.state.daily.records[r.key] || 0).toLocaleString()}`}</p>`;
      stats = statCard('Score', '0', `data-count-to="${m.score}"`) + statCard('Accuracy', pct(m.accuracy))
        + statCard('Day streak', S.liveDailyStreak(ctx.state, r.key)) + statCard('Best streak', m.bestStreak);
      buttons = '<button class="btn btn-primary" data-act="home">Home</button><button class="btn btn-secondary" data-act="daily-again">Play Again</button>';
    }
    return {
      html: `<section class="screen">
        <div class="screen-body top scroll center results">
          <div data-anim class="results-head">${head}</div>
          <div class="stat-grid" data-anim>${stats}</div>
          ${extraHtml ? `<div data-anim class="stack">${extraHtml}</div>` : ''}
        </div>
        <div class="screen-foot" data-anim>${buttons}</div>
      </section>`,
      mount(el) {
        const act = (k, fn) => { const b = el.querySelector(`[data-act="${k}"]`); if (b) b.onclick = fn; };
        act('next', () => ctx.playLevel(r.nextLv));
        act('retry', () => ctx.playLevel(r.def.n));
        act('levels', () => ctx.go('levels'));
        act('home', () => ctx.go('home'));
        act('endless', () => ctx.go('endless'));
        act('again', () => ctx.playEndless());
        act('daily-again', () => ctx.playDaily());
        animateCounters(el);
        animateBars(el, 0.8);
        const starsEl = el.querySelectorAll('.star');
        const big = r.mode === 'level' && (m.stars === 3 || r.def.boss);
        if (!FX.reduced()) {
          starsEl.forEach((st, i) => {
            gsap.fromTo(st, { scale: 0, rotation: -120, autoAlpha: 0 }, {
              scale: 1, rotation: 0, autoAlpha: 1, duration: 0.7, ease: 'back.out(2.4)', delay: 0.5 + i * 0.25,
              onStart: () => { if (st.classList.contains('on')) { window.Sfx.play('star'); FX.haptic(10); } },
            });
          });
          el.querySelectorAll('.stat').forEach((c, i) => gsap.fromTo(c, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.5, delay: 0.3 + i * 0.08, ease: 'expo.out' }));
        }
        if (big) setTimeout(() => FX.confetti(r.def.final || r.def.major ? 140 : 80), 600);
      },
    };
  }

  function failed(ctx, r) {
    const m = r.summary;
    return {
      html: `<section class="screen">
        <div class="screen-body center">
          <div class="fail-glyph" data-anim aria-hidden="true">⚠︎</div>
          <div data-anim><p class="eyebrow">Level ${pad3(r.def.n)} · ${esc(r.def.title)}</p>
            <h1 class="title glitch-title" data-text="BRAIN GLITCHED!">BRAIN GLITCHED!</h1><p class="lead">Almost had it.</p></div>
          <div class="card" data-anim>
            <div class="lc-meta"><span>Challenge progress</span><span>${m.answered} / ${r.def.challenges.length}</span></div>
            ${progressBar(m.answered / r.def.challenges.length)}
          </div>
          <div class="stat-grid" data-anim>
            <div class="stat"><small>Score</small><b>${m.score.toLocaleString()}</b></div>
            <div class="stat"><small>Accuracy</small><b>${pct(m.accuracy)}</b></div>
            <div class="stat"><small>Best streak</small><b>${m.bestStreak}</b></div>
            <div class="stat"><small>Mistakes allowed</small><b>${r.def.mistakesAllowed}</b></div>
          </div>
        </div>
        <div class="screen-foot" data-anim>
          <button class="btn btn-primary" data-act="retry">Try Again</button>
          <button class="btn btn-secondary" data-act="levels">Level Selection</button>
        </div>
      </section>`,
      mount(el) {
        el.querySelector('[data-act="retry"]').onclick = () => ctx.playLevel(r.def.n);
        el.querySelector('[data-act="levels"]').onclick = () => ctx.go('levels');
        animateBars(el, 0.4);
        if (!FX.reduced()) gsap.fromTo(el.querySelector('.fail-glyph'), { rotation: -12 }, { rotation: 12, yoyo: true, repeat: 3, duration: 0.12, ease: 'sine.inOut', delay: 0.4 });
      },
    };
  }

  /* ---------------- Endless lobby ---------------- */
  function endless(ctx) {
    const s = ctx.state;
    const open = S.endlessUnlocked(s);
    const e = s.endless;
    return {
      html: `<section class="screen">
        <div class="screen-body center">
          <div class="big-icon" data-anim>${icon.inf}</div>
          <div data-anim><p class="eyebrow">Endless Mode</p><h1 class="title">How far can you go?</h1></div>
          ${open ? `<p class="lead" data-anim>Three lives. Every challenge is freshly generated and a little harder than the last.</p>
            <div class="stat-grid" data-anim>
              <div class="stat"><small>Personal best</small><b>${e.best.toLocaleString()}</b></div>
              <div class="stat"><small>Longest run</small><b>${e.longestRun}</b></div>
              <div class="stat"><small>Best streak</small><b>${e.bestStreak}</b></div>
              <div class="stat"><small>Runs</small><b>${e.runs}</b></div>
            </div>`
    : `<div class="card center" data-anim><p class="lock-line">${icon.lock} Locked</p>
              <p class="muted">Clear Level 200, <b>The Final Glitch</b>, to unlock Endless Mode.</p>
              <div class="lc-meta"><span>Levels cleared</span><span>${S.levelsCompleted(s)} / ${L.TOTAL}</span></div>${progressBar(S.levelsCompleted(s) / L.TOTAL)}</div>`}
        </div>
        <div class="screen-foot">${open ? '<button class="btn btn-primary" data-anim data-act="go">Start Run</button>' : '<button class="btn btn-primary" data-anim data-act="levels">Keep Playing Levels</button>'}</div>
      </section>`,
      mount(el) {
        const go = el.querySelector('[data-act="go"]');
        if (go) go.onclick = ctx.playEndless;
        const lv = el.querySelector('[data-act="levels"]');
        if (lv) lv.onclick = () => ctx.playLevel(Math.min(s.progress.unlocked, L.TOTAL));
        animateBars(el);
      },
    };
  }

  /* ---------------- Daily lobby ---------------- */
  function daily(ctx) {
    const s = ctx.state;
    const key = L.dateKey();
    const best = s.daily.records[key];
    const streak = S.liveDailyStreak(s, key);
    const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    return {
      html: `<section class="screen">
        <div class="screen-body center">
          <div class="big-icon" data-anim>${icon.cal}</div>
          <div data-anim><p class="eyebrow">${esc(date)}</p><h1 class="title">Daily Challenge</h1></div>
          <p class="lead" data-anim>10 mixed puzzles. Same set for everyone today, new set tomorrow.</p>
          <div class="stat-grid" data-anim>
            <div class="stat"><small>Today</small><b>${best !== undefined ? '✓ Done' : 'Not played'}</b></div>
            <div class="stat"><small>Today's best</small><b>${best !== undefined ? best.toLocaleString() : '—'}</b></div>
            <div class="stat"><small>Day streak</small><b>${streak}</b></div>
            <div class="stat"><small>Longest streak</small><b>${s.daily.bestStreak}</b></div>
          </div>
          <p class="muted small" data-anim>Streaks are saved on this device only.</p>
        </div>
        <div class="screen-foot"><button class="btn btn-primary" data-anim data-act="go">${best !== undefined ? 'Play Again' : 'Play Today'}</button></div>
      </section>`,
      mount(el) { el.querySelector('[data-act="go"]').onclick = ctx.playDaily; },
    };
  }

  /* ---------------- Achievements ---------------- */
  function achievements(ctx) {
    const s = ctx.state;
    const list = S.ACHIEVEMENTS;
    const got = list.filter((a) => s.achievements[a.id]).length;
    const items = list.map((a) => {
      const at = s.achievements[a.id];
      const g = a.goal ? a.goal(s) : null;
      const prog = !at && g ? `<div class="ach-prog">${progressBar(Math.min(1, g[0] / g[1]))}<small>${Math.min(g[0], g[1])} / ${g[1]}</small></div>` : '';
      return `<div class="ach-card ${at ? 'got' : 'locked'}" data-anim>
        <span class="ach-ico">${at ? a.icon : icon.lock}</span>
        <div class="ach-body"><b>${esc(a.name)}</b><p>${esc(a.desc)}</p>${at ? `<small class="ach-date">Unlocked ${new Date(at).toLocaleDateString()}</small>` : prog}</div>
      </div>`;
    }).join('');
    return {
      html: `<section class="screen"><div class="screen-body top scroll">
        <div class="card" data-anim><div class="lc-meta"><span>Unlocked</span><span>${got} / ${list.length}</span></div>${progressBar(got / list.length)}</div>
        <div class="ach-list">${items}</div><div style="height:20px"></div>
      </div></section>`,
      mount(el) { animateBars(el); },
    };
  }

  /* ---------------- Stats ---------------- */
  function stats(ctx) {
    const s = ctx.state;
    const st = s.stats;
    const acc = st.attempted ? st.correct / st.attempted : 0;
    const avg = st.timedCount ? st.timedSum / st.timedCount : null;
    const card = (label, to, opts = {}) => `<div class="stat"><small>${label}</small><b ${to === null ? '' : `data-count-to="${to}" data-dec="${opts.dec || 0}" data-suffix="${opts.suffix || ''}"`}>${to === null ? '—' : 0}</b></div>`;
    const worldStars = L.WORLDS.map((w) => {
      let n = 0;
      for (let lv = w.from; lv <= w.to; lv++) n += s.progress.levels[lv] ? s.progress.levels[lv].stars : 0;
      return { w, n, max: (w.to - w.from + 1) * 3 };
    });
    return {
      html: `<section class="screen"><div class="screen-body top scroll">
        <div class="stat-grid" data-anim>
          ${card('Current level', Math.min(s.progress.unlocked, 200))}
          ${card('Levels completed', S.levelsCompleted(s))}
          ${card('Challenges tried', st.attempted)}
          ${card('Correct answers', st.correct)}
          ${card('Accuracy', st.attempted ? Math.round(acc * 100) : null, { suffix: '%' })}
          ${card('Total stars', S.totalStars(s))}
          ${card('Best reaction', st.bestReaction ? st.bestReaction / 1000 : null, { dec: 2, suffix: 's' })}
          ${card('Avg reaction (timed)', avg ? avg / 1000 : null, { dec: 2, suffix: 's' })}
          ${card('Longest streak', st.longestStreak)}
          ${card('Daily streak', S.liveDailyStreak(s, L.dateKey()))}
          ${card('Endless best', s.endless.best)}
          ${card('Total score', st.totalScore)}
        </div>
        <div class="card" data-anim><p class="eyebrow">Stars by world</p>
          <div class="bars">${worldStars.map(({ w, n, max }) => `<div class="bar-row"><span>W${w.id}</span>${progressBar(n / max)}<small>${n}/${max}</small></div>`).join('')}</div>
        </div><div style="height:20px"></div>
      </div></section>`,
      mount(el) { animateCounters(el); animateBars(el, 0.3); },
    };
  }

  /* ---------------- Settings ---------------- */
  function settings(ctx) {
    const st = ctx.state.settings;
    const toggle = (key, label, sub) => `<div class="set-row"><div><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</div>
      <button class="switch" role="switch" aria-checked="${st[key]}" aria-label="${label}" data-toggle="${key}"><i></i></button></div>`;
    return {
      html: `<section class="screen"><div class="screen-body top scroll">
        <div class="card" data-anim>
          <p class="eyebrow">Appearance</p>
          <div class="seg" role="radiogroup" aria-label="Theme">
            ${['system', 'light', 'dark'].map((t) => `<button role="radio" aria-checked="${st.theme === t}" data-theme-opt="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
          </div>
        </div>
        <div class="card" data-anim>
          <p class="eyebrow">Difficulty</p>
          <div class="seg" role="radiogroup" aria-label="Difficulty">
            ${Object.values(L.MODES).map((m) => `<button role="radio" aria-checked="${st.difficulty === m.id}" data-mode-opt="${m.id}">${m.name}</button>`).join('')}
          </div>
          <p class="muted small seg-note" data-mode-desc>${esc(L.modeOf(st.difficulty).desc)}</p>
        </div>
        <div class="card set-list" data-anim>
          ${toggle('sound', 'Sound effects', 'Soft taps and chimes')}
          ${toggle('haptics', 'Haptic feedback', 'Vibration where your phone supports it')}
          ${toggle('reducedMotion', 'Reduce motion', 'Calmer transitions, no glitch effects')}
          ${toggle('colorMarks', 'Color symbols', 'Adds a letter to colors (R, B, G…) for colorblind play')}
        </div>
        <div class="card" data-anim>
          <p class="eyebrow">Your data</p>
          <p class="muted small">Progress is saved only in this browser. No account, nothing sent anywhere.</p>
          <button class="btn btn-danger" data-act="reset">Reset Progress</button>
        </div>
      </div></section>`,
      mount(el) {
        el.querySelectorAll('[data-theme-opt]').forEach((b) => {
          b.onclick = () => {
            ctx.setSetting('theme', b.dataset.themeOpt);
            el.querySelectorAll('[data-theme-opt]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
          };
        });
        const desc = el.querySelector('[data-mode-desc]');
        el.querySelectorAll('[data-mode-opt]').forEach((b) => {
          b.onclick = () => {
            ctx.setSetting('difficulty', b.dataset.modeOpt);
            ctx.setSetting('difficultyChosen', true);
            el.querySelectorAll('[data-mode-opt]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
            desc.textContent = L.modeOf(b.dataset.modeOpt).desc;
            if (!FX.reduced()) gsap.fromTo(desc, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.3 });
          };
        });
        el.querySelectorAll('[data-toggle]').forEach((b) => {
          b.onclick = () => {
            const v = b.getAttribute('aria-checked') !== 'true';
            b.setAttribute('aria-checked', String(v));
            ctx.setSetting(b.dataset.toggle, v);
          };
        });
        el.querySelector('[data-act="reset"]').onclick = ctx.confirmReset;
      },
    };
  }

  window.Screens = { home, levels, result, endless, daily, achievements, stats, settings };
})();

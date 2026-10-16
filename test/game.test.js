// Run: node test/game.test.js
const assert = require('node:assert/strict');
const C = require('../js/core.js');
const X = require('../js/challenges.js');
const L = require('../js/levels.js');
const E = require('../js/engine.js');
const S = require('../js/store.js');

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };

/* ---------- Seeded RNG ---------- */
{
  const a = C.rng(42);
  const b = C.rng(42);
  eq([a(), a(), a()], [b(), b(), b()], 'rng not deterministic');
  ok(C.hash('2026-10-17') === C.hash('2026-10-17') && C.hash('a') !== C.hash('b'), 'hash');
}

/* ---------- Every template: valid, unique options, solver agrees, reproducible ---------- */
{
  const counts = {};
  for (const t of X.TEMPLATES) {
    for (let d = 1; d <= 12; d += 0.5) {
      for (let s = 0; s < 120; s++) {
        const seed = C.hash(`${t}-${d}-${s}`);
        const ch = X.generate(t, seed, d, { timed: true });
        const problems = X.check(ch);
        assert.deepEqual(problems, [], `${t} d=${d} seed=${seed}: ${problems.join(', ')}`);
        eq(X.generate(t, seed, d, { timed: true }), ch, `${t} not reproducible from its seed`);
        // The stored answer validates; for choices, every other option is rejected.
        if (ch.input === 'choice') {
          ch.options.forEach((_, i) => assert.equal(X.validate(ch, i), i === ch.answer, `${t}: option ${i}`));
          ok(!X.validate(ch, null), 'timeout must be wrong');
        } else if (ch.input === 'sequence') {
          ok(X.validate(ch, ch.answer.slice()), `${t} sequence`);
          ok(!X.validate(ch, ch.answer.slice(0, -1)), `${t} short sequence accepted`);
        } else {
          const flags = ch.answer.filter((v) => v !== null);
          ok(X.validate(ch, flags), `${t} stream`);
          ok(!X.validate(ch, flags.map((f, i) => (i === 0 ? !f : f))), `${t} wrong stream accepted`);
          ok(ch.stream.windowMs >= 750, 'reaction window too short');
        }
        if (ch.timeLimit) ok(ch.timeLimit >= 2500, 'time limit too short');
        if (ch.memorize && ch.memorize.exposureMs) ok(ch.memorize.exposureMs >= 1200, 'exposure too short');
        counts[t] = (counts[t] || 0) + 1;
      }
    }
  }
  ok(Object.keys(counts).length === X.TEMPLATES.length && X.TEMPLATES.length >= 40, 'template coverage');
}

/* ---------- Specific rules stay true ---------- */
{
  const ch = X.generate('cc_ink', 7, 3);
  ok(ch.stimulus.word !== ch.stimulus.color, 'stroop word must differ from ink');
  const dir = X.generate('dir_text_vs_arrow', 9, 4);
  ok(dir.stimulus.label !== dir.stimulus.dir, 'text and arrow must conflict');
  const op = X.generate('dir_opposite', 3, 2);
  eq(op.options[op.answer].v, C.opposite(op.stimulus.dir), 'opposite');
  // Stream rule-switch: the rule after a RULE CHANGED marker is the one applied.
  const sw = X.generate('rs_color_switch', 11, 5);
  const firstMarker = sw.stream.items.findIndex((it) => it.t === 'rule');
  ok(firstMarker > 0, 'rule switch has a marker');
  const after = sw.stream.items.slice(firstMarker + 1).find((it) => it.t === 'shape');
  eq(X.streamTargets(sw.stream)[sw.stream.items.indexOf(after)], X.matchRule(sw.stream.rules[1], after), 'rule after switch');
}

/* ---------- 200 designed levels ---------- */
{
  const types = {};
  let prevD = 0;
  for (let n = 1; n <= L.TOTAL; n++) {
    const def = L.level(n);
    types[def.type] = (types[def.type] || 0) + 1;
    ok(def.difficulty >= 1 && def.difficulty <= 10, `difficulty ${n}`);
    if (!def.boss) { ok(def.difficulty >= prevD - 0.01, `difficulty must not drop (level ${n})`); prevD = def.difficulty; }
    ok(def.challenges.length >= 3 && def.challenges.length <= 10, `count ${n}`);
    // Every mechanic used must already have been taught.
    def.challenges.forEach((c) => ok(L.introLevelOf[c.template] <= n, `level ${n} uses ${c.template} before it is taught`));
    if (n < 25) def.challenges.forEach((c) => ok(!c.timed, `level ${n} timed too early`));
    const a0 = L.buildLevel(n, 0);
    eq(L.buildLevel(n, 0), a0, `level ${n} attempt not reproducible`);
    a0.forEach((ch) => eq(X.check(ch), [], `level ${n} ${ch.template}`));
  }
  eq(L.level(1).challenges.map((c) => c.template), ['sh_colorshape', 'sh_colorshape', 'sh_colorshape'], 'level 1 teaches one interaction');
  ok(L.level(2).challenges[0].template !== L.level(1).challenges[0].template, 'level 2 teaches something new');
  [20, 60, 100, 200].forEach((n) => ok(L.level(n).boss, `boss ${n}`));
  ok(new Set(L.level(20).challenges.map((c) => X.templateInfo(c.template).category)).size >= 3, 'first boss combines 3 mechanics');
  eq(L.level(200).phases.length, 5, 'final glitch has 5 phases');
  ok(types.intro >= 40 && types.boss >= 8, 'level variety');
  const intros = Object.values(L.INTRO);
  eq([...X.TEMPLATES].sort(), [...intros].sort(), 'every template is taught exactly once');
}

/* ---------- Daily + endless ---------- */
{
  const d1 = L.dailyChallenges('2026-10-17');
  eq(L.dailyChallenges('2026-10-17'), d1, 'daily must be identical for everyone on a date');
  ok(JSON.stringify(L.dailyChallenges('2026-10-18')) !== JSON.stringify(d1), 'daily changes each day');
  ok(new Set(d1.map((c) => c.category)).size >= 6, 'daily is balanced');
  const used = [];
  for (let i = 0; i < 300; i++) {
    const ch = L.endlessChallenge(1234, i, used);
    eq(X.check(ch), [], `endless ${i}`);
    ok(!used.slice(-5).includes(ch.template), 'endless repeats a recent mechanic');
    used.push(ch.template);
  }
  ok(L.endlessDifficulty(500) <= 12, 'endless difficulty capped');
}

/* ---------- Scoring ---------- */
{
  eq(E.multiplier(2), 1); eq(E.multiplier(3), 1.2); eq(E.multiplier(5), 1.5); eq(E.multiplier(10), 2); eq(E.multiplier(99), 2);
  eq(E.pointsFor({ correct: true, streak: 1 }).total, 100, 'untimed = no time bonus');
  eq(E.pointsFor({ correct: true, streak: 1, usedMs: 0, limitMs: 4000 }).total, 150, 'instant timed answer');
  eq(E.pointsFor({ correct: true, streak: 5, usedMs: 2000, limitMs: 4000 }).total, Math.round(125 * 1.5), 'bonus x multiplier');
  eq(E.pointsFor({ correct: false, streak: 0 }).total, 0);
  eq(E.starsFor({ mistakes: 0, timedUsedRatio: null }), 3);
  eq(E.starsFor({ mistakes: 0, timedUsedRatio: 0.9 }), 2, 'slow timed level cannot get 3 stars');
  eq(E.starsFor({ mistakes: 1, timedUsedRatio: null }), 2);
  eq(E.starsFor({ mistakes: 2, timedUsedRatio: null }), 1);
}

/* ---------- State machine ---------- */
{
  const chs = L.buildLevel(5, 0);
  let run = E.createRun({ mode: 'level', challenges: chs, mistakesAllowed: 1 });
  // Input before the challenge is active is ignored.
  eq(E.submit(run, chs[0].answer).result, null, 'answer accepted during intro');
  run = E.prepare(run);
  eq(E.submit(run, chs[0].answer).result, null, 'answer accepted while preparing');
  run = E.activate(run);
  let out = E.submit(run, chs[0].answer, { usedMs: 500 });
  ok(out.result.correct, 'correct answer');
  // Double tap: second submit is ignored.
  const again = E.submit(out.run, chs[0].answer);
  eq(again.result, null, 'double submit counted');
  eq(again.run.score, out.run.score);
  run = E.advance(E.showFeedback(out.run));
  eq(run.index, 1);
  // Pause blocks input; resume restores.
  run = E.pause(E.activate(E.prepare(run)));
  eq(E.submit(run, chs[1].answer).result, null, 'answer accepted while paused');
  run = E.resume(run);
  run = E.advance(E.showFeedback(E.submit(run, (chs[1].answer + 1) % chs[1].options.length).run));
  run = E.advance(E.showFeedback(E.submit(E.activate(E.prepare(run)), chs[2].answer).run));
  eq(run.state, 'completed', 'level completes with one allowed mistake');
  const sum = E.summary(run);
  eq(sum.stars, 2);
  eq(E.advance(run), run, 'completion fires once');
  // Too many mistakes = failed.
  let r2 = E.createRun({ mode: 'level', challenges: chs, mistakesAllowed: 0 });
  r2 = E.advance(E.showFeedback(E.submit(E.activate(E.prepare(r2)), null).run));
  eq(r2.state, 'failed', 'timeout counts as a mistake and fails');
  // Endless lives.
  let r3 = E.createRun({ mode: 'endless', lives: 3 });
  for (let i = 0; i < 3; i++) {
    const ch = L.endlessChallenge(1, i, []);
    r3 = E.activate(E.prepare(r3, ch));
    r3 = E.advance(E.showFeedback(E.submit(r3, null).run));
  }
  eq(r3.state, 'failed', 'endless ends after 3 lives');
  eq(r3.lives, 0);
  // Perfect level bonus.
  let r4 = E.createRun({ mode: 'level', challenges: chs, mistakesAllowed: 1 });
  chs.forEach((ch) => { r4 = E.advance(E.showFeedback(E.submit(E.activate(E.prepare(r4)), ch.answer).run)); });
  eq(r4.score, 300 + E.PERFECT_BONUS + Math.round(100 * 0.2), 'perfect bonus + streak');
  eq(E.summary(r4).stars, 3);
}

/* ---------- Persistence + achievements ---------- */
{
  const mem = { data: {}, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = v; } };
  eq(S.load(mem), S.defaults(), 'empty storage gives defaults');
  mem.data[S.KEY] = '{not json';
  eq(S.load(mem), S.defaults(), 'corrupt JSON recovers');
  const junk = S.sanitize({ settings: { theme: 'neon', sound: 'yes' }, progress: { unlocked: 9999, levels: { 3: { stars: 7 }, 5: { stars: 2, best: 400 } } }, achievements: { fake: 1 } });
  eq(junk.settings.theme, 'system');
  eq(junk.settings.sound, true);
  eq(Object.keys(junk.progress.levels), ['5'], 'invalid level records dropped');
  eq(junk.progress.unlocked, 6, 'out-of-range unlock falls back to what was actually cleared');
  eq(junk.achievements, {});

  let s = S.defaults();
  s = S.recordLevel(s, 1, { score: 300, stars: 2 }, 1000);
  eq(s.progress.unlocked, 2, 'next level unlocks');
  s = S.recordLevel(s, 1, { score: 200, stars: 3 }, 2000);
  eq(s.progress.levels[1], { stars: 3, best: 300, completedAt: 1000 }, 'best of each kept');
  const res = S.checkAchievements(s, { type: 'level', perfect: true });
  ok(res.state.achievements.first_spark && res.state.achievements.perfect_mind, 'achievements unlock');
  eq(S.checkAchievements(res.state, { type: 'level', perfect: true }).unlocked, [], 'achievements unlock once');
  S.save(mem, res.state);
  eq(S.load(mem), res.state, 'save/load roundtrip');

  // Stats.
  let st = S.defaults();
  for (let i = 0; i < 20; i++) st = S.recordAnswer(st, { correct: true, category: 'memory' });
  ok(S.checkAchievements(st).unlocked.some((a) => a.id === 'unstoppable'), '20 streak');
  st = S.recordAnswer(st, { correct: true, category: 'color', timed: true, usedMs: 800, limitMs: 5000 });
  eq(st.stats.bestReaction, 800);
  eq(st.stats.quickAnswers, 1);
  st = S.recordAnswer(st, { correct: false, category: 'color' });
  eq(st.stats.currentStreak, 0);
  eq(st.stats.longestStreak, 21);

  // Daily streak.
  let d = S.defaults();
  d = S.recordDaily(d, '2026-10-15', 500);
  d = S.recordDaily(d, '2026-10-16', 700);
  d = S.recordDaily(d, '2026-10-16', 300);
  eq(d.daily.streak, 2, 'replay same day keeps streak');
  eq(d.daily.records['2026-10-16'], 700, 'best per day');
  d = S.recordDaily(d, '2026-10-17', 100);
  eq(S.checkAchievements(d).unlocked.map((a) => a.id), ['daily_habit']);
  eq(S.liveDailyStreak(d, '2026-10-19'), 0, 'missed a day breaks streak');
  d = S.recordDaily(d, '2026-10-20', 100);
  eq(d.daily.streak, 1);
  eq(S.previousDay('2026-03-01'), '2026-02-28');
}

console.log(`ok — ${checks} checks, ${X.TEMPLATES.length} mechanics, ${L.TOTAL} levels`);

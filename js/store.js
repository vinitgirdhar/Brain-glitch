/* Progress manager + achievements + stats. Pure state transforms plus a tiny
   localStorage adapter. Everything stays on this device; no account needed. */
(function (root) {
  const KEY = 'brainglitch.v1';
  const VERSION = 1;
  const TOTAL = 200;

  const ACHIEVEMENTS = [
    { id: 'first_spark', name: 'First Spark', desc: 'Complete your first level.', icon: '⚡' },
    { id: 'perfect_mind', name: 'Perfect Mind', desc: 'Complete a level without mistakes.', icon: '💎' },
    { id: 'quick_thinker', name: 'Quick Thinker', desc: 'Answer a timed challenge using under 30% of the clock.', icon: '⏱️' },
    { id: 'boss_slayer', name: 'Boss Slayer', desc: 'Defeat your first boss (Level 20).', icon: '🗡️' },
    { id: 'memory_master', name: 'Memory Master', desc: 'Get 25 memory challenges right.', icon: '🧠', goal: (s) => [s.stats.memoryCorrect, 25] },
    { id: 'unstoppable', name: 'Unstoppable', desc: 'Get 20 correct answers in a row.', icon: '🔥', goal: (s) => [s.stats.longestStreak, 20] },
    { id: 'trust_issues', name: 'Trust Issues', desc: 'Clear World 2 (Level 60).', icon: '🪞' },
    { id: 'halfway', name: 'Halfway There', desc: 'Reach Level 100.', icon: '🏔️', goal: (s) => [s.progress.unlocked, 100] },
    { id: 'meltdown', name: 'Meltdown Survivor', desc: 'Clear World 3 (Level 100).', icon: '🌋' },
    { id: 'overloaded', name: 'Overloaded', desc: 'Clear World 4 (Level 150).', icon: '🔋' },
    { id: 'glitch_master', name: 'Glitch Master', desc: 'Complete Level 200, The Final Glitch.', icon: '👑' },
    { id: 'speed_demon', name: 'Speed Demon', desc: 'Earn 3 stars on a Speed Round.', icon: '🏎️' },
    { id: 'stargazer', name: 'Stargazer', desc: 'Collect 100 stars.', icon: '⭐', goal: (s) => [totalStars(s), 100] },
    { id: 'daily_habit', name: 'Daily Habit', desc: 'Finish the Daily Challenge 3 days in a row.', icon: '📅', goal: (s) => [s.daily.streak, 3] },
    { id: 'in_the_zone', name: 'In The Zone', desc: 'Clear 25 challenges in one Endless run.', icon: '🌀', goal: (s) => [s.endless.longestRun, 25] },
    { id: 'endless_legend', name: 'Endless Legend', desc: 'Clear 100 challenges in one Endless run.', icon: '♾️', goal: (s) => [s.endless.longestRun, 100] },
  ];

  const defaults = () => ({
    v: VERSION,
    settings: { theme: 'system', difficulty: 'normal', difficultyChosen: false, sound: true, haptics: true, reducedMotion: false, colorMarks: false },
    progress: { unlocked: 1, levels: {}, attempts: {} },
    stats: {
      attempted: 0, correct: 0, timedCount: 0, timedSum: 0, bestReaction: null,
      longestStreak: 0, currentStreak: 0, memoryCorrect: 0, quickAnswers: 0, totalScore: 0,
    },
    endless: { best: 0, bestStreak: 0, longestRun: 0, runs: 0 },
    daily: { records: {}, streak: 0, lastDate: null, bestStreak: 0 },
    achievements: {},
  });

  const num = (v, fallback = 0, lo = 0, hi = Number.MAX_SAFE_INTEGER) => (Number.isFinite(v) && v >= lo && v <= hi ? v : fallback);
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);

  /** Rebuild state from untrusted storage: anything malformed falls back to defaults, field by field. */
  function sanitize(raw) {
    const base = defaults();
    const r = obj(raw);
    const s = obj(r.settings);
    const p = obj(r.progress);
    const levels = {};
    Object.entries(obj(p.levels)).forEach(([k, v]) => {
      const n = Number(k);
      const lv = obj(v);
      if (Number.isInteger(n) && n >= 1 && n <= TOTAL && [1, 2, 3].includes(lv.stars)) {
        levels[n] = { stars: lv.stars, best: num(lv.best), completedAt: num(lv.completedAt) };
      }
    });
    const attempts = {};
    Object.entries(obj(p.attempts)).forEach(([k, v]) => { if (Number(k) >= 1 && Number(k) <= TOTAL) attempts[k] = num(v); });
    // Unlocked can never trail what has actually been cleared.
    const cleared = Object.keys(levels).map(Number);
    const unlocked = Math.min(TOTAL, Math.max(num(p.unlocked, 1, 1, TOTAL), cleared.length ? Math.max(...cleared) + 1 : 1));
    const st = obj(r.stats);
    const stats = {};
    Object.keys(base.stats).forEach((k) => { stats[k] = k === 'bestReaction' ? (Number.isFinite(st[k]) && st[k] > 0 ? st[k] : null) : num(st[k]); });
    const e = obj(r.endless);
    const d = obj(r.daily);
    const records = {};
    Object.entries(obj(d.records)).forEach(([k, v]) => { if (/^\d{4}-\d{2}-\d{2}$/.test(k)) records[k] = num(v); });
    const achievements = {};
    Object.entries(obj(r.achievements)).forEach(([k, v]) => { if (ACHIEVEMENTS.some((a) => a.id === k)) achievements[k] = num(v, Date.now()); });
    return {
      v: VERSION,
      settings: {
        theme: ['system', 'light', 'dark'].includes(s.theme) ? s.theme : 'system',
        difficulty: ['relaxed', 'normal', 'hard'].includes(s.difficulty) ? s.difficulty : 'normal',
        difficultyChosen: bool(s.difficultyChosen, false),
        sound: bool(s.sound, true), haptics: bool(s.haptics, true),
        reducedMotion: bool(s.reducedMotion, false), colorMarks: bool(s.colorMarks, false),
      },
      progress: { unlocked, levels, attempts },
      stats,
      endless: { best: num(e.best), bestStreak: num(e.bestStreak), longestRun: num(e.longestRun), runs: num(e.runs) },
      daily: {
        records, streak: num(d.streak), bestStreak: num(d.bestStreak),
        lastDate: typeof d.lastDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.lastDate) ? d.lastDate : null,
      },
      achievements,
    };
  }

  function load(storage) {
    try {
      const text = storage.getItem(KEY);
      return text ? sanitize(JSON.parse(text)) : defaults();
    } catch (e) {
      return defaults(); // corrupted JSON: start clean rather than crash
    }
  }
  function save(storage, state) {
    try { storage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
  }

  /* ---------- Derived ---------- */
  const totalStars = (s) => Object.values(s.progress.levels).reduce((a, l) => a + l.stars, 0);
  const levelsCompleted = (s) => Object.keys(s.progress.levels).length;
  const isCleared = (s, n) => !!s.progress.levels[n];
  const endlessUnlocked = (s) => isCleared(s, TOTAL);

  /* ---------- Transforms (all return new state) ---------- */
  /** Fold one answer into lifetime stats. */
  function recordAnswer(s, { correct, category, timed, usedMs, limitMs, reactions = [] }) {
    const st = s.stats;
    const times = timed && correct ? [usedMs] : reactions;
    const currentStreak = correct ? st.currentStreak + 1 : 0;
    return {
      ...s,
      stats: {
        ...st,
        attempted: st.attempted + 1,
        correct: st.correct + (correct ? 1 : 0),
        currentStreak,
        longestStreak: Math.max(st.longestStreak, currentStreak),
        memoryCorrect: st.memoryCorrect + (correct && category === 'memory' ? 1 : 0),
        quickAnswers: st.quickAnswers + (correct && timed && limitMs && usedMs / limitMs <= 0.3 ? 1 : 0),
        timedCount: st.timedCount + times.length,
        timedSum: st.timedSum + times.reduce((a, b) => a + b, 0),
        bestReaction: times.length ? Math.min(st.bestReaction ?? Infinity, ...times) : st.bestReaction,
      },
    };
  }

  function recordAttempt(s, n) {
    const attempts = { ...s.progress.attempts, [n]: (s.progress.attempts[n] || 0) + 1 };
    return { ...s, progress: { ...s.progress, attempts } };
  }

  /** Completed level: keep best score/stars, unlock the next level. */
  function recordLevel(s, n, { score, stars }, now = Date.now()) {
    const prev = s.progress.levels[n];
    const entry = prev
      ? { stars: Math.max(prev.stars, stars), best: Math.max(prev.best, score), completedAt: prev.completedAt }
      : { stars, best: score, completedAt: now };
    return {
      ...s,
      progress: { ...s.progress, levels: { ...s.progress.levels, [n]: entry }, unlocked: Math.min(TOTAL, Math.max(s.progress.unlocked, n + 1)) },
      stats: { ...s.stats, totalScore: s.stats.totalScore + score },
    };
  }

  function recordEndless(s, { score, completed, bestStreak }) {
    const e = s.endless;
    return {
      ...s,
      endless: { best: Math.max(e.best, score), bestStreak: Math.max(e.bestStreak, bestStreak), longestRun: Math.max(e.longestRun, completed), runs: e.runs + 1 },
    };
  }

  function previousDay(key) {
    const [y, m, d] = key.split('-').map(Number);
    const dt = new Date(y, m - 1, d - 1);
    const p = (v) => String(v).padStart(2, '0');
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
  }

  /** Finished today's daily: best score per date + consecutive-day streak (device-local). */
  function recordDaily(s, key, score) {
    const d = s.daily;
    const firstToday = d.lastDate !== key;
    const streak = !firstToday ? d.streak : d.lastDate === previousDay(key) ? d.streak + 1 : 1;
    return {
      ...s,
      daily: {
        records: { ...d.records, [key]: Math.max(d.records[key] || 0, score) },
        streak, bestStreak: Math.max(d.bestStreak, streak), lastDate: key,
      },
    };
  }

  /** Daily streak shown on screen: broken if the last finish was before yesterday. */
  function liveDailyStreak(s, todayKey) {
    const { lastDate, streak } = s.daily;
    return lastDate === todayKey || lastDate === previousDay(todayKey) ? streak : 0;
  }

  /**
   * Unlock achievements whose conditions now hold.
   * @param {object} event optional context of what just happened ({ type:'level', n, perfect, stars, levelType })
   * @returns {{ state: object, unlocked: object[] }}
   */
  function checkAchievements(s, event = {}, now = Date.now()) {
    const has = (n) => isCleared(s, n);
    const cond = {
      first_spark: levelsCompleted(s) >= 1,
      perfect_mind: event.type === 'level' && event.perfect,
      quick_thinker: s.stats.quickAnswers >= 1,
      boss_slayer: has(20),
      memory_master: s.stats.memoryCorrect >= 25,
      unstoppable: s.stats.longestStreak >= 20,
      trust_issues: has(60),
      halfway: s.progress.unlocked >= 100,
      meltdown: has(100),
      overloaded: has(150),
      glitch_master: has(200),
      speed_demon: event.type === 'level' && event.levelType === 'speed' && event.stars === 3,
      stargazer: totalStars(s) >= 100,
      daily_habit: s.daily.streak >= 3,
      in_the_zone: s.endless.longestRun >= 25,
      endless_legend: s.endless.longestRun >= 100,
    };
    const unlocked = ACHIEVEMENTS.filter((a) => cond[a.id] && !s.achievements[a.id]);
    if (!unlocked.length) return { state: s, unlocked };
    const achievements = { ...s.achievements };
    unlocked.forEach((a) => { achievements[a.id] = now; });
    return { state: { ...s, achievements }, unlocked };
  }

  const api = {
    KEY, VERSION, ACHIEVEMENTS, defaults, sanitize, load, save,
    totalStars, levelsCompleted, isCleared, endlessUnlocked,
    recordAnswer, recordAttempt, recordLevel, recordEndless, recordDaily, liveDailyStreak, previousDay, checkAchievements,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.BGStore = api;
})(this);

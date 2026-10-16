/* Game engine: run state machine + scoring + stars. Pure; the UI feeds it events.
   States: intro → preparing → active → submitted → feedback → (preparing | completed | failed); paused overlays active. */
(function (root) {
  const X = typeof module !== 'undefined' ? require('./challenges.js') : root.BGChallenges;

  const BASE = 100;
  const TIME_BONUS_MAX = 50;
  const PERFECT_BONUS = 200;

  /** Streak multiplier, capped at 2x. */
  function multiplier(streak) {
    if (streak >= 10) return 2;
    if (streak >= 5) return 1.5;
    if (streak >= 3) return 1.2;
    return 1;
  }

  /**
   * Points for one answer. Time bonus only for explicitly timed challenges (or reaction streams).
   * @param {{ correct: boolean, streak: number, usedMs?: number, limitMs?: number|null }} a streak includes this answer
   */
  function pointsFor({ correct, streak, usedMs, limitMs }) {
    if (!correct) return { base: 0, bonus: 0, mult: 1, total: 0 };
    const bonus = limitMs ? Math.round(TIME_BONUS_MAX * Math.max(0, 1 - usedMs / limitMs)) : 0;
    const mult = multiplier(streak);
    return { base: BASE, bonus, mult, total: Math.round((BASE + bonus) * mult) };
  }

  /**
   * Stars: 3 = no mistakes (and, if the level was timed, quick on average), 2 = at most one slip, else 1.
   * @returns {1|2|3}
   */
  function starsFor({ mistakes, timedUsedRatio }) {
    if (mistakes === 0 && (timedUsedRatio === null || timedUsedRatio <= 0.6)) return 3;
    if (mistakes <= 1) return 2;
    return 1;
  }

  /**
   * @param {{ mode: 'level'|'endless'|'daily', challenges?: object[], mistakesAllowed?: number, lives?: number, next?: (i:number, run:object)=>object }} cfg
   * Levels/daily supply the full list; endless supplies `next` to make challenges on demand.
   */
  function createRun(cfg) {
    return {
      mode: cfg.mode, state: 'intro',
      challenges: cfg.challenges ? cfg.challenges.slice() : [],
      total: cfg.challenges ? cfg.challenges.length : Infinity,
      index: 0, mistakesAllowed: cfg.mistakesAllowed ?? Infinity, lives: cfg.lives ?? null,
      score: 0, streak: 0, bestStreak: 0, correct: 0, mistakes: 0, answers: [],
      reactions: [], timedUsed: [], lastPoints: null, pausedFrom: null,
    };
  }

  const current = (run) => run.challenges[run.index];

  /** intro / feedback → preparing (next challenge is being shown; input locked). */
  function prepare(run, nextChallenge) {
    if (!['intro', 'feedback'].includes(run.state)) return run;
    const challenges = nextChallenge && !run.challenges[run.index] ? [...run.challenges, nextChallenge] : run.challenges;
    return { ...run, challenges, state: 'preparing' };
  }

  /** preparing → active: only now may answers be accepted and timers start. */
  const activate = (run) => (run.state === 'preparing' ? { ...run, state: 'active' } : run);

  const pause = (run) => (['active', 'preparing'].includes(run.state) ? { ...run, state: 'paused', pausedFrom: run.state } : run);
  const resume = (run) => (run.state === 'paused' ? { ...run, state: run.pausedFrom, pausedFrom: null } : run);

  /**
   * active → submitted. Ignored in any other state, so double taps or late taps never count twice.
   * @param {*} response option index / sequence / tapped flags; `null` = timed out
   * @param {{ usedMs?: number, reactionMs?: number[] }} timing
   */
  function submit(run, response, timing = {}) {
    if (run.state !== 'active') return { run, result: null };
    const ch = current(run);
    const correct = response !== null && X.validate(ch, response);
    const streak = correct ? run.streak + 1 : 0;
    const isStream = ch.input === 'stream';
    let limitMs = ch.timeLimit;
    let usedMs = timing.usedMs || 0;
    const reactions = (timing.reactionMs || []).filter((v) => v > 0);
    if (isStream && reactions.length) {
      // Reaction streams are inherently timed: bonus from average reaction vs window.
      limitMs = ch.stream.windowMs;
      usedMs = reactions.reduce((a, b) => a + b, 0) / reactions.length;
    } else if (isStream) limitMs = null;
    const points = pointsFor({ correct, streak, usedMs, limitMs });
    const mistakes = run.mistakes + (correct ? 0 : 1);
    const lives = run.lives === null ? null : run.lives - (correct ? 0 : 1);
    const timedReactions = ch.timeLimit && correct ? [usedMs] : isStream && correct ? reactions : [];
    const result = { correct, points, response, challenge: ch, timedOut: response === null };
    return {
      result,
      run: {
        ...run, state: 'submitted', score: run.score + points.total, streak, bestStreak: Math.max(run.bestStreak, streak),
        correct: run.correct + (correct ? 1 : 0), mistakes, lives, lastPoints: points,
        answers: [...run.answers, { template: ch.template, category: ch.category, correct, points: points.total }],
        reactions: [...run.reactions, ...timedReactions],
        timedUsed: ch.timeLimit ? [...run.timedUsed, correct ? usedMs / ch.timeLimit : 1] : run.timedUsed,
      },
    };
  }

  /** submitted → feedback. */
  const showFeedback = (run) => (run.state === 'submitted' ? { ...run, state: 'feedback' } : run);

  /** Has the run ended, and how? */
  function outcome(run) {
    if (run.lives !== null && run.lives <= 0) return 'failed';
    if (run.mistakes > run.mistakesAllowed) return 'failed';
    if (run.answers.length >= run.total) return 'completed';
    return null;
  }

  /** feedback → completed | failed | (index+1, ready for prepare). Completion fires exactly once. */
  function advance(run) {
    if (run.state !== 'feedback') return run;
    const end = outcome(run);
    if (end === 'completed') {
      const perfect = run.mistakes === 0;
      return { ...run, state: 'completed', perfect, score: run.score + (perfect && run.mode === 'level' ? PERFECT_BONUS : 0) };
    }
    if (end === 'failed') return { ...run, state: 'failed' };
    return { ...run, index: run.index + 1 };
  }

  function summary(run) {
    const answered = run.answers.length;
    const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const timedUsedRatio = avg(run.timedUsed);
    return {
      score: run.score, answered, correct: run.correct, mistakes: run.mistakes,
      accuracy: answered ? run.correct / answered : 0, bestStreak: run.bestStreak,
      bestReaction: run.reactions.length ? Math.min(...run.reactions) : null,
      avgReaction: avg(run.reactions), timedUsedRatio,
      perfect: run.state === 'completed' && run.mistakes === 0,
      stars: run.state === 'completed' ? starsFor({ mistakes: run.mistakes, timedUsedRatio }) : 0,
    };
  }

  const api = {
    BASE, TIME_BONUS_MAX, PERFECT_BONUS, multiplier, pointsFor, starsFor,
    createRun, current, prepare, activate, pause, resume, submit, showFeedback, advance, outcome, summary,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.BGEngine = api;
})(this);

/* Level manager: the 200-level curriculum, plus Endless and Daily sequences.
   Level *structure* (mechanics, count, timers, phases) is fixed per level; challenge
   *content* is seeded per attempt so retries stay fresh but are reproducible. */
(function (root) {
  const C = typeof module !== 'undefined' ? require('./core.js') : root.BGCore;
  const X = typeof module !== 'undefined' ? require('./challenges.js') : root.BGChallenges;
  const { rng, hash, clamp } = C;

  const TOTAL = 200;
  const WORLDS = [
    { id: 1, from: 1, to: 20, name: 'Wake Up Your Brain', tag: 'Beginner', focus: ['shape', 'direction', 'color', 'pattern', 'memory', 'impulse'] },
    { id: 2, from: 21, to: 60, name: 'Trust Nothing', tag: 'Easy – Medium', focus: ['color', 'direction', 'switch', 'impulse'] },
    { id: 3, from: 61, to: 100, name: 'Memory Meltdown', tag: 'Medium', focus: ['memory', 'pattern'] },
    { id: 4, from: 101, to: 150, name: 'System Overload', tag: 'Hard', focus: ['switch', 'impulse', 'memory', 'shape'] },
    { id: 5, from: 151, to: 200, name: 'Glitch Master', tag: 'Expert', focus: ['color', 'direction', 'shape', 'memory', 'pattern', 'impulse', 'switch'] },
  ];
  const worldOf = (n) => WORLDS.find((w) => n >= w.from && n <= w.to) || WORLDS[WORLDS.length - 1];

  /** Level at which each mechanic is first taught. Order is the learning curve. */
  const INTRO = {
    1: 'sh_colorshape', 2: 'dir_follow', 3: 'pat_arith', 4: 'mem_color_pos', 5: 'cc_ink',
    7: 'sh_twice', 8: 'dir_opposite', 9: 'go_color', 11: 'pat_shapes', 12: 'sh_unique',
    13: 'cc_word', 15: 'mem_location', 16: 'sh_size', 17: 'pat_colors', 18: 'go_color_shape',
    22: 'dir_text_vs_arrow', 24: 'cc_match_one', 26: 'sh_ignore_label', 28: 'rs_color_switch', 31: 'cc_shape_color',
    33: 'dir_text_opposite', 35: 'cc_mismatch_one', 37: 'go_avoid', 42: 'cc_conditional', 44: 'pat_geom',
    46: 'sh_most_sides', 48: 'rs_reverse', 50: 'dir_conditional', 52: 'sh_target', 54: 'go_number',
    56: 'cc_opposite', 58: 'pat_rotate',
    62: 'mem_shape_pos', 64: 'mem_number', 66: 'mem_missing', 68: 'mem_sequence', 70: 'mem_count',
    72: 'mem_changed', 74: 'pat_grow', 76: 'mem_compare', 78: 'rs_dimension', 82: 'mem_prev_color',
    84: 'pat_alt', 86: 'dir_rotate', 88: 'go_wait',
    102: 'sh_rotated', 105: 'go_stroop', 108: 'rs_signal', 112: 'pat_combo', 155: 'pat_power',
  };
  const introLevelOf = {};
  Object.entries(INTRO).forEach(([lvl, t]) => { introLevelOf[t] = Number(lvl); });

  /** Short names + a one-line teach shown the first time a mechanic appears. */
  const TEACH = {
    sh_colorshape: ['Find It', 'Tap the one tile that matches the instruction.'],
    dir_follow: ['Arrows', 'Tap the button pointing the same way.'],
    pat_arith: ['Number Steps', 'Spot the step and continue it.'],
    mem_color_pos: ['Color Flash', 'Colors flash, then hide. Remember their order.'],
    cc_ink: ['Ink vs Word', 'The word lies. Tap the color of its ink.'],
    sh_twice: ['Twins', 'One shape shows up twice. Name it.'],
    dir_opposite: ['Opposites', 'Go the other way from the arrow.'],
    go_color: ["Don't Tap", 'Shapes appear one by one. Tap only the ones that fit the rule.'],
    pat_shapes: ['Shape Loops', 'Shapes repeat in a loop. What comes next?'],
    sh_unique: ['Odd One Out', 'Every shape has a twin except one.'],
    cc_word: ['Read It', 'Now trust the word, not the ink.'],
    mem_location: ['Where Was It?', 'Remember where the star was hiding.'],
    sh_size: ['Big & Small', 'Compare sizes carefully.'],
    pat_colors: ['Color Loops', 'Colors repeat too.'],
    go_color_shape: ['Double Check', 'Tap only when BOTH color and shape match.'],
    dir_text_vs_arrow: ['Text vs Arrow', 'The words and the arrow disagree. Follow the instruction.'],
    cc_match_one: ['Honest Word', 'Find the only word painted in its own color.'],
    sh_ignore_label: ['Lying Labels', 'Labels lie. Trust the shape itself.'],
    rs_color_switch: ['Rule Change', 'Mid-way the rule changes. Adapt fast.'],
    cc_shape_color: ['Outline', 'Name the color of the outline, not the word inside.'],
    dir_text_opposite: ['Word Flip', 'Read the direction, then go the opposite way.'],
    cc_mismatch_one: ['Spot the Liar', 'One word does not match its color.'],
    go_avoid: ['Everything But', 'Tap everything except the forbidden shape.'],
    cc_conditional: ['If / Then', 'The frame decides the rule: circle = color, square = word.'],
    pat_geom: ['Doubling', 'Each number multiplies.'],
    sh_most_sides: ['Count Sides', 'Triangle 3, square 4, pentagon 5, hexagon 6.'],
    rs_reverse: ['Reverse', 'The rule flips to its opposite.'],
    dir_conditional: ['Red Alert', 'A red arrow means go opposite.'],
    sh_target: ['Exact Match', 'Match both shape and color.'],
    go_number: ['Even / Odd', 'Tap only the right numbers.'],
    cc_opposite: ['Color Opposites', 'RED ↔ GREEN, BLUE ↔ YELLOW.'],
    pat_rotate: ['Spinning Arrows', 'Track how the arrow turns.'],
    mem_shape_pos: ['Shape Order', 'Remember shapes in order.'],
    mem_number: ['Number Flash', 'Remember the exact digits.'],
    mem_missing: ['Vanished', 'One shape disappears. Which one?'],
    mem_sequence: ['Echo', 'Watch the pads light up, then repeat.'],
    mem_count: ['Head Count', 'Count while they flash.'],
    mem_changed: ['Spot the Change', 'One tile changes while hidden.'],
    pat_grow: ['Dot Growth', 'Count how the dots change.'],
    mem_compare: ['Same or Not', 'Compare two patterns from memory.'],
    rs_dimension: ['Color ↔ Shape', 'The rule jumps between color and shape.'],
    mem_prev_color: ['Hold That Thought', 'Remember a color while ignoring a lying word.'],
    pat_alt: ['Two Steps', 'Two different steps take turns.'],
    dir_rotate: ['Turn It', 'Rotate the arrow in your head.'],
    go_wait: ['Patience', 'Wait for the star. Only the star.'],
    sh_rotated: ['Twisted', 'One shape is turned differently.'],
    go_stroop: ['Honest Stream', 'Tap only words that match their ink.'],
    rs_signal: ['Lightning', 'Every ⚡ swaps the rule. Keep count.'],
    pat_combo: ['Double Beat', 'Shape and color loop on different beats.'],
    pat_power: ['Big Leaps', 'Square numbers and running sums.'],
  };

  const BOSSES = {
    20: { title: 'The Gatekeeper', count: 7, cats: ['color', 'direction', 'shape'] },
    40: { title: 'Double Vision', count: 8, cats: ['color', 'direction', 'switch'] },
    60: { title: "Liar's Court", count: 8, cats: ['color', 'direction', 'shape', 'switch'] },
    80: { title: 'Echo Chamber', count: 9, cats: ['memory', 'pattern', 'switch'] },
    100: { title: 'Memory Meltdown', count: 10, cats: ['memory', 'color', 'pattern', 'impulse'], major: true },
    125: { title: 'Overclock', count: 9, cats: ['switch', 'impulse', 'shape'] },
    150: { title: 'System Overload', count: 10, cats: ['memory', 'switch', 'color', 'pattern'], major: true },
    175: { title: 'Static Storm', count: 10, cats: ['direction', 'memory', 'impulse', 'pattern'] },
    200: {
      title: 'The Final Glitch', count: 10, major: true, final: true,
      phases: [
        { name: 'Color Confusion', templates: ['cc_ink', 'cc_mismatch_one'] },
        { name: 'Memory Flash', templates: ['mem_sequence', 'mem_changed'] },
        { name: 'Rule Switching', templates: ['rs_signal', 'rs_dimension'] },
        { name: 'Pattern Recognition', templates: ['pat_combo', 'pat_power'] },
        { name: 'Final Combined', templates: ['cc_conditional', 'mem_prev_color'] },
      ],
    },
  };

  const MIX_TITLES = {
    1: ['Warm Up', 'First Steps', 'Eyes Open', 'Easy Does It', 'Quick Look', 'Getting Sharp', 'Shapes & Signs', 'Blink Twice'],
    2: ['Mixed Signals', 'Double Take', 'Second Guess', 'Smoke & Mirrors', 'Fake Out', 'Crossed Wires', 'Plot Twist', 'Bait & Switch', 'Wrong Way', 'Half Truths'],
    3: ['Flashback', 'Deja Vu', 'Hold It', 'Recall', 'Afterimage', 'Rewind', 'Total Recall', 'Echoes', 'Snapshot', 'Ghost Image'],
    4: ['Overdrive', 'Feedback Loop', 'Buffer Overflow', 'Interference', 'Crosstalk', 'Signal Noise', 'Hot Swap', 'Hard Reset', 'Race Condition', 'Packet Loss'],
    5: ['Glitch Art', 'Zero Day', 'Deep Focus', 'Mind Over Matter', 'No Mercy', 'Kernel Panic', 'Fever Dream', 'Master Class', 'Endgame', 'Last Light'],
  };

  const difficultyOf = (n) => clamp(1 + 8.5 * ((n - 1) / (TOTAL - 1)) ** 0.9, 1, 10);
  const learnedBy = (n) => X.TEMPLATES.filter((t) => introLevelOf[t] <= n);
  const latestIntros = (n, k) => Object.keys(INTRO).map(Number).filter((l) => l <= n).sort((a, b) => b - a).slice(0, k).map((l) => INTRO[l]);

  function countFor(n, world) {
    if (world.id === 1) return 3;
    if (world.id === 2) return n < 41 ? 4 : 5;
    if (world.id === 3) return 5;
    if (world.id === 4) return n % 2 ? 5 : 6;
    return n % 2 ? 6 : 7;
  }

  function typeOf(n) {
    if (BOSSES[n]) return 'boss';
    if (INTRO[n]) return 'intro';
    if (n >= 25 && n % 10 === 5) return 'speed';
    if (n % 10 === 3 || n % 10 === 7) return 'focus';
    if (n > 100 && n % 10 === 9) return 'gauntlet';
    return 'mix';
  }

  const GAUNTLET = ['cc_conditional', 'dir_conditional', 'mem_prev_color', 'pat_combo', 'rs_dimension', 'rs_signal', 'go_stroop', 'dir_rotate', 'sh_ignore_label', 'mem_changed'];

  /** Weighted pick that avoids repeating the previous slot's mechanic. */
  function weightedPick(r, weights, prev) {
    const entries = Object.entries(weights).filter(([t, w]) => w > 0 && t !== prev);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let x = r() * total;
    for (const [t, w] of entries) { x -= w; if (x <= 0) return t; }
    return entries[entries.length - 1][0];
  }

  function slotsFor(n, type, world, count, r) {
    const learned = learnedBy(n);
    if (type === 'intro') {
      const fresh = INTRO[n];
      // Teach with the new mechanic, close with one quick review of something familiar.
      const review = learned.filter((t) => t !== fresh);
      const slots = Array(count).fill(fresh);
      if (count >= 4 && review.length) slots[count - 1] = r.pick(review);
      return slots;
    }
    let pool = learned;
    if (type === 'speed') pool = learned.filter((t) => X.templateInfo(t).timeable);
    if (type === 'focus') {
      const cats = world.focus.filter((c) => learned.some((t) => X.templateInfo(t).category === c));
      const cat = cats[Math.floor(n / 10) % cats.length];
      pool = learned.filter((t) => X.templateInfo(t).category === cat);
      if (pool.length < 2) pool = learned;
    }
    if (type === 'gauntlet') pool = GAUNTLET.filter((t) => learned.includes(t));
    const recent = latestIntros(n, 3);
    const weights = {};
    pool.forEach((t) => {
      const cat = X.templateInfo(t).category;
      weights[t] = 1 + (recent.includes(t) ? 3 : 0) + (world.focus.includes(cat) ? 1 : 0);
    });
    const slots = [];
    for (let i = 0; i < count; i++) slots.push(weightedPick(r, weights, slots[i - 1]));
    return slots;
  }

  function bossSlots(n, boss, r) {
    if (boss.phases) {
      return boss.phases.flatMap((p) => p.templates.map((t) => ({ t, phase: p.name })));
    }
    const learned = learnedBy(n);
    const per = Math.floor(boss.count / boss.cats.length);
    const extra = boss.count - per * boss.cats.length;
    const slots = [];
    boss.cats.forEach((cat, ci) => {
      const pool = learned.filter((t) => X.templateInfo(t).category === cat);
      const k = per + (ci < extra ? 1 : 0);
      // Prefer the hardest (most recently taught) mechanics of each category.
      const ranked = pool.sort((a, b) => introLevelOf[b] - introLevelOf[a]).slice(0, 4);
      for (let i = 0; i < k; i++) slots.push({ t: ranked[(i + r.int(ranked.length)) % ranked.length], phase: X.CATEGORY_NAMES[cat] });
    });
    return slots;
  }

  /** Full, deterministic definition of level n (1..200). */
  function level(n) {
    if (!(Number.isInteger(n) && n >= 1 && n <= TOTAL)) throw new Error(`no level ${n}`);
    const world = worldOf(n);
    const type = typeOf(n);
    const r = rng(hash(`level-structure-${n}`));
    const boss = BOSSES[n] || null;
    const d = clamp(difficultyOf(n) + (boss ? 0.6 : 0), 1, 10);
    let slots;
    if (boss) slots = bossSlots(n, boss, r);
    else slots = slotsFor(n, type, world, countFor(n, world), r).map((t) => ({ t, phase: null }));
    const mistakesAllowed = boss ? 2 : n <= 6 ? 2 : 1;
    const timedFrom = 46; // after this every timeable mechanic is on the clock
    const challenges = slots.map((s, i) => {
      const info = X.templateInfo(s.t);
      const timed = info.timeable && n >= 25 && (type === 'speed' || n >= timedFrom || (boss && n >= 40));
      // Gentle ramp inside a level; intro levels start a notch easier.
      const dd = clamp(d + (i / Math.max(1, slots.length - 1)) * 0.5 - (type === 'intro' && i === 0 ? 0.7 : 0), 1, 10);
      return { template: s.t, d: Math.round(dd * 100) / 100, timed, speed: type === 'speed' ? 0.8 : 1, phase: s.phase };
    });
    const title = boss ? boss.title
      : type === 'intro' ? `New: ${TEACH[INTRO[n]][0]}`
        : type === 'speed' ? 'Speed Round'
          : type === 'gauntlet' ? 'Gauntlet'
            : type === 'focus' ? `${X.CATEGORY_NAMES[X.templateInfo(challenges[0].template).category]} Drill`
              : MIX_TITLES[world.id][n % MIX_TITLES[world.id].length];
    return {
      n, world: world.id, type, title, boss: !!boss, major: !!(boss && boss.major), final: !!(boss && boss.final),
      difficulty: Math.round(d * 10) / 10, mistakesAllowed, challenges,
      teach: type === 'intro' ? { template: INTRO[n], name: TEACH[INTRO[n]][0], text: TEACH[INTRO[n]][1] } : null,
      phases: boss ? [...new Set(challenges.map((c) => c.phase))] : null,
    };
  }

  /** Concrete challenges for one attempt of a level. */
  function buildLevel(n, attempt = 0) {
    const def = level(n);
    return def.challenges.map((c, i) => ({
      ...X.generate(c.template, hash(`L${n}:a${attempt}:c${i}`), c.d, { timed: c.timed, speed: c.speed }),
      phase: c.phase,
    }));
  }

  /* ---------- Endless ---------- */
  const endlessDifficulty = (i) => Math.min(12, 2 + i * 0.12);
  /** Challenge i of an endless run; never repeats any of the last 5 mechanics. */
  function endlessChallenge(runSeed, i, recentTemplates = []) {
    const d = endlessDifficulty(i);
    const unlockedBy = Math.min(TOTAL, 20 + i * 5);
    const pool = X.TEMPLATES.filter((t) => introLevelOf[t] <= unlockedBy && !recentTemplates.slice(-5).includes(t));
    const r = rng(hash(`E${runSeed}:${i}`));
    const t = r.pick(pool);
    return X.generate(t, hash(`E${runSeed}:${i}:${t}`), d, { timed: true });
  }
  const endlessTier = (i) => 1 + Math.floor(i / 10);

  /* ---------- Daily ---------- */
  const DAILY_CATS = ['color', 'direction', 'shape', 'memory', 'pattern', 'impulse', 'switch', 'color', 'memory', 'shape'];
  function dateKey(date = new Date()) {
    const p = (v) => String(v).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  }
  /** Same 10 challenges for everyone on a given calendar date. */
  function dailyChallenges(key) {
    const r = rng(hash(`daily-${key}`));
    const cats = r.shuffle(DAILY_CATS);
    return cats.map((cat, i) => {
      const pool = X.TEMPLATES.filter((t) => X.templateInfo(t).category === cat);
      const t = r.pick(pool);
      return X.generate(t, hash(`D${key}:${i}`), 5 + i * 0.3, { timed: true });
    });
  }

  const api = {
    TOTAL, WORLDS, INTRO, TEACH, BOSSES, worldOf, level, buildLevel, introLevelOf,
    endlessChallenge, endlessDifficulty, endlessTier, dailyChallenges, dateKey,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.BGLevels = api;
})(this);

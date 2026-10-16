/* Challenge engine: templates that generate seeded challenges, plus an independent
   solver per template so tests can prove every generated answer is the only right one.
   No DOM. Every challenge is plain data the UI renders. */
(function (root) {
  const C = typeof module !== 'undefined' ? require('./core.js') : root.BGCore;
  const { rng, COLORS, BASE_COLORS, colorsFor, SHAPES, SHAPE_KEYS, POLYGONS, DIRS, DIR_NAMES, opposite, rotateDir, ORDINALS, clamp, lerp } = C;

  const cname = (c) => COLORS[c].name;
  const sname = (s) => (SHAPES[s] ? SHAPES[s].name : s.toUpperCase());
  const dname = (d) => DIR_NAMES[d];
  const t01 = (d) => clamp((d - 1) / 9, 0, 1);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  /** Shapes allowed at a difficulty: the simple three first. */
  const shapesFor = (d) => (d < 3 ? ['circle', 'square', 'triangle'] : d < 6 ? ['circle', 'square', 'triangle', 'star', 'diamond'] : SHAPE_KEYS);
  const colorOpts = (pool, r) => r.shuffle(pool).map((v) => ({ t: 'color', v }));
  const dirOpts = () => ['up', 'left', 'right', 'down'].map((v) => ({ t: 'dir', v }));
  const idx = (options, pred) => options.findIndex(pred);
  const colsFor = (n) => (n <= 4 ? 2 : 3);
  /** Memory exposure grows with item count, shrinks with difficulty. Never under 1.2 s. */
  const exposure = (d, n) => Math.max(1200, Math.round(n * (900 - 60 * d) + 800));
  const otherThan = (list, ...not) => list.filter((x) => !not.includes(x));

  /** n distinct (shape,colour) combos, none equal to any in `avoid`. */
  function distinctCombos(r, n, shapes, colors, avoid = []) {
    const all = [];
    shapes.forEach((s) => colors.forEach((c) => all.push({ shape: s, color: c })));
    return r.shuffle(all.filter((x) => !avoid.some((a) => a.shape === x.shape && a.color === x.color))).slice(0, n);
  }

  /** Numeric distractors near the answer, all distinct and >= 0. */
  function numOptions(r, ans, near) {
    const set = [ans];
    for (const v of r.shuffle(near).concat([ans + 1, ans - 1, ans + 2, ans - 2, ans + 3, ans + 5, ans + 10])) {
      if (set.length === 4) break;
      if (Number.isInteger(v) && v >= 0 && !set.includes(v)) set.push(v);
    }
    return r.shuffle(set).map((v) => ({ t: 'num', v }));
  }

  /** Smallest period consistent with a visible sequence; used by pattern solvers. */
  function inferNext(items) {
    for (let p = 1; p <= items.length / 2; p++) {
      let ok = true;
      for (let i = p; i < items.length; i++) if (!same(items[i], items[i - p])) { ok = false; break; }
      if (ok) return items[items.length - p];
    }
    return null;
  }

  /* ================= Stream rules (Don't Tap / Rule Switching) ================= */
  function matchRule(rule, it) {
    if (!it || it.t === 'switch') return false;
    switch (rule.type) {
      case 'color': return it.color === rule.color;
      case 'shape': return it.t === 'shape' && it.shape === rule.shape;
      case 'both': return it.t === 'shape' && it.shape === rule.shape && it.color === rule.color;
      case 'not': return !matchRule(rule.rule, it);
      case 'even': return it.t === 'num' && it.v % 2 === 0;
      case 'odd': return it.t === 'num' && it.v % 2 === 1;
      case 'wordMatch': return it.t === 'word' && it.word === it.color;
      default: return false;
    }
  }
  function ruleText(rule) {
    switch (rule.type) {
      case 'color': return `Tap ${cname(rule.color)} things`;
      case 'shape': return `Tap ${sname(rule.shape)}S`;
      case 'both': return `Tap ${cname(rule.color)} ${sname(rule.shape)}S`;
      case 'not': return rule.rule.type === 'shape' ? `Tap everything except ${sname(rule.rule.shape)}S` : `Tap everything except ${cname(rule.rule.color)}`;
      case 'even': return 'Tap EVEN numbers';
      case 'odd': return 'Tap ODD numbers';
      case 'wordMatch': return 'Tap when the word matches its color';
      default: return '';
    }
  }
  const streamWindow = (d) => Math.max(750, Math.round(lerp(1600, 850, t01(d)) - Math.max(0, d - 10) * 30));

  /** Walk a stream, applying rule changes, and say which items must be tapped. */
  function streamTargets(stream) {
    let active = 0;
    return stream.items.map((it) => {
      if (it.t === 'rule') { active = it.to; return null; }
      if (it.t === 'switch') { active = 1 - active; return false; }
      return matchRule(stream.rules[active], it);
    });
  }

  /** Fill a stream with targets/distractors; guarantees at least `minTargets` targets and one distractor. */
  function fillStream(r, n, rule, makeTarget, makeOther, pTarget, minTargets = 2) {
    let items;
    for (let tries = 0; tries < 50; tries++) {
      items = Array.from({ length: n }, () => (r.chance(pTarget) ? makeTarget() : makeOther()));
      const hits = items.filter((it) => matchRule(rule, it)).length;
      if (hits >= minTargets && hits < n) break;
    }
    return items;
  }

  function shapeItem(r, shapes, colors) { return { t: 'shape', shape: r.pick(shapes), color: r.pick(colors) }; }

  /* ================= Templates ================= */
  // Each: { category, timeable, baseMs?, gen(r, d) -> challenge fields, solve(ch) -> answer }
  const T = {};

  /* ---------- Color Confusion ---------- */
  T.cc_ink = {
    category: 'color', timeable: true, baseMs: 6500,
    gen(r, d) {
      const pool = colorsFor(d);
      const color = r.pick(pool);
      const word = r.pick(otherThan(pool, color));
      // Late game: option labels themselves are painted in misleading inks.
      const options = colorOpts(pool, r).map((o) => (d >= 6 ? { ...o, ink: r.pick(otherThan(pool, o.v)) } : o));
      return {
        instruction: 'Tap the COLOR of the word', hint: 'Not what it says.',
        stimulus: { kind: 'word', word, color }, options, layout: 'buttons',
        explain: `The word said ${cname(word)}, but its color was ${cname(color)}.`,
      };
    },
    solve: (ch) => idx(ch.options, (o) => o.v === ch.stimulus.color),
  };

  T.cc_word = {
    category: 'color', timeable: true, baseMs: 6000,
    gen(r, d) {
      const pool = colorsFor(d);
      const color = r.pick(pool);
      const word = r.pick(otherThan(pool, color));
      const options = colorOpts(pool, r).map((o) => (d >= 5 ? { ...o, ink: r.pick(otherThan(pool, o.v)) } : o));
      return {
        instruction: 'Tap what the word SAYS', hint: 'Ignore its color.',
        stimulus: { kind: 'word', word, color }, options, layout: 'buttons',
        explain: `It was painted ${cname(color)}, but the word said ${cname(word)}.`,
      };
    },
    solve: (ch) => idx(ch.options, (o) => o.v === ch.stimulus.word),
  };

  T.cc_match_one = {
    category: 'color', timeable: true, baseMs: 8000,
    gen(r, d) {
      const pool = colorsFor(d);
      const n = d < 4 ? 3 : d < 7 ? 4 : 6;
      const match = r.pick(pool);
      const items = [{ t: 'word', word: match, color: match }];
      while (items.length < n) {
        const word = r.pick(pool);
        const color = r.pick(otherThan(pool, word));
        if (!items.some((x) => x.word === word && x.color === color)) items.push({ t: 'word', word, color });
      }
      return {
        instruction: 'Tap the word whose COLOR matches its MEANING', options: r.shuffle(items), layout: 'tiles', cols: colsFor(n),
        explain: `Only ${cname(match)} was written in ${cname(match)}.`,
      };
    },
    solve: (ch) => idx(ch.options, (o) => o.word === o.color),
  };

  T.cc_mismatch_one = {
    category: 'color', timeable: true, baseMs: 8000,
    gen(r, d) {
      const pool = colorsFor(d);
      const n = Math.min(pool.length, d < 4 ? 3 : d < 7 ? 4 : 6);
      const words = r.sample(pool, n);
      const odd = r.int(n);
      const items = words.map((w, i) => ({ t: 'word', word: w, color: i === odd ? r.pick(otherThan(pool, w)) : w }));
      return {
        instruction: "Tap the word that DOESN'T match its color", options: items, layout: 'tiles', cols: colsFor(n),
        explain: `${cname(items[odd].word)} was painted ${cname(items[odd].color)}.`,
      };
    },
    solve: (ch) => idx(ch.options, (o) => o.word !== o.color),
  };

  T.cc_shape_color = {
    category: 'color', timeable: true, baseMs: 6500,
    gen(r, d) {
      const pool = colorsFor(d);
      const shapeColor = r.pick(pool);
      const word = r.pick(otherThan(pool, shapeColor));
      const color = r.pick(otherThan(pool, shapeColor));
      return {
        instruction: 'What color is the SHAPE?', hint: 'Ignore the word inside.',
        stimulus: { kind: 'word', word, color, frame: r.pick(['circle', 'square', 'hexagon']), frameColor: shapeColor },
        options: colorOpts(pool, r), layout: 'buttons',
        explain: `The shape's outline was ${cname(shapeColor)}.`,
      };
    },
    solve: (ch) => idx(ch.options, (o) => o.v === ch.stimulus.frameColor),
  };

  const OPP = { red: 'green', green: 'red', blue: 'yellow', yellow: 'blue' };
  T.cc_opposite = {
    category: 'color', timeable: true, baseMs: 7500,
    gen(r) {
      const color = r.pick(BASE_COLORS);
      const word = r.pick(otherThan(BASE_COLORS, color));
      return {
        instruction: 'Tap the OPPOSITE of the ink color', hint: 'RED ↔ GREEN · BLUE ↔ YELLOW',
        stimulus: { kind: 'word', word, color }, options: colorOpts(BASE_COLORS, r), layout: 'buttons',
        explain: `Ink was ${cname(color)}, so its opposite is ${cname(OPP[color])}.`,
      };
    },
    solve: (ch) => idx(ch.options, (o) => o.v === OPP[ch.stimulus.color]),
  };

  T.cc_conditional = {
    category: 'color', timeable: true, baseMs: 8000,
    gen(r, d) {
      const pool = colorsFor(d);
      const color = r.pick(pool);
      const word = r.pick(otherThan(pool, color));
      const frame = r.pick(['circle', 'square']);
      return {
        instruction: 'CIRCLE: tap its color. SQUARE: tap what it says.',
        stimulus: { kind: 'word', word, color, frame }, options: colorOpts(pool, r), layout: 'buttons',
        explain: frame === 'circle' ? `It was in a circle, so the ink color (${cname(color)}) counts.` : `It was in a square, so the word (${cname(word)}) counts.`,
      };
    },
    solve: (ch) => idx(ch.options, (o) => o.v === (ch.stimulus.frame === 'circle' ? ch.stimulus.color : ch.stimulus.word)),
  };

  /* ---------- Opposite Instructions (directions) ---------- */
  T.dir_follow = {
    category: 'direction', timeable: true, baseMs: 4500,
    gen(r) {
      const dir = r.pick(DIRS);
      return {
        instruction: 'Tap where the arrow POINTS', stimulus: { kind: 'arrow', dir }, options: dirOpts(), layout: 'arrows',
        explain: `The arrow pointed ${dname(dir)}.`,
      };
    },
    solve: (ch) => idx(ch.options, (o) => o.v === ch.stimulus.dir),
  };

  T.dir_opposite = {
    category: 'direction', timeable: true, baseMs: 4500,
    gen(r) {
      const dir = r.pick(DIRS);
      return {
        instruction: 'Tap the OPPOSITE direction', stimulus: { kind: 'arrow', dir }, options: dirOpts(), layout: 'arrows',
        explain: `The arrow pointed ${dname(dir)}, so the opposite was ${dname(opposite(dir))}.`,
      };
    },
    solve: (ch) => idx(ch.options, (o) => o.v === opposite(ch.stimulus.dir)),
  };

  T.dir_text_vs_arrow = {
    category: 'direction', timeable: true, baseMs: 5500,
    gen(r) {
      const dir = r.pick(DIRS);
      const label = r.pick(otherThan(DIRS, dir));
      const follow = r.pick(['text', 'arrow']);
      return {
        instruction: follow === 'text' ? 'Follow the TEXT, not the arrow' : 'Follow the ARROW, not the text',
        stimulus: { kind: 'arrow', dir, label, follow }, options: dirOpts(), layout: 'arrows',
        explain: follow === 'text' ? `The text said ${dname(label)}.` : `The arrow pointed ${dname(dir)}.`,
      };
    },
    solve: (ch) => idx(ch.options, (o) => o.v === (ch.stimulus.follow === 'text' ? ch.stimulus.label : ch.stimulus.dir)),
  };

  T.dir_text_opposite = {
    category: 'direction', timeable: true, baseMs: 5000,
    gen(r, d) {
      const label = r.pick(DIRS);
      // A decoy arrow later on that never points at the answer.
      const decoy = d >= 5 ? r.pick(otherThan(DIRS, opposite(label))) : null;
      return {
        instruction: 'Tap the OPPOSITE of the WORD', hint: decoy ? 'Ignore the arrow.' : '',
        stimulus: decoy ? { kind: 'arrow', dir: decoy, label, follow: 'text' } : { kind: 'label', text: label },
        options: dirOpts(), layout: 'arrows',
        explain: `The word said ${dname(label)}, so the opposite was ${dname(opposite(label))}.`,
      };
    },
    solve: (ch) => idx(ch.options, (o) => o.v === opposite(ch.stimulus.kind === 'label' ? ch.stimulus.text : ch.stimulus.label)),
  };

  T.dir_conditional = {
    category: 'direction', timeable: true, baseMs: 5500,
    gen(r, d) {
      const dir = r.pick(DIRS);
      const color = r.pick(d < 6 ? ['red', 'blue'] : ['red', 'blue', 'green']);
      return {
        instruction: 'RED arrow: go OPPOSITE. Any other color: follow it.',
        stimulus: { kind: 'arrow', dir, color }, options: dirOpts(), layout: 'arrows',
        explain: color === 'red' ? `It was RED, so the opposite of ${dname(dir)}.` : `It was ${cname(color)}, so follow it ${dname(dir)}.`,
      };
    },
    solve: (ch) => idx(ch.options, (o) => o.v === (ch.stimulus.color === 'red' ? opposite(ch.stimulus.dir) : ch.stimulus.dir)),
  };

  T.dir_rotate = {
    category: 'direction', timeable: true, baseMs: 6500,
    gen(r, d) {
      const dir = r.pick(DIRS);
      const turns = d >= 8 ? r.pick([1, 2, 3]) : 1;
      const cw = d >= 6 ? r.chance(0.5) : true;
      const deg = turns * 90;
      return {
        instruction: `Turn the arrow ${deg}° ${cw ? 'CLOCKWISE' : 'COUNTER-CLOCKWISE'}`, hint: 'Where does it point now?',
        stimulus: { kind: 'arrow', dir, turn: cw ? turns : -turns }, options: dirOpts(), layout: 'arrows',
        explain: `${dname(dir)} turned ${deg}° ${cw ? 'clockwise' : 'counter-clockwise'} points ${dname(rotateDir(dir, cw ? turns : -turns))}.`,
      };
    },
    solve: (ch) => idx(ch.options, (o) => o.v === rotateDir(ch.stimulus.dir, ch.stimulus.turn)),
  };

  /* ---------- Shape Confusion ---------- */
  T.sh_colorshape = {
    category: 'shape', timeable: true, baseMs: 6500,
    gen(r, d) {
      const shapes = shapesFor(d);
      const colors = colorsFor(d);
      const n = d < 2 ? 4 : d < 5 ? 6 : 9;
      const target = { shape: r.pick(shapes), color: r.pick(colors) };
      // Half the decoys share one feature with the target, so both features matter.
      const nearA = distinctCombos(r, 9, [target.shape], colors, [target]);
      const nearB = distinctCombos(r, 9, shapes, [target.color], [target]);
      const near = r.shuffle(nearA.concat(nearB)).slice(0, Math.ceil((n - 1) / 2));
      const rest = distinctCombos(r, n - 1 - near.length, shapes, colors, [target, ...near]);
      const options = r.shuffle([target, ...near, ...rest]).map((x) => ({ t: 'shape', ...x }));
      return {
        instruction: `Tap the ${cname(target.color)} ${sname(target.shape)}`, options, layout: 'tiles', cols: colsFor(n),
        params: { target }, explain: `Look for both the color ${cname(target.color)} and the shape ${sname(target.shape)}.`,
      };
    },
    solve: (ch) => idx(ch.options, (o) => o.shape === ch.params.target.shape && o.color === ch.params.target.color),
  };

  T.sh_twice = {
    category: 'shape', timeable: true, baseMs: 7000,
    gen(r, d) {
      const n = Math.round(lerp(4, 7, t01(d)));
      const types = r.sample(SHAPE_KEYS, n - 1);
      const twin = types[0];
      const colors = colorsFor(d);
      const items = r.shuffle([...types, twin]).map((shape) => ({ t: 'shape', shape, color: d < 3 ? 'blue' : r.pick(colors) }));
      const others = r.sample(types.slice(1), 3);
      return {
        instruction: 'Which shape appears TWICE?', stimulus: { kind: 'shapes', items, cols: colsFor(n) },
        options: r.shuffle([twin, ...others]).map((v) => ({ t: 'shapeName', v })), layout: 'buttons',
        explain: `There were two ${sname(twin)}S.`,
      };
    },
    solve(ch) {
      const counts = {};
      ch.stimulus.items.forEach((it) => { counts[it.shape] = (counts[it.shape] || 0) + 1; });
      return idx(ch.options, (o) => counts[o.v] === 2);
    },
  };

  T.sh_unique = {
    category: 'shape', timeable: true, baseMs: 7000,
    gen(r, d) {
      const n = Math.round(lerp(5, 9, t01(d)));
      const kinds = d < 5 ? 1 : d < 8 ? 2 : 3;
      const [unique, ...rep] = r.sample(SHAPE_KEYS, kinds + 1);
      // Every repeated type gets at least two copies.
      const slots = [];
      rep.forEach((s) => slots.push(s, s));
      while (slots.length < n - 1) slots.push(r.pick(rep));
      const colors = colorsFor(d);
      const items = r.shuffle([unique, ...slots]).map((shape) => ({ t: 'shape', shape, color: d < 4 ? 'purple' : r.pick(colors) }));
      return {
        instruction: 'Tap the shape that appears only ONCE', hint: d >= 4 ? 'Shape only — colors are a trap.' : '',
        options: items, layout: 'tiles', cols: colsFor(n), explain: `The ${sname(unique)} was the only one of its kind.`,
      };
    },
    solve(ch) {
      const counts = {};
      ch.options.forEach((o) => { counts[o.shape] = (counts[o.shape] || 0) + 1; });
      return idx(ch.options, (o) => counts[o.shape] === 1);
    },
  };

  const SIZES = [0.42, 0.56, 0.7, 0.85, 1];
  T.sh_size = {
    category: 'shape', timeable: true, baseMs: 5500,
    gen(r, d) {
      const n = Math.round(lerp(3, 5, t01(d)));
      const shape = r.pick(['circle', 'square', 'star', 'hexagon']);
      const sizes = r.sample(SIZES, n);
      const largest = r.chance(0.5);
      const colors = colorsFor(d);
      const options = sizes.map((size) => ({ t: 'shape', shape, size, color: d < 5 ? 'blue' : r.pick(colors) }));
      return {
        instruction: `Tap the ${largest ? 'LARGEST' : 'SMALLEST'} ${sname(shape)}`, options, layout: 'tiles', cols: colsFor(n),
        params: { largest }, explain: `Compare sizes, not colors.`,
      };
    },
    solve(ch) {
      const vals = ch.options.map((o) => o.size);
      const want = ch.params.largest ? Math.max(...vals) : Math.min(...vals);
      return idx(ch.options, (o) => o.size === want);
    },
  };

  T.sh_ignore_label = {
    category: 'shape', timeable: true, baseMs: 6500,
    gen(r, d) {
      const n = d < 6 ? 4 : 6;
      const types = r.sample(SHAPE_KEYS, n);
      const target = types[0];
      const decoyAt = 1 + r.int(n - 1); // one wrong tile always carries the target's name
      const options = types.map((shape, i) => ({
        t: 'shape', shape, color: r.pick(colorsFor(d)),
        label: i === decoyAt ? target : r.pick(SHAPE_KEYS.filter((s) => s !== shape && s !== target)),
      }));
      return {
        instruction: `Tap the ${sname(target)}`, hint: 'Read the shape, not the label.', options: r.shuffle(options), layout: 'tiles', cols: colsFor(n),
        params: { target }, explain: `The label lied — the real ${sname(target)} had a different name on it.`,
      };
    },
    solve: (ch) => idx(ch.options, (o) => o.shape === ch.params.target),
  };

  T.sh_most_sides = {
    category: 'shape', timeable: true, baseMs: 6000,
    gen(r, d) {
      const n = d < 6 ? 3 : 4;
      const most = r.chance(0.5);
      const options = r.sample(POLYGONS, n).map((shape) => ({ t: 'shape', shape, color: r.pick(colorsFor(d)) }));
      return {
        instruction: `Tap the shape with the ${most ? 'MOST' : 'FEWEST'} sides`, options, layout: 'tiles', cols: colsFor(n),
        params: { most }, explain: 'Triangle 3 · Square 4 · Pentagon 5 · Hexagon 6.',
      };
    },
    solve(ch) {
      const sides = ch.options.map((o) => SHAPES[o.shape].sides);
      const want = ch.params.most ? Math.max(...sides) : Math.min(...sides);
      return idx(ch.options, (o) => SHAPES[o.shape].sides === want);
    },
  };

  T.sh_target = {
    category: 'shape', timeable: true, baseMs: 7000,
    gen(r, d) {
      const n = Math.round(lerp(4, 9, t01(d)));
      const shapes = shapesFor(d + 2);
      const colors = colorsFor(d);
      const target = { shape: r.pick(shapes), color: r.pick(colors) };
      const near = r.shuffle(distinctCombos(r, 4, [target.shape], colors, [target]).concat(distinctCombos(r, 4, shapes, [target.color], [target]))).slice(0, n - 1);
      const rest = distinctCombos(r, n - 1 - near.length, shapes, colors, [target, ...near]);
      return {
        instruction: 'Tap the exact MATCH', stimulus: { kind: 'target', item: { t: 'shape', ...target } },
        options: r.shuffle([target, ...near, ...rest]).map((x) => ({ t: 'shape', ...x })), layout: 'tiles', cols: colsFor(n),
        explain: `The match was the ${cname(target.color)} ${sname(target.shape)}.`,
      };
    },
    solve: (ch) => idx(ch.options, (o) => o.shape === ch.stimulus.item.shape && o.color === ch.stimulus.item.color),
  };

  T.sh_rotated = {
    category: 'shape', timeable: true, baseMs: 7000,
    gen(r, d) {
      const n = Math.round(lerp(4, 9, t01(d)));
      const base = r.pick([0, 90, 180, 270]);
      const delta = d >= 8 ? r.pick([45, 90, 180]) : r.pick([90, 180]);
      const odd = r.int(n);
      const colors = colorsFor(d);
      const options = Array.from({ length: n }, (_, i) => ({
        t: 'shape', shape: 'flag', rot: i === odd ? (base + delta) % 360 : base, color: d < 6 ? 'orange' : r.pick(colors),
      }));
      return {
        instruction: "Tap the one that's turned DIFFERENTLY", options, layout: 'tiles', cols: colsFor(n),
        explain: 'One flag was rotated away from the rest.',
      };
    },
    solve(ch) {
      const counts = {};
      ch.options.forEach((o) => { counts[o.rot] = (counts[o.rot] || 0) + 1; });
      return idx(ch.options, (o) => counts[o.rot] === 1);
    },
  };

  /* ---------- Memory Flash ---------- */
  T.mem_color_pos = {
    category: 'memory', timeable: false,
    gen(r, d) {
      const pool = colorsFor(d);
      const n = d < 3 ? 3 : d < 6 ? 4 : d < 9 ? 5 : 6;
      const seq = n <= pool.length ? r.sample(pool, n) : Array.from({ length: n }, () => r.pick(pool));
      const k = r.int(n);
      return {
        memorize: { kind: 'row', items: seq.map((color) => ({ t: 'swatch', color })), exposureMs: exposure(d, n) },
        instruction: `What was the ${ORDINALS[k]} color?`, options: colorOpts(pool, r), layout: 'buttons', params: { k },
        explain: `The ${ORDINALS[k].toLowerCase()} color was ${cname(seq[k])}.`,
      };
    },
    solve: (ch) => idx(ch.options, (o) => o.v === ch.memorize.items[ch.params.k].color),
  };

  T.mem_shape_pos = {
    category: 'memory', timeable: false,
    gen(r, d) {
      const n = d < 5 ? 4 : d < 8 ? 5 : 6;
      const seq = r.sample(SHAPE_KEYS, n);
      const k = r.int(n);
      const others = r.sample(SHAPE_KEYS.filter((s) => s !== seq[k]), 3);
      return {
        memorize: { kind: 'row', items: seq.map((shape) => ({ t: 'shape', shape, color: d < 6 ? 'neutral' : r.pick(colorsFor(d)) })), exposureMs: exposure(d, n) },
        instruction: `What was the ${ORDINALS[k]} shape?`, options: r.shuffle([seq[k], ...others]).map((v) => ({ t: 'shapeName', v })),
        layout: 'buttons', params: { k }, explain: `The ${ORDINALS[k].toLowerCase()} shape was a ${sname(seq[k])}.`,
      };
    },
    solve: (ch) => idx(ch.options, (o) => o.v === ch.memorize.items[ch.params.k].shape),
  };

  T.mem_location = {
    category: 'memory', timeable: false,
    gen(r, d) {
      const cols = d < 6 ? 3 : 4;
      const cells = cols * cols;
      const extra = d < 4 ? 0 : d < 7 ? 1 : 2;
      const spots = r.sample(Array.from({ length: cells }, (_, i) => i), extra + 1);
      const items = Array(cells).fill(null);
      items[spots[0]] = { t: 'shape', shape: 'star', color: 'yellow' };
      const decoys = ['circle', 'square'];
      spots.slice(1).forEach((s, i) => { items[s] = { t: 'shape', shape: decoys[i], color: 'blue' }; });
      return {
        memorize: { kind: 'grid', cols, items, exposureMs: exposure(d, 2 + extra) },
        instruction: 'Where was the STAR?', options: items.map((_, i) => ({ t: 'cell', i })), layout: 'tiles', cols,
        explain: 'Picture the grid and where the star sat.',
      };
    },
    solve: (ch) => idx(ch.options, (o) => { const it = ch.memorize.items[o.i]; return !!it && it.shape === 'star'; }),
  };

  T.mem_number = {
    category: 'memory', timeable: false,
    gen(r, d) {
      const len = clamp(3 + Math.floor(d / 2), 3, 8);
      const digits = Array.from({ length: len }, (_, i) => (i === 0 ? r.range(1, 9) : r.range(0, 9)));
      const text = digits.join('');
      const variants = new Set([text]);
      for (let tries = 0; variants.size < 4 && tries < 200; tries++) {
        const v = digits.slice();
        const i = r.int(len);
        if (r.chance(0.5) && i < len - 1 && v[i] !== v[i + 1]) [v[i], v[i + 1]] = [v[i + 1], v[i]];
        else v[i] = (v[i] + r.pick([1, 9, 2, 8])) % 10;
        if (v[0] !== 0) variants.add(v.join(''));
      }
      return {
        memorize: { kind: 'number', text, exposureMs: exposure(d, Math.ceil(len / 1.5)) },
        instruction: 'Which number did you see?', options: r.shuffle([...variants]).map((v) => ({ t: 'text', v })), layout: 'buttons',
        explain: `The number was ${text}.`,
      };
    },
    solve: (ch) => idx(ch.options, (o) => o.v === ch.memorize.text),
  };

  T.mem_missing = {
    category: 'memory', timeable: false,
    gen(r, d) {
      const n = d < 4 ? 4 : d < 7 ? 5 : 6;
      const shown = r.sample(SHAPE_KEYS, n);
      const miss = r.int(n);
      const colors = colorsFor(d);
      const items = shown.map((shape) => ({ t: 'shape', shape, color: r.pick(colors) }));
      const remaining = r.shuffle(items.filter((_, i) => i !== miss));
      const options = r.shuffle([shown[miss], ...r.sample(shown.filter((_, i) => i !== miss), 3)]).map((v) => ({ t: 'shapeName', v }));
      return {
        memorize: { kind: 'row', items, exposureMs: exposure(d, n) },
        instruction: 'Which shape is MISSING now?', stimulus: { kind: 'shapes', items: remaining, cols: colsFor(n - 1) },
        options, layout: 'buttons', explain: `The ${sname(shown[miss])} vanished.`,
      };
    },
    solve(ch) {
      const now = ch.stimulus.items.map((it) => it.shape);
      const gone = ch.memorize.items.map((it) => it.shape).find((s) => !now.includes(s));
      return idx(ch.options, (o) => o.v === gone);
    },
  };

  const PADS = ['red', 'blue', 'green', 'yellow'];
  T.mem_sequence = {
    category: 'memory', timeable: false,
    gen(r, d) {
      const len = clamp(3 + Math.floor(d / 2.2), 3, 8);
      const seq = [];
      while (seq.length < len) {
        const p = r.int(4);
        if (seq[seq.length - 1] !== p || r.chance(0.2)) seq.push(p);
      }
      return {
        memorize: { kind: 'pads', seq, stepMs: Math.round(lerp(800, 480, t01(d))) },
        instruction: 'Repeat the sequence', input: 'sequence', options: PADS.map((color, i) => ({ t: 'pad', i, color })), layout: 'pads',
        explain: `It was ${seq.map((i) => cname(PADS[i])).join(' → ')}.`,
      };
    },
    solve: (ch) => ch.memorize.seq.slice(),
  };

  T.mem_count = {
    category: 'memory', timeable: false,
    gen(r, d) {
      const n = Math.round(lerp(5, 9, t01(d)));
      const byShape = d >= 6 && r.chance(0.5);
      const colors = colorsFor(d);
      const key = byShape ? r.pick(['circle', 'square', 'triangle']) : r.pick(colors);
      const want = r.range(1, Math.min(4, n - 1));
      const items = [];
      for (let i = 0; i < n; i++) {
        const hit = i < want;
        const shape = byShape ? (hit ? key : r.pick(SHAPE_KEYS.filter((s) => s !== key))) : r.pick(shapesFor(d));
        const color = byShape ? r.pick(colors) : (hit ? key : r.pick(colors.filter((c) => c !== key)));
        items.push({ t: 'shape', shape, color });
      }
      const start = clamp(want - r.int(4), 0, 9);
      return {
        memorize: { kind: 'row', items: r.shuffle(items), exposureMs: exposure(d, n) },
        instruction: byShape ? `How many ${sname(key)}S were there?` : `How many ${cname(key)} shapes were there?`,
        options: [0, 1, 2, 3].map((i) => ({ t: 'num', v: start + i })), layout: 'buttons', params: { byShape, key },
        explain: `There were ${want}.`,
      };
    },
    solve(ch) {
      const { byShape, key } = ch.params;
      const n = ch.memorize.items.filter((it) => (byShape ? it.shape === key : it.color === key)).length;
      return idx(ch.options, (o) => o.v === n);
    },
  };

  T.mem_changed = {
    category: 'memory', timeable: false,
    gen(r, d) {
      const n = Math.round(lerp(4, 9, t01(d)));
      const shapes = shapesFor(d + 1);
      const colors = colorsFor(d);
      const before = distinctCombos(r, n, shapes, colors).map((x) => ({ t: 'shape', ...x }));
      const at = r.int(n);
      const after = before.slice();
      const fresh = (list) => list.filter((x) => !before.some((b) => same(b, x)));
      const byShape = fresh(shapes.map((shape) => ({ ...before[at], shape })));
      const byColor = fresh(colors.map((color) => ({ ...before[at], color })));
      const changeShape = byColor.length === 0 || (d >= 5 && byShape.length > 0 && r.chance(0.5));
      const next = r.pick(changeShape ? byShape : byColor);
      after[at] = next;
      return {
        memorize: { kind: 'grid', cols: colsFor(n), items: before, exposureMs: exposure(d, n) },
        instruction: 'Which one CHANGED?', options: after, layout: 'tiles', cols: colsFor(n),
        explain: `It changed its ${changeShape ? 'shape' : 'color'}.`,
      };
    },
    solve: (ch) => idx(ch.options, (o, i) => !same(o, ch.memorize.items[i])),
  };

  T.mem_compare = {
    category: 'memory', timeable: false,
    gen(r, d) {
      const cols = d < 6 ? 3 : 4;
      const cells = cols * cols;
      const lit = clamp(2 + Math.floor(d / 2), 3, cells - 2);
      const on = r.sample(Array.from({ length: cells }, (_, i) => i), lit);
      const a = Array.from({ length: cells }, (_, i) => (on.includes(i) ? { t: 'swatch', color: 'blue' } : null));
      const differ = r.chance(0.5);
      const b = a.slice();
      if (differ) {
        const from = r.pick(on);
        const to = r.pick(Array.from({ length: cells }, (_, i) => i).filter((i) => !on.includes(i)));
        b[from] = null;
        b[to] = { t: 'swatch', color: 'blue' };
      }
      return {
        memorize: { kind: 'grid', cols, items: a, exposureMs: exposure(d, Math.ceil(lit / 2) + 1) },
        instruction: 'Is this the SAME pattern?', stimulus: { kind: 'grid', cols, items: b },
        options: [{ t: 'text', v: 'SAME' }, { t: 'text', v: 'DIFFERENT' }], layout: 'buttons',
        explain: differ ? 'One square moved.' : 'Nothing moved — it was the same.',
      };
    },
    solve: (ch) => (same(ch.memorize.items, ch.stimulus.items) ? 0 : 1),
  };

  T.mem_prev_color = {
    category: 'memory', timeable: false,
    gen(r, d) {
      const pool = colorsFor(d);
      const keep = r.pick(pool);
      const color = r.pick(otherThan(pool, keep));
      const word = r.pick(otherThan(pool, keep, color));
      return {
        memorize: { kind: 'swatch', color: keep, exposureMs: Math.round(lerp(1800, 1200, t01(d))), label: 'Remember this color' },
        instruction: 'Tap the color you REMEMBERED', hint: 'Not the ink. Not the word.',
        stimulus: { kind: 'word', word, color }, options: colorOpts(pool, r), layout: 'buttons',
        explain: `You were asked to remember ${cname(keep)}.`,
      };
    },
    solve: (ch) => idx(ch.options, (o) => o.v === ch.memorize.color),
  };

  /* ---------- Pattern Recognition ---------- */
  const seqStim = (items) => ({ kind: 'sequence', items });

  T.pat_arith = {
    category: 'pattern', timeable: false,
    gen(r, d) {
      const step = r.range(1, 2 + Math.round(d * 1.2)) * (d >= 5 && r.chance(0.4) ? -1 : 1);
      const len = 4;
      const start = step < 0 ? r.range(-step * (len + 1), -step * (len + 1) + 20) : r.range(1, 5 + d * 2);
      const nums = Array.from({ length: len }, (_, i) => start + step * i);
      const ans = start + step * len;
      return {
        instruction: 'What comes NEXT?', stimulus: seqStim(nums.map((v) => ({ t: 'num', v }))),
        options: numOptions(r, ans, [ans + step, ans - 2 * step, ans + 1, ans - 1]), layout: 'buttons',
        explain: `Each step ${step > 0 ? 'adds' : 'subtracts'} ${Math.abs(step)}.`,
      };
    },
    solve(ch) {
      const v = ch.stimulus.items.map((it) => it.v);
      const step = v[1] - v[0];
      return idx(ch.options, (o) => o.v === v[v.length - 1] + step);
    },
  };

  T.pat_geom = {
    category: 'pattern', timeable: false,
    gen(r, d) {
      const ratio = d < 6 ? 2 : r.pick([2, 3]);
      const start = r.range(1, d < 6 ? 3 : 5);
      const nums = [0, 1, 2, 3].map((i) => start * ratio ** i);
      const ans = start * ratio ** 4;
      return {
        instruction: 'What comes NEXT?', stimulus: seqStim(nums.map((v) => ({ t: 'num', v }))),
        options: numOptions(r, ans, [ans + nums[3], nums[3] * 2 + ratio, ans - nums[1], ans + ratio]), layout: 'buttons',
        params: { ratio }, explain: `Each number is ×${ratio} the one before.`,
      };
    },
    solve(ch) {
      const v = ch.stimulus.items.map((it) => it.v);
      return idx(ch.options, (o) => o.v === v[v.length - 1] * (v[1] / v[0]));
    },
  };

  T.pat_alt = {
    category: 'pattern', timeable: false,
    gen(r, d) {
      const a = r.range(1, 3 + d);
      let b = r.range(1, 3 + d);
      if (b === a) b += 2;
      if (d >= 7 && r.chance(0.5)) b = -Math.min(b, a - 1 || 1);
      const start = r.range(1, 10);
      const nums = [start];
      for (let i = 0; i < 4; i++) nums.push(nums[i] + (i % 2 === 0 ? a : b));
      const ans = nums[4] + a;
      return {
        instruction: 'What comes NEXT?', hint: 'Two steps take turns.', stimulus: seqStim(nums.map((v) => ({ t: 'num', v }))),
        options: numOptions(r, ans, [nums[4] + b, ans + 1, ans - 1]), layout: 'buttons',
        explain: `The steps alternate +${a} and ${b >= 0 ? '+' : ''}${b}.`,
      };
    },
    solve(ch) {
      const v = ch.stimulus.items.map((it) => it.v);
      return idx(ch.options, (o) => o.v === v[v.length - 1] + (v[1] - v[0]));
    },
  };

  T.pat_power = {
    category: 'pattern', timeable: false,
    gen(r) {
      const kind = r.pick(['fib', 'square']);
      let nums;
      let ans;
      if (kind === 'fib') {
        nums = [r.range(1, 4), r.range(1, 5)];
        while (nums.length < 5) nums.push(nums[nums.length - 1] + nums[nums.length - 2]);
        ans = nums[3] + nums[4];
      } else {
        const s = r.range(1, 6);
        nums = [0, 1, 2, 3].map((i) => (s + i) ** 2);
        ans = (s + 4) ** 2;
      }
      return {
        instruction: 'What comes NEXT?', stimulus: seqStim(nums.map((v) => ({ t: 'num', v }))), params: { kind },
        options: numOptions(r, ans, [ans + 1, ans - 2, nums[nums.length - 1] * 2]), layout: 'buttons',
        explain: kind === 'fib' ? 'Each number is the sum of the two before it.' : 'These are square numbers.',
      };
    },
    solve(ch) {
      const v = ch.stimulus.items.map((it) => it.v);
      const n = v.length;
      const next = ch.params.kind === 'fib' ? v[n - 1] + v[n - 2] : (Math.sqrt(v[n - 1]) + 1) ** 2;
      return idx(ch.options, (o) => o.v === next);
    },
  };

  function cyclic(r, d, pool, makeItem, optOf, label) {
    const p = d < 4 ? 2 : d < 8 ? 3 : 4;
    const unit = r.sample(pool, p);
    const len = 2 * p + r.int(p);
    const items = Array.from({ length: len }, (_, i) => makeItem(unit[i % p]));
    const ans = unit[len % p];
    const others = r.sample(pool.filter((x) => x !== ans), 3);
    return {
      instruction: 'What comes NEXT?', stimulus: seqStim(items),
      options: r.shuffle([ans, ...others]).map(optOf), layout: 'buttons', explain: `The ${label} repeat every ${p}.`,
    };
  }

  T.pat_shapes = {
    category: 'pattern', timeable: false,
    gen: (r, d) => cyclic(r, d, SHAPE_KEYS, (shape) => ({ t: 'shape', shape, color: 'neutral' }), (v) => ({ t: 'shapeName', v }), 'shapes'),
    solve(ch) { const n = inferNext(ch.stimulus.items); return idx(ch.options, (o) => n && o.v === n.shape); },
  };

  T.pat_colors = {
    category: 'pattern', timeable: false,
    gen: (r, d) => cyclic(r, d, colorsFor(Math.max(d, 5)), (color) => ({ t: 'swatch', color }), (v) => ({ t: 'color', v }), 'colors'),
    solve(ch) { const n = inferNext(ch.stimulus.items); return idx(ch.options, (o) => n && o.v === n.color); },
  };

  T.pat_rotate = {
    category: 'pattern', timeable: false,
    gen(r, d) {
      const step = d < 5 ? 1 : r.pick([1, -1, 2]);
      const start = r.pick(DIRS);
      const items = [0, 1, 2, 3].map((i) => ({ t: 'arrow', dir: rotateDir(start, step * i) }));
      return {
        instruction: 'Where does the arrow point NEXT?', stimulus: seqStim(items), options: dirOpts(), layout: 'arrows',
        explain: step === 2 ? 'It flips each time.' : `It turns 90° ${step > 0 ? 'clockwise' : 'counter-clockwise'} each step.`,
      };
    },
    solve(ch) {
      const it = ch.stimulus.items;
      const step = (DIRS.indexOf(it[1].dir) - DIRS.indexOf(it[0].dir) + 4) % 4;
      return idx(ch.options, (o) => o.v === rotateDir(it[it.length - 1].dir, step));
    },
  };

  T.pat_grow = {
    category: 'pattern', timeable: false,
    gen(r, d) {
      const down = d >= 4 && r.chance(0.5);
      const step = d < 6 ? 1 : r.pick([1, 2]);
      const len = 4;
      const start = down ? step * len + r.range(1, 2) : r.range(1, 2);
      const counts = Array.from({ length: len }, (_, i) => start + (down ? -step : step) * i);
      const ans = start + (down ? -step : step) * len;
      return {
        instruction: 'How many dots come NEXT?', stimulus: seqStim(counts.map((n) => ({ t: 'dots', n }))),
        options: numOptions(r, ans, [ans + 1, ans - 1, ans + step * 2]), layout: 'buttons',
        explain: `It ${down ? 'drops' : 'grows'} by ${step} each time.`,
      };
    },
    solve(ch) {
      const v = ch.stimulus.items.map((it) => it.n);
      return idx(ch.options, (o) => o.v === v[v.length - 1] + (v[1] - v[0]));
    },
  };

  T.pat_combo = {
    category: 'pattern', timeable: false,
    gen(r, d) {
      const [ps, pc] = r.pick([[2, 3], [3, 2]]);
      const shapes = r.sample(SHAPE_KEYS, ps);
      const colors = r.sample(colorsFor(Math.max(d, 5)), pc);
      const len = 6;
      const items = Array.from({ length: len }, (_, i) => ({ t: 'shape', shape: shapes[i % ps], color: colors[i % pc] }));
      const ans = { shape: shapes[len % ps], color: colors[len % pc] };
      const wrongS = shapes[(len + 1) % ps];
      const wrongC = colors[(len + 1) % pc];
      const opts = [ans, { shape: ans.shape, color: wrongC }, { shape: wrongS, color: ans.color }, { shape: wrongS, color: wrongC }];
      return {
        instruction: 'What comes NEXT?', hint: 'Shapes and colors repeat on their own beats.', stimulus: seqStim(items),
        options: r.shuffle(opts).map((x) => ({ t: 'shape', ...x })), layout: 'tiles', cols: 2,
        explain: `Shapes repeat every ${ps}, colors every ${pc}.`,
      };
    },
    solve(ch) {
      const it = ch.stimulus.items;
      const s = inferNext(it.map((x) => x.shape));
      const c = inferNext(it.map((x) => x.color));
      return idx(ch.options, (o) => o.shape === s && o.color === c);
    },
  };

  /* ---------- Don't Tap (impulse control streams) ---------- */
  function streamChallenge(r, d, rules, items, instruction, explain) {
    const stream = { rules, items, windowMs: streamWindow(d) };
    return { instruction, input: 'stream', stream, answer: null, explain };
  }
  const streamLen = (d) => Math.round(lerp(6, 12, t01(d)));

  T.go_color = {
    category: 'impulse', timeable: false,
    gen(r, d) {
      const colors = colorsFor(d);
      const rule = { type: 'color', color: r.pick(colors) };
      const shapes = shapesFor(d);
      const items = fillStream(r, streamLen(d), rule, () => ({ t: 'shape', shape: r.pick(shapes), color: rule.color }),
        () => shapeItem(r, shapes, otherThan(colors, rule.color)), 0.45);
      return streamChallenge(r, d, [rule], items, `Tap only ${cname(rule.color)} shapes. Ignore the rest.`, 'Only the target color counts.');
    },
    solve: (ch) => streamTargets(ch.stream),
  };

  T.go_color_shape = {
    category: 'impulse', timeable: false,
    gen(r, d) {
      const colors = colorsFor(d);
      const shapes = shapesFor(d + 2);
      const rule = { type: 'both', color: r.pick(colors), shape: r.pick(shapes) };
      // Decoys share exactly one feature most of the time.
      const decoy = () => (r.chance(0.5)
        ? { t: 'shape', shape: rule.shape, color: r.pick(otherThan(colors, rule.color)) }
        : { t: 'shape', shape: r.pick(otherThan(shapes, rule.shape)), color: rule.color });
      const items = fillStream(r, streamLen(d), rule, () => ({ t: 'shape', shape: rule.shape, color: rule.color }), decoy, 0.4);
      return streamChallenge(r, d, [rule], items, `Tap every ${cname(rule.color)} ${sname(rule.shape)}. Ignore everything else.`, 'Both the color and the shape must match.');
    },
    solve: (ch) => streamTargets(ch.stream),
  };

  T.go_avoid = {
    category: 'impulse', timeable: false,
    gen(r, d) {
      const banned = r.pick(['star', 'triangle', 'circle']);
      const rule = { type: 'not', rule: { type: 'shape', shape: banned } };
      const shapes = shapesFor(d + 3);
      const colors = colorsFor(d);
      const items = fillStream(r, streamLen(d), rule, () => shapeItem(r, otherThan(shapes, banned), colors),
        () => ({ t: 'shape', shape: banned, color: r.pick(colors) }), 0.6);
      return streamChallenge(r, d, [rule], items, `Tap everything EXCEPT ${sname(banned)}S.`, `Never tap a ${sname(banned)}.`);
    },
    solve: (ch) => streamTargets(ch.stream),
  };

  T.go_number = {
    category: 'impulse', timeable: false,
    gen(r, d) {
      const rule = { type: r.pick(['even', 'odd']) };
      const max = d < 5 ? 20 : 99;
      const want = rule.type === 'even' ? 0 : 1;
      const num = (parity) => { let v = r.range(1, max); if (v % 2 !== parity) v = v === max ? v - 1 : v + 1; return { t: 'num', v, color: 'neutral' }; };
      const items = fillStream(r, streamLen(d), rule, () => num(want), () => num(1 - want), 0.45);
      return streamChallenge(r, d, [rule], items, `Tap only ${rule.type.toUpperCase()} numbers.`, 'Check the last digit.');
    },
    solve: (ch) => streamTargets(ch.stream),
  };

  T.go_wait = {
    category: 'impulse', timeable: false,
    gen(r, d) {
      const n = streamLen(d);
      const colors = colorsFor(d);
      const lookalikes = ['diamond', 'hexagon', 'pentagon', 'circle'];
      const items = Array.from({ length: n }, () => ({ t: 'shape', shape: r.pick(lookalikes), color: r.pick(colors) }));
      items[r.range(Math.floor(n / 2), n - 1)] = { t: 'shape', shape: 'star', color: r.pick(colors) };
      return streamChallenge(r, d, [{ type: 'shape', shape: 'star' }], items, 'Wait for the STAR. Tap only the star.', 'Patience — only the star counts.');
    },
    solve: (ch) => streamTargets(ch.stream),
  };

  T.go_stroop = {
    category: 'impulse', timeable: false,
    gen(r, d) {
      const pool = colorsFor(d);
      const rule = { type: 'wordMatch' };
      const items = fillStream(r, streamLen(d), rule, () => { const c = r.pick(pool); return { t: 'word', word: c, color: c }; },
        () => { const w = r.pick(pool); return { t: 'word', word: w, color: r.pick(otherThan(pool, w)) }; }, 0.4);
      return streamChallenge(r, d, [rule], items, 'Tap only when the WORD matches its COLOR.', 'Read it, then check the ink.');
    },
    solve: (ch) => streamTargets(ch.stream),
  };

  /* ---------- Rule Switching ---------- */
  /** Build a stream of segments; segment i follows rules[ruleOrder[i]]. Each segment holds ≥1 target. */
  function switchingStream(r, d, rules, ruleOrder, makeItem, signal) {
    const items = [];
    ruleOrder.forEach((ri, s) => {
      if (s > 0) items.push(signal ? { t: 'switch' } : { t: 'rule', to: ri });
      const segLen = r.range(3, d < 6 ? 4 : 5);
      let seg;
      for (let tries = 0; tries < 60; tries++) {
        seg = Array.from({ length: segLen }, () => makeItem());
        const hits = seg.filter((it) => matchRule(rules[ri], it)).length;
        if (hits >= 1 && hits < segLen) break;
      }
      items.push(...seg);
    });
    return items;
  }
  const switchCount = (d) => (d < 6 ? 1 : d < 9 ? 2 : 3);
  const alternate = (n) => Array.from({ length: n + 1 }, (_, i) => i % 2);

  T.rs_color_switch = {
    category: 'switch', timeable: false,
    gen(r, d) {
      const colors = colorsFor(d);
      const [a, b] = r.sample(colors, 2);
      const rules = [{ type: 'color', color: a }, { type: 'color', color: b }];
      const shapes = shapesFor(d);
      const make = () => shapeItem(r, shapes, r.chance(0.7) ? [a, b] : colors);
      const items = switchingStream(r, d, rules, alternate(switchCount(d)), make, false);
      return streamChallenge(r, d, rules, items, `${ruleText(rules[0])}. Watch for RULE CHANGED.`, 'The rule changed mid-way.');
    },
    solve: (ch) => streamTargets(ch.stream),
  };

  T.rs_reverse = {
    category: 'switch', timeable: false,
    gen(r, d) {
      const s = r.pick(['circle', 'square', 'triangle']);
      const rules = [{ type: 'shape', shape: s }, { type: 'not', rule: { type: 'shape', shape: s } }];
      const shapes = shapesFor(d + 2);
      const make = () => shapeItem(r, r.chance(0.5) ? [s] : shapes, colorsFor(d));
      const items = switchingStream(r, d, rules, alternate(switchCount(d)), make, false);
      return streamChallenge(r, d, rules, items, `${ruleText(rules[0])}. The rule will REVERSE.`, 'After the change, the rule flipped.');
    },
    solve: (ch) => streamTargets(ch.stream),
  };

  T.rs_dimension = {
    category: 'switch', timeable: false,
    gen(r, d) {
      const colors = colorsFor(d);
      const shapes = shapesFor(d + 2);
      const rules = r.shuffle([{ type: 'color', color: r.pick(colors) }, { type: 'shape', shape: r.pick(shapes) }]);
      const make = () => shapeItem(r, shapes, colors);
      const items = switchingStream(r, d, rules, alternate(switchCount(d)), make, false);
      return streamChallenge(r, d, rules, items, `${ruleText(rules[0])}. Then switch between COLOR and SHAPE.`, 'The rule jumped between color and shape.');
    },
    solve: (ch) => streamTargets(ch.stream),
  };

  T.rs_signal = {
    category: 'switch', timeable: false,
    gen(r, d) {
      const colors = colorsFor(d);
      const [a, b] = r.sample(colors, 2);
      const rules = [{ type: 'color', color: a }, { type: 'color', color: b }];
      const make = () => shapeItem(r, shapesFor(d), r.chance(0.75) ? [a, b] : colors);
      const items = switchingStream(r, d, rules, alternate(switchCount(d) + (d >= 8 ? 1 : 0)), make, true);
      const ch = streamChallenge(r, d, rules, items, `Start: tap ${cname(a)}. Each ⚡ swaps between ${cname(a)} and ${cname(b)}.`, 'Count the ⚡ to know which rule is live.');
      ch.stream.hideActive = d >= 7; // late game: you must remember which rule is live
      return ch;
    },
    solve: (ch) => streamTargets(ch.stream),
  };

  /* ================= Public API ================= */
  const CATEGORY_NAMES = {
    color: 'Color Confusion', direction: 'Opposite Instructions', shape: 'Shape Confusion', memory: 'Memory Flash',
    impulse: "Don't Tap", pattern: 'Pattern Recognition', switch: 'Rule Switching',
  };

  /**
   * Time limit for a timed challenge; generous early, never below 2.5 s. Memory and pattern
   * questions (Hard mode) get a longer thinking clock that never drops under 5 s.
   */
  function timeLimitFor(tpl, d, speed = 1, input = 'choice') {
    if (tpl.timeable) return Math.max(2500, Math.round(tpl.baseMs * (1.3 - 0.05 * clamp(d, 1, 12)) * speed));
    if (input !== 'choice' || !['memory', 'pattern'].includes(tpl.category)) return null;
    return Math.max(5000, Math.round((10500 - 350 * clamp(d, 1, 12)) * Math.min(1, speed + 0.25)));
  }

  /**
   * Generate one challenge. Same (template, seed, d, opts) always yields the same challenge.
   * @param {string} template
   * @param {number} seed uint32
   * @param {number} d difficulty, 1..12
   * @param {{ timed?: boolean, speed?: number }} [opts]
   */
  function generate(template, seed, d, opts = {}) {
    const tpl = T[template];
    if (!tpl) throw new Error(`unknown template ${template}`);
    const r = rng(seed);
    const body = tpl.gen(r, d);
    const ch = {
      id: `${template}:${seed}:${d}`, template, category: tpl.category, seed, d,
      input: 'choice', hint: '', stimulus: null, memorize: null, params: {}, layout: 'buttons',
      ...body,
    };
    ch.answer = tpl.solve(ch);
    ch.timeLimit = opts.timed ? timeLimitFor(tpl, d, opts.speed || 1, ch.input) : null;
    return ch;
  }

  /** Is this response right? choice: option index; sequence: index list; stream: tapped flags. */
  function validate(ch, response) {
    if (ch.input === 'choice') return response === ch.answer;
    if (ch.input === 'sequence') return Array.isArray(response) && same(response, ch.answer);
    if (ch.input === 'stream') {
      const want = ch.answer.filter((x) => x !== null);
      return Array.isArray(response) && same(response, want);
    }
    return false;
  }

  /** Structural self-check used by tests and by the runtime before showing a challenge. */
  function check(ch) {
    const problems = [];
    const tpl = T[ch.template];
    if (ch.input === 'choice') {
      if (!(ch.answer >= 0 && ch.answer < ch.options.length)) problems.push('no valid answer');
      const keys = ch.options.map((o) => JSON.stringify(o));
      if (new Set(keys).size !== keys.length && !['sh_unique', 'sh_rotated', 'sh_twice'].includes(ch.template)) problems.push('duplicate options');
    }
    if (ch.input === 'stream') {
      const flags = ch.answer.filter((x) => x !== null);
      if (!flags.some(Boolean)) problems.push('stream has no target');
      if (flags.length && flags.every(Boolean) && ch.template !== 'go_avoid') problems.push('stream has no distractor');
    }
    if (ch.input === 'sequence' && !(Array.isArray(ch.answer) && ch.answer.length >= 3)) problems.push('sequence too short');
    if (!same(tpl.solve(ch), ch.answer)) problems.push('solver disagrees');
    if (ch.timeLimit !== null && ch.timeLimit < 2500) problems.push('time limit too short');
    if (ch.stream && ch.stream.windowMs < 700) problems.push('reaction window too short');
    return problems;
  }

  const TEMPLATES = Object.keys(T);
  const templateInfo = (id) => ({ id, category: T[id].category, timeable: T[id].timeable });

  const api = {
    TEMPLATES, CATEGORY_NAMES, PADS, generate, validate, check, templateInfo, matchRule, ruleText, streamTargets, timeLimitFor,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.BGChallenges = api;
})(this);

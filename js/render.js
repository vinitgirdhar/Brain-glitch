/* Visual renderers: turn challenge data (shapes, arrows, words, sequences) into markup.
   Gameplay colours come from BGCore.COLORS (fixed hex), never theme tokens. */
(function () {
  const { COLORS, SHAPES, DIR_NAMES } = window.BGCore;
  const esc = window.FX.escapeHtml;
  let marks = false; // colour-symbol accessibility option
  const setMarks = (v) => { marks = !!v; };

  const hex = (c) => (c === 'neutral' || !COLORS[c] ? 'currentColor' : COLORS[c].hex);
  const cname = (c) => (COLORS[c] ? COLORS[c].name : '');
  const sname = (s) => (SHAPES[s] ? SHAPES[s].name : s.toUpperCase());

  function polygon(sides, r, rot = -90) {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = ((rot + (360 / sides) * i) * Math.PI) / 180;
      pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(' ');
  }
  function starPts() {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 19 : 44;
      const a = ((-90 + 36 * i) * Math.PI) / 180;
      pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(52 + r * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(' ');
  }
  const GEOM = {
    circle: (f) => `<circle cx="50" cy="50" r="41" ${f}/>`,
    square: (f) => `<rect x="13" y="13" width="74" height="74" rx="9" ${f}/>`,
    triangle: (f) => `<polygon points="50,9 93,86 7,86" stroke-linejoin="round" ${f}/>`,
    diamond: (f) => `<polygon points="50,5 93,50 50,95 7,50" ${f}/>`,
    pentagon: (f) => `<polygon points="${polygon(5, 44)}" ${f}/>`,
    hexagon: (f) => `<polygon points="${polygon(6, 44, 0)}" ${f}/>`,
    star: (f) => `<polygon points="${starPts()}" stroke-linejoin="round" ${f}/>`,
    // Asymmetric under every rotation, so "which one is turned" is always answerable.
    flag: (f) => `<path d="M24 8h9v84h-9z M33 10 L82 27 L33 46z" ${f}/>`,
  };

  /** A filled shape (or outline when `outline`), optional size/rotation/label. */
  function shape(s, color, { size = 1, rot = 0, outline = false, label = null, cls = '' } = {}) {
    const fill = outline ? `fill="none" stroke="${hex(color)}" stroke-width="7"` : `fill="${hex(color)}"`;
    const mark = marks && COLORS[color] && !outline ? `<text x="50" y="58" class="mark">${COLORS[color].mark}</text>` : '';
    const scale = size !== 1 ? ` transform="translate(50 50) scale(${size}) translate(-50 -50)"` : '';
    const rotate = rot ? ` transform="rotate(${rot} 50 50)"` : '';
    return `<span class="shape ${cls}">
      <svg viewBox="0 0 100 100" aria-hidden="true"><g${scale}><g${rotate}>${GEOM[s](fill)}</g></g>${mark}</svg>
      ${label ? `<span class="shape-label">${esc(sname(label))}</span>` : ''}
    </span>`;
  }

  const ROT = { up: 0, right: 90, down: 180, left: 270 };
  function arrow(dir, color = null, cls = '') {
    const c = color ? hex(color) : 'currentColor';
    return `<svg class="arrow ${cls}" viewBox="0 0 100 100" aria-hidden="true">
      <path transform="rotate(${ROT[dir]} 50 50)" d="M50 8 L86 46 H62 V92 H38 V46 H14 Z" fill="${c}" stroke="${c}" stroke-width="4" stroke-linejoin="round"/></svg>`;
  }

  function swatch(color, cls = '') {
    return `<span class="swatch ${cls}" style="background:${hex(color)}">${marks ? `<i class="mark-chip">${COLORS[color].mark}</i>` : ''}</span>`;
  }

  function dots(n) {
    return `<span class="dots" aria-label="${n} dots">${Array.from({ length: n }, () => '<i></i>').join('')}</span>`;
  }

  /** Any sequence/memory item. */
  function item(it, opts = {}) {
    if (!it) return '<span class="cell-empty"></span>';
    switch (it.t) {
      case 'shape': return shape(it.shape, it.color, opts);
      case 'swatch': return swatch(it.color);
      case 'arrow': return `<span class="arrow-wrap">${arrow(it.dir)}</span>`;
      case 'num': return `<span class="num">${it.v}</span>`;
      case 'dots': return dots(it.n);
      case 'word': return `<span class="word-chip" style="color:${hex(it.color)}">${cname(it.word)}${marks ? `<sub class="mark-sub">${COLORS[it.color].mark}</sub>` : ''}</span>`;
      case 'switch': return '<span class="switch-bolt">⚡</span>';
      default: return '';
    }
  }

  const describe = (it) => {
    if (!it) return 'empty';
    if (it.t === 'shape') return `${it.color === 'neutral' ? '' : `${cname(it.color)} `}${sname(it.shape)}`.toLowerCase();
    if (it.t === 'word') return `the word ${cname(it.word)} in ${cname(it.color)}`.toLowerCase();
    if (it.t === 'num') return String(it.v);
    if (it.t === 'switch') return 'a lightning bolt';
    if (it.t === 'swatch') return cname(it.color).toLowerCase();
    return '';
  };

  /* ---------- Stimulus (the main focus area) ---------- */
  function stimulus(st) {
    if (!st) return '';
    switch (st.kind) {
      case 'word': {
        const frame = st.frame ? `<span class="word-frame">${shape(st.frame, st.frameColor || 'neutral', { outline: true })}</span>` : '';
        return `<div class="stim-word ${st.frame ? 'framed' : ''}">${frame}<span class="big-word" data-word role="img"
          aria-label="The word ${cname(st.word)} written in ${cname(st.color)}"></span>${marks ? `<span class="mark-chip big">${COLORS[st.color].mark}</span>` : ''}</div>`;
      }
      case 'arrow': {
        const label = st.label ? `<div class="arrow-label">${DIR_NAMES[st.label]}</div>` : '';
        const turn = st.turn ? `<div class="turn-hint">${st.turn > 0 ? '↻' : '↺'}</div>` : '';
        return `<div class="stim-arrow">${label}<div class="big-arrow" role="img" aria-label="Arrow pointing ${st.dir}${st.color ? `, colored ${cname(st.color)}` : ''}">${arrow(st.dir, st.color)}</div>${turn}</div>`;
      }
      case 'label': return `<div class="stim-label">${DIR_NAMES[st.text]}</div>`;
      case 'shapes': return `<div class="mini-grid" style="--cols:${st.cols}">${st.items.map((it) => `<span class="mini-cell" aria-label="${describe(it)}">${item(it)}</span>`).join('')}</div>`;
      case 'target': return `<div class="stim-target"><small>Find this</small>${item(st.item)}</div>`;
      case 'sequence': return `<div class="seq">${st.items.map((it) => `<span class="seq-item">${item(it)}</span>`).join('')}<span class="seq-item seq-q">?</span></div>`;
      case 'grid': return grid(st.cols, st.items);
      default: return '';
    }
  }

  function grid(cols, items) {
    return `<div class="mem-grid" style="--cols:${cols}">${items.map((it) => `<span class="mem-cell ${it ? 'on' : ''}">${it && it.t === 'swatch' ? '' : item(it)}</span>`).join('')}</div>`;
  }

  /* ---------- Memorize phase ---------- */
  function memorize(m) {
    switch (m.kind) {
      case 'row': return `<div class="mem-row">${m.items.map((it) => `<span class="mem-item">${item(it)}</span>`).join('')}</div>`;
      case 'grid': return grid(m.cols, m.items);
      case 'number': return `<div class="mem-number">${m.text}</div>`;
      case 'swatch': return `<div class="mem-swatch">${swatch(m.color, 'xl')}<p>${esc(m.label || '')}</p></div>`;
      default: return '';
    }
  }

  /* ---------- Answer options ---------- */
  function optionLabel(o) {
    switch (o.t) {
      case 'color': return cname(o.v);
      case 'dir': return `Arrow ${o.v}`;
      case 'shape': return `${o.color === 'neutral' ? '' : cname(o.color)} ${sname(o.shape)}${o.label ? ` labelled ${sname(o.label)}` : ''}`.trim();
      case 'word': return `The word ${cname(o.word)} in ${cname(o.color)}`;
      case 'num': case 'text': return String(o.v);
      case 'cell': return `Cell ${o.i + 1}`;
      case 'shapeName': return sname(o.v);
      case 'pad': return `${cname(o.color)} pad`;
      default: return '';
    }
  }

  function option(o, i) {
    const a = `data-i="${i}" aria-label="${esc(optionLabel(o))}"`;
    switch (o.t) {
      case 'color': return `<button class="ans" ${a}><span${o.ink ? ` style="color:${hex(o.ink)}"` : ''}>${cname(o.v)}</span></button>`;
      case 'dir': return `<button class="ans ans-dir dir-${o.v}" ${a}>${arrow(o.v)}</button>`;
      case 'shape': return `<button class="tile" ${a}>${shape(o.shape, o.color, { size: o.size || 1, rot: o.rot || 0, label: o.label })}</button>`;
      case 'word': return `<button class="tile tile-word" ${a}><span style="color:${hex(o.color)}">${cname(o.word)}</span>${marks ? `<sub class="mark-sub">${COLORS[o.color].mark}</sub>` : ''}</button>`;
      case 'num': return `<button class="ans ans-num" ${a}>${o.v}</button>`;
      case 'text': return `<button class="ans ans-text" ${a}>${esc(o.v)}</button>`;
      case 'cell': return `<button class="tile tile-cell" ${a}></button>`;
      case 'shapeName': return `<button class="ans ans-shape" ${a}>${shape(o.v, 'neutral', { cls: 'sm' })}<span>${sname(o.v)}</span></button>`;
      case 'pad': return `<button class="pad" ${a} style="--pad:${hex(o.color)}">${marks ? `<i class="mark-chip">${COLORS[o.color].mark}</i>` : ''}</button>`;
      default: return '';
    }
  }

  function options(ch) {
    const cls = ch.layout === 'tiles' ? `tiles cols-${ch.cols || 2}${ch.options[0].t === 'cell' ? ' cells' : ''}` : ch.layout === 'arrows' ? 'arrows' : ch.layout === 'pads' ? 'pads' : `buttons n-${ch.options.length}`;
    return `<div class="answers-grid ${cls}">${ch.options.map(option).join('')}</div>`;
  }

  /** Text form of the correct option (for "the answer was …"). */
  function answerText(ch) {
    if (ch.input !== 'choice') return '';
    return optionLabel(ch.options[ch.answer]);
  }

  window.Render = { setMarks, shape, arrow, swatch, item, stimulus, memorize, options, option, describe, answerText, hex, cname, sname };
})();

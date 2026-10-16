/* Shared primitives: seeded RNG, palette, shapes, directions. No DOM. */
(function (root) {
  /** mulberry32: tiny, fast, good enough for game content; same seed = same sequence. */
  function rng(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = (n) => Math.floor(next() * n);
    next.range = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
    next.pick = (list) => list[Math.floor(next() * list.length)];
    next.chance = (p) => next() < p;
    next.shuffle = (list) => {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    };
    /** k distinct items from list. */
    next.sample = (list, k) => next.shuffle(list).slice(0, k);
    return next;
  }

  /** FNV-1a string hash -> uint32 seed. */
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // Gameplay colours are fixed hex values, never theme tokens, so they read the same in light and dark.
  const COLORS = {
    red: { name: 'RED', hex: '#ff3b30', mark: 'R' },
    blue: { name: 'BLUE', hex: '#1e7bff', mark: 'B' },
    green: { name: 'GREEN', hex: '#28c24a', mark: 'G' },
    yellow: { name: 'YELLOW', hex: '#f5b800', mark: 'Y' },
    purple: { name: 'PURPLE', hex: '#a24bf0', mark: 'P' },
    orange: { name: 'ORANGE', hex: '#ff7a00', mark: 'O' },
  };
  const BASE_COLORS = ['red', 'blue', 'green', 'yellow'];
  const ALL_COLORS = Object.keys(COLORS);
  /** Colour set grows with difficulty: 4 early, 5 mid, 6 late. */
  const colorsFor = (d) => ALL_COLORS.slice(0, d < 5 ? 4 : d < 8 ? 5 : 6);

  const SHAPES = {
    circle: { name: 'CIRCLE', sides: null },
    square: { name: 'SQUARE', sides: 4 },
    triangle: { name: 'TRIANGLE', sides: 3 },
    pentagon: { name: 'PENTAGON', sides: 5 },
    hexagon: { name: 'HEXAGON', sides: 6 },
    star: { name: 'STAR', sides: null },
    diamond: { name: 'DIAMOND', sides: null },
  };
  const SHAPE_KEYS = Object.keys(SHAPES);
  const POLYGONS = ['triangle', 'square', 'pentagon', 'hexagon'];

  const DIRS = ['up', 'right', 'down', 'left'];
  const DIR_NAMES = { up: 'UP', right: 'RIGHT', down: 'DOWN', left: 'LEFT' };
  const opposite = (d) => DIRS[(DIRS.indexOf(d) + 2) % 4];
  const rotateDir = (d, quarterTurns) => DIRS[(((DIRS.indexOf(d) + quarterTurns) % 4) + 4) % 4];

  const ORDINALS = ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH'];

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);

  const api = {
    rng, hash, COLORS, BASE_COLORS, ALL_COLORS, colorsFor, SHAPES, SHAPE_KEYS, POLYGONS,
    DIRS, DIR_NAMES, opposite, rotateDir, ORDINALS, clamp, lerp,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.BGCore = api;
})(this);

# Brain Glitch

**Your brain knows the answer. Your fingers disagree.**

A free brain-training and reflex game for your phone. Simple instructions, tricky visuals: tap the ink color instead of the word, go the opposite way of the arrow, remember what just vanished, and keep up when the rule suddenly changes.

No account, no ads, no downloads. Everything is saved on your device and it works offline once loaded.

## How to play

1. Tap **Start Playing**.
2. Read the instruction at the top. It's short, but it's sneaky.
3. Tap your answer. Some challenges have a timer; most don't.
4. Clear the level, earn up to three stars, and move on.

Make too many mistakes and the level glitches. Just tap **Try Again** — retries are unlimited.

## What's inside

- **200 levels across 5 worlds** — Wake Up Your Brain, Trust Nothing, Memory Meltdown, System Overload and Glitch Master.
- **7 kinds of puzzles** — Color Confusion, Opposite Instructions, Shape Confusion, Memory Flash, Don't Tap, Pattern Recognition and Rule Switching (50 mechanics in total, introduced one at a time).
- **Boss levels** at 20, 40, 60, 80, 100, 125, 150, 175 and the five-phase **Final Glitch** at 200.
- **Daily Challenge** — 10 mixed puzzles, the same set for everyone each day.
- **Endless Mode** — unlocks after Level 200. Three lives, freshly generated puzzles, ever harder.
- **Achievements, stars and stats** to track how sharp you're getting.

## Scoring

- Right answer: **100 points**
- Speed bonus (timed challenges only): **up to +50**
- Streaks multiply: 3 in a row ×1.2 · 5 ×1.5 · 10 ×2
- Flawless level: **+200**

Stars: ★ finish · ★★ at most one mistake · ★★★ no mistakes (and quick on timed levels).

## Settings

Light, Dark or System theme · Sound · Haptics · Reduce motion · **Color symbols** (adds R/B/G… letters to colors for colorblind play) · Reset progress.

## Install it like an app

Open the game in your phone's browser, then **Add to Home Screen** (Safari: Share menu; Chrome: ⋮ menu).

## For developers

Plain HTML, CSS and JavaScript with GSAP — no build step.

```bash
python -m http.server 5174
```

```bash
node test/game.test.js
```

The test suite generates thousands of challenges per mechanic and checks each one with an independent solver, plus the level curriculum, scoring, state machine and save data.

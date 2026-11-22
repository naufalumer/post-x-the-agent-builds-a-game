# Rooftop Cat — one prompt, one game

[![make.fun · post-x-the-agent-builds-a-game-from-20261122-1709](https://make.fun/badge/post-x-the-agent-builds-a-game-from-20261122-1709.svg)](https://make.fun/bounty/post-x-the-agent-builds-a-game-from-20261122-1709?utm_source=github&utm_medium=readme&utm_campaign=post-x-the-agent-builds-a-game-from-20261122-1709)
[![rank](https://make.fun/badge/post-x-the-agent-builds-a-game-from-20261122-1709/naufalumer/post-x-the-agent-builds-a-game/rank.svg)](https://make.fun/bounty/post-x-the-agent-builds-a-game-from-20261122-1709/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=post-x-the-agent-builds-a-game-from-20261122-1709)
[![reward](https://make.fun/badge/post-x-the-agent-builds-a-game-from-20261122-1709/naufalumer/post-x-the-agent-builds-a-game/reward.svg)](https://make.fun/bounty/post-x-the-agent-builds-a-game-from-20261122-1709?utm_source=github&utm_medium=readme&utm_campaign=post-x-the-agent-builds-a-game-from-20261122-1709)

One prompt in, a playable game out. An AI coding agent built **Rooftop
Cat** — a cat leaping between rooftops at dusk — from a single prompt,
while the camera watched, and posted the clip on X. The game in
[`game.html`](game.html) is the real result: open it in any browser,
click / tap / press space to jump, land on the next roof or fall.

## The one prompt

> Build me a tiny browser game in one HTML file: a cat leaping between
> rooftops at dusk. One button to jump — press at the right moment to
> land on the next roof, miss and you fall. Score +1 per roof landed,
> speed rises as you score, dusk skyline with a big moon, game over
> screen with restart. Make it juicy: squash and stretch, dust puffs
> on landing, a little flash on a perfect landing.

The full prompt lives in [`GAME_PROMPT.md`](GAME_PROMPT.md).

## Play it

Open `game.html` in a browser — no build step, no dependencies, no
assets. One button: click, tap, or space to jump. Score +1 per roof
landed; the roofs scroll faster as you score. Land near a roof's centre
for a PERFECT flash. Miss and the cat falls; click to play again.

## Run it

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `POST.json` (the X post's address) to `/output/POST.json`,
where the house reads it. That is all the program has to do — the entry
is the post itself.

---

<sub>Entered on [make.fun](https://make.fun/?ref=bye4mn13&utm_source=github&utm_medium=readme&utm_campaign=post-x-the-agent-builds-a-game-from-20261122-1709) · AI agents build software for cash rewards</sub>

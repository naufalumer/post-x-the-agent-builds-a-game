// Rooftop Cat — make.fun entry for "The agent builds a game from one prompt"
// (post-x-the-agent-builds-a-game-from-20261122-1709).
//
// The entry is the X post itself: an agent builds a tiny browser game
// (game.html, in this repo) from one prompt, on video, and posts the clip
// natively on X. This program is the harness entrypoint, and all it has to
// do is hand the post's address to the grader: it copies POST.json from the
// repository root to /output/POST.json, where the house reads it and then
// reads the post's counts from X. Nothing this program writes about the
// post is scored — the house reads the post itself.
//
// Runs on Node 22, standard library only. No network, no wall clock, no
// files outside the repository. Two runs write the same bytes.
//
// Local run, the way the grader does it:
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const src = join(BOT_DIR, 'POST.json');
const dst = join(OUTPUT_DIR, 'POST.json');

// Read it first so a malformed POST.json fails loudly instead of being
// copied through silently: the gate refuses an unreadable post file, and
// a copy that hides that would only waste a grading run.
const text = readFileSync(src, 'utf8');
const parsed = JSON.parse(text);
if (typeof parsed !== 'object' || parsed === null || typeof parsed.url !== 'string') {
  console.error('POST.json must be a JSON object with a string "url" field');
  process.exit(1);
}

mkdirSync(OUTPUT_DIR, { recursive: true });
copyFileSync(src, dst);

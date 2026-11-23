// Rooftop Cat 3D — the game: loop, physics, autopilot, juice, capture.
// One file, one job: everything that makes the cat run, jump and fall.
// Physics is swept, never point-sampled: a landing is a crossing of a
// roof top while falling, so a fast fall can never pass through a roof.
//
// URL modes:
//   ?capture=1&seed=17&frames=675  fixed-step 30fps capture: the autopilot
//   plays a scripted arc, every frame is POSTed to the capture server.
//   ?perf=1                        live FPS / draw-call overlay.
//   ?auto=1                         autopilot plays (for playtests).
import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';
import { mulberry32 } from './random.js';
import { World } from './world.js';
import { Cat } from './cat.js';
import { Dust, Motes } from './particles.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';

// The scripted arc the autopilot plays in capture mode, consumed in
// order (one entry per roof landed on; the 'miss' is the scripted fall).
// Mirrors the v2 video's arc: near-miss opener, a 3-perfect streak,
// a mistimed jump, GAME OVER, restart, varied play to the end.
const PLAN = [
  'perfect', 'edge', 'score', 'edge', 'perfect', 'perfect', 'perfect',
  'score', 'perfect', 'score', 'miss',
  'perfect', 'edge', 'score', 'edge', 'edge', 'score', 'score', 'edge',
  'perfect', 'score', 'edge', 'perfect', 'score', 'edge', 'score',
];

export function startGame(canvas) {
  const params = new URLSearchParams(location.search);
  const captureMode = params.get('capture') === '1';
  const seed = Number(params.get('seed') || 17);
  const captureFrames = Number(params.get('frames') || 675);
  const autoMode = captureMode || params.get('auto') === '1';
  const perfMode = params.get('perf') === '1';

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: captureMode,
  });
  if (captureMode) {
    renderer.setPixelRatio(1);
    renderer.setSize(1280, 720, false);
  } else {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x2c1c4e, 20, 75);
  const camera = new THREE.PerspectiveCamera(
    CFG.fov,
    captureMode ? 1280 / 720 : window.innerWidth / window.innerHeight,
    0.1,
    220,
  );
  scene.add(camera);

  const world = new World(scene, seed);
  const cat = new Cat(scene);
  const dust = new Dust(scene);
  const motes = new Motes(scene);
  const hud = new Hud(camera);
  const sfx = new Sfx();

  // Warm bounce light that travels with the cat: it lifts the dark
  // silhouette off the dark roof so the cat always reads cleanly.
  // v4: 6 -> 8, a touch stronger so the orange fur's warm rim holds
  // against the dusk sky.
  const catLight = new THREE.PointLight(0xffb26b, 8, 6, 2);
  catLight.position.set(0.4, 1.6, 1.8);
  cat.group.add(catLight);

  // ------------------------------------------------------------ state
  const G = {
    state: 'title',           // title | playing | falling | over
    x: 0, y: 0, vy: 0,        // feet position, vertical speed
    grounded: true,
    roof: world.roofs[0],     // roof the cat stands on
    speed: CFG.baseSpeed,
    score: 0,
    best: 0,
    streak: 0,
    lastScoredIdx: 0,
    time: 0,                  // game seconds (capture clock)
    realTime: 0,
    trauma: 0,
    timeScale: 1,
    _tsId: 0,
    fovKickT: 0,
    camDip: 0,            // landing dip: camera sinks a touch, springs back
    bufferedJumpAt: -1,
    overAt: -1,               // game seconds when the fall became fatal
    fellAt: -1,
    events: [],
    planCursor: 1,           // PLAN[0] is already assigned as nextTarget
    nextTarget: PLAN[0],
    edgeSide: 0,              // alternates near/far edge landings
    aimRng: mulberry32(99),
    overShown: false,
  };
  try {
    G.best = Number(localStorage.getItem('rooftop-cat-3d-best') || 0);
  } catch (e) { G.best = 0; }

  const dom = Hud.bindDom({
    onStart: () => { sfx.unlock(); sfx.startAmbience(); startPlaying(); },
    onRestart: () => restart(),
    onMute: () => sfx.toggleMute(),
  });

  // ------------------------------------------------------------ helpers
  function speedFor(score) {
    return Math.min(CFG.maxSpeed, CFG.baseSpeed + CFG.speedPerScore * score);
  }

  function emit(kind) {
    if (captureMode) G.events.push({ t: +(G.time).toFixed(3), kind });
  }

  function addTrauma(a) {
    G.trauma = Math.min(1, G.trauma + a);
  }

  // Slow time for `ms` real milliseconds; only the newest call restores.
  function slowTime(scale, ms) {
    if (captureMode) return; // capture runs on a fixed clock: never warp it
    const id = ++G._tsId;
    G.timeScale = scale;
    setTimeout(() => {
      if (id === G._tsId) G.timeScale = 1;
    }, ms);
  }

  function startPlaying() {
    G.state = 'playing';
    hud.hideBanner();
  }

  function resetRun() {
    world.reset();
    G.x = 0;
    G.y = 0;
    G.vy = 0;
    G.grounded = true;
    G.roof = world.roofs[0];
    G.speed = CFG.baseSpeed;
    G.score = 0;
    G.streak = 0;
    G.lastScoredIdx = 0;
    G.trauma = 0;
    G.timeScale = 1;
    G._tsId++;
    G.camDip = 0;
    G.overAt = -1;
    G.fellAt = -1;
    G.overShown = false;
    // The restart run takes the next unconsumed plan entry (the arc
    // continues where it left off, it does not replay from the top).
    G.nextTarget = PLAN[G.planCursor] || 'score';
    G.planCursor += 1;
    hud.setScore(0);
    hud.hideBanner();
    cat.setFeet(0, 0);
    cat.group.rotation.z = 0;
  }

  function restart() {
    resetRun();
    G.state = 'playing';
  }

  function gameOver() {
    if (G.state === 'over') return;
    G.state = 'over';
    G.overAt = G.time;
    if (G.score > G.best) {
      G.best = G.score;
      try { localStorage.setItem('rooftop-cat-3d-best', String(G.best)); } catch (e) {}
    }
    sfx.gameOver();
    addTrauma(CFG.fallTrauma);
    hud.showBanner('GAME OVER', 'score ' + G.score, '#ff6b6b');
    emit('over');
    if (!captureMode) {
      setTimeout(() => {
        if (G.state === 'over') dom.showGameOver(G.score, G.best);
      }, 900);
    }
  }

  // ------------------------------------------------------------ physics
  function doJump() {
    if (G.state !== 'playing' || !G.grounded) return false;
    G.vy = CFG.jumpVelocity;
    G.grounded = false;
    cat.stretch();
    sfx.jump();
    addTrauma(CFG.jumpTrauma);
    G.fovKickT = 1;
    emit('jump');
    return true;
  }

  function queueJump() {
    sfx.unlock();
    sfx.startAmbience();
    G.bufferedJumpAt = G.realTime;
    doJump();
  }

  function onLand(roof, kind) {
    G.y = roof.top;
    G.vy = 0;
    G.grounded = true;
    G.roof = roof;
    cat.squash();
    G.camDip = 1; // the camera sinks a touch with the landing, then settles
    dust.puff(G.x, roof.top, 0, kind === 'perfect' ? 12 : 8);
    sfx.land();
    addTrauma(CFG.landTrauma);
    emit('land');
    const isNew = roof.idx > G.lastScoredIdx;
    if (isNew) {
      G.lastScoredIdx = roof.idx;
      G.score += 1;
      G.speed = speedFor(G.score);
      hud.setScore(G.score);
      if (kind === 'perfect') {
        G.streak += 1;
        sfx.perfect();
        hud.flash(0.5);
        hud.showBanner('PERFECT!', G.streak > 1 ? 'streak x' + G.streak : 'dead centre', '#ffd166');
        addTrauma(CFG.perfectTrauma);
        slowTime(CFG.hitStopScale, CFG.hitStopMs);
        setTimeout(() => slowTime(CFG.slowMoScale, CFG.slowMoMs), CFG.hitStopMs);
        emit('perfect');
      } else if (kind === 'edge') {
        G.streak = 0;
        sfx.edge();
        hud.showBanner('NEAR MISS!', 'right on the edge', '#ffb26b');
        emit('edge');
      } else {
        G.streak = 0;
        sfx.score();
        emit('score');
      }
    }
    // The autopilot takes its next instruction only on a fresh roof:
    // a short hop back onto the same roof consumes nothing.
    if (autoMode && isNew) {
      G.nextTarget = PLAN[G.planCursor] || 'score';
      G.planCursor += 1;
    }
  }

  function stepPhysics(dt) {
    if (G.state !== 'playing' && G.state !== 'falling') return;
    G.speed = speedFor(G.score);
    G.x += G.speed * dt;

    if (G.grounded) {
      // Ran off the edge of the roof?
      if (G.x > G.roof.x1) {
        G.grounded = false;
        G.vy = 0;
      } else {
        G.y = G.roof.top;
      }
    }

    if (!G.grounded) {
      const prevFeet = G.y;
      G.vy -= CFG.gravity * dt;
      G.y += G.vy * dt;
      if (G.vy <= 0) {
        // Swept landing: the feet crossed a roof top this step.
        const roof = world.roofAt(G.x);
        if (roof && prevFeet >= roof.top - 0.001 && G.y <= roof.top) {
          const centre = (roof.x0 + roof.x1) / 2;
          const dCentre = Math.abs(G.x - centre);
          let kind = 'score';
          if (dCentre <= CFG.perfectHalf) kind = 'perfect';
          else if (G.x - roof.x0 <= CFG.edgeBand || roof.x1 - G.x <= CFG.edgeBand) kind = 'edge';
          onLand(roof, kind);
        }
      }
      if (G.state === 'playing' && G.fellAt < 0 && G.y < G.roof.top - 2.5) {
        G.fellAt = G.time;
        G.state = 'falling';
        sfx.fall();
        emit('fall');
      }
      if (G.y < CFG.fallDeathY) gameOver();
    }

    // Buffered jump: a press just before landing still jumps.
    if (G.grounded && G.state === 'playing' && G.bufferedJumpAt >= 0
        && G.realTime - G.bufferedJumpAt < 0.12) {
      G.bufferedJumpAt = -1;
      doJump();
    }

    world.ensureAhead(G.x);
    world.setBlob(G.x, G.roof ? G.roof.top : G.y, G.y);
  }

  // ------------------------------------------------------------ autopilot
  function autopilotStep() {
    if (G.state !== 'playing' || !G.grounded || !autoMode) return;
    if (G.nextTarget === 'miss') return; // scripted fall: just run off
    const next = world.roofs.find((r) => r.idx === G.roof.idx + 1);
    if (!next) return;
    const centre = (next.x0 + next.x1) / 2;
    let targetX = centre;
    if (G.nextTarget === 'edge') {
      targetX = next.x0 + 0.42; // near edge only: a far-edge landing leaves no room for the next jump
    } else if (G.nextTarget === 'score') {
      targetX = centre + (G.aimRng() - 0.7) * 1.4; // left-biased, at most +0.4 right of centre
    }
    // Flight time to the next roof's top, descending root.
    const dh = next.top - G.roof.top;
    const disc = Math.max(1, CFG.jumpVelocity * CFG.jumpVelocity - 2 * CFG.gravity * dh);
    const t = (CFG.jumpVelocity + Math.sqrt(disc)) / CFG.gravity;
    const jumpX = targetX - G.speed * t;
    if (G.x >= jumpX) doJump();
  }

  // ------------------------------------------------------------ camera + juice
  const camTarget = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const _shakeT = { t: 0 };
  let _fov = CFG.fov;

  function updateCamera(dtReal, dtGame) {
    // Smooth follow: x tracks tightly so the run reads, y lags behind so
    // the camera never bobs with every jump — it glides up after the cat
    // and settles back down. Nothing here snaps.
    const tx = G.x + CFG.camOffset.x;
    const ty = G.y + CFG.camOffset.y;
    const kx = 1 - Math.exp(-8 * Math.max(dtGame, 0.0001));
    const ky = 1 - Math.exp(-3.2 * Math.max(dtGame, 0.0001));
    camTarget.x += (tx - camTarget.x) * kx;
    camTarget.y += (ty - camTarget.y) * ky;
    camTarget.z = CFG.camOffset.z;
    // Landing dip: the camera sinks a touch with the impact and springs
    // back, one smooth sine bump, never a step.
    if (G.camDip > 0) G.camDip = Math.max(0, G.camDip - dtReal * 3.5);
    const dip = G.camDip > 0 ? -0.16 * Math.sin((1 - G.camDip) * Math.PI) : 0;
    // Trauma shake (real time, so it keeps decaying through hit-stop).
    _shakeT.t += dtReal * 30;
    G.trauma = Math.max(0, G.trauma - CFG.traumaDecay * dtReal);
    const sh = G.trauma * G.trauma;
    const ox = CFG.shakeMaxOffset * sh * Math.sin(_shakeT.t * 1.7);
    const oy = CFG.shakeMaxOffset * 0.7 * sh * Math.sin(_shakeT.t * 2.3);
    const roll = CFG.shakeMaxRoll * sh * Math.sin(_shakeT.t * 1.1);
    camera.position.set(camTarget.x + ox, camTarget.y + oy + dip, camTarget.z);
    camera.rotation.z = roll;
    camLook.set(G.x + CFG.lookAhead.x, G.y + CFG.lookAhead.y, 0);
    camera.lookAt(camLook);
    camera.rotation.z += roll;
    // FOV kick (jump zoom punch), eased back over ~350 ms.
    if (G.fovKickT > 0) G.fovKickT = Math.max(0, G.fovKickT - dtReal / 0.35);
    const wantFov = CFG.fov + CFG.fovKick * G.fovKickT;
    if (Math.abs(wantFov - _fov) > 0.01) {
      _fov = wantFov;
      camera.fov = _fov;
      camera.updateProjectionMatrix();
    }
  }

  function frame(dtGame, dtReal) {
    G.time += dtGame;
    G.realTime += dtReal;
    autopilotStep();
    stepPhysics(dtGame);
    // The world scrolls with the cat; recycle behind, grow ahead.
    world.update(dtGame, G.x, G.time);
    motes.update(dtGame, G.x, G.time);
    cat.setFeet(G.x, G.y);
    cat.update(dtGame, G.grounded, G.speed, G.time);
    dust.update(dtGame);
    hud.update(dtReal);
    updateCamera(dtReal, dtGame);
    renderer.render(scene, camera);
  }

  // ------------------------------------------------------------ input
  function bindInput() {
    const jump = (e) => {
      if (e) e.preventDefault();
      if (G.state === 'title') { sfx.unlock(); dom.hideAll(); startPlaying(); return; }
      if (G.state === 'over') return;
      queueJump();
    };
    canvas.addEventListener('pointerdown', jump);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        jump();
      }
      if (e.code === 'KeyM') sfx.toggleMute();
      if (e.code === 'KeyR' && G.state === 'over') restart();
    });
    window.addEventListener('resize', () => {
      if (captureMode) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      hud.onResize();
    });
  }

  // ------------------------------------------------------------ perf overlay
  let perfDiv = null;
  let _fpsN = 0;
  let _fpsT = 0;
  let _fpsEMA = 0;
  if (perfMode) {
    perfDiv = document.createElement('div');
    perfDiv.style.cssText = 'position:fixed;top:48px;left:12px;z-index:9;color:#fff;'
      + 'background:rgba(0,0,0,0.55);font:12px monospace;padding:8px;border-radius:8px;';
    document.body.appendChild(perfDiv);
  }

  // ------------------------------------------------------------ debug handle
  window.__rooftop = {
    get state() { return G.state; },
    get score() { return G.score; },
    get x() { return G.x; },
    get y() { return G.y; },
    get speed() { return G.speed; },
    get streak() { return G.streak; },
    get roofs() { return world.roofs.length; },
    get grounded() { return G.grounded; },
    get roof() {
      const r = G.roof;
      return r ? { x0: r.x0, x1: r.x1, top: r.top, idx: r.idx } : null;
    },
    jump: () => doJump(),
    restart: () => restart(),
    start: () => startPlaying(),
    perf() {
      const info = renderer.info.render;
      return { calls: info.calls, triangles: info.triangles, fpsEMA: +_fpsEMA.toFixed(1) };
    },
    events: G.events,
  };

  // ------------------------------------------------------------ run
  bindInput();
  cat.setFeet(0, 0);
  camTarget.set(G.x + CFG.camOffset.x, G.y + CFG.camOffset.y, CFG.camOffset.z);
  camera.position.copy(camTarget);
  camera.lookAt(G.x + CFG.lookAhead.x, G.y + CFG.lookAhead.y, 0);

  if (captureMode) {
    runCapture();
  } else if (autoMode) {
    // Autopilot playtests start at once: there is no one to click PLAY.
    dom.hideAll();
    startPlaying();
    runLoop();
  } else {
    dom.showTitle(G.best);
    runLoop();
  }

  function runLoop() {
    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const dtReal = Math.min(clock.getDelta(), 0.05);
      const dtGame = dtReal * G.timeScale;
      // Substep the physics so a slow headless frame can't tunnel a roof.
      const n = Math.max(1, Math.ceil(dtGame / (1 / 120)));
      const h = dtGame / n;
      for (let i = 0; i < n; i++) {
        G.time += h;
        G.realTime += dtReal / n;
        autopilotStep();
        stepPhysics(h);
      }
      world.update(dtGame, G.x, G.time);
      motes.update(dtGame, G.x, G.time);
      cat.setFeet(G.x, G.y);
      cat.update(dtGame, G.grounded, G.speed, G.time);
      dust.update(dtGame);
      hud.update(dtReal);
      updateCamera(dtReal, dtGame);
      renderer.render(scene, camera);
      if (perfMode) {
        _fpsN += 1;
        _fpsT += dtReal;
        if (_fpsT >= 0.5) {
          _fpsEMA = _fpsEMA === 0 ? _fpsN / _fpsT : _fpsEMA * 0.7 + (_fpsN / _fpsT) * 0.3;
          _fpsN = 0;
          _fpsT = 0;
          const info = renderer.info.render;
          perfDiv.textContent = `fps ${_fpsEMA.toFixed(1)} · calls ${info.calls} · tris ${info.triangles} · state ${G.state} · score ${G.score}`;
        }
      }
      // In auto (non-capture) mode, restart by itself after game over.
      if (autoMode && G.state === 'over' && G.time - G.overAt > 1.0) restart();
    });
  }

  // ------------------------------------------------------------ capture
  async function runCapture() {
    const base = 'http://127.0.0.1:8471';
    startPlaying();
    const dt = 1 / CFG.captureFps;
    let overFrames = 0;
    for (let i = 0; i < captureFrames; i++) {
      frame(dt, dt);
      // Auto-restart 1 s after the scripted fall so the arc continues.
      if (G.state === 'over') {
        overFrames += 1;
        if (overFrames >= 30) {
          overFrames = 0;
          restart();
        }
      } else {
        overFrames = 0;
      }
      const url = renderer.domElement.toDataURL('image/jpeg', 0.82);
      await fetch(base + '/frame', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ index: i, data: url }),
      });
      if (i % 60 === 0) console.log('capture frame', i, '/', captureFrames, 'score', G.score, 'state', G.state);
    }
    await fetch(base + '/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: G.events, frames: captureFrames }),
    });
    window.__captureDone = true;
    console.log('capture done', captureFrames, 'frames,', G.events.length, 'events');
  }
}

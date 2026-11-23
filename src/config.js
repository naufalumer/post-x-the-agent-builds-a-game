// Rooftop Cat 3D — tuning constants.
// One file, one job: every number the game balances on lives here.
export const CFG = {
  // --- physics (world units, seconds) ---
  gravity: 22.0,          // downward acceleration
  jumpVelocity: 10.0,     // takeoff speed (apex ~2.27u, airtime ~0.91s level)
  baseSpeed: 6.5,         // run speed at score 0
  speedPerScore: 0.22,    // speed gained per roof landed
  maxSpeed: 11.0,
  catHalfHeight: 0.45,    // feet -> centre
  catHalfLength: 0.62,    // nose -> tail centre span

  // --- roofs (generated ahead, reachability-guaranteed) ---
  roofDepth: 5.0,
  roofMinWidth: 3.6,
  roofMaxWidth: 5.2,
  gapMin: 1.2,
  heightDelta: 1.0,       // max |rise| between neighbouring roofs
  roofAhead: 9,           // roofs kept alive in the pool
  recycleBehind: 14,      // a roof this far behind the cat is recycled
  fallDeathY: -7.0,       // feet below this -> game over

  // --- landing windows (world units from the roof centre / edges) ---
  perfectHalf: 0.35,      // |landX - centre| <= this -> PERFECT
  edgeBand: 0.35,         // landing within this of either edge -> NEAR MISS

  // --- camera ---
  fov: 55,
  camOffset: { x: -3.4, y: 2.7, z: 10.5 },
  lookAhead: { x: 2.4, y: 1.1, z: 0 },

  // --- juice ---
  traumaDecay: 1.4,       // trauma lost per real second
  shakeMaxOffset: 0.35,   // world units at trauma 1
  shakeMaxRoll: 0.02,     // radians at trauma 1
  landTrauma: 0.28,
  jumpTrauma: 0.10,
  perfectTrauma: 0.45,
  fallTrauma: 0.6,
  hitStopMs: 60,          // perfect-landing freeze (real ms)
  hitStopScale: 0.05,
  slowMoScale: 0.35,      // perfect-landing slow beat
  slowMoMs: 220,
  fovKick: -5,            // jump zoom punch (fov drops = zoom in)
  fovKickMs: 350,

  // --- capture (video frames, fixed step) ---
  captureFps: 30,
};

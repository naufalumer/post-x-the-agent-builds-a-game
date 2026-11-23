// Rooftop Cat 3D — the world: dusk sky, moon, skyline, roofs.
// One file, one job: everything the cat runs on and under, nothing else.
// Roofs are generated ahead with a reachability guarantee: the gap is
// always small enough that the next roof's centre is landable at the
// speed the roofs were generated at (speed only ever rises after that).
import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';
import { mulberry32, range } from './random.js';

const SKY_TOP = new THREE.Color(0x1e1b4b);
const SKY_MID = new THREE.Color(0x7c3f6e);
const SKY_LOW = new THREE.Color(0xe8734a);
const SKY_BOT = new THREE.Color(0xf7a85c);

export class World {
  constructor(scene, seed) {
    this.scene = scene;
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.roofs = [];          // sorted by x0, alive in the world
    this._pool = [];          // recycled roof objects
    this._all = [];           // every roof object ever made (for reset)
    this._seq = 0;            // roof sequence number (autopilot plans by it)
    this._buildSky(scene);
    this._buildMoon(scene);
    this._buildStars(scene);
    this._buildSkyline(scene);
    this._buildLights(scene);
    this._buildBlob(scene);
    this._seedRoofs();
  }

  // ---------------------------------------------------------- scenery
  _buildSky(scene) {
    const geo = new THREE.SphereGeometry(120, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: SKY_TOP },
        mid: { value: SKY_MID },
        low: { value: SKY_LOW },
        bot: { value: SKY_BOT },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vPos;
        uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 bot;
        void main() {
          float h = normalize(vPos).y;           // -1 .. 1
          vec3 c;
          if (h > 0.35)      c = mix(mid, top, smoothstep(0.35, 0.9, h));
          else if (h > 0.05) c = mix(low, mid, smoothstep(0.05, 0.35, h));
          else               c = mix(bot, low, smoothstep(-0.25, 0.05, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.frustumCulled = false;
    scene.add(sky);
    this._sky = sky;
  }

  _buildMoon(scene) {
    // Craters are painted into the moon's own texture (one mesh), not
    // separate discs: the moon used to cost five draw calls.
    const mcv = document.createElement('canvas');
    mcv.width = mcv.height = 256;
    const mg = mcv.getContext('2d');
    mg.fillStyle = '#ffe9c4';
    mg.beginPath();
    mg.arc(128, 128, 128, 0, Math.PI * 2);
    mg.fill();
    mg.fillStyle = '#f7cf96';
    for (const [cx, cy, r] of [[88, 92, 26], [168, 152, 18], [178, 78, 12]]) {
      mg.beginPath();
      mg.arc(cx, cy, r, 0, Math.PI * 2);
      mg.fill();
    }
    const moonTex = new THREE.CanvasTexture(mcv);
    moonTex.colorSpace = THREE.SRGBColorSpace;
    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(3.6, 48),
      new THREE.MeshBasicMaterial({ map: moonTex, fog: false, transparent: true }),
    );
    moon.position.set(-16, 13.5, -46);
    scene.add(moon);
    // halo: radial-gradient sprite, additive
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const g = cv.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255, 233, 196, 0.55)');
    grad.addColorStop(0.4, 'rgba(255, 210, 150, 0.18)');
    grad.addColorStop(1, 'rgba(255, 210, 150, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(cv);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.9,
    }));
    halo.position.copy(moon.position);
    halo.scale.set(30, 30, 1);
    scene.add(halo);
  }

  _buildStars(scene) {
    const rng = this.rng;
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = range(rng, -70, 70);
      pos[i * 3 + 1] = range(rng, 9, 48);
      pos[i * 3 + 2] = range(rng, -55, -30);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xfff2cc, size: 0.32, transparent: true, opacity: 0.85, fog: false,
    }));
    stars.frustumCulled = false;
    scene.add(stars);
  }

  _buildSkyline(scene) {
    const rng = this.rng;
    // Two instanced layers (one draw call each) instead of a mesh per
    // building: the skyline used to cost ~35 calls on its own.
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const farMat = new THREE.MeshLambertMaterial({ color: 0x1a1233 });
    const nearMat = new THREE.MeshLambertMaterial({ color: 0x251a47 });
    const farSpots = [];
    const nearBoxes = [];
    let x = -45;
    while (x < 75) {
      const w = range(rng, 4, 8);
      const h = range(rng, 5, 14);
      farSpots.push({ x: x + w / 2, w, h });
      x += w + range(rng, 0.5, 2.5);
    }
    x = -45;
    while (x < 75) {
      const w = range(rng, 3.5, 7);
      const h = range(rng, 3.5, 9.5);
      nearBoxes.push({ cx: x + w / 2, w, h, top: h - 2.5 });
      x += w + range(rng, 0.5, 2.0);
    }
    const dummy = new THREE.Object3D();
    const far = new THREE.InstancedMesh(boxGeo, farMat, farSpots.length);
    farSpots.forEach((b, i) => {
      dummy.position.set(b.x, b.h / 2 - 2.5, -26);
      dummy.scale.set(b.w, b.h, 4);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      far.setMatrixAt(i, dummy.matrix);
    });
    far.instanceMatrix.needsUpdate = true;
    scene.add(far);
    const near = new THREE.InstancedMesh(boxGeo, nearMat, nearBoxes.length);
    nearBoxes.forEach((b, i) => {
      dummy.position.set(b.cx, b.h / 2 - 2.5, -14);
      dummy.scale.set(b.w, b.h, 4);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      near.setMatrixAt(i, dummy.matrix);
    });
    near.instanceMatrix.needsUpdate = true;
    scene.add(near);
    // lit windows on the near layer: one InstancedMesh, warm or dark.
    const winGeo = new THREE.PlaneGeometry(0.42, 0.55);
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const spots = [];
    for (const b of nearBoxes) {
      const cols = Math.max(1, Math.floor(b.w / 1.4));
      const rows = Math.max(1, Math.floor((b.top + 2.5) / 1.6));
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (rng() < 0.42) continue; // unlit / no window here
          spots.push({
            x: b.cx - b.w / 2 + 0.8 + c * 1.4,
            y: -1.6 + r * 1.6,
            lit: rng() < 0.62,
          });
        }
      }
    }
    const wins = new THREE.InstancedMesh(winGeo, winMat, Math.max(1, spots.length));
    const litCol = new THREE.Color(0xffc861);
    const darkCol = new THREE.Color(0x2c2140);
    spots.forEach((s, i) => {
      dummy.position.set(s.x, s.y, -11.9);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      wins.setMatrixAt(i, dummy.matrix);
      wins.setColorAt(i, s.lit ? litCol : darkCol);
    });
    wins.instanceMatrix.needsUpdate = true;
    if (wins.instanceColor) wins.instanceColor.needsUpdate = true;
    scene.add(wins);
    // Twinkle: a few lit windows breathe slowly, so the city feels alive.
    // (Driven by game time, so a fixed-step capture replays identically.)
    this._wins = wins;
    this._winLit = litCol;
    this._winDark = darkCol;
    this._twinkles = [];
    const litIdx = spots.map((s, i) => (s.lit ? i : -1)).filter((i) => i >= 0);
    for (let k = 0; k < 14 && litIdx.length > 0; k++) {
      const i = litIdx[Math.floor(rng() * litIdx.length)];
      this._twinkles.push({ i, phase: rng() * Math.PI * 2, speed: 0.5 + rng() * 0.9 });
    }
    this._twinkleCol = new THREE.Color();
  }

  _buildLights(scene) {
    scene.add(new THREE.HemisphereLight(0x8a6fd0, 0x1c1226, 0.85));
    const moon = new THREE.DirectionalLight(0xffd9a0, 1.7);
    moon.position.set(-8, 14, 7);
    scene.add(moon);
    const fill = new THREE.DirectionalLight(0x6a5acd, 0.35);
    fill.position.set(6, 4, 10);
    scene.add(fill);
  }

  _buildBlob(scene) {
    this._blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this._blob.rotation.x = -Math.PI / 2;
    this._blob.renderOrder = 1;
    scene.add(this._blob);
  }

  // The fake contact shadow under the cat: shrinks and fades as it rises.
  setBlob(x, roofTopY, feetY) {
    const h = Math.max(0, feetY - roofTopY);
    const s = Math.max(0.35, 1 - h * 0.10);
    this._blob.position.set(x, roofTopY + 0.02, 0);
    this._blob.scale.set(s, s, 1);
    this._blob.material.opacity = 0.35 * s;
    this._blob.visible = h < 9;
  }

  // ---------------------------------------------------------- roofs
  _seedRoofs() {
    // The starting roof: wide, flat, under the cat.
    const first = this._makeRoof(-6, 7, 0);
    this.roofs.push(first);
    let prev = first;
    for (let i = 0; i < CFG.roofAhead; i++) {
      prev = this._genRoof(prev);
      this.roofs.push(prev);
    }
  }

  _makeRoof(x0, x1, top) {
    const r = this._pool.pop() || this._newRoofMesh();
    if (!this._all.includes(r)) this._all.push(r);
    const w = x1 - x0;
    r.idx = this._seq++;
    r.x0 = x0;
    r.x1 = x1;
    r.top = top;
    r.w = w;
    r.mesh.position.set((x0 + x1) / 2, top - 3.5, 0);
    r.mesh.scale.set(w, 7, CFG.roofDepth);
    r.mesh.updateMatrix(); // matrixAutoUpdate is off: bake it now
    r.mesh.visible = true;
    this._placeProp(r);
    return r;
  }

  _newRoofMesh() {
    // One material, one draw call per roof: the top face is tinted
    // through vertex colours (a material array would cost six calls).
    if (!World._roofGeo) {
      const g = new THREE.BoxGeometry(1, 1, 1);
      const top = new THREE.Color(0x54407a);
      const body = new THREE.Color(0x241a38);
      const n = g.attributes.normal;
      const colours = new Float32Array(n.count * 3);
      for (let i = 0; i < n.count; i++) {
        const c = n.getY(i) > 0.5 ? top : body;
        colours[i * 3] = c.r;
        colours[i * 3 + 1] = c.g;
        colours[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
      World._roofGeo = g;
      World._roofMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    }
    const mesh = new THREE.Mesh(World._roofGeo, World._roofMat);
    mesh.matrixAutoUpdate = false;
    this.scene.add(mesh);
    // One chimney and one antenna per roof object, created once and
    // repositioned on reuse: no mesh is ever allocated per placement.
    if (!World._chimneyGeo) {
      World._chimneyGeo = new THREE.BoxGeometry(0.55, 1.1, 0.55);
      World._chimneyMat = new THREE.MeshLambertMaterial({ color: 0x1c1330 });
      World._antGeo = new THREE.CylinderGeometry(0.05, 0.07, 2.2, 6);
      World._antMat = new THREE.MeshLambertMaterial({ color: 0x0f0a1e });
    }
    const chimney = new THREE.Mesh(World._chimneyGeo, World._chimneyMat);
    chimney.matrixAutoUpdate = false;
    chimney.visible = false;
    this.scene.add(chimney);
    const antenna = new THREE.Mesh(World._antGeo, World._antMat);
    antenna.matrixAutoUpdate = false;
    antenna.visible = false;
    this.scene.add(antenna);
    return { mesh, chimney, antenna, prop: null, propKind: '' };
  }

  // Restart: pull every roof mesh out of the scene and re-seed the run
  // from the same seed, so a restart replays an identical layout.
  reset() {
    for (const r of this._all) {
      this.scene.remove(r.mesh);
      this.scene.remove(r.chimney);
      this.scene.remove(r.antenna);
    }
    this._all = [];
    this._pool = [];
    this.roofs = [];
    this._seq = 0;
    this.rng = mulberry32(this.seed);
    this._seedRoofs();
  }

  _placeProp(r) {
    const rng = this.rng;
    r.chimney.visible = false;
    r.antenna.visible = false;
    r.prop = null;
    r.propKind = '';
    const roll = rng();
    if (roll < 0.55) {
      const px = r.x0 + 0.7 + rng() * Math.max(0.1, r.w - 1.8);
      r.chimney.position.set(px, r.top + 0.55, -1.4);
      r.chimney.updateMatrix();
      r.chimney.visible = true;
      r.prop = r.chimney;
      r.propKind = 'chimney';
    } else if (roll < 0.8) {
      const px = r.x0 + 0.6 + rng() * Math.max(0.1, r.w - 1.6);
      r.antenna.position.set(px, r.top + 1.1, 1.5);
      r.antenna.updateMatrix();
      r.antenna.visible = true;
      r.prop = r.antenna;
      r.propKind = 'antenna';
    }
  }

  _genRoof(prev) {
    // The gap window is derived, not guessed. Speed when jumping from
    // roof `prev` is speedFor(prev.idx) (score is ~ the roof index):
    //   flight = speed * airtime to the next top.
    // The gap must satisfy TWO things at once:
    //   (a) the next roof's centre stays reachable from this roof
    //       (jump point on this roof, 0.6 before its edge):
    //       gap <= flight - w_next/2 - 0.6
    //   (b) a cat that lands on this roof's centre can still jump and
    //       land within 0.35 of the next centre (a PERFECT stays a
    //       perfect even if it jumps the instant it lands):
    //       gap >= flight - w_next/2 - w_prev/2 - 0.35
    // The window between them is w_prev/2 - 0.25 wide (>= 1.55), so a
    // gap always exists. An earlier version used a flat gap range and
    // the autopilot fell off at higher speeds: the flight outgrew the
    // spacing, and the ideal jump point fell behind the landing point.
    const rng = this.rng;
    const speed = Math.min(CFG.maxSpeed, CFG.baseSpeed + CFG.speedPerScore * prev.idx);
    const w = range(rng, CFG.roofMinWidth, CFG.roofMaxWidth);
    let top = prev.top + range(rng, -CFG.heightDelta, CFG.heightDelta);
    top = Math.max(-1.2, Math.min(1.6, top));
    const dh = top - prev.top;
    // Flight time to the new top on the way down (descending root).
    const disc = Math.max(1, CFG.jumpVelocity * CFG.jumpVelocity - 2 * CFG.gravity * dh);
    const t = (CFG.jumpVelocity + Math.sqrt(disc)) / CFG.gravity;
    const flight = speed * t;
    const lo = Math.max(CFG.gapMin, flight - w / 2 - prev.w / 2 - 0.35);
    const hi = flight - w / 2 - 0.6;
    const gap = range(rng, lo, Math.max(lo + 0.05, hi));
    return this._makeRoof(prev.x1 + gap, prev.x1 + gap + w, top);
  }

  // Keep roofs ahead of the cat; recycle the ones far behind.
  ensureAhead(catX) {
    let far = this.roofs[this.roofs.length - 1];
    while (far.x1 < catX + 55) {
      far = this._genRoof(far);
      this.roofs.push(far);
    }
    while (this.roofs.length > 2 && this.roofs[0].x1 < catX - CFG.recycleBehind) {
      const old = this.roofs.shift();
      old.mesh.visible = false;
      if (old.prop) old.prop.visible = false;
      this._pool.push(old);
    }
  }

  // The roof whose span holds x (with a small forgiveness margin), or null.
  roofAt(x) {
    const m = 0.18;
    for (const r of this.roofs) {
      if (x >= r.x0 - m && x <= r.x1 + m) return r;
    }
    return null;
  }

  update(dt, catX, t = 0) {
    // The sky dome follows the camera's x so the gradient never runs out.
    this._sky.position.x = catX;
    // City lights breathe: a few windows slowly brighten and dim.
    if (this._wins && this._twinkles.length > 0) {
      for (const tw of this._twinkles) {
        const b = 0.55 + 0.45 * Math.sin(t * tw.speed + tw.phase);
        this._twinkleCol.copy(this._winDark).lerp(this._winLit, b);
        this._wins.setColorAt(tw.i, this._twinkleCol);
      }
      this._wins.instanceColor.needsUpdate = true;
    }
  }
}

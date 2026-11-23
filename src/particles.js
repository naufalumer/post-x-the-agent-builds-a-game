// Rooftop Cat 3D — dust puffs, zero allocation after setup.
// One file, one job: a fixed pool of soft particles, reused forever.
import * as THREE from '../vendor/three.module.min.js';

const MAX = 48;

export class Dust {
  constructor(scene) {
    // One soft circle, drawn MAX times by a single InstancedMesh.
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(245, 208, 169, 0.85)');
    grad.addColorStop(1, 'rgba(245, 208, 169, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false, opacity: 0.9,
      }),
      MAX,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this._dummy = new THREE.Object3D();
    this._parts = [];
    for (let i = 0; i < MAX; i++) {
      this._parts.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, s0: 0.3, s1: 0.9 });
      this._dummy.position.set(0, -100, 0);
      this._dummy.scale.set(0.001, 0.001, 0.001);
      this._dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this._dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this._cursor = 0;
  }

  puff(x, y, z, n = 8, spread = 1.6) {
    for (let i = 0; i < n; i++) {
      const p = this._parts[this._cursor];
      this._cursor = (this._cursor + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      p.life = 0.55;
      p.max = 0.55;
      p.x = x + Math.cos(a) * r * 0.4;
      p.y = y + 0.08 + Math.random() * 0.15;
      p.z = z + (Math.random() - 0.5) * 1.2;
      p.vx = Math.cos(a) * (0.4 + Math.random() * 0.9);
      p.vy = 0.5 + Math.random() * 0.9;
      p.s0 = 0.25 + Math.random() * 0.2;
      p.s1 = 0.8 + Math.random() * 0.5;
    }
  }

  update(dt) {
    const d = this._dummy;
    let any = false;
    for (let i = 0; i < MAX; i++) {
      const p = this._parts[i];
      if (p.life <= 0) continue;
      any = true;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy *= 1 - 2.2 * dt;
      const t = 1 - Math.max(0, p.life) / p.max;
      let s = p.s0 + (p.s1 - p.s0) * t;
      if (t > 0.7) s *= 1 - (t - 0.7) / 0.3; // shrink away at the end
      d.position.set(p.x, p.y, p.z);
      d.scale.set(s, s, 1);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Ambient motes: dust and embers drifting in the dusk air, always around
// the camera. Slow, soft, never in the way of the gameplay read.
const MOTES = 42;

export class Motes {
  constructor(scene) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const g = cv.getContext('2d');
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 220, 160, 0.9)');
    grad.addColorStop(1, 'rgba(255, 220, 160, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(cv);
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false, opacity: 0.55,
        blending: THREE.AdditiveBlending,
      }),
      MOTES,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this._dummy = new THREE.Object3D();
    this._motes = [];
    for (let i = 0; i < MOTES; i++) {
      this._motes.push({
        ox: (Math.random() - 0.5) * 22,   // offset from camera x
        y: 0.3 + Math.random() * 6.5,
        z: -2 + Math.random() * 5,
        s: 0.05 + Math.random() * 0.11,   // tiny
        ph: Math.random() * Math.PI * 2,
        sp: 0.25 + Math.random() * 0.5,   // drift speed
      });
    }
  }

  update(dt, camX, t) {
    const d = this._dummy;
    for (let i = 0; i < MOTES; i++) {
      const m = this._motes[i];
      // Slow drift + gentle bob; wraps around the camera so the air
      // always feels full wherever the cat runs.
      let x = camX + m.ox + Math.sin(t * m.sp * 0.4 + m.ph) * 0.8;
      const wrap = 24;
      let rel = x - camX;
      if (rel > wrap / 2) x -= wrap;
      if (rel < -wrap / 2) x += wrap;
      const y = m.y + Math.sin(t * m.sp + m.ph * 2) * 0.35;
      const pulse = 0.75 + 0.25 * Math.sin(t * 0.8 + m.ph);
      d.position.set(x, y, m.z);
      d.scale.set(m.s * pulse, m.s * pulse, 1);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

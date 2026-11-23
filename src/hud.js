// Rooftop Cat 3D — HUD: in-scene score + event banners (they render into
// the WebGL capture, so the video shows them), plus DOM title/game-over.
// One file, one job: everything the player reads, nothing else.
import * as THREE from '../vendor/three.module.min.js';

function makeCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

export class Hud {
  constructor(camera) {
    this.camera = camera;
    this.score = 0;
    this._pop = 0;      // score pop animation (0..1)
    this._bannerT = 0;  // banner lifetime left
    this._flashT = 0;   // flash overlay lifetime left
    this._flashMax = 1;

    // Score plate: camera-attached, top centre.
    this._scoreCv = makeCanvas(512, 192);
    this._scoreTex = new THREE.CanvasTexture(this._scoreCv);
    this._scoreTex.colorSpace = THREE.SRGBColorSpace;
    this.scoreMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.1, 1.16),
      new THREE.MeshBasicMaterial({ map: this._scoreTex, transparent: true, depthTest: false }),
    );
    this.scoreMesh.position.set(0, 2.35, -6);
    this.scoreMesh.renderOrder = 10;
    camera.add(this.scoreMesh);

    // Event banner (PERFECT! / NEAR MISS! / GAME OVER): centre screen.
    this._banCv = makeCanvas(1024, 256);
    this._banTex = new THREE.CanvasTexture(this._banCv);
    this._banTex.colorSpace = THREE.SRGBColorSpace;
    this.bannerMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(6.6, 1.65),
      new THREE.MeshBasicMaterial({ map: this._banTex, transparent: true, depthTest: false }),
    );
    this.bannerMesh.position.set(0, 0.55, -6);
    this.bannerMesh.renderOrder = 11;
    this.bannerMesh.scale.set(0.001, 0.001, 1);
    camera.add(this.bannerMesh);

    // Fullscreen flash (perfect landing): camera-attached, fades fast.
    this.flashMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 20),
      new THREE.MeshBasicMaterial({
        color: 0xffe9a8, transparent: true, opacity: 0, depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.flashMesh.position.set(0, 0, -2.5);
    this.flashMesh.renderOrder = 12;
    camera.add(this.flashMesh);

    this._drawScore();
    this._fit();
  }

  _fit() {
    // Keep the plates inside the view on any aspect (portrait phones too).
    const aspect = this.camera.aspect || 1.78;
    const visW = 2 * Math.tan((this.camera.fov * Math.PI) / 360) * 6 * aspect;
    const s = Math.min(1, visW / 7.2);
    this.scoreMesh.scale.set(s, s, 1);
    this._hudScale = s;
  }

  onResize() { this._fit(); }

  _drawScore() {
    const g = this._scoreCv.getContext('2d');
    g.clearRect(0, 0, 512, 192);
    g.fillStyle = 'rgba(16, 10, 34, 0.55)';
    g.beginPath();
    g.roundRect(56, 18, 400, 130, 36);
    g.fill();
    g.fillStyle = '#ffd166';
    g.font = 'bold 84px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('SCORE  ' + this.score, 256, 86);
    this._scoreTex.needsUpdate = true;
  }

  setScore(n) {
    this.score = n;
    this._pop = 1;
    this._drawScore();
  }

  showBanner(text, sub, color = '#ffd166') {
    const g = this._banCv.getContext('2d');
    g.clearRect(0, 0, 1024, 256);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = 18;
    g.fillStyle = color;
    g.font = 'bold 120px system-ui, sans-serif';
    g.fillText(text, 512, 96);
    if (sub) {
      g.fillStyle = '#ffffff';
      g.font = 'bold 52px system-ui, sans-serif';
      g.fillText(sub, 512, 200);
    }
    this._banTex.needsUpdate = true;
    this._bannerT = 0.9;
    this.bannerMesh.scale.set(0.001, 0.001, 1);
  }

  hideBanner() {
    this._bannerT = 0;
    this.bannerMesh.scale.set(0.001, 0.001, 1);
  }

  flash(strength = 0.5) {
    this._flashT = 0.28;
    this._flashMax = strength;
    this.flashMesh.material.opacity = strength;
  }

  update(dt) {
    // Score pop: overshoot then settle.
    if (this._pop > 0) {
      this._pop = Math.max(0, this._pop - dt * 4);
      const p = 1 - this._pop;
      const s = this._hudScale * (1 + 0.28 * Math.sin(p * Math.PI));
      this.scoreMesh.scale.set(s, s, 1);
    }
    // Banner: pop in, hold, fade out.
    if (this._bannerT > 0) {
      this._bannerT -= dt;
      const age = 0.9 - this._bannerT;
      let s;
      if (age < 0.12) s = 0.6 + (age / 0.12) * 0.55;      // pop in with overshoot
      else if (this._bannerT < 0.25) s = this._bannerT / 0.25; // fade out
      else s = 1.15;
      s *= this._hudScale;
      this.bannerMesh.scale.set(Math.max(0.001, s), Math.max(0.001, s), 1);
      this.bannerMesh.material.opacity = this._bannerT < 0.25 ? this._bannerT / 0.25 : 1;
      if (this._bannerT <= 0) this.bannerMesh.scale.set(0.001, 0.001, 1);
    }
    // Flash decay.
    if (this._flashT > 0) {
      this._flashT -= dt;
      this.flashMesh.material.opacity = Math.max(0, this._flashT / 0.28) * this._flashMax;
    }
  }

  // ---------------------------------------------------------- DOM overlays
  // Title and game-over live in the DOM (humans only; the capture runs
  // start straight into play, so they never appear in video frames).
  static bindDom({ onStart, onRestart, onMute }) {
    const title = document.getElementById('title-screen');
    const over = document.getElementById('game-over');
    const overScore = document.getElementById('over-score');
    const overBest = document.getElementById('over-best');
    const muteBtn = document.getElementById('mute-btn');
    document.getElementById('start-btn').addEventListener('click', () => {
      title.style.display = 'none';
      onStart();
    });
    document.getElementById('restart-btn').addEventListener('click', () => {
      over.style.display = 'none';
      onRestart();
    });
    muteBtn.addEventListener('click', () => {
      const muted = onMute();
      muteBtn.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
    });
    return {
      showTitle(best) {
        document.getElementById('title-best').textContent = best > 0 ? 'best ' + best : '';
        title.style.display = 'flex';
        over.style.display = 'none';
      },
      showGameOver(score, best) {
        overScore.textContent = 'score ' + score;
        overBest.textContent = 'best ' + best;
        over.style.display = 'flex';
      },
      hideAll() {
        title.style.display = 'none';
        over.style.display = 'none';
      },
    };
  }
}

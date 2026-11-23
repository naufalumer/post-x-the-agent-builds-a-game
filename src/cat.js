// Rooftop Cat 3D — the cat: a low-poly silhouette with a warm rim.
// One file, one job: the cat's body, its run cycle, squash and stretch.
import * as THREE from '../vendor/three.module.min.js';

export class Cat {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.position.set(0, 0, 0);
    scene.add(this.group);

    // Ginger tabby (v4, owner verdict: the v3 cat was still too dark):
    // warm orange fur that reads clearly against the dark dusk roofs.
    // A small emissive in the same orange family keeps the shadowed side
    // orange-brown instead of black, so the cat never disappears.
    const fur = new THREE.MeshLambertMaterial({
      color: 0xE08A3C,
      emissive: 0x7A3400,
      emissiveIntensity: 0.5,
    });
    const furDark = new THREE.MeshLambertMaterial({
      color: 0x8A4A1C,
      emissive: 0x2E1400,
      emissiveIntensity: 0.5,
    });
    const cream = new THREE.MeshLambertMaterial({
      color: 0xF7DCAC,
      emissive: 0x6B4A1A,
      emissiveIntensity: 0.35,
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });

    // Body: a stretched sphere, nose toward +x.
    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), fur);
    this.body.scale.set(1.5, 0.95, 0.8);
    this.body.position.set(0, 0.42, 0);
    this.group.add(this.body);

    // Cream chest patch: a flattened oval on the camera-facing (+z) side
    // of the body, lower-front, so it reads as a tabby chest from the
    // side camera. Child of the body so it rides the run-cycle bob.
    // (Scale compensates for the body's own 1.5/0.95/0.8 stretch, so the
    // patch lands at world position ~(0.38, 0.30, 0.22), just proud of
    // the body's surface.)
    this.chest = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), cream);
    this.chest.scale.set(0.86, 0.93, 0.66);
    this.chest.position.set(0.253, -0.126, 0.275);
    this.body.add(this.chest);

    // Head.
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12), fur);
    this.head.position.set(0.55, 0.78, 0);
    this.group.add(this.head);

    // Ears.
    const earGeo = new THREE.ConeGeometry(0.13, 0.26, 4);
    this.earL = new THREE.Mesh(earGeo, furDark);
    this.earL.position.set(0.48, 1.05, 0.14);
    this.earL.rotation.z = -0.15;
    this.group.add(this.earL);
    this.earR = new THREE.Mesh(earGeo, furDark);
    this.earR.position.set(0.48, 1.05, -0.14);
    this.earR.rotation.z = -0.15;
    this.group.add(this.earR);

    // Eyes: two small glowing dots on the +x face of the head.
    const eyeGeo = new THREE.SphereGeometry(0.045, 8, 8);
    this.eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeL.position.set(0.82, 0.82, 0.13);
    this.group.add(this.eyeL);
    this.eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeR.position.set(0.82, 0.82, -0.13);
    this.group.add(this.eyeR);

    // Legs: two visible pairs, animated in the run cycle.
    const legGeo = new THREE.BoxGeometry(0.12, 0.42, 0.12);
    this.legFL = new THREE.Mesh(legGeo, furDark);
    this.legFL.position.set(0.38, 0.21, 0.18);
    this.group.add(this.legFL);
    this.legFR = new THREE.Mesh(legGeo, furDark);
    this.legFR.position.set(0.38, 0.21, -0.18);
    this.group.add(this.legFR);
    this.legBL = new THREE.Mesh(legGeo, furDark);
    this.legBL.position.set(-0.38, 0.21, 0.18);
    this.group.add(this.legBL);
    this.legBR = new THREE.Mesh(legGeo, furDark);
    this.legBR.position.set(-0.38, 0.21, -0.18);
    this.group.add(this.legBR);

    // Tail: three segments, chained from the rear, swaying.
    this.tailSegs = [];
    let px = -0.58;
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.11, 0.11), fur);
      seg.position.set(px - 0.14, 0.62 + i * 0.1, 0);
      seg.rotation.z = 0.5 + i * 0.35;
      this.group.add(seg);
      this.tailSegs.push(seg);
      px -= 0.26;
    }

    // Squash & stretch state: scale springs back toward 1 with an
    // overshoot (back-ease), so every jump and landing reads.
    this._sx = 1;
    this._sy = 1;
    this._vx = 0;
    this._vy = 0;
    this._runPhase = 0;
  }

  // Jump stretch: long and thin. Land squash: short and wide.
  stretch() { this._sx = 1.28; this._sy = 0.74; this._vx = 0; this._vy = 0; }
  squash() { this._sx = 0.74; this._sy = 1.28; this._vx = 0; this._vy = 0; }

  // Feet position in world units (the group origin sits at the feet).
  setFeet(x, feetY) {
    this.group.position.x = x;
    this.group.position.y = feetY;
  }

  update(dt, grounded, speed, t) {
    // Spring the squash/stretch back to rest with a slight overshoot.
    const k = 180;
    const d = 14;
    this._vx += (-k * (this._sx - 1) - d * this._vx) * dt;
    this._vy += (-k * (this._sy - 1) - d * this._vy) * dt;
    this._sx += this._vx * dt;
    this._sy += this._vy * dt;
    this.group.scale.set(this._sx, this._sy, 1);

    // Run cycle: legs swing, body bobs a touch, tail sways.
    if (grounded) {
      this._runPhase += dt * (6 + speed * 1.1);
      const s = Math.sin(this._runPhase);
      const c = Math.sin(this._runPhase + Math.PI);
      this.legFL.rotation.z = s * 0.7;
      this.legBR.rotation.z = s * 0.7;
      this.legFR.rotation.z = c * 0.7;
      this.legBL.rotation.z = c * 0.7;
      this.body.position.y = 0.42 + Math.abs(Math.sin(this._runPhase)) * 0.05;
    } else {
      // Airborne: legs tucked, tail up.
      this.legFL.rotation.z = 0.5;
      this.legFR.rotation.z = 0.4;
      this.legBL.rotation.z = -0.4;
      this.legBR.rotation.z = -0.5;
      this.body.position.y = 0.42;
    }
    const sway = Math.sin(t * 2.2) * 0.18;
    this.tailSegs[0].rotation.z = 0.5 + sway;
    this.tailSegs[1].rotation.z = 0.85 + sway * 1.4;
    this.tailSegs[2].rotation.z = 1.2 + sway * 1.8;
    // Ears flick back slightly with speed.
    this.earL.rotation.z = -0.15 - speed * 0.012;
    this.earR.rotation.z = -0.15 - speed * 0.012;
  }
}

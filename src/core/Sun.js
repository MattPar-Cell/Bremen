import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

// Physical-ish sky + sun that respond to a time-of-day value (hours). Drives a
// shadow-casting directional light, hemisphere/ambient fill, and exposes the
// current horizon colour so the viewer can tint fog and background to match.
export class Sun {
  constructor(scene) {
    this.dir = new THREE.Vector3(0, 1, 0);
    this.horizonColor = new THREE.Color(0x9fc4e8);

    this.sky = new Sky();
    this.sky.scale.setScalar(20000);
    scene.add(this.sky);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 8;
    u.rayleigh.value = 2.6;
    u.mieCoefficient.value = 0.005;
    u.mieDirectionalG.value = 0.85;

    this.light = new THREE.DirectionalLight(0xffffff, 1);
    this.light.castShadow = true;
    const s = this.light.shadow;
    s.mapSize.set(2048, 2048);
    s.camera.near = 10;
    s.camera.far = 5000;
    s.camera.left = -1100;
    s.camera.right = 1100;
    s.camera.top = 1100;
    s.camera.bottom = -1100;
    s.bias = -0.0004;
    s.normalBias = 0.8;
    scene.add(this.light);
    scene.add(this.light.target);

    this.hemi = new THREE.HemisphereLight(0xbfd8f2, 0x4a4636, 0.55);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.22);
    scene.add(this.ambient);

    this._warm = new THREE.Color(0xffb066);
    this._white = new THREE.Color(0xfff6ec);
    this._skyBlue = new THREE.Color(0x9fc4e8);
    this._dusk = new THREE.Color(0xf0b483);

    this.setTime(13);
  }

  setTime(hours) {
    this.hours = hours;
    const frac = THREE.MathUtils.clamp((hours - 5) / 16, 0, 1);
    const elMax = THREE.MathUtils.degToRad(60);
    const el = Math.max(THREE.MathUtils.degToRad(2), Math.sin(frac * Math.PI) * elMax);
    const az = THREE.MathUtils.degToRad(90 + frac * 180);
    const ch = Math.cos(el);
    // north = -z, east = +x, up = +y
    this.dir.set(Math.sin(az) * ch, Math.sin(el), -Math.cos(az) * ch).normalize();

    this.sky.material.uniforms.sunPosition.value.copy(this.dir);

    const day = Math.sin(el);
    const warm = THREE.MathUtils.clamp(1 - el / THREE.MathUtils.degToRad(30), 0, 1);

    this.light.position.copy(this.dir).multiplyScalar(1800);
    this.light.target.position.set(0, 0, 0);
    this.light.intensity = 0.3 + day * 1.35;
    this.light.color.copy(this._warm).lerp(this._white, 1 - warm);

    this.hemi.intensity = 0.3 + day * 0.5;
    this.ambient.intensity = 0.15 + day * 0.2;

    this.horizonColor.copy(this._skyBlue).lerp(this._dusk, warm * 0.8);
  }
}

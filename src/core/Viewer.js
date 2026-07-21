import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { Sun } from './Sun.js';
import { COLORS } from '../config.js';

// Owns the renderer, camera, controls, sky/lighting, ground and the render
// loop. The city world group is swapped in via setWorld().
export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.world = null;
    this.cityMeshes = [];

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.5;

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      1,
      14000,
    );
    this.camera.position.set(520, 620, 720);

    this.controls = new MapControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = false;
    this.controls.maxPolarAngle = Math.PI * 0.495; // stay above the horizon
    this.controls.minDistance = 25;
    this.controls.maxDistance = 4500;
    this.controls.autoRotateSpeed = 0.45;
    this.controls.target.set(0, 0, 0);

    this.sun = new Sun(this.scene);

    this.fog = new THREE.FogExp2(this.sun.horizonColor.getHex(), 0.00018);
    this.scene.fog = this.fog;
    this.scene.background = this.sun.horizonColor.clone();

    this.ground = this._makeGround();
    this.scene.add(this.ground);

    this._fly = null;
    this._clock = new THREE.Clock();
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);

    this.renderer.setAnimationLoop(() => this._animate());
  }

  _makeGround() {
    const geo = new THREE.CircleGeometry(6500, 72);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: COLORS.ground });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -0.08;
    mesh.receiveShadow = true;
    mesh.name = 'ground';
    return mesh;
  }

  setWorld(group) {
    if (this.world) {
      this.scene.remove(this.world);
      this._disposeGroup(this.world);
    }
    this.world = group;
    this.scene.add(group);
    this.cityMeshes = [];
    group.traverse((o) => {
      if (o.isMesh) this.cityMeshes.push(o);
    });
  }

  // ---- display options -------------------------------------------------
  setLayerVisible(layer, visible) {
    if (layer) layer.visible = visible;
  }

  setShadows(on) {
    this.renderer.shadowMap.enabled = on;
    for (const m of this.cityMeshes) {
      if (m.material) m.material.needsUpdate = true;
    }
    if (this.ground.material) this.ground.material.needsUpdate = true;
  }

  setFog(on) {
    this.scene.fog = on ? this.fog : null;
  }

  setWireframe(on) {
    for (const m of this.cityMeshes) {
      if (m.material && 'wireframe' in m.material) m.material.wireframe = on;
    }
  }

  setAutoRotate(on) {
    this.controls.autoRotate = on;
  }

  setTime(hours) {
    this.sun.setTime(hours);
    const c = this.sun.horizonColor;
    this.fog.color.copy(c);
    if (this.scene.background) this.scene.background.copy(c);
  }

  // ---- camera moves ----------------------------------------------------
  // Snap the camera instantly (used when the world re-centres on a new area).
  setView(pos, target) {
    this._fly = null;
    this.camera.position.set(...pos);
    this.controls.target.set(...target);
    this.controls.update();
  }

  flyTo(pos, target, dur = 1.1) {
    this._fly = {
      fromPos: this.camera.position.clone(),
      toPos: new THREE.Vector3(...pos),
      fromTarget: this.controls.target.clone(),
      toTarget: new THREE.Vector3(...target),
      t: 0,
      dur,
    };
  }

  // ---- internals -------------------------------------------------------
  _animate() {
    const dt = Math.min(this._clock.getDelta(), 0.05);

    if (this._fly) {
      const f = this._fly;
      f.t += dt / f.dur;
      const k = f.t >= 1 ? 1 : easeInOut(f.t);
      this.camera.position.lerpVectors(f.fromPos, f.toPos, k);
      this.controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
      if (f.t >= 1) this._fly = null;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _disposeGroup(group) {
    group.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material?.dispose();
      }
    });
  }
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

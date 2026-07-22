import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { Sun } from './Sun.js';
import { COLORS } from '../config.js';

const LAYER_KEYS = ['water', 'green', 'roads', 'trees', 'buildings'];

// Owns the renderer, camera, controls, sky/lighting, ground and the render
// loop. Boroughs are accumulated into shared per-layer roots so the whole city
// can be assembled from many patches in one continuous coordinate space.
export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.cityMeshes = [];
    this.pickables = [];

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

    // Far plane large enough to see across the whole city (~15 km corner).
    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      1,
      60000,
    );
    this.camera.position.set(520, 620, 720);

    this.controls = new MapControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = false;
    this.controls.maxPolarAngle = Math.PI * 0.495; // stay above the horizon
    this.controls.minDistance = 25;
    this.controls.maxDistance = 26000; // zoom out far enough for the city view
    this.controls.autoRotateSpeed = 0.45;
    this.controls.target.set(0, 0, 0);

    this.sun = new Sun(this.scene);

    // Gentler fog so distant boroughs stay visible; still adds depth up close.
    this.fog = new THREE.FogExp2(this.sun.horizonColor.getHex(), 0.00006);
    this.scene.fog = this.fog;
    this.scene.background = this.sun.horizonColor.clone();

    this.ground = this._makeGround();
    this.scene.add(this.ground);

    // Persistent per-layer roots; each borough adds its meshes into these so a
    // single toggle controls that layer city-wide.
    this.layerRoots = {};
    for (const key of LAYER_KEYS) {
      const g = new THREE.Group();
      g.name = key;
      this.scene.add(g);
      this.layerRoots[key] = g;
    }

    this._fly = null;
    this._clock = new THREE.Clock();
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);

    this.renderer.setAnimationLoop(() => this._animate());
  }

  _makeGround() {
    const geo = new THREE.CircleGeometry(30000, 96);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: COLORS.ground });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -0.08;
    mesh.receiveShadow = true;
    mesh.name = 'ground';
    return mesh;
  }

  // ---- city content ----------------------------------------------------
  // Add one borough's built layers into the shared roots. `layers` maps each
  // layer key to a THREE.Group; `pickables` are its clickable building meshes.
  addCityLayers(layers, pickables) {
    for (const key of LAYER_KEYS) {
      const group = layers[key];
      if (!group) continue;
      this.layerRoots[key].add(group);
      group.traverse((o) => {
        if (o.isMesh) this.cityMeshes.push(o);
      });
    }
    if (pickables) this.pickables.push(...pickables.filter((m) => m.userData.pickable));
    // reflect current display options on the freshly added meshes
    this._applyDisplayToNew();
  }

  // Remove a specific borough's layer groups (kept by the caller) from the roots.
  removeGroups(groups) {
    for (const key of LAYER_KEYS) {
      const g = groups[key];
      if (!g) continue;
      this.layerRoots[key].remove(g);
      this._disposeGroup(g);
    }
    // rebuild the mesh/pickable caches from what remains
    this._rebuildCaches();
  }

  clearCity() {
    for (const key of LAYER_KEYS) {
      const root = this.layerRoots[key];
      for (const child of [...root.children]) {
        root.remove(child);
        this._disposeGroup(child);
      }
    }
    this.cityMeshes = [];
    this.pickables = [];
  }

  _rebuildCaches() {
    this.cityMeshes = [];
    this.pickables = [];
    for (const key of LAYER_KEYS) {
      this.layerRoots[key].traverse((o) => {
        if (o.isMesh) {
          this.cityMeshes.push(o);
          if (o.userData.pickable) this.pickables.push(o);
        }
      });
    }
  }

  // ---- display options -------------------------------------------------
  setLayerVisible(key, visible) {
    const root = this.layerRoots[key];
    if (root) root.visible = visible;
  }

  setShadows(on) {
    this._shadows = on;
    this.renderer.shadowMap.enabled = on;
    for (const m of this.cityMeshes) if (m.material) m.material.needsUpdate = true;
    if (this.ground.material) this.ground.material.needsUpdate = true;
  }

  setFog(on) {
    this.scene.fog = on ? this.fog : null;
  }

  setWireframe(on) {
    this._wire = on;
    for (const m of this.cityMeshes) {
      if (m.material && 'wireframe' in m.material) m.material.wireframe = on;
    }
  }

  _applyDisplayToNew() {
    if (this._wire) this.setWireframe(true);
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
  setView(pos, target) {
    this._fly = null;
    this.camera.position.set(...pos);
    this.controls.target.set(...target);
    this.controls.update();
  }

  flyTo(pos, target, dur = 1.2) {
    this._fly = {
      fromPos: this.camera.position.clone(),
      toPos: new THREE.Vector3(...pos),
      fromTarget: this.controls.target.clone(),
      toTarget: new THREE.Vector3(...target),
      t: 0,
      dur,
    };
  }

  // Frame a circular area (world XZ centre + radius in metres) from an angle.
  frameArea(cx, cz, radius, dur = 1.4) {
    const r = Math.max(radius, 120);
    this.flyTo([cx + r * 0.35, r * 0.85, cz + r * 0.95], [cx, 0, cz], dur);
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
    // Keep the shadow frustum centred on wherever we're looking.
    this.sun.follow(this.controls.target);
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

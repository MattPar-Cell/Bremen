import * as THREE from 'three';

// Click-to-select buildings. Because all buildings share one merged mesh, we
// map the ray's faceIndex back to a building via its stored face range, then
// briefly tint that building's vertices to highlight it.
export class Picker {
  constructor(viewer, onSelect) {
    this.viewer = viewer;
    this.onSelect = onSelect;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.down = new THREE.Vector2();
    this._prev = null;
    this._hi = new THREE.Color(0xffe08a);

    const el = viewer.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      this.down.set(e.clientX, e.clientY);
    });
    el.addEventListener('pointerup', (e) => {
      // ignore drags (orbit/pan) — only treat near-stationary taps as clicks
      if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 6) return;
      this._pick(e);
    });
  }

  _pick(e) {
    this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.viewer.camera);
    const hits = this.raycaster.intersectObjects(this.viewer.pickables || [], false);
    if (!hits.length) {
      this.clear();
      this.onSelect(null);
      return;
    }
    const hit = hits[0];
    const ranges = hit.object.userData.pickRanges;
    if (!ranges) return;
    const range = findRange(ranges, hit.faceIndex);
    if (!range) return;

    this._highlight(hit.object, range);
    this.onSelect(range.feature);
  }

  _highlight(mesh, range) {
    this.clear();
    const color = mesh.geometry.getAttribute('color');
    const vStart = range.start * 3;
    const vEnd = range.end * 3;
    const saved = new Float32Array((vEnd - vStart) * 3);
    for (let v = vStart, i = 0; v < vEnd; v++, i++) {
      saved[i * 3] = color.getX(v);
      saved[i * 3 + 1] = color.getY(v);
      saved[i * 3 + 2] = color.getZ(v);
      color.setXYZ(v, this._hi.r, this._hi.g, this._hi.b);
    }
    color.needsUpdate = true;
    this._prev = { mesh, vStart, vEnd, saved };
  }

  clear() {
    if (!this._prev) return;
    const { mesh, vStart, vEnd, saved } = this._prev;
    const color = mesh.geometry.getAttribute('color');
    for (let v = vStart, i = 0; v < vEnd; v++, i++) {
      color.setXYZ(v, saved[i * 3], saved[i * 3 + 1], saved[i * 3 + 2]);
    }
    color.needsUpdate = true;
    this._prev = null;
  }
}

// pickRanges are ordered by face, so a binary search finds the owning building.
function findRange(ranges, face) {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = ranges[mid];
    if (face < r.start) hi = mid - 1;
    else if (face >= r.end) lo = mid + 1;
    else return r;
  }
  return null;
}

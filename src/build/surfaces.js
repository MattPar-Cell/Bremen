import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS } from '../config.js';
import { projectRing, shapeFromRings, flatGeometry, ringAreaM2 } from './geometryUtils.js';

// Draw order / heights for the flat layers so they stack without z-fighting.
const CATEGORY = {
  water: { color: COLORS.water, y: 0.06, layer: 'water' },
  park: { color: COLORS.park, y: 0.14, layer: 'green' },
  grass: { color: COLORS.grass, y: 0.13, layer: 'green' },
  forest: { color: COLORS.forest, y: 0.15, layer: 'green' },
  cemetery: { color: COLORS.cemetery, y: 0.13, layer: 'green' },
  pitch: { color: COLORS.pitch, y: 0.16, layer: 'green' },
};

// Build merged flat meshes for green areas and water. Returns
// { green: Group, water: Group }. Two separate groups so they can be toggled.
export function buildSurfaces(areas) {
  const greenGeos = [];
  const waterGeos = [];
  const tmp = new THREE.Color();

  for (const area of areas) {
    const meta = CATEGORY[area.category];
    if (!meta) continue;
    const rings = area.rings.map(projectRing).filter((r) => r.length >= 3);
    if (!rings.length) continue;
    if (ringAreaM2(rings[0]) < 3) continue;

    const shape = shapeFromRings(rings);
    if (!shape) continue;

    let geo;
    try {
      geo = flatGeometry(shape, meta.y).toNonIndexed();
    } catch {
      continue;
    }

    tmp.set(meta.color);
    const vcount = geo.getAttribute('position').count;
    const colors = new Float32Array(vcount * 3);
    // gentle per-feature shade variation for greens so parks aren't a flat slab
    const v = meta.layer === 'green' ? 0.9 + ((rings[0].length * 7) % 20) / 100 : 1;
    for (let i = 0; i < vcount; i++) {
      colors[i * 3] = tmp.r * v;
      colors[i * 3 + 1] = tmp.g * v;
      colors[i * 3 + 2] = tmp.b * v;
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    (meta.layer === 'water' ? waterGeos : greenGeos).push(geo);
  }

  const green = new THREE.Group();
  green.name = 'green';
  if (greenGeos.length) {
    const merged = mergeGeometries(greenGeos, false);
    for (const g of greenGeos) g.dispose();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = true;
    green.add(mesh);
  }

  const water = new THREE.Group();
  water.name = 'water';
  if (waterGeos.length) {
    const merged = mergeGeometries(waterGeos, false);
    for (const g of waterGeos) g.dispose();
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.water,
      vertexColors: true,
      roughness: 0.5,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = true;
    water.add(mesh);
  }

  return { green, water };
}

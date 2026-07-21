import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { project } from '../geo/projection.js';

// One low-poly tree = a brown trunk cylinder + a green foliage icosahedron,
// baked into a single vertex-coloured geometry and drawn as an InstancedMesh.
function treePrototype() {
  // Cylinder is indexed, Icosahedron is not — normalise both to non-indexed so
  // mergeGeometries() accepts them.
  const trunk = new THREE.CylinderGeometry(0.35, 0.5, 3, 5).toNonIndexed();
  trunk.translate(0, 1.5, 0);
  paint(trunk, 0x6b4a2f);

  const foliage = new THREE.IcosahedronGeometry(2.4, 0).toNonIndexed();
  foliage.translate(0, 4.6, 0);
  paint(foliage, 0x3c7a34);

  return mergeGeometries([trunk, foliage], false);
}

function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

const MAX_TREES = 5000;

export function buildTrees(treeNodes) {
  if (!treeNodes.length) {
    const g = new THREE.Group();
    g.name = 'trees';
    return g;
  }

  const nodes = treeNodes.length > MAX_TREES ? sampleDown(treeNodes, MAX_TREES) : treeNodes;
  const proto = treePrototype();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.InstancedMesh(proto, mat, nodes.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < nodes.length; i++) {
    const [x, z] = project(nodes[i].lon, nodes[i].lat);
    // deterministic pseudo-random scale/rotation from coordinates
    const seed = Math.abs((x * 73.13 + z * 19.7) % 1);
    const s = 0.7 + seed * 0.7;
    dummy.position.set(x, 0, z);
    dummy.rotation.y = seed * Math.PI * 2;
    dummy.scale.set(s, 0.85 + seed * 0.5, s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  const group = new THREE.Group();
  group.name = 'trees';
  group.add(mesh);
  return group;
}

function sampleDown(arr, n) {
  const step = arr.length / n;
  const out = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

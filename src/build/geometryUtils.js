import * as THREE from 'three';
import { project } from '../geo/projection.js';

// Project a feature ring ([{lon,lat}, ...]) to an array of [x, z] metres,
// dropping any duplicated closing vertex.
export function projectRing(ring) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    out.push(project(ring[i].lon, ring[i].lat));
  }
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) out.pop();
  }
  return out;
}

// Build a THREE.Shape (with holes) from projected rings. rings[0] is the outer
// contour; any further rings are holes. Shape.y is set to -z so that after a
// -90° rotation about X the geometry lands correctly on the world XZ plane with
// north = -z.
export function shapeFromRings(rings) {
  const outer = rings[0];
  if (!outer || outer.length < 3) return null;
  const shape = new THREE.Shape();
  for (let i = 0; i < outer.length; i++) {
    const [x, z] = outer[i];
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  }
  for (let h = 1; h < rings.length; h++) {
    const hole = rings[h];
    if (!hole || hole.length < 3) continue;
    const path = new THREE.Path();
    for (let i = 0; i < hole.length; i++) {
      const [x, z] = hole[i];
      if (i === 0) path.moveTo(x, -z);
      else path.lineTo(x, -z);
    }
    shape.holes.push(path);
  }
  return shape;
}

// Approximate footprint area (m²) of the outer ring — used for height defaults
// and to discard degenerate slivers.
export function ringAreaM2(ring) {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % n];
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a / 2);
}

// A flat (horizontal) mesh geometry from a shape, laid on the XZ plane at y.
export function flatGeometry(shape, y = 0) {
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  if (y) geo.translate(0, y, 0);
  return geo;
}

// Extrude a footprint shape upward to `height` metres (flat roof).
export function extrudeGeometry(shape, height) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    steps: 1,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

// A flat ribbon following a polyline of [x, z] points, `width` metres wide,
// laid at height y. Used for roads, paths and railways.
export function ribbonGeometry(points, width, y = 0.3) {
  if (points.length < 2) return null;
  const hw = width / 2;
  const left = [];
  const right = [];

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // perpendicular
    const nx = -dz;
    const nz = dx;
    const [x, z] = points[i];
    left.push([x + nx * hw, z + nz * hw]);
    right.push([x - nx * hw, z - nz * hw]);
  }

  const positions = [];
  for (let i = 0; i < points.length - 1; i++) {
    const l0 = left[i];
    const r0 = right[i];
    const l1 = left[i + 1];
    const r1 = right[i + 1];
    // two triangles per segment
    positions.push(l0[0], y, l0[1], r0[0], y, r0[1], l1[0], y, l1[1]);
    positions.push(r0[0], y, r0[1], r1[0], y, r1[1], l1[0], y, l1[1]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

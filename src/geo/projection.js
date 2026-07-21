import { CENTER } from '../config.js';

// Simple equirectangular projection centred on CENTER. Over a city-sized area
// (a few km) the distortion is negligible, and it keeps the maths trivial:
// one degree of latitude is ~111.32 km everywhere; one degree of longitude is
// that scaled by cos(latitude).
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = 111320 * Math.cos((CENTER.lat * Math.PI) / 180);

// Returns [x, z] in metres, with +x = east and +z = south (so north is -z,
// i.e. "up" on a conventional map when looking down the +y axis).
export function project(lon, lat) {
  const x = (lon - CENTER.lon) * M_PER_DEG_LON;
  const z = -(lat - CENTER.lat) * M_PER_DEG_LAT;
  return [x, z];
}

// Inverse of project(): local metres [x, z] back to {lon, lat}. Used by the
// procedural fallback, which is authored in metres and converted to lon/lat so
// it flows through exactly the same parsing/building path as live OSM data.
export function unproject(x, z) {
  return {
    lon: CENTER.lon + x / M_PER_DEG_LON,
    lat: CENTER.lat - z / M_PER_DEG_LAT,
  };
}

// Project an OSM geometry array ([{lon,lat}, ...]) into an array of [x, z].
export function projectRing(geometry) {
  const out = new Array(geometry.length);
  for (let i = 0; i < geometry.length; i++) {
    out[i] = project(geometry[i].lon, geometry[i].lat);
  }
  return out;
}

// Signed area of a 2D ring (positive = counter-clockwise in x/z space).
export function ringArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % n];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

// Point-in-polygon (ray casting) for [x, z] points.
export function pointInRing(pt, ring) {
  const [px, pz] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    const intersect =
      zi > pz !== zj > pz &&
      px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Centroid of a ring in [x, z].
export function ringCentroid(ring) {
  let x = 0;
  let z = 0;
  for (const [px, pz] of ring) {
    x += px;
    z += pz;
  }
  return [x / ring.length, z / ring.length];
}

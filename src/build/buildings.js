import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, DEFAULT_HEIGHTS, LEVEL_HEIGHT } from '../config.js';
import { projectRing, shapeFromRings, extrudeGeometry, ringAreaM2 } from './geometryUtils.js';

// ---------------------------------------------------------------------------
// Height + classification
// ---------------------------------------------------------------------------
function typeKey(tags) {
  const b = tags.building || tags['building:part'] || '';
  if (b && DEFAULT_HEIGHTS[b] !== undefined) return b;
  if (tags.amenity === 'place_of_worship') return b === 'cathedral' ? 'cathedral' : 'church';
  if (b === 'church' || b === 'chapel' || b === 'cathedral') return b;
  if (b === 'detached' || b === 'bungalow' || b === 'terrace' || b === 'semidetached_house') return 'house';
  if (b === 'townhall' || b === 'government' || b === 'civic') return 'public';
  if (b === 'garages') return 'garage';
  return '_default';
}

export function buildingHeight(tags) {
  if (tags.height) {
    const h = parseFloat(String(tags.height).replace(',', '.'));
    if (isFinite(h) && h > 1) return h;
  }
  if (tags['building:levels']) {
    const l = parseFloat(tags['building:levels']);
    if (isFinite(l) && l > 0) return l * LEVEL_HEIGHT + 1;
  }
  return DEFAULT_HEIGHTS[typeKey(tags)] ?? DEFAULT_HEIGHTS._default;
}

function colorFor(tags, height) {
  const b = tags.building || '';
  const worship = tags.amenity === 'place_of_worship' || b === 'church' || b === 'cathedral' || b === 'chapel';
  if (worship) return COLORS.church;
  if (b === 'monument' || b === 'memorial') return COLORS.landmark;
  if (['civic', 'public', 'government', 'townhall'].includes(b)) return COLORS.landmark;
  if (['commercial', 'retail', 'office', 'hotel'].includes(b)) return COLORS.commercial;
  if (['industrial', 'warehouse', 'garage', 'garages'].includes(b)) return COLORS.industrial;
  if (['house', 'detached', 'bungalow', 'terrace', 'semidetached_house'].includes(b)) return COLORS.house;
  if (height >= 30) return COLORS.buildingHigh;
  if (height >= 15) return COLORS.buildingMid;
  return COLORS.buildingLow;
}

const LABELS = {
  yes: 'Building', house: 'House', detached: 'House', apartments: 'Apartments',
  residential: 'Residential', commercial: 'Commercial', retail: 'Retail', office: 'Office',
  industrial: 'Industrial', warehouse: 'Warehouse', church: 'Church', cathedral: 'Cathedral',
  chapel: 'Chapel', civic: 'Civic building', public: 'Public building', hotel: 'Hotel',
  school: 'School', university: 'University', hospital: 'Hospital', train_station: 'Station',
  monument: 'Monument', memorial: 'Memorial', garage: 'Garage', roof: 'Roof', hut: 'Hut',
};
export function categoryLabel(tags) {
  if (tags.amenity === 'place_of_worship') return 'Place of worship';
  const b = tags.building;
  if (LABELS[b]) return LABELS[b];
  return b && b !== 'yes' ? b.charAt(0).toUpperCase() + b.slice(1).replace(/_/g, ' ') : 'Building';
}

// ---------------------------------------------------------------------------
// Roof prism for the fallback's gabled houses
// ---------------------------------------------------------------------------
function gableGeometry(roof) {
  const { cx, cz, w, d, rot, wallHeight, ridgeRise } = roof;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const to = (lx, lz, y) => [cx + lx * c - lz * s, y, cz + lx * s + lz * c];
  const hw = w / 2;
  const hd = d / 2;
  const top = wallHeight;
  const ridge = wallHeight + ridgeRise;
  const tris = [];
  const push = (p) => tris.push(p[0], p[1], p[2]);

  if (w >= d) {
    const A = to(-hw, -hd, top), B = to(hw, -hd, top), C = to(hw, hd, top), D = to(-hw, hd, top);
    const RL = to(-hw, 0, ridge), RR = to(hw, 0, ridge);
    // north slope
    push(A); push(B); push(RR); push(A); push(RR); push(RL);
    // south slope
    push(D); push(RL); push(RR); push(D); push(RR); push(C);
    // gable ends
    push(A); push(RL); push(D);
    push(B); push(C); push(RR);
  } else {
    const A = to(-hw, -hd, top), B = to(hw, -hd, top), C = to(hw, hd, top), D = to(-hw, hd, top);
    const RF = to(0, -hd, ridge), RB = to(0, hd, ridge);
    // west slope
    push(A); push(RF); push(RB); push(A); push(RB); push(D);
    // east slope
    push(B); push(C); push(RB); push(B); push(RB); push(RF);
    // gable ends
    push(A); push(B); push(RF);
    push(D); push(RB); push(C);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
  const n = tris.length / 3;
  const col = new THREE.Color(COLORS.roof);
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------
export function buildBuildings(features) {
  const wallGeos = [];
  const roofGeos = [];
  const pickRanges = []; // { end, feature } cumulative faces of the wall mesh
  let faceCursor = 0;
  const tmp = new THREE.Color();

  for (const feat of features) {
    const rings = feat.rings.map(projectRing).filter((r) => r.length >= 3);
    if (!rings.length) continue;
    const area = ringAreaM2(rings[0]);
    if (area < 0.5) continue;

    const height = feat._roof ? feat._roof.wallHeight : buildingHeight(feat.tags);
    const shape = shapeFromRings(rings);
    if (!shape) continue;

    let geo;
    try {
      geo = extrudeGeometry(shape, height).toNonIndexed();
    } catch {
      continue;
    }
    const pos = geo.getAttribute('position');
    const vcount = pos.count;

    // Per-vertex colour: building base tint with a slight bottom-to-top
    // gradient for cheap ambient-occlusion-like depth, plus tiny jitter.
    tmp.set(colorFor(feat.tags, height));
    const jitter = 0.92 + ((feat.id ? feat.id % 17 : 0) / 17) * 0.16;
    const colors = new Float32Array(vcount * 3);
    for (let i = 0; i < vcount; i++) {
      const y = pos.getY(i);
      const shade = (0.72 + 0.28 * Math.min(1, y / Math.max(6, height))) * jitter;
      colors[i * 3] = tmp.r * shade;
      colors[i * 3 + 1] = tmp.g * shade;
      colors[i * 3 + 2] = tmp.b * shade;
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    wallGeos.push(geo);
    const startFace = faceCursor;
    faceCursor += vcount / 3;
    pickRanges.push({
      start: startFace,
      end: faceCursor,
      feature: {
        name: feat.tags.name || feat.tags['addr:housename'] || null,
        category: categoryLabel(feat.tags),
        height: Math.round(height),
        tags: feat.tags,
      },
    });

    if (feat._roof) roofGeos.push(gableGeometry(feat._roof));
  }

  const group = new THREE.Group();
  group.name = 'buildings';
  const meshes = [];

  if (wallGeos.length) {
    const merged = mergeGeometries(wallGeos, false);
    disposeAll(wallGeos);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.pickRanges = pickRanges;
    mesh.userData.pickable = true;
    group.add(mesh);
    meshes.push(mesh);
  }

  if (roofGeos.length) {
    const merged = mergeGeometries(roofGeos, false);
    disposeAll(roofGeos);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    meshes.push(mesh);
  }

  return { group, meshes, count: pickRanges.length };
}

function disposeAll(geos) {
  for (const g of geos) g.dispose();
}

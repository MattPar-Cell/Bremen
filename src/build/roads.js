import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS } from '../config.js';
import { projectRing, ribbonGeometry } from './geometryUtils.js';

// Width (metres) and colour by highway/railway class.
function roadStyle(tags, rail) {
  if (rail) return { width: 5, color: COLORS.rail, y: 0.22 };
  const h = tags.highway;
  switch (h) {
    case 'motorway':
    case 'trunk':
      return { width: 16, color: COLORS.roadMajor, y: 0.34 };
    case 'primary':
    case 'motorway_link':
    case 'trunk_link':
    case 'primary_link':
      return { width: 12, color: COLORS.roadMajor, y: 0.32 };
    case 'secondary':
    case 'secondary_link':
      return { width: 10, color: COLORS.roadMajor, y: 0.31 };
    case 'tertiary':
      return { width: 8, color: COLORS.road, y: 0.3 };
    case 'residential':
    case 'living_street':
    case 'unclassified':
      return { width: 6.5, color: COLORS.road, y: 0.29 };
    case 'service':
      return { width: 4, color: COLORS.road, y: 0.28 };
    case 'pedestrian':
      return { width: 7, color: COLORS.footway, y: 0.3 };
    case 'footway':
    case 'path':
    case 'cycleway':
      return { width: 2.5, color: COLORS.footway, y: 0.27 };
    default:
      return { width: 5, color: COLORS.road, y: 0.29 };
  }
}

// Build merged road/rail ribbon meshes. Returns a THREE.Group.
export function buildRoads(roads) {
  const byColor = new Map();

  for (const road of roads) {
    // road.pts is an array of {lon,lat}; projectRing handles that shape.
    const projected = projectRing(road.pts);
    if (projected.length < 2) continue;
    const style = roadStyle(road.tags, road.rail);
    const geo = ribbonGeometry(projected, style.width, style.y);
    if (!geo) continue;
    const key = style.color;
    if (!byColor.has(key)) byColor.set(key, []);
    byColor.get(key).push(geo);
  }

  const group = new THREE.Group();
  group.name = 'roads';
  for (const [color, geos] of byColor) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    const mat = new THREE.MeshLambertMaterial({
      color,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

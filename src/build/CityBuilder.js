import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS } from '../config.js';
import { buildBuildings } from './buildings.js';
import { buildSurfaces } from './surfaces.js';
import { buildRoads } from './roads.js';
import { buildTrees } from './trees.js';
import { projectRing, ribbonGeometry } from './geometryUtils.js';

// Turn a parsed feature set into a single world THREE.Group with named,
// toggleable sub-layers, and report stats + the meshes that are clickable.
export function buildCity(features) {
  const world = new THREE.Group();
  world.name = 'city';

  const { green, water } = buildSurfaces(features.areas);
  addWaterways(water, features.waterways);

  const roads = buildRoads(features.roads);
  const trees = buildTrees(features.trees);
  const { group: buildingsGroup, meshes: buildingMeshes, count: buildingCount } =
    buildBuildings(features.buildings);

  world.add(water, green, roads, trees, buildingsGroup);

  const layers = { buildings: buildingsGroup, green, water, roads, trees };

  const stats = {
    buildings: buildingCount,
    green: countAreas(features.areas, (a) => a.category !== 'water'),
    water: countAreas(features.areas, (a) => a.category === 'water'),
    roads: features.roads.length,
    trees: features.trees.length,
  };

  return { world, layers, stats, pickables: buildingMeshes };
}

// River/canal centre-lines rendered as translucent blue ribbons, added to the
// water layer so they toggle together with water bodies.
function addWaterways(waterGroup, waterways) {
  if (!waterways || !waterways.length) return;
  const geos = [];
  for (const w of waterways) {
    const pts = projectRing(w.pts);
    if (pts.length < 2) continue;
    const width = w.tags.waterway === 'river' ? 24 : w.tags.waterway === 'canal' ? 10 : 4;
    const geo = ribbonGeometry(pts, width, 0.07);
    if (geo) geos.push(geo);
  }
  if (!geos.length) return;
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  const mat = new THREE.MeshStandardMaterial({ color: COLORS.water, roughness: 0.5, metalness: 0.1 });
  waterGroup.add(new THREE.Mesh(merged, mat));
}

function countAreas(areas, pred) {
  let n = 0;
  for (const a of areas) if (pred(a)) n++;
  return n;
}

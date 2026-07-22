import { Viewer } from './core/Viewer.js';
import { UI } from './ui/UI.js';
import { Picker } from './ui/Picker.js';
import { Loader, nextFrame } from './ui/Loader.js';
import { loadOSM, parseElements } from './geo/overpass.js';
import { buildFallback } from './geo/fallbackData.js';
import { buildCity } from './build/CityBuilder.js';
import { project } from './geo/projection.js';
import { AREAS, DEFAULT_AREA_ID, getArea } from './config.js';

Loader.init();

const canvas = document.getElementById('scene');
const viewer = new Viewer(canvas);
const picker = new Picker(viewer, (feature) => ui.showFeature(feature));

const ui = new UI(viewer, {
  areas: AREAS,
  currentAreaId: DEFAULT_AREA_ID,
  onAreaChange: (id) => selectBorough(id),
  onPreset: (preset) => applyPreset(preset),
  onLoadCity: () => loadWholeCity(),
  onReset: () => resetCity(),
  onReload: () => reloadFocus(),
  onInfoClose: () => picker.clear(),
});

// Boroughs currently in the scene, and a global set of OSM ids already built so
// overlapping borough downloads never draw the same feature twice.
const loaded = new Map(); // id -> { area, groups, ids:Set, stats, source }
const seen = new Set(); // "w<id>" / "n<id>" / "r<id>"
let focusId = DEFAULT_AREA_ID;
let loading = false;
let loadSeq = 0;

// ---- geometry / camera helpers --------------------------------------------
function globalCenter(area) {
  const [x, z] = project(area.center.lon, area.center.lat);
  return { x, z };
}

function boroughRadius(area) {
  const b = area.bbox;
  const ns = (b.north - b.south) * 111320;
  const ew = (b.east - b.west) * 111320 * Math.cos((b.south * Math.PI) / 180);
  return Math.hypot(ns, ew) / 2;
}

function presetsFor(area) {
  return [{ name: 'Whole city', fit: true }, ...area.presets];
}

// A borough's local viewpoint offsets, placed at its true world position.
function flyToBorough(area, preset) {
  const g = globalCenter(area);
  const p = preset || area.presets[0];
  const target = [g.x + p.target[0], p.target[1], g.z + p.target[2]];
  const pos = [g.x + p.pos[0], p.pos[1], g.z + p.pos[2]];
  viewer.flyTo(pos, target);
}

function fitCity() {
  if (!loaded.size) return;
  let minx = Infinity;
  let maxx = -Infinity;
  let minz = Infinity;
  let maxz = -Infinity;
  for (const e of loaded.values()) {
    const g = globalCenter(e.area);
    const r = boroughRadius(e.area);
    minx = Math.min(minx, g.x - r);
    maxx = Math.max(maxx, g.x + r);
    minz = Math.min(minz, g.z - r);
    maxz = Math.max(maxz, g.z + r);
  }
  const cx = (minx + maxx) / 2;
  const cz = (minz + maxz) / 2;
  const radius = (Math.max(maxx - minx, maxz - minz) / 2) * 1.15;
  viewer.frameArea(cx, cz, radius);
}

function applyPreset(preset) {
  if (preset.fit) fitCity();
  else flyToBorough(getArea(focusId), preset);
}

// ---- stats ----------------------------------------------------------------
function totalStats() {
  const t = { buildings: 0, green: 0, water: 0, roads: 0, trees: 0 };
  for (const e of loaded.values()) {
    for (const k in t) t[k] += e.stats[k] || 0;
  }
  return t;
}

// ---- dedup + registration -------------------------------------------------
function dedup(elements) {
  const ids = new Set();
  const fresh = [];
  for (const el of elements) {
    const key = el.type[0] + el.id;
    if (seen.has(key) || ids.has(key)) continue;
    ids.add(key);
    fresh.push(el);
  }
  return { ids, fresh };
}

function registerBorough(area, features, ids, source) {
  const { layers, stats, pickables } = buildCity(features);
  viewer.addCityLayers(layers, pickables);
  for (const k of ids) seen.add(k);
  loaded.set(area.id, { area, groups: layers, ids, stats, source });
}

function removeBorough(id) {
  const e = loaded.get(id);
  if (!e) return;
  viewer.removeGroups(e.groups);
  for (const k of e.ids) seen.delete(k);
  loaded.delete(id);
}

// ---- selection & loading --------------------------------------------------
async function selectBorough(id) {
  if (loading) return;
  const area = getArea(id);
  focusId = id;
  ui.setFocusArea(id);
  ui.setPresets(presetsFor(area));

  if (loaded.has(id)) {
    // already in the scene — just fly there, no refetch
    picker.clear();
    ui.hideFeature();
    flyToBorough(area, area.presets[0]);
    applySource(loaded.get(id).source, area);
    return;
  }
  await loadBorough(area, { fly: true });
}

async function loadBorough(area, { fly = true, force = false } = {}) {
  loading = true;
  const seq = ++loadSeq;
  picker.clear();
  ui.hideFeature();
  ui.setReloadEnabled(false);
  Loader.show();
  Loader.setStatus(`Loading ${area.name}…`);

  let source = 'error';
  try {
    Loader.setStatus(`Contacting OpenStreetMap for ${area.name}…`);
    Loader.setProgress(0.15);
    const { elements, source: src } = await loadOSM({
      area,
      force,
      onStatus: (s) => Loader.setStatus(s),
    });
    Loader.setProgress(0.55);
    await nextFrame();
    Loader.setStatus(`Constructing ${area.name} in 3D…`);
    const { ids, fresh } = dedup(elements);
    registerBorough(area, parseElements(fresh), ids, src);
    source = src;
  } catch (err) {
    console.warn(`Load failed for ${area.name}:`, err);
    if (area.id === 'altstadt' && loaded.size === 0) {
      Loader.setStatus('OpenStreetMap unreachable — loading offline model…');
      await nextFrame();
      registerBorough(area, buildFallback(), new Set(), 'fallback');
      source = 'fallback';
    }
  }

  if (fly) flyToBorough(area, area.presets[0]);
  ui.setStats(totalStats());
  ui.setLoadedAreas([...loaded.keys()]);
  applySource(source, area);

  Loader.setProgress(0.95);
  await nextFrame();
  ui.setReloadEnabled(true);
  loading = false;
  await Loader.hide(() => seq === loadSeq);
}

async function loadWholeCity() {
  if (loading) return;
  loading = true;
  const seq = ++loadSeq;
  picker.clear();
  ui.hideFeature();
  ui.setReloadEnabled(false);
  Loader.show();

  const todo = AREAS.filter((a) => !loaded.has(a.id));
  for (let i = 0; i < todo.length; i++) {
    const area = todo[i];
    Loader.setStatus(`Loading ${area.name}…  (${i + 1}/${todo.length})`);
    Loader.setProgress(0.04 + 0.92 * ((i + 1) / todo.length));
    await nextFrame();
    try {
      const { elements } = await loadOSM({ area });
      const { ids, fresh } = dedup(elements);
      registerBorough(area, parseElements(fresh), ids, 'live');
      ui.setStats(totalStats());
      ui.setLoadedAreas([...loaded.keys()]);
      await nextFrame();
    } catch (err) {
      console.warn(`Skipped ${area.name}:`, err);
    }
  }

  fitCity();
  ui.setSource('Whole city · OpenStreetMap', `${loaded.size} of ${AREAS.length} boroughs loaded`);
  ui.setReloadEnabled(true);
  loading = false;
  await Loader.hide(() => seq === loadSeq);
}

async function resetCity() {
  if (loading) return;
  viewer.clearCity();
  loaded.clear();
  seen.clear();
  focusId = DEFAULT_AREA_ID;
  ui.setLoadedAreas([]);
  ui.setFocusArea(DEFAULT_AREA_ID);
  ui.setPresets(presetsFor(getArea(DEFAULT_AREA_ID)));
  await loadBorough(getArea(DEFAULT_AREA_ID), { fly: true });
}

async function reloadFocus() {
  if (loading) return;
  const area = getArea(focusId);
  removeBorough(focusId);
  await loadBorough(area, { fly: true, force: true });
}

function applySource(source, area) {
  const inView = `${loaded.size} borough${loaded.size === 1 ? '' : 's'} in view`;
  if (source === 'live') ui.setSource('Live · OpenStreetMap', `${area.name} · ${inView}`);
  else if (source === 'cache') ui.setSource('Cached · OpenStreetMap', `${area.name} · ${inView}`);
  else if (source === 'fallback') {
    ui.setSource('Demo model · offline', "Stylised offline model — couldn't reach OpenStreetMap. Try “Reload”.");
  } else {
    ui.setSource('Offline · no data', `Couldn't reach OpenStreetMap for ${area.name}. Connect and press “Reload”.`);
  }
}

// ---- boot -----------------------------------------------------------------
ui.setFocusArea(DEFAULT_AREA_ID);
ui.setPresets(presetsFor(getArea(DEFAULT_AREA_ID)));
loadBorough(getArea(DEFAULT_AREA_ID), { fly: true });

window.__bremen = { viewer, ui, picker, loaded, selectBorough, loadWholeCity, resetCity };

import { Viewer } from './core/Viewer.js';
import { UI } from './ui/UI.js';
import { Picker } from './ui/Picker.js';
import { Loader, nextFrame } from './ui/Loader.js';
import { loadOSM, parseElements } from './geo/overpass.js';
import { buildFallback } from './geo/fallbackData.js';
import { buildCity } from './build/CityBuilder.js';
import { setProjectionCenter } from './geo/projection.js';
import { AREAS, DEFAULT_AREA_ID, getArea } from './config.js';

Loader.init();

const canvas = document.getElementById('scene');
const viewer = new Viewer(canvas);

const picker = new Picker(viewer, (feature) => ui.showFeature(feature));
const ui = new UI(viewer, {
  onReload: () => loadArea(currentAreaId, true),
  onInfoClose: () => picker.clear(),
  onAreaChange: (id) => loadArea(id, false),
  areas: AREAS,
  currentAreaId: DEFAULT_AREA_ID,
});

let currentAreaId = DEFAULT_AREA_ID;
let loading = false;
let loadSeq = 0;

const emptyFeatures = () => ({ buildings: [], areas: [], roads: [], waterways: [], trees: [] });

function areaKm(area) {
  const b = area.bbox;
  const ns = ((b.north - b.south) * 111.32).toFixed(1);
  const ew = ((b.east - b.west) * 111.32 * Math.cos((b.south * Math.PI) / 180)).toFixed(1);
  return `${ns} × ${ew} km`;
}

async function loadArea(areaId, force) {
  if (loading) return;
  loading = true;
  const seq = ++loadSeq;

  currentAreaId = areaId;
  const area = getArea(areaId);
  setProjectionCenter(area.center);

  ui.setActiveArea(areaId);
  ui.setPresets(area.presets);
  ui.setReloadEnabled(false);
  picker.clear();
  ui.hideFeature();
  Loader.show();
  Loader.setStatus(`Loading ${area.name}…`);

  let features;
  let source;
  try {
    Loader.setStatus(`Contacting OpenStreetMap for ${area.name}…`);
    Loader.setProgress(0.12);
    const { elements, source: src } = await loadOSM({
      area,
      force,
      onStatus: (s) => Loader.setStatus(s),
    });
    Loader.setProgress(0.5);
    await nextFrame();
    Loader.setStatus('Parsing map features…');
    features = parseElements(elements);
    source = src;
  } catch (err) {
    console.warn(`Falling back for ${area.name}:`, err);
    if (area.id === 'altstadt') {
      Loader.setStatus('OpenStreetMap unreachable — loading offline model…');
      await nextFrame();
      features = buildFallback();
      source = 'fallback';
    } else {
      features = emptyFeatures();
      source = 'error';
    }
  }

  Loader.setProgress(0.68);
  Loader.setStatus(`Constructing ${area.name} in 3D…`);
  await nextFrame();

  const { world, layers, stats, pickables } = buildCity(features);
  viewer.setWorld(world);
  viewer.pickables = pickables;
  ui.setLayers(layers);
  ui.setStats(stats);

  // Frame the newly re-centred world with its Overview viewpoint.
  const overview = area.presets[0];
  viewer.setView(overview.pos, overview.target);

  applySource(source, area);

  Loader.setProgress(0.92);
  await nextFrame();

  // The scene is built and interactive now — free the guard before the purely
  // cosmetic loader fade so rapid borough switches feel responsive.
  ui.setReloadEnabled(true);
  loading = false;
  await Loader.hide(() => seq === loadSeq);
}

function applySource(source, area) {
  if (source === 'live') {
    ui.setSource('Live · OpenStreetMap', `${area.name} · ${areaKm(area)}`);
  } else if (source === 'cache') {
    ui.setSource('Cached · OpenStreetMap', `${area.name} · ${areaKm(area)}`);
  } else if (source === 'fallback') {
    ui.setSource(
      'Demo model · offline',
      "Stylised offline model — couldn't reach OpenStreetMap. Try “Reload live data” when connected.",
    );
  } else {
    ui.setSource(
      'Offline · no data',
      `Couldn't reach OpenStreetMap for ${area.name}. Connect to the internet and press “Reload live data”.`,
    );
  }
}

loadArea(DEFAULT_AREA_ID, false);

// Expose for quick console debugging.
window.__bremen = { viewer, ui, picker, loadArea };

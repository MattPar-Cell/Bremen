import { Viewer } from './core/Viewer.js';
import { UI } from './ui/UI.js';
import { Picker } from './ui/Picker.js';
import { Loader, nextFrame } from './ui/Loader.js';
import { loadOSM, parseElements } from './geo/overpass.js';
import { buildFallback } from './geo/fallbackData.js';
import { buildCity } from './build/CityBuilder.js';
import { BBOX } from './config.js';

Loader.init();

const canvas = document.getElementById('scene');
const viewer = new Viewer(canvas);

const picker = new Picker(viewer, (feature) => ui.showFeature(feature));
const ui = new UI(viewer, {
  onReload: () => loadCity(true),
  onInfoClose: () => picker.clear(),
});

const areaKm =
  ((BBOX.north - BBOX.south) * 111.32).toFixed(1) +
  ' × ' +
  ((BBOX.east - BBOX.west) * 111.32 * Math.cos((BBOX.south * Math.PI) / 180)).toFixed(1) +
  ' km';

async function loadCity(force) {
  ui.setReloadEnabled(false);
  picker.clear();
  ui.hideFeature();
  Loader.show();

  let features;
  let source;
  try {
    Loader.setStatus('Contacting OpenStreetMap…');
    Loader.setProgress(0.12);
    const { elements, source: src } = await loadOSM({
      force,
      onStatus: (s) => Loader.setStatus(s),
    });
    Loader.setProgress(0.5);
    await nextFrame();
    Loader.setStatus('Parsing map features…');
    features = parseElements(elements);
    source = src;
  } catch (err) {
    console.warn('Falling back to offline model:', err);
    Loader.setStatus('OpenStreetMap unreachable — loading offline model…');
    await nextFrame();
    features = buildFallback();
    source = 'fallback';
  }

  Loader.setProgress(0.68);
  Loader.setStatus('Constructing the 3D city…');
  await nextFrame();

  const { world, layers, stats, pickables } = buildCity(features);
  viewer.setWorld(world);
  viewer.pickables = pickables;
  ui.setLayers(layers);
  ui.setStats(stats);

  if (source === 'live') {
    ui.setSource('Live · OpenStreetMap', `Central Bremen · ${areaKm}`);
  } else if (source === 'cache') {
    ui.setSource('Cached · OpenStreetMap', `Central Bremen · ${areaKm}`);
  } else {
    ui.setSource(
      'Demo model · offline',
      "Stylised offline model — couldn't reach OpenStreetMap. Try “Reload live data” when connected.",
    );
  }

  Loader.setProgress(0.92);
  await nextFrame();
  await Loader.hide();
  ui.setReloadEnabled(true);
}

loadCity(false);

// Expose for quick console debugging.
window.__bremen = { viewer, ui, picker };

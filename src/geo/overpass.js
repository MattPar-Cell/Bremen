import { OVERPASS_ENDPOINTS, CACHE_PREFIX, CACHE_TTL_MS } from '../config.js';

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------
function buildQuery(box) {
  const bbox = `${box.south},${box.west},${box.north},${box.east}`;
  // `out geom` returns node coordinates inline for ways and relation members,
  // so we never have to resolve node references ourselves.
  return `[out:json][timeout:90];
(
  way["building"](${bbox});
  relation["building"](${bbox});
  way["building:part"](${bbox});
  way["leisure"~"^(park|garden|playground|pitch|recreation_ground|dog_park|common|golf_course)$"](${bbox});
  way["landuse"~"^(grass|meadow|forest|recreation_ground|village_green|cemetery|allotments)$"](${bbox});
  way["natural"~"^(wood|scrub|grassland|heath|water|wetland)$"](${bbox});
  relation["natural"="water"](${bbox});
  relation["leisure"="park"](${bbox});
  way["amenity"="grave_yard"](${bbox});
  way["waterway"="riverbank"](${bbox});
  relation["waterway"="riverbank"](${bbox});
  way["water"](${bbox});
  way["waterway"~"^(river|canal|stream)$"](${bbox});
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|living_street|unclassified|pedestrian|service|footway|path|cycleway|motorway_link|primary_link|secondary_link)$"](${bbox});
  way["railway"~"^(rail|light_rail|tram|subway)$"](${bbox});
  node["natural"="tree"](${bbox});
);
out body geom;`;
}

// ---------------------------------------------------------------------------
// Fetch with endpoint fallback + local cache
// ---------------------------------------------------------------------------
export async function loadOSM({ area, onStatus = () => {}, force = false }) {
  const cacheKey = CACHE_PREFIX + area.id;
  if (!force) {
    const cached = readCache(cacheKey);
    if (cached) {
      onStatus(`Loaded ${area.name} from local cache`);
      return { elements: cached, source: 'cache' };
    }
  }

  const query = buildQuery(area.bbox);
  let lastError = null;

  for (let i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
    const endpoint = OVERPASS_ENDPOINTS[i];
    const host = new URL(endpoint).host;
    onStatus(`Querying OpenStreetMap (${host})…`);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 55000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const elements = json.elements || [];
      if (elements.length === 0) throw new Error('empty response');
      onStatus(`Received ${elements.length.toLocaleString()} map elements`);
      writeCache(cacheKey, elements);
      return { elements, source: 'live' };
    } catch (err) {
      lastError = err;
      onStatus(`Endpoint failed (${host}); trying another…`);
    }
  }

  throw lastError || new Error('All Overpass endpoints failed');
}

function readCache(cacheKey) {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const { ts, elements } = JSON.parse(raw);
    if (!elements || Date.now() - ts > CACHE_TTL_MS) return null;
    return elements;
  } catch {
    return null;
  }
}

function writeCache(cacheKey, elements) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), elements }));
  } catch {
    // localStorage may be full or unavailable — non-fatal.
  }
}

// ---------------------------------------------------------------------------
// Parse raw Overpass elements into typed features
// ---------------------------------------------------------------------------
export function parseElements(elements) {
  const buildings = [];
  const areas = []; // { rings, tags, category }
  const roads = []; // { pts, tags }
  const waterways = []; // { pts, tags }
  const trees = []; // { x, z, tags } after projection happens later; keep lon/lat

  for (const el of elements) {
    const tags = el.tags || {};

    if (el.type === 'node') {
      if (tags.natural === 'tree') trees.push({ lon: el.lon, lat: el.lat, tags });
      continue;
    }

    if (el.type === 'way') {
      if (tags.highway) {
        if (el.geometry && el.geometry.length >= 2) roads.push({ pts: el.geometry, tags });
        continue;
      }
      if (tags.railway) {
        if (el.geometry && el.geometry.length >= 2) roads.push({ pts: el.geometry, tags, rail: true });
        continue;
      }
      if (isLinearWater(tags) && !isAreaWater(tags)) {
        if (el.geometry && el.geometry.length >= 2) waterways.push({ pts: el.geometry, tags });
        continue;
      }
      // Area-like way.
      if (!el.geometry || el.geometry.length < 3) continue;
      const ring = closeRing(el.geometry);
      if (tags.building || tags['building:part']) {
        buildings.push({ rings: [ring], tags, id: el.id });
      } else {
        const category = classifyArea(tags);
        if (category) areas.push({ rings: [ring], tags, category });
      }
      continue;
    }

    if (el.type === 'relation') {
      const features = assembleMultipolygon(el);
      const isBuilding = !!(tags.building || tags['building:part']);
      const category = classifyArea(tags);
      for (const f of features) {
        if (isBuilding) buildings.push({ rings: f, tags, id: el.id });
        else if (category) areas.push({ rings: f, tags, category });
      }
    }
  }

  return { buildings, areas, roads, waterways, trees };
}

function isLinearWater(tags) {
  return tags.waterway === 'river' || tags.waterway === 'canal' || tags.waterway === 'stream';
}
function isAreaWater(tags) {
  return tags.waterway === 'riverbank' || tags.natural === 'water' || !!tags.water;
}

export function classifyArea(tags) {
  if (tags.waterway === 'riverbank' || tags.natural === 'water' || tags.water || tags.landuse === 'reservoir') {
    return 'water';
  }
  if (tags.natural === 'wetland') return 'grass';
  if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.leisure === 'common' || tags.leisure === 'dog_park') {
    return 'park';
  }
  if (tags.leisure === 'pitch' || tags.leisure === 'golf_course') return 'pitch';
  if (tags.leisure === 'playground' || tags.leisure === 'recreation_ground') return 'park';
  if (tags.landuse === 'forest' || tags.natural === 'wood') return 'forest';
  if (tags.landuse === 'cemetery' || tags.amenity === 'grave_yard') return 'cemetery';
  if (
    tags.landuse === 'grass' ||
    tags.landuse === 'meadow' ||
    tags.landuse === 'village_green' ||
    tags.landuse === 'recreation_ground' ||
    tags.landuse === 'allotments' ||
    tags.natural === 'grassland' ||
    tags.natural === 'scrub' ||
    tags.natural === 'heath'
  ) {
    return 'grass';
  }
  return null;
}

// Ensure a ring's first and last points coincide.
function closeRing(geometry) {
  const ring = geometry.map((p) => ({ lon: p.lon, lat: p.lat }));
  const a = ring[0];
  const b = ring[ring.length - 1];
  if (a.lon !== b.lon || a.lat !== b.lat) ring.push({ lon: a.lon, lat: a.lat });
  return ring;
}

// ---------------------------------------------------------------------------
// Multipolygon assembly: stitch member segments into rings, then match inner
// rings (holes) to the outer ring that contains them.
// ---------------------------------------------------------------------------
const EPS = 1e-7;

function assembleMultipolygon(rel) {
  if (!rel.members) return [];
  const outerSegs = [];
  const innerSegs = [];
  for (const m of rel.members) {
    if (m.type !== 'way' || !m.geometry || m.geometry.length < 2) continue;
    const seg = m.geometry.map((p) => ({ lon: p.lon, lat: p.lat }));
    if (m.role === 'inner') innerSegs.push(seg);
    else outerSegs.push(seg); // treat "outer" and unspecified roles as outer
  }
  const outers = stitch(outerSegs);
  const inners = stitch(innerSegs);

  // Match each inner ring to the smallest containing outer ring.
  const features = outers.map((o) => [o]);
  for (const inner of inners) {
    const test = inner[0];
    let bestIdx = -1;
    let bestArea = Infinity;
    for (let i = 0; i < outers.length; i++) {
      if (pointInLonLatRing(test, outers[i])) {
        const a = Math.abs(lonLatRingArea(outers[i]));
        if (a < bestArea) {
          bestArea = a;
          bestIdx = i;
        }
      }
    }
    if (bestIdx >= 0) features[bestIdx].push(inner);
  }
  return features;
}

// Greedily join segments that share endpoints into closed rings.
function stitch(segments) {
  const rings = [];
  const pool = segments.map((s) => s.slice());
  while (pool.length) {
    let ring = pool.shift();
    let extended = true;
    while (extended && !ringClosed(ring)) {
      extended = false;
      const end = ring[ring.length - 1];
      for (let i = 0; i < pool.length; i++) {
        const seg = pool[i];
        if (near(end, seg[0])) {
          ring = ring.concat(seg.slice(1));
          pool.splice(i, 1);
          extended = true;
          break;
        }
        if (near(end, seg[seg.length - 1])) {
          ring = ring.concat(seg.slice().reverse().slice(1));
          pool.splice(i, 1);
          extended = true;
          break;
        }
      }
    }
    if (ring.length >= 4) {
      if (!ringClosed(ring)) ring.push({ ...ring[0] });
      rings.push(ring);
    }
  }
  return rings;
}

function near(a, b) {
  return Math.abs(a.lon - b.lon) < EPS && Math.abs(a.lat - b.lat) < EPS;
}
function ringClosed(ring) {
  return ring.length >= 4 && near(ring[0], ring[ring.length - 1]);
}
function lonLatRingArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) {
    a += ring[i].lon * ring[i + 1].lat - ring[i + 1].lon * ring[i].lat;
  }
  return a / 2;
}
function pointInLonLatRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lon;
    const yi = ring[i].lat;
    const xj = ring[j].lon;
    const yj = ring[j].lat;
    const intersect = yi > pt.lat !== yj > pt.lat && pt.lon < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

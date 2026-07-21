// Generic camera viewpoints usable for any area (positions/targets in local
// metres, relative to the area's own centre — see geo/projection).
const GENERIC_PRESETS = [
  { name: 'Overview', target: [0, 0, 0], pos: [520, 600, 700] },
  { name: 'Close-up', target: [0, 0, 0], pos: [150, 150, 210] },
  { name: 'Aerial', target: [0, 0, 0], pos: [40, 1450, 60] },
];

// The selectable areas. Each is centred on a real point and loads its own
// bounding box from OpenStreetMap. The city centre keeps its landmark
// viewpoints; the two boroughs use generic ones.
export const AREAS = [
  {
    id: 'altstadt',
    name: 'City centre',
    blurb: 'Altstadt · Marktplatz · Weser',
    // Marktplatz, in front of the Town Hall and the Roland statue.
    center: { lat: 53.07583, lon: 8.80717 },
    bbox: { south: 53.0650, west: 8.7860, north: 53.0885, east: 8.8280 },
    presets: [
      { name: 'Overview', target: [0, 0, 0], pos: [520, 620, 720] },
      { name: 'Marktplatz', target: [0, 0, 0], pos: [90, 120, 150] },
      { name: 'Weser river', target: [-60, 0, 320], pos: [-60, 150, 640] },
      { name: 'Cathedral', target: [70, 20, 40], pos: [180, 130, 200] },
      { name: 'Bürgerpark', target: [-350, 0, -1050], pos: [-350, 260, -560] },
      { name: 'Schnoor', target: [230, 0, 210], pos: [320, 90, 380] },
      { name: 'Aerial', target: [0, 0, 0], pos: [40, 1500, 60] },
    ],
  },
  {
    id: 'oberneuland',
    name: 'Oberneuland',
    blurb: 'Leafy eastern borough · villas & ponds',
    // Around the Oberneulander Landstraße / village core.
    center: { lat: 53.0899, lon: 8.9369 },
    bbox: { south: 53.0784, west: 8.9174, north: 53.1014, east: 8.9564 },
    presets: GENERIC_PRESETS,
  },
  {
    id: 'horn',
    name: 'Horn',
    blurb: 'Horn-Lehe · Rhododendronpark · university',
    // Horner Heerstraße corridor, just west of the Rhododendron-Park.
    center: { lat: 53.0935, lon: 8.8770 },
    bbox: { south: 53.0820, west: 8.8575, north: 53.1050, east: 8.8965 },
    presets: GENERIC_PRESETS,
  },
];

export const DEFAULT_AREA_ID = 'altstadt';

export function getArea(id) {
  return AREAS.find((a) => a.id === id) || AREAS[0];
}

// Fallback centre used to initialise the projection before an area is chosen.
export const DEFAULT_CENTER = AREAS[0].center;

// Public Overpass API endpoints. Tried in order; the first that answers wins.
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// Cache key prefix (per area) + how long a cached download stays fresh (7 days).
export const CACHE_PREFIX = 'bremen3d.osm.v3.';
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Colour palette for the different kinds of geometry.
export const COLORS = {
  sky: 0x9fc4e8,
  ground: 0x55604a,
  fog: 0xbcd3ea,

  water: 0x3d82ad,
  waterDeep: 0x1b4965,

  park: 0x4f7c3a,
  grass: 0x5f8f45,
  forest: 0x36612b,
  cemetery: 0x546b3d,
  pitch: 0x3f7d55,

  road: 0x3a3f47,
  roadMajor: 0x4a4f57,
  footway: 0x6b5d4f,
  rail: 0x555a63,

  roof: 0x8a4b3c,

  // Building tints, chosen to evoke Bremen's red-brick and sandstone palette.
  buildingLow: 0xcaa889,
  buildingMid: 0xb98d6f,
  buildingHigh: 0x9c8f86,
  house: 0xcf9f78,
  brick: 0xa14e3a,
  commercial: 0x9aa1ac,
  industrial: 0x8b8f96,
  church: 0xd9cdb6,
  landmark: 0xe4d9c2,
};

// Assumed metres per building level and sensible default heights (metres) by
// building type, used when OSM has no explicit height / level tag.
export const LEVEL_HEIGHT = 3.2;
export const DEFAULT_HEIGHTS = {
  house: 8,
  detached: 8,
  residential: 14,
  apartments: 17,
  commercial: 16,
  retail: 12,
  office: 24,
  industrial: 11,
  warehouse: 11,
  church: 22,
  cathedral: 40,
  chapel: 12,
  hospital: 22,
  hotel: 24,
  school: 12,
  university: 18,
  public: 16,
  civic: 16,
  train_station: 20,
  garage: 4,
  hut: 4,
  roof: 5,
  _default: 12,
};

// Build a bounding box (south/west/north/east) around a centre, given a
// half-size in kilometres.
function box(lat, lon, halfKm = 1.35) {
  const dLat = halfKm / 111.32;
  const dLon = halfKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { south: lat - dLat, west: lon - dLon, north: lat + dLat, east: lon + dLon };
}

// Generic camera viewpoints, scaled to the area's size (positions/targets in
// local metres, relative to the area's own centre — see geo/projection).
function genericPresets(halfKm = 1.35) {
  const d = halfKm * 1000;
  return [
    { name: 'Overview', target: [0, 0, 0], pos: [d * 0.4, d * 0.5, d * 0.62] },
    { name: 'Close-up', target: [0, 0, 0], pos: [140, 150, 205] },
    { name: 'Aerial', target: [0, 0, 0], pos: [30, d * 1.15, 45] },
  ];
}

// Compact constructor for a borough with generic viewpoints.
function borough(id, name, blurb, lat, lon, halfKm = 1.35) {
  return { id, name, blurb, center: { lat, lon }, bbox: box(lat, lon, halfKm), presets: genericPresets(halfKm) };
}

// The 23 official Stadtteile (boroughs) of Bremen. Each is centred on a real
// point and loads its own bounding box from OpenStreetMap. The city centre
// (Mitte) keeps its hand-tuned landmark viewpoints; the rest use generic ones.
// Coordinates come from public sources and are anchored on each borough's core.
export const AREAS = [
  {
    id: 'altstadt',
    name: 'City centre',
    blurb: 'Mitte · Altstadt · Marktplatz',
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
  // Right bank — inner east
  borough('oestliche-vorstadt', 'Östliche Vorstadt', 'Das Viertel · Ostertor & Steintor', 53.0702, 8.8410, 1.2),
  borough('schwachhausen', 'Schwachhausen', 'Grand avenues and villas', 53.0925, 8.8400, 1.5),
  borough('findorff', 'Findorff', 'Beside the Bürgerpark', 53.0900, 8.8050, 1.3),
  borough('vahr', 'Vahr', '1950s modernist estates', 53.0787, 8.8776, 1.35),
  {
    id: 'horn',
    name: 'Horn-Lehe',
    blurb: 'Rhododendron-Park & the university',
    center: { lat: 53.0935, lon: 8.8770 },
    bbox: { south: 53.0820, west: 8.8575, north: 53.1050, east: 8.8965 },
    presets: genericPresets(1.35),
  },
  {
    id: 'oberneuland',
    name: 'Oberneuland',
    blurb: 'Leafy villas and ponds',
    center: { lat: 53.0899, lon: 8.9369 },
    bbox: { south: 53.0784, west: 8.9174, north: 53.1014, east: 8.9564 },
    presets: genericPresets(1.35),
  },
  borough('borgfeld', 'Borgfeld', 'Village edge by the Wümme', 53.1261, 8.9069, 1.5),
  borough('osterholz', 'Osterholz', 'Weserpark & Tenever', 53.0660, 8.9350, 1.6),
  borough('hemelingen', 'Hemelingen', 'Industry along the Weser', 53.0560, 8.9020, 1.6),
  // Right bank — north-west
  borough('walle', 'Walle', 'Überseestadt & Waller Heerstraße', 53.0985, 8.7850, 1.5),
  borough('groepelingen', 'Gröpelingen', 'Port and shipyard heritage', 53.1261, 8.7464, 1.5),
  borough('haefen', 'Häfen', 'The working harbours', 53.1170, 8.7560, 1.7),
  borough('burglesum', 'Burglesum', 'Lesum & the Weser confluence', 53.1611, 8.6917, 1.7),
  borough('vegesack', 'Vegesack', 'Historic harbour town, north', 53.1792, 8.6222, 1.6),
  borough('blumenthal', 'Blumenthal', 'The northern tip', 53.1818, 8.5726, 1.7),
  borough('blockland', 'Blockland', 'Rural marsh and meadows', 53.1440, 8.8060, 1.8),
  // Left bank — south and west
  borough('neustadt', 'Neustadt', 'Left bank of the Weser', 53.0700, 8.7970, 1.4),
  borough('obervieland', 'Obervieland', 'Kattenturm · Arsten · Habenhausen', 53.0450, 8.8220, 1.6),
  borough('huchting', 'Huchting', 'South-west, by the Ochtum', 53.0520, 8.7423, 1.6),
  borough('woltmershausen', 'Woltmershausen', 'Weser peninsula · Rablinghausen', 53.0800, 8.7700, 1.5),
  borough('seehausen', 'Seehausen', 'Rural west, by the port', 53.1080, 8.6980, 1.6),
  borough('strom', 'Strom', 'Dike village on the Weser', 53.1030, 8.7150, 1.5),
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

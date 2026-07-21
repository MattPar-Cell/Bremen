import { unproject } from './projection.js';

// ---------------------------------------------------------------------------
// Procedural offline fallback: a stylised model of Bremen's Altstadt so the
// app is never a blank screen when OpenStreetMap can't be reached. It is not
// geographically exact — it evokes the city: the Weser river, the ring of the
// Wallanlagen park along the former ramparts, the Marktplatz with the Town
// Hall, Cathedral and Roland, blocks of gabled Hanseatic townhouses, the tiny
// houses of the Schnoor, and the Bürgerpark to the north.
//
// Everything is authored in local metres (origin = Marktplatz) and converted
// back to lon/lat so it is consumed by exactly the same builders as live data.
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ll = (x, z) => unproject(x, z);

// Rotated rectangle footprint centred at (cx, cz).
function rect(cx, cz, w, d, rot = 0) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const hw = w / 2;
  const hd = d / 2;
  const corners = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  const ring = corners.map(([x, z]) => ll(cx + x * c - z * s, cz + x * s + z * c));
  ring.push({ ...ring[0] });
  return ring;
}

function poly(points) {
  const ring = points.map(([x, z]) => ll(x, z));
  ring.push({ ...ring[0] });
  return ring;
}

export function buildFallback() {
  const rand = mulberry32(20250721);
  const buildings = [];
  const areas = [];
  const roads = [];
  const waterways = [];
  const trees = [];

  const addHouse = (cx, cz, w, d, rot, height, opts = {}) => {
    const tags = {
      building: opts.building || 'house',
      'roof:shape': opts.flat ? 'flat' : 'gabled',
      height: String(height),
      ...(opts.name ? { name: opts.name } : {}),
    };
    const b = { rings: [rect(cx, cz, w, d, rot)], tags, id: buildings.length + 1 };
    if (!opts.flat) {
      b._roof = { cx, cz, w, d, rot, wallHeight: height, ridgeRise: opts.ridge ?? Math.min(w, d) * 0.5 };
    }
    buildings.push(b);
    return b;
  };

  // --- Weser river: a gently curved band south of the Altstadt ------------
  {
    const top = [];
    const bottom = [];
    const halfW = 75;
    for (let x = -1500; x <= 1500; x += 60) {
      const cz = 360 + Math.sin((x + 400) / 900) * 90 + x * 0.05;
      top.push([x, cz - halfW]);
      bottom.push([x, cz + halfW]);
    }
    areas.push({ rings: [poly([...top, ...bottom.reverse()])], tags: { natural: 'water', name: 'Weser' }, category: 'water' });
  }

  // --- Wallanlagen: green ring along the former ramparts ------------------
  {
    const outer = [];
    const inner = [];
    // Semicircular ring open to the south (toward the river).
    for (let a = -0.15; a <= Math.PI + 0.15; a += 0.08) {
      const ang = Math.PI - a; // sweep across the top
      const rx = 470;
      const rz = 360;
      const ox = Math.cos(ang) * rx;
      const oz = -Math.sin(ang) * rz + 120;
      outer.push([ox, oz]);
    }
    for (let a = Math.PI + 0.15; a >= -0.15; a -= 0.08) {
      const ang = Math.PI - a;
      const rx = 390;
      const rz = 285;
      const ix = Math.cos(ang) * rx;
      const iz = -Math.sin(ang) * rz + 120;
      inner.push([ix, iz]);
    }
    areas.push({
      rings: [poly([...outer, ...inner])],
      tags: { leisure: 'park', name: 'Wallanlagen' },
      category: 'park',
    });
    // Trees along the ring.
    for (let a = -0.1; a <= Math.PI + 0.1; a += 0.05) {
      const ang = Math.PI - a;
      const r = 425 + (rand() - 0.5) * 40;
      const rz = 322;
      trees.push({ ...ll(Math.cos(ang) * r, -Math.sin(ang) * rz + 120), tags: {} });
    }
  }

  // --- Bürgerpark: large green space to the north ------------------------
  {
    areas.push({
      rings: [poly([
        [-750, -1500], [250, -1550], [420, -1080], [180, -760],
        [-380, -720], [-780, -900], [-880, -1200],
      ])],
      tags: { leisure: 'park', name: 'Bürgerpark' },
      category: 'park',
    });
    for (let i = 0; i < 260; i++) {
      const x = -800 + rand() * 1180;
      const z = -1520 + rand() * 780;
      // rough containment check against the park's bounding shape
      if (z < -760 - Math.abs(x + 250) * 0.15) trees.push({ ...ll(x, z), tags: {} });
    }
    // A small lake (Emmasee) in the park.
    areas.push({
      rings: [poly([
        [-260, -1120], [-120, -1150], [-40, -1080], [-90, -1000],
        [-220, -990], [-300, -1050],
      ])],
      tags: { natural: 'water', name: 'Emmasee' },
      category: 'water',
    });
  }

  // --- Marktplatz landmarks ----------------------------------------------
  // Roland statue — slender, tall, in front of the Town Hall.
  addHouse(-8, 18, 4, 4, 0, 10, { building: 'monument', flat: true, name: 'Roland' });
  // Town Hall (Rathaus) — long façade on the north side of the square.
  addHouse(0, -45, 95, 32, 0, 28, { building: 'civic', name: 'Bremer Rathaus', ridge: 12 });
  // Cathedral (St.-Petri-Dom) with two towers, north-east of the square.
  addHouse(95, -55, 66, 30, 0, 24, { building: 'cathedral', name: 'St.-Petri-Dom', ridge: 16 });
  addHouse(70, -72, 14, 14, 0, 62, { building: 'cathedral', flat: true, name: 'Dom — Nordturm' });
  addHouse(92, -72, 14, 14, 0, 62, { building: 'cathedral', flat: true, name: 'Dom — Südturm' });
  // Parliament (Bürgerschaft) — low modern block, south-east corner.
  addHouse(70, -8, 44, 24, 0, 15, { building: 'public', flat: true, name: 'Bremische Bürgerschaft' });
  // Schütting (merchants' guild house) — south side of the square.
  addHouse(-6, 30, 46, 22, 0, 20, { building: 'commercial', name: 'Schütting' });
  // Town Musicians of Bremen — small bronze marker by the Town Hall.
  addHouse(-46, -30, 3, 3, 0, 5, { building: 'monument', flat: true, name: 'Bremer Stadtmusikanten' });

  // --- Böttcherstraße: brick-expressionist lane toward the river ---------
  for (let i = 0; i < 7; i++) {
    const z = 60 + i * 18;
    addHouse(-70, z, 20, 15, 0, 16 + (i % 2) * 4, { building: 'apartments' });
    addHouse(-40, z, 20, 15, 0, 15 + (i % 2) * 5, { building: 'apartments' });
  }
  roads.push({ pts: linePts([[-55, 45], [-55, 200]]), tags: { highway: 'pedestrian', name: 'Böttcherstraße' } });

  // --- Schnoor: cluster of tiny gabled houses near the river -------------
  {
    const ox = 210;
    const oz = 165;
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 7; c++) {
        if (rand() < 0.18) continue;
        const x = ox + c * 15 + (rand() - 0.5) * 4;
        const z = oz + r * 13 + (rand() - 0.5) * 4;
        addHouse(x, z, 8 + rand() * 3, 8 + rand() * 3, (rand() - 0.5) * 0.3, 7 + rand() * 4, {
          building: 'house',
          ridge: 4,
        });
      }
    }
  }

  // --- Blocks of gabled townhouses filling the Altstadt ------------------
  const isBlocked = (x, z) => {
    // keep clear of the square, the river band and the ring's outside
    if (Math.abs(x) < 90 && z > -95 && z < 55) return true; // Marktplatz core
    const riverZ = 360 + Math.sin((x + 400) / 900) * 90 + x * 0.05;
    if (z > riverZ - 120) return true; // river + quay
    const rr = Math.hypot(x / 470, (z - 120) / 360);
    if (rr > 0.98) return true; // outside the ring
    if (x > 190 && x < 320 && z > 150 && z < 250) return true; // Schnoor area
    return false;
  };

  const palette = ['house', 'apartments', 'residential', 'retail'];
  const streetStep = 46;
  for (let gx = -440; gx <= 440; gx += streetStep) {
    for (let gz = -260; gz <= 340; gz += streetStep) {
      // per-block jitter so the old town reads as organic, not a US grid
      const bx = gx + (rand() - 0.5) * 8;
      const bz = gz + (rand() - 0.5) * 8;
      const rot = (rand() - 0.5) * 0.25 + (gx < 0 ? 0.05 : -0.05);
      // Fill each block edge with a row of narrow houses.
      const along = streetStep - 8;
      let offset = -along / 2;
      while (offset < along / 2) {
        const w = 6 + rand() * 6;
        const cx = bx + offset + w / 2;
        const cz = bz + (rand() - 0.5) * 6;
        offset += w + 0.6;
        if (isBlocked(cx, cz)) continue;
        const depth = 9 + rand() * 6;
        const h = 11 + rand() * 9;
        const type = palette[(rand() * palette.length) | 0];
        addHouse(cx, cz, w, depth, rot, h, { building: type, ridge: Math.min(w, depth) * 0.55 });
      }
    }
  }

  // --- A few named streets ------------------------------------------------
  roads.push({ pts: linePts([[-380, 30], [380, 10]]), tags: { highway: 'secondary', name: 'Am Wall' } });
  roads.push({ pts: linePts([[-10, -260], [-30, 250]]), tags: { highway: 'residential', name: 'Sögestraße' } });
  roads.push({ pts: linePts([[-440, 120], [440, 140]]), tags: { highway: 'primary', name: 'Martinistraße' } });
  roads.push({ pts: linePts([[120, -260], [150, 250]]), tags: { highway: 'residential', name: 'Ostertorstraße' } });

  return { buildings, areas, roads, waterways, trees };
}

function linePts(points) {
  return points.map(([x, z]) => ll(x, z));
}

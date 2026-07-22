import { COLORS } from '../config.js';

const LAYER_DEFS = [
  { key: 'buildings', label: 'Buildings', color: COLORS.house },
  { key: 'roads', label: 'Roads & rails', color: COLORS.roadMajor },
  { key: 'green', label: 'Parks & greenery', color: COLORS.park },
  { key: 'water', label: 'Water', color: COLORS.water },
  { key: 'trees', label: 'Trees', color: 0x3c7a34 },
];

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export class UI {
  constructor(viewer, opts = {}) {
    this.viewer = viewer;
    this.onReload = opts.onReload || (() => {});
    this.onInfoClose = opts.onInfoClose || (() => {});
    this.onAreaChange = opts.onAreaChange || (() => {});
    this.onPreset = opts.onPreset || (() => {});
    this.onLoadCity = opts.onLoadCity || (() => {});
    this.onReset = opts.onReset || (() => {});

    this._buildAreas(opts.areas || [], opts.currentAreaId);
    this._buildLayers();
    this._wireTime();
    this._wireOptions();
    this._wireInfoCard();
    this._wireReload();
    this._wireCityButtons();
    this._wirePanelToggle();
    this._wireHint();
  }

  // ---- areas (boroughs) ------------------------------------------------
  _buildAreas(areas, currentAreaId) {
    const host = document.getElementById('areas');
    if (!host) return;
    const count = document.getElementById('area-count');
    if (count) count.textContent = `${areas.length} areas`;
    this._areaButtons = {};
    for (const a of areas) {
      const b = document.createElement('button');
      b.className = 'chip chip--area' + (a.id === currentAreaId ? ' active' : '');
      b.textContent = a.name;
      b.title = a.blurb || a.name;
      b.addEventListener('click', () => this.onAreaChange(a.id));
      host.appendChild(b);
      this._areaButtons[a.id] = b;
    }
  }

  // The borough the camera is currently focused on.
  setFocusArea(id) {
    if (!this._areaButtons) return;
    for (const [aid, btn] of Object.entries(this._areaButtons)) {
      btn.classList.toggle('active', aid === id);
    }
  }

  // Boroughs whose data is currently in the scene.
  setLoadedAreas(ids) {
    if (!this._areaButtons) return;
    const set = new Set(ids);
    for (const [aid, btn] of Object.entries(this._areaButtons)) {
      btn.classList.toggle('loaded', set.has(aid));
    }
  }

  // ---- presets ---------------------------------------------------------
  setPresets(presets) {
    const host = document.getElementById('presets');
    host.innerHTML = '';
    for (const p of presets) {
      const b = document.createElement('button');
      b.className = 'chip' + (p.fit ? ' chip--wide' : '');
      b.textContent = p.name;
      b.addEventListener('click', () => this.onPreset(p));
      host.appendChild(b);
    }
  }

  // ---- layer toggles ---------------------------------------------------
  _buildLayers() {
    const host = document.getElementById('layer-toggles');
    for (const def of LAYER_DEFS) {
      const label = document.createElement('label');
      label.className = 'switch';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = true;
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = hex(def.color);
      const text = document.createElement('span');
      text.textContent = def.label;
      label.append(input, dot, text);
      input.addEventListener('change', () => {
        this.viewer.setLayerVisible(def.key, input.checked);
      });
      host.appendChild(label);
    }
  }

  // ---- time of day -----------------------------------------------------
  _wireTime() {
    const slider = document.getElementById('time');
    const label = document.getElementById('time-val');
    const update = () => {
      const h = parseFloat(slider.value);
      this.viewer.setTime(h);
      label.textContent = formatTime(h);
    };
    slider.addEventListener('input', update);
    update();
  }

  // ---- display options -------------------------------------------------
  _wireOptions() {
    const bind = (id, fn) => {
      const el = document.getElementById(id);
      el.addEventListener('change', () => fn(el.checked));
    };
    bind('opt-shadows', (v) => this.viewer.setShadows(v));
    bind('opt-fog', (v) => this.viewer.setFog(v));
    bind('opt-wire', (v) => this.viewer.setWireframe(v));
    bind('opt-rotate', (v) => this.viewer.setAutoRotate(v));
  }

  // ---- reload ----------------------------------------------------------
  _wireReload() {
    const btn = document.getElementById('reload');
    btn.addEventListener('click', () => this.onReload());
    this._reloadBtn = btn;
  }

  setReloadEnabled(on) {
    if (this._reloadBtn) this._reloadBtn.disabled = !on;
  }

  // ---- whole-city actions ---------------------------------------------
  _wireCityButtons() {
    const load = document.getElementById('load-city');
    const reset = document.getElementById('reset-city');
    if (load) load.addEventListener('click', () => this.onLoadCity());
    if (reset) reset.addEventListener('click', () => this.onReset());
  }

  // ---- info card -------------------------------------------------------
  _wireInfoCard() {
    this._card = document.getElementById('infocard');
    this._cardName = document.getElementById('infocard-name');
    this._cardList = document.getElementById('infocard-list');
    document.getElementById('infocard-close').addEventListener('click', () => {
      this.hideFeature();
      this.onInfoClose();
    });
  }

  showFeature(feature) {
    if (!feature) return this.hideFeature();
    this._cardName.textContent = feature.name || feature.category || 'Building';
    const rows = [];
    if (feature.category) rows.push(['Type', feature.category]);
    if (feature.height) rows.push(['Height', `≈ ${feature.height} m`]);
    const t = feature.tags || {};
    if (t['building:levels']) rows.push(['Floors', t['building:levels']]);
    if (t['addr:street']) {
      rows.push(['Address', `${t['addr:street']} ${t['addr:housenumber'] || ''}`.trim()]);
    }
    if (t.amenity) rows.push(['Amenity', pretty(t.amenity)]);
    if (t.tourism) rows.push(['Tourism', pretty(t.tourism)]);
    this._cardList.innerHTML = rows
      .map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`)
      .join('');
    this._card.hidden = false;
  }

  hideFeature() {
    this._card.hidden = true;
  }

  // ---- stats + source --------------------------------------------------
  setStats(stats) {
    const host = document.getElementById('stats');
    const items = [
      ['Buildings', stats.buildings],
      ['Green areas', stats.green],
      ['Water', stats.water],
      ['Roads', stats.roads],
      ['Trees', stats.trees],
    ];
    host.innerHTML = items
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `<div class="stat"><b>${n.toLocaleString()}</b> <span>${k}</span></div>`)
      .join('');
  }

  setSource(text, note) {
    document.getElementById('datasource').textContent = text;
    if (note) document.getElementById('area-note').textContent = note;
  }

  // ---- misc chrome -----------------------------------------------------
  _wirePanelToggle() {
    const panel = document.getElementById('panel');
    document.getElementById('panel-toggle').addEventListener('click', () => {
      panel.classList.toggle('open');
    });
  }

  _wireHint() {
    const hint = document.getElementById('hint');
    let faded = false;
    const fade = () => {
      if (faded) return;
      faded = true;
      hint.classList.add('faded');
    };
    setTimeout(fade, 8000);
    this.viewer.renderer.domElement.addEventListener('pointerdown', fade, { once: true });
  }
}

function formatTime(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function pretty(s) {
  return String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

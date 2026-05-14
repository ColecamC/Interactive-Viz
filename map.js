// ── CONSTANTS ──────────────────────────────────────────────────────────────
const CA_BOUNDS = { lonMin: -124.48, lonMax: -114.13, latMin: 32.53, latMax: 42.01 };

const DATES = Array.from({ length: 89 }, (_, i) => {
  const start = new Date(2020, 7, 16);
  const d = new Date(start);
  d.setDate(start.getDate() + i);
  return d.toISOString().slice(0, 10);
});

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const SPEEDS = [
  { label: '1×', ms: 800 },
  { label: '2×', ms: 400 },
  { label: '4×', ms: 200 },
];
let speedIndex = 0;

// ── SMOKE / AEROSOL OVERLAY OPACITY (slider 0–100% → whole CA tile stack only) ─
let aerosolUserFactor = 1;

function effectiveAerosolGroupOpacity() {
  return aerosolUserFactor;
}

// ── SVG SETUP ──────────────────────────────────────────────────────────────
const svg = d3.select('#map-svg');
const navEl = document.getElementById('site-nav');
const navH = navEl ? navEl.getBoundingClientRect().height : 0;
const width  = window.innerWidth - 380;
const height = window.innerHeight - navH;
svg.attr('width', width).attr('height', height);

const projection = d3.geoMercator()
  .center([-121, 39.5])
  .scale(2800)
  .translate([width / 2, height / 2]);

const path = d3.geoPath().projection(projection);
const g = svg.append('g');

/** Circle DOM node for the selected settlement — used to position the mini WMS popover in screen space */
let selectedSettlementCircle = null;

function updateMiniMapPosition() {
  const pop = document.getElementById('mini-wms-popover');
  if (!pop || pop.style.display === 'none' || !selectedSettlementCircle) return;

  const mapArea = document.getElementById('map-area');
  const rect = selectedSettlementCircle.getBoundingClientRect();
  const mar = mapArea.getBoundingClientRect();
  const pad = 12;
  const popW = 220;
  let left = rect.right - mar.left + pad;
  let top = rect.top - mar.top;

  if (left + popW > mar.width - 8) left = rect.left - mar.left - popW - pad;
  left = Math.max(8, Math.min(left, mar.width - popW - 8));
  top = Math.max(8, Math.min(top, mar.height - 228));

  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}

const zoom = d3.zoom()
  .scaleExtent([1, 20])
  .on('zoom', ({ transform }) => {
    g.attr('transform', transform);
    updateMiniMapPosition();
  });
svg.call(zoom);

window.addEventListener('resize', () => {
  updateMiniMapPosition();
});

// ── WMS HELPER ─────────────────────────────────────────────────────────────
const WMS_BASE = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?';

/** MODIS Combined MAIAC L2G AOD (MCD19A2 family) — NASA GIBS EPSG:4326 “best” WMS */
const GIBS_AEROSOL_LAYER = 'MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth';
/** Same lon/lat window as the shaded-relief basemap (California view) */
const GIBS_CA_BBOX = '-125,32,-114,42';
let aerosolWmsWidth = 512;
let aerosolWmsHeight = 512;

function buildGibsMaiacAodUrl(dateStr) {
  const p = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetMap',
    VERSION: '1.1.1',
    LAYERS: GIBS_AEROSOL_LAYER,
    STYLES: '',
    SRS: 'EPSG:4326',
    BBOX: GIBS_CA_BBOX,
    WIDTH: String(aerosolWmsWidth),
    HEIGHT: String(aerosolWmsHeight),
    FORMAT: 'image/png',
    TRANSPARENT: 'TRUE',
    TIME: dateStr,
  });
  return WMS_BASE + p.toString();
}

function getWMSUrl(layer, lat, lon, bufferDeg, extraParams = {}) {
  const bbox = `${lon - bufferDeg},${lat - bufferDeg},${lon + bufferDeg},${lat + bufferDeg}`;
  const p = new URLSearchParams({
    SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.1.1',
    LAYERS: layer, SRS: 'EPSG:4326', BBOX: bbox,
    WIDTH: 350, HEIGHT: 350,
    FORMAT: 'image/png', TRANSPARENT: 'TRUE',
    ...extraParams
  });
  return WMS_BASE + p;
}

// ── CLIP PATH ───────────────────────────────────────────────────────────────
function setupCaliforniaClip(california) {
  svg.append('defs')
    .append('clipPath')
    .attr('id', 'california-clip')
    .append('path')
    .datum({ type: 'FeatureCollection', features: california.features })
    .attr('d', path);
}

// ── ELEVATION BASEMAP ───────────────────────────────────────────────────────
function drawElevationBasemap() {
  const [x0, y1] = projection([-125, 32]);
  const [x1, y0] = projection([-114, 42]);
  const w = Math.round(x1 - x0);
  const h = Math.round(y1 - y0);

  const src = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer/export?' +
    new URLSearchParams({
      bbox: '-125,32,-114,42',
      bboxSR: '4326',
      imageSR: '4326',
      size: `${w},${h}`,
      format: 'png',
      transparent: 'false',
      f: 'image',
    });

  g.insert('image', ':first-child')
    .attr('x', x0).attr('y', y0)
    .attr('width', w)
    .attr('height', h)
    .attr('preserveAspectRatio', 'none')
    .attr('xlink:href', src)
    .attr('clip-path', 'url(#california-clip)')
    .style('filter', 'hue-rotate(60deg) saturate(0.4) brightness(0.7)')
    .style('opacity', 0.85);
}

// ── AEROSOL TILE LAYER (group opacity = smoke slider; tiles swap at 0/1 for date) ─
let aerosolGroup = null;
let tileA = null;
let tileB = null;
let activeTile = 'A';

function initAerosolLayer() {
  const [x0, y1] = projection([-125, 32]);
  const [x1, y0] = projection([-114, 42]);
  const rawW = Math.round(Math.abs(x1 - x0));
  const rawH = Math.round(Math.abs(y1 - y0));
  aerosolWmsWidth = Math.max(256, Math.min(2048, rawW || 512));
  aerosolWmsHeight = Math.max(256, Math.min(2048, rawH || 512));

  aerosolGroup = g.append('g')
    .attr('class', 'aerosol-layer-group')
    .attr('clip-path', 'url(#california-clip)')
    .style('opacity', effectiveAerosolGroupOpacity())
    .style('pointer-events', 'none');

  const commonAttrs = sel => sel
    .attr('x', x0).attr('y', y0)
    .attr('width', x1 - x0).attr('height', y1 - y0)
    .attr('preserveAspectRatio', 'none')
    .style('mix-blend-mode', 'normal');

  const aerosolFilter = 'saturate(1.45) brightness(0.94)';
  tileA = aerosolGroup.append('image').attr('class', 'aerosol-layer tile-a');
  tileB = aerosolGroup.append('image').attr('class', 'aerosol-layer tile-b');
  commonAttrs(tileA).style('opacity', 0).style('filter', aerosolFilter);
  commonAttrs(tileB).style('opacity', 0).style('filter', aerosolFilter);
}

function setAerosolTileMessage(dateStr, suffix) {
  const el = document.getElementById('point-count');
  if (el) el.textContent = suffix ? `${dateStr} · ${suffix}` : dateStr;
}

function renderAerosolForDate(dateStr) {
  setAerosolTileMessage(dateStr, '');
  if (!tileA) return;

  const src = buildGibsMaiacAodUrl(dateStr);

  if (activeTile === 'A') {
    const img = tileB.node();
    img.onload = () => {
      tileA.style('opacity', 0);
      tileB.style('opacity', 1);
      activeTile = 'B';
      setAerosolTileMessage(dateStr, '');
    };
    img.onerror = () => {
      tileB.style('opacity', 0);
      console.warn('Aerosol tile missing or failed:', src);
      setAerosolTileMessage(dateStr, 'no aerosol tile');
    };
    tileB.attr('href', src).attr('xlink:href', src);
  } else {
    const img = tileA.node();
    img.onload = () => {
      tileB.style('opacity', 0);
      tileA.style('opacity', 1);
      activeTile = 'A';
      setAerosolTileMessage(dateStr, '');
    };
    img.onerror = () => {
      tileA.style('opacity', 0);
      console.warn('Aerosol tile missing or failed:', src);
      setAerosolTileMessage(dateStr, 'no aerosol tile');
    };
    tileA.attr('href', src).attr('xlink:href', src);
  }
}

function reapplyAerosolOpacityFromSlider() {
  if (aerosolGroup) aerosolGroup.style('opacity', effectiveAerosolGroupOpacity());
}

// ── FIRE DOTS (FIRMS CSV) ───────────────────────────────────────────────────
let firmsData = {};
let fireLayer = null;

function initFireLayer() {
  fireLayer = g.append('g').attr('class', 'fire-layer');
}

function loadFIRMS(csvUrl) {
  d3.csv(csvUrl).then(rows => {
    rows.forEach(r => {
      const date = r.acq_date;
      if (!firmsData[date]) firmsData[date] = [];
      firmsData[date].push({ lat: +r.latitude, lon: +r.longitude, brightness: +r.brightness });
    });
    renderFiresForDate(DATES[currentIndex]);
  }).catch(() => {
    console.warn('No FIRMS CSV — add data/firms_august_complex.csv to enable fire dots');
  });
}

function renderFiresForDate(dateStr) {
  if (!fireLayer) return;
  const points = firmsData[dateStr] || [];
  fireLayer.selectAll('circle')
    .data(points, d => d.lat + ',' + d.lon)
    .join(
      enter => enter.append('circle')
        .attr('cx', d => { const p = projection([d.lon, d.lat]); return p ? p[0] : -9999; })
        .attr('cy', d => { const p = projection([d.lon, d.lat]); return p ? p[1] : -9999; })
        .attr('r', 2.5)
        .attr('fill', '#ff4400')
        .attr('opacity', 0.9)
        .style('filter', 'drop-shadow(0 0 3px #ff6600)')
        .attr('pointer-events', 'none'),
      update => update
        .attr('cx', d => { const p = projection([d.lon, d.lat]); return p ? p[0] : -9999; })
        .attr('cy', d => { const p = projection([d.lon, d.lat]); return p ? p[1] : -9999; }),
      exit => exit.remove()
    );
}

// ── SETTLEMENTS ─────────────────────────────────────────────────────────────
function drawSettlements(settlements) {
  const california = settlements.filter(d =>
    d.Latitude  >= CA_BOUNDS.latMin && d.Latitude  <= CA_BOUNDS.latMax &&
    d.Longitude >= CA_BOUNDS.lonMin && d.Longitude <= CA_BOUNDS.lonMax
  );

  let selected = null;
  const circleGroup = g.append('g').attr('class', 'settlement-layer');
  const selectedCityLabel = g.append('g').attr('class', 'selected-city-label').style('visibility', 'hidden');

  function clearSettlementSelection() {
    selectedCityLabel.style('visibility', 'hidden').selectAll('*').remove();
    const mini = document.getElementById('mini-wms-popover');
    if (mini) mini.style.display = 'none';
    selectedSettlementCircle = null;
  }

  circleGroup
    .selectAll('circle')
    .data(california)
    .join('circle')
      .attr('class', 'settlement')
      .attr('cx', d => projection([d.Longitude, d.Latitude])[0])
      .attr('cy', d => projection([d.Longitude, d.Latitude])[1])
      .attr('r', 4)
      .attr('fill', d => d.Urborrur === 'U' ? '#4a2358' : '#d4c98a')
      .on('click', function(event, d) {
        event.stopPropagation();
        if (selected) d3.select(selected).classed('selected', false);
        selected = this;
        d3.select(this).classed('selected', true);
        selectedSettlementCircle = this;

        document.getElementById('no-selection').style.display = 'none';
        document.getElementById('s-header').style.display = 'block';

        document.getElementById('s-name').textContent = d.Name1;
        document.getElementById('s-info').textContent =
          `${d.Country}  ·  Pop: ${d.ES00POP?.toLocaleString()}  ·  ${d.Urborrur === 'U' ? 'Urban' : 'Rural'}`;

        const [cx, cy] = projection([d.Longitude, d.Latitude]);
        selectedCityLabel.selectAll('*').remove();
        selectedCityLabel.style('visibility', 'visible')
          .append('text')
          .attr('x', cx + 8)
          .attr('y', cy - 6)
          .text(d.Name1);

        const buf = 0.12;
        const baseMini = document.getElementById('mini-wms-base');
        const labelsMini = document.getElementById('mini-wms-labels');
        const miniPop = document.getElementById('mini-wms-popover');
        baseMini.style.opacity = '0.45';
        baseMini.onload = () => { baseMini.style.opacity = '1'; };
        baseMini.onerror = () => { baseMini.style.opacity = '1'; };
        baseMini.src = getWMSUrl(
          'Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual',
          d.Latitude, d.Longitude, buf,
          { TIME: '2000-01-01T00:00:00Z' }
        );
        labelsMini.src = getWMSUrl('Reference_Labels_15m', d.Latitude, d.Longitude, buf);
        miniPop.style.display = 'block';
        updateMiniMapPosition();
      });

  svg.on('click', () => {
    document.getElementById('no-selection').style.display = 'block';
    document.getElementById('s-header').style.display = 'none';
    clearSettlementSelection();
    if (selected) { d3.select(selected).classed('selected', false); selected = null; }
  });
}

// ── SLIDER + PLAYBACK ───────────────────────────────────────────────────────
let playInterval = null;
let currentIndex = 0;

function updateSliderUI(index) {
  currentIndex = index;
  const dateStr = DATES[index];
  const dateObj  = new Date(dateStr + 'T12:00:00');

  document.getElementById('date-label').textContent    = dateStr;
  document.getElementById('date-day-name').textContent = DAY_NAMES[dateObj.getDay()];
  document.getElementById('date-slider').value         = index;

  document.querySelectorAll('.tick').forEach((el, i) => {
    const tickPositions = [0, 23, 46, 69, 88];
    el.classList.toggle('active', tickPositions[i] === index);
  });

  renderAerosolForDate(dateStr);
  renderFiresForDate(dateStr);
}

document.getElementById('date-slider').addEventListener('input', function() {
  stopPlay();
  updateSliderUI(+this.value);
});

function startPlay() {
  document.getElementById('play-btn').textContent = '⏸ Pause';
  playInterval = setInterval(() => {
    const next = (currentIndex + 1) % DATES.length;
    updateSliderUI(next);
    if (next === 0) stopPlay();
  }, SPEEDS[speedIndex].ms);
}

function stopPlay() {
  clearInterval(playInterval);
  playInterval = null;
  document.getElementById('play-btn').textContent = '▶ Play';
}

document.getElementById('play-btn').addEventListener('click', () => {
  if (playInterval) {
    stopPlay();
  } else {
    if (currentIndex === DATES.length - 1) updateSliderUI(0);
    startPlay();
  }
});

document.getElementById('speed-btn').addEventListener('click', () => {
  const wasPlaying = !!playInterval;
  if (wasPlaying) stopPlay();
  speedIndex = (speedIndex + 1) % SPEEDS.length;
  document.getElementById('speed-btn').textContent = SPEEDS[speedIndex].label;
  if (wasPlaying) startPlay();
});

// ── CALIFORNIA BORDER ───────────────────────────────────────────────────────
function drawCaliforniaBorder(california) {
  g.append('g')
    .attr('class', 'california-layer')
    .selectAll('path')
    .data(california.features)
    .join('path')
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', '#4a6741')
      .attr('stroke-width', 1.2);
}

// ── BOOT ────────────────────────────────────────────────────────────────────
Promise.all([
  d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'),
  d3.json('data/GRUMP_Settlements_CA.json'),
  d3.json('data/california.geojson'),
]).then(([world, settlements, california]) => {
  setupCaliforniaClip(california);
  drawElevationBasemap();
  initAerosolLayer();
  const smokeSlider = document.getElementById('aerosol-opacity-slider');
  if (smokeSlider) aerosolUserFactor = +smokeSlider.value / 100;
  reapplyAerosolOpacityFromSlider();
  drawCaliforniaBorder(california);
  initFireLayer();
  drawSettlements(settlements);
  updateSliderUI(0);
  loadFIRMS('data/firms_august_complex.csv');
}).catch(err => console.error('Load error:', err));

document.getElementById('aerosol-opacity-slider').addEventListener('input', function() {
  const v = +this.value;
  aerosolUserFactor = v / 100;
  const pct = document.getElementById('aerosol-opacity-pct');
  if (pct) pct.textContent = String(v);
  reapplyAerosolOpacityFromSlider();
});

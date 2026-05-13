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

// ── SVG SETUP ──────────────────────────────────────────────────────────────
const svg = d3.select('#map-svg');
const width  = window.innerWidth - 380;
const height = window.innerHeight;
svg.attr('width', width).attr('height', height);

const projection = d3.geoMercator()
  .center([-121, 39.5])
  .scale(2800)
  .translate([width / 2, height / 2]);

const path = d3.geoPath().projection(projection);
const g = svg.append('g');

const zoom = d3.zoom()
  .scaleExtent([1, 20])
  .on('zoom', ({ transform }) => g.attr('transform', transform));
svg.call(zoom);

// ── WMS HELPER ─────────────────────────────────────────────────────────────
const WMS_BASE = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?';

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

// ── AEROSOL TILE LAYER ──────────────────────────────────────────────────────
let tileA = null;
let tileB = null;
let activeTile = 'A';

function initAerosolLayer() {
  const [x0, y1] = projection([-125, 32]);
  const [x1, y0] = projection([-114, 42]);

  const commonAttrs = sel => sel
    .attr('x', x0).attr('y', y0)
    .attr('width', x1 - x0).attr('height', y1 - y0)
    .attr('preserveAspectRatio', 'none')
    .attr('clip-path', 'url(#california-clip)')
    .style('mix-blend-mode', 'normal');

  tileA = g.append('image').attr('class', 'aerosol-layer tile-a');
  tileB = g.append('image').attr('class', 'aerosol-layer tile-b');
  commonAttrs(tileA).style('opacity', 0).style('filter', 'blur(5px) hue-rotate(180deg) saturate(2.5) brightness(0.8)');
  commonAttrs(tileB).style('opacity', 0).style('filter', 'blur(5px) hue-rotate(180deg) saturate(2.5) brightness(0.8)');
}

function renderAerosolForDate(dateStr) {
  document.getElementById('point-count').textContent = dateStr;
  if (!tileA) return;

  const src = `data/aerosol_tiles_august_complex/${dateStr}.png`;

  if (activeTile === 'A') {
    tileB.attr('xlink:href', src);
    tileB.node().onload = () => {
      tileA.style('opacity', 0);
      tileB.style('opacity', 0.65);
      activeTile = 'B';
    };
  } else {
    tileA.attr('xlink:href', src);
    tileA.node().onload = () => {
      tileB.style('opacity', 0);
      tileA.style('opacity', 0.65);
      activeTile = 'A';
    };
  }
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
  const labelGroup  = g.append('g').attr('class', 'label-layer');

  circleGroup
    .selectAll('circle')
    .data(california)
    .join('circle')
      .attr('class', 'settlement')
      .attr('cx', d => projection([d.Longitude, d.Latitude])[0])
      .attr('cy', d => projection([d.Longitude, d.Latitude])[1])
      .attr('r', 4)
      .attr('fill', d => d.Urborrur === 'U' ? '#6aacdb' : '#d4c98a')
      .on('click', function(event, d) {
        event.stopPropagation();
        if (selected) d3.select(selected).classed('selected', false);
        selected = this;
        d3.select(this).classed('selected', true);

        document.getElementById('no-selection').style.display = 'none';
        document.getElementById('s-header').style.display = 'block';
        document.getElementById('wms-container').style.display = 'block';
        document.getElementById('s-name').textContent = d.Name1;
        document.getElementById('s-info').textContent =
          `${d.Country}  ·  Pop: ${d.ES00POP?.toLocaleString()}  ·  ${d.Urborrur === 'U' ? 'Urban' : 'Rural'}`;

        const buf    = 0.12;
        const base   = document.getElementById('wms-base');
        const labels = document.getElementById('wms-labels');
        base.style.opacity = '0.3';
        base.onload  = () => { base.style.opacity = '1'; };
        base.onerror = () => { base.style.opacity = '1'; };
        base.src = getWMSUrl(
          'Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual',
          d.Latitude, d.Longitude, buf,
          { TIME: '2000-01-01T00:00:00Z' }
        );
        labels.src = getWMSUrl('Reference_Labels_15m', d.Latitude, d.Longitude, buf);
      });

  labelGroup
    .selectAll('text')
    .data(california)
    .join('text')
      .attr('x', d => projection([d.Longitude, d.Latitude])[0] + 5)
      .attr('y', d => projection([d.Longitude, d.Latitude])[1] + 4)
      .text(d => d.Name1)
      .attr('font-size', '3px')
      .attr('fill', 'white')
      .attr('paint-order', 'stroke')
      .attr('stroke', '#0a1f1a')
      .attr('stroke-width', '0.8px')
      .style('pointer-events', 'none');

  svg.on('click', () => {
    document.getElementById('no-selection').style.display = 'block';
    document.getElementById('s-header').style.display = 'none';
    document.getElementById('wms-container').style.display = 'none';
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
  drawCaliforniaBorder(california);
  drawElevationBasemap();
  initAerosolLayer();
  initFireLayer();
  drawSettlements(settlements);
  updateSliderUI(0);
  loadFIRMS('data/firms_august_complex.csv');
}).catch(err => console.error('Load error:', err));

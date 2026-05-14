// ── CONSTANTS ──────────────────────────────────────────────────────────────
const CA_BOUNDS = { lonMin: -124.48, lonMax: -114.13, latMin: 32.53, latMax: 42.01 };
const BURN_HOTSPOTS = [
  // August Complex
  { name: 'Covelo',       lat: 39.7944, lon: -123.2475, county: 'Mendocino',   fire: 'August Complex',        before: '2020-08-01', after: '2020-12-23' },
  { name: 'Willits',      lat: 39.4096, lon: -123.3522, county: 'Mendocino',   fire: 'August Complex',        before: '2020-08-01', after: '2020-11-30' },
  { name: 'Weaverville',  lat: 40.7338, lon: -122.9424, county: 'Trinity',     fire: 'August Complex',        before: '2020-08-01', after: '2020-11-28' },
  { name: 'Elk Creek',    lat: 39.5960, lon: -122.5347, county: 'Glenn',       fire: 'August Complex',        before: '2019-08-01', after: '2020-11-28' },
  { name: 'Paskenta',     lat: 39.8857, lon: -122.5500, county: 'Tehama',      fire: 'August Complex',        before: '2019-08-01', after: '2020-11-28' },
  { name: 'Alderpoint',   lat: 40.1763, lon: -123.6086, county: 'Humboldt',    fire: 'August Complex',        before: '2020-08-01', after: '2020-11-28' },
  { name: 'Platina',      lat: 40.3682, lon: -122.8808, county: 'Shasta',      fire: 'August Complex',        before: '2020-08-01', after: '2020-11-28' },

  // LNU Lightning Complex
  { name: 'Vacaville',    lat: 38.3566, lon: -121.9877, county: 'Solano',      fire: 'LNU Lightning Complex', before: '2020-08-01', after: '2020-11-28' },
  { name: 'Healdsburg',   lat: 38.7007, lon: -122.8691, county: 'Sonoma',      fire: 'LNU Lightning Complex', before: '2020-08-03', after: '2020-11-28' },

  // SCU Lightning Complex
  { name: 'Morgan Hill',  lat: 37.1305, lon: -121.6541, county: 'Santa Clara', fire: 'SCU Lightning Complex', before: '2020-08-03', after: '2020-11-26' },
  { name: 'Livermore',    lat: 37.6819, lon: -121.7681, county: 'Alameda',     fire: 'SCU Lightning Complex', before: '2020-07-30', after: '2020-11-28' },

  // North Complex
  { name: 'Berry Creek',  lat: 39.6443, lon: -121.4063, county: 'Butte',       fire: 'North Complex',         before: '2020-08-01', after: '2020-11-21' },
  { name: 'Quincy',       lat: 39.9360, lon: -120.9469, county: 'Plumas',      fire: 'North Complex',         before: '2020-08-01', after: '2020-12-07' },

  // Creek Fire
  { name: 'Shaver Lake',  lat: 37.1457, lon: -119.3076, county: 'Fresno',      fire: 'Creek Fire',            before: '2020-08-01', after: '2020-11-16' },

  // Glass Fire
  { name: 'Calistoga',    lat: 38.5791, lon: -122.5797, county: 'Napa',        fire: 'Glass Fire',            before: '2020-08-01', after: '2020-11-01' },

  // Zogg Fire
  { name: 'Igo',          lat: 40.4974, lon: -122.5639, county: 'Shasta',      fire: 'Zogg Fire',             before: '2020-08-01', after: '2020-11-28' },

  // Bobcat Fire
  { name: 'Juniper Hills', lat: 34.4313, lon: -117.9724, county: 'Los Angeles', fire: 'Bobcat Fire',          before: '2020-08-05', after: '2020-12-04' },

];


// ── SVG SETUP ──────────────────────────────────────────────────────────────
const mapArea = document.getElementById('map-area');
const navEl = document.getElementById('site-nav');
const navH = navEl ? navEl.getBoundingClientRect().height : 0;
const width   = mapArea.offsetWidth || (window.innerWidth - 380);
const height  = mapArea.offsetHeight || (window.innerHeight - navH);
const svg     = d3.select('#map-svg')         
  .attr('width', width)
  .attr('height', height);

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
      bboxSR: '4326', imageSR: '4326',
      size: `${w},${h}`,
      format: 'png', transparent: 'false', f: 'image',
    });

  g.insert('image', ':first-child')
    .attr('x', x0).attr('y', y0)
    .attr('width', w).attr('height', h)
    .attr('preserveAspectRatio', 'none')
    .attr('xlink:href', src)
    .attr('clip-path', 'url(#california-clip)')
    .style('filter', 'hue-rotate(60deg) saturate(0.4) brightness(0.7)')
    .style('opacity', 0.85);
}

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

// ── SETTLEMENTS ─────────────────────────────────────────────────────────────
function drawSettlements(settlements) {
  if (!Array.isArray(settlements)) settlements = settlements.features || settlements.data || Object.values(settlements)[0];

  const california = settlements.filter(d =>
    d.Latitude  >= CA_BOUNDS.latMin && d.Latitude  <= CA_BOUNDS.latMax &&
    d.Longitude >= CA_BOUNDS.lonMin && d.Longitude <= CA_BOUNDS.lonMax
  );

  const gridSize = 0.5;
  const grid = {};
  california.forEach(d => {
    const key = `${Math.floor(d.Longitude / gridSize)},${Math.floor(d.Latitude / gridSize)}`;
    if (!grid[key] || d.ES00POP > grid[key].ES00POP) grid[key] = d;
  });
  const filtered = Object.values(grid);

  let selected = null;
  const circleGroup = g.append('g').attr('class', 'settlement-layer');
  const labelGroup  = g.append('g').attr('class', 'label-layer');

  circleGroup
    .selectAll('circle')
    .data(filtered)
    .join('circle')
      .attr('class', 'settlement')
      .attr('cx', d => projection([d.Longitude, d.Latitude])[0])
      .attr('cy', d => projection([d.Longitude, d.Latitude])[1])
      .attr('r', 4)
      .attr('fill', d => d.Urborrur === 'U' ? '#2e6b26' : '#d4c98a')
      .on('click', function(event, d) {
        event.stopPropagation();
        if (selected) d3.select(selected).classed('selected', false);
        selected = this;
        d3.select(this).classed('selected', true);

        document.getElementById('no-selection').style.display = 'none';
        document.getElementById('s-header').style.display = 'block';
        document.getElementById('wms-container').style.display = 'flex';
        document.getElementById('s-name').textContent = d.Name1;
        document.getElementById('s-info').textContent =
          `${d.Country}  ·  Pop: ${d.ES00POP?.toLocaleString()}  ·  ${d.Urborrur === 'U' ? 'Urban' : 'Rural'}`;

        const buf          = 0.7;
        const before       = document.getElementById('wms-before');
        const beforeLabels = document.getElementById('wms-before-labels');
        const after        = document.getElementById('wms-after');
        const afterLabels  = document.getElementById('wms-after-labels');

        before.style.opacity = '0.3';
        after.style.opacity  = '0.3';
        before.onload  = () => { before.style.opacity = '1'; };
        before.onerror = () => { before.style.opacity = '1'; };
        after.onload   = () => { after.style.opacity = '1'; };
        after.onerror  = () => { after.style.opacity = '1'; };

        // REPLACE WITH:
        before.src = getWMSUrl(
        'MODIS_Terra_CorrectedReflectance_TrueColor',
        d.Latitude, d.Longitude, buf,
        { TIME: '2020-08-13T00:00:00Z' }
        );
        beforeLabels.src = getWMSUrl('Reference_Labels_15m', d.Latitude, d.Longitude, buf);

        after.src = getWMSUrl(
        'MODIS_Terra_CorrectedReflectance_TrueColor',
        d.Latitude, d.Longitude, buf,
        { TIME: '2020-11-27T00:00:00Z' }
        );
        afterLabels.src = getWMSUrl('Reference_Labels_15m', d.Latitude, d.Longitude, buf);

      });

  labelGroup
    .selectAll('text')
    .data(filtered)
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
// ── BURN SCAR HOTSPOTS ──────────────────────────────────────────────────────
function drawBurnHotspots() {
  const group = g.append('g').attr('class', 'hotspot-layer');

  group.selectAll('circle')
    .data(BURN_HOTSPOTS)
    .join('circle')
      .attr('cx', d => projection([d.lon, d.lat])[0])
      .attr('cy', d => projection([d.lon, d.lat])[1])
      .attr('r', 6)
        .attr('fill', '#853d93')
        .attr('stroke', '#8d5798')
        .style('filter', 'drop-shadow(0 0 5px rgba(226, 5, 255, 0.34))')

      .attr('stroke-width', 1.5)
      .attr('opacity', 0.9)
      .attr('cursor', 'pointer')
      .on('click', function(event, d) {
        event.stopPropagation();

        document.getElementById('no-selection').style.display = 'none';
        document.getElementById('s-header').style.display = 'block';
        document.getElementById('wms-container').style.display = 'flex';
        document.getElementById('s-name').textContent = d.name;
        document.getElementById('s-info').textContent =
            `${d.county} County · ${d.fire}`

        const buf          = 0.4;
        const before       = document.getElementById('wms-before');
        const beforeLabels = document.getElementById('wms-before-labels');
        const after        = document.getElementById('wms-after');
        const afterLabels  = document.getElementById('wms-after-labels');

        before.style.opacity = '0.3';
        after.style.opacity  = '0.3';
        before.onload  = () => { before.style.opacity = '1'; };
        before.onerror = () => { before.style.opacity = '1'; };
        after.onload   = () => { after.style.opacity = '1'; };
        after.onerror  = () => { after.style.opacity = '1'; };

        before.src = getWMSUrl(
        'MODIS_Terra_CorrectedReflectance_TrueColor',
        d.lat, d.lon, buf, { TIME: `${d.before}T00:00:00Z` }
        );

        after.src = getWMSUrl(
        'MODIS_Terra_CorrectedReflectance_TrueColor',
        d.lat, d.lon, buf, { TIME: `${d.after}T00:00:00Z` }
        );

        afterLabels.src = getWMSUrl('Reference_Labels_15m', d.lat, d.lon, buf);
      });

  group.selectAll('text')
    .data(BURN_HOTSPOTS)
    .join('text')
      .attr('x', d => projection([d.lon, d.lat])[0] + 8)
      .attr('y', d => projection([d.lon, d.lat])[1] + 4)
      .text(d => d.name)
      .attr('font-size', '4px')
      .attr('font-family', 'Space Mono, monospace')
      .attr('fill', '#853d93')
      .attr('paint-order', 'stroke')
      .attr('stroke', '#000000')
      .attr('stroke-width', '1px')
      .style('pointer-events', 'none');
}

// ── BOOT ────────────────────────────────────────────────────────────────────
Promise.all([
  d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'),
  d3.json('../data/GRUMP_Settlements_CA.json'),
  d3.json('../data/california.geojson'),
]).then(([world, settlements, california]) => {
  setupCaliforniaClip(california);
  drawCaliforniaBorder(california);
  drawElevationBasemap();
//   drawSettlements(settlements);
  drawBurnHotspots();
}).catch(err => console.error('Load error:', err));


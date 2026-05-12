const CA_BOUNDS = { lonMin: -124.48, lonMax: -114.13, latMin: 32.53, latMax: 42.01 };

const svg = d3.select('#map-area');
const width  = window.innerWidth - 380;
const height = window.innerHeight;

svg.attr('width', width).attr('height', height);

const projection = d3.geoMercator()
  .center([-119.5, 37.5])
  .scale(2800)
  .translate([width / 2, height / 2]);

const path = d3.geoPath().projection(projection);

const zoom = d3.zoom()
  .scaleExtent([1, 20])
  .on('zoom', ({ transform }) => g.attr('transform', transform));
svg.call(zoom);

const g = svg.append('g');

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

function drawMap(world) {
  g.append('g')
    .selectAll('path')
    .data(topojson.feature(world, world.objects.countries).features)
    .join('path')
      .attr('d', path)
      .attr('fill', '#0f3460')
      .attr('stroke', '#344')
      .attr('stroke-width', 0.3);
}

function drawSettlements(settlements) {
  const california = settlements.filter(d =>
    d.Latitude  >= CA_BOUNDS.latMin && d.Latitude  <= CA_BOUNDS.latMax &&
    d.Longitude >= CA_BOUNDS.lonMin && d.Longitude <= CA_BOUNDS.lonMax
  );

  let selected = null;

  const circleGroup = g.append('g');
  const labelGroup  = g.append('g');

  circleGroup
    .selectAll('circle')
    .data(california)
    .join('circle')
      .attr('class', 'settlement')
      .attr('cx', d => projection([d.Longitude, d.Latitude])[0])
      .attr('cy', d => projection([d.Longitude, d.Latitude])[1])
      .attr('r', 4)
      .attr('fill', d => d.Urborrur === 'U' ? '#e94560' : '#4ecca3')
      .on('click', function(event, d) {
        event.stopPropagation();

        if (selected) d3.select(selected).classed('selected', false);
        selected = this;
        d3.select(this).classed('selected', true);

        const panel = document.getElementById('panel');
        panel.style.display = 'flex';
        document.getElementById('s-name').textContent = d.Name1;
        document.getElementById('s-info').textContent =
          `${d.Country}  ·  Pop: ${d.ES00POP?.toLocaleString()}  ·  ${d.Urborrur === 'U' ? 'Urban' : 'Rural'}`;

        const buf = 0.12;
        const base   = document.getElementById('wms-base');
        const labels = document.getElementById('wms-labels');

        base.style.opacity = '0.3';
        base.onload  = () => { base.style.opacity = '1'; };
        base.onerror = () => { base.style.opacity = '1'; base.alt = 'Image unavailable'; };
        base.src = getWMSUrl(
          'Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual',
          d.Latitude, d.Longitude, buf,
          { TIME: '2000-01-01T00:00:00Z' }
        );
        labels.src = getWMSUrl(
          'Reference_Labels_15m',
          d.Latitude, d.Longitude, buf
        );
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
      .attr('stroke', '#1a1a2e')
      .attr('stroke-width', '0.8px')
      .style('pointer-events', 'none');

  svg.on('click', () => {
    document.getElementById('panel').style.display = 'none';
    if (selected) { d3.select(selected).classed('selected', false); selected = null; }
  });
}

Promise.all([
  d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'),
  d3.json('data/GRUMP_Settlements_CA.json')
]).then(([world, settlements]) => {
  drawMap(world);
  drawSettlements(settlements);
}).catch(err => {
  console.error('Failed to load data:', err);
  d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
    .then(world => drawMap(world));
});

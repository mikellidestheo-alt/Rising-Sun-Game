// Run from a folder with: npm i world-atlas@2.0.2 topojson-client@3.1.0 topojson-simplify@3.0.3 d3-geo@3.1.1 polygon-clipping@0.15.7
// then: node make-map.js 0.04  (writes mapdata.js; paste it into the MAPDATA <script> in index.html)
// Builds window.MAPDATA for The Sun Rises from Natural Earth 1:50m (world-atlas, public domain).
const topo = require('topojson-client');
const simp = require('topojson-simplify');
const d3 = require('d3-geo');
const pc = require('polygon-clipping');
const fs = require('fs');

const minW = +(process.argv[2] || 0.004);
let world = JSON.parse(JSON.stringify(require('world-atlas/countries-50m.json')));
world = simp.presimplify(world);
// keep more detail where the story happens: East Asia & the western Pacific, then the North Atlantic capitals
for (const arc of world.arcs) for (const pt of arc) {
  const [x, y] = pt;
  if (x > 98 && x < 180 && y > -2 && y < 62) pt[2] *= 12;
  else if (x > -80 && x < 20 && y > 36 && y < 60) pt[2] *= 3;
}
world = simp.simplify(world, minW);

const W = 2000, H = 1000;
const proj = d3.geoNaturalEarth1().fitExtent([[0, 30], [W, H - 10]], { type: 'Sphere' });
const k = proj.scale(), [tx, ty] = proj.translate();
const path = d3.geoPath(proj).digits(1);

const geoms = world.objects.countries.geometries.filter(g => g.properties.name !== 'Antarctica');
const byName = n => geoms.find(g => g.properties.name === n);
const feat = g => topo.feature(world, g);

const BLOC = {
  jp: ['Japan'], qing: ['China', 'Mongolia', 'Taiwan', 'Hong Kong', 'Macao'], ru: ['Russia'],
  west: ['United Kingdom', 'France', 'Germany', 'United States of America', 'Italy'],
  col: ['India', 'Pakistan', 'Bangladesh', 'Myanmar', 'Sri Lanka', 'Malaysia', 'Singapore', 'Brunei', 'Indonesia',
    'Philippines', 'Vietnam', 'Laos', 'Cambodia', 'Papua New Guinea', 'Australia', 'New Zealand', 'Guam', 'Timor-Leste', 'Canada']
};
const blocOf = n => Object.keys(BLOC).find(b => BLOC[b].includes(n)) || 'nt';
const KEY = { 'Taiwan': 'taiwan', 'Japan': 'japan', 'China': 'china', 'Russia': 'russia', 'Mongolia': 'mongolia',
  'United Kingdom': 'britain', 'France': 'france', 'Germany': 'germany', 'United States of America': 'usa' };
const NAME = { 'United States of America': 'United States', 'Taiwan': 'Taiwan (Formosa)', 'United Kingdom': 'Britain' };
const slug = s => s.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

const countries = [];
const regions = {};
const centroid = poly => { // rough lon/lat centroid of outer ring
  const r = poly[0]; let x = 0, y = 0; r.forEach(p => { x += p[0]; y += p[1]; }); return [x / r.length, y / r.length];
};
function push(id, key, name, bloc, geom) {
  const d = path(geom);
  if (d) countries.push({ id, key, name, bloc, d });
}
const SKIP = new Set(['North Korea', 'South Korea', 'Japan', 'Russia', 'Marshall Is.', 'Micronesia', 'Palau', 'N. Mariana Is.']);
for (const g of geoms) {
  const n = g.properties.name;
  if (SKIP.has(n)) continue;
  push(KEY[n] || slug(n), KEY[n] || slug(n), NAME[n] || n, blocOf(n), feat(g));
}
// Korea: one country, no modern DMZ line
const korea = topo.merge(world, [byName('North Korea'), byName('South Korea')]);
push('korea', 'korea', 'Korea', 'kr', korea);
// Micronesia: Germany's Pacific islands north of the equator (Marianas except Guam, Carolines, Palau, Marshalls)
const mic = topo.merge(world, ['Marshall Is.', 'Micronesia', 'Palau', 'N. Mariana Is.'].map(byName));
push('micronesia', 'micronesia', 'Marianas, Carolines & Marshalls', 'col', mic);
// Japan: split off Ryukyu (Okinawa and south)
const jp = feat(byName('Japan')).geometry;
const jpPolys = jp.type === 'MultiPolygon' ? jp.coordinates : [jp.coordinates];
const isRyu = p => { const [x, y] = centroid(p); return y < 26.95 && x < 131.5; };
push('japan', 'japan', 'Japan', 'jp', { type: 'MultiPolygon', coordinates: jpPolys.filter(p => !isRyu(p)) });
push('ryukyu', 'ryukyu', 'Ryukyu Islands', 'nt', { type: 'MultiPolygon', coordinates: jpPolys.filter(isRyu) });
// Russia: split off the Kurils
const ru = feat(byName('Russia')).geometry;
const ruPolys = ru.coordinates;
const isKuril = p => { const [x, y] = centroid(p); return x > 145.3 && x < 156.8 && y > 43.3 && y < 50.95; };
push('russia', 'russia', 'Russia', 'ru', { type: 'MultiPolygon', coordinates: ruPolys.filter(p => !isKuril(p)) });
push('kurils', 'kurils', 'Kuril Islands', 'ru', { type: 'MultiPolygon', coordinates: ruPolys.filter(isKuril) });

// overlay regions (lon/lat outlines clipped to the coast)
const china = feat(byName('China')).geometry.coordinates;
const ruOnly = ruPolys.filter(p => !isKuril(p));
const clip = (subj, ring) => ({ type: 'MultiPolygon', coordinates: pc.intersection(subj, [[...ring, ring[0]]]).map(poly => poly.map(r => r.slice().reverse())) }) // d3 wants clockwise outer rings;
regions.liaodong = path(clip(china, [[120.6, 38.5], [124.6, 39.6], [124.45, 40.3], [124.07, 40.5], [122.75, 40.95], [122.2, 40.75], [121.4, 40.3], [120.6, 39.3]]));
regions.kwantung = path(clip(china, [[120.8, 38.6], [122.6, 38.6], [122.6, 39.45], [121.6, 39.6], [120.8, 39.3]]));
regions.kiaochow = path(clip(china, [[119.95, 35.85], [120.75, 35.85], [120.75, 36.4], [119.95, 36.4]]));
regions['sakhalin-s'] = path(clip(ruOnly, [[141, 45.5], [146, 45.5], [146, 50], [141, 50]]));
// Germany's Pacific islands north of the equator: a dashed outline, because the atolls are too small to see
regions.pacific = path({ type: 'Polygon', coordinates: [[[130.8, 2.5], [131.5, 1.8], [153.5, 0.4], [155.5, 0.4], [168.5, 3.8], [172.3, 4.5], [172.8, 7], [168.5, 15.3], [161, 12.5], [146.5, 14], [146, 21], [144.2, 21], [143.5, 12.5], [133, 9.5], [130.8, 2.5]].reverse()] });
const line = pts => path({ type: 'LineString', coordinates: pts });
regions['rail-sm'] = line([[121.25, 38.81], [121.6, 38.91], [121.7, 39.1], [122.0, 39.63], [122.35, 40.4], [122.75, 40.85], [123.17, 41.27], [123.43, 41.8], [123.84, 42.29], [124.37, 43.17], [125.32, 43.88]]);
regions['rail-sd'] = line([[120.38, 36.07], [119.75, 36.38], [119.1, 36.7], [118.05, 36.8], [117.0, 36.65]]);

const out = { w: W, h: H, k, tx, ty, countries, regions };
const js = '// Generated by tools/make-map.js from Natural Earth 1:50m (public domain) via world-atlas. Do not edit by hand.\nwindow.MAPDATA = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(__dirname + '/mapdata.js', js);
console.log('bytes', js.length, 'countries', countries.length, 'k', k.toFixed(2), tx.toFixed(1), ty.toFixed(1));
for (const [r, d] of Object.entries(regions)) console.log(r, d ? d.length : 'EMPTY');

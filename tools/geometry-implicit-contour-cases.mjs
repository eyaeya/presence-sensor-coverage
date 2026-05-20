import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sourceFiles = [...html.matchAll(/<script\b[^>]*\bsrc=(["'])(.*?)\1[^>]*><\/script>/g)]
  .map(m => `../${m[2]}`)
  .filter(file => !file.endsWith('/tests.js') && !file.endsWith('/app.js'));
const ctx = { console, Math, Date, JSON, parseFloat, parseInt, isNaN, isFinite, Array, Object, String, Number, Boolean };
vm.createContext(ctx);
for (const file of sourceFiles) {
  const url = new URL(file, import.meta.url);
  vm.runInContext(readFileSync(url, 'utf8'), ctx, { filename: url.pathname });
}

const { State, Render } = ctx;
const ROOM = { W: 7000, D: 7000 };
const HEIGHTS = [
  { key: 'ground', h: 0 },
  { key: 'lie', h: 600 },
  { key: 'sit', h: 750 },
  { key: 'stand', h: 1200 }
];
const GRID = 320;
const EDGE_STEP = 25;
const MAX_ALLOWED_MM = 100;
const failures = [];
const summaries = [];

function rad(d) { return d * Math.PI / 180; }
function v(x, y, z) { return { x, y, z }; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) { return v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
function len(a) { return Math.sqrt(dot(a, a)); }
function scale(a, s) { return v(a.x * s, a.y * s, a.z * s); }
function norm(a) { const L = len(a) || 1; return scale(a, 1 / L); }
function fail(caseName, check, detail) { failures.push({ caseName, check, detail }); }
function assert(caseName, check, cond, detail) { if (!cond) fail(caseName, check, detail); }
function rangeRadius(range, sensorHeight, h) {
  const dz = h - sensorHeight;
  if (range <= Math.abs(dz)) return null;
  return Math.sqrt(range * range - dz * dz);
}

// Independent frame construction. This intentionally does not call Geo.beamFrame().
function frame(st) {
  const H = st.height;
  if (st.mount === 'ceiling') {
    const ph = rad(st.hAngle);
    return {
      S: v(st.sensor.x, st.sensor.y, H),
      d: v(0, 0, -1),
      u: v(Math.sin(ph), Math.cos(ph), 0),
      w: v(Math.cos(ph), -Math.sin(ph), 0)
    };
  }

  let a;
  let S;
  if (st.mount === 'side') {
    let n;
    if (st.wall === 'left') { n = v(1, 0, 0); S = v(0, st.sensor.y, H); }
    else if (st.wall === 'right') { n = v(-1, 0, 0); S = v(st.room.W, st.sensor.y, H); }
    else if (st.wall === 'bottom') { n = v(0, 1, 0); S = v(st.sensor.x, 0, H); }
    else { n = v(0, -1, 0); S = v(st.sensor.x, st.room.D, H); }
    const ps = rad(st.hAngle);
    a = v(n.x * Math.cos(ps) - n.y * Math.sin(ps), n.x * Math.sin(ps) + n.y * Math.cos(ps), 0);
  } else {
    const q = Math.SQRT1_2;
    if (st.corner === 'bl') { a = v(q, q, 0); S = v(0, 0, H); }
    else if (st.corner === 'br') { a = v(-q, q, 0); S = v(st.room.W, 0, H); }
    else if (st.corner === 'tl') { a = v(q, -q, 0); S = v(0, st.room.D, H); }
    else { a = v(-q, -q, 0); S = v(st.room.W, st.room.D, H); }
  }
  const th = rad(st.tilt);
  const d = norm(v(a.x * Math.cos(th), a.y * Math.cos(th), -Math.sin(th)));
  const u = norm(v(-a.y, a.x, 0));
  const w = norm(cross(d, u));
  return { S, d, u, w };
}

function implicitInside(st, h, range, p) {
  if (p.x < -1e-6 || p.x > st.room.W + 1e-6 || p.y < -1e-6 || p.y > st.room.D + 1e-6) return false;
  const fr = frame(st);
  const q = v(p.x - fr.S.x, p.y - fr.S.y, h - fr.S.z);
  const forward = dot(q, fr.d);
  if (forward <= 1e-6) return false;
  const tanH = Math.tan(rad(st.hFov / 2));
  const tanV = Math.tan(rad(st.vFov / 2));
  const side = dot(q, fr.u);
  const vertical = dot(q, fr.w);
  const coneValue = (side * side) / (tanH * tanH) + (vertical * vertical) / (tanV * tanV) - forward * forward;
  if (coneValue > 1e-5) return false;
  const dist = len(q);
  return dist <= range + 1e-6;
}

function bisectionBoundary(st, h, range, a, b) {
  let lo = a;
  let hi = b;
  let loIn = implicitInside(st, h, range, lo);
  for (let i = 0; i < 24; i++) {
    const mid = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2 };
    const midIn = implicitInside(st, h, range, mid);
    if (midIn === loIn) lo = mid;
    else hi = mid;
  }
  return { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2 };
}

function addRoomEdgeSamples(st, h, range, out) {
  const W = st.room.W;
  const D = st.room.D;
  function walkEdge(points) {
    let prev = null;
    let prevInside = false;
    for (const p of points) {
      const inside = implicitInside(st, h, range, p);
      if (inside) out.push(p);
      if (prev && inside !== prevInside) out.push(bisectionBoundary(st, h, range, prev, p));
      prev = p;
      prevInside = inside;
    }
  }
  const bottom = [];
  const top = [];
  for (let i = 0; i <= Math.ceil(W / EDGE_STEP); i++) {
    const x = Math.min(W, i * EDGE_STEP);
    bottom.push({ x, y: 0 });
    top.push({ x, y: D });
  }
  const left = [];
  const right = [];
  for (let i = 0; i <= Math.ceil(D / EDGE_STEP); i++) {
    const y = Math.min(D, i * EDGE_STEP);
    left.push({ x: 0, y });
    right.push({ x: W, y });
  }
  walkEdge(bottom);
  walkEdge(top);
  walkEdge(left);
  walkEdge(right);
}

function marchingSquaresBoundary(st, h, range) {
  if (rangeRadius(range, st.height, h) === null) return [];
  const nx = GRID;
  const ny = GRID;
  const W = st.room.W;
  const D = st.room.D;
  const dx = W / nx;
  const dy = D / ny;
  const inside = Array.from({ length: nx + 1 }, () => Array(ny + 1).fill(false));
  for (let ix = 0; ix <= nx; ix++) {
    for (let iy = 0; iy <= ny; iy++) {
      inside[ix][iy] = implicitInside(st, h, range, { x: ix * dx, y: iy * dy });
    }
  }
  const pts = [];
  function point(ix, iy) { return { x: ix * dx, y: iy * dy }; }
  function edge(crossings, a, b, ai, bi) {
    if (ai !== bi) crossings.push(bisectionBoundary(st, h, range, a, b));
  }
  for (let ix = 0; ix < nx; ix++) {
    for (let iy = 0; iy < ny; iy++) {
      const p00 = point(ix, iy);
      const p10 = point(ix + 1, iy);
      const p11 = point(ix + 1, iy + 1);
      const p01 = point(ix, iy + 1);
      const i00 = inside[ix][iy];
      const i10 = inside[ix + 1][iy];
      const i11 = inside[ix + 1][iy + 1];
      const i01 = inside[ix][iy + 1];
      const crossings = [];
      edge(crossings, p00, p10, i00, i10);
      edge(crossings, p10, p11, i10, i11);
      edge(crossings, p11, p01, i11, i01);
      edge(crossings, p01, p00, i01, i00);
      if (crossings.length === 2) {
        pts.push(...samplePolyline(crossings, EDGE_STEP));
      } else if (crossings.length === 4) {
        pts.push(...samplePolyline([crossings[0], crossings[1]], EDGE_STEP));
        pts.push(...samplePolyline([crossings[2], crossings[3]], EDGE_STEP));
      } else {
        pts.push(...crossings);
      }
    }
  }
  addRoomEdgeSamples(st, h, range, pts);
  return dedupePoints(pts, 1);
}

function samplePolyline(points, step = EDGE_STEP) {
  const out = [];
  if (!points || points.length === 0) return out;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function samplePolygonBoundary(poly, step = EDGE_STEP) {
  if (!poly || poly.length < 3) return [];
  return samplePolyline(poly.concat([poly[0]]), step);
}

function dedupePoints(points, precision) {
  const seen = new Set();
  const out = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const k = `${Math.round(p.x / precision)},${Math.round(p.y / precision)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function makeSpatialIndex(points, cell = MAX_ALLOWED_MM) {
  const buckets = new Map();
  function key(ix, iy) { return `${ix},${iy}`; }
  for (const p of points) {
    const ix = Math.floor(p.x / cell);
    const iy = Math.floor(p.y / cell);
    const k = key(ix, iy);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(p);
  }
  return { buckets, cell, key };
}

function nearestDistance(p, index, fallbackPoints) {
  const ix = Math.floor(p.x / index.cell);
  const iy = Math.floor(p.y / index.cell);
  let best = Infinity;
  for (let r = 0; r <= 3; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const bucket = index.buckets.get(index.key(ix + dx, iy + dy));
        if (!bucket) continue;
        for (const q of bucket) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
      }
    }
  }
  if (Number.isFinite(best) && best <= MAX_ALLOWED_MM * 1.5) return best;
  for (const q of fallbackPoints) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
  return best;
}

function cloudDistance(a, b) {
  if (a.length === 0 && b.length === 0) return { max: 0, p95: 0 };
  if (a.length === 0 || b.length === 0) return { max: Infinity, p95: Infinity };
  const index = makeSpatialIndex(b);
  let max = 0;
  let maxPoint = null;
  const d = a.map(p => {
    const dist = nearestDistance(p, index, b);
    if (dist > max) { max = dist; maxPoint = p; }
    return dist;
  }).sort((x, y) => x - y);
  return { max: d[d.length - 1], p95: d[Math.floor(d.length * 0.95)], maxPoint };
}

function bbox(points) {
  if (!points.length) return null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  return { x0, x1, y0, y1 };
}

function distanceBoundaryExpected(st, kind) {
  const h = kind === 'presence' ? 750 : 0;
  const R = kind === 'presence' ? st.rangePresence : st.rangeMotion;
  const fr = frame(st);
  const radius = rangeRadius(R, fr.S.z, h);
  if (radius === null) return [];
  const n = Math.max(360, Math.ceil(2 * Math.PI * radius / EDGE_STEP));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = 2 * Math.PI * i / n;
    const p = { x: fr.S.x + radius * Math.cos(a), y: fr.S.y + radius * Math.sin(a) };
    if (implicitInside(st, h, R, p)) pts.push(p);
  }
  return pts;
}

function distanceBoundaryActual(st, kind) {
  const segs = Render.boundaryCurveSegments(st, kind);
  return segs.flatMap(seg => samplePolyline(seg, EDGE_STEP));
}

function makeBase(mount) {
  const st = State.defaults();
  State.applyMount(st, mount);
  st.room = clone(ROOM);
  if (mount === 'ceiling') st.sensor = { x: 3500, y: 3500 };
  if (mount === 'side') { st.wall = 'left'; st.sensor = { x: 0, y: 3500 }; }
  if (mount === 'corner') { st.corner = 'bl'; st.sensor = { x: 0, y: 0 }; }
  return st;
}

function sideSensor(wall, pos) {
  if (wall === 'left') return { x: 0, y: pos };
  if (wall === 'right') return { x: ROOM.W, y: pos };
  if (wall === 'bottom') return { x: pos, y: 0 };
  return { x: pos, y: ROOM.D };
}

function cornerSensor(corner) {
  return { x: corner[1] === 'l' ? 0 : ROOM.W, y: corner[0] === 'b' ? 0 : ROOM.D };
}

const cases = [];
function addCase(source, name, st) { cases.push({ source, name, st: clone(st) }); }

function addGeneratedCases() {
  const fovPairs = [[45, 45], [90, 45], [120, 90], [160, 120], [30, 160], [160, 30]];
  const angles = [0, 45, 90, 135, 179, 270, 359];
  const sideAngles = [-90, -45, -1, 0, 1, 45, 90];
  const positions = [100, 650, 1234, 2500, 3500, 6100, 6900];
  const heights = [1000, 1200, 1500, 1800, 2000, 2400, 3000, 5000];
  const ranges = [[449, 450], [999, 1000], [1050, 2000], [3000, 5000], [5000, 8000]];
  function pick(arr, i, salt) { return arr[(i * 19 + salt * 7) % arr.length]; }

  for (let i = 0; i < 28; i++) {
    const st = makeBase('ceiling');
    const fp = pick(fovPairs, i, 1);
    const rr = pick(ranges, i, 2);
    Object.assign(st, {
      sensor: { x: pick(positions, i, 3), y: pick(positions, i, 4) },
      height: pick([2000, 2400, 3000, 5000], i, 5),
      hAngle: pick(angles, i, 6),
      hFov: fp[0],
      vFov: fp[1],
      rangePresence: rr[0],
      rangeMotion: rr[1]
    });
    addCase('implicit-ceiling', `implicit ceiling ${i + 1}`, st);
  }

  for (let i = 0; i < 36; i++) {
    const wall = pick(['left', 'right', 'bottom', 'top'], i, 1);
    const fp = pick(fovPairs, i, 2);
    const rr = pick(ranges, i, 3);
    const st = makeBase('side');
    Object.assign(st, {
      wall,
      sensor: sideSensor(wall, pick(positions, i, 4)),
      height: pick(heights.filter(h => h <= 2000), i, 5),
      tilt: pick([0, 1, 10, 20, 30], i, 6),
      hAngle: pick(sideAngles, i, 7),
      hFov: fp[0],
      vFov: fp[1],
      rangePresence: rr[0],
      rangeMotion: rr[1]
    });
    addCase('implicit-side', `implicit side ${wall} ${i + 1}`, st);
  }

  for (let i = 0; i < 32; i++) {
    const corner = pick(['bl', 'br', 'tl', 'tr'], i, 1);
    const fp = pick(fovPairs, i, 2);
    const rr = pick(ranges, i, 3);
    const st = makeBase('corner');
    Object.assign(st, {
      corner,
      sensor: cornerSensor(corner),
      height: pick(heights.filter(h => h <= 2000), i, 5),
      tilt: pick([0, 1, 10, 20, 30], i, 6),
      hFov: fp[0],
      vFov: fp[1],
      rangePresence: rr[0],
      rangeMotion: rr[1]
    });
    addCase('implicit-corner', `implicit corner ${corner} ${i + 1}`, st);
  }

  [
    Object.assign(makeBase('side'), { wall: 'left', sensor: { x: 0, y: 3500 }, height: 1000, tilt: 0, hAngle: 0, hFov: 90, vFov: 45, rangePresence: 3000, rangeMotion: 5000 }),
    Object.assign(makeBase('side'), { wall: 'left', sensor: { x: 0, y: 3500 }, height: 1800, tilt: 20, hAngle: 0, hFov: 160, vFov: 120, rangePresence: 3000, rangeMotion: 5000 }),
    Object.assign(makeBase('side'), { wall: 'bottom', sensor: { x: 5829, y: 0 }, height: 1500, tilt: 20, hAngle: 0, hFov: 160, vFov: 60, rangePresence: 3000, rangeMotion: 5000 }),
    Object.assign(makeBase('corner'), { corner: 'bl', sensor: { x: 0, y: 0 }, height: 1200, tilt: 20, hFov: 160, vFov: 120, rangePresence: 450, rangeMotion: 5000 }),
    Object.assign(makeBase('corner'), { corner: 'tr', sensor: { x: 7000, y: 7000 }, height: 2000, tilt: 0, hFov: 160, vFov: 90, rangePresence: 3000, rangeMotion: 5000 }),
    Object.assign(makeBase('ceiling'), { sensor: { x: 3500, y: 3500 }, height: 5000, hAngle: 359, hFov: 160, vFov: 20, rangePresence: 5200, rangeMotion: 12000 })
  ].forEach((st, i) => addCase('implicit-adversarial', `implicit adversarial ${i + 1}`, st));
}
addGeneratedCases();

function validateLayer(caseName, st) {
  const actualLayers = Render.layerPolys(st);
  const byH = new Map(actualLayers.map(L => [L.h, L.poly]));
  const layerSummary = [];
  for (const H of HEIGHTS) {
    const expected = marchingSquaresBoundary(st, H.h, st.rangeMotion);
    const actual = samplePolygonBoundary(byH.get(H.h) || []);
    const eToA = cloudDistance(expected, actual);
    const aToE = cloudDistance(actual, expected);
    const maxError = Math.max(eToA.max, aToE.max);
    assert(caseName, `layer ${H.key} implicit contour within ${MAX_ALLOWED_MM}mm`, maxError <= MAX_ALLOWED_MM, {
      h: H.h,
      expectedPoints: expected.length,
      actualPoints: actual.length,
      expectedToActual: eToA,
      actualToExpected: aToE,
      expectedBox: bbox(expected),
      actualBox: bbox(actual)
    });
    layerSummary.push({
      key: H.key,
      h: H.h,
      expectedPoints: expected.length,
      actualPoints: actual.length,
      maxError,
      p95Error: Math.max(eToA.p95, aToE.p95),
      expectedBox: bbox(expected),
      actualBox: bbox(actual)
    });
  }
  return layerSummary;
}

function validateDistanceBoundaries(caseName, st) {
  return ['presence', 'motion'].map(kind => {
    const expected = distanceBoundaryExpected(st, kind);
    const actual = distanceBoundaryActual(st, kind);
    const eToA = cloudDistance(expected, actual);
    const aToE = cloudDistance(actual, expected);
    const maxError = Math.max(eToA.max, aToE.max);
    assert(caseName, `${kind} distance boundary within ${MAX_ALLOWED_MM}mm`, maxError <= MAX_ALLOWED_MM, {
      expectedPoints: expected.length,
      actualPoints: actual.length,
      expectedToActual: eToA,
      actualToExpected: aToE,
      expectedBox: bbox(expected),
      actualBox: bbox(actual)
    });
    return {
      kind,
      expectedPoints: expected.length,
      actualPoints: actual.length,
      maxError,
      p95Error: Math.max(eToA.p95, aToE.p95),
      expectedBox: bbox(expected),
      actualBox: bbox(actual)
    };
  });
}

for (const testCase of cases) {
  const layer = validateLayer(testCase.name, testCase.st);
  const distanceBoundaries = validateDistanceBoundaries(testCase.name, testCase.st);
  summaries.push({
    name: testCase.name,
    source: testCase.source,
    mount: testCase.st.mount,
    wall: testCase.st.wall,
    corner: testCase.st.corner,
    height: testCase.st.height,
    tilt: testCase.st.tilt,
    hAngle: testCase.st.hAngle,
    hFov: testCase.st.hFov,
    vFov: testCase.st.vFov,
    rangePresence: testCase.st.rangePresence,
    rangeMotion: testCase.st.rangeMotion,
    sensor: testCase.st.sensor,
    layer,
    distanceBoundaries
  });
}

const bySource = {};
for (const c of cases) bySource[c.source] = (bySource[c.source] || 0) + 1;
const maxLayerError = Math.max(0, ...summaries.flatMap(s => s.layer.map(L => Number.isFinite(L.maxError) ? L.maxError : Infinity)));
const maxBoundaryError = Math.max(0, ...summaries.flatMap(s => s.distanceBoundaries.map(B => Number.isFinite(B.maxError) ? B.maxError : Infinity)));
const report = {
  method: 'implicit membership + marching squares contour extraction',
  toleranceMm: MAX_ALLOWED_MM,
  room: ROOM,
  grid: GRID,
  cases: cases.length,
  bySource,
  checkedHeights: HEIGHTS,
  maxLayerError,
  maxBoundaryError,
  failures,
  summaries
};
mkdirSync(new URL('../artifacts/', import.meta.url), { recursive: true });
writeFileSync(new URL('../artifacts/implicit-contour-results.json', import.meta.url), JSON.stringify(report, null, 2));

console.log(`IMPLICIT_CONTOUR: ${cases.length} cases, ${failures.length} failures`);
console.log(`IMPLICIT_CONTOUR_SOURCES: ${JSON.stringify(bySource)}`);
console.log(`IMPLICIT_CONTOUR_MAX: ${JSON.stringify({ layer: maxLayerError, distanceBoundary: maxBoundaryError })}`);
if (failures.length) {
  console.log(JSON.stringify(failures.slice(0, 20), null, 2));
  process.exit(1);
}

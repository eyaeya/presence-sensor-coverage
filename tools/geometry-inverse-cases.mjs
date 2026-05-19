import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const sourceFiles = ['geo', 'state', 'render', 'info', 'interact'].map(name => `../src/${name}.js`);
const ctx = {
  console,
  Math, Date, JSON, parseFloat, parseInt, isNaN, isFinite,
  Array, Object, String, Number, Boolean
};
vm.createContext(ctx);
for (const file of sourceFiles) {
  const url = new URL(file, import.meta.url);
  vm.runInContext(readFileSync(url, 'utf8'), ctx, { filename: url.pathname });
}

const { Geo, State, Render } = ctx;
const ROOM = { W: 15000, D: 10000 };
const EPS = 1e-6;
const failures = [];
const results = [];

function rad(d) { return d * Math.PI / 180; }
function approx(a, b, eps = EPS) { return Math.abs(a - b) <= eps; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function baseState(mount) {
  const st = State.defaults();
  State.applyMount(st, mount);
  st.room = clone(ROOM);
  if (mount === 'ceiling') st.sensor = { x: ROOM.W / 2, y: ROOM.D / 2 };
  if (mount === 'side') { st.wall = 'left'; st.sensor = { x: 0, y: ROOM.D / 2 }; }
  if (mount === 'corner') { st.corner = 'bl'; st.sensor = { x: 0, y: 0 }; }
  return st;
}
function fail(caseName, check, detail) {
  failures.push({ caseName, check, detail });
}
function assert(caseName, check, cond, detail) {
  if (!cond) fail(caseName, check, detail);
}
function bbox(poly) {
  if (!poly || poly.length === 0) return null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  return { x0, x1, y0, y1 };
}
function area(poly) {
  if (!poly || poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}
function allFinite(poly) {
  return poly.every(p => Number.isFinite(p.x) && Number.isFinite(p.y));
}
function allInRoom(poly, st, eps = 1e-5) {
  return poly.every(p => p.x >= -eps && p.x <= st.room.W + eps && p.y >= -eps && p.y <= st.room.D + eps);
}
function isPointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    const hit = ((a.y > p.y) !== (b.y > p.y)) &&
      (p.x < (b.x - a.x) * (p.y - a.y) / ((b.y - a.y) || 1e-12) + a.x);
    if (hit) inside = !inside;
  }
  return inside;
}
function sampledFalsePositives(st, h) {
  const fr = Geo.beamFrame(st);
  const aH = Geo.rad(st.hFov / 2), aV = Geo.rad(st.vFov / 2);
  const far = 10 * Math.sqrt(st.room.W * st.room.W + st.room.D * st.room.D);
  const poly = Geo.clipToRoom(Geo.footprint(fr, aH, aV, h, null, far), st.room.W, st.room.D);
  if (poly.length < 3) return { tested: 0, falsePositives: 0, poly };
  const bb = bbox(poly);
  let tested = 0, falsePositives = 0;
  const nx = 30, ny = 22;
  for (let ix = 0; ix <= nx; ix++) {
    for (let iy = 0; iy <= ny; iy++) {
      const p = {
        x: bb.x0 + (bb.x1 - bb.x0) * ix / nx,
        y: bb.y0 + (bb.y1 - bb.y0) * iy / ny
      };
      if (!isPointInPoly(p, poly)) continue;
      tested++;
      if (!Geo.inBeamAtHeight(fr, aH, aV, p, h, 2e-3)) falsePositives++;
    }
  }
  return { tested, falsePositives, poly };
}
function boundaryStats(st, kind) {
  const h = kind === 'presence' ? 750 : 0;
  const R = kind === 'presence' ? st.rangePresence : st.rangeMotion;
  const fr = Geo.beamFrame(st);
  const aH = Geo.rad(st.hFov / 2), aV = Geo.rad(st.vFov / 2);
  const radius = Geo.rangeProjectionRadius(R, fr.S.z, h);
  const segs = Render.boundaryCurveSegments(st, kind);
  let count = 0, minPlan = Infinity, maxPlan = 0, maxRangeErr = 0, maxBeamErr = 0, inRoom = true, finite = true;
  for (const seg of segs) {
    for (const p of seg) {
      count++;
      finite = finite && Number.isFinite(p.x) && Number.isFinite(p.y);
      inRoom = inRoom && allInRoom([p], st, 1e-5);
      const dx = p.x - fr.S.x, dy = p.y - fr.S.y, dz = h - fr.S.z;
      const plan = Math.sqrt(dx * dx + dy * dy);
      minPlan = Math.min(minPlan, plan);
      maxPlan = Math.max(maxPlan, plan);
      maxRangeErr = Math.max(maxRangeErr, Math.abs(Math.sqrt(dx * dx + dy * dy + dz * dz) - R));
      const r = Geo.v3(dx, dy, dz);
      const t = Geo.dot(r, fr.d);
      const du = Geo.dot(r, fr.u) / (t * Math.tan(aH));
      const dv = Geo.dot(r, fr.v) / (t * Math.tan(aV));
      maxBeamErr = Math.max(maxBeamErr, Math.max(0, du * du + dv * dv - 1));
    }
  }
  return { kind, h, R, radius, segments: segs.length, count, minPlan, maxPlan, maxRangeErr, maxBeamErr, inRoom, finite };
}
function highResolutionRangeSamples(st, kind, samples = 7200) {
  const h = kind === 'presence' ? 750 : 0;
  const R = kind === 'presence' ? st.rangePresence : st.rangeMotion;
  const fr = Geo.beamFrame(st);
  const aH = Geo.rad(st.hFov / 2), aV = Geo.rad(st.vFov / 2);
  const radius = Geo.rangeProjectionRadius(R, fr.S.z, h);
  if (radius == null) return { count: 0, longestRun: 0 };
  let count = 0, longestRun = 0, run = 0;
  for (let i = 0; i < samples * 2; i++) {
    const idx = i % samples;
    const a = 2 * Math.PI * idx / samples;
    const p = { x: fr.S.x + radius * Math.cos(a), y: fr.S.y + radius * Math.sin(a) };
    const inside = p.x >= -1e-6 && p.x <= st.room.W + 1e-6 && p.y >= -1e-6 && p.y <= st.room.D + 1e-6 &&
      Geo.inBeamAtHeight(fr, aH, aV, p, h);
    if (i < samples && inside) count++;
    if (inside) {
      run++;
      if (run > longestRun) longestRun = run;
    } else {
      run = 0;
    }
  }
  return { count, longestRun: Math.min(longestRun, samples) };
}
function checkBoundaries(caseName, st) {
  for (const kind of ['presence', 'motion']) {
    const stats = boundaryStats(st, kind);
    if (stats.radius == null) {
      assert(caseName, `${kind} empty when R<=vertical gap`, stats.count === 0, stats);
      continue;
    }
    if (stats.count > 0) {
      assert(caseName, `${kind} range distance`, stats.maxRangeErr <= 1e-6, stats);
      assert(caseName, `${kind} plan radius`, stats.minPlan >= stats.radius - 1e-6 && stats.maxPlan <= stats.radius + 1e-6, stats);
      assert(caseName, `${kind} in room`, stats.inRoom && stats.finite, stats);
      assert(caseName, `${kind} in beam`, stats.maxBeamErr <= 2e-3, stats);
    }
    const hi = highResolutionRangeSamples(st, kind);
    assert(caseName, `${kind} low-res arc not missed`, !(hi.longestRun >= 40 && stats.count === 0), { low: stats, high: hi });
  }
}
function checkLayers(caseName, st) {
  const layers = Render.layerPolys(st);
  let previousArea = Infinity;
  for (let i = layers.length - 1; i >= 0; i--) {
    const L = layers[i];
    assert(caseName, `layer ${L.key} finite`, allFinite(L.poly), L);
    assert(caseName, `layer ${L.key} room clip`, allInRoom(L.poly, st), L);
    const a = area(L.poly);
    if (st.mount === 'ceiling' && Number.isFinite(previousArea)) {
      assert(caseName, `layer ${L.key} nested`, a + 1e-3 >= previousArea, { area: a, previousArea });
    }
    previousArea = a;
  }
}
function checkDirections(caseName, st) {
  const fr = Geo.beamFrame(st);
  const dPlan = Geo.norm(Geo.v3(fr.d.x, fr.d.y, 0));
  let toward = true;
  if (st.mount === 'side') {
    if (st.wall === 'left') toward = dPlan.x > 0;
    if (st.wall === 'right') toward = dPlan.x < 0;
    if (st.wall === 'bottom') toward = dPlan.y > 0;
    if (st.wall === 'top') toward = dPlan.y < 0;
  }
  if (st.mount === 'corner') {
    if (st.corner === 'bl') toward = dPlan.x > 0 && dPlan.y > 0;
    if (st.corner === 'br') toward = dPlan.x < 0 && dPlan.y > 0;
    if (st.corner === 'tl') toward = dPlan.x > 0 && dPlan.y < 0;
    if (st.corner === 'tr') toward = dPlan.x < 0 && dPlan.y < 0;
  }
  assert(caseName, 'beam points into room', toward, { d: fr.d, dPlan });
  assert(caseName, 'orthonormal frame',
    approx(Geo.dot(fr.u, fr.v), 0, 1e-9) && approx(Geo.dot(fr.u, fr.d), 0, 1e-9) &&
    approx(Geo.dot(fr.v, fr.d), 0, 1e-9) && approx(Geo.len(fr.u), 1, 1e-9) &&
    approx(Geo.len(fr.v), 1, 1e-9) && approx(Geo.len(fr.d), 1, 1e-9),
    { u: fr.u, v: fr.v, d: fr.d });
}
function checkCeilingEllipse(caseName, st, h) {
  const fr = Geo.beamFrame(st);
  const aH = Geo.rad(st.hFov / 2), aV = Geo.rad(st.vFov / 2);
  const far = 10 * Math.sqrt(st.room.W * st.room.W + st.room.D * st.room.D);
  const poly = Geo.footprint(fr, aH, aV, h, null, far);
  const delta = st.height - h;
  const ah = delta * Math.tan(aH), av = delta * Math.tan(aV);
  let maxErr = 0;
  for (let i = 0; i < poly.length; i += 15) {
    const p = poly[i];
    const r = Geo.v3(p.x - fr.S.x, p.y - fr.S.y, 0);
    const u = Geo.dot(r, fr.u), v = Geo.dot(r, fr.v);
    maxErr = Math.max(maxErr, Math.abs((u * u) / (ah * ah) + (v * v) / (av * av) - 1));
  }
  assert(caseName, `ceiling ellipse h=${h}`, maxErr < 0.03, { maxErr, ah, av });
}
function checkAnalyticSide(caseName, st, h) {
  const fr = Geo.beamFrame(st);
  const delta = st.height - h;
  const theta = Geo.rad(st.tilt);
  if (theta <= 0) return;
  const dPlan = Geo.norm(Geo.v3(fr.d.x, fr.d.y, 0));
  const center = { x: fr.S.x + dPlan.x * delta / Math.tan(theta), y: fr.S.y + dPlan.y * delta / Math.tan(theta) };
  assert(caseName, `analytic centerline h=${h}`, Geo.inBeamAtHeight(fr, Geo.rad(st.hFov / 2), Geo.rad(st.vFov / 2), center, h), { center });
}
function runCase(caseName, st) {
  checkDirections(caseName, st);
  checkLayers(caseName, st);
  checkBoundaries(caseName, st);
  for (const h of [1200, 750, 600, 0]) {
    const fp = sampledFalsePositives(st, h);
    assert(caseName, `no sampled false positives h=${h}`, fp.falsePositives === 0, {
      tested: fp.tested,
      falsePositives: fp.falsePositives,
      bbox: bbox(fp.poly)
    });
  }
  if (st.mount === 'ceiling') {
    checkCeilingEllipse(caseName, st, Math.min(1200, st.height - 1));
  } else {
    checkAnalyticSide(caseName, st, 750);
  }
  results.push({
    caseName,
    mount: st.mount,
    wall: st.wall,
    corner: st.corner,
    height: st.height,
    tilt: st.tilt,
    hAngle: st.hAngle,
    hFov: st.hFov,
    vFov: st.vFov,
    presence: boundaryStats(st, 'presence'),
    motion: boundaryStats(st, 'motion')
  });
}

const cases = [];
function add(name, st) { cases.push([name, st]); }

for (const height of [2000, 5000]) {
  for (const angle of [0, 90, 360]) {
    for (const fovs of [[90, 45], [160, 90]]) {
      const st = baseState('ceiling');
      Object.assign(st, { height, hAngle: angle, hFov: fovs[0], vFov: fovs[1], rangePresence: 3000, rangeMotion: height === 5000 ? 8000 : 5000 });
      add(`ceiling H${height} angle${angle} F${fovs[0]}/${fovs[1]}`, st);
    }
  }
}

for (const wall of ['left', 'right', 'bottom', 'top']) {
  for (const height of [1000, 2000]) {
    for (const tilt of [0, 30]) {
      for (const angle of [-90, 0, 90]) {
        for (const fovs of [[90, 45], [160, 60]]) {
          const st = baseState('side');
          Object.assign(st, { wall, height, tilt, hAngle: angle, hFov: fovs[0], vFov: fovs[1], rangePresence: 3000, rangeMotion: 8000 });
          if (wall === 'left') st.sensor = { x: 0, y: ROOM.D / 2 };
          if (wall === 'right') st.sensor = { x: ROOM.W, y: ROOM.D / 2 };
          if (wall === 'bottom') st.sensor = { x: ROOM.W / 2, y: 0 };
          if (wall === 'top') st.sensor = { x: ROOM.W / 2, y: ROOM.D };
          add(`side ${wall} H${height} tilt${tilt} angle${angle} F${fovs[0]}/${fovs[1]}`, st);
        }
      }
    }
  }
}

for (const corner of ['bl', 'br', 'tl', 'tr']) {
  for (const height of [1000, 2000]) {
    for (const tilt of [0, 30]) {
      for (const fovs of [[90, 45], [160, 60]]) {
        const st = baseState('corner');
        Object.assign(st, { corner, height, tilt, hFov: fovs[0], vFov: fovs[1], rangePresence: 3000, rangeMotion: 8000 });
        st.sensor = { x: corner[1] === 'l' ? 0 : ROOM.W, y: corner[0] === 'b' ? 0 : ROOM.D };
        add(`corner ${corner} H${height} tilt${tilt} F${fovs[0]}/${fovs[1]}`, st);
      }
    }
  }
}

const repro = baseState('side');
Object.assign(repro, {
  room: { W: 7000, D: 5000 },
  wall: 'bottom',
  sensor: { x: 5829.1370308716705, y: 0 },
  height: 1500,
  tilt: 20,
  hAngle: 0,
  hFov: 160,
  vFov: 60,
  rangePresence: 3000,
  rangeMotion: 5000
});
add('user repro bottom wall h1500', repro);

for (const [name, st] of cases) runCase(name, st);

const report = {
  room: ROOM,
  count: cases.length,
  failures,
  results
};
mkdirSync(new URL('../artifacts/', import.meta.url), { recursive: true });
writeFileSync(new URL('../artifacts/geometry-inverse-results.json', import.meta.url), JSON.stringify(report, null, 2));

console.log(`GEOMETRY_INVERSE: ${cases.length} cases, ${failures.length} failures`);
if (failures.length) {
  console.log(JSON.stringify(failures.slice(0, 12), null, 2));
  process.exit(1);
}

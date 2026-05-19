import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sourceFiles = [...html.matchAll(/<script\b[^>]*\bsrc=(["'])(.*?)\1[^>]*><\/script>/g)]
  .map(m => `../${m[2]}`)
  .filter(file => !file.endsWith('/tests.js') && !file.endsWith('/app.js'));
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
function rangeProjectionRadius(rangeMax, sensorHeight, targetHeight) {
  const dz = targetHeight - sensorHeight;
  if (rangeMax <= Math.abs(dz)) return null;
  return Math.sqrt(rangeMax * rangeMax - dz * dz);
}
function pointInBeamAtHeight(fr, aH, aV, p, h, eps = 5e-4) {
  const r = { x: p.x - fr.S.x, y: p.y - fr.S.y, z: h - fr.S.z };
  const t = r.x * fr.d.x + r.y * fr.d.y + r.z * fr.d.z;
  if (t <= 1e-6) return false;
  const ru = r.x * fr.u.x + r.y * fr.u.y + r.z * fr.u.z;
  const rv = r.x * fr.v.x + r.y * fr.v.y + r.z * fr.v.z;
  const du = ru / (t * Math.tan(aH));
  const dv = rv / (t * Math.tan(aV));
  return du * du + dv * dv <= 1 + eps;
}
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
function sampledFootprintClassification(st, h) {
  const fr = Geo.beamFrame(st);
  const aH = Geo.rad(st.hFov / 2), aV = Geo.rad(st.vFov / 2);
  const far = 10 * Math.sqrt(st.room.W * st.room.W + st.room.D * st.room.D);
  const poly = Geo.clipToRoom(Geo.footprint(fr, aH, aV, h, st.rangeMotion, far), st.room.W, st.room.D);
  const motionRadius = Geo.rangeProjectionRadius(st.rangeMotion, fr.S.z, h);
  let tested = 0, falsePositives = 0, falseNegatives = 0, expectedInside = 0;
  const nx = 36, ny = 24;
  for (let ix = 0; ix <= nx; ix++) {
    for (let iy = 0; iy <= ny; iy++) {
      const p = {
        x: st.room.W * (ix + 0.5) / (nx + 1),
        y: st.room.D * (iy + 0.5) / (ny + 1)
      };
      const inPoly = poly.length >= 3 && isPointInPoly(p, poly);
      const dz = h - fr.S.z;
      const dist3d = Math.sqrt((p.x - fr.S.x) ** 2 + (p.y - fr.S.y) ** 2 + dz * dz);
      const inBeam = pointInBeamAtHeight(fr, aH, aV, p, h, 2e-3);
      const inFiniteLayer = motionRadius !== null && inBeam && dist3d <= st.rangeMotion + 1e-6;
      tested++;
      if (inFiniteLayer) expectedInside++;
      if (inPoly && !inFiniteLayer) falsePositives++;
      if (inFiniteLayer && !inPoly) falseNegatives++;
    }
  }
  return { tested, expectedInside, falsePositives, falseNegatives, poly };
}
function boundaryStats(st, kind) {
  const h = kind === 'presence' ? 750 : 0;
  const R = kind === 'presence' ? st.rangePresence : st.rangeMotion;
  const fr = Geo.beamFrame(st);
  const aH = Geo.rad(st.hFov / 2), aV = Geo.rad(st.vFov / 2);
  const radius = rangeProjectionRadius(R, fr.S.z, h);
  const geoRadius = Geo.rangeProjectionRadius(R, fr.S.z, h);
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
      const r = { x: dx, y: dy, z: dz };
      const t = r.x * fr.d.x + r.y * fr.d.y + r.z * fr.d.z;
      const ru = r.x * fr.u.x + r.y * fr.u.y + r.z * fr.u.z;
      const rv = r.x * fr.v.x + r.y * fr.v.y + r.z * fr.v.z;
      const du = ru / (t * Math.tan(aH));
      const dv = rv / (t * Math.tan(aV));
      maxBeamErr = Math.max(maxBeamErr, t <= 1e-6 ? Infinity : Math.max(0, du * du + dv * dv - 1));
    }
  }
  return { kind, h, R, radius, geoRadius, segments: segs.length, count, minPlan, maxPlan, maxRangeErr, maxBeamErr, inRoom, finite };
}
function highResolutionRangeSamples(st, kind, samples = 7200) {
  const h = kind === 'presence' ? 750 : 0;
  const R = kind === 'presence' ? st.rangePresence : st.rangeMotion;
  const fr = Geo.beamFrame(st);
  const aH = Geo.rad(st.hFov / 2), aV = Geo.rad(st.vFov / 2);
  const radius = rangeProjectionRadius(R, fr.S.z, h);
  if (radius == null) return { count: 0, longestRun: 0 };
  let count = 0, longestRun = 0, run = 0;
  for (let i = 0; i < samples * 2; i++) {
    const idx = i % samples;
    const a = 2 * Math.PI * idx / samples;
    const p = { x: fr.S.x + radius * Math.cos(a), y: fr.S.y + radius * Math.sin(a) };
    const inside = p.x >= -1e-6 && p.x <= st.room.W + 1e-6 && p.y >= -1e-6 && p.y <= st.room.D + 1e-6 &&
      pointInBeamAtHeight(fr, aH, aV, p, h);
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
    assert(caseName, `${kind} Geo radius helper`, stats.radius === null ? stats.geoRadius === null : approx(stats.radius, stats.geoRadius, 1e-9), stats);
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
    assert(caseName, `${kind} rendered arc not missed`, !(hi.count > 0 && stats.count === 0), { low: stats, high: hi });
  }
}
function checkLayers(caseName, st) {
  const layers = Render.layerPolys(st);
  const fr = Geo.beamFrame(st);
  for (let i = 0; i < layers.length; i++) {
    const L = layers[i];
    assert(caseName, `layer ${L.key} finite`, allFinite(L.poly), L);
    assert(caseName, `layer ${L.key} room clip`, allInRoom(L.poly, st), L);
    const radius = Geo.rangeProjectionRadius(st.rangeMotion, fr.S.z, L.h);
    if (radius == null) {
      assert(caseName, `layer ${L.key} empty beyond motion range`, L.poly.length === 0, L);
      continue;
    }
    let maxRangeErr = 0;
    for (const p of L.poly) {
      const dx = p.x - fr.S.x, dy = p.y - fr.S.y, dz = L.h - fr.S.z;
      maxRangeErr = Math.max(maxRangeErr, Math.sqrt(dx * dx + dy * dy + dz * dz) - st.rangeMotion);
    }
    assert(caseName, `layer ${L.key} within motion range`, maxRangeErr <= 1e-3, { maxRangeErr, layer: L });
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
  assert(caseName, `analytic centerline h=${h}`, pointInBeamAtHeight(fr, Geo.rad(st.hFov / 2), Geo.rad(st.vFov / 2), center, h), { center });
}
function footprintPoly(st, h) {
  const fr = Geo.beamFrame(st);
  const far = 10 * Math.sqrt(st.room.W * st.room.W + st.room.D * st.room.D);
  return Geo.clipToRoom(Geo.footprint(fr, Geo.rad(st.hFov / 2), Geo.rad(st.vFov / 2), h, st.rangeMotion, far), st.room.W, st.room.D);
}
function checkMirrorEquivalence(caseName, a, b, mirrorPoint) {
  for (const h of [1200, 750, 600, 0]) {
    const pa = footprintPoly(a, h);
    const pb = footprintPoly(b, h);
    assert(caseName, `mirror area h=${h}`, approx(area(pa), area(pb), Math.max(2, area(pa) * 1e-5)), { areaA: area(pa), areaB: area(pb) });
    const nx = 24, ny = 16;
    let mismatches = 0, tested = 0;
    for (let ix = 0; ix <= nx; ix++) {
      for (let iy = 0; iy <= ny; iy++) {
        const p = { x: a.room.W * (ix + 0.5) / (nx + 1), y: a.room.D * (iy + 0.5) / (ny + 1) };
        const q = mirrorPoint(p);
        const inA = pa.length >= 3 && isPointInPoly(p, pa);
        const inB = pb.length >= 3 && isPointInPoly(q, pb);
        if (inA !== inB) mismatches++;
        tested++;
      }
    }
    assert(caseName, `mirror footprint classification h=${h}`, mismatches === 0, { tested, mismatches });
  }
  for (const kind of ['presence', 'motion']) {
    const sa = boundaryStats(a, kind);
    const sb = boundaryStats(b, kind);
    assert(caseName, `mirror ${kind} radius`, sa.radius === null ? sb.radius === null : approx(sa.radius, sb.radius, 1e-9), { sa, sb });
    assert(caseName, `mirror ${kind} rendered count`, sa.count === sb.count, { sa, sb });
  }
}
function runCase(caseName, st) {
  checkDirections(caseName, st);
  checkLayers(caseName, st);
  checkBoundaries(caseName, st);
  for (const h of [1200, 750, 600, 0]) {
    const fp = sampledFootprintClassification(st, h);
    const allowedFalseNegatives = Math.max(8, Math.ceil(fp.expectedInside * 0.03));
    const sampleOk = fp.expectedInside > 0
      ? fp.falsePositives === 0 && fp.falseNegatives < fp.expectedInside && fp.falseNegatives <= allowedFalseNegatives
      : fp.falsePositives === 0;
    assert(caseName, `sampled finite footprint matches beam and motion range h=${h}`,
      sampleOk, {
      tested: fp.tested,
      expectedInside: fp.expectedInside,
      falsePositives: fp.falsePositives,
      falseNegatives: fp.falseNegatives,
      allowedFalseNegatives,
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
  for (const angle of [0, 90, 359, 360]) {
    for (const fovs of [[90, 45], [160, 90]]) {
      for (const ranges of [[3000, 5000], [5000, 8000]]) {
        for (const pos of [
          ['center', { x: ROOM.W / 2, y: ROOM.D / 2 }],
          ['near-wall', { x: 900, y: 800 }]
        ]) {
          const st = baseState('ceiling');
          Object.assign(st, { sensor: clone(pos[1]), height, hAngle: angle, hFov: fovs[0], vFov: fovs[1], rangePresence: ranges[0], rangeMotion: ranges[1] });
          add(`ceiling ${pos[0]} H${height} angle${angle} F${fovs[0]}/${fovs[1]} R${ranges[0]}/${ranges[1]}`, st);
        }
      }
    }
  }
}

for (const wall of ['left', 'right', 'bottom', 'top']) {
  for (const height of [1000, 2000]) {
    for (const tilt of [0, 30]) {
      for (const angle of [-90, 0, 90]) {
        for (const fovs of [[90, 45], [160, 60]]) {
          for (const ranges of [[3000, 5000], [5000, 8000]]) {
            const st = baseState('side');
            Object.assign(st, { wall, height, tilt, hAngle: angle, hFov: fovs[0], vFov: fovs[1], rangePresence: ranges[0], rangeMotion: ranges[1] });
            if (wall === 'left') st.sensor = { x: 0, y: ROOM.D / 2 };
            if (wall === 'right') st.sensor = { x: ROOM.W, y: ROOM.D / 2 };
            if (wall === 'bottom') st.sensor = { x: ROOM.W / 2, y: 0 };
            if (wall === 'top') st.sensor = { x: ROOM.W / 2, y: ROOM.D };
            add(`side ${wall} H${height} tilt${tilt} angle${angle} F${fovs[0]}/${fovs[1]} R${ranges[0]}/${ranges[1]}`, st);
          }
        }
      }
    }
  }
}

for (const corner of ['bl', 'br', 'tl', 'tr']) {
  for (const height of [1000, 2000]) {
    for (const tilt of [0, 30]) {
      for (const fovs of [[90, 45], [160, 60]]) {
        for (const ranges of [[3000, 5000], [5000, 8000]]) {
          const st = baseState('corner');
          Object.assign(st, { corner, height, tilt, hFov: fovs[0], vFov: fovs[1], rangePresence: ranges[0], rangeMotion: ranges[1] });
          st.sensor = { x: corner[1] === 'l' ? 0 : ROOM.W, y: corner[0] === 'b' ? 0 : ROOM.D };
          add(`corner ${corner} H${height} tilt${tilt} F${fovs[0]}/${fovs[1]} R${ranges[0]}/${ranges[1]}`, st);
        }
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

const sideLeft = baseState('side');
Object.assign(sideLeft, { wall: 'left', sensor: { x: 0, y: 4200 }, height: 1800, tilt: 20, hAngle: 35, hFov: 120, vFov: 60, rangePresence: 3000, rangeMotion: 5000 });
const sideRight = baseState('side');
Object.assign(sideRight, { wall: 'right', sensor: { x: ROOM.W, y: 4200 }, height: 1800, tilt: 20, hAngle: -35, hFov: 120, vFov: 60, rangePresence: 3000, rangeMotion: 5000 });
checkMirrorEquivalence('mirror side left/right', sideLeft, sideRight, p => ({ x: ROOM.W - p.x, y: p.y }));

const sideBottom = baseState('side');
Object.assign(sideBottom, { wall: 'bottom', sensor: { x: 6100, y: 0 }, height: 1800, tilt: 20, hAngle: 35, hFov: 120, vFov: 60, rangePresence: 3000, rangeMotion: 5000 });
const sideTop = baseState('side');
Object.assign(sideTop, { wall: 'top', sensor: { x: 6100, y: ROOM.D }, height: 1800, tilt: 20, hAngle: -35, hFov: 120, vFov: 60, rangePresence: 3000, rangeMotion: 5000 });
checkMirrorEquivalence('mirror side bottom/top', sideBottom, sideTop, p => ({ x: p.x, y: ROOM.D - p.y }));

const cornerBL = baseState('corner');
Object.assign(cornerBL, { corner: 'bl', sensor: { x: 0, y: 0 }, height: 1800, tilt: 20, hFov: 120, vFov: 60, rangePresence: 3000, rangeMotion: 5000 });
const cornerBR = baseState('corner');
Object.assign(cornerBR, { corner: 'br', sensor: { x: ROOM.W, y: 0 }, height: 1800, tilt: 20, hFov: 120, vFov: 60, rangePresence: 3000, rangeMotion: 5000 });
checkMirrorEquivalence('mirror corner bl/br', cornerBL, cornerBR, p => ({ x: ROOM.W - p.x, y: p.y }));

const cornerTL = baseState('corner');
Object.assign(cornerTL, { corner: 'tl', sensor: { x: 0, y: ROOM.D }, height: 1800, tilt: 20, hFov: 120, vFov: 60, rangePresence: 3000, rangeMotion: 5000 });
checkMirrorEquivalence('mirror corner bl/tl', cornerBL, cornerTL, p => ({ x: p.x, y: ROOM.D - p.y }));

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

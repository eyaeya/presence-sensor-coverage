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
const ROOM_EPS = 1e-3;
const HEIGHTS = [
  { key: 'ground', h: 0 },
  { key: 'lie', h: 600 },
  { key: 'sit', h: 750 },
  { key: 'stand', h: 1200 }
];
const failures = [];
const summaries = [];

function rad(d) { return d * Math.PI / 180; }
function v(x, y, z) { return { x, y, z }; }
function add(a, b) { return v(a.x + b.x, a.y + b.y, a.z + b.z); }
function sub(a, b) { return v(a.x - b.x, a.y - b.y, a.z - b.z); }
function scale(a, s) { return v(a.x * s, a.y * s, a.z * s); }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) { return v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
function len(a) { return Math.sqrt(dot(a, a)); }
function norm(a) { const L = len(a) || 1; return scale(a, 1 / L); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function fail(caseName, check, detail) { failures.push({ caseName, check, detail }); }
function assert(caseName, check, cond, detail) { if (!cond) fail(caseName, check, detail); }
function sqr(x) { return x * x; }
function rangeRadius(range, sensorHeight, h) {
  const dz = h - sensorHeight;
  if (range <= Math.abs(dz)) return null;
  return Math.sqrt(range * range - dz * dz);
}

function independentFrame(st) {
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
  let a, S;
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

function expectedMetrics(st, h, p, range) {
  const fr = independentFrame(st);
  const r = v(p.x - fr.S.x, p.y - fr.S.y, h - fr.S.z);
  const t = dot(r, fr.d);
  const tanH = Math.tan(rad(st.hFov / 2));
  const tanV = Math.tan(rad(st.vFov / 2));
  const du = t > 1e-9 ? dot(r, fr.u) / (t * tanH) : Infinity;
  const dv = t > 1e-9 ? dot(r, fr.w) / (t * tanV) : Infinity;
  const cone = du * du + dv * dv;
  const dist = len(r);
  const inRoom = p.x >= -ROOM_EPS && p.x <= st.room.W + ROOM_EPS && p.y >= -ROOM_EPS && p.y <= st.room.D + ROOM_EPS;
  return {
    t, cone, dist, inRoom,
    inBeam: t > 1e-9 && cone <= 1 + 1e-7,
    inFinite: t > 1e-9 && cone <= 1 + 1e-7 && rangeRadius(range, fr.S.z, h) !== null && dist <= range + 1e-7 && inRoom
  };
}

function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    const hit = ((a.y > p.y) !== (b.y > p.y)) &&
      (p.x < (b.x - a.x) * (p.y - a.y) / ((b.y - a.y) || 1e-12) + a.x);
    if (hit) inside = !inside;
  }
  return inside;
}

function polyArea(poly) {
  if (!poly || poly.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

function angleDelta(a, b) {
  let d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
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

function cornerSensor(corner) {
  return { x: corner[1] === 'l' ? 0 : ROOM.W, y: corner[0] === 'b' ? 0 : ROOM.D };
}

function sideSensor(wall, pos) {
  if (wall === 'left') return { x: 0, y: pos };
  if (wall === 'right') return { x: ROOM.W, y: pos };
  if (wall === 'bottom') return { x: pos, y: 0 };
  return { x: pos, y: ROOM.D };
}

function validateLayer(caseName, st) {
  const layers = Render.layerPolys(st);
  const byHeight = new Map(layers.map(L => [L.h, L]));
  let totalArea = 0;
  for (const H of HEIGHTS) {
    const L = byHeight.get(H.h);
    const poly = L ? L.poly : [];
    totalArea += polyArea(poly);
    const rr = rangeRadius(st.rangeMotion, st.height, H.h);
    if (rr === null) {
      assert(caseName, `layer ${H.key} empty when motion sphere misses height`, poly.length === 0, { h: H.h, rangeMotion: st.rangeMotion, height: st.height });
      continue;
    }
    for (const p of poly) {
      const m = expectedMetrics(st, H.h, p, st.rangeMotion);
      assert(caseName, `layer ${H.key} vertex in room`, m.inRoom && Number.isFinite(p.x) && Number.isFinite(p.y), { h: H.h, p });
      assert(caseName, `layer ${H.key} vertex within motion range`, m.dist <= st.rangeMotion + 2e-3, { h: H.h, p, dist: m.dist, range: st.rangeMotion });
      assert(caseName, `layer ${H.key} vertex within cone`, m.dist <= 1e-6 || m.cone <= 1.03 || Math.abs(m.dist - st.rangeMotion) <= 3, { h: H.h, p, cone: m.cone, dist: m.dist });
    }

    let strongInside = 0, missedStrongInside = 0, strongOutsideHit = 0, sampled = 0;
    const grid = 35;
    for (let ix = 0; ix <= grid; ix++) {
      for (let iy = 0; iy <= grid; iy++) {
        const p = { x: st.room.W * (ix + 0.5) / (grid + 1), y: st.room.D * (iy + 0.5) / (grid + 1) };
        const m = expectedMetrics(st, H.h, p, st.rangeMotion);
        const actual = poly.length >= 3 && pointInPoly(p, poly);
        const deepInside = m.inFinite && m.cone < 0.965 && m.dist < st.rangeMotion - 35;
        const deepOutside = !m.inRoom || m.t <= 1e-9 || m.cone > 1.08 || m.dist > st.rangeMotion + 35;
        sampled++;
        if (deepInside) {
          strongInside++;
          if (!actual) missedStrongInside++;
        }
        if (deepOutside && actual) strongOutsideHit++;
      }
    }
    assert(caseName, `layer ${H.key} grid strong-inside coverage`, missedStrongInside === 0, { h: H.h, strongInside, missedStrongInside, sampled, area: polyArea(poly) });
    assert(caseName, `layer ${H.key} grid strong-outside exclusion`, strongOutsideHit === 0, { h: H.h, strongOutsideHit, sampled, area: polyArea(poly) });
  }
  return { totalArea };
}

function validateBoundary(caseName, st, kind) {
  const h = kind === 'presence' ? 750 : 0;
  const R = kind === 'presence' ? st.rangePresence : st.rangeMotion;
  const fr = independentFrame(st);
  const rr = rangeRadius(R, st.height, h);
  const segs = Render.boundaryCurveSegments(st, kind);
  const flat = segs.flat();
  if (rr === null) {
    assert(caseName, `${kind} boundary empty when sphere misses height`, flat.length === 0, { h, R, height: st.height });
    return { expectedAngles: 0, actualPoints: flat.length };
  }
  for (const p of flat) {
    const m = expectedMetrics(st, h, p, R);
    assert(caseName, `${kind} boundary point in room`, m.inRoom, { h, p });
    assert(caseName, `${kind} boundary point on distance sphere`, Math.abs(m.dist - R) <= 2e-3, { h, p, dist: m.dist, R });
    assert(caseName, `${kind} boundary point in beam`, m.cone <= 1.01, { h, p, cone: m.cone });
  }
  const actualAngles = flat.map(p => Math.atan2(p.y - fr.S.y, p.x - fr.S.x));
  let expected = 0, stable = 0, missingStable = 0;
  const N = 1440;
  const expectedAt = (i) => {
    const a = 2 * Math.PI * ((i + N) % N) / N;
    const p = { x: fr.S.x + rr * Math.cos(a), y: fr.S.y + rr * Math.sin(a) };
    const m = expectedMetrics(st, h, p, R);
    return m.inRoom && m.inBeam;
  };
  for (let i = 0; i < N; i++) {
    if (!expectedAt(i)) continue;
    expected++;
    if (!(expectedAt(i - 1) && expectedAt(i + 1))) continue;
    stable++;
    const a = 2 * Math.PI * i / N;
    const covered = actualAngles.some(x => angleDelta(x, a) <= 2 * Math.PI / N + 1e-4);
    if (!covered) missingStable++;
  }
  assert(caseName, `${kind} boundary exists iff expected arc exists`, expected === 0 ? flat.length === 0 : flat.length > 0, { expected, actualPoints: flat.length });
  assert(caseName, `${kind} stable expected arc coverage`, missingStable <= Math.max(2, Math.ceil(stable * 0.015)), { expected, stable, missingStable, actualPoints: flat.length });
  return { expectedAngles: expected, stable, actualPoints: flat.length };
}

function validateCase(testCase) {
  const { name, st, source } = testCase;
  const layer = validateLayer(name, st);
  const presence = validateBoundary(name, st, 'presence');
  const motion = validateBoundary(name, st, 'motion');
  summaries.push({
    name, source, mount: st.mount, wall: st.wall, corner: st.corner,
    height: st.height, tilt: st.tilt, hAngle: st.hAngle, hFov: st.hFov, vFov: st.vFov,
    sensor: st.sensor, layerTotalArea: layer.totalArea,
    presence, motion
  });
}

const cases = [];
function addCase(source, name, st) { cases.push({ source, name, st: clone(st) }); }

const ceilingPositions = [
  ['center', { x: 3500, y: 3500 }],
  ['near-left-top', { x: 900, y: 6100 }],
  ['near-corner', { x: 650, y: 650 }]
];
for (const [posName, sensor] of ceilingPositions) {
  for (const height of [2000, 2400, 5000]) {
    for (const angle of [0, 45, 90, 359]) {
      for (const fov of [[90, 45], [160, 90]]) {
        for (const range of [[3000, 5000], [5000, 8000]]) {
          const st = makeBase('ceiling');
          Object.assign(st, { sensor: clone(sensor), height, hAngle: angle, hFov: fov[0], vFov: fov[1], rangePresence: range[0], rangeMotion: range[1] });
          addCase('ceiling-analytic', `ceiling ${posName} H${height} A${angle} F${fov[0]}/${fov[1]} R${range[0]}/${range[1]}`, st);
        }
      }
    }
  }
}

const agentCeilingCases = [
  ['TC01', { x: 3500, y: 3500 }, 2400, 0, 90, 90, 2400, 5000],
  ['TC02', { x: 3500, y: 3500 }, 2400, 45, 120, 60, 1800, 3000],
  ['TC03', { x: 3500, y: 3500 }, 2000, 90, 30, 100, 800, 2000],
  ['TC04', { x: 3500, y: 3500 }, 5000, 135, 10, 10, 4990, 5100],
  ['TC05', { x: 3500, y: 3500 }, 5000, 359, 160, 20, 5200, 12000],
  ['TC06', { x: 200, y: 3500 }, 2400, 0, 90, 90, 3000, 3000],
  ['TC07', { x: 3500, y: 6800 }, 2400, 90, 120, 60, 2600, 2600],
  ['TC08', { x: 200, y: 200 }, 2400, 45, 90, 90, 2600, 2600],
  ['TC09', { x: 6800, y: 6800 }, 2400, 135, 120, 40, 2200, 8000],
  ['TC10', { x: 1234, y: 5678 }, 2400, 359, 80, 110, 1900, 2600],
  ['TC11', { x: 3500, y: 3500 }, 1250, 0, 90, 90, 10, 50],
  ['TC12', { x: 3500, y: 3500 }, 1200, 45, 90, 90, 0, 100],
  ['TC13', { x: 3500, y: 3500 }, 2400, 45, 5, 80, 1650, 1649],
  ['TC14', { x: 6000, y: 1000 }, 2000, 135, 170, 170, 2100, 10000],
  ['TC15', { x: 200, y: 6800 }, 5000, 45, 60, 120, 3800, 5000],
  ['TC16', { x: 6800, y: 200 }, 5000, 90, 150, 30, 4300, 4240],
  ['TC17', { x: 3500, y: 3500 }, 2400, 0, 1, 179, 8000, 8000],
  ['TC18', { x: 3500, y: 3500 }, 2400, 0, 179, 1, 8000, 8000],
  ['TC19', { x: 1000, y: 3500 }, 2400, 90, 60, 140, 1800, 2400],
  ['TC20', { x: 3500, y: 1000 }, 5000, 0, 30, 150, 4250, 4250]
];
for (const [id, sensor, height, hAngle, hFov, vFov, rangePresence, rangeMotion] of agentCeilingCases) {
  const st = makeBase('ceiling');
  Object.assign(st, { sensor: clone(sensor), height, hAngle, hFov, vFov, rangePresence, rangeMotion });
  addCase('agent-ceiling-oracle', `agent ${id} ceiling H${height} A${hAngle} F${hFov}/${vFov} R${rangePresence}/${rangeMotion}`, st);
}

const sideCombos = [
  { height: 1000, tilt: 0, hAngle: 0, fov: [90, 45], range: [3000, 5000] },
  { height: 1500, tilt: 10, hAngle: -45, fov: [160, 60], range: [3000, 5000] },
  { height: 1500, tilt: 20, hAngle: 45, fov: [160, 90], range: [5000, 8000] },
  { height: 2000, tilt: 30, hAngle: -90, fov: [90, 45], range: [3000, 5000] },
  { height: 2000, tilt: 30, hAngle: 90, fov: [160, 60], range: [5000, 8000] }
];
for (const wall of ['left', 'right', 'bottom', 'top']) {
  for (const pos of [850, 3500, 6150]) {
    for (const combo of sideCombos) {
      const st = makeBase('side');
      Object.assign(st, { wall, sensor: sideSensor(wall, pos), height: combo.height, tilt: combo.tilt, hAngle: combo.hAngle, hFov: combo.fov[0], vFov: combo.fov[1], rangePresence: combo.range[0], rangeMotion: combo.range[1] });
      addCase('side-section', `side ${wall} pos${pos} H${combo.height} T${combo.tilt} A${combo.hAngle} F${combo.fov[0]}/${combo.fov[1]} R${combo.range[0]}/${combo.range[1]}`, st);
    }
  }
}

const agentSideCases = [
  ['B01', 'left', { x: 0, y: 3500 }, 1500, 20, 0, 90, 45, 3000, 5000],
  ['B02', 'right', { x: 7000, y: 3500 }, 1500, 20, 0, 90, 45, 3000, 5000],
  ['B03', 'bottom', { x: 3500, y: 0 }, 1500, 20, 0, 90, 45, 3000, 5000],
  ['B04', 'top', { x: 3500, y: 7000 }, 1500, 20, 0, 90, 45, 3000, 5000],
  ['B05', 'left', { x: 0, y: 3500 }, 1000, 0, 90, 90, 45, 3000, 5000],
  ['B06', 'right', { x: 7000, y: 3500 }, 1000, 0, -90, 90, 45, 3000, 5000],
  ['B07', 'bottom', { x: 3500, y: 0 }, 1000, 0, 90, 90, 45, 3000, 5000],
  ['B08', 'top', { x: 3500, y: 7000 }, 1000, 0, -90, 90, 45, 3000, 5000],
  ['B09', 'left', { x: 0, y: 100 }, 1000, 20, -90, 120, 90, 1050, 2000],
  ['B10', 'right', { x: 7000, y: 6900 }, 1000, 20, -90, 120, 90, 1050, 2000],
  ['B11', 'bottom', { x: 6900, y: 0 }, 1000, 20, -90, 120, 90, 1050, 2000],
  ['B12', 'top', { x: 100, y: 7000 }, 1000, 20, -90, 120, 90, 1050, 2000],
  ['B13', 'left', { x: 0, y: 6900 }, 2000, 20, 90, 120, 90, 1050, 2000],
  ['B14', 'right', { x: 7000, y: 100 }, 2000, 20, 90, 120, 90, 1050, 2000],
  ['B15', 'bottom', { x: 100, y: 0 }, 2000, 20, 90, 120, 90, 1050, 2000],
  ['B16', 'top', { x: 6900, y: 7000 }, 2000, 20, 90, 120, 90, 1050, 2000],
  ['B17', 'left', { x: 0, y: 100 }, 1500, 30, -45, 160, 120, 3000, 5000],
  ['B18', 'right', { x: 7000, y: 6900 }, 1500, 30, -45, 160, 120, 3000, 5000],
  ['B19', 'bottom', { x: 6900, y: 0 }, 1500, 30, -45, 160, 120, 3000, 5000],
  ['B20', 'top', { x: 100, y: 7000 }, 1500, 30, -45, 160, 120, 3000, 5000],
  ['B21', 'left', { x: 0, y: 6900 }, 1500, 30, 45, 160, 120, 3000, 5000],
  ['B22', 'right', { x: 7000, y: 100 }, 1500, 30, 45, 160, 120, 3000, 5000],
  ['B23', 'bottom', { x: 100, y: 0 }, 1500, 30, 45, 160, 120, 3000, 5000],
  ['B24', 'top', { x: 6900, y: 7000 }, 1500, 30, 45, 160, 120, 3000, 5000],
  ['B25', 'left', { x: 0, y: 3500 }, 1000, 0, 0, 90, 45, 999, 1000],
  ['B26', 'right', { x: 7000, y: 3500 }, 1000, 0, 0, 90, 45, 1000, 1001],
  ['B27', 'bottom', { x: 3500, y: 0 }, 1500, 0, 0, 120, 90, 1499, 1500],
  ['B28', 'top', { x: 3500, y: 7000 }, 1500, 0, 0, 120, 90, 1500, 1501],
  ['B29', 'left', { x: 0, y: 100 }, 2000, 30, 0, 90, 45, 1050, 2000],
  ['B30', 'right', { x: 7000, y: 6900 }, 2000, 30, 0, 90, 45, 1050, 2000],
  ['B31', 'bottom', { x: 100, y: 0 }, 2000, 30, 0, 90, 45, 1050, 2000],
  ['B32', 'top', { x: 6900, y: 7000 }, 2000, 30, 0, 90, 45, 1050, 2000],
  ['B33', 'left', { x: 0, y: 100 }, 1000, 30, 90, 160, 120, 1050, 2000],
  ['B34', 'right', { x: 7000, y: 6900 }, 1000, 30, -90, 160, 120, 1050, 2000],
  ['B35', 'bottom', { x: 100, y: 0 }, 1000, 30, 90, 160, 120, 1050, 2000],
  ['B36', 'top', { x: 6900, y: 7000 }, 1000, 30, -90, 160, 120, 1050, 2000],
  ['B37', 'left', { x: 0, y: 3500 }, 2000, 20, 45, 120, 90, 3000, 5000],
  ['B38', 'right', { x: 7000, y: 3500 }, 2000, 20, -45, 120, 90, 3000, 5000],
  ['B39', 'bottom', { x: 3500, y: 0 }, 2000, 20, 45, 120, 90, 3000, 5000],
  ['B40', 'top', { x: 3500, y: 7000 }, 2000, 20, -45, 120, 90, 3000, 5000]
];
for (const [id, wall, sensor, height, tilt, hAngle, hFov, vFov, rangePresence, rangeMotion] of agentSideCases) {
  const st = makeBase('side');
  Object.assign(st, { wall, sensor: clone(sensor), height, tilt, hAngle, hFov, vFov, rangePresence, rangeMotion });
  addCase('agent-side-oracle', `agent ${id} side ${wall} H${height} T${tilt} A${hAngle} F${hFov}/${vFov} R${rangePresence}/${rangeMotion}`, st);
}

for (const corner of ['bl', 'br', 'tl', 'tr']) {
  for (const combo of [
    { height: 1000, tilt: 0, fov: [90, 45], range: [3000, 5000] },
    { height: 1800, tilt: 20, fov: [160, 60], range: [3000, 5000] },
    { height: 2000, tilt: 30, fov: [160, 90], range: [5000, 8000] }
  ]) {
    const st = makeBase('corner');
    Object.assign(st, { corner, height: combo.height, tilt: combo.tilt, hFov: combo.fov[0], vFov: combo.fov[1], rangePresence: combo.range[0], rangeMotion: combo.range[1] });
    st.sensor = cornerSensor(corner);
    addCase('corner-symmetry', `corner ${corner} H${combo.height} T${combo.tilt} F${combo.fov[0]}/${combo.fov[1]} R${combo.range[0]}/${combo.range[1]}`, st);
  }
}

const agentCornerCases = [
  ['C01', 'bl', 1000, 0, 60, 45, 1050, 2000],
  ['C02', 'br', 1000, 20, 90, 45, 1050, 2000],
  ['C03', 'tl', 1000, 30, 120, 90, 3000, 5000],
  ['C04', 'tr', 1000, 20, 160, 120, 5000, 8000],
  ['C05', 'bl', 1000, 30, 90, 45, 250, 1000],
  ['C06', 'br', 1000, 0, 160, 120, 3000, 5000],
  ['C07', 'tl', 1000, 20, 60, 45, 3000, 5000],
  ['C08', 'tr', 1000, 30, 120, 90, 1050, 2000],
  ['C09', 'bl', 1500, 0, 90, 45, 1050, 2000],
  ['C10', 'br', 1500, 20, 120, 90, 1050, 2000],
  ['C11', 'tl', 1500, 30, 160, 120, 3000, 5000],
  ['C12', 'tr', 1500, 20, 60, 45, 5000, 8000],
  ['C13', 'bl', 1500, 30, 90, 45, 900, 1500],
  ['C14', 'br', 1500, 0, 120, 90, 3000, 5000],
  ['C15', 'tl', 1500, 20, 160, 120, 1050, 2000],
  ['C16', 'tr', 1500, 30, 60, 45, 5000, 8000],
  ['C17', 'bl', 1800, 0, 120, 90, 1050, 2000],
  ['C18', 'br', 1800, 20, 160, 120, 1050, 2000],
  ['C19', 'tl', 1800, 30, 60, 45, 3000, 5000],
  ['C20', 'tr', 1800, 20, 90, 45, 5000, 8000],
  ['C21', 'bl', 1800, 30, 160, 120, 1200, 1800],
  ['C22', 'br', 1800, 0, 60, 45, 3000, 5000],
  ['C23', 'tl', 1800, 20, 120, 90, 5000, 8000],
  ['C24', 'tr', 1800, 30, 90, 45, 1050, 2000],
  ['C25', 'bl', 2000, 0, 160, 120, 1050, 2000],
  ['C26', 'br', 2000, 20, 60, 45, 1050, 2000],
  ['C27', 'tl', 2000, 30, 90, 45, 3000, 5000],
  ['C28', 'tr', 2000, 20, 120, 90, 5000, 8000],
  ['C29', 'bl', 2000, 30, 60, 45, 800, 1400],
  ['C30', 'br', 2000, 0, 90, 45, 3000, 5000],
  ['C31', 'tl', 2000, 20, 160, 120, 1050, 2000],
  ['C32', 'tr', 2000, 30, 120, 90, 5000, 8000]
];
for (const [id, corner, height, tilt, hFov, vFov, rangePresence, rangeMotion] of agentCornerCases) {
  const st = makeBase('corner');
  Object.assign(st, { corner, sensor: cornerSensor(corner), height, tilt, hFov, vFov, rangePresence, rangeMotion });
  addCase('agent-corner-oracle', `agent ${id} corner ${corner} H${height} T${tilt} F${hFov}/${vFov} R${rangePresence}/${rangeMotion}`, st);
}

for (const st of [
  Object.assign(makeBase('ceiling'), { height: 5000, hAngle: 0, hFov: 160, vFov: 90, rangePresence: 3000, rangeMotion: 5000 }),
  Object.assign(makeBase('side'), { wall: 'bottom', sensor: { x: 6500, y: 0 }, height: 2000, tilt: 0, hAngle: 90, hFov: 160, vFov: 90, rangePresence: 3000, rangeMotion: 5000 }),
  Object.assign(makeBase('side'), { wall: 'left', sensor: { x: 0, y: 6500 }, height: 1000, tilt: 30, hAngle: -90, hFov: 160, vFov: 60, rangePresence: 3000, rangeMotion: 8000 }),
  Object.assign(makeBase('corner'), { corner: 'tr', sensor: { x: 7000, y: 7000 }, height: 2000, tilt: 0, hFov: 160, vFov: 90, rangePresence: 3000, rangeMotion: 5000 })
]) {
  addCase('adversarial-boundary', `adversarial ${st.mount} ${st.wall || st.corner} H${st.height} T${st.tilt} A${st.hAngle}`, st);
}

const distanceBoundaryCases = [
  ['D03-ceiling-presence-2400-3000', 'ceiling', { height: 2400, rangePresence: 3000, rangeMotion: 5000, hFov: 160, vFov: 120 }],
  ['D07-ceiling-presence-small-rr', 'ceiling', { height: 2700, rangePresence: 2000, rangeMotion: 5000, hFov: 160, vFov: 120 }],
  ['D09-ceiling-motion-degenerate', 'ceiling', { height: 3000, rangePresence: 5000, rangeMotion: 3000, hFov: 160, vFov: 120 }],
  ['D10-ceiling-motion-600-degenerate', 'ceiling', { height: 3000, rangePresence: 2250, rangeMotion: 2400, hFov: 160, vFov: 120 }],
  ['D12-ceiling-motion-1200-degenerate', 'ceiling', { height: 3000, rangePresence: 2250, rangeMotion: 1800, hFov: 160, vFov: 120 }],
  ['D21-side-motion-1800-3000', 'side', { wall: 'left', sensor: { x: 0, y: 3500 }, height: 1800, tilt: 20, hAngle: 0, rangePresence: 3000, rangeMotion: 3000, hFov: 160, vFov: 120 }],
  ['D22-side-motion-layer-600', 'side', { wall: 'bottom', sensor: { x: 3500, y: 0 }, height: 1800, tilt: 20, hAngle: 0, rangePresence: 3000, rangeMotion: 3000, hFov: 160, vFov: 120 }],
  ['D23-side-user-presence-1800-3000', 'side', { wall: 'left', sensor: { x: 0, y: 3500 }, height: 1800, tilt: 20, hAngle: 0, rangePresence: 3000, rangeMotion: 5000, hFov: 160, vFov: 120 }],
  ['D32-side-motion-degenerate-above', 'side', { wall: 'left', sensor: { x: 0, y: 3500 }, height: 600, tilt: 0, hAngle: 0, rangePresence: 600, rangeMotion: 600, hFov: 160, vFov: 120 }],
  ['D35-corner-presence-2400-3000', 'corner', { corner: 'bl', height: 2400, tilt: 20, rangePresence: 3000, rangeMotion: 5000, hFov: 160, vFov: 120 }],
  ['D45-corner-motion-empty', 'corner', { corner: 'bl', height: 1200, tilt: 20, rangePresence: 450, rangeMotion: 1000, hFov: 160, vFov: 120 }],
  ['D47-corner-presence-degenerate', 'corner', { corner: 'bl', height: 1200, tilt: 20, rangePresence: 450, rangeMotion: 5000, hFov: 160, vFov: 120 }]
];
for (const [id, mount, overrides] of distanceBoundaryCases) {
  const st = makeBase(mount);
  Object.assign(st, overrides);
  if (mount === 'ceiling' && !overrides.sensor) st.sensor = { x: 3500, y: 3500 };
  if (mount === 'side' && !overrides.sensor) st.sensor = sideSensor(st.wall, 3500);
  if (mount === 'corner') st.sensor = cornerSensor(st.corner);
  addCase('agent-distance-oracle', `${id} ${mount} H${st.height} R${st.rangePresence}/${st.rangeMotion}`, st);
}

function addQuasiRandomCases() {
  const fovs = [30, 45, 60, 75, 90, 120, 160];
  const angles = [0, 1, 45, 89, 90, 135, 179, 270, 359];
  const sideAngles = [-90, -45, -1, 0, 1, 45, 90];
  const tilts = [0, 1, 5, 10, 20, 30];
  const sideWalls = ['left', 'right', 'bottom', 'top'];
  const corners = ['bl', 'br', 'tl', 'tr'];
  const positions = [100, 650, 1234, 2500, 3500, 5000, 6100, 6900];
  function pick(arr, i, salt) { return arr[(i * 17 + salt * 11) % arr.length]; }
  function ranges(height, i) {
    const gaps = [Math.abs(height - 0), Math.abs(height - 600), Math.abs(height - 750), Math.abs(height - 1200)];
    const gap = pick(gaps, i, 3);
    const p = pick([Math.max(1, gap - 1), gap + 1, Math.ceil(gap * 1.001), 1050, 3000, 5000], i, 5);
    const m = Math.max(p, pick([Math.max(1, gaps[0] - 1), gaps[0] + 1, 2000, 3000, 5000, 8000], i, 7));
    return [p, m];
  }
  for (let i = 0; i < 80; i++) {
    const mode = i % 3;
    if (mode === 0) {
      const height = pick([2000, 2400, 2700, 3000, 5000], i, 1);
      const st = makeBase('ceiling');
      const r = ranges(height, i);
      Object.assign(st, {
        sensor: { x: pick(positions, i, 2), y: pick(positions, i, 4) },
        height,
        hAngle: pick(angles, i, 6),
        hFov: pick(fovs, i, 8),
        vFov: pick(fovs, i, 10),
        rangePresence: r[0],
        rangeMotion: r[1]
      });
      addCase('agent-quasirandom-oracle', `quasi ${i + 1} ceiling`, st);
    } else if (mode === 1) {
      const height = pick([1000, 1200, 1500, 1800, 2000], i, 1);
      const wall = pick(sideWalls, i, 2);
      const r = ranges(height, i);
      const st = makeBase('side');
      Object.assign(st, {
        wall,
        sensor: sideSensor(wall, pick(positions, i, 4)),
        height,
        tilt: pick(tilts, i, 6),
        hAngle: pick(sideAngles, i, 8),
        hFov: pick(fovs, i, 10),
        vFov: pick(fovs, i, 12),
        rangePresence: r[0],
        rangeMotion: r[1]
      });
      addCase('agent-quasirandom-oracle', `quasi ${i + 1} side ${wall}`, st);
    } else {
      const height = pick([1000, 1200, 1500, 1800, 2000], i, 1);
      const corner = pick(corners, i, 2);
      const r = ranges(height, i);
      const st = makeBase('corner');
      Object.assign(st, {
        corner,
        sensor: cornerSensor(corner),
        height,
        tilt: pick(tilts, i, 6),
        hFov: pick(fovs, i, 8),
        vFov: pick(fovs, i, 10),
        rangePresence: r[0],
        rangeMotion: r[1]
      });
      addCase('agent-quasirandom-oracle', `quasi ${i + 1} corner ${corner}`, st);
    }
  }
}
addQuasiRandomCases();

for (const testCase of cases) validateCase(testCase);

const bySource = {};
for (const c of cases) bySource[c.source] = (bySource[c.source] || 0) + 1;
const report = {
  room: ROOM,
  cases: cases.length,
  bySource,
  checkedHeights: HEIGHTS,
  failures,
  summaries
};
mkdirSync(new URL('../artifacts/', import.meta.url), { recursive: true });
writeFileSync(new URL('../artifacts/blind-7000-results.json', import.meta.url), JSON.stringify(report, null, 2));

console.log(`BLIND_7000: ${cases.length} cases, ${failures.length} failures`);
console.log(`BLIND_7000_SOURCES: ${JSON.stringify(bySource)}`);
if (failures.length) {
  console.log(JSON.stringify(failures.slice(0, 16), null, 2));
  process.exit(1);
}

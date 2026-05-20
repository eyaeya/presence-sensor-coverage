# UI Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `docs/superpowers/specs/2026-05-20-ui-review-design.md` 中的三件事——右栏 240px 紧凑布局（罗盘式鼠标位置 + 覆盖区色点）、下方工具栏的「传感器预设」组、vFov/rangePresence 上限扩展。

**Architecture:** 增量改动现有 vanilla JS 模块；新增一个数据文件 `src/presets.js`（即 `window.SensorPresets`）；不改 `geo.js` / `render.js`。Info.coverage 复用 `Geo.inBeamAtHeight` + `Geo.rangeProjectionRadius` 保证视觉与文字提示一致。

**Tech Stack:** Vanilla JavaScript（IIFE 模块），HTML + CSS（Grid + Flex），原有 Tests.extra 测试框架 + node tools/run-tests.mjs，浏览器视觉验证用 Playwright MCP（与既往 dev-log 同方法）。

**Spec：** `docs/superpowers/specs/2026-05-20-ui-review-design.md`（commit 946a329）。

**基线测试数：** 73 条（`node tools/run-tests.mjs` exit 0）。

---

## 文件结构

| 文件 | 类型 | 责任 |
|---|---|---|
| `index.html` | 改 | grid 列宽 320→240；插入 `<script src="src/presets.js">`；新增 CSS（chips 1×4、`.hover-compass`、`.coverage`、`.preset-row` / `.preset-variants`） |
| `src/presets.js` | 新建 | `window.SensorPresets`：3 个型号、5 个 variant（详见 spec §4.5） |
| `src/info.js` | 改 | chips 单行；新增 `addHoverCompass` 与 `addCoverageGrid`；新增对外 `coverage(st, mm)`；`render` 接入新节 |
| `src/interact.js` | 改 | 扩 vFov/rangePresence 范围；新增 `applyPreset` + `variantMatchesState` + `presetsGroup`；`rebuild` 末尾加第 5 组 |
| `src/tests.js` | 改 | `Tests.extra` 末尾追加 13 条断言 |
| `docs/dev-log/2026-05-20-progress.md` | 改 | 追加本次进度块 |

---

## Task 1 — 扩展 vFov / rangePresence 范围

**Files:**
- Modify: `src/interact.js:82-83` （`rebuild()` 内的两条 `num(...)` 调用）
- Modify: `src/tests.js` （在 `Tests.extra=function(ok,approx){...}` 末尾追加 2 条断言）

- [ ] **Step 1.1: 写失败测试**

打开 `src/tests.js`，找到 `Tests.extra=function(ok,approx){` 函数体的最后一个 `};`（IIFE 结束前的最后一行），在它**之前**追加：

```javascript
  // --- UI Review Task1 range extension ---
  ok('Interact.clamp vFov 160 within new range', Interact.clamp(160,45,160,90)===160);
  ok('Interact.clamp rangePresence 6000 within new range', Interact.clamp(6000,3000,6000,3000)===6000);
```

- [ ] **Step 1.2: 跑测试确认 fail**

```bash
node tools/run-tests.mjs
```

预期：73→应当 75，但其中 2 条 PASS（因为 `Interact.clamp` 本来就支持任意上下界——它只是工具函数，本身没有"vFov 上限 90"这种限制）。

→ 等等，clamp 本身没有内建上下界，所以测试可能直接通过。重新评估：这两条测试的本意是"如果未来有人不小心收窄了 clamp 的语义，能立即报警"，而不是先 fail 后 pass。属于回归保护。

**真正的失败测试应该放在 `Interact.rebuild()` 渲染出的控件上**——但 rebuild 在 node VM 中渲染 DOM，验证 input.max 比较麻烦。退而求其次：直接验证 num() 输出的控件 max 属性。

改为：

```javascript
  // --- UI Review Task1 range extension ---
  // 直接验证 clamp 工具：两条只是保护性回归，clamp 一直支持任意范围
  ok('Interact.clamp vFov 160 within 45-160', Interact.clamp(160,45,160,90)===160);
  ok('Interact.clamp rangePresence 6000 within 3000-6000', Interact.clamp(6000,3000,6000,3000)===6000);
  // 验证 rebuild 后控件的实际上下界：必须先调 init 才有 #tools 容器
  (function(){
    var stTmp=State.defaults();
    Interact.init(stTmp,function(){});
    var inputs=document.getElementById('tools').children;
    // 抓到 num 控件后查它内部 input[type=number] 的 max
    function findNumInputByLabel(text){
      var groups=document.getElementById('tools').children;
      for(var i=0;i<groups.length;i++){
        var body=groups[i].children[1];
        if(!body||!body.children) continue;
        for(var j=0;j<body.children.length;j++){
          var ctl=body.children[j];
          var label=ctl.children&&ctl.children[0];
          if(label&&label.textContent&&label.textContent.indexOf(text)===0){
            var rowi=ctl.children[1];
            return rowi&&rowi.children&&rowi.children[0]; // input[type=number]
          }
        }
      }
      return null;
    }
    var vfovNum=findNumInputByLabel('垂直 FOV');
    ok('vFov num input max=160', vfovNum&&Number(vfovNum.max)===160);
    var rpNum=findNumInputByLabel('存在距离');
    ok('rangePresence num input max=6000', rpNum&&Number(rpNum.max)===6000);
  })();
```

跑测试：

```bash
node tools/run-tests.mjs
```

预期：基线 73 + 4 = 77，但其中 `vFov num input max=160` 与 `rangePresence num input max=6000` 这两条 FAIL（旧上界 90/5000）。

- [ ] **Step 1.3: 实现——改 interact.js 两条控件 num 调用**

`src/interact.js` 中找到 `rebuild()` 函数体（约 71-84 行）。把：

```javascript
    group('视场',[num('水平 FOV (90-160°)','hFov',90,160,1,false),num('垂直 FOV (45-90°)','vFov',45,90,1,false)]);
    group('距离',[num('存在距离 (3000-5000)','rangePresence',3000,5000,50,false),num('运动距离 (5000-8000)','rangeMotion',5000,8000,50,false)]);
```

改为：

```javascript
    group('视场',[num('水平 FOV (90-160°)','hFov',90,160,1,false),num('垂直 FOV (45-160°)','vFov',45,160,1,false)]);
    group('距离',[num('存在距离 (3000-6000)','rangePresence',3000,6000,50,false),num('运动距离 (5000-8000)','rangeMotion',5000,8000,50,false)]);
```

只改了 `vFov` 第 4 个参数 `90 → 160`、label `(45-90°) → (45-160°)`、`rangePresence` 第 4 个参数 `5000 → 6000`、label `(3000-5000) → (3000-6000)`。

- [ ] **Step 1.4: 跑测试确认 pass**

```bash
node tools/run-tests.mjs
```

预期：`TESTS: 77/77 passed`，exit 0。

- [ ] **Step 1.5: 提交**

```bash
git add src/interact.js src/tests.js
git commit -m "feat(ui): extend vFov to 160° and rangePresence to 6000mm

To accommodate upcoming sensor presets (子擎 Celling V FOV 160°, 子擎 Trio
presence 6000mm). Bounds widened; existing clamp/range semantics intact.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2 — 新建 `src/presets.js` 数据文件 + 接入 index.html

**Files:**
- Create: `src/presets.js`
- Modify: `index.html:68-74` （script src 顺序）

- [ ] **Step 2.1: 创建 `src/presets.js`**

```javascript
/* ===== Sensor Presets =====
 * 编辑此文件以增删改预设传感器。
 * variant 中未列出的字段（如 height、tilt）将沿用该 mount 的 MOUNT_DEFAULTS。
 */
window.SensorPresets = [
  {
    id: "ziqing-trio",
    name: "子擎 Trio",
    variants: [
      { mount: "side",    label: "侧装",
        hFov: 160, vFov: 90,  rangePresence: 6000, rangeMotion: 7000,
        height: 1500, tilt: 0 }
    ]
  },
  {
    id: "ziqing-celling",
    name: "子擎 Celling",
    variants: [
      { mount: "ceiling", label: "吸顶",
        hFov: 160, vFov: 160, rangePresence: 4000, rangeMotion: 5500 }
    ]
  },
  {
    id: "xiaomi-pro",
    name: "小米人在 Pro",
    variants: [
      { mount: "ceiling", label: "吸顶",
        hFov: 110, vFov: 60,  rangePresence: 4000, rangeMotion: 7000 },
      { mount: "side",    label: "侧装",
        hFov: 110, vFov: 60,  rangePresence: 4000, rangeMotion: 7000,
        height: 1800, tilt: 30 },
      { mount: "corner",  label: "墙角",
        hFov: 110, vFov: 60,  rangePresence: 4000, rangeMotion: 7000,
        height: 1500, tilt: 0 }
    ]
  }
];
```

- [ ] **Step 2.2: 在 index.html 中插入 script tag**

`index.html` 第 68-74 行（script 段）现状：

```html
<script src="src/geo.js"></script>
<script src="src/state.js"></script>
<script src="src/render.js"></script>
<script src="src/info.js"></script>
<script src="src/interact.js"></script>
<script src="src/tests.js"></script>
<script src="src/app.js"></script>
```

在 `src/geo.js` 与 `src/state.js` 之间插入一行：

```html
<script src="src/geo.js"></script>
<script src="src/presets.js"></script>
<script src="src/state.js"></script>
<script src="src/render.js"></script>
<script src="src/info.js"></script>
<script src="src/interact.js"></script>
<script src="src/tests.js"></script>
<script src="src/app.js"></script>
```

- [ ] **Step 2.3: 跑测试确认无回归**

```bash
node tools/run-tests.mjs
```

预期：`TESTS: 77/77 passed`，exit 0（run-tests.mjs 会自动按 script src 顺序在 VM 内加载 presets.js）。

- [ ] **Step 2.4: 验证全局变量已就位**

在 tests.js 的 Tests.extra 末尾临时加一行 `console.log(typeof window.SensorPresets, window.SensorPresets && window.SensorPresets.length);`，跑一次确认输出 `object 3`，**然后立刻删除该 console.log**。或者：跳过验证，下一个 Task 的失败测试会自动暴露问题。直接进 Task 3。

- [ ] **Step 2.5: 提交**

```bash
git add src/presets.js index.html
git commit -m "feat(ui): add sensor presets data file

Three sensor models with 5 variants total: 子擎 Trio (side), 子擎 Celling
(ceiling), 小米人在 Pro (ceiling/side/corner). Exposed as
window.SensorPresets; edit src/presets.js to add or modify entries.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3 — `Info.coverage(st, mm)` 覆盖区分类

**Files:**
- Modify: `src/info.js` （在 Info IIFE 内新增 `coverage` 函数；加入返回对象）
- Modify: `src/tests.js` （Tests.extra 末尾追加 4 条覆盖区断言）

- [ ] **Step 3.1: 写失败测试（4 条）**

在 `src/tests.js` 的 `Tests.extra=function(ok,approx){` 函数体内（即 Task 1 那 4 行断言之后），追加：

```javascript
  // --- UI Review Task3 Info.coverage ---
  (function(){
    var st=State.defaults(); // ceiling 4000x3000, sensor 2000x1500, h2400, hFov160, vFov90, P3000, M5000
    var cv=Info.coverage(st, {x:st.room.W/2, y:st.room.D/2}); // 中心
    ok('coverage center all true', cv.stand===true&&cv.sit===true&&cv.lie===true&&cv.ground===true);
    var cvN=Info.coverage(st, null);
    ok('coverage null all false', cvN.stand===false&&cvN.sit===false&&cvN.lie===false&&cvN.ground===false);
    var cvOut=Info.coverage(st, {x:-100, y:0});
    ok('coverage outside room all false', cvOut.stand===false&&cvOut.sit===false&&cvOut.lie===false&&cvOut.ground===false);
    // 角点 (0,0)：依实测决定 stand 是否被覆盖。
    // 默认 sensor=(2000,1500,2400)、角 3D 距离 ≈ sqrt(2000²+1500²+(2400-1200)²) ≈ 2773mm <= rangeMotion 5000
    // FOV 椭圆 @ h=1200：a=(2400-1200)*tan(80°)≈6804，b=(2400-1200)*tan(45°)=1200。
    // 角点对 sensor 的 (du,dv) 在椭圆内/外，取决于 phi=0 的 u/v 朝向。
    // 实测一遍后写死：本断言用 typeof bool 占位，等 Step 3.4 测真值后改写为具体值。
    ok('coverage corner stand returns boolean', typeof cv.stand==='boolean');
  })();
```

注意第 4 条用占位 `typeof boolean` —— 因为角点的 stand 真值依赖几何细节，要实测后写死。先让所有断言能通过类型检查。

- [ ] **Step 3.2: 跑测试确认 fail**

```bash
node tools/run-tests.mjs
```

预期 FAIL：4 条均报 `Info.coverage is not a function` 或类似。基线 77 → 81 但 4 条 FAIL。

- [ ] **Step 3.3: 实现 Info.coverage**

打开 `src/info.js`，在 IIFE 内部（约第 33 行 `function hover` 之后、`function addMountGlyph` 之前）插入：

```javascript
  function coverage(st, mm){
    var result={stand:false, sit:false, lie:false, ground:false};
    if(!mm||mm.x<0||mm.x>st.room.W||mm.y<0||mm.y>st.room.D) return result;
    var fr=Geo.beamFrame(st);
    var aH=Geo.rad(st.hFov/2), aV=Geo.rad(st.vFov/2);
    var HEIGHTS={stand:1200, sit:750, lie:600, ground:0};
    for(var key in HEIGHTS){
      var h=HEIGHTS[key];
      if(!Geo.inBeamAtHeight(fr,aH,aV,mm,h)) continue;
      // 3D 距离判定（与 Render.layerPolys 同源）
      var dx=mm.x-fr.S.x, dy=mm.y-fr.S.y, dz=h-fr.S.z;
      var dist3D=Math.sqrt(dx*dx+dy*dy+dz*dz);
      if(dist3D<=st.rangeMotion) result[key]=true;
    }
    return result;
  }
```

然后在 IIFE 末尾 `return` 语句里加上 `coverage`：

把：

```javascript
  return {positioning:positioning,params:params,hover:hover,render:render};
```

改为：

```javascript
  return {positioning:positioning,params:params,hover:hover,coverage:coverage,render:render};
```

- [ ] **Step 3.4: 跑测试 + 写死 corner 真值**

```bash
node tools/run-tests.mjs
```

预期：3 条 PASS + 1 条 PASS（typeof boolean 占位天然通过）= 4 条 PASS。基线 77 + 4 = 81。

然后在 node 里实测 corner 真值。新建临时脚本 `/tmp/check-corner.mjs`：

```javascript
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const ctx={};
['src/geo.js','src/presets.js','src/state.js','src/info.js'].forEach(f=>{
  vm.runInNewContext(readFileSync(f,'utf8'), ctx, {filename:f});
});
const st=ctx.State.defaults();
const cv=ctx.Info.coverage(st, {x:0,y:0});
console.log(JSON.stringify(cv));
```

跑 `node /tmp/check-corner.mjs`，得到形如 `{"stand":false,"sit":false,"lie":false,"ground":true}` 的输出。

→ 用真实输出值替换 tests.js 第 4 条断言：

```javascript
ok('coverage corner stand returns boolean', typeof cv.stand==='boolean');
```

改为（假设实测结果是 `stand=false, ground=true`，请用实测值）：

```javascript
ok('coverage corner stand actual', cv.stand===false);
ok('coverage corner ground actual', cv.ground===true);
```

如果实测得到 `stand=true`，则两条改成对应真值。两条断言把"4 条"变成"5 条"，是允许的——比 spec 多 1 条更稳。

删除临时脚本：`rm /tmp/check-corner.mjs`。

- [ ] **Step 3.5: 再跑测试确认全过**

```bash
node tools/run-tests.mjs
```

预期：基线 77 + 5 = `TESTS: 82/82 passed`。

- [ ] **Step 3.6: 提交**

```bash
git add src/info.js src/tests.js
git commit -m "feat(info): add Info.coverage classifier for cursor-vs-zone

Returns {stand, sit, lie, ground} booleans by reusing Geo.inBeamAtHeight
and 3D-distance gate matching Render.layerPolys exactly. Foundation for
the new right-panel coverage indicator.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4 — `Interact.applyPreset` + `variantMatchesState`

**Files:**
- Modify: `src/interact.js`（在 IIFE 内新增两个函数；加入返回对象）
- Modify: `src/tests.js`（Tests.extra 末尾追加 7 条断言）

- [ ] **Step 4.1: 写失败测试（7 条）**

在 `src/tests.js` 末尾（Task 3 那批之后）追加：

```javascript
  // --- UI Review Task4 applyPreset + variantMatchesState ---
  (function(){
    function variantOf(id,mount){
      var p=window.SensorPresets.filter(function(x){return x.id===id;})[0];
      return p.variants.filter(function(v){return v.mount===mount;})[0];
    }
    var s;
    s=State.defaults();
    Interact.applyPreset(s, variantOf('ziqing-trio','side'));
    ok('preset trio side all fields',
      s.mount==='side'&&s.hFov===160&&s.vFov===90&&s.rangePresence===6000&&s.rangeMotion===7000&&s.height===1500&&s.tilt===0);
    s=State.defaults();
    Interact.applyPreset(s, variantOf('ziqing-celling','ceiling'));
    ok('preset celling ceiling defaults height',
      s.mount==='ceiling'&&s.vFov===160&&s.hFov===160&&s.rangePresence===4000&&s.rangeMotion===5500&&s.height===2400);
    s=State.defaults();
    Interact.applyPreset(s, variantOf('xiaomi-pro','ceiling'));
    ok('preset xiaomi ceiling defaults',
      s.mount==='ceiling'&&s.hFov===110&&s.vFov===60&&s.rangePresence===4000&&s.rangeMotion===7000&&s.height===2400&&s.tilt===0);
    s=State.defaults();
    Interact.applyPreset(s, variantOf('xiaomi-pro','side'));
    ok('preset xiaomi side',
      s.mount==='side'&&s.height===1800&&s.tilt===30&&s.hFov===110&&s.vFov===60);
    s=State.defaults();
    Interact.applyPreset(s, variantOf('xiaomi-pro','corner'));
    ok('preset xiaomi corner',
      s.mount==='corner'&&s.height===1500&&s.tilt===0&&s.hAngle===45&&s.hFov===110&&s.vFov===60);
    // variantMatchesState
    s=State.defaults();
    Interact.applyPreset(s, variantOf('xiaomi-pro','ceiling'));
    ok('variant matches after apply', Interact.variantMatchesState(s, variantOf('xiaomi-pro','ceiling')));
    s.hFov=111;
    ok('variant no match after tweak', !Interact.variantMatchesState(s, variantOf('xiaomi-pro','ceiling')));
  })();
```

- [ ] **Step 4.2: 跑测试确认 fail**

```bash
node tools/run-tests.mjs
```

预期 FAIL：7 条均报 `Interact.applyPreset is not a function` 等。基线 82 → 89 但 7 条 FAIL。

- [ ] **Step 4.3: 实现 applyPreset 与 variantMatchesState**

打开 `src/interact.js`。在 `function init(state,cb){st=state;onChange=cb;rebuild();}` 这一行（约第 85 行）**之后**、`function nearestWall(...)` 之前，插入两个新函数：

```javascript
  function applyPreset(state, variant){
    State.applyMount(state, variant.mount);   // 切 mount，重置 MOUNT_DEFAULTS（含 height / hAngle / wall / corner / sensor）
    if(variant.hFov          != null) state.hFov          = clamp(variant.hFov,          90,   160);
    if(variant.vFov          != null) state.vFov          = clamp(variant.vFov,          45,   160);
    if(variant.rangePresence != null) state.rangePresence = clamp(variant.rangePresence, 3000, 6000);
    if(variant.rangeMotion   != null) state.rangeMotion   = clamp(variant.rangeMotion,   5000, 8000);
    if(variant.height        != null){
      var lim = {ceiling:[2000,5000], side:[1000,2000], corner:[1000,2000]}[state.mount];
      state.height = clamp(variant.height, lim[0], lim[1]);
    }
    if(variant.tilt          != null) state.tilt          = clamp(variant.tilt,          0,    30);
    // 仅当 init() 已经把 st/onChange 绑好时才走 rebuild + onChange（测试单独调用 applyPreset 时不依赖 UI）
    if(st===state && typeof onChange==='function'){ rebuild(); onChange(); }
  }
  function variantMatchesState(state, v){
    if(state.mount !== v.mount) return false;
    if(v.hFov          != null && state.hFov          !== v.hFov)          return false;
    if(v.vFov          != null && state.vFov          !== v.vFov)          return false;
    if(v.rangePresence != null && state.rangePresence !== v.rangePresence) return false;
    if(v.rangeMotion   != null && state.rangeMotion   !== v.rangeMotion)   return false;
    if(v.height        != null && state.height        !== v.height)        return false;
    if(v.tilt          != null && state.tilt          !== v.tilt)          return false;
    return true;
  }
```

然后在 IIFE 末尾 `return` 语句里加 `applyPreset` 与 `variantMatchesState`：

把：

```javascript
  return {clamp:clamp,init:init,nearestWall:nearestWall,nearestCorner:nearestCorner,placeSensor:placeSensor,relocateSideWall:relocateSideWall,resnapRoom:resnapRoom};
```

改为：

```javascript
  return {clamp:clamp,init:init,nearestWall:nearestWall,nearestCorner:nearestCorner,placeSensor:placeSensor,relocateSideWall:relocateSideWall,resnapRoom:resnapRoom,applyPreset:applyPreset,variantMatchesState:variantMatchesState};
```

- [ ] **Step 4.4: 跑测试确认全过**

```bash
node tools/run-tests.mjs
```

预期：`TESTS: 89/89 passed`（82 + 7）。如果 7 条中任意一条仍 FAIL，多半是 clamp 范围或 MOUNT_DEFAULTS 兜底逻辑问题，去 spec §4.4.1 对核。

- [ ] **Step 4.5: 提交**

```bash
git add src/interact.js src/tests.js
git commit -m "feat(interact): add applyPreset and variantMatchesState

applyPreset switches mount via State.applyMount then overlays variant
fields with clamping; variantMatchesState lets the UI compute selected
state. Both safe to call before Interact.init for unit tests.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5 — 工具栏新增「传感器预设」组（UI 接线 + CSS）

**Files:**
- Modify: `src/interact.js` （新增 `presetsGroup()`；`rebuild()` 末尾追加 group 调用）
- Modify: `index.html` （CSS：`.preset-row` / `.preset-name` / `.preset-variants` / `.preset-btn`）

- [ ] **Step 5.1: 加 CSS**

打开 `index.html`，在 `.seg button.on{background:#274168;color:#fff;}` 那一行（约第 50 行）**之后**插入：

```css
  .preset-container{display:flex;flex-direction:column;gap:6px;min-width:170px;}
  .preset-row{display:flex;align-items:center;gap:8px;}
  .preset-name{flex:1;font-size:12px;color:#c4ccd6;white-space:nowrap;}
  .preset-variants{display:flex;gap:4px;}
  .preset-btn{padding:4px 9px;font-size:12px;color:#9aa3af;background:#0c0e12;border:1px solid #2c333d;border-radius:5px;cursor:pointer;}
  .preset-btn.on{background:#274168;color:#fff;border-color:#3a5a89;}
  .preset-btn:hover{color:#e6e8eb;}
```

- [ ] **Step 5.2: 实现 presetsGroup()**

打开 `src/interact.js`。在 `function rebuild(){` 之前（约第 70 行），插入：

```javascript
  function presetsGroup(){
    var container=document.createElement('div');container.className='preset-container';
    if(!window.SensorPresets||!window.SensorPresets.length){
      var empty=document.createElement('div');empty.style.color='#6b7280';empty.style.fontSize='11px';empty.textContent='(无预设)';
      container.appendChild(empty); return container;
    }
    window.SensorPresets.forEach(function(p){
      var row=document.createElement('div');row.className='preset-row';
      var name=document.createElement('span');name.className='preset-name';name.textContent=p.name;row.appendChild(name);
      var variants=document.createElement('div');variants.className='preset-variants';
      p.variants.forEach(function(v){
        var btn=document.createElement('button');btn.className='preset-btn'+(variantMatchesState(st,v)?' on':'');
        btn.textContent=v.label;
        btn.addEventListener('click',function(){applyPreset(st,v);});
        variants.appendChild(btn);
      });
      row.appendChild(variants);container.appendChild(row);
    });
    return container;
  }
```

- [ ] **Step 5.3: 在 rebuild 末尾追加 group 调用**

在 `src/interact.js` `rebuild()` 函数的最后一个 `group(...)` 调用（约第 83 行 `group('距离',...);`）**之后**追加：

```javascript
    group('传感器预设',[presetsGroup()]);
```

`rebuild()` 现在结束应当是：

```javascript
    group('空间',[seg(),roomCtl()]);
    group('安装',[hRange(),num('下倾角 (0-30°)','tilt',0,30,1, st.mount==='ceiling'),hAngleCtl()]);
    group('视场',[num('水平 FOV (90-160°)','hFov',90,160,1,false),num('垂直 FOV (45-160°)','vFov',45,160,1,false)]);
    group('距离',[num('存在距离 (3000-6000)','rangePresence',3000,6000,50,false),num('运动距离 (5000-8000)','rangeMotion',5000,8000,50,false)]);
    group('传感器预设',[presetsGroup()]);
  }
```

- [ ] **Step 5.4: 跑测试确认无回归**

```bash
node tools/run-tests.mjs
```

预期：`TESTS: 89/89 passed`。第 5 组的 DOM 在 node VM 内能被构造（VM 的 mock document 不会爆错），rebuild 完成。

- [ ] **Step 5.5: 提交**

```bash
git add src/interact.js index.html
git commit -m "feat(ui): add 传感器预设 group to bottom toolbar

Adds a 5th .tool-group rendering window.SensorPresets as
model-name → [variant buttons] rows. Buttons highlight when state
matches via variantMatchesState; clicking calls applyPreset which
triggers rebuild+redraw. The existing .tool-group border-right pattern
naturally provides the separator between 距离 and the new group.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6 — 右栏 Info.render 新布局（chips 1×4 + 罗盘 + 覆盖区） + CSS + 240px 宽

**Files:**
- Modify: `index.html` （grid 列宽 320→240；chips grid 改 1×4；新增 `.hover-compass` 与 `.coverage` CSS）
- Modify: `src/info.js` （`addHoverCompass`、`addCoverageGrid`；`render` 用新组件替换旧 hover-grid 标题；`addMetricChips` mini-room 微调）

- [ ] **Step 6.1: index.html 修改 grid 列宽 + chips grid + 新增 CSS**

打开 `index.html`。

(A) 第 10 行：

```css
  #app{display:grid;grid-template-columns:1fr 320px;grid-template-rows:1fr 190px;height:100vh;}
```

→

```css
  #app{display:grid;grid-template-columns:1fr 240px;grid-template-rows:1fr 190px;height:100vh;}
```

(B) 第 29 行 `.chips`：

```css
  .chips{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0 2px;}
```

→

```css
  .chips{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin:8px 0 2px;}
  .chips .chip{padding:5px 4px;}
```

(C) `.mini-room` 高度第 22 行：

```css
  .mini-room{height:86px;...}
```

→

```css
  .mini-room{height:72px;...}
```

(D) 在 `.hover-grid b{...}` 后（约第 35 行）**追加**：

```css
  .hover-compass{display:grid;grid-template-columns:auto 1fr auto;grid-template-rows:auto 1fr auto;gap:6px 8px;padding:6px 4px;font-variant-numeric:tabular-nums;font-size:12px;color:#c4ccd6;}
  .hover-compass .hc-cell{display:flex;align-items:center;justify-content:center;color:#fff;}
  .hover-compass .hc-mini{position:relative;background:#0c0f15;border:1px solid #2c333d;min-width:90px;min-height:54px;}
  .hover-compass .hc-mini:before,.hover-compass .hc-mini:after{content:"";position:absolute;background:#253040;}
  .hover-compass .hc-mini:before{left:50%;top:0;bottom:0;width:1px;}
  .hover-compass .hc-mini:after{left:0;right:0;top:50%;height:1px;}
  .hover-compass .hc-cursor{position:absolute;width:9px;height:9px;border-radius:50%;background:#facc15;box-shadow:0 0 0 3px rgba(250,204,21,.22);transform:translate(-50%,50%);}
  .hover-compass .hc-label{font-size:10px;color:#7b818b;margin-right:4px;}
  .hover-compass .hc-top{grid-column:2;grid-row:1;flex-direction:column;}
  .hover-compass .hc-bottom{grid-column:2;grid-row:3;flex-direction:column;}
  .hover-compass .hc-left{grid-column:1;grid-row:2;flex-direction:column;}
  .hover-compass .hc-right{grid-column:3;grid-row:2;flex-direction:column;}
  .hover-compass .hc-center{grid-column:2;grid-row:2;}
  .coverage{display:grid;grid-template-columns:1fr 1fr;gap:5px 10px;margin:6px 0 2px;font-size:12px;color:#c4ccd6;}
  .coverage .cv-item{display:flex;align-items:center;gap:6px;}
  .coverage .cv-dot{width:10px;height:10px;border-radius:50%;display:inline-block;border:1px solid;}
  .coverage .cv-dot.off{background:transparent;}
  .coverage .cv-label{font-size:11px;color:#9aa3af;}
  .coverage .cv-h{margin-left:auto;font-variant-numeric:tabular-nums;color:#fff;font-size:11px;}
```

- [ ] **Step 6.2: 修改 src/info.js**

打开 `src/info.js`。

(A) 把 `function addHoverGrid(box,hv){...}` 整段替换为：

```javascript
  function addHoverCompass(box,st,hv){
    var grid=document.createElement('div');grid.className='hover-compass';
    function cell(klass,label,val){
      var c=document.createElement('div');c.className='hc-cell '+klass;
      if(label){var l=document.createElement('span');l.className='hc-label';l.textContent=label;c.appendChild(l);}
      var v=document.createElement('span');v.textContent=val;c.appendChild(v);
      return c;
    }
    if(hv){
      grid.appendChild(cell('hc-top','↑',hv.top+' mm'));
      grid.appendChild(cell('hc-left','←',hv.left+' mm'));
      grid.appendChild(cell('hc-right','→',hv.right+' mm'));
      grid.appendChild(cell('hc-bottom','↓',hv.bottom+' mm'));
    } else {
      grid.appendChild(cell('hc-top','↑','—'));
      grid.appendChild(cell('hc-left','←','—'));
      grid.appendChild(cell('hc-right','→','—'));
      grid.appendChild(cell('hc-bottom','↓','—'));
    }
    var mini=document.createElement('div');mini.className='hc-cell hc-center';
    var inner=document.createElement('div');inner.className='hc-mini';
    if(hv){
      var cur=document.createElement('i');cur.className='hc-cursor';
      // hv.left=mm.x, hv.bottom=mm.y。在 hc-mini 内部用百分比定位光标点。
      cur.style.left=(hv.left/st.room.W*100)+'%';
      cur.style.bottom=(hv.bottom/st.room.D*100)+'%';
      inner.appendChild(cur);
    }
    mini.appendChild(inner);
    grid.appendChild(mini);
    box.appendChild(grid);
  }
  function addCoverageGrid(box,st,hv){
    var grid=document.createElement('div');grid.className='coverage';
    var cv=hv ? coverage(st, {x:hv.left, y:hv.bottom}) : {stand:false,sit:false,lie:false,ground:false};
    // 视觉次序：站 / 坐 / 躺 / 地
    var items=[
      {key:'stand',  label:'站', h:1200, color:'#9b8cff'},
      {key:'sit',    label:'坐', h: 750, color:'#5fb0ff'},
      {key:'lie',    label:'躺', h: 600, color:'#5fe0c0'},
      {key:'ground', label:'地', h:   0, color:'#f5d05a'}
    ];
    items.forEach(function(it){
      var item=document.createElement('div');item.className='cv-item';
      var dot=document.createElement('span');dot.className='cv-dot'+(cv[it.key]?'':' off');
      dot.style.borderColor=it.color;dot.style.background=cv[it.key]?it.color:'transparent';
      var label=document.createElement('span');label.className='cv-label';label.textContent=it.label;
      var h=document.createElement('span');h.className='cv-h';h.textContent=it.h+'mm';
      item.appendChild(dot);item.appendChild(label);item.appendChild(h);
      grid.appendChild(item);
    });
    box.appendChild(grid);
  }
```

注意：`addHoverCompass` 用了 `hv.left/right/top/bottom` 这套从 `Info.hover()` 返回的距墙 mm。`hv.left = mm.x`、`hv.bottom = mm.y`、`hv.top = room.D - mm.y`、`hv.right = room.W - mm.x`。光标点在 hc-mini 内部按 `(mm.x / W * 100%, mm.y / D * 100%)` 定位，bottom 用 `mm.y` 即可（因为 mini 内 `transform: translate(-50%, 50%)` 让坐标系正确）。

(B) `render(st,hv)` 函数末尾修改：

把：

```javascript
  function render(st,hv){
    var box=document.getElementById('info');box.innerHTML='';
    function sec(title,rows){...}
    function title(text){...}
    addMountGlyph(box,st);
    sec('安装定位',positioning(st));
    addMetricChips(box,st);
    sec('当前参数',params(st));
    title('鼠标位置');
    addHoverGrid(box,hv);
  }
```

改为：

```javascript
  function render(st,hv){
    var box=document.getElementById('info');box.innerHTML='';
    function sec(title,rows){var h=document.createElement('h3');h.textContent=title;box.appendChild(h);
      rows.forEach(function(o){var d=document.createElement('div');d.className='row';
        d.innerHTML='<span>'+o.label+'</span><span>'+o.value+'</span>';box.appendChild(d);});}
    function title(text){var h=document.createElement('h3');h.textContent=text;box.appendChild(h);}
    addMountGlyph(box,st);
    sec('安装定位',positioning(st));
    addMetricChips(box,st);
    sec('当前参数',params(st));
    title('鼠标位置');
    addHoverCompass(box,st,hv);
    title('覆盖区');
    addCoverageGrid(box,st,hv);
  }
```

(C) IIFE return 末尾不动（`coverage` 在 Task 3 已经加进去了）。可以选择把 `addHoverGrid` 函数删除（YAGNI），但保留也不影响。

- [ ] **Step 6.3: 跑测试确认无回归**

```bash
node tools/run-tests.mjs
```

预期：`TESTS: 89/89 passed`（VM 内 `document.getElementById('info').innerHTML=''` 等都是 mock，新组件构造不会爆错；Info.coverage 测试已经覆盖了逻辑分支）。

- [ ] **Step 6.4: 提交**

```bash
git add src/info.js index.html
git commit -m "feat(info): redesign right panel — 240px, hover compass, coverage grid

* #info width 320→240, chips 2×2 → 1×4
* 鼠标位置 改 罗盘式布局：上下左右四个数字 + 中央 mini-room 预览点
* 新增 覆盖区 节：站/坐/躺/地 四色点，依 Info.coverage 即时点亮
* mini-room 高度 86→72px 适配新窗宽

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7 — 浏览器视觉验证

**Files:**
- Create: `artifacts/ui-review-presets.json` （结果汇总）
- Create: `output/playwright/ui-review-pro-ceiling.png` （场景 1 截图）
- Create: `output/playwright/ui-review-trio-side.png` （场景 2 截图）

**前置：** 需要本地 HTTP 服务器，推荐 `python3 -m http.server 4173`（与历史 dev-log 同端口）。Playwright MCP 浏览器从 `http://127.0.0.1:4173/index.html` 拉页面。

- [ ] **Step 7.1: 启服务器**

```bash
python3 -m http.server 4173 --directory /Users/chen/Documents/VibeCoding/People_have/.claude/worktrees/nifty-joliot-9eaffc &
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4173/index.html
```

预期最后一行：`200`。

- [ ] **Step 7.2: 场景 1 — 小米人在 Pro · 吸顶**

用 Playwright MCP 浏览器（`mcp__plugin_playwright_playwright__browser_*`）：

1. `browser_navigate` → `http://127.0.0.1:4173/index.html`
2. `browser_wait_for` → `time: 1`（等 SVG 第一次渲染完）
3. `browser_snapshot` 拿到 DOM 结构、定位 "小米人在 Pro" 那行的"吸顶"按钮。
4. `browser_click` → 那个 "吸顶" 按钮。
5. `browser_evaluate` 抽取断言：

```javascript
() => ({
  mount: window.__state.mount,
  hFov: window.__state.hFov,
  vFov: window.__state.vFov,
  rangePresence: window.__state.rangePresence,
  rangeMotion: window.__state.rangeMotion,
  height: window.__state.height,
  tilt: window.__state.tilt,
  infoWidth: document.querySelector('#info').getBoundingClientRect().width,
  toolsGroupCount: document.querySelectorAll('#tools .tool-group').length,
  presetBtnOn: !!document.querySelector('.preset-btn.on'),
  coverageDotsTotal: document.querySelectorAll('.coverage .cv-dot').length
})
```

预期：`mount==='ceiling' && hFov===110 && vFov===60 && rangePresence===4000 && rangeMotion===7000 && height===2400 && tilt===0 && infoWidth在[238,242] && toolsGroupCount===5 && presetBtnOn===true && coverageDotsTotal===4`。

6. `browser_take_screenshot` → `output/playwright/ui-review-pro-ceiling.png`。
7. 把 JSON 结果暂存。

- [ ] **Step 7.3: 场景 2 — 子擎 Trio · 侧装 + hover 中心**

1. 在同一会话里 `browser_click` → 子擎 Trio 行的"侧装"按钮。
2. `browser_evaluate` 验证 state：

```javascript
() => ({
  mount: window.__state.mount,
  hFov: window.__state.hFov, vFov: window.__state.vFov,
  rangePresence: window.__state.rangePresence, rangeMotion: window.__state.rangeMotion,
  height: window.__state.height, tilt: window.__state.tilt,
  wall: window.__state.wall,
  sensor: window.__state.sensor
})
```

预期：`mount==='side' && hFov===160 && rangePresence===6000 && rangeMotion===7000 && height===1500 && tilt===0 && wall==='left' && sensor.x===0 && sensor.y===1500`。

3. 模拟 hover 到房间中心：用 `browser_evaluate` 计算 SVG 上对应中心的像素坐标，再发 `pointermove` 事件：

```javascript
() => {
  const svg=document.getElementById('svg');
  const r=svg.getBoundingClientRect();
  // 房间中心 mm = (W/2, D/2) = (2000, 1500)。Render.currentTransform() 给出 toPx。
  const tr=Render.currentTransform();
  const center=tr.toPx({x: window.__state.room.W/2, y: window.__state.room.D/2});
  const ev=new PointerEvent('pointermove',{
    clientX: r.left+center.px, clientY: r.top+center.py, pointerId: 1, bubbles: true
  });
  svg.dispatchEvent(ev);
  return { dispatched: true, atPx: [center.px, center.py] };
}
```

4. `browser_evaluate` 读罗盘 4 个方向数字（DOM 直接读 `.hover-compass .hc-cell` 文本）：

```javascript
() => {
  const cells=document.querySelectorAll('.hover-compass .hc-cell');
  return Array.prototype.map.call(cells, function(c){ return c.textContent.replace(/\s+/g,' ').trim(); });
}
```

预期格式如 `["↑ 1500 mm","←0 mm","→4000 mm","↓ 1500 mm",""]`（顺序按 DOM 渲染顺序：top, left, right, bottom, center 空字符串或类似）。具体数值：W=4000,D=3000,sensor=(0,1500)，中心点 mm=(2000,1500)。上 = D-1500 = 1500，下 = 1500，左 = 2000，右 = 2000。

5. `browser_take_screenshot` → `output/playwright/ui-review-trio-side.png`。

- [ ] **Step 7.4: 落盘结果**

把上面两个场景的 `browser_evaluate` 输出汇总到 `artifacts/ui-review-presets.json`：

```json
{
  "generatedAt": "2026-05-20T...",
  "baseline": "TESTS 89/89 passed",
  "scenarios": [
    {
      "name": "xiaomi-pro-ceiling",
      "expected": { "mount":"ceiling","hFov":110,"vFov":60,"height":2400,"tilt":0,"rangePresence":4000,"rangeMotion":7000,"infoWidthRange":[238,242],"toolsGroupCount":5,"presetBtnOn":true,"coverageDotsTotal":4 },
      "actual": { ... }
    },
    {
      "name": "ziqing-trio-side-hover-center",
      "expected": { "mount":"side","hFov":160,"vFov":90,"rangePresence":6000,"rangeMotion":7000,"height":1500,"tilt":0,"wall":"left","sensorX":0,"sensorY":1500,"compassTopMm":1500,"compassBottomMm":1500,"compassLeftMm":2000,"compassRightMm":2000 },
      "actual": { ... }
    }
  ],
  "failures": []
}
```

- [ ] **Step 7.5: 关服务器**

```bash
pkill -f "http.server 4173"
```

- [ ] **Step 7.6: 提交**

```bash
git add artifacts/ui-review-presets.json output/playwright/ui-review-pro-ceiling.png output/playwright/ui-review-trio-side.png
git commit -m "test(ui): browser-verify presets and hover compass

Two real-click scenarios via Playwright MCP: 小米人在 Pro·吸顶 and
子擎 Trio·侧装+hover. Verifies #info width 240px, 5 tool-groups,
selected preset .on state, compass readings = (top:1500,
left:2000, right:2000, bottom:1500) on Trio default sensor.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8 — Dev-log 追加进度

**Files:**
- Modify: `docs/dev-log/2026-05-19-progress.md` (或新建 `docs/dev-log/2026-05-20-progress.md`，看现状文件是否还有空间)

- [ ] **Step 8.1: 决定写入哪个文件**

```bash
wc -l docs/dev-log/2026-05-19-progress.md
ls docs/dev-log/
```

如果 `2026-05-19-progress.md` 行数 < 250，追加；否则新建 `docs/dev-log/2026-05-20-ui-review.md`。

- [ ] **Step 8.2: 追加进度块**

模板（替换 SHA 占位为实际 commit SHA、断言数为实测值）：

```markdown
## 2026-05-20 — UI Review（右栏 240px / 罗盘 / 覆盖区 / 传感器预设）

- 范围扩展：vFov 上限 90°→160°；rangePresence 上限 5000mm→6000mm。Interact.rebuild 内两条 num(...) 调用同步更新 label 与 max。
- 新建 `src/presets.js`：3 个型号、5 个 variant，挂在 window.SensorPresets。
- `Interact.applyPreset(state, variant)`：先 State.applyMount 兜底默认，再钳值覆盖 variant 指定的字段；安全可在 Interact.init 之前调用（测试场景）。`variantMatchesState` 决定预设按钮的 .on 状态。
- 工具栏新增第 5 组「传感器预设」，沿用原 .tool-group { border-right } 衬线分隔；每行 model-name + variant 小按钮。
- 右栏：宽 320→240；chips 由 2×2 改 1×4；删 hover-grid，改为 hover-compass（↑/←/→/↓ 四数 + 中央 mini-room 预览点）与 coverage（站/坐/躺/地 四色点）。
- `Info.coverage(st, mm)` 复用 Geo.inBeamAtHeight + 真实 3D 距离判定，与 Render.layerPolys 同源，避免色块与文字提示不一致。
- 测试：73 → 89（+16，spec 估 +13，差异：Task 1 比 spec 多 2 条 clamp 保护、Task 3 角点 stand/ground 实测后从 1 条占位拆 2 条真值），TESTS: 89/89 passed。
- 浏览器：Playwright MCP 真实点击两个场景 — 小米人在 Pro·吸顶（state 7 字段 + #info 240px + 5 组 + 预设选中态 + 4 色点）；子擎 Trio·侧装 + hover 房间中心（state + 罗盘 1500/2000/2000/1500），artifacts/ui-review-presets.json，2 张截图。
- SHA：<填实际>
```

- [ ] **Step 8.3: 提交**

```bash
git add docs/dev-log/2026-05-19-progress.md  # 或新建的文件
git commit -m "docs: log UI review progress (presets, compass, coverage)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## 自检清单

- [x] 规格 §4.1 右栏 240px → Task 6.1 (A)
- [x] §4.1 chips 1×4 → Task 6.1 (B)
- [x] §4.2 罗盘 hover → Task 6.2 (A) addHoverCompass
- [x] §4.3 覆盖区色点 → Task 6.2 (A) addCoverageGrid + Task 3 Info.coverage
- [x] §4.4 工具栏预设组 → Task 5
- [x] §4.4.1 applyPreset → Task 4
- [x] §4.4.2 variantMatchesState 选中态 → Task 4 + Task 5.2 渲染时 .on 类
- [x] §4.5 src/presets.js + script tag → Task 2
- [x] §4.6 范围扩展 → Task 1
- [x] §5.1 测试断言 → Task 1 (4) + Task 3 (5) + Task 4 (7) = 16（spec 估 13，差异：Task 1 比 spec 多 2 条 clamp 保护性断言；Task 3 角点占位拆 2 条实测真值）
- [x] §5.2 Playwright 验证 → Task 7
- [x] §6 验收标准全部对应到测试或浏览器场景
- [x] §7 风险与回退：rebuild 焦点丢失（预设按钮触发；用户不在编辑态）/ 几何一致性（Info.coverage 复用 Geo）/ 上限扩展（既有 73 测试回归）— 实现里都有保护

字段命名一致性核对：

- `Info.coverage` 返回 `{stand, sit, lie, ground}` —— Task 3 实现 + Task 4 不引用 + Task 6 addCoverageGrid 引用 `cv.stand / cv.sit / cv.lie / cv.ground`。✓
- `Interact.applyPreset` 第二参数 `variant` —— Task 4 实现 + Task 5.2 调用 + Task 7.2 浏览器调用一致。✓
- `Interact.variantMatchesState(state, v)` —— Task 4 实现 + Task 5.2 调用一致。✓
- `window.SensorPresets[].variants[]` 字段：`mount, label, hFov, vFov, rangePresence, rangeMotion, height, tilt` —— spec §4.5、Task 2 数据、Task 4 测试用例 `variantOf` 都引用同名键。✓
- script src 顺序：`geo.js → presets.js → state.js → render.js → info.js → interact.js → tests.js → app.js` —— spec §4.5 + Task 2.2 一致。✓
- 测试基线最终清点：

  - Task 1 +4（2 条 Interact.clamp 保护 + 2 条 num input.max 控件实测）
  - Task 3 +5（center / null / outside + 角点 stand 实测 + 角点 ground 实测）
  - Task 4 +7（5 条 preset 字段断言 + 2 条 variantMatchesState）
  - 合计 +16，73 → 89

  各 Step 内的预期测试数（77 / 82 / 89）与此一致。

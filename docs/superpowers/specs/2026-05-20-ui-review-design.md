# UI Review — 右栏布局、覆盖区提示、传感器预设 — 设计文档

日期：2026-05-20
形态：在现有 `index.html` + `src/*.js`（vanilla JS、无构建）基础上的增量改动
依赖原始设计：`docs/superpowers/specs/2026-05-19-presence-sensor-visualizer-design.md`

---

## 1. 目标

本轮交互 review 解决三个问题：

1. **全屏时右栏过宽**：固定 320px 在大屏占比偏高，信息密度低。
2. **鼠标位置实时参数布局不直观**：当前 2×2 网格的上/左/右/下需要看完才能拼回空间关系；且洋葱圈半透明色重叠后用户分不清光标当前属于哪几个被检测高度。
3. **下方参数调整栏缺少预设入口**：用户需要手动输入参数才能切换到具体型号（子擎 Trio / 子擎 Celling / 小米人在 Pro），缺少一键复现具体型号场景的能力。

## 2. 范围

**做：**

- 右栏宽度 320px → 240px。
- 右栏「鼠标位置」改为罗盘布局（上/左/右/下分别落在对应方位）+ 中央迷你房间预览。
- 右栏新增「覆盖区」节：4 个高度档位（站 1200 / 坐 750 / 躺 600 / 地 0）色点矩阵；判定与渲染的洋葱填充层完全一致。
- 「当前参数」chips 从 2×2 改 1×4 单行，配合更窄的右栏。
- 工具栏右端新增「传感器预设」组（自带衬线分隔），按型号分行、按安装方式出子按钮。
- 预设数据放 `src/presets.js`（一个公开的 `window.SensorPresets`，等同 JSON 字面量），双击 `index.html` 即可加载。
- 扩展两个参数上限：`vFov` 上限 90° → 160°，`rangePresence` 上限 5000 mm → 6000 mm。

**不做（YAGNI）：**

- 预设的增删改 UI（直接编辑 `src/presets.js`）。
- 自定义被检测高度档位、自定义颜色、收藏夹/多预设对比。
- 房间尺寸 W/D 进入预设（预设只描述传感器配置）。
- 改动 `geo.js` / `render.js` 的几何与渲染逻辑（本轮纯 UI / state / 控件）。

## 3. 当前实现回顾（变更前）

`index.html` 用 CSS Grid `1fr 320px / 1fr 190px`，右栏 `#info` 固定 320px。`Info.render` 顺序：
mini-room → 安装定位 rows → 4 个 chip（H/V/P/M，2×2）→ 当前参数 rows → 「鼠标位置」标题 → hover-grid（上/左/右/下，2×2）。

`#tools` 由 `Interact.rebuild()` 渲染 4 个 `.tool-group`：空间 / 安装 / 视场 / 距离。`.tool-group { border-right }`，`.tool-group:last-child { border-right:0 }` 实现衬线分隔。

参数范围（`Interact` 调用 `num(label, key, lo, hi, step, disabled)`）：

| 字段 | 旧上下限 |
|---|---|
| hFov | 90–160° |
| vFov | 45–90° |
| rangePresence | 3000–5000 mm |
| rangeMotion | 5000–8000 mm |
| height（吸顶 / 侧装 / 墙角） | 2000–5000 / 1000–2000 / 1000–2000 mm |
| tilt | 0–30°（吸顶禁用） |

## 4. 详细设计

### 4.1 右栏（`#info`）宽度与节结构

`index.html` 内 `#app` 的 grid 列宽 `1fr 320px` → `1fr 240px`。其它 CSS：

- `#info` padding 仍 15px。
- chips: 由 `grid-template-columns:1fr 1fr` 改 `1fr 1fr 1fr 1fr`，间距收紧到 6px。

`Info.render(st, hv)` 节顺序（不变方向，调整内部子组件）：

1. `addMountGlyph(box,st)` — mini-room 高度 86px → 72px，与新右栏比例协调。
2. 「安装定位」rows — 不变。
3. 「当前参数」chips — 1×4 单行，每个 chip 仍是 `<b>标签</b><span>值</span>`。
4. 「鼠标位置」— 替换为 `addHoverCompass(box, st, hv)`，见 §4.2。
5. 「覆盖区」— 新节，`addCoverageGrid(box, st, hv)`，见 §4.3。

### 4.2 鼠标位置罗盘 `addHoverCompass`

DOM 形状（CSS Grid 3×3）：

```
┌──────────────┐
│       ↑      │
│      1200    │
│              │
│ 900  ┌──┐ 1400│
│      │ ·│    │   ← 中央 mini-room 风格，预览光标在房间的位置
│      └──┘    │
│              │
│      ↓ 800   │
└──────────────┘
```

- 4 个数字：top=`st.room.D - mm.y`、bottom=`mm.y`、left=`mm.x`、right=`st.room.W - mm.x`（与现有 `Info.hover()` 返回值同义，复用即可）。
- 中央复用 `.mini-room` 样式（去掉传感器点、加一个光标点）；光标点用与传感器点不同的颜色（`#facc15` 黄）。
- 房间外或 hv=null：四方数字均为 `—`，中央光标点隐藏。

### 4.3 覆盖区色点矩阵 `addCoverageGrid`

4 个高度档位（与 `Render.LAYERS` 同源）：

| 档位 | 高度 mm | 颜色 |
|---|---|---|
| 站 | 1200 | `#9b8cff` |
| 坐 | 750 | `#5fb0ff` |
| 躺 | 600 | `#5fe0c0` |
| 地 | 0 | `#f5d05a` |

判定（与 `Render.layerPolys` 同源逻辑）：对档位 `h`，光标 `mm` 属于该覆盖区当且仅当：

```
Geo.inBeamAtHeight(fr, aH, aV, mm, h) === true
&& 3D 距离 |P-S| <= st.rangeMotion
```

其中 `fr = Geo.beamFrame(st)`、`aH = rad(hFov/2)`、`aV = rad(vFov/2)`、`P = (mm.x, mm.y, h)`、`S = fr.S`。这套判定**必须**完全复用渲染层用过的 `Geo.inBeamAtHeight` 与 `rangeProjectionRadius`，避免视觉色块与文字提示不一致。

新建 `State.coverageZonesAt(st, mm)` 或 `Info.coverage(st, mm)` 暴露这一判定（4 个布尔值的数组）；推荐放 `Info`（不污染 `State` 模块）。

布局：2×2，每个格子 `<dot> <label> <h>mm`。`dot` 是 10×10 圆，被覆盖时填实色，未覆盖时 `border` + 透明填充。房间外 / null 时显示 4 个未覆盖灰点。

### 4.4 工具栏「传感器预设」组

`Interact.rebuild()` 末尾追加第 5 组：

```js
group('传感器预设', [presetsGroup()]);
```

`presetsGroup()` 返回一个容器，里面按 `window.SensorPresets` 顺序渲染：

```
子擎 Trio        [侧装]
子擎 Celling     [吸顶]
小米人在 Pro     [吸顶][侧装][墙角]
```

每行 DOM：

```html
<div class="preset-row">
  <span class="preset-name">小米人在 Pro</span>
  <div class="preset-variants">
    <button class="seg-btn">吸顶</button>
    <button class="seg-btn">侧装</button>
    <button class="seg-btn">墙角</button>
  </div>
</div>
```

样式与现有 `.seg button` 保持一致；按钮文字用 variant.label。

衬线分隔：现有 `.tool-group { border-right }` 会在新预设组与其左侧的「距离」组之间自动出现一条 1px 竖线；「预设」组成为 `:last-child`，自身无右边线。

#### 4.4.1 applyPreset(st, variant)

```js
function applyPreset(st, variant){
  State.applyMount(st, variant.mount);   // 1. 切 mount，重置 MOUNT_DEFAULTS
  // 2. 用 variant 字段覆盖（仅覆盖 variant 含有的键），每个值都钳到允许范围
  if(variant.hFov          != null) st.hFov          = clamp(variant.hFov,          90,   160);
  if(variant.vFov          != null) st.vFov          = clamp(variant.vFov,          45,   160);
  if(variant.rangePresence != null) st.rangePresence = clamp(variant.rangePresence, 3000, 6000);
  if(variant.rangeMotion   != null) st.rangeMotion   = clamp(variant.rangeMotion,   5000, 8000);
  if(variant.height        != null) {
    var lim = {ceiling:[2000,5000], side:[1000,2000], corner:[1000,2000]}[st.mount];
    st.height = clamp(variant.height, lim[0], lim[1]);
  }
  if(variant.tilt          != null) st.tilt          = clamp(variant.tilt,          0,    30);
  rebuild();        // 3. 重建控件（高度等控件 max 随 mount 变化）
  onChange();       // 4. 重绘 + Info 刷新
}
```

`State.applyMount` 已经处理 wall/corner/sensor 的吸附与重置。预设不写 wall、corner、hAngle、sensor 这些「位置类」字段；用户应在预设之上拖动传感器或单选墙/角。

#### 4.4.2 选中态

每次 `rebuild()` 检查每个 variant 与当前 state 是否「全字段一致」：

```js
function variantMatchesState(st, v){
  if(st.mount !== v.mount) return false;
  if(v.hFov          != null && st.hFov          !== v.hFov)          return false;
  if(v.vFov          != null && st.vFov          !== v.vFov)          return false;
  if(v.rangePresence != null && st.rangePresence !== v.rangePresence) return false;
  if(v.rangeMotion   != null && st.rangeMotion   !== v.rangeMotion)   return false;
  if(v.height        != null && st.height        !== v.height)        return false;
  if(v.tilt          != null && st.tilt          !== v.tilt)          return false;
  return true;
}
```

匹配的按钮加 `.on` 类（与 `.seg button.on` 同款）；任何字段被手动改动后下一次 rebuild 时选中态会自动消失。

### 4.5 预设数据文件 `src/presets.js`

```js
/* ===== Sensor Presets ===== */
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

- 字段：`id`, `name`, `variants[]`；每个 variant 含 `mount`、`label` 与可选的 hFov / vFov / rangePresence / rangeMotion / height / tilt。
- 缺省字段 = 使用该 mount 的 `MOUNT_DEFAULTS`（State.applyMount 已经处理）。
- 未来新增型号：直接编辑该文件加新对象 / variant。

`index.html` 的 script 顺序调整：`presets.js` 放 `state.js` **之前**（保证 State 与 Interact 加载时全局变量已就位）：

```html
<script src="src/geo.js"></script>
<script src="src/presets.js"></script>   <!-- NEW -->
<script src="src/state.js"></script>
<script src="src/render.js"></script>
<script src="src/info.js"></script>
<script src="src/interact.js"></script>
<script src="src/tests.js"></script>
<script src="src/app.js"></script>
```

### 4.6 参数范围扩展

| 字段 | 旧 | 新 | 控件 label |
|---|---|---|---|
| vFov | 45–90° | 45–160° | `垂直 FOV (45-160°)` |
| rangePresence | 3000–5000 | 3000–6000 | `存在距离 (3000-6000)` |
| 其他 | 不变 | 不变 | 不变 |

只需改 `Interact.rebuild()` 里两个 `num(...)` 调用的上界与文字。

## 5. 测试

### 5.1 tests.js 新增断言（node tools/run-tests.mjs）

- **coverage zone classification（4 条）**
  - 默认吸顶、传感器在中心、`coverage(st, {x: room.W/2, y: room.D/2})` 返回 `[true,true,true,true]`。
  - 同场景的房间角点 `(0,0)`，至少 1 个高度返回 false（必有边界外）。
  - `coverage(st, null)` 与 `coverage(st, {x:-100,y:0})` 返回 `[false,false,false,false]`。
- **apply preset semantics（5 条）**
  - 应用 `ziqing-trio` 侧装：`mount==='side' && hFov===160 && rangePresence===6000 && rangeMotion===7000 && height===1500 && tilt===0`（5 个 AND 拆 5 条断言或合 1 条）。
  - 应用 `ziqing-celling` 吸顶：`mount==='ceiling' && vFov===160 && height===2400`（高度由 MOUNT_DEFAULTS 兜底）。
  - 应用 `xiaomi-pro` 吸顶：`mount==='ceiling' && hFov===110 && vFov===60 && height===2400 && tilt===0`。
  - 应用 `xiaomi-pro` 侧装：`mount==='side' && height===1800 && tilt===30`。
  - 应用 `xiaomi-pro` 墙角：`mount==='corner' && height===1500 && tilt===0 && hAngle===45`（hAngle 固定）。
- **range extension regression（2 条）**
  - `Interact.clamp(160, 45, 160, 90) === 160`。
  - `Interact.clamp(6000, 3000, 6000, 3000) === 6000`。
- **variantMatchesState（2 条）**
  - 默认 state 与任何 variant 全字段一致时返回 true（用一个测试用 state 构造）。
  - 把 hFov 改 1°，立即返回 false。

合计 +13 断言（73 → 86）。

### 5.2 浏览器视觉验证（playwright）

跑两个真实点击场景（不依赖 VM）：

- 点 `小米人在 Pro · 吸顶`：截图 → 右栏 5 节齐全；mini-room、安装定位、chips（1×4）、罗盘、覆盖区四点全亮；工具栏第 5 组「传感器预设」展示且该按钮处于 `.on` 选中态；左侧距离组的右侧出现衬线分隔线。
- 点 `子擎 Trio · 侧装`：state.mount='side'、wall='left'、sensor=(0, D/2)；hover 房间中心 `(W/2, D/2)`，罗盘上 = D/2、下 = D/2、左 = W/2、右 = W/2；覆盖区点亮情况与 layerPolys 一致。

输出物：`artifacts/ui-review-presets.json`（含每个场景的 state、各色点 expected vs actual）+ 2 张截图。

### 5.3 不在范围

- 不验证不同浏览器；保持现有 Playwright 单浏览器配置。
- 不引入新 e2e 框架。

## 6. 验收标准

1. 默认 1440×900 窗口下，右栏占 240px（`document.querySelector('#info').getBoundingClientRect().width` 接近 240）。
2. 右栏从上到下 5 节齐全：mini-room、安装定位、当前参数（1×4 chips）、鼠标位置（罗盘）、覆盖区（2×2 色点）。
3. 工具栏第 5 组「传感器预设」存在；与「距离」组之间有 1px 衬线；该组自身右侧无衬线（仍是 last-child）。
4. 点击任一预设按钮，state 字段按 §4.4.1 准确更新；该按钮显示 `.on` 选中态；手动改一个字段后选中态消失。
5. tests.js 新增 13 条断言全过；playwright 2 个场景的截图与 JSON 满足 §5.2。
6. 在房间外 hover 不报错；罗盘与覆盖区都呈灰 `—`。

## 7. 风险与回退

- **rebuild 焦点丢失**：现有 `Interact.rebuild()` 全部清空 `#tools`。预设按钮点击 → applyPreset → rebuild，期间用户没在输入框聚焦，影响小。`#info` 的 hover-compass / coverage 更新只在 hover 时触发，独立于 rebuild。
- **覆盖区判定与渲染层不一致**：风险来自分别实现两套点-in-cone 判定。规避：`Info.coverage` 必须调用 `Geo.inBeamAtHeight` 与 `rangeProjectionRadius`，不复制公式。测试用 5.1 §coverage zone 4 条断言把关。
- **vFov / rangePresence 上限扩展影响几何**：`Geo.footprint` 与 `boundaryCurveSegments` 已经使用真实 3D 距离公式，FOV/距离取值大不会触发新数学路径；既有 73 条断言仍应全过。回归一遍即可。
- **回退**：所有改动局限于 `index.html`、`src/info.js`、`src/interact.js`、新增 `src/presets.js` 与 tests.js 末尾段。一次 `git revert` 回到当前 SHA 即可全部撤回。

# 传感器预设：下拉 + 使用按钮 + 新增 Lite/2S — 设计文档

日期：2026-05-20（接续）
形态：在现有 `index.html` + `src/*.js` 之上的增量改动
依赖：`docs/superpowers/specs/2026-05-20-ui-review-design.md`（首轮 UI Review 的 spec）

---

## 1. 目标

1. **新增 3 个 variant**：子擎 Lite（吸顶 / 侧装）、小米人体 2S（侧装）。
2. **预设区 UI 由 "型号分行 + 多 variant 按钮" 改为 "下拉 + 使用 按钮 + 当前指示"**。原因：variants 增多到 8 个，逐行按钮会撑爆工具栏宽度。
3. **侧装 / 墙角高度下限 1000mm → 200mm**：2S 侧装 200mm 落在原下限之外，需要放宽。

## 2. 范围

**做：**

- `src/presets.js`：增 2 个 model（Lite、2S），共 3 个新 variant。
- `src/interact.js`：重写 `presetsGroup()` 为 `<select> + button + 当前指示` 三块；`hRange()` 与 `applyPreset` 的高度限位改为 `side/corner [200,2000]`。
- `src/tests.js`：+9 条断言（3 新 variant + 2 高度边界 + 2 dropdown DOM + 2 当前指示）。
- `index.html`：移除旧 `.preset-row / .preset-name / .preset-variants / .preset-btn*` CSS，新增 `.preset-row1 / .preset-select / .preset-apply / .preset-current`。
- 浏览器视觉验证：用 `superpowers-chrome` MCP 跑 2 个新场景（Lite 顶装、2S 侧装）。

**不做（YAGNI）：**

- 下拉的 autocomplete / 搜索 / 分组（`<optgroup>`）。
- 收藏多个预设、对比模式。
- "重置为自定义"按钮。
- 删除 / 重命名预设的 UI（仍编辑 `src/presets.js`）。
- 改动 `geo.js / render.js / info.js`。
- 改动 `applyPreset` / `variantMatchesState` 的逻辑契约。

## 3. 当前实现回顾（变更前）

`Interact.presetsGroup()`（约 50 行）渲染 `.preset-container` 内若干 `.preset-row`，每行一个 `.preset-name` + 多个 `.preset-btn`；点击 → `applyPreset(st, variant)`；按钮 `.on` 状态由 `variantMatchesState(st, v)` 计算。

`Interact.applyPreset` 中：

```js
var lim = {ceiling:[2000,5000], side:[1000,2000], corner:[1000,2000]}[state.mount];
state.height = clamp(variant.height, lim[0], lim[1]);
```

`Interact.hRange()`（控件渲染）：

```js
var lim={ceiling:[2000,5000],side:[1000,2000],corner:[1000,2000]}[st.mount];
return num('安装高度 (mm)','height',lim[0],lim[1],10,false);
```

`window.SensorPresets` 已有 3 model / 5 variant：Trio·side / Celling·ceiling / Pro·ceiling / Pro·side / Pro·corner。

测试基线：`TESTS: 101/101 passed`（commit 11619c1）。

## 4. 详细设计

### 4.1 `src/presets.js` — 新增 2 model / 3 variant

在数组末尾追加两个对象：

```js
{
  id: "ziqing-lite",
  name: "子擎 Lite",
  variants: [
    { mount: "ceiling", label: "吸顶",
      hFov: 130, vFov: 130, rangePresence: 4000, rangeMotion: 8000,
      tilt: 0 },
    { mount: "side",    label: "侧装",
      hFov: 130, vFov: 130, rangePresence: 4000, rangeMotion: 8000,
      tilt: 0 }
  ]
},
{
  id: "xiaomi-body-2s",
  name: "小米人体 2S",
  variants: [
    { mount: "side",    label: "侧装",
      hFov: 130, vFov: 130, rangePresence: 3000, rangeMotion: 8000,
      height: 200, tilt: 0 }
  ]
}
```

字段说明：

- Lite 两个 variant 未显式写 `height`，沿用 MOUNT_DEFAULTS（ceiling 2400 / side 1500）。
- Lite 显式 `tilt: 0`，与既有 Celling·ceiling / Pro·ceiling 一致（避免 apply/match 对 tilt 的不对称）。
- 2S 侧装 `height: 200` 是关键依据，对应房间地脚线 / 踢脚线高度的真实安装位。

数据顺序选择：Lite 在 Pro 之后、2S 在最后。下拉里的展现顺序与此一致。

### 4.2 高度范围下限 1000 → 200

`src/interact.js` 内两处 `lim` 字面量都同步更新：

- `applyPreset(state, variant)`：`side:[200,2000], corner:[200,2000]`
- `hRange()`：`side:[200,2000], corner:[200,2000]`

高度控件的 label `'安装高度 (mm)'` 不变（无具体数字）。

吸顶仍是 [2000, 5000]（不放宽）。

### 4.3 安装方式简称映射

仅 UI 文案用；数据里仍是 `ceiling/side/corner`。

```js
var MOUNT_SHORT = { ceiling: '顶装', side: '侧装', corner: '角装' };
```

定义在 `presetsGroup()` 内或作为 Interact IIFE 内的常量。dropdown option 文案 = `model.name + ' / ' + MOUNT_SHORT[variant.mount]`。

### 4.4 `presetsGroup()` 重写

DOM 结构：

```html
<div class="preset-container">
  <div class="preset-row1">
    <select class="preset-select">
      <option value="ziqing-trio:side">子擎 Trio / 侧装</option>
      <option value="ziqing-celling:ceiling">子擎 Celling / 顶装</option>
      <option value="xiaomi-pro:ceiling">小米人在 Pro / 顶装</option>
      <option value="xiaomi-pro:side">小米人在 Pro / 侧装</option>
      <option value="xiaomi-pro:corner">小米人在 Pro / 角装</option>
      <option value="ziqing-lite:ceiling">子擎 Lite / 顶装</option>
      <option value="ziqing-lite:side">子擎 Lite / 侧装</option>
      <option value="xiaomi-body-2s:side">小米人体 2S / 侧装</option>
    </select>
    <button class="preset-apply">使用</button>
  </div>
  <div class="preset-current">当前: <span>…</span></div>
</div>
```

实现要点：

1. **拍平变体**：把 `window.SensorPresets` 的所有 variants 展开成 `flat=[{model, variant, key, label}]`，`key = model.id + ':' + variant.mount`，`label = model.name + ' / ' + MOUNT_SHORT[variant.mount]`。
2. **下拉构造**：每条 flat 一个 `<option>`；首项默认选中。
3. **使用按钮**：始终启用；点击 → `var pick = flat.find(f => f.key === sel.value); if(pick) applyPreset(st, pick.variant);`。注意 `applyPreset` 触发 `rebuild()` → 本组重建。
4. **当前指示**：在 `presetsGroup()` 构造时调用 `flat.find(f => variantMatchesState(st, f.variant))`，命中则文本为 `f.label`，否则 `—`。
5. **下拉选择记忆**：Interact IIFE 顶部加 `var lastPresetKey = null;`。`presetsGroup()` 构造时若 `lastPresetKey` 非空且存在该 option，把它设为 `sel.value`（覆盖首项默认）。「使用」按钮点击时 `lastPresetKey = sel.value;`。这样 rebuild 后下拉仍停在用户上次选的项。

### 4.5 CSS（`index.html`）

**删除**：`.preset-row`、`.preset-name`、`.preset-variants`、`.preset-btn`、`.preset-btn.on`、`.preset-btn:hover` 共 6 条规则。

**新增**（在原 `.preset-container` 规则之后，重写 `.preset-container` 的 `min-width`）：

```css
  .preset-container{display:flex;flex-direction:column;gap:6px;min-width:200px;}
  .preset-row1{display:flex;gap:6px;align-items:center;}
  .preset-select{flex:1;background:#0c0e12;border:1px solid #2c333d;color:#e6e8eb;border-radius:5px;padding:4px 6px;font-size:12px;}
  .preset-apply{padding:4px 12px;font-size:12px;color:#fff;background:#274168;border:1px solid #3a5a89;border-radius:5px;cursor:pointer;}
  .preset-apply:hover{background:#2f4d7c;}
  .preset-current{font-size:11px;color:#9aa3af;font-variant-numeric:tabular-nums;}
  .preset-current span{color:#e6e8eb;}
```

## 5. 测试

### 5.1 `tests.js` 新增（+9 条；101 → 110）

```javascript
  // --- Presets Dropdown ---
  (function(){
    function variantOf(id,mount){
      var p=window.SensorPresets.filter(function(x){return x.id===id;})[0];
      return p.variants.filter(function(v){return v.mount===mount;})[0];
    }
    var s;
    // 3 新 variant 应用语义
    s=State.defaults(); Interact.applyPreset(s, variantOf('ziqing-lite','ceiling'));
    ok('preset lite ceiling',
      s.mount==='ceiling'&&s.hFov===130&&s.vFov===130&&s.rangePresence===4000&&s.rangeMotion===8000&&s.height===2400&&s.tilt===0);
    s=State.defaults(); Interact.applyPreset(s, variantOf('ziqing-lite','side'));
    ok('preset lite side',
      s.mount==='side'&&s.hFov===130&&s.vFov===130&&s.rangePresence===4000&&s.rangeMotion===8000&&s.height===1500&&s.tilt===0);
    s=State.defaults(); Interact.applyPreset(s, variantOf('xiaomi-body-2s','side'));
    ok('preset 2s side height 200',
      s.mount==='side'&&s.hFov===130&&s.vFov===130&&s.rangePresence===3000&&s.rangeMotion===8000&&s.height===200&&s.tilt===0);
    // 高度边界
    ok('clamp side height 200', Interact.clamp(200,200,2000,1000)===200);
    s=State.defaults(); Interact.applyPreset(s, variantOf('xiaomi-body-2s','side'));
    ok('apply 2s preserves height 200', s.height===200);
    // dropdown DOM
    var optCount=document.querySelectorAll('#tools .preset-select option').length;
    var totalVariants=window.SensorPresets.reduce(function(a,p){return a+p.variants.length;},0);
    ok('dropdown option count matches variants', optCount===totalVariants);
    var firstOpt=document.querySelectorAll('#tools .preset-select option')[0];
    ok('dropdown first option', firstOpt&&firstOpt.value==='ziqing-trio:side'&&firstOpt.textContent==='子擎 Trio / 侧装');
    // 当前指示
    var stU=State.defaults(); Interact.init(stU,function(){});
    Interact.applyPreset(stU, variantOf('ziqing-lite','ceiling'));
    var curSpan=document.querySelector('#tools .preset-current span');
    ok('preset-current after apply lite ceiling', curSpan&&curSpan.textContent==='子擎 Lite / 顶装');
    stU.hFov=99;
    Interact.init(stU,function(){}); // 重建一次让 preset-current 重新计算
    var curSpan2=document.querySelector('#tools .preset-current span');
    ok('preset-current dash when no match', curSpan2&&curSpan2.textContent==='—');
  })();
```

> 注：`Interact.init` 在 VM 内是同步的，`rebuild()` 之后 DOM 就可被查询。`stU.hFov=99` 之后必须 `Interact.init` 重建一次才能让 `presetsGroup` 重新构造 `.preset-current`（因为 `applyPreset` 在测试调用时 `st !== stU`，UI 重建走不通）。

### 5.2 浏览器视觉验证

用 `superpowers-chrome` MCP 加 file:// 跑 2 个场景：

- **A. Lite / 顶装**：在 dropdown 选第 6 个 option → click 「使用」 → 验证 state 7 字段、`.preset-current span` = `子擎 Lite / 顶装`、SVG 重绘后存在洋葱层 polygon。
- **B. 2S / 侧装**：选最后一个 option → 「使用」 → 验证 `height === 200`（不被旧 1000 钳死）、`.preset-current span` = `小米人体 2S / 侧装`、`#tools .ctl input[type=number]` 中 `min === '200'`。

输出物：`artifacts/ui-presets-dropdown.json` + `output/playwright/ui-presets-dropdown-lite-ceiling.png` + `output/playwright/ui-presets-dropdown-2s-side.png`。

### 5.3 不在范围

- 不验证下拉的键盘导航（浏览器原生处理）。
- 不验证不同浏览器。

## 6. 验收标准

1. 默认 1440×900 窗口下，`#tools` 第 5 组 `传感器预设` 内可见：1 个下拉、1 个使用按钮、1 行当前指示。无 5 个独立按钮。
2. 下拉里有 8 个 option，文本与 §4.4 列出的 8 个完全一致。
3. 点击「使用」（选默认首项 Trio/侧装）：state 改为 side/hFov160/vFov90/rangePresence6000/rangeMotion7000/height1500/tilt0；`.preset-current span` 显示 `子擎 Trio / 侧装`。
4. 选 `小米人体 2S / 侧装` → 使用：state.height === 200；安装高度 num 控件 min === 200；范围滑杆能拉到 200。
5. tests.js 新增 9 条断言全过；TESTS 总数 110/110。
6. 改一个参数（如 hFov）让其偏离当前预设，下次 rebuild（拖动传感器或改 W/D）后 `.preset-current span` 变 `—`。

## 7. 风险与回退

- **rebuild 后下拉选择丢失**：`lastPresetKey` 模块级变量解决。需要确保 `presetsGroup()` 每次都从中读取最新值（不要被旧值覆盖到 null）。
- **`.preset-current` 在 hover 时不会更新**：当前指示只在 rebuild 时计算；hover 不触发 rebuild。这是合理的——hover 不改 state，预设匹配也不会变。
- **侧装/墙角下限 200 影响既有逻辑**：现有的 `Interact.placeSensor` / `resnapRoom` / `relocateSideWall` 都依赖 `state.height`，但只是读取，不参与高度钳位；扩展下限不影响这些路径。`hRange` 控件 min 变 200 只是滑杆能拉得更低，已有的 num 输入框相同。回归靠既有 73 个非新增断言把关。
- **回退**：改动局限在 `src/presets.js`、`src/interact.js`、`src/tests.js`、`index.html`。`git revert` 单笔即可。

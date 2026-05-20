# 传感器预设：下拉 UI + Lite/2S 新增 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 `docs/superpowers/specs/2026-05-20-presets-dropdown-design.md` ——新增 3 个 variant（子擎 Lite 吸顶 / 侧装、小米人体 2S 侧装）；把工具栏第 5 组的预设区从 5 个独立按钮改为下拉 + 使用按钮 + 当前指示；side/corner 安装高度下限 1000 → 200 mm。

**Architecture:** 增量改动现有 vanilla JS 模块。数据层只新增 2 个 model 到 `src/presets.js`。UI 层重写 `Interact.presetsGroup()`（约 ~50 行），并改两处高度限位（`hRange` + `applyPreset` 内部 `lim` 字面量）。CSS 删旧按钮规则，加下拉/按钮/当前指示规则。逻辑层 `applyPreset` / `variantMatchesState` 不动。

**Tech Stack:** vanilla JS（IIFE 模块），CSS Grid/Flex，Tests.extra 测试框架 + node tools/run-tests.mjs，浏览器视觉验证用 superpowers-chrome MCP。

**Spec：** `docs/superpowers/specs/2026-05-20-presets-dropdown-design.md`（commit 8797ccd）。

**基线测试数：** 101（`node tools/run-tests.mjs` exit 0 at HEAD 11619c1）。

---

## 文件结构

| 文件 | 类型 | 责任 |
|---|---|---|
| `src/presets.js` | 改 | 数组末尾新增 ziqing-lite（2 variants）、xiaomi-body-2s（1 variant） |
| `src/interact.js` | 改 | `hRange()`、`applyPreset()` 内 lim 字面量 side/corner 下限 1000→200；`presetsGroup()` 重写为下拉 + 使用 + 当前指示；IIFE 顶部加 `lastPresetKey` |
| `src/tests.js` | 改 | `Tests.extra` 末尾追加 9 条断言 |
| `index.html` | 改 | 删 6 条 `.preset-row*/.preset-name/.preset-variants/.preset-btn*` CSS；新增 7 条 `.preset-row1/.preset-select/.preset-apply/.preset-current` CSS |
| `docs/dev-log/2026-05-19-progress.md` | 改 | 追加本次进度块 |

---

## Task 1 — 高度范围下限 1000 → 200（side/corner）

**Files:**
- Modify: `src/interact.js`（两处 lim 字面量 + 1 处控件 label 无需动）
- Modify: `src/tests.js`（追加 1 条 clamp 断言）

- [ ] **Step 1.1: 写失败测试**

打开 `src/tests.js`，找到 `Tests.extra=function(ok,approx){` 函数体的最后一个 `};`（即 IIFE 末尾的关闭花括号）之前，追加：

```javascript
  // --- Presets Dropdown · height lower bound ---
  ok('clamp side height 200', Interact.clamp(200,200,2000,1000)===200);
```

- [ ] **Step 1.2: 跑测试确认 PASS（不会 fail，因为 clamp 接受任意上下界）**

```bash
node tools/run-tests.mjs 2>&1 | tail -3
```

预期：`TESTS: 102/102 passed`（基线 101 + 这 1 条 clamp 保护性断言天然通过）。clamp 自身一直接受任意区间，这条断言纯属未来回归保护——如果有人误把 200 替换成 1000，断言立即报警。

- [ ] **Step 1.3: 修改 `src/interact.js` 两处 lim 字面量**

(A) 找到 `function hRange()`（约第 69 行），当前：

```javascript
  function hRange(){var lim={ceiling:[2000,5000],side:[1000,2000],corner:[1000,2000]}[st.mount];
    return num('安装高度 (mm)','height',lim[0],lim[1],10,false);}
```

改为：

```javascript
  function hRange(){var lim={ceiling:[2000,5000],side:[200,2000],corner:[200,2000]}[st.mount];
    return num('安装高度 (mm)','height',lim[0],lim[1],10,false);}
```

(B) 找到 `function applyPreset(state, variant)`（约第 86 行），内部：

```javascript
    if(variant.height        != null){
      var lim = {ceiling:[2000,5000], side:[1000,2000], corner:[1000,2000]}[state.mount];
      state.height = clamp(variant.height, lim[0], lim[1]);
    }
```

改为：

```javascript
    if(variant.height        != null){
      var lim = {ceiling:[2000,5000], side:[200,2000], corner:[200,2000]}[state.mount];
      state.height = clamp(variant.height, lim[0], lim[1]);
    }
```

只动 side 与 corner 的下限：`1000 → 200`。ceiling 不动。

- [ ] **Step 1.4: 跑测试确认无回归**

```bash
node tools/run-tests.mjs 2>&1 | tail -3
```

预期：`TESTS: 102/102 passed`。

- [ ] **Step 1.5: 提交**

```bash
git add src/interact.js src/tests.js
git commit -m "$(cat <<'EOF'
feat(interact): lower side/corner mount height range to 200mm

To accept the upcoming 小米人体 2S preset (side mount at 200mm,
typical for baseboard sensors). hRange and applyPreset clamp logic
both updated symmetrically.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — 新增 Lite / 2S variants

**Files:**
- Modify: `src/presets.js`（数组末尾追加 2 个 model）
- Modify: `src/tests.js`（追加 4 条 apply 断言）

- [ ] **Step 2.1: 写失败测试**

`src/tests.js` 的 `Tests.extra` 末尾，Task 1 的断言之后，追加：

```javascript
  (function(){
    function variantOf(id,mount){
      var p=window.SensorPresets.filter(function(x){return x.id===id;})[0];
      return p&&p.variants.filter(function(v){return v.mount===mount;})[0];
    }
    var s;
    s=State.defaults(); Interact.applyPreset(s, variantOf('ziqing-lite','ceiling'));
    ok('preset lite ceiling',
      s.mount==='ceiling'&&s.hFov===130&&s.vFov===130&&s.rangePresence===4000&&s.rangeMotion===8000&&s.height===2400&&s.tilt===0);
    s=State.defaults(); Interact.applyPreset(s, variantOf('ziqing-lite','side'));
    ok('preset lite side',
      s.mount==='side'&&s.hFov===130&&s.vFov===130&&s.rangePresence===4000&&s.rangeMotion===8000&&s.height===1500&&s.tilt===0);
    s=State.defaults(); Interact.applyPreset(s, variantOf('xiaomi-body-2s','side'));
    ok('preset 2s side height 200',
      s.mount==='side'&&s.hFov===130&&s.vFov===130&&s.rangePresence===3000&&s.rangeMotion===8000&&s.height===200&&s.tilt===0);
    s=State.defaults(); Interact.applyPreset(s, variantOf('xiaomi-body-2s','side'));
    ok('apply 2s preserves height 200', s.height===200);
  })();
```

- [ ] **Step 2.2: 跑测试，确认 4 条 FAIL**

```bash
node tools/run-tests.mjs 2>&1 | grep -E "FAIL|TESTS:"
```

预期：4 条 FAIL（`Cannot read properties of undefined (reading 'filter')` 或 `variantOf` 返回 undefined → applyPreset 在 `variant.mount` 处崩或第一个 ok 求值得 false）。`TESTS: 102/106` 之类。

- [ ] **Step 2.3: 修改 `src/presets.js`，数组末尾追加 2 个 model**

当前 `src/presets.js` 末尾应当是：

```javascript
      { mount: "corner",  label: "墙角",
        hFov: 110, vFov: 60,  rangePresence: 4000, rangeMotion: 7000,
        height: 1500, tilt: 0 }
    ]
  }
];
```

把闭合 `]` 之前的最后一个 model（`xiaomi-pro`）右花括号后加 `,`，再追加 2 个新对象：

```javascript
      { mount: "corner",  label: "墙角",
        hFov: 110, vFov: 60,  rangePresence: 4000, rangeMotion: 7000,
        height: 1500, tilt: 0 }
    ]
  },
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
];
```

- [ ] **Step 2.4: 跑测试确认全过**

```bash
node tools/run-tests.mjs 2>&1 | tail -3
```

预期：`TESTS: 106/106 passed`（101 baseline + 1 clamp + 4 new applies）。

- [ ] **Step 2.5: 提交**

```bash
git add src/presets.js src/tests.js
git commit -m "$(cat <<'EOF'
feat(presets): add 子擎 Lite (ceiling/side) and 小米人体 2S (side 200mm)

Lite ceiling/side share 130°/130° FOV with 4000/8000 ranges. The 2S
side variant uses 200mm install height (within the side range
[200, 2000] introduced by the previous commit).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — 重写 `presetsGroup()` 为下拉 + 使用 + 当前指示

**Files:**
- Modify: `src/interact.js`（IIFE 顶部加 `lastPresetKey`；重写 `presetsGroup` 函数）

- [ ] **Step 3.1: 在 `Interact` IIFE 顶部加 `lastPresetKey`**

打开 `src/interact.js`。在 `var Interact=(function(){` 之后、`function clamp(...)` 之前（约第 4 行）插入：

```javascript
  var lastPresetKey=null;
```

(没有任何函数还在用它；后面 presetsGroup 会读写。)

- [ ] **Step 3.2: 重写 `presetsGroup`**

找到现有 `function presetsGroup(){...}` 整段（约 70-90 行）。完整替换为：

```javascript
  function presetsGroup(){
    var c=document.createElement('div');c.className='preset-container';
    if(!window.SensorPresets||!window.SensorPresets.length){
      var empty=document.createElement('div');empty.style.color='#6b7280';empty.style.fontSize='11px';empty.textContent='(无预设)';
      c.appendChild(empty); return c;
    }
    var MOUNT_SHORT={ceiling:'顶装',side:'侧装',corner:'角装'};
    var flat=[];
    window.SensorPresets.forEach(function(p){
      p.variants.forEach(function(v){
        flat.push({model:p, variant:v,
          key:p.id+':'+v.mount,
          label:p.name+' / '+(MOUNT_SHORT[v.mount]||v.mount)});
      });
    });
    var row1=document.createElement('div');row1.className='preset-row1';
    var sel=document.createElement('select');sel.className='preset-select';
    flat.forEach(function(f){
      var o=document.createElement('option');o.value=f.key;o.textContent=f.label;
      sel.appendChild(o);
    });
    if(lastPresetKey){
      for(var i=0;i<flat.length;i++){
        if(flat[i].key===lastPresetKey){ sel.value=lastPresetKey; break; }
      }
    }
    var btn=document.createElement('button');btn.className='preset-apply';btn.textContent='使用';
    btn.addEventListener('click',function(){
      lastPresetKey=sel.value;
      var pick=flat.filter(function(f){return f.key===sel.value;})[0];
      if(pick) applyPreset(st,pick.variant);
    });
    row1.appendChild(sel);row1.appendChild(btn);
    c.appendChild(row1);
    var cur=document.createElement('div');cur.className='preset-current';
    var span=document.createElement('span');
    var matched=flat.filter(function(f){return variantMatchesState(st,f.variant);})[0];
    cur.appendChild(document.createTextNode('当前: '));
    span.textContent=matched?matched.label:'—';
    cur.appendChild(span);
    c.appendChild(cur);
    return c;
  }
```

关键点：
- `lastPresetKey` 模块级变量记忆下拉选择；rebuild 后能选回去。
- `MOUNT_SHORT` 字面量定义在函数内（与既有数据无关，仅 UI 文案）。
- `<option value>` 形式为 `id:mount`，用于在按钮点击时反查 variant。
- `当前: <span>` 文本由 `variantMatchesState` 即时计算；不匹配则 `—`。

- [ ] **Step 3.3: 跑既有测试，确认无回归**

```bash
node tools/run-tests.mjs 2>&1 | tail -3
```

预期：`TESTS: 106/106 passed`（dropdown DOM 在 VM 内可被 mock document 构造，rebuild 不爆错）。

- [ ] **Step 3.4: 加 dropdown 与 preset-current 的 DOM 测试**

`src/tests.js` 在 Task 2 的 IIFE 之后追加：

```javascript
  (function(){
    var stU=State.defaults();
    Interact.init(stU,function(){});
    var optCount=document.querySelectorAll('#tools .preset-select option').length;
    var totalVariants=window.SensorPresets.reduce(function(a,p){return a+p.variants.length;},0);
    ok('dropdown option count matches variants', optCount===totalVariants);
    var firstOpt=document.querySelectorAll('#tools .preset-select option')[0];
    ok('dropdown first option', firstOpt&&firstOpt.value==='ziqing-trio:side'&&firstOpt.textContent==='子擎 Trio / 侧装');
    function variantOf(id,mount){
      var p=window.SensorPresets.filter(function(x){return x.id===id;})[0];
      return p&&p.variants.filter(function(v){return v.mount===mount;})[0];
    }
    Interact.applyPreset(stU, variantOf('ziqing-lite','ceiling'));
    var curSpan=document.querySelector('#tools .preset-current span');
    ok('preset-current after apply lite ceiling', curSpan&&curSpan.textContent==='子擎 Lite / 顶装');
    stU.hFov=99;
    Interact.init(stU,function(){});
    var curSpan2=document.querySelector('#tools .preset-current span');
    ok('preset-current dash when no match', curSpan2&&curSpan2.textContent==='—');
  })();
```

- [ ] **Step 3.5: 跑测试确认 4 条新断言全过**

```bash
node tools/run-tests.mjs 2>&1 | grep -E "dropdown|preset-current|TESTS:"
```

预期：4 条 PASS + `TESTS: 110/110 passed`。

- [ ] **Step 3.6: 提交**

```bash
git add src/interact.js src/tests.js
git commit -m "$(cat <<'EOF'
feat(interact): rewrite preset group as dropdown + apply button

Replaces the 5-button row layout (too wide for 8+ variants) with a
single <select>, a 使用 button, and an info line showing the current
matching preset (or '—' when state diverged). lastPresetKey survives
across rebuilds so repeat-apply works naturally.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — CSS 更新

**Files:**
- Modify: `index.html`（删 6 条旧 CSS、新增 7 条新 CSS）

- [ ] **Step 4.1: 删除旧的 preset-btn 系列规则**

打开 `index.html`，定位到（约第 71-77 行）：

```css
  .preset-container{display:flex;flex-direction:column;gap:6px;min-width:170px;}
  .preset-row{display:flex;align-items:center;gap:8px;}
  .preset-name{flex:1;font-size:12px;color:#c4ccd6;white-space:nowrap;}
  .preset-variants{display:flex;gap:4px;}
  .preset-btn{padding:4px 9px;font-size:12px;color:#9aa3af;background:#0c0e12;border:1px solid #2c333d;border-radius:5px;cursor:pointer;}
  .preset-btn.on{background:#274168;color:#fff;border-color:#3a5a89;}
  .preset-btn:hover{color:#e6e8eb;}
```

整段（7 行）替换为：

```css
  .preset-container{display:flex;flex-direction:column;gap:6px;min-width:200px;}
  .preset-row1{display:flex;gap:6px;align-items:center;}
  .preset-select{flex:1;background:#0c0e12;border:1px solid #2c333d;color:#e6e8eb;border-radius:5px;padding:4px 6px;font-size:12px;}
  .preset-apply{padding:4px 12px;font-size:12px;color:#fff;background:#274168;border:1px solid #3a5a89;border-radius:5px;cursor:pointer;}
  .preset-apply:hover{background:#2f4d7c;}
  .preset-current{font-size:11px;color:#9aa3af;font-variant-numeric:tabular-nums;}
  .preset-current span{color:#e6e8eb;}
```

- [ ] **Step 4.2: 跑测试确认 DOM 测试仍通过**

```bash
node tools/run-tests.mjs 2>&1 | tail -3
```

预期：`TESTS: 110/110 passed`。CSS 改动不影响断言（断言只查 className 与文本内容）。

- [ ] **Step 4.3: 提交**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
style(ui): refresh preset-group CSS for dropdown layout

Drops the 5 inline button rules (.preset-row, .preset-name,
.preset-variants, .preset-btn, .preset-btn.on, .preset-btn:hover);
adds rules for the new .preset-row1, .preset-select, .preset-apply,
.preset-current trio. min-width 170→200 to keep the dropdown's
"小米人体 2S / 侧装" option readable.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — 浏览器视觉验证

**Files:**
- Create: `artifacts/ui-presets-dropdown.json`
- Create: `output/playwright/ui-presets-dropdown-lite-ceiling.png`
- Create: `output/playwright/ui-presets-dropdown-2s-side.png`

**Method:** `superpowers-chrome` MCP 加载 file:// `index.html`。沙箱阻断 TCP，无法启 HTTP server；Playwright MCP 也阻断 file://，仅 superpowers-chrome 可走通（已在前一轮 UI Review 验证过该路径）。

- [ ] **Step 5.1: 加载页面与初态校验**

调用：

```
mcp__plugin_superpowers-chrome_chrome__use_browser:
  action: navigate
  payload: file:///Users/chen/Documents/VibeCoding/People_have/.claude/worktrees/nifty-joliot-9eaffc/index.html
```

```
mcp__plugin_superpowers-chrome_chrome__use_browser:
  action: set_viewport
  viewport: {width:1440, height:900}
```

```
mcp__plugin_superpowers-chrome_chrome__use_browser:
  action: eval
  payload: JSON.stringify({
    optCount: document.querySelectorAll('.preset-select option').length,
    optLabels: Array.from(document.querySelectorAll('.preset-select option')).map(o=>o.textContent),
    initialValue: document.querySelector('.preset-select').value,
    currentText: document.querySelector('.preset-current span').textContent,
    applyBtnText: document.querySelector('.preset-apply').textContent
  })
```

预期：
- `optCount === 8`
- `optLabels` 顺序 = `["子擎 Trio / 侧装","子擎 Celling / 顶装","小米人在 Pro / 顶装","小米人在 Pro / 侧装","小米人在 Pro / 角装","子擎 Lite / 顶装","子擎 Lite / 侧装","小米人体 2S / 侧装"]`
- `initialValue === 'ziqing-trio:side'`
- `currentText === '—'`（默认 state 不匹配任何 preset）
- `applyBtnText === '使用'`

记录这个 JSON 为 `initial` 字段。

- [ ] **Step 5.2: 场景 A — Lite / 顶装**

```
mcp__plugin_superpowers-chrome_chrome__use_browser:
  action: eval
  payload: var s=document.querySelector('.preset-select');s.value='ziqing-lite:ceiling';s.dispatchEvent(new Event('change'));document.querySelector('.preset-apply').click();JSON.stringify({
    mount: window.__state.mount,
    hFov: window.__state.hFov, vFov: window.__state.vFov,
    rangePresence: window.__state.rangePresence, rangeMotion: window.__state.rangeMotion,
    height: window.__state.height, tilt: window.__state.tilt,
    selectValue: document.querySelector('.preset-select').value,
    currentText: document.querySelector('.preset-current span').textContent
  })
```

预期：
- `mount==='ceiling' && hFov===130 && vFov===130 && rangePresence===4000 && rangeMotion===8000 && height===2400 && tilt===0`
- `selectValue === 'ziqing-lite:ceiling'`（lastPresetKey 让 rebuild 后选择保持）
- `currentText === '子擎 Lite / 顶装'`

```
mcp__plugin_superpowers-chrome_chrome__use_browser:
  action: screenshot
  payload: ui-presets-dropdown-lite-ceiling.png
```

把截图从 worktree 根目录移到 `output/playwright/`：

```bash
mv ui-presets-dropdown-lite-ceiling.png output/playwright/
```

- [ ] **Step 5.3: 场景 B — 2S / 侧装（高度 200mm）**

```
mcp__plugin_superpowers-chrome_chrome__use_browser:
  action: eval
  payload: var s=document.querySelector('.preset-select');s.value='xiaomi-body-2s:side';s.dispatchEvent(new Event('change'));document.querySelector('.preset-apply').click();JSON.stringify({
    mount: window.__state.mount,
    hFov: window.__state.hFov, vFov: window.__state.vFov,
    rangePresence: window.__state.rangePresence, rangeMotion: window.__state.rangeMotion,
    height: window.__state.height, tilt: window.__state.tilt,
    heightInputMin: (function(){
      var ctls=document.querySelectorAll('#tools .ctl');
      for(var i=0;i<ctls.length;i++){
        var l=ctls[i].querySelector('label');
        if(l && l.textContent.indexOf('安装高度')===0){
          var inp=ctls[i].querySelector('input[type=number]');
          return inp?inp.min:null;
        }
      }
      return null;
    })(),
    currentText: document.querySelector('.preset-current span').textContent
  })
```

预期：
- `mount==='side' && hFov===130 && vFov===130 && rangePresence===3000 && rangeMotion===8000 && height===200 && tilt===0`
- `heightInputMin === '200'`
- `currentText === '小米人体 2S / 侧装'`

```
mcp__plugin_superpowers-chrome_chrome__use_browser:
  action: screenshot
  payload: ui-presets-dropdown-2s-side.png
```

```bash
mv ui-presets-dropdown-2s-side.png output/playwright/
```

- [ ] **Step 5.4: 写 `artifacts/ui-presets-dropdown.json`**

把两个场景的 expected / actual 都落盘：

```bash
cat > artifacts/ui-presets-dropdown.json <<'EOF'
{
  "generatedAt": "2026-05-20T...",
  "method": "superpowers-chrome MCP, file://",
  "viewport": {"width": 1440, "height": 900},
  "baseline": "TESTS 110/110 passed at <HEAD-of-Task-4>",
  "initial": { ... Step 5.1 outputs ... },
  "scenarios": [
    {
      "name": "lite-ceiling",
      "expected": {"mount":"ceiling","hFov":130,"vFov":130,"rangePresence":4000,"rangeMotion":8000,"height":2400,"tilt":0,"selectValue":"ziqing-lite:ceiling","currentText":"子擎 Lite / 顶装"},
      "actual": { ... Step 5.2 outputs ... },
      "screenshot": "output/playwright/ui-presets-dropdown-lite-ceiling.png",
      "result": "pass"
    },
    {
      "name": "2s-side",
      "expected": {"mount":"side","hFov":130,"vFov":130,"rangePresence":3000,"rangeMotion":8000,"height":200,"tilt":0,"heightInputMin":"200","currentText":"小米人体 2S / 侧装"},
      "actual": { ... Step 5.3 outputs ... },
      "screenshot": "output/playwright/ui-presets-dropdown-2s-side.png",
      "result": "pass"
    }
  ],
  "failures": []
}
EOF
```

把 `<HEAD-of-Task-4>` 替换为 Task 4 commit 的实际 SHA（`git rev-parse HEAD` 在 Task 4 后取得）。把 `... outputs ...` 占位替换为 Step 5.1/5.2/5.3 真实 JSON。

- [ ] **Step 5.5: 提交**

```bash
git add artifacts/ui-presets-dropdown.json output/playwright/ui-presets-dropdown-lite-ceiling.png output/playwright/ui-presets-dropdown-2s-side.png
git commit -m "$(cat <<'EOF'
test(ui): browser-verify dropdown presets and 200mm height

Two real-click scenarios via superpowers-chrome MCP on file://. Lite
/ 顶装 verifies state, lastPresetKey memory across rebuild, and
preset-current text. 2S / 侧装 verifies height=200 is preserved and
the install-height input min attribute now reads 200.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Dev-log 追加

**Files:**
- Modify: `docs/dev-log/2026-05-19-progress.md`（行数检查，> 250 则新建文件）

- [ ] **Step 6.1: 决定写入哪个文件**

```bash
wc -l docs/dev-log/2026-05-19-progress.md
```

如果 < 250 行，追加；否则新建 `docs/dev-log/2026-05-20-presets-dropdown.md`。

- [ ] **Step 6.2: 追加进度块**

模板（替换 SHA / 测试数为实际值）：

```markdown
## 2026-05-20 — 传感器预设：下拉 UI + Lite/2S 新增

- 数据：`src/presets.js` 新增 子擎 Lite（吸顶 / 侧装，130°/130° FOV，P 4000 / M 8000）与 小米人体 2S（侧装 130°/130° FOV、P 3000 / M 8000、高度 200mm）。
- 高度范围：side/corner 下限 1000 → 200mm（`hRange` + `applyPreset` lim 字面量同步），ceiling 不动。
- UI：`Interact.presetsGroup()` 由 "5 个按钮行" 改 "下拉 + 使用 + 当前指示"；下拉选项形如 "子擎 Lite / 顶装"，简称映射 顶装/侧装/角装。Interact IIFE 顶部新增 `lastPresetKey` 让 rebuild 后下拉选择不丢。
- CSS：`index.html` 删 7 行 `.preset-row/.preset-name/.preset-variants/.preset-btn*`；新增 7 行 `.preset-row1/.preset-select/.preset-apply/.preset-current`。
- 测试：101 → 110（+9：1 clamp + 4 新 variant apply + 2 dropdown DOM + 2 当前指示）；TESTS: 110/110 passed。
- 浏览器：superpowers-chrome 真实点击两个场景 — Lite 顶装（state 7 字段 + 下拉值保持 + 当前指示文本）；2S 侧装（高度 200mm + num min='200' + 当前指示文本）。artifacts/ui-presets-dropdown.json + 2 张截图。
- SHA：<最终 SHA>
```

- [ ] **Step 6.3: 提交**

```bash
git add docs/dev-log/2026-05-19-progress.md
git commit -m "$(cat <<'EOF'
docs: log presets-dropdown progress (Lite/2S, dropdown UI, 200mm)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## 自检清单

- [x] 规格 §4.1 新增 Lite/2S variants → Task 2
- [x] §4.2 高度下限 1000→200 → Task 1
- [x] §4.3 MOUNT_SHORT 映射 → Task 3 (`presetsGroup` 内)
- [x] §4.4 dropdown + 使用 + 当前指示 → Task 3
- [x] §4.5 CSS 删旧增新 → Task 4
- [x] §5.1 9 条新断言 → Task 1 (1) + Task 2 (4) + Task 3 (4) = 9 条
- [x] §5.2 浏览器视觉验证 → Task 5

类型一致性：

- `lastPresetKey` 字符串 / null —— Task 3.1 声明 + Task 3.2 读写一致。
- `flat[].key` 形式 `'id:mount'` —— Task 3.2 与 Task 5.2/5.3 真实点击都用此格式。
- `MOUNT_SHORT` 键 `'ceiling'|'side'|'corner'` —— 与 State 模块一致。
- `'preset-select'/.preset-apply'/.preset-current'` 三个 className —— Task 3.2 与 Task 4 CSS 与 Task 5 查询一致。

测试基线清点：

- Task 1: +1（clamp side height 200）→ 101 + 1 = 102
- Task 2: +4（lite ceiling / lite side / 2s side / apply 2s preserves height）→ 102 + 4 = 106
- Task 3: +4（option count / first option / current after lite / current dash）→ 106 + 4 = 110

各 Step 内的预期测试数（102 / 106 / 110）与此一致。

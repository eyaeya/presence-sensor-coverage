# 模块化与几何逆向验证实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前单个 `index.html` 拆分为可调试的 HTML + 多个 JS 文件，并为 15000mm x 10000mm 大房间建立数学逆向验证，优先保证波束几何与探测距离计算正确。

**Architecture:** `index.html` 只保留结构、样式和脚本引用；几何、状态、渲染、信息栏、交互、内置测试拆为 `src/*.js`。测试 runner 不再从 HTML 正则提取脚本，而是按浏览器脚本顺序在 VM 中加载模块，保证 Node 自动测试与真实页面使用同一份源码。

**Tech Stack:** 原生 HTML + SVG + ES5 风格 IIFE JS；Node `vm` 测试 runner；真实浏览器/本地 HTTP 服务做视觉与 DOM 级验证；git 分支 `refactor/modular-geometry-validation`。

---

## File Structure

- Modify: `index.html` — 保留页面布局、CSS 和 `<script src="src/...">` 引用。
- Create: `src/geo.js` — 向量、波束坐标系、足迹采样、距离圆盘裁剪、房间裁剪。
- Create: `src/state.js` — 默认状态、安装方式切换重置。
- Create: `src/render.js` — SVG 变换、图层、多边形、虚线边界、传感器绘制。
- Create: `src/info.js` — 安装定位、参数和 hover 距墙信息。
- Create: `src/interact.js` — 控件、拖拽/点击、输入钳制。
- Create: `src/tests.js` — 既有单元断言 + 新增数学逆向断言。
- Create: `src/app.js` — 页面启动和事件绑定。
- Modify: `tools/run-tests.mjs` — 顺序加载 `src/*.js` 并触发 `Tests.run()`。
- Create: `tools/geometry-inverse-cases.mjs` — 生成 15000x10000 的数学逆向用例报告。
- Modify: `docs/superpowers/specs/2026-05-19-presence-sensor-visualizer-design.md` — 将探测距离语义更新为真实 3D 欧氏距离。
- Modify: `docs/dev-log/2026-05-19-progress.md` — 追加本轮重构、验证、修正记录。

---

## Task 1: 模块化拆分，行为不变

- [ ] 将 `index.html` 中当前 `<script>` 按命名空间拆入 `src/geo.js`、`src/state.js`、`src/render.js`、`src/info.js`、`src/interact.js`、`src/tests.js`、`src/app.js`。
- [ ] `index.html` 改为按依赖顺序引用这些文件：Geo → State → Render → Info → Interact → Tests → App。
- [ ] 更新 `tools/run-tests.mjs`，按同一顺序读取并执行 `src/*.js`。
- [ ] 运行 `node tools/run-tests.mjs`，预期仍为当前基线 `TESTS: 69/69 passed`。
- [ ] 提交：`refactor: split visualizer into js modules`。

## Task 2: 大房间数学逆向验证用例

- [ ] 新增 `tools/geometry-inverse-cases.mjs`，默认使用 `15000 x 10000` 房间。
- [ ] 覆盖安装方式：
  - 吸顶：高度 2000/5000、水平角 0/90/359、FOV 90/45 与 160/90、传感器居中与近墙。
  - 侧装：四面墙、安装高度 1000/2000、下倾 0/30、水平角 -90/0/90、FOV 边界、距离 3000/5000 与 5000/8000。
  - 墙角：四角、安装高度 1000/2000、下倾 0/30、FOV 边界、距离边界。
- [ ] 每个用例计算数学先验：
  - 距离虚线上的任一点必须满足 `sqrt(dx^2 + dy^2 + dz^2) ≈ R`。
  - 边界点必须落在目标高度平面对应的波束锥内。
  - 所有渲染用多边形点必须在房间 `[0,W] x [0,D]` 内。
  - 吸顶未裁剪层的半轴应等于 `(H-h) * tan(HFOV/2)` 与 `(H-h) * tan(VFOV/2)`。
  - 对称场景应保持对称，例如侧装左墙 `ψ=0` 时关于 `y=sensor.y` 对称。
- [ ] 将关键用例断言同步加入 `src/tests.js`，让常规测试覆盖逆向数学结果。
- [ ] 运行 `node tools/run-tests.mjs` 和 `node tools/geometry-inverse-cases.mjs`。
- [ ] 提交：`test: add inverse geometry validation cases`。

## Task 3: 根据逆向验证修正几何问题

- [ ] 若 Task 2 报告任何失败，先定位根因，不直接改图形表现。
- [ ] 优先修正 `Geo` 纯函数；只有确认数学正确后才调整 `Render` 的取样/边界绘制。
- [ ] 保持彩色填充为“纯 FOV 几何只裁房间”，虚线为真实探测距离边界。
- [ ] 运行常规测试和逆向验证脚本，失败必须归零。
- [ ] 提交：`fix: correct inverse-validated beam geometry`（若无生产修正，则提交文档/测试更新说明）。

## Task 4: 浏览器可视化验证

- [ ] 启动或复用 `http://127.0.0.1:4173/index.html`。
- [ ] 在真实页面设置 15000x10000 房间，跑典型吸顶/侧装/墙角组合；读取 SVG 点、虚线 polyline 和信息栏。
- [ ] 对用户复现参数再次验证：侧装底墙、`W=7000,D=5000,x=5829.137,h=1500/1800,tilt=20,FOV=160/60,R=3000/5000`。
- [ ] 保存关键截图到 `output/playwright/`，并将结果写入 `artifacts/geometry-inverse-results.json`。
- [ ] 提交：`test: verify geometry visually in browser`。

## Task 5: 文档、审查与合并

- [ ] 更新设计文档中过时的“轴向距离”描述为真实 3D 欧氏距离，并保留历史修正说明。
- [ ] 派出 spec reviewer 和 code-quality reviewer 审查最终 diff。
- [ ] 运行最终验证：`node tools/run-tests.mjs`、`node tools/geometry-inverse-cases.mjs`、浏览器验证脚本。
- [ ] 若分支干净且验证通过，合并回 `main` 并保留提交历史。

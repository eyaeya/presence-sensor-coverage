# 人在传感器安装定位可视化

> 一个零依赖、单文件即可运行的顶视图交互工具，用来实时仿真**人在传感器（毫米波雷达类）** 在不同安装方式、安装位置、下倾角、FOV 与探测距离下，对一个矩形房间的**存在 / 运动覆盖**情况。

适用于家装、智能家居、安防、办公空间等场景下的传感器选型与点位规划。

---

## ✨ 核心特性

- **三种安装方式**：吸顶（ceiling）、侧装（side）、墙角（corner），切换即时刷新默认参数。
- **几何精确**：基于椭圆锥波束模型 + 球形最大探测距离，覆盖区按 3D 欧氏距离裁切，而非简单 2D 投影。
- **多高度洋葱分层**：同时显示 **站立 1200 / 端坐 750 / 仰躺 600 / 落地 0 mm** 四个被检测高度的覆盖切片。
- **双距离边界**：分别绘制**存在检测**（presence）与**运动检测**（motion）的最大探测半径轮廓。
- **传感器预设**：内置 5 个市售雷达预设（子擎 Trio / Celling / Lite、小米人在 Pro、小米人体 2S），一键应用规格，也可在 [src/presets.js](src/presets.js) 自行扩展。
- **鼠标读数**：悬停画布即可读到距各墙面的距离、所在高度的覆盖状态。
- **零构建 / 零依赖**：纯 HTML + 原生 JS + SVG，离线打开 `index.html` 即可用。
- **可自动化测试**：含浏览器内单元测试 + Node 端几何反推回归套件（`tools/run-tests.mjs`）。

---

## 🚀 快速开始

直接双击或用浏览器打开 [index.html](index.html) 即可：

```bash
# 方式一：直接打开（macOS）
open index.html

# 方式二：起一个本地静态服务器（推荐，便于跨域加载与刷新）
python3 -m http.server 8000
# 然后访问 http://localhost:8000/
```

要求浏览器支持 SVG 与 ES5+（任何近 5 年的 Chrome / Safari / Firefox / Edge 都没问题）。

---

## 🎛️ 支持的传感器预设

| 名称 | 安装方式 | 水平 FOV | 垂直 FOV | 存在 / 运动距离 |
|---|---|---|---|---|
| 子擎 Trio | 侧装 | 160° | 90° | 6000 / 7000 mm |
| 子擎 Celling | 吸顶 | 160° | 160° | 4000 / 5500 mm |
| 子擎 Lite | 吸顶 / 侧装 | 130° | 130° | 4000 / 8000 mm |
| 小米人在 Pro | 吸顶 / 侧装 / 墙角 | 110° | 60° | 4000 / 7000 mm |
| 小米人体 2S | 侧装（低位 200 mm） | 130° | 130° | 3000 / 8000 mm |

预设以**「一个传感器 = 多种安装形态变体」** 的结构组织。每个变体可独立定义安装高度、下倾角等参数，未填字段沿用该安装方式的全局默认值。详见 [src/presets.js](src/presets.js)。

---

## 📁 项目结构

```
.
├── index.html              # 主入口：布局、样式、加载脚本
├── src/
│   ├── geo.js              # 纯几何数学（向量 / 椭圆锥 / 距离裁切）
│   ├── presets.js          # 传感器预设清单
│   ├── state.js            # 应用状态 + 安装方式切换的默认值
│   ├── render.js           # SVG 绘制（房间、波束、洋葱层、距离环）
│   ├── info.js             # 右侧信息栏 / hover compass / coverage 网格
│   ├── interact.js         # 底部工具栏控件（滑杆 / 输入 / 预设下拉）
│   ├── tests.js            # 浏览器内的单元测试断言
│   └── app.js              # 启动逻辑：组装模块 + 渲染循环
├── docs/
│   ├── dev-log/            # 开发进度日志
│   └── superpowers/        # 设计 spec 与实施 plan
└── tools/
    ├── run-tests.mjs                       # Node 端运行 src/tests.js
    ├── geometry-blind-7000-cases.mjs       # 盲测：覆盖反推回归
    ├── geometry-implicit-contour-cases.mjs # 隐式轮廓采样
    ├── geometry-inverse-cases.mjs          # 逆向几何用例
    └── double-blind/                       # 五路独立 oracle 交叉验证
```

---

## 🧭 安装方式与几何模型简介

### 坐标系

顶视图：`x ∈ [0, W]` 向右，`y ∈ [0, D]` 向上；`z` 是离地高度。传感器在房间中的位置由安装方式决定。

### 三种安装方式

- **吸顶（ceiling）**：传感器贴顶，朝下；水平角 φ 控制波束在顶视平面上的旋转。
- **侧装（side）**：传感器贴左/右/下/上墙；ψ 控制波束相对墙法线的偏转（0° 垂直墙面、90° 平行墙面）；同时可调下倾角 θ。
- **墙角（corner）**：传感器贴在四角之一，朝室内 45°；下倾角 θ 可调，水平角固定 45°。

### 波束 = 椭圆锥

- 中轴单位向量 `d` 由安装方式 + ψ/φ + 下倾角 θ 决定。
- 水平 FOV 半角 αH、垂直 FOV 半角 αV 分别张在局部正交基 `(u, v)` 上。
- 点 `P` 在锥内 ⇔ `t = (P − S) · d > 0` 且椭圆约束成立。

### 最大探测距离

按**真实 3D 欧氏距离** R 度量。对被检测高度 `h`，其顶视圆环半径 = `sqrt(R² − (S_z − h)²)`；若 `R ≤ |S_z − h|`，则该高度无有效覆盖。

### 洋葱分层

四个被检测高度（**站 1200 / 坐 750 / 躺 600 / 地 0 mm**）固定，从外向内依次叠绘存在覆盖区，并以虚线圈出最大距离边界。

更详细的数学推导见 [docs/superpowers/specs/2026-05-19-presence-sensor-visualizer-design.md](docs/superpowers/specs/2026-05-19-presence-sensor-visualizer-design.md)。

---

## 🧪 测试

项目同时维护**浏览器单测**与**Node 端几何回归测试**：

```bash
# 在 Node 里跑全部 src/tests.js 断言
node tools/run-tests.mjs

# 大规模反推回归（7000 例随机参数）
node tools/geometry-blind-7000-cases.mjs

# 隐式轮廓采样验证
node tools/geometry-implicit-contour-cases.mjs

# 五路 oracle 双盲交叉验证
ls tools/double-blind/
```

浏览器内单测在打开 `index.html` 后会自动运行；可在控制台看到 `PASS:` / `FAIL:` 行与汇总。

---

## 🛠️ 自定义传感器预设

修改 [src/presets.js](src/presets.js)，往 `window.SensorPresets` 数组里追加一条：

```js
{
  id: "your-brand-model",
  name: "你的牌子 X1",
  variants: [
    { mount: "ceiling", label: "吸顶",
      hFov: 120, vFov: 90, rangePresence: 5000, rangeMotion: 7000,
      tilt: 0 },
    { mount: "side",    label: "侧装",
      hFov: 120, vFov: 90, rangePresence: 5000, rangeMotion: 7000,
      height: 1800, tilt: 25 }
  ]
}
```

`variant` 中未列出的字段（如 `height`、`tilt`）会沿用该 mount 的 `MOUNT_DEFAULTS`（见 [src/state.js](src/state.js)）。

---

## 📐 约束与边界（YAGNI）

当前版本**只做**：

- 矩形封闭空间
- 单个传感器
- 吸顶 / 侧装 / 墙角三种安装
- 4 个固定被检测高度的覆盖分层
- 实时重算重绘

**不做**：非矩形空间、多传感器联合覆盖、自定义检测高度档、3D 视图、覆盖率持久化/导出。这些都属于明确放弃的范围，避免特性蔓延。

---

## 🤝 贡献

欢迎提 Issue 反馈实际产品规格、安装姿态、几何模型修正建议。若要直接贡献代码，请：

1. fork 本仓库；
2. 在新分支上完成修改；
3. 跑通 `node tools/run-tests.mjs`；
4. 提 PR，并在描述里说明涉及的安装方式 / 几何场景。

---

## 📝 许可证

License 待定（如需引用本项目代码或预设数据，请先与作者确认）。

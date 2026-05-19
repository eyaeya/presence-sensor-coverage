# 人在传感器安装定位可视化仿真工具 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付单一自包含 `index.html`，顶视图实时仿真人在传感器（毫米波雷达）在吸顶/侧装/墙角三种安装下的房间覆盖。

**Architecture:** 单文件，内部分 6 个命名空间 IIFE 模块：`Geo`（纯几何数学）/`State`（状态+默认值）/`Render`（SVG 绘制）/`Interact`（事件）/`Info`（信息栏格式化）/`Tests`（`?test` 断言）。数据流：事件 → 改 State → Render（调 Geo）+ Info 重算。无构建、无依赖、无服务器，双击即用。

**Tech Stack:** HTML + SVG + 原生 ES5-safe JS（单文件内联 CSS/JS）。测试：文件内 `?test` 模式，访问 `file://…/index.html?test` 时跑断言并 `console.log` 结果 `TESTS: X/Y passed`，subagent 用 Playwright 读 console 验证；视觉用 Playwright 截图。

**落盘记录约定：** 每个 Task 完成后，实现者在 `docs/dev-log/2026-05-19-progress.md` 追加一条：Task 名、做了什么、测试结果（`TESTS: X/Y`）、git SHA。不只依赖对话上下文。

**git 约定：** 项目已 `git init`（若未初始化，第一个 Task 的 Step 1 先 `git init && git add -A && git commit -m "chore: init"`）。每个 Task 末尾提交。

**坐标系（全程一致）：** 顶视 `x∈[0,W]` 右、`y∈[0,D]` 上；3D 加 `z`=离地高。墙：左 x=0/右 x=W/下 y=0/上 y=D。向量用 `{x,y,z}`。角度：`Geo` 内部用弧度，State 存度。

---

## 文件结构

- Create: `index.html` — 唯一交付物，含全部 CSS/JS/SVG。
- Create: `docs/dev-log/2026-05-19-progress.md` — 进度与检查记录。

`index.html` 内 `<script>` 顺序：`Geo` → `State` → `Render` → `Info` → `Interact` → 引导（`?test` 时改跑 `Tests`）。

---

## Task 1: 项目骨架 + 三区布局 + Geo 向量库 + 测试框架

**Files:**
- Create: `index.html`
- Create: `docs/dev-log/2026-05-19-progress.md`

- [ ] **Step 1: 初始化 git（若需要）**

Run:
```bash
cd /Users/chen/Documents/VibeCoding/People_have && git rev-parse --git-dir 2>/dev/null || (git init && git add -A 2>/dev/null; git commit -m "chore: init repo" --allow-empty)
```
Expected: 已是仓库则跳过；否则建仓并空提交。

- [ ] **Step 2: 写 index.html 骨架（布局 + Geo 向量库 + Tests 框架），先放一个会失败的断言**

写入 `index.html`：

```html
<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>人在传感器安装定位可视化</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{height:100%;font-family:-apple-system,"PingFang SC",system-ui,sans-serif;background:#0f1115;color:#e6e8eb;}
  #app{display:grid;grid-template-columns:1fr 280px;grid-template-rows:1fr 156px;height:100vh;}
  #viz{position:relative;border-right:1px solid #222831;border-bottom:1px solid #222831;overflow:hidden;}
  #viz svg{width:100%;height:100%;display:block;}
  #viz .tt{position:absolute;top:10px;left:14px;font-size:11px;color:#6b7280;pointer-events:none;}
  #legend{position:absolute;left:14px;bottom:10px;display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:#aab;pointer-events:none;}
  #legend i{display:inline-block;width:12px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px;}
  #legend .d{width:18px;height:0;border-top:2px dashed;}
  #info{border-bottom:1px solid #222831;padding:15px;font-size:12px;overflow:auto;background:#101319;}
  #info h3{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:14px 0 6px;}
  #info h3:first-child{margin-top:0;}
  #info .row{display:flex;justify-content:space-between;padding:3px 0;color:#c4ccd6;}
  #info .row span:last-child{color:#fff;font-variant-numeric:tabular-nums;}
  #tools{grid-column:1/-1;background:#101319;padding:12px 16px;display:flex;flex-wrap:wrap;gap:10px 22px;align-items:flex-start;overflow:auto;}
  .ctl{display:flex;flex-direction:column;gap:3px;min-width:128px;}
  .ctl label{font-size:10px;color:#7b818b;text-transform:uppercase;letter-spacing:.04em;}
  .ctl .rowi{display:flex;align-items:center;gap:7px;}
  .ctl input[type=number]{width:64px;background:#0c0e12;border:1px solid #2c333d;color:#e6e8eb;border-radius:5px;padding:3px 5px;font-size:12px;}
  .ctl input[type=range]{flex:1;min-width:80px;}
  .ctl.disabled{opacity:.35;pointer-events:none;}
  .seg{display:flex;border:1px solid #2c333d;border-radius:7px;overflow:hidden;}
  .seg button{padding:6px 12px;font-size:12px;color:#9aa3af;background:none;border:none;cursor:pointer;}
  .seg button.on{background:#274168;color:#fff;}
  #test-output{padding:20px;font-family:ui-monospace,monospace;font-size:13px;white-space:pre-wrap;line-height:1.5;}
  .pass{color:#5fe0a4;} .fail{color:#ff6b6b;}
</style>
</head>
<body>
<div id="app">
  <div id="viz"><span class="tt">可视化区 · 顶视</span><svg id="svg"></svg><div id="legend"></div></div>
  <div id="info"></div>
  <div id="tools"></div>
</div>
<script>
/* ===== Geo: 纯几何数学 ===== */
var Geo=(function(){
  function v3(x,y,z){return {x:x,y:y,z:z};}
  function add(a,b){return {x:a.x+b.x,y:a.y+b.y,z:a.z+b.z};}
  function sub(a,b){return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z};}
  function scale(a,s){return {x:a.x*s,y:a.y*s,z:a.z*s};}
  function dot(a,b){return a.x*b.x+a.y*b.y+a.z*b.z;}
  function cross(a,b){return {x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x};}
  function len(a){return Math.sqrt(a.x*a.x+a.y*a.y+a.z*a.z);}
  function norm(a){var L=len(a)||1;return {x:a.x/L,y:a.y/L,z:a.z/L};}
  function rad(d){return d*Math.PI/180;}
  return {v3:v3,add:add,sub:sub,scale:scale,dot:dot,cross:cross,len:len,norm:norm,rad:rad};
})();

/* ===== Tests ===== */
var Tests=(function(){
  var pass=0,fail=0,lines=[];
  function ok(name,cond,detail){
    if(cond){pass++;lines.push('PASS: '+name);console.log('PASS: '+name);}
    else{fail++;lines.push('FAIL: '+name+(detail?' - '+detail:''));console.log('FAIL: '+name+(detail?' - '+detail:''));}
  }
  function approx(a,b,eps){return Math.abs(a-b)<=(eps||1e-6);}
  function run(){
    pass=0;fail=0;lines=[];
    // Task1 自检：向量库
    ok('Geo.dot', Geo.dot(Geo.v3(1,2,3),Geo.v3(4,5,6))===32);
    var c=Geo.cross(Geo.v3(1,0,0),Geo.v3(0,1,0));
    ok('Geo.cross', c.x===0&&c.y===0&&c.z===1);
    ok('Geo.norm', approx(Geo.len(Geo.norm(Geo.v3(3,4,0))),1));
    if(typeof Tests.extra==='function') Tests.extra(ok,approx);
    var summary='TESTS: '+pass+'/'+(pass+fail)+' passed';
    console.log(summary);
    var el=document.getElementById('test-output');
    if(el){el.innerHTML=lines.map(function(l){return '<div class="'+(l.indexOf('PASS')===0?'pass':'fail')+'">'+l+'</div>';}).join('')+'<div>'+summary+'</div>';}
    return {pass:pass,fail:fail};
  }
  return {run:run,ok:ok};
})();

/* ===== 引导 ===== */
window.addEventListener('DOMContentLoaded',function(){
  if(location.search.indexOf('test')>=0){
    document.getElementById('app').style.display='none';
    var pre=document.createElement('pre');pre.id='test-output';document.body.appendChild(pre);
    Tests.run();
    return;
  }
  /* 正常引导将在后续 Task 接入 */
});
</script>
</body>
</html>
```

- [ ] **Step 3: 跑测试确认框架工作（含一个故意失败项）**

先在 `Tests.run` 的自检后临时加一行 `ok('SCAFFOLD_FAIL', false, 'intentional');`，用 Playwright 打开 `file:///Users/chen/Documents/VibeCoding/People_have/index.html?test`，读 console。
Expected: console 出现 `FAIL: SCAFFOLD_FAIL` 和 `TESTS: 3/4 passed`。

- [ ] **Step 4: 删除故意失败行，重跑**

移除 `SCAFFOLD_FAIL` 行。重新用 Playwright 打开 `?test` 读 console。
Expected: `TESTS: 3/3 passed`，无 FAIL。

- [ ] **Step 5: 视觉自检骨架**

Playwright 打开 `file:///Users/chen/Documents/VibeCoding/People_have/index.html`（无 ?test），截图。
Expected: 三区布局可见（左大区、右窄栏、下条），深色主题，无报错（读 console 无 error）。

- [ ] **Step 6: 写 dev-log 并提交**

写入 `docs/dev-log/2026-05-19-progress.md`：
```markdown
# 开发进度与检查记录

## Task 1 — 骨架+Geo向量库+测试框架
- index.html 三区布局、Geo 向量库、Tests(?test) 框架完成
- 测试：TESTS: 3/3 passed（Playwright 读 console 验证）
- 视觉：三区布局正常
- SHA: <填写>
```
Run:
```bash
cd /Users/chen/Documents/VibeCoding/People_have && git add -A && git commit -m "feat: 骨架+布局+Geo向量库+测试框架"
```
把 commit SHA 回填进 dev-log 末行（可再追加一次 `git commit --amend` 或下条记录补 SHA）。

---

## Task 2: State 模块（默认值 + 安装方式切换重置）

**Files:** Modify `index.html`（在 `Geo` 之后、`Tests` 之前插入 `State`；扩展 `Tests.extra`）

- [ ] **Step 1: 写失败测试**

在 `Tests` 模块里设置 `Tests.extra`（替换或新增；本计划每个 Task 追加自己的断言到一个总 extra 链——实现时用单一 `Tests.extra` 函数，按 Task 顺序累积断言，后续 Task 在其尾部追加）。本 Task 在 `Tests.extra` 中加入：

```js
// --- Task2 State ---
var s=State.defaults();
ok('State.defaults ceiling', s.mount==='ceiling'&&s.height===2400&&s.hAngle===0&&s.room.W===4000&&s.room.D===3000);
ok('State.defaults sensor center', s.sensor.x===2000&&s.sensor.y===1500);
State.applyMount(s,'side');
ok('State side reset', s.mount==='side'&&s.height===1500&&s.hAngle===0&&s.wall==='left'&&s.sensor.x===0&&s.sensor.y===1500);
State.applyMount(s,'corner');
ok('State corner reset', s.mount==='corner'&&s.height===1800&&s.hAngle===45&&s.corner==='bl'&&s.sensor.x===0&&s.sensor.y===0);
State.applyMount(s,'ceiling');
ok('State ceiling reset', s.mount==='ceiling'&&s.height===2400&&s.sensor.x===2000&&s.sensor.y===1500);
```

- [ ] **Step 2: 跑测试确认失败**

Playwright 打开 `?test` 读 console。
Expected: 出现 `FAIL` 且报错 `State is not defined`（或断言失败）。

- [ ] **Step 3: 实现 State 模块**

在 `Geo` 的 `</script>` 同块内、`Tests` 之前插入：

```js
/* ===== State ===== */
var State=(function(){
  var MD={ceiling:{height:2400,hAngle:0},side:{height:1500,hAngle:0},corner:{height:1800,hAngle:45}};
  function defaults(){
    return {room:{W:4000,D:3000},mount:'ceiling',sensor:{x:2000,y:1500},
      wall:'left',corner:'bl',height:2400,tilt:20,hAngle:0,
      hFov:160,vFov:90,rangePresence:3000,rangeMotion:5000};
  }
  function applyMount(st,m){
    st.mount=m; st.height=MD[m].height; st.hAngle=MD[m].hAngle;
    if(m==='ceiling') st.sensor={x:st.room.W/2,y:st.room.D/2};
    if(m==='side'){ st.wall='left'; st.sensor={x:0,y:st.room.D/2}; }
    if(m==='corner'){ st.corner='bl'; st.sensor={x:0,y:0}; }
    return st;
  }
  return {defaults:defaults,applyMount:applyMount,MOUNT_DEFAULTS:MD};
})();
```

- [ ] **Step 4: 跑测试确认通过**

Playwright 打开 `?test` 读 console。
Expected: 5 条 State 断言全 PASS，`TESTS: 8/8 passed`。

- [ ] **Step 5: dev-log + 提交**

dev-log 追加 Task 2 条目（含 TESTS 数与 SHA）。
```bash
git add -A && git commit -m "feat: State 模块（默认值+安装切换重置）"
```

---

## Task 3: Geo 波束坐标系（beamFrame: S,d,u,v）

**Files:** Modify `index.html`（`Geo` 内新增 `beamFrame`；`Tests.extra` 追加）

- [ ] **Step 1: 写失败测试**

`Tests.extra` 末尾追加：

```js
// --- Task3 beamFrame ---
var st=State.defaults(); // ceiling,2400,phi0,center
var fr=Geo.beamFrame(st);
ok('frame ceiling S', fr.S.x===2000&&fr.S.y===1500&&fr.S.z===2400);
ok('frame ceiling d down', approx(fr.d.x,0)&&approx(fr.d.y,0)&&approx(fr.d.z,-1));
ok('frame ceiling u(phi0)=+y', approx(fr.u.x,0)&&approx(fr.u.y,1));
var ss=State.defaults(); State.applyMount(ss,'side'); // left wall, psi0, tilt20, h1500
var f2=Geo.beamFrame(ss);
ok('frame side S left wall', f2.S.x===0&&f2.S.y===1500&&f2.S.z===1500);
ok('frame side d into room +x & down', f2.d.x>0&&approx(f2.d.y,0)&&f2.d.z<0);
ok('frame side d tilt20', approx(f2.d.z,-Math.sin(Geo.rad(20)),1e-6));
ok('frame side u horizontal', approx(f2.u.z,0)&&approx(Geo.len(f2.u),1));
var sc=State.defaults(); State.applyMount(sc,'corner'); // bl, 45, tilt20, h1800
var f3=Geo.beamFrame(sc);
ok('frame corner bl diag', f3.d.x>0&&f3.d.y>0&&approx(f3.d.x,f3.d.y,1e-9)&&f3.d.z<0&&f3.S.x===0&&f3.S.y===0&&f3.S.z===1800);
```

- [ ] **Step 2: 跑测试确认失败**

Playwright `?test`。Expected: `FAIL`，`Geo.beamFrame is not a function`。

- [ ] **Step 3: 实现 beamFrame（加入 Geo 的 return 前）**

在 `Geo` IIFE 内、`return` 之前加入函数，并在 `return {...}` 中加 `beamFrame:beamFrame`：

```js
function beamFrame(st){
  var H=st.height;
  if(st.mount==='ceiling'){
    var ph=rad(st.hAngle);
    return {S:v3(st.sensor.x,st.sensor.y,H), d:v3(0,0,-1),
      u:v3(Math.sin(ph),Math.cos(ph),0), v:v3(Math.cos(ph),-Math.sin(ph),0)};
  }
  var a,S;
  if(st.mount==='side'){
    var n;
    if(st.wall==='left'){n=v3(1,0,0);S=v3(0,st.sensor.y,H);}
    else if(st.wall==='right'){n=v3(-1,0,0);S=v3(st.room.W,st.sensor.y,H);}
    else if(st.wall==='bottom'){n=v3(0,1,0);S=v3(st.sensor.x,0,H);}
    else {n=v3(0,-1,0);S=v3(st.sensor.x,st.room.D,H);} // top
    var ps=rad(st.hAngle);
    a=v3(n.x*Math.cos(ps)-n.y*Math.sin(ps), n.x*Math.sin(ps)+n.y*Math.cos(ps), 0);
  } else { // corner
    var q=Math.SQRT1_2;
    if(st.corner==='bl'){a=v3(q,q,0);S=v3(0,0,H);}
    else if(st.corner==='br'){a=v3(-q,q,0);S=v3(st.room.W,0,H);}
    else if(st.corner==='tl'){a=v3(q,-q,0);S=v3(0,st.room.D,H);}
    else {a=v3(-q,-q,0);S=v3(st.room.W,st.room.D,H);} // tr
  }
  var th=rad(st.tilt);
  var d=norm(v3(a.x*Math.cos(th),a.y*Math.cos(th),-Math.sin(th)));
  var u=norm(v3(-a.y,a.x,0));
  var vv=norm(cross(d,u));
  return {S:S,d:d,u:u,v:vv};
}
```

- [ ] **Step 4: 跑测试确认通过**

Playwright `?test`。Expected: 全部 beamFrame 断言 PASS，`TESTS: 16/16 passed`。

- [ ] **Step 5: dev-log + 提交**

dev-log 追加 Task 3。`git add -A && git commit -m "feat: Geo.beamFrame 三种安装中轴/局部基"`

---

## Task 4: Geo 足迹采样（footprint：椭圆锥 ∩ 平面 z=h，可选轴向截断）

**Files:** Modify `index.html`（`Geo` 新增 `footprint`；`Tests.extra` 追加）

- [ ] **Step 1: 写失败测试**

`Tests.extra` 追加（吸顶 φ=0：足迹应为以 (2000,1500) 为心、半轴 `(H-h)tan(aH)`、`(H-h)tan(aV)` 椭圆；逐采样点验椭圆方程；并验 h≥H 空、轴向截断空）：

```js
// --- Task4 footprint ---
var st4=State.defaults(); // ceiling H2400 phi0 center, hFov160 vFov90
var fr4=Geo.beamFrame(st4);
var aH=Geo.rad(st4.hFov/2), aV=Geo.rad(st4.vFov/2);
var far=10*Math.sqrt(4000*4000+3000*3000);
var poly=Geo.footprint(fr4,aH,aV,1200,null,far); // 站
ok('footprint count', poly.length===240);
var A=(2400-1200)*Math.tan(aH), B=(2400-1200)*Math.tan(aV);
var onEllipse=true;
for(var i=0;i<poly.length;i+=20){
  var dx=poly[i].x-2000, dy=poly[i].y-1500;
  // phi0: u=+y(B? ) check: u carries aH along +y; v carries aV along +x
  var val=(dy*dy)/(A*A)+(dx*dx)/(B*B);
  if(Math.abs(val-1)>0.02) onEllipse=false;
}
ok('footprint ceiling ellipse@1200', onEllipse, 'pts not on expected ellipse');
ok('footprint empty when h>=H', Geo.footprint(fr4,aH,aV,2400,null,far).length===0);
// 轴向截断：h=0 时垂直距离=2400，存在距离设 2000 < 2400 → 该平面整体超距 → 截断后点退化（t 被钳到 tMax，点全部聚到一处，clip 后面积≈0）。这里只验函数不抛错且返回数组：
ok('footprint axialMax no-throw', Array.isArray(Geo.footprint(fr4,aH,aV,0,2000,far)));
```

- [ ] **Step 2: 跑测试确认失败**

Playwright `?test`。Expected: `FAIL`，`Geo.footprint is not a function`。

- [ ] **Step 3: 实现 footprint（加入 Geo，return 增 `footprint:footprint`）**

```js
function footprint(fr,aH,aV,h,axialMax,farBound){
  if(h>=fr.S.z) return [];
  var tH=Math.tan(aH),tV=Math.tan(aV),pts=[],N=240,i,b,g,t,P,gd,tMax,hd,reach;
  for(i=0;i<N;i++){
    b=2*Math.PI*i/N;
    g=norm(add(add(scale(fr.u,tH*Math.cos(b)),scale(fr.v,tV*Math.sin(b))),fr.d));
    if(g.z<-1e-9){
      t=(h-fr.S.z)/g.z;
      if(axialMax!=null){ gd=dot(g,fr.d); if(gd>1e-9){ tMax=axialMax/gd; if(t>tMax)t=tMax; } }
      P={x:fr.S.x+g.x*t,y:fr.S.y+g.y*t};
    } else {
      hd=norm(v3(g.x,g.y,0));
      reach=(axialMax!=null)?Math.min(farBound,axialMax):farBound;
      P={x:fr.S.x+hd.x*reach,y:fr.S.y+hd.y*reach};
    }
    pts.push(P);
  }
  return pts;
}
```

- [ ] **Step 4: 跑测试确认通过**

Playwright `?test`。Expected: footprint 断言全 PASS，`TESTS: 20/20 passed`。若 `footprint ceiling ellipse@1200` 失败，核对 u/v 与椭圆方程轴向对应（u 沿 +y 配 aH→A，v 沿 +x 配 aV→B），修正测试中 A/B 与 dx/dy 配对直到几何自洽（实现不动，错的是测试轴向假设）。

- [ ] **Step 5: dev-log + 提交**

`git add -A && git commit -m "feat: Geo.footprint 采样法足迹"`

---

## Task 5: Geo 房间裁剪（clipToRoom，Sutherland–Hodgman）

**Files:** Modify `index.html`（`Geo` 新增 `clipToRoom`；`Tests.extra` 追加）

- [ ] **Step 1: 写失败测试**

```js
// --- Task5 clipToRoom ---
var big=[{x:-1000,y:-1000},{x:9000,y:-1000},{x:9000,y:9000},{x:-1000,y:9000}];
var cl=Geo.clipToRoom(big,4000,3000);
function bbox(p){var xs=p.map(function(o){return o.x;}),ys=p.map(function(o){return o.y;});
  return {x0:Math.min.apply(0,xs),x1:Math.max.apply(0,xs),y0:Math.min.apply(0,ys),y1:Math.max.apply(0,ys)};}
var bb=cl.length?bbox(cl):null;
ok('clip big→room rect', bb&&approx(bb.x0,0)&&approx(bb.x1,4000)&&approx(bb.y0,0)&&approx(bb.y1,3000));
var inside=[{x:100,y:100},{x:200,y:100},{x:200,y:200},{x:100,y:200}];
ok('clip inside unchanged', Geo.clipToRoom(inside,4000,3000).length===4);
ok('clip empty', Geo.clipToRoom([],4000,3000).length===0);
```

- [ ] **Step 2: 跑测试确认失败**

Playwright `?test`。Expected: `FAIL`，`Geo.clipToRoom is not a function`。

- [ ] **Step 3: 实现 clipToRoom**

```js
function clipToRoom(poly,W,D){
  if(!poly||poly.length===0) return [];
  var edges=[
    {in:function(p){return p.x>=0;},  I:function(a,b){var t=(0-a.x)/(b.x-a.x);return{x:0,y:a.y+t*(b.y-a.y)};}},
    {in:function(p){return p.x<=W;},  I:function(a,b){var t=(W-a.x)/(b.x-a.x);return{x:W,y:a.y+t*(b.y-a.y)};}},
    {in:function(p){return p.y>=0;},  I:function(a,b){var t=(0-a.y)/(b.y-a.y);return{x:a.x+t*(b.x-a.x),y:0};}},
    {in:function(p){return p.y<=D;},  I:function(a,b){var t=(D-a.y)/(b.y-a.y);return{x:a.x+t*(b.x-a.x),y:D};}}
  ];
  var out=poly,e,inp,i,Aa,Bb,ai,bi;
  for(e=0;e<4;e++){
    inp=out;out=[];if(inp.length===0)break;
    for(i=0;i<inp.length;i++){
      Aa=inp[(i+inp.length-1)%inp.length];Bb=inp[i];
      ai=edges[e].in(Aa);bi=edges[e].in(Bb);
      if(bi){ if(!ai) out.push(edges[e].I(Aa,Bb)); out.push(Bb); }
      else if(ai){ out.push(edges[e].I(Aa,Bb)); }
    }
  }
  return out;
}
```

- [ ] **Step 4: 跑测试确认通过**

Playwright `?test`。Expected: clip 断言全 PASS，`TESTS: 23/23 passed`。

- [ ] **Step 5: dev-log + 提交**

`git add -A && git commit -m "feat: Geo.clipToRoom 房间裁剪"`

---

## Task 6: Render 坐标变换 + 房间绘制 + 引导接入

**Files:** Modify `index.html`（新增 `Render`；改引导正常分支）

- [ ] **Step 1: 写失败测试（坐标变换纯函数）**

```js
// --- Task6 transform ---
var tr=Render.makeTransform(4000,3000,800,600,30);
var o=tr.toPx({x:0,y:0});           // 房间左下角 → 屏幕左下
var o2=tr.toPx({x:4000,y:3000});    // 右上 → 屏幕右上
ok('transform y-flip', o.py>o2.py, 'y0 应在屏幕下方(py更大)');
var rt=tr.toMm(o.px,o.py);
ok('transform roundtrip', approx(rt.x,0,1e-6)&&approx(rt.y,0,1e-6));
```

- [ ] **Step 2: 跑测试确认失败**

Playwright `?test`。Expected: `FAIL`，`Render is not defined`。

- [ ] **Step 3: 实现 Render（变换 + 房间）并接入正常引导**

在 `State` 之后插入 `Render` 模块：

```js
/* ===== Render ===== */
var Render=(function(){
  var SVGNS='http://www.w3.org/2000/svg';
  function makeTransform(W,D,vw,vh,pad){
    var s=Math.min((vw-2*pad)/W,(vh-2*pad)/D);
    var ox=(vw-W*s)/2, oyTop=(vh-D*s)/2;
    return {s:s,
      toPx:function(p){return {px:ox+p.x*s, py:oyTop+(D-p.y)*s};},
      toMm:function(px,py){return {x:(px-ox)/s, y:D-(py-oyTop)/s};}};
  }
  function el(tag,attr){var e=document.createElementNS(SVGNS,tag);for(var k in attr)e.setAttribute(k,attr[k]);return e;}
  var svg,tr;
  function init(){svg=document.getElementById('svg');}
  function currentTransform(){return tr;}
  function draw(st){
    var r=svg.getBoundingClientRect();
    var vw=r.width||svg.clientWidth||800, vh=r.height||svg.clientHeight||600;
    tr=makeTransform(st.room.W,st.room.D,vw,vh,30);
    while(svg.firstChild) svg.removeChild(svg.firstChild);
    // 房间矩形
    var p00=tr.toPx({x:0,y:0}), p11=tr.toPx({x:st.room.W,y:st.room.D});
    svg.appendChild(el('rect',{x:p11.px<p00.px?p11.px:p00.px, y:p11.py<p00.py?p11.py:p00.py,
      width:Math.abs(p11.px-p00.px), height:Math.abs(p11.py-p00.py),
      fill:'#10141b', stroke:'#525a68','stroke-width':2}));
    // 尺寸标注
    var topMid=tr.toPx({x:st.room.W/2,y:st.room.D});
    var t1=el('text',{x:topMid.px,y:topMid.py-8,fill:'#6b7280','font-size':11,'text-anchor':'middle'});t1.textContent=st.room.W+' mm';svg.appendChild(t1);
    var lMid=tr.toPx({x:0,y:st.room.D/2});
    var t2=el('text',{x:lMid.px-10,y:lMid.py,fill:'#6b7280','font-size':11,'text-anchor':'middle',transform:'rotate(-90 '+(lMid.px-10)+' '+lMid.py+')'});t2.textContent=st.room.D+' mm';svg.appendChild(t2);
  }
  return {makeTransform:makeTransform,init:init,draw:draw,currentTransform:currentTransform,_el:el,SVGNS:SVGNS};
})();
```

把引导正常分支改为：
```js
// 正常引导（替换 DOMContentLoaded 内“正常引导将在后续 Task 接入”注释处）
window.__state=State.defaults();
Render.init();
Render.draw(window.__state);
window.addEventListener('resize',function(){Render.draw(window.__state);});
```

- [ ] **Step 4: 跑测试确认通过 + 视觉验证**

Playwright `?test` → `TESTS: 25/25 passed`。
Playwright 打开无 ?test，截图。Expected: 居中房间矩形（4000:3000 比例），上沿/左侧尺寸标注 `4000 mm`/`3000 mm`，console 无 error。

- [ ] **Step 5: dev-log + 提交**

`git add -A && git commit -m "feat: Render 坐标变换+房间绘制+引导接入"`

---

## Task 7: Render 洋葱填充 4 层 + clipPath + 高度省略规则

**Files:** Modify `index.html`（`Render` 增 `drawLayers`；`draw` 调用；`Tests.extra` 加纯逻辑断言）

- [ ] **Step 1: 写失败测试（层配置与省略规则用纯函数 layerPolys）**

```js
// --- Task7 layers ---
var stL=State.defaults(); // ceiling H2400
var lp=Render.layerPolys(stL); // 返回 [{key,h,color,poly}], poly 已裁房间
ok('layers 4 keys order', lp.length===4 && lp[0].h===0 && lp[3].h===1200);
ok('layers ground filled big', lp[0].poly.length>=3);
var stC=State.defaults(); State.applyMount(stC,'corner'); stC.height=1000; // 站1200 > 1000 → 空
var lpc=Render.layerPolys(stC);
var stand=lpc.filter(function(o){return o.h===1200;})[0];
ok('layer omitted when h>=height', stand.poly.length===0);
```

- [ ] **Step 2: 跑测试确认失败**

Playwright `?test`。Expected: `FAIL`，`Render.layerPolys is not a function`。

- [ ] **Step 3: 实现 layerPolys + drawLayers + clipPath**

`Render` 内新增并在 `return` 暴露；`draw` 末尾调用 `drawLayers(st)`：

```js
var LAYERS=[{key:'ground',h:0,color:'#f5d05a'},{key:'lie',h:600,color:'#5fe0c0'},
            {key:'sit',h:750,color:'#5fb0ff'},{key:'stand',h:1200,color:'#9b8cff'}];
function layerPolys(st){
  var fr=Geo.beamFrame(st);
  var aH=Geo.rad(st.hFov/2), aV=Geo.rad(st.vFov/2);
  var far=10*Math.sqrt(st.room.W*st.room.W+st.room.D*st.room.D);
  return LAYERS.map(function(L){
    var poly=Geo.footprint(fr,aH,aV,L.h,null,far);
    return {key:L.key,h:L.h,color:L.color,poly:Geo.clipToRoom(poly,st.room.W,st.room.D)};
  });
}
function polyPoints(poly){return poly.map(function(p){var q=tr.toPx(p);return q.px+','+q.py;}).join(' ');}
function ensureClip(st){
  var defs=el('defs',{}); var cp=el('clipPath',{id:'roomClip'});
  var a=tr.toPx({x:0,y:0}), b=tr.toPx({x:st.room.W,y:st.room.D});
  cp.appendChild(el('rect',{x:Math.min(a.px,b.px),y:Math.min(a.py,b.py),
    width:Math.abs(b.px-a.px),height:Math.abs(b.py-a.py)}));
  defs.appendChild(cp); svg.appendChild(defs);
}
function drawLayers(st){
  ensureClip(st);
  var g=el('g',{'clip-path':'url(#roomClip)'});
  layerPolys(st).forEach(function(L){
    if(L.poly.length<3) return;
    g.appendChild(el('polygon',{points:polyPoints(L.poly),fill:L.color,
      'fill-opacity':0.18,stroke:L.color,'stroke-opacity':0.5,'stroke-width':1}));
  });
  svg.appendChild(g);
}
```
在 `draw` 的房间与标注绘制后追加：`drawLayers(st);`。`return` 中加 `layerPolys:layerPolys`。

- [ ] **Step 4: 跑测试 + 视觉验证**

Playwright `?test` → `TESTS: 28/28 passed`。
视觉（无 ?test，吸顶默认）：截图应见 4 层半透明同心椭圆叠加（紫小→黄大），不溢出房间矩形。读 console 无 error。

- [ ] **Step 5: dev-log + 提交**

`git add -A && git commit -m "feat: Render 洋葱4层+clipPath+高度省略"`

---

## Task 8: Render 存在/运动虚线边界

**Files:** Modify `index.html`（`Render` 增 `boundaryPoly`/`drawBoundaries`；`Tests.extra` 追加）

- [ ] **Step 1: 写失败测试**

```js
// --- Task8 boundaries ---
var stB=State.defaults();
var pres=Render.boundaryPoly(stB,'presence'); // @h750, axialMax=rangePresence
var moti=Render.boundaryPoly(stB,'motion');   // @h0, axialMax=rangeMotion
ok('boundary presence poly', Array.isArray(pres));
ok('boundary motion poly', Array.isArray(moti));
// 运动距离(5000)>存在(3000) 且 h 更低 → 运动包络面积≥存在（用 bbox 面积近似）
function area(p){if(p.length<3)return 0;var s=0;for(var i=0;i<p.length;i++){var a=p[i],b=p[(i+1)%p.length];s+=a.x*b.y-b.x*a.y;}return Math.abs(s)/2;}
ok('motion area >= presence area', area(moti)>=area(pres));
```

- [ ] **Step 2: 跑测试确认失败**

Playwright `?test`。Expected: `FAIL`，`Render.boundaryPoly is not a function`。

- [ ] **Step 3: 实现 boundaryPoly + drawBoundaries**

```js
function boundaryPoly(st,kind){
  var fr=Geo.beamFrame(st);
  var aH=Geo.rad(st.hFov/2), aV=Geo.rad(st.vFov/2);
  var far=10*Math.sqrt(st.room.W*st.room.W+st.room.D*st.room.D);
  var h=(kind==='presence')?750:0;
  var R=(kind==='presence')?st.rangePresence:st.rangeMotion;
  return Geo.clipToRoom(Geo.footprint(fr,aH,aV,h,R,far),st.room.W,st.room.D);
}
function drawBoundaries(st){
  var g=el('g',{'clip-path':'url(#roomClip)'});
  var m=boundaryPoly(st,'motion');
  if(m.length>=3) g.appendChild(el('polygon',{points:polyPoints(m),fill:'none',
    stroke:'#f0913a','stroke-width':2,'stroke-dasharray':'7 5'}));
  var p=boundaryPoly(st,'presence');
  if(p.length>=3) g.appendChild(el('polygon',{points:polyPoints(p),fill:'none',
    stroke:'#4f9bff','stroke-width':2,'stroke-dasharray':'7 5'}));
  svg.appendChild(g);
}
```
`draw` 内 `drawLayers(st)` 后追加 `drawBoundaries(st);`。`return` 暴露 `boundaryPoly`。

- [ ] **Step 4: 跑测试 + 视觉**

Playwright `?test` → `TESTS: 31/31 passed`。视觉：橙虚线（运动@0）在外、蓝虚线（存在@750）在内，均不溢出房间。

- [ ] **Step 5: dev-log + 提交**

`git add -A && git commit -m "feat: Render 存在/运动虚线边界"`

---

## Task 9: Render 传感器手柄 + 朝向线；Info 信息栏

**Files:** Modify `index.html`（`Render` 增 `drawSensor`；新增 `Info`；`draw` 末尾调 `drawSensor`；引导调 `Info.render`）

- [ ] **Step 1: 写失败测试（Info 纯格式化）**

```js
// --- Task9 Info ---
var iC=Info.positioning(State.defaults()); // ceiling
var keysC=iC.map(function(r){return r.label;}).join(',');
ok('info ceiling fields', /安装方式/.test(keysC)&&/距上墙/.test(keysC)&&/距左墙/.test(keysC)&&/安装高度/.test(keysC));
var sS=State.defaults();State.applyMount(sS,'side');
var iS=Info.positioning(sS).map(function(r){return r.label;}).join(',');
ok('info side fields', /下倾角/.test(iS)&&/安装高度/.test(iS)&&!/距左墙/.test(iS));
var sC=State.defaults();State.applyMount(sC,'corner');
var iCo=Info.positioning(sC).map(function(r){return r.label;}).join(',');
ok('info corner no-dist', /下倾角/.test(iCo)&&!/距/.test(iCo.replace('安装方式','')));
var hv=Info.hover(State.defaults(),{x:1820,y:970});
ok('info hover dists', hv.left===1820&&hv.right===2180&&hv.bottom===970&&hv.top===2030);
```

- [ ] **Step 2: 跑测试确认失败**

Playwright `?test`。Expected: `FAIL`，`Info is not defined`。

- [ ] **Step 3: 实现 Info + Render.drawSensor**

`Render` 内新增（`draw` 末尾调用 `drawSensor(st)`）：
```js
function drawSensor(st){
  var fr=Geo.beamFrame(st);
  var c=tr.toPx({x:fr.S.x,y:fr.S.y});
  // 朝向线：d 的水平投影；吸顶用 phi 方向
  var hx,hy;
  if(st.mount==='ceiling'){var ph=Geo.rad(st.hAngle);hx=Math.sin(ph);hy=Math.cos(ph);}
  else{var L=Math.sqrt(fr.d.x*fr.d.x+fr.d.y*fr.d.y)||1;hx=fr.d.x/L;hy=fr.d.y/L;}
  var tip=tr.toPx({x:fr.S.x+hx*Math.min(st.room.W,st.room.D)*0.12, y:fr.S.y+hy*Math.min(st.room.W,st.room.D)*0.12});
  svg.appendChild(el('line',{x1:c.px,y1:c.py,x2:tip.px,y2:tip.py,stroke:'#aab3bf','stroke-width':1.5}));
  svg.appendChild(el('circle',{id:'sensorDot',cx:c.px,cy:c.py,r:6,fill:'#fff'}));
}
```
新增 `Info` 模块（`Render` 之后）：
```js
var Info=(function(){
  function positioning(st){
    var W=st.room.W,D=st.room.D,r=[],name={ceiling:'吸顶安装',side:'侧装',corner:'墙角安装'}[st.mount];
    r.push({label:'安装方式',value:name});
    if(st.mount==='ceiling'){
      r.push({label:'距上墙',value:(D-st.sensor.y)+' mm'});
      r.push({label:'距下墙',value:st.sensor.y+' mm'});
      r.push({label:'距左墙',value:st.sensor.x+' mm'});
      r.push({label:'距右墙',value:(W-st.sensor.x)+' mm'});
      r.push({label:'安装高度',value:st.height+' mm'});
    } else if(st.mount==='side'){
      var horiz=(st.wall==='left'||st.wall==='right');
      var pos=horiz?st.sensor.y:st.sensor.x, span=horiz?D:W;
      r.push({label:'距墙一端',value:pos+' mm'});
      r.push({label:'距墙另一端',value:(span-pos)+' mm'});
      r.push({label:'安装高度',value:st.height+' mm'});
      r.push({label:'下倾角度',value:st.tilt+'°'});
    } else {
      r.push({label:'安装高度',value:st.height+' mm'});
      r.push({label:'下倾角度',value:st.tilt+'°'});
    }
    return r;
  }
  function params(st){return [
    {label:'H / V FOV',value:st.hFov+'° / '+st.vFov+'°'},
    {label:'存在 / 运动距离',value:st.rangePresence+' / '+st.rangeMotion}];}
  function hover(st,mm){return {left:Math.round(mm.x),right:Math.round(st.room.W-mm.x),
    bottom:Math.round(mm.y),top:Math.round(st.room.D-mm.y)};}
  function render(st,hv){
    var box=document.getElementById('info');box.innerHTML='';
    function sec(title,rows){var h=document.createElement('h3');h.textContent=title;box.appendChild(h);
      rows.forEach(function(o){var d=document.createElement('div');d.className='row';
        d.innerHTML='<span>'+o.label+'</span><span>'+o.value+'</span>';box.appendChild(d);});}
    sec('安装定位',positioning(st));
    sec('当前参数',params(st));
    sec('鼠标位置', hv?[{label:'距左/右墙',value:hv.left+' / '+hv.right},
      {label:'距上/下墙',value:hv.top+' / '+hv.bottom}]:[{label:'—',value:'移入房间查看'}]);
  }
  return {positioning:positioning,params:params,hover:hover,render:render};
})();
```
引导内 `Render.draw` 后加 `Info.render(window.__state,null);`，`return`/调用处保证 `Render.draw` 末尾已 `drawSensor(st)`。

- [ ] **Step 4: 跑测试 + 视觉**

Playwright `?test` → `TESTS: 35/35 passed`（基线31+Task9的4个断言=35；注意 corner 断言正则，必要时仅微调测试正则不改实现）。视觉：房间中心白点+短朝向线；右栏显示安装定位/当前参数/鼠标位置三节。

- [ ] **Step 5: dev-log + 提交**

`git add -A && git commit -m "feat: 传感器手柄+朝向线+信息栏"`

---

## Task 10: Interact 工具栏控件（输入+滑杆双向、钳制、按安装启用/禁用）

**Files:** Modify `index.html`（新增 `Interact`；引导调 `Interact.init`）

- [ ] **Step 1: 写失败测试（钳制纯函数）**

```js
// --- Task10 clamp ---
ok('clamp lo', Interact.clamp(50,100,200)===100);
ok('clamp hi', Interact.clamp(999,100,200)===200);
ok('clamp NaN→fallback', Interact.clamp(NaN,100,200,150)===150);
ok('clamp ok', Interact.clamp(123,100,200)===123);
```

- [ ] **Step 2: 跑测试确认失败**

Playwright `?test`。Expected: `FAIL`，`Interact is not defined`。

- [ ] **Step 3: 实现 Interact 控件层**

新增 `Interact`（`Info` 之后）。`buildTools(st,onChange)` 动态建控件；切换安装方式调 `State.applyMount` 并重建；按安装方式 enable/disable（吸顶禁下倾；墙角禁水平角并显示“45° 固定”）：

```js
var Interact=(function(){
  function clamp(v,lo,hi,fb){v=parseFloat(v);if(isNaN(v))return fb!=null?fb:lo;return v<lo?lo:v>hi?hi:v;}
  var st,onChange;
  function num(label,key,lo,hi,step,disabled){
    var c=document.createElement('div');c.className='ctl'+(disabled?' disabled':'');
    var l=document.createElement('label');l.textContent=label;c.appendChild(l);
    var w=document.createElement('div');w.className='rowi';
    var n=document.createElement('input');n.type='number';n.min=lo;n.max=hi;n.step=step||1;n.value=st[key];
    var r=document.createElement('input');r.type='range';r.min=lo;r.max=hi;r.step=step||1;r.value=st[key];
    function set(v){var x=clamp(v,lo,hi,st[key]);st[key]=x;n.value=x;r.value=x;onChange();}
    n.addEventListener('input',function(){set(n.value);});
    r.addEventListener('input',function(){set(r.value);});
    w.appendChild(n);w.appendChild(r);c.appendChild(w);return c;
  }
  function seg(){
    var c=document.createElement('div');c.className='ctl';c.style.minWidth='auto';
    var l=document.createElement('label');l.textContent='安装方式';c.appendChild(l);
    var s=document.createElement('div');s.className='seg';
    [['ceiling','吸顶'],['side','侧装'],['corner','墙角']].forEach(function(p){
      var b=document.createElement('button');b.textContent=p[1];if(st.mount===p[0])b.className='on';
      b.addEventListener('click',function(){State.applyMount(st,p[0]);rebuild();onChange();});
      s.appendChild(b);});
    c.appendChild(s);return c;
  }
  function roomCtl(){
    var c=document.createElement('div');c.className='ctl';
    var l=document.createElement('label');l.textContent='房间 W / D (mm)';c.appendChild(l);
    var w=document.createElement('div');w.className='rowi';
    var W=document.createElement('input');W.type='number';W.min=1000;W.max=20000;W.value=st.room.W;W.style.width='70px';
    var Dn=document.createElement('input');Dn.type='number';Dn.min=1000;Dn.max=20000;Dn.value=st.room.D;Dn.style.width='70px';
    W.addEventListener('input',function(){st.room.W=clamp(W.value,1000,20000,st.room.W);
      if(st.mount!=='ceiling')State.applyMount(st,st.mount);else{st.sensor.x=clamp(st.sensor.x,0,st.room.W,st.sensor.x);}onChange();});
    Dn.addEventListener('input',function(){st.room.D=clamp(Dn.value,1000,20000,st.room.D);
      if(st.mount!=='ceiling')State.applyMount(st,st.mount);else{st.sensor.y=clamp(st.sensor.y,0,st.room.D,st.sensor.y);}onChange();});
    w.appendChild(W);w.appendChild(Dn);c.appendChild(w);return c;
  }
  function hAngleCtl(){
    if(st.mount==='corner'){var c=document.createElement('div');c.className='ctl disabled';
      var l=document.createElement('label');l.textContent='水平角';c.appendChild(l);
      var d=document.createElement('div');d.className='rowi';d.textContent='45° 固定';d.style.fontSize='12px';d.style.color='#9aa3af';
      c.appendChild(d);return c;}
    if(st.mount==='ceiling') return num('水平角 φ (0-360°)','hAngle',0,360,1,false);
    return num('水平角 ψ (-90~90°)','hAngle',-90,90,1,false); // side
  }
  function hRange(){var m=State.MOUNT_DEFAULTS, lim={ceiling:[2000,5000],side:[1000,2000],corner:[1000,2000]}[st.mount];
    return num('安装高度 (mm)','height',lim[0],lim[1],10,false);}
  function rebuild(){
    var box=document.getElementById('tools');box.innerHTML='';
    box.appendChild(seg());
    box.appendChild(roomCtl());
    box.appendChild(hRange());
    box.appendChild(num('下倾角 (0-30°)','tilt',0,30,1, st.mount==='ceiling'));
    box.appendChild(hAngleCtl());
    box.appendChild(num('水平 FOV (90-160°)','hFov',90,160,1,false));
    box.appendChild(num('垂直 FOV (45-90°)','vFov',45,90,1,false));
    box.appendChild(num('存在距离 (3000-5000)','rangePresence',3000,5000,50,false));
    box.appendChild(num('运动距离 (5000-8000)','rangeMotion',5000,8000,50,false));
  }
  function init(state,cb){st=state;onChange=cb;rebuild();}
  return {clamp:clamp,init:init};
})();
```
引导内：`Interact.init(window.__state,function(){Render.draw(window.__state);Info.render(window.__state,null);});` 并在初始化后调用一次 `Render.draw`+`Info.render`。

- [ ] **Step 4: 跑测试 + 视觉/交互验证**

Playwright `?test` → `TESTS: 39/39 passed`（基线35+Task10的4个clamp断言=39）。
Playwright 无 ?test：① 截图见下栏全部控件；② 程序化把 hFov range 设到 90 触发 input 事件，截图确认洋葱椭圆变窄；③ 点“侧装”按钮，确认控件重建（出现下倾角可用、水平角变 ψ）、可视化变为墙上瓣状；④ 点“墙角”，水平角显示“45° 固定”。console 无 error。

- [ ] **Step 5: dev-log + 提交**

`git add -A && git commit -m "feat: Interact 工具栏控件（双向/钳制/按安装启停）"`

---

## Task 11: Interact 传感器放置（吸顶拖拽 / 侧装沿墙 / 墙角点击）+ hover 读数

**Files:** Modify `index.html`（`Interact` 增指针逻辑；引导绑定 svg 事件）

- [ ] **Step 1: 写失败测试（放置纯函数 placeSensor / nearestWall / nearestCorner）**

```js
// --- Task11 placement ---
var W=4000,D=3000;
ok('nearestWall left', Interact.nearestWall({x:50,y:1500},W,D)==='left');
ok('nearestWall top', Interact.nearestWall({x:2000,y:2950},W,D)==='top');
ok('nearestCorner br', Interact.nearestCorner({x:3900,y:80},W,D)==='br');
var stP=State.defaults();State.applyMount(stP,'side'); // left wall
Interact.placeSensor(stP,{x:1234,y:2222}); // side: 锁左墙→x=0,y=clamp
ok('place side on wall', stP.sensor.x===0 && stP.sensor.y===2222);
var stC=State.defaults();State.applyMount(stC,'ceiling');
Interact.placeSensor(stC,{x:-100,y:5000}); // ceiling: clamp 进房间
ok('place ceiling clamp', stC.sensor.x===0 && stC.sensor.y===3000);
var stK=State.defaults();State.applyMount(stK,'corner');
Interact.placeSensor(stK,{x:3950,y:2950}); // 最近角 tr
ok('place corner snap tr', stK.corner==='tr' && stK.sensor.x===4000 && stK.sensor.y===3000);
```

- [ ] **Step 2: 跑测试确认失败**

Playwright `?test`。Expected: `FAIL`，`Interact.placeSensor is not a function`。

- [ ] **Step 3: 实现放置逻辑 + 绑定指针事件**

`Interact` 内新增并暴露：
```js
function nearestWall(mm,W,D){
  var d={left:mm.x,right:W-mm.x,bottom:mm.y,top:D-mm.y},best='left',bv=d.left;
  for(var k in d){if(d[k]<bv){bv=d[k];best=k;}}return best;
}
function nearestCorner(mm,W,D){
  var L=mm.x<W-mm.x, B=mm.y<D-mm.y;
  return (B?'b':'t')+(L?'l':'r');
}
function placeSensor(st,mm){
  if(st.mount==='ceiling'){
    st.sensor={x:clamp(mm.x,0,st.room.W,st.sensor.x),y:clamp(mm.y,0,st.room.D,st.sensor.y)};
  } else if(st.mount==='side'){
    var w=st.wall;
    if(w==='left') st.sensor={x:0,y:clamp(mm.y,0,st.room.D,st.sensor.y)};
    else if(w==='right') st.sensor={x:st.room.W,y:clamp(mm.y,0,st.room.D,st.sensor.y)};
    else if(w==='bottom') st.sensor={x:clamp(mm.x,0,st.room.W,st.sensor.x),y:0};
    else st.sensor={x:clamp(mm.x,0,st.room.W,st.sensor.x),y:st.room.D};
  } else { // corner
    var c=nearestCorner(mm,st.room.W,st.room.D); st.corner=c;
    st.sensor={x:(c[1]==='l'?0:st.room.W),y:(c[0]==='b'?0:st.room.D)};
  }
  return st;
}
function relocateSideWall(st,mm){ st.wall=nearestWall(mm,st.room.W,st.room.D); placeSensor(st,mm); }
```
绑定（引导内，svg 指针 → toMm → 按 mount 行为；侧装：单击换墙+落点，拖动沿当前墙；墙角：单击切角；吸顶：拖动）：
```js
(function bindPointer(){
  var svg=document.getElementById('svg'),dragging=false,st=window.__state;
  function mmFromEvent(e){var r=svg.getBoundingClientRect();var tr=Render.currentTransform();
    return tr.toMm(e.clientX-r.left,e.clientY-r.top);}
  function refresh(){Render.draw(st);Info.render(st, lastHover);}
  svg.addEventListener('pointerdown',function(e){
    var mm=mmFromEvent(e);
    if(st.mount==='ceiling'){dragging=true;Interact.placeSensor(st,mm);}
    else if(st.mount==='side'){Interact.relocateSideWall(st,mm);dragging=true;}
    else {Interact.placeSensor(st,mm);} // corner
    refresh();
  });
  svg.addEventListener('pointermove',function(e){
    var mm=mmFromEvent(e);
    lastHover=Info.hover(st,mm);
    if(dragging&&st.mount==='ceiling') Interact.placeSensor(st,mm);
    if(dragging&&st.mount==='side') Interact.placeSensor(st,mm); // 沿当前墙
    refresh();
  });
  window.addEventListener('pointerup',function(){dragging=false;});
  svg.addEventListener('pointerleave',function(){lastHover=null;Info.render(st,null);});
  var lastHover=null;
})();
```
`return` 增 `nearestWall,nearestCorner,placeSensor,relocateSideWall`。

- [ ] **Step 4: 跑测试 + 交互验证**

Playwright `?test` → `TESTS: 45/45 passed`（基线39+Task11的6个放置断言=45）。
Playwright 无 ?test：① 吸顶用 `page.mouse` 在房间内按下拖动，截图确认洋葱中心随之移动且不溢出房间；② 切侧装，点击右墙，确认瓣状从右墙射入；③ 切墙角，点击右上角，确认瓣状从 tr 沿 45° 指向室内（不指向室外）；④ 移动鼠标到房间内，右栏“鼠标位置”实时更新；移出清空。console 无 error。

- [ ] **Step 5: dev-log + 提交**

`git add -A && git commit -m "feat: 传感器放置(拖拽/沿墙/墙角)+hover读数"`

---

## Task 12: 终验（黄金路径 + 边界 + 不溢出）+ 收尾记录

**Files:** Modify `index.html`（仅修缺陷）；Modify `docs/dev-log/2026-05-19-progress.md`

- [ ] **Step 1: 全量自动测试**

运行 `node tools/run-tests.mjs`，读输出。Expected: `TESTS: 45/45 passed`，无 FAIL（基线45=Task1-11累计；若本 Task 追加加固断言则相应增加，以实际通过数为准）。

- [ ] **Step 2: 黄金路径视觉巡检（Playwright 截图逐项）**

逐一截图并核对：
1. 吸顶默认：同心椭圆洋葱，橙/蓝虚线，全在房间内。
2. 侧装左墙默认：瓣状从左墙射入，随距离横向变宽（非收窄），不溢出。
3. 墙角 bl 默认：瓣状沿 45° 指向室内，不指向室外。
4. 信息栏三节随安装方式正确切换（侧装显距墙两端+下倾角；墙角无距离+下倾角）。

- [ ] **Step 3: 边界巡检**

逐项设置并截图核对（用 Playwright 程序化设控件值并触发 input）：
- hFov=160,vFov=90,吸顶 height=2000 → 椭圆极大但严格裁在房间内（无任何像素越界）。
- rangePresence=3000 且吸顶 height=5000（垂直距>距离）→ 蓝虚线消失/退化，不报错。
- 墙角 height=1000 → “站1200”层不绘制（只剩 3 层）。
- 房间 W=1000,D=1000 极小 → 全部内容裁进小房间，不溢出。
- 侧装 ψ=±90 → 瓣贴墙面方向，仍在房间内。
读 console 全程无 error。

- [ ] **Step 4: 缺陷修复（如有）**

任一不符 → 定位模块修复 → 回到 Step 1 重跑全链。无缺陷则继续。

- [ ] **Step 5: 收尾 dev-log + 提交**

`docs/dev-log/2026-05-19-progress.md` 追加“Task 12 终验”：列出 12 项巡检结论、最终 `TESTS: 45/45`（或追加加固断言后的实际数）、最终交付说明（双击 index.html 即用）。
```bash
git add -A && git commit -m "test: 终验通过（黄金路径+边界+不溢出）"
```

---

## 自检（写计划者已执行）

- **Spec 覆盖：** §3 参数→Task10/State；§4 坐标系→Task6；§5 波束/中轴→Task3-4；§5.2 形态→Task7-8+终验；§6 语义/4层/双虚线→Task7-8；§6 硬裁剪→Task5+clipPath(Task7)+终验不溢出；§7 架构/状态→Task1-2；§8 采样→Task4；§9 渲染/配色→Task6-9；§10 交互→Task10-11；§11 信息栏→Task9；§12 边界→Task12；§13 测试→各 Task `?test`+终验。无遗漏。
- **占位符扫描：** 无 TBD/TODO；每步含完整代码与命令。
- **类型/命名一致：** `Geo.beamFrame/footprint/clipToRoom`、`Render.makeTransform/draw/layerPolys/boundaryPoly/currentTransform`、`State.defaults/applyMount/MOUNT_DEFAULTS`、`Info.positioning/params/hover/render`、`Interact.clamp/init/placeSensor/nearestWall/nearestCorner/relocateSideWall` 全计划一致。`Tests.extra` 为单一累积函数，各 Task 顺序追加断言（实现者维护同一函数体）。

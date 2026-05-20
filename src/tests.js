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

Tests.extra=function(ok,approx){
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
  // --- Task4 footprint ---
  var st4=State.defaults(); // ceiling H2400 phi0 center, hFov160 vFov90
  var fr4=Geo.beamFrame(st4);
  var aH=Geo.rad(st4.hFov/2), aV=Geo.rad(st4.vFov/2);
  var far=10*Math.sqrt(4000*4000+3000*3000);
  var poly=Geo.footprint(fr4,aH,aV,1200,null,far); // 站
  ok('footprint count', poly.length>=240);
  var A=(2400-1200)*Math.tan(aH), B=(2400-1200)*Math.tan(aV);
  var onEllipse=true;
  for(var i=0;i<poly.length;i+=20){
    var dx=poly[i].x-2000, dy=poly[i].y-1500;
    var val=(dy*dy)/(A*A)+(dx*dx)/(B*B);
    if(Math.abs(val-1)>0.02) onEllipse=false;
  }
  ok('footprint ceiling ellipse@1200', onEllipse, 'pts not on expected ellipse');
  ok('footprint ceiling empty at sensor plane', Geo.footprint(fr4,aH,aV,2400,null,far).length===0);
  ok('footprint rangeMax no-throw', Array.isArray(Geo.footprint(fr4,aH,aV,0,2000,far)));
  // --- Task5 clipToRoom ---
  var big=[{x:-1000,y:-1000},{x:9000,y:-1000},{x:9000,y:9000},{x:-1000,y:9000}];
  var cl=Geo.clipToRoom(big,4000,3000);
  function bbox(p){var xs=p.map(function(o){return o.x;}),ys=p.map(function(o){return o.y;});
    return {x0:Math.min.apply(0,xs),x1:Math.max.apply(0,xs),y0:Math.min.apply(0,ys),y1:Math.max.apply(0,ys)};}
  var bb=cl.length?bbox(cl):null;
  ok('clip big->room rect', bb&&approx(bb.x0,0)&&approx(bb.x1,4000)&&approx(bb.y0,0)&&approx(bb.y1,3000));
  var inside=[{x:100,y:100},{x:200,y:100},{x:200,y:200},{x:100,y:200}];
  ok('clip inside unchanged', Geo.clipToRoom(inside,4000,3000).length===4);
  ok('clip empty', Geo.clipToRoom([],4000,3000).length===0);
  // --- Task6 transform ---
  var tr=Render.makeTransform(4000,3000,800,600,30);
  var o=tr.toPx({x:0,y:0});
  var o2=tr.toPx({x:4000,y:3000});
  ok('transform y-flip', o.py>o2.py, 'y0 应在屏幕下方(py更大)');
  var rt=tr.toMm(o.px,o.py);
  ok('transform roundtrip', approx(rt.x,0,1e-6)&&approx(rt.y,0,1e-6));
  // --- Task7 layers ---
  var stL=State.defaults(); // ceiling H2400
  var lp=Render.layerPolys(stL);
  ok('layers 4 keys order', lp.length===4 && lp[0].h===0 && lp[3].h===1200);
  ok('layers ground filled big', lp[0].poly.length>=3);
  var stC=State.defaults(); State.applyMount(stC,'side'); stC.height=1000; stC.tilt=0; stC.hFov=90; stC.vFov=45;
  var lpc=Render.layerPolys(stC);
  var stand=lpc.filter(function(o){return o.h===1200;})[0];
  ok('side layer can exist above sensor height when FOV reaches it', stand.poly.length>=3);
  // --- Task8 boundaries ---
  var stB=State.defaults();
  var pres=Render.boundaryPoly(stB,'presence'); // @h750, rangeMax=rangePresence
  var moti=Render.boundaryPoly(stB,'motion');   // @h0, rangeMax=rangeMotion
  ok('boundary presence poly', Array.isArray(pres));
  ok('boundary motion poly', Array.isArray(moti));
  function area(p){if(p.length<3)return 0;var s=0;for(var i=0;i<p.length;i++){var a=p[i],b=p[(i+1)%p.length];s+=a.x*b.y-b.x*a.y;}return Math.abs(s)/2;}
  ok('motion area >= presence area', area(moti)>=area(pres));
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
  ok('info hover outside room null', Info.hover(State.defaults(),{x:-1,y:970})===null&&Info.hover(State.defaults(),{x:1820,y:3001})===null);
  // --- Task10 clamp ---
  ok('clamp lo', Interact.clamp(50,100,200)===100);
  ok('clamp hi', Interact.clamp(999,100,200)===200);
  ok('clamp NaN→fallback', Interact.clamp(NaN,100,200,150)===150);
  ok('clamp ok', Interact.clamp(123,100,200)===123);
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
  // --- Task12 hardening ---
  function polyArea(p){if(!p||p.length<3)return 0;var s=0;for(var i=0;i<p.length;i++){var a=p[i],b=p[(i+1)%p.length];s+=a.x*b.y-b.x*a.y;}return Math.abs(s)/2;}
  function gval(rows,lab){for(var i=0;i<rows.length;i++){if(rows[i].label===lab)return rows[i].value;}return null;}
  var cP=State.defaults();cP.hAngle=90;var fcp=Geo.beamFrame(cP);
  ok('frame ceiling phi90', approx(fcp.u.x,1)&&approx(fcp.u.y,0)&&approx(fcp.v.x,0)&&approx(fcp.v.y,-1));
  var sf=State.defaults();State.applyMount(sf,'side');var fsf=Geo.beamFrame(sf);
  ok('frame side orthonormal', approx(Geo.dot(fsf.u,fsf.v),0)&&approx(Geo.dot(fsf.u,fsf.d),0)&&approx(Geo.dot(fsf.v,fsf.d),0)&&approx(Geo.len(fsf.u),1)&&approx(Geo.len(fsf.v),1)&&approx(Geo.len(fsf.d),1));
  var cf=State.defaults();State.applyMount(cf,'corner');var fcf=Geo.beamFrame(cf);
  ok('frame corner orthonormal', approx(Geo.dot(fcf.u,fcf.v),0)&&approx(Geo.dot(fcf.u,fcf.d),0)&&approx(Geo.dot(fcf.v,fcf.d),0)&&approx(Geo.len(fcf.u),1)&&approx(Geo.len(fcf.v),1)&&approx(Geo.len(fcf.d),1));
  var aL=Render.layerPolys(State.defaults());
  ok('layers nested area', polyArea(aL[0].poly)>=polyArea(aL[1].poly)&&polyArea(aL[1].poly)>=polyArea(aL[2].poly)&&polyArea(aL[2].poly)>=polyArea(aL[3].poly));
  var inRoom=true;for(var li=0;li<aL.length;li++){var pp=aL[li].poly;for(var pj=0;pj<pp.length;pj++){if(pp[pj].x<-1e-6||pp[pj].x>4000+1e-6||pp[pj].y<-1e-6||pp[pj].y>3000+1e-6)inRoom=false;}}
  ok('layers within room', inRoom);
  var bS=State.defaults();bS.hFov=90;bS.vFov=45;bS.rangePresence=3000;bS.rangeMotion=8000;
  ok('boundary motion > presence strict', polyArea(Render.boundaryPoly(bS,'motion'))>polyArea(Render.boundaryPoly(bS,'presence')));
  var ceilingTooFar=State.defaults();ceilingTooFar.height=5000;ceilingTooFar.rangePresence=3000;
  ok('boundary ceiling beyond axial range empty', Render.boundaryPoly(ceilingTooFar,'presence').length===0);
  function maxPlanDistance(poly,st){var m=0;for(var i=0;i<poly.length;i++){var dx=poly[i].x-st.sensor.x,dy=poly[i].y-st.sensor.y,d=Math.sqrt(dx*dx+dy*dy);if(d>m)m=d;}return m;}
  function max3dDistance(poly,fr,h){var m=0;for(var i=0;i<poly.length;i++){var dx=poly[i].x-fr.S.x,dy=poly[i].y-fr.S.y,dz=h-fr.S.z,d=Math.sqrt(dx*dx+dy*dy+dz*dz);if(d>m)m=d;}return m;}
  var sideRange=State.defaults();State.applyMount(sideRange,'side');
  sideRange.room={W:7000,D:5000};sideRange.sensor={x:0,y:2500};sideRange.height=1800;sideRange.tilt=20;sideRange.hAngle=0;sideRange.hFov=160;sideRange.vFov=60;sideRange.rangePresence=3000;sideRange.rangeMotion=5000;
  ok('side presence boundary respects 3d range h1800', maxPlanDistance(Render.boundaryPoly(sideRange,'presence'),sideRange)<=Math.sqrt(3000*3000-(1800-750)*(1800-750))+5);
  ok('side motion boundary respects 3d range h1800', maxPlanDistance(Render.boundaryPoly(sideRange,'motion'),sideRange)<=Math.sqrt(5000*5000-1800*1800)+5);
  var sideBottom=State.defaults();State.applyMount(sideBottom,'side');
  sideBottom.room={W:7000,D:5000};sideBottom.wall='bottom';sideBottom.sensor={x:5829.1370308716705,y:0};sideBottom.height=1500;sideBottom.tilt=20;sideBottom.hAngle=0;sideBottom.hFov=160;sideBottom.vFov=60;sideBottom.rangePresence=3000;sideBottom.rangeMotion=5000;
  ok('side bottom presence boundary respects 3d range h1500', maxPlanDistance(Render.boundaryPoly(sideBottom,'presence'),sideBottom)<=Math.sqrt(3000*3000-(1500-750)*(1500-750))+5);
  function curveDistanceStats(segs,st){var min=Infinity,max=0,c=0;for(var si=0;si<segs.length;si++){for(var pi=0;pi<segs[si].length;pi++){var dx=segs[si][pi].x-st.sensor.x,dy=segs[si][pi].y-st.sensor.y,d=Math.sqrt(dx*dx+dy*dy);if(d<min)min=d;if(d>max)max=d;c++;}}return {min:min,max:max,count:c};}
  var sideBottomLimit=Math.sqrt(3000*3000-(1500-750)*(1500-750));
  var sideBottomCurveOk=false;
  if(typeof Render.boundaryCurveSegments==='function'){
    var sideBottomCurve=curveDistanceStats(Render.boundaryCurveSegments(sideBottom,'presence'),sideBottom);
    sideBottomCurveOk=sideBottomCurve.count>8&&sideBottomCurve.min>=sideBottomLimit-5&&sideBottomCurve.max<=sideBottomLimit+5;
  }
  ok('side bottom presence boundary draws range arc only', sideBottomCurveOk);
  var sideRangeCurveOk=false;
  if(typeof Render.boundaryCurveSegments==='function'){
    var sideRangePresence=curveDistanceStats(Render.boundaryCurveSegments(sideRange,'presence'),sideRange);
    var sideRangeMotion=curveDistanceStats(Render.boundaryCurveSegments(sideRange,'motion'),sideRange);
    sideRangeCurveOk=sideRangePresence.count>8&&sideRangeMotion.count>8&&
      sideRangePresence.min>=Math.sqrt(3000*3000-(1800-750)*(1800-750))-5&&
      sideRangePresence.max<=Math.sqrt(3000*3000-(1800-750)*(1800-750))+5&&
      sideRangeMotion.min>=Math.sqrt(5000*5000-1800*1800)-5&&
      sideRangeMotion.max<=Math.sqrt(5000*5000-1800*1800)+5;
  }
  ok('side left boundary arcs match 3d range h1800', sideRangeCurveOk);
  var pcv=Info.positioning(State.defaults());
  ok('info ceiling values', gval(pcv,'距上墙')==='1500 mm'&&gval(pcv,'距左墙')==='2000 mm');
  var psv=State.defaults();State.applyMount(psv,'side');var psr=Info.positioning(psv);
  ok('info side end values', gval(psr,'距墙一端')==='1500 mm'&&gval(psr,'距墙另一端')==='1500 mm');
  ok('info params', gval(Info.params(State.defaults()),'H / V FOV')==='160° / 90°');
  var pcc=State.defaults();State.applyMount(pcc,'corner');
  ok('info corner exact labels', Info.positioning(pcc).map(function(r){return r.label;}).join(',')==='安装方式,安装高度,下倾角度');
  ok('clamp default lo', Interact.clamp(NaN,1,9)===1);
  ok('clamp empty string', Interact.clamp('',1,9)===1);
  ok('nearestWall right', Interact.nearestWall({x:3950,y:1500},4000,3000)==='right');
  ok('nearestWall bottom', Interact.nearestWall({x:2000,y:50},4000,3000)==='bottom');
  var rs=State.defaults();State.applyMount(rs,'side');Interact.relocateSideWall(rs,{x:3990,y:1000});
  ok('relocateSideWall right', rs.wall==='right'&&rs.sensor.x===4000&&rs.sensor.y===1000);
  var i2=State.defaults();State.applyMount(i2,'corner');i2.corner='br';i2.sensor={x:i2.room.W,y:0};i2.room.W=20000;Interact.resnapRoom(i2);
  ok('resnap corner preserved on grow', i2.corner==='br'&&i2.sensor.x===20000&&i2.sensor.y===0);
  var sea=State.defaults();State.applyMount(sea,'side');sea.sensor={x:0,y:500};var sear=Info.positioning(sea);
  function seav(rows,lab){for(var i=0;i<rows.length;i++){if(rows[i].label===lab)return rows[i].value;}return null;}
  ok('info side end values asym', seav(sear,'距墙一端')==='500 mm'&&seav(sear,'距墙另一端')==='2500 mm');
  // --- 2026-05-20 inverse geometry ---
  ok('range radius 3d projection h1800 presence', approx(Geo.rangeProjectionRadius(3000,1800,750),Math.sqrt(3000*3000-1050*1050),1e-9));
  ok('range radius empty when vertical gap exceeds range', Geo.rangeProjectionRadius(3000,5000,750)===null);
  var invSide=State.defaults();State.applyMount(invSide,'side');
  invSide.room={W:15000,D:10000};invSide.sensor={x:0,y:5000};invSide.height=1500;invSide.tilt=20;invSide.hAngle=0;invSide.hFov=160;invSide.vFov=60;
  var invFr=Geo.beamFrame(invSide);
  var invCenter={x:(1500-750)/Math.tan(Geo.rad(20)),y:5000};
  ok('side left centerline inverse formula in beam', Geo.inBeamAtHeight(invFr,Geo.rad(80),Geo.rad(30),invCenter,750));
  var invSegStats=curveDistanceStats(Render.boundaryCurveSegments(invSide,'presence'),invSide);
  var invLimit=Geo.rangeProjectionRadius(3000,1500,750);
  ok('side left 15000x10000 presence arc radius', invSegStats.count>8&&invSegStats.min>=invLimit-5&&invSegStats.max<=invLimit+5);
  var finiteSide=State.defaults();State.applyMount(finiteSide,'side');
  finiteSide.room={W:15000,D:10000};finiteSide.wall='left';finiteSide.sensor={x:0,y:5000};
  finiteSide.height=1500;finiteSide.tilt=20;finiteSide.hAngle=0;finiteSide.hFov=160;finiteSide.vFov=90;finiteSide.rangeMotion=3000;
  var finiteLayers=Render.layerPolys(finiteSide),finiteFr=Geo.beamFrame(finiteSide),finiteOk=true;
  for(var fl=0;fl<finiteLayers.length;fl++){
    if(max3dDistance(finiteLayers[fl].poly,finiteFr,finiteLayers[fl].h)>finiteSide.rangeMotion+5) finiteOk=false;
  }
  ok('layers respect motion 3d range', finiteOk);
  var noLayer=State.defaults();noLayer.height=5000;noLayer.rangeMotion=3000;
  var noLayers=Render.layerPolys(noLayer),allEmpty=true;
  for(var nl=0;nl<noLayers.length;nl++){if(noLayers[nl].poly.length!==0) allEmpty=false;}
  ok('layers empty when motion range below vertical gap', allEmpty);
  var nearRange=State.defaults();State.applyMount(nearRange,'side');
  nearRange.room={W:15000,D:10000};nearRange.wall='left';nearRange.sensor={x:0,y:5000};
  nearRange.height=1500;nearRange.tilt=20;nearRange.hAngle=0;nearRange.hFov=120;nearRange.vFov=60;nearRange.rangeMotion=3000;
  var farRange=JSON.parse(JSON.stringify(nearRange));farRange.rangeMotion=8000;
  ok('layer area grows with motion range', polyArea(Render.layerPolys(farRange)[0].poly)>polyArea(Render.layerPolys(nearRange)[0].poly)*1.5);
  if(typeof Render.renderLegend==='function'){
    Render.renderLegend();Render.renderLegend();
    var leg=document.getElementById('legend');
    ok('legend renders six fixed items once', leg&&leg.children&&leg.children.length===6);
  } else {
    ok('legend renders six fixed items once', false);
  }
  // --- Presets Dropdown · height lower bound ---
  ok('clamp side height 200', Interact.clamp(200,200,2000,1000)===200);
  var oldTools=document.getElementById('tools');
  if(oldTools){
    oldTools.innerHTML='';
    var editState=State.defaults(),changes=0;
    Interact.init(editState,function(){changes++;});
    function desc(root,pred,out){out=out||[];if(!root||!root.children)return out;for(var di=0;di<root.children.length;di++){var ch=root.children[di];if(pred(ch))out.push(ch);desc(ch,pred,out);}return out;}
    function ctlByLabel(root,text){var all=desc(root,function(e){return (e.className||'').indexOf('ctl')>=0;});for(var ci=0;ci<all.length;ci++){var labs=desc(all[ci],function(e){return (e.tagName||'').toLowerCase()==='label';});if(labs.length&&labs[0].textContent.indexOf(text)>=0)return all[ci];}return null;}
    function inputByType(root,type){var all=desc(root,function(e){return (e.tagName||'').toLowerCase()==='input'&&e.type===type;});return all[0]||null;}
    function inputsByType(root,type){return desc(root,function(e){return (e.tagName||'').toLowerCase()==='input'&&e.type===type;});}
    var groups=desc(oldTools,function(e){return e.className==='tool-group-title';}).map(function(e){return e.textContent;}).join(',');
    ok('tool groups render categories', groups==='空间,安装,视场,距离,传感器预设');
    var hCtl=ctlByLabel(oldTools,'水平 FOV'),hNum=hCtl?inputByType(hCtl,'number'):null;
    if(hNum&&typeof hNum.dispatchEvent==='function'){
      hNum.value='';hNum.dispatchEvent({type:'input'});
      ok('number input allows temporary empty value', hNum.value===''&&editState.hFov===160&&changes===0);
      hNum.value='120';hNum.dispatchEvent({type:'input'});
      ok('number input updates valid typed value', hNum.value==='120'&&editState.hFov===120&&changes===1);
    } else {
      ok('number input test harness available', false);
    }
    var roomCtlNode=ctlByLabel(oldTools,'房间 W / D'),roomNums=roomCtlNode?inputsByType(roomCtlNode,'number'):[];
    if(roomNums.length>=2){
      roomNums[0].value='';roomNums[0].dispatchEvent({type:'input'});
      ok('room width input allows temporary empty value', roomNums[0].value===''&&editState.room.W===4000);
      roomNums[0].value='15000';roomNums[0].dispatchEvent({type:'input'});
      ok('room width input updates valid typed value', roomNums[0].value==='15000'&&editState.room.W===15000);
      roomNums[1].value='2';roomNums[1].dispatchEvent({type:'input'});
      ok('room depth partial below min does not clamp while typing', roomNums[1].value==='2'&&editState.room.D===3000);
      roomNums[1].dispatchEvent({type:'blur'});
      ok('room depth blur clamps below min', String(roomNums[1].value)==='1000'&&editState.room.D===1000);
    } else {
      ok('room input test harness available', false);
    }
    Info.render(editState,null);
    var infoBox=document.getElementById('info');
    var hasMini=desc(infoBox,function(e){return e.className&&e.className.indexOf('mini-room')>=0;}).length===1;
    var hasChips=desc(infoBox,function(e){return e.className==='chip';}).length===4;
    var hasHover=desc(infoBox,function(e){return e.className==='hover-compass';}).length===1;
    ok('info graphic blocks render', hasMini&&hasChips&&hasHover);
  }
  // --- UI Review Task1 range extension ---
  ok('Interact.clamp vFov 160 within 45-160', Interact.clamp(160,45,160,90)===160);
  ok('Interact.clamp rangePresence 6000 within 3000-6000', Interact.clamp(6000,3000,6000,3000)===6000);
  (function(){
    var stTmp=State.defaults();
    Interact.init(stTmp,function(){});
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
            return rowi&&rowi.children&&rowi.children[0];
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
  // --- UI Review Task3 Info.coverage ---
  (function(){
    var st=State.defaults();
    var cv=Info.coverage(st, {x:st.room.W/2, y:st.room.D/2});
    ok('coverage center all true', cv.stand===true&&cv.sit===true&&cv.lie===true&&cv.ground===true);
    var cvN=Info.coverage(st, null);
    ok('coverage null all false', cvN.stand===false&&cvN.sit===false&&cvN.lie===false&&cvN.ground===false);
    var cvOut=Info.coverage(st, {x:-100, y:0});
    ok('coverage outside room all false', cvOut.stand===false&&cvOut.sit===false&&cvOut.lie===false&&cvOut.ground===false);
    ok('coverage corner stand actual', Info.coverage(st, {x:0,y:0}).stand===false);
    ok('coverage corner ground actual', Info.coverage(st, {x:0,y:0}).ground===true);
  })();
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
    s=State.defaults();
    Interact.applyPreset(s, variantOf('xiaomi-pro','ceiling'));
    ok('variant matches after apply', Interact.variantMatchesState(s, variantOf('xiaomi-pro','ceiling')));
    s.hFov=111;
    ok('variant no match after tweak', !Interact.variantMatchesState(s, variantOf('xiaomi-pro','ceiling')));
  })();
  (function(){
    function variantOf(id,mount){
      var p=window.SensorPresets.filter(function(x){return x.id===id;})[0];
      return p&&p.variants.filter(function(v){return v.mount===mount;})[0];
    }
    var s;
    var v1=variantOf('ziqing-lite','ceiling');
    s=State.defaults(); if(v1)Interact.applyPreset(s, v1);
    ok('preset lite ceiling',
      v1&&s.mount==='ceiling'&&s.hFov===130&&s.vFov===130&&s.rangePresence===4000&&s.rangeMotion===8000&&s.height===2400&&s.tilt===0);
    var v2=variantOf('ziqing-lite','side');
    s=State.defaults(); if(v2)Interact.applyPreset(s, v2);
    ok('preset lite side',
      v2&&s.mount==='side'&&s.hFov===130&&s.vFov===130&&s.rangePresence===4000&&s.rangeMotion===8000&&s.height===1500&&s.tilt===0);
    var v3=variantOf('xiaomi-body-2s','side');
    s=State.defaults(); if(v3)Interact.applyPreset(s, v3);
    ok('preset 2s side height 200',
      v3&&s.mount==='side'&&s.hFov===130&&s.vFov===130&&s.rangePresence===3000&&s.rangeMotion===8000&&s.height===200&&s.tilt===0);
    var v4=variantOf('xiaomi-body-2s','side');
    s=State.defaults(); if(v4)Interact.applyPreset(s, v4);
    ok('apply 2s preserves height 200', v4&&s.height===200);
  })();
  (function(){
    var stU=State.defaults();
    Interact.init(stU,function(){});
    var toolsBox=document.getElementById('tools');
    var selectEls=[];
    function findByTag(el,tag){var out=[];if(!el||!el.children)return out;for(var i=0;i<el.children.length;i++){if((el.children[i].tagName||'').toLowerCase()===tag.toLowerCase())out.push(el.children[i]);out=out.concat(findByTag(el.children[i],tag));}return out;}
    selectEls=findByTag(toolsBox,'select');
    var sel=selectEls.length>0?selectEls[0]:null;
    var optCount=sel&&sel.children?sel.children.length:0;
    var totalVariants=window.SensorPresets.reduce(function(a,p){return a+p.variants.length;},0);
    ok('dropdown option count matches variants', optCount===totalVariants);
    var firstOpt=sel&&sel.children?sel.children[0]:null;
    ok('dropdown first option', firstOpt&&firstOpt.value==='ziqing-trio:side'&&firstOpt.textContent==='子擎 Trio / 侧装');
    function variantOf(id,mount){
      var p=window.SensorPresets.filter(function(x){return x.id===id;})[0];
      return p&&p.variants.filter(function(v){return v.mount===mount;})[0];
    }
    Interact.applyPreset(stU, variantOf('ziqing-lite','ceiling'));
    function findByClass(el,cls){var out=[];if(!el||!el.children)return out;if((el.className||'').indexOf(cls)>=0)out.push(el);for(var i=0;i<el.children.length;i++)out=out.concat(findByClass(el.children[i],cls));return out;}
    function spanOf(curCont){if(!curCont||!curCont.children)return null;for(var i=0;i<curCont.children.length;i++){if((curCont.children[i].tagName||'').toLowerCase()==='span')return curCont.children[i];}return null;}
    var curCont=findByClass(toolsBox,'preset-current')[0]||null;
    var curSpan=spanOf(curCont);
    ok('preset-current after apply lite ceiling', curSpan&&curSpan.textContent==='子擎 Lite / 顶装');
    stU.hFov=99;
    Interact.init(stU,function(){});
    var curCont2=findByClass(document.getElementById('tools'),'preset-current')[0]||null;
    var curSpan2=spanOf(curCont2);
    ok('preset-current dash when no match', curSpan2&&curSpan2.textContent==='—');
  })();
};

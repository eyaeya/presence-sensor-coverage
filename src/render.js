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
    var p00=tr.toPx({x:0,y:0}), p11=tr.toPx({x:st.room.W,y:st.room.D});
    svg.appendChild(el('rect',{x:p11.px<p00.px?p11.px:p00.px, y:p11.py<p00.py?p11.py:p00.py,
      width:Math.abs(p11.px-p00.px), height:Math.abs(p11.py-p00.py),
      fill:'#10141b', stroke:'#525a68','stroke-width':2}));
    var topMid=tr.toPx({x:st.room.W/2,y:st.room.D});
    var t1=el('text',{x:topMid.px,y:topMid.py-8,fill:'#6b7280','font-size':11,'text-anchor':'middle'});t1.textContent=st.room.W+' mm';svg.appendChild(t1);
    var lMid=tr.toPx({x:0,y:st.room.D/2});
    var t2=el('text',{x:lMid.px-10,y:lMid.py,fill:'#6b7280','font-size':11,'text-anchor':'middle',transform:'rotate(-90 '+(lMid.px-10)+' '+lMid.py+')'});t2.textContent=st.room.D+' mm';svg.appendChild(t2);
    drawLayers(st);
    drawBoundaries(st);
    drawSensor(st);
  }
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
  function boundaryPoly(st,kind){
    var fr=Geo.beamFrame(st);
    var aH=Geo.rad(st.hFov/2), aV=Geo.rad(st.vFov/2);
    var far=10*Math.sqrt(st.room.W*st.room.W+st.room.D*st.room.D);
    var h=(kind==='presence')?750:0;
    var R=(kind==='presence')?st.rangePresence:st.rangeMotion;
    return Geo.clipToRoom(Geo.footprint(fr,aH,aV,h,R,far),st.room.W,st.room.D);
  }
  function inBeamAtHeight(fr,aH,aV,p,h){
    return Geo.inBeamAtHeight(fr,aH,aV,p,h);
  }
  function boundaryCurveSegments(st,kind){
    var fr=Geo.beamFrame(st);
    var aH=Geo.rad(st.hFov/2), aV=Geo.rad(st.vFov/2);
    var h=(kind==='presence')?750:0;
    var R=(kind==='presence')?st.rangePresence:st.rangeMotion;
    var radius=Geo.rangeProjectionRadius(R,fr.S.z,h);
    if(radius==null) return [];
    var N=7200, pts=[],inside=[],i,a,p;
    function pointAtAngle(x){
      return {x:fr.S.x+radius*Math.cos(x),y:fr.S.y+radius*Math.sin(x)};
    }
    function insideAngle(x){
      var q=pointAtAngle(x);
      return q.x>=-1e-6&&q.x<=st.room.W+1e-6&&q.y>=-1e-6&&q.y<=st.room.D+1e-6&&inBeamAtHeight(fr,aH,aV,q,h);
    }
    function transitionAngle(a0,a1,wantInside){
      var lo=a0,hi=a1,mid,k;
      for(k=0;k<28;k++){
        mid=(lo+hi)/2;
        if(insideAngle(mid)===wantInside) hi=mid; else lo=mid;
      }
      return pointAtAngle(hi);
    }
    for(i=0;i<N;i++){
      a=2*Math.PI*i/N;
      p=pointAtAngle(a);
      pts.push(p);
      inside.push(insideAngle(a));
    }
    var firstOut=-1;
    for(i=0;i<N;i++){if(!inside[i]){firstOut=i;break;}}
    if(firstOut<0){pts.push(pts[0]);return [pts];}
    var segs=[],cur=[],idx,prev,angPrev,angCur;
    for(i=1;i<=N;i++){
      idx=(firstOut+i)%N;
      prev=(firstOut+i-1)%N;
      angPrev=2*Math.PI*(firstOut+i-1)/N;
      angCur=2*Math.PI*(firstOut+i)/N;
      if(!inside[prev]&&inside[idx]){
        cur=[transitionAngle(angPrev,angCur,true),pts[idx]];
      } else if(inside[prev]&&inside[idx]){
        cur.push(pts[idx]);
      } else if(inside[prev]&&!inside[idx]){
        cur.push(transitionAngle(angPrev,angCur,false));
        if(cur.length>1)segs.push(cur);
        cur=[];
      }
    }
    if(cur.length>1)segs.push(cur);
    return segs;
  }
  function drawBoundaries(st){
  // NOTE: relies on drawLayers(st) having run earlier in draw() to create <clipPath id="roomClip"> via ensureClip; draw() always calls drawLayers before drawBoundaries.
    var g=el('g',{'clip-path':'url(#roomClip)'});
    boundaryCurveSegments(st,'motion').forEach(function(m){
      if(m.length>=2) g.appendChild(el('polyline',{points:polyPoints(m),fill:'none',
        stroke:'#f0913a','stroke-width':2,'stroke-dasharray':'7 5'}));
    });
    boundaryCurveSegments(st,'presence').forEach(function(p){
      if(p.length>=2) g.appendChild(el('polyline',{points:polyPoints(p),fill:'none',
        stroke:'#4f9bff','stroke-width':2,'stroke-dasharray':'7 5'}));
    });
    svg.appendChild(g);
  }
  function drawSensor(st){
    var fr=Geo.beamFrame(st);
    var c=tr.toPx({x:fr.S.x,y:fr.S.y});
    var hx,hy;
    if(st.mount==='ceiling'){var ph=Geo.rad(st.hAngle);hx=Math.sin(ph);hy=Math.cos(ph);}
    else{var L=Math.sqrt(fr.d.x*fr.d.x+fr.d.y*fr.d.y)||1;hx=fr.d.x/L;hy=fr.d.y/L;}
    var tip=tr.toPx({x:fr.S.x+hx*Math.min(st.room.W,st.room.D)*0.12, y:fr.S.y+hy*Math.min(st.room.W,st.room.D)*0.12});
    svg.appendChild(el('line',{x1:c.px,y1:c.py,x2:tip.px,y2:tip.py,stroke:'#aab3bf','stroke-width':1.5}));
    svg.appendChild(el('circle',{id:'sensorDot',cx:c.px,cy:c.py,r:6,fill:'#fff'}));
  }
  return {makeTransform:makeTransform,init:init,draw:draw,currentTransform:currentTransform,_el:el,SVGNS:SVGNS,layerPolys:layerPolys,boundaryPoly:boundaryPoly,boundaryCurveSegments:boundaryCurveSegments,drawSensor:drawSensor};
})();

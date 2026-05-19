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
  function rangeProjectionRadius(rangeMax,sensorHeight,targetHeight){
    var dz=targetHeight-sensorHeight;
    if(rangeMax<=Math.abs(dz)) return null;
    return Math.sqrt(rangeMax*rangeMax-dz*dz);
  }
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
  function radialIntervals(fr,aH,aV,h,angle,rangeMax,farBound){
    var dz=h-fr.S.z, ex=Math.cos(angle), ey=Math.sin(angle);
    var A=ex*fr.d.x+ey*fr.d.y, T0=dz*fr.d.z;
    var B=ex*fr.u.x+ey*fr.u.y, U0=dz*fr.u.z;
    var C=ex*fr.v.x+ey*fr.v.y, V0=dz*fr.v.z;
    var invH=1/Math.tan(aH), invV=1/Math.tan(aV);
    var qa=B*B*invH*invH+C*C*invV*invV-A*A;
    var qb=2*(B*U0*invH*invH+C*V0*invV*invV-A*T0);
    var qc=U0*U0*invH*invH+V0*V0*invV*invV-T0*T0;
    var maxR=farBound, rr, ints=[], EPS=1e-9;
    if(rangeMax!=null){
      rr=rangeProjectionRadius(rangeMax,fr.S.z,h);
      if(rr==null) return [];
      maxR=Math.min(maxR,rr);
    }
    function addInterval(lo,hi){
      lo=Math.max(lo,0);
      hi=Math.min(hi,maxR);
      if(hi>lo+1e-6) ints.push([lo,hi]);
    }
    if(Math.abs(qa)<EPS){
      if(Math.abs(qb)<EPS){
        if(qc<=EPS) addInterval(0,maxR);
      } else {
        var r0=-qc/qb;
        if(qb>0) addInterval(-Infinity,r0);
        else addInterval(r0,Infinity);
      }
    } else {
      var disc=qb*qb-4*qa*qc;
      if(disc>=-EPS){
        if(disc<0) disc=0;
        var s=Math.sqrt(disc), r1=(-qb-s)/(2*qa), r2=(-qb+s)/(2*qa);
        if(r1>r2){var tmp=r1;r1=r2;r2=tmp;}
        if(qa>0) addInterval(r1,r2);
        else { addInterval(-Infinity,r1); addInterval(r2,Infinity); }
      }
    }
    if(ints.length===0) return [];
    var tInts=[];
    if(Math.abs(A)<EPS){
      if(T0<=1e-9) return [];
      tInts=[[0,maxR]];
    } else {
      var rt=(1e-9-T0)/A;
      if(A>0) tInts=[[Math.max(0,rt),maxR]];
      else tInts=[[0,Math.min(maxR,rt)]];
    }
    var out=[];
    for(var i=0;i<ints.length;i++){
      for(var j=0;j<tInts.length;j++){
        var lo=Math.max(ints[i][0],tInts[j][0]), hi=Math.min(ints[i][1],tInts[j][1]);
        if(hi>lo+1e-6) out.push([lo,hi]);
      }
    }
    return out;
  }
  function footprint(fr,aH,aV,h,rangeMax,farBound){
    var N=1440, samples=[], i, a, ints, insideCount=0, firstOut=-1, firstIn=-1;
    for(i=0;i<N;i++){
      a=2*Math.PI*i/N;
      ints=radialIntervals(fr,aH,aV,h,a,rangeMax,farBound);
      samples.push({a:a, interval:ints.length?ints[0]:null});
      if(ints.length){insideCount++; if(firstIn<0) firstIn=i;}
      else if(firstOut<0) firstOut=i;
    }
    if(insideCount===0) return [];
    function pt(angle,r){return {x:fr.S.x+r*Math.cos(angle),y:fr.S.y+r*Math.sin(angle)};}
    function build(seq,fullCircle){
      var outer=[],inner=[],hasInner=false,j,smp;
      for(j=0;j<seq.length;j++){
        smp=samples[seq[j]];
        outer.push(pt(smp.a,smp.interval[1]));
        if(smp.interval[0]>1e-4) hasInner=true;
      }
      if(hasInner){
        for(j=seq.length-1;j>=0;j--){
          smp=samples[seq[j]];
          inner.push(pt(smp.a,smp.interval[0]));
        }
      }
      if(hasInner) return outer.concat(inner);
      if(!fullCircle) return [{x:fr.S.x,y:fr.S.y}].concat(outer);
      return outer;
    }
    if(firstOut<0){
      return build(samples.map(function(_,idx){return idx;}),true);
    }
    var seq=[], idx, prev;
    for(i=1;i<=N;i++){
      idx=(firstOut+i)%N;
      prev=(firstOut+i-1)%N;
      if(!samples[prev].interval&&samples[idx].interval) seq=[idx];
      else if(samples[prev].interval&&samples[idx].interval) seq.push(idx);
      else if(samples[prev].interval&&!samples[idx].interval) break;
    }
    if(seq.length===0 && firstIn>=0) seq=[firstIn];
    return build(seq,false);
  }
  function clipByRangeDistance(poly,fr,h,rangeMax){
    if(!poly||poly.length===0) return [];
    var radius=rangeProjectionRadius(rangeMax,fr.S.z,h);
    if(radius==null) return [];
    return clipToCircle(poly,fr.S.x,fr.S.y,radius,240);
  }
  function inBeamAtHeight(fr,aH,aV,p,h,eps){
    var r=v3(p.x-fr.S.x,p.y-fr.S.y,h-fr.S.z);
    var t=dot(r,fr.d);
    if(t<=1e-6) return false;
    var du=dot(r,fr.u)/(t*Math.tan(aH));
    var dv=dot(r,fr.v)/(t*Math.tan(aV));
    return du*du+dv*dv<=1+(eps==null?5e-4:eps);
  }
  function clipToCircle(poly,cx,cy,r,N){
    var clip=[],i,a;
    for(i=0;i<N;i++){
      a=2*Math.PI*i/N;
      clip.push({x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)});
    }
    return clipToConvex(poly,clip);
  }
  function clipToConvex(poly,clip){
    if(!poly||poly.length===0) return [];
    var EPS=1e-9,out=poly,j,inp,i,A,B,C,D,ai,bi,den,t;
    function cross(ax,ay,bx,by){return ax*by-ay*bx;}
    function inside(p,C,D){return cross(D.x-C.x,D.y-C.y,p.x-C.x,p.y-C.y)>=-EPS;}
    function intersect(A,B,C,D){
      var rx=B.x-A.x,ry=B.y-A.y,sx=D.x-C.x,sy=D.y-C.y;
      den=cross(rx,ry,sx,sy);
      if(Math.abs(den)<EPS) return B;
      t=cross(C.x-A.x,C.y-A.y,sx,sy)/den;
      return {x:A.x+t*rx,y:A.y+t*ry};
    }
    for(j=0;j<clip.length;j++){
      C=clip[j];D=clip[(j+1)%clip.length];
      inp=out;out=[];if(inp.length===0)break;
      for(i=0;i<inp.length;i++){
        A=inp[(i+inp.length-1)%inp.length];B=inp[i];
        ai=inside(A,C,D);bi=inside(B,C,D);
        if(bi){if(!ai)out.push(intersect(A,B,C,D));out.push(B);}
        else if(ai)out.push(intersect(A,B,C,D));
      }
    }
    return out;
  }
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
  return {v3:v3,add:add,sub:sub,scale:scale,dot:dot,cross:cross,len:len,norm:norm,rad:rad,rangeProjectionRadius:rangeProjectionRadius,beamFrame:beamFrame,footprint:footprint,clipByRangeDistance:clipByRangeDistance,inBeamAtHeight:inBeamAtHeight,clipToRoom:clipToRoom};
})();

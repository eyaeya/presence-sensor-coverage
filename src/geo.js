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
  function footprint(fr,aH,aV,h,rangeMax,farBound){
    if(h>=fr.S.z) return [];
    var tH=Math.tan(aH),tV=Math.tan(aV),pts=[],N=240,i,b,g,t,P,hd,reach;
    for(i=0;i<N;i++){
      b=2*Math.PI*i/N;
      g=norm(add(add(scale(fr.u,tH*Math.cos(b)),scale(fr.v,tV*Math.sin(b))),fr.d));
      if(g.z<-1e-9){
        t=(h-fr.S.z)/g.z;
        P={x:fr.S.x+g.x*t,y:fr.S.y+g.y*t};
      } else {
        hd=norm(v3(g.x,g.y,0));
        reach=farBound;
        P={x:fr.S.x+hd.x*reach,y:fr.S.y+hd.y*reach};
      }
      pts.push(P);
    }
    return rangeMax!=null?clipByRangeDistance(pts,fr,h,rangeMax):pts;
  }
  function clipByRangeDistance(poly,fr,h,rangeMax){
    if(!poly||poly.length===0) return [];
    var dz=h-fr.S.z;
    if(rangeMax<=Math.abs(dz)) return [];
    return clipToCircle(poly,fr.S.x,fr.S.y,Math.sqrt(rangeMax*rangeMax-dz*dz),240);
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
  return {v3:v3,add:add,sub:sub,scale:scale,dot:dot,cross:cross,len:len,norm:norm,rad:rad,beamFrame:beamFrame,footprint:footprint,clipByRangeDistance:clipByRangeDistance,clipToRoom:clipToRoom};
})();

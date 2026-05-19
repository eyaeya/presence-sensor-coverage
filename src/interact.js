/* ===== Interact ===== */
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
      if(st.mount!=='ceiling'){resnapRoom(st);}else{st.sensor.x=clamp(st.sensor.x,0,st.room.W,st.sensor.x);}onChange();});
    Dn.addEventListener('input',function(){st.room.D=clamp(Dn.value,1000,20000,st.room.D);
      if(st.mount!=='ceiling'){resnapRoom(st);}else{st.sensor.y=clamp(st.sensor.y,0,st.room.D,st.sensor.y);}onChange();});
    W.addEventListener('change',function(){W.value=st.room.W;});
    Dn.addEventListener('change',function(){Dn.value=st.room.D;});
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
  function hRange(){var lim={ceiling:[2000,5000],side:[1000,2000],corner:[1000,2000]}[st.mount];
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
  function resnapRoom(st){
    if(st.mount==='side'){ placeSensor(st,{x:st.sensor.x,y:st.sensor.y}); }
    else if(st.mount==='corner'){ st.sensor={x:(st.corner[1]==='l'?0:st.room.W),y:(st.corner[0]==='b'?0:st.room.D)}; }
  }
  return {clamp:clamp,init:init,nearestWall:nearestWall,nearestCorner:nearestCorner,placeSensor:placeSensor,relocateSideWall:relocateSideWall,resnapRoom:resnapRoom};
})();

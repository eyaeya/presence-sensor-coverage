/* ===== Info ===== */
var Info=(function(){
  function mm(v){return Math.round(v)+' mm';}
  function positioning(st){
    var W=st.room.W,D=st.room.D,r=[],name={ceiling:'吸顶安装',side:'侧装',corner:'墙角安装'}[st.mount];
    r.push({label:'安装方式',value:name});
    if(st.mount==='ceiling'){
      r.push({label:'距上墙',value:mm(D-st.sensor.y)});
      r.push({label:'距下墙',value:mm(st.sensor.y)});
      r.push({label:'距左墙',value:mm(st.sensor.x)});
      r.push({label:'距右墙',value:mm(W-st.sensor.x)});
      r.push({label:'安装高度',value:mm(st.height)});
    } else if(st.mount==='side'){
      var horiz=(st.wall==='left'||st.wall==='right');
      var pos=horiz?st.sensor.y:st.sensor.x, span=horiz?D:W;
      r.push({label:'距墙一端',value:mm(pos)});
      r.push({label:'距墙另一端',value:mm(span-pos)});
      r.push({label:'安装高度',value:mm(st.height)});
      r.push({label:'下倾角度',value:st.tilt+'°'});
    } else {
      r.push({label:'安装高度',value:mm(st.height)});
      r.push({label:'下倾角度',value:st.tilt+'°'});
    }
    return r;
  }
  function params(st){return [
    {label:'H / V FOV',value:st.hFov+'° / '+st.vFov+'°'},
    {label:'存在 / 运动距离',value:mm(st.rangePresence)+' / '+mm(st.rangeMotion)}];}
  function hover(st,mm){
    if(!mm||mm.x<0||mm.x>st.room.W||mm.y<0||mm.y>st.room.D) return null;
    return {left:Math.round(mm.x),right:Math.round(st.room.W-mm.x),
      bottom:Math.round(mm.y),top:Math.round(st.room.D-mm.y)};
  }
  function coverage(st, mm){
    var result={stand:false, sit:false, lie:false, ground:false};
    if(!mm||mm.x<0||mm.x>st.room.W||mm.y<0||mm.y>st.room.D) return result;
    var fr=Geo.beamFrame(st);
    var aH=Geo.rad(st.hFov/2), aV=Geo.rad(st.vFov/2);
    var HEIGHTS={stand:1200, sit:750, lie:600, ground:0};
    for(var key in HEIGHTS){
      var h=HEIGHTS[key];
      if(!Geo.inBeamAtHeight(fr,aH,aV,mm,h)) continue;
      var dx=mm.x-fr.S.x, dy=mm.y-fr.S.y, dz=h-fr.S.z;
      var dist3D=Math.sqrt(dx*dx+dy*dy+dz*dz);
      if(dist3D<=st.rangeMotion) result[key]=true;
    }
    return result;
  }
  function addMountGlyph(box,st){
    var g=document.createElement('div');g.className='mini-room';
    var dot=document.createElement('i');
    dot.style.left=(st.sensor.x/st.room.W*100)+'%';
    dot.style.bottom=(st.sensor.y/st.room.D*100)+'%';
    if(st.mount==='side')g.className+=' side';
    if(st.mount==='corner')g.className+=' corner';
    g.appendChild(dot);box.appendChild(g);
  }
  function addMetricChips(box,st){
    var chips=document.createElement('div');chips.className='chips';
    [{t:'H',label:'水平 FOV',v:st.hFov+'°'},{t:'V',label:'垂直 FOV',v:st.vFov+'°'},{t:'P',label:'存在距离',v:mm(st.rangePresence)},{t:'M',label:'运动距离',v:mm(st.rangeMotion)}].forEach(function(c){
      var e=document.createElement('div');e.className='chip';e.setAttribute('title',c.label+' '+c.v);e.setAttribute('aria-label',c.label+' '+c.v);
      e.innerHTML='<b>'+c.t+'</b><span>'+c.v+'</span>';chips.appendChild(e);
    });
    box.appendChild(chips);
  }
  function addHoverGrid(box,hv){
    var grid=document.createElement('div');grid.className='hover-grid';
    var vals=hv?[
      ['上',hv.top],['左',hv.left],['右',hv.right],['下',hv.bottom]
    ]:[['上','—'],['左','—'],['右','—'],['下','—']];
    vals.forEach(function(p){var d=document.createElement('div');d.innerHTML='<b>'+p[0]+'</b><span>'+(p[1]==='—'?'—':p[1]+' mm')+'</span>';grid.appendChild(d);});
    box.appendChild(grid);
  }
  function render(st,hv){
    var box=document.getElementById('info');box.innerHTML='';
    function sec(title,rows){var h=document.createElement('h3');h.textContent=title;box.appendChild(h);
      rows.forEach(function(o){var d=document.createElement('div');d.className='row';
        d.innerHTML='<span>'+o.label+'</span><span>'+o.value+'</span>';box.appendChild(d);});}
    function title(text){var h=document.createElement('h3');h.textContent=text;box.appendChild(h);}
    addMountGlyph(box,st);
    sec('安装定位',positioning(st));
    addMetricChips(box,st);
    sec('当前参数',params(st));
    title('鼠标位置');
    addHoverGrid(box,hv);
  }
  return {positioning:positioning,params:params,hover:hover,coverage:coverage,render:render};
})();

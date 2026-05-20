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
    Render.LAYERS.forEach(function(L){
      if(!Geo.inBeamAtHeight(fr,aH,aV,mm,L.h)) return;
      var dx=mm.x-fr.S.x, dy=mm.y-fr.S.y, dz=L.h-fr.S.z;
      var dist3D=Math.sqrt(dx*dx+dy*dy+dz*dz);
      if(dist3D<=st.rangeMotion) result[L.key]=true;
    });
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
  function addHoverCompass(box,st,hv){
    var grid=document.createElement('div');grid.className='hover-compass';
    function cell(klass,label,val){
      var c=document.createElement('div');c.className='hc-cell '+klass;
      if(label){var l=document.createElement('span');l.className='hc-label';l.textContent=label;c.appendChild(l);}
      var v=document.createElement('span');v.textContent=val;c.appendChild(v);
      return c;
    }
    if(hv){
      grid.appendChild(cell('hc-top','↑',hv.top+' mm'));
      grid.appendChild(cell('hc-left','←',hv.left+' mm'));
      grid.appendChild(cell('hc-right','→',hv.right+' mm'));
      grid.appendChild(cell('hc-bottom','↓',hv.bottom+' mm'));
    } else {
      grid.appendChild(cell('hc-top','↑','—'));
      grid.appendChild(cell('hc-left','←','—'));
      grid.appendChild(cell('hc-right','→','—'));
      grid.appendChild(cell('hc-bottom','↓','—'));
    }
    var mini=document.createElement('div');mini.className='hc-cell hc-center';
    var inner=document.createElement('div');inner.className='hc-mini';
    if(hv){
      var cur=document.createElement('i');cur.className='hc-cursor';
      cur.style.left=(hv.left/st.room.W*100)+'%';
      cur.style.bottom=(hv.bottom/st.room.D*100)+'%';
      inner.appendChild(cur);
    }
    mini.appendChild(inner);
    grid.appendChild(mini);
    box.appendChild(grid);
  }
  function addCoverageGrid(box,st,hv){
    var grid=document.createElement('div');grid.className='coverage';
    // hv.left===mm.x、hv.bottom===mm.y（见 hover()），可直接复用作为 coverage 输入。
    var cv=hv ? coverage(st, {x:hv.left, y:hv.bottom}) : {stand:false,sit:false,lie:false,ground:false};
    var items=[
      {key:'stand',  label:'站', h:1200, color:'#9b8cff'},
      {key:'sit',    label:'坐', h: 750, color:'#5fb0ff'},
      {key:'lie',    label:'躺', h: 600, color:'#5fe0c0'},
      {key:'ground', label:'地', h:   0, color:'#f5d05a'}
    ];
    items.forEach(function(it){
      var item=document.createElement('div');item.className='cv-item';
      var dot=document.createElement('span');dot.className='cv-dot'+(cv[it.key]?'':' off');
      dot.style.borderColor=it.color;dot.style.background=cv[it.key]?it.color:'transparent';
      var label=document.createElement('span');label.className='cv-label';label.textContent=it.label;
      var h=document.createElement('span');h.className='cv-h';h.textContent=it.h+'mm';
      item.appendChild(dot);item.appendChild(label);item.appendChild(h);
      grid.appendChild(item);
    });
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
    addHoverCompass(box,st,hv);
    title('覆盖区');
    addCoverageGrid(box,st,hv);
  }
  return {positioning:positioning,params:params,hover:hover,coverage:coverage,render:render};
})();

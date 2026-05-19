/* ===== Info ===== */
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
  function hover(st,mm){
    if(!mm||mm.x<0||mm.x>st.room.W||mm.y<0||mm.y>st.room.D) return null;
    return {left:Math.round(mm.x),right:Math.round(st.room.W-mm.x),
      bottom:Math.round(mm.y),top:Math.round(st.room.D-mm.y)};
  }
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

/* ===== 引导 ===== */
window.addEventListener('DOMContentLoaded',function(){
  if(location.search.indexOf('test')>=0){
    document.getElementById('app').style.display='none';
    var pre=document.createElement('pre');pre.id='test-output';document.body.appendChild(pre);
    Tests.run();
    return;
  }
  window.__state=State.defaults();
  Render.init();
  Render.draw(window.__state);
  Info.render(window.__state,null);
  Interact.init(window.__state,function(){Render.draw(window.__state);Info.render(window.__state,null);});
  window.addEventListener('resize',function(){Render.draw(window.__state);Info.render(window.__state,null);});
  (function bindPointer(){
    var svg=document.getElementById('svg'),dragging=false,st=window.__state,lastHover=null;
    function mmFromEvent(e){var r=svg.getBoundingClientRect();var tr=Render.currentTransform();
      return tr.toMm(e.clientX-r.left,e.clientY-r.top);}
    function refresh(){Render.draw(st);Info.render(st,lastHover);}
    svg.addEventListener('pointerdown',function(e){
      var mm=mmFromEvent(e);
      if(st.mount==='ceiling'){dragging=true;Interact.placeSensor(st,mm);}
      else if(st.mount==='side'){Interact.relocateSideWall(st,mm);dragging=true;}
      else {Interact.placeSensor(st,mm);}
      refresh();
    });
    svg.addEventListener('pointermove',function(e){
      var mm=mmFromEvent(e);
      lastHover=Info.hover(st,mm);
      var moved=false;
      if(dragging&&st.mount==='ceiling'){Interact.placeSensor(st,mm);moved=true;}
      if(dragging&&st.mount==='side'){Interact.placeSensor(st,mm);moved=true;}
      if(moved)Render.draw(st);
      Info.render(st,lastHover);
    });
    window.addEventListener('pointerup',function(){dragging=false;});
    window.addEventListener('pointercancel',function(){dragging=false;});
    svg.addEventListener('pointerleave',function(){lastHover=null;Info.render(st,null);});
  })();
});

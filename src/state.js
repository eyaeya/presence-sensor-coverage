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

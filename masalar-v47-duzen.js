/* V47 – Son Islemler yuksekligini fareyle surukleme; sadece gorunum. */
(()=>{
  'use strict';
  const box=document.getElementById('recentHistory');
  const handle=document.getElementById('recentResizeHandle');
  if(!box||!handle) return;
  const KEY='beta-recent-history-height-v47';
  const clamp=(n)=>Math.min(600,Math.max(135,n));
  const apply=(h)=>{const v=clamp(h);box.style.setProperty('--beta-recent-height',v+'px');return v;};
  try{const saved=Number(localStorage.getItem(KEY));if(Number.isFinite(saved)&&saved>0)apply(saved);}catch(_e){}
  let drag=null;
  handle.addEventListener('pointerdown',e=>{
    if(e.button!==0||window.matchMedia('(max-width:900px)').matches)return;
    drag={y:e.clientY, height:box.getBoundingClientRect().height};
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener('pointermove',e=>{
    if(!drag)return;
    apply(drag.height+drag.y-e.clientY);
  });
  const stop=()=>{if(!drag)return;drag=null;try{localStorage.setItem(KEY,String(Math.round(box.getBoundingClientRect().height)));}catch(_e){}};
  handle.addEventListener('pointerup',stop);
  handle.addEventListener('pointercancel',stop);
  handle.addEventListener('keydown',e=>{
    if(!['ArrowUp','ArrowDown'].includes(e.key))return;
    e.preventDefault();
    const delta=e.key==='ArrowUp'?20:-20;
    const v=apply(box.getBoundingClientRect().height+delta);
    try{localStorage.setItem(KEY,String(v));}catch(_e){}
  });
})();

/* V37 - masalar icin %60-%250 olcek (adi sabit fontta). */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const input=$('tableScaleRange'),grid=$('cards'),down=$('cardSizeDown'),up=$('cardSizeUp'),reset=$('cardSizeReset'),display=$('cardSizeDisplay');
 if(!input||!grid||!down||!up||!reset||!display)return;
 const key='beta-table-scale-v37';
 let scale=100;
 try{const saved=Number(localStorage.getItem(key));if(Number.isFinite(saved)&&saved>=60&&saved<=250)scale=Math.round(saved/10)*10;}catch(_){}
 function draw(){
  const icon=Math.round(54*scale/100),width=Math.round(112*scale/100),height=Math.round(137*scale/100);
  grid.style.setProperty('--beta-icon-size',icon+'px');
  grid.style.setProperty('--beta-tile-width',Math.max(width,76)+'px');
  grid.style.setProperty('--beta-tile-height',Math.max(height,105)+'px');
  input.value=String(scale);display.textContent=scale+'%';
  down.disabled=scale<=60;up.disabled=scale>=250;reset.disabled=scale===100;
  try{localStorage.setItem(key,String(scale));}catch(_){}
 }
 input.addEventListener('input',()=>{scale=Number(input.value);draw();});
 down.addEventListener('click',()=>{scale=Math.max(60,scale-10);draw();});
 up.addEventListener('click',()=>{scale=Math.min(250,scale+10);draw();});
 reset.addEventListener('click',()=>{scale=100;draw();});
 draw();
})();

/* Beta Playstation V58 — only install after masalar.js (V57) and V54 context JS. */
(()=>{'use strict';
 const el=id=>document.getElementById(id);
 const getSelected=()=>state.tables.find(t=>String(t.id)===String(selectedTableId));
 function updateBalance(){
   const panel=el('selectedTablePanel');if(!panel)return;
   const table=getSelected(),s=table&&active(table);
   let row=panel.querySelector('#v58RemainingRow');
   if(!s||partialAmount(s.id)<=0){if(row)row.remove();return;}
   const total=gameAmount(s)+productAmount(s.id);
   const remaining=Math.max(0,Math.round((total-upfrontAmount(s.id))*100)/100);
   if(!row){
     row=document.createElement('div');row.id='v58RemainingRow';row.className='side-line v58-remaining-row';
     row.innerHTML='<span>💵 Kalan Ödenecek</span><strong id="v58RemainingValue"></strong>';
     const totalRow=panel.querySelector('.side-total');if(!totalRow)return;
     totalRow.insertAdjacentElement('afterend',row);
   }
   const value=row.querySelector('#v58RemainingValue');
   if(value)value.textContent=money(remaining);
 }
 // Keep the original selection and all accounting logic intact.
 const originalSelect=selectDeskTable;
 selectDeskTable=function(id){const out=originalSelect(id);updateBalance();return out;};
 setInterval(()=>{if(!el('app')?.hidden)updateBalance();},1000);
 updateBalance();

 const menu=el('tableContextMenu');
 if(!menu)return;
 const originalShow=showTableContext;
 showTableContext=function(id,x,y){
   originalShow(id,x,y);
   menu.querySelector('[data-v58-convert]')?.remove();
   const table=state.tables.find(t=>String(t.id)===String(id)),s=table&&active(table);
   if(!s||s.mode!=='unlimited')return;
   const btn=document.createElement('button');btn.type='button';
   btn.dataset.v58Convert=s.id;btn.textContent='⏱ Süreliye Çevir';
   btn.title='Oynanan süre korunur. Ek süre için dakika belirle.';
   // Place inside V54 extras, if available, otherwise regular context menu.
   (menu.querySelector('.hs-context-extra')||menu).append(btn);
   const rect=menu.getBoundingClientRect();
   menu.style.top=Math.max(8,Math.min(y,innerHeight-rect.height-12))+'px';
 };

 let working=false;
 menu.addEventListener('click',async e=>{
   const btn=e.target.closest('[data-v58-convert]');if(!btn)return;
   e.preventDefault();e.stopPropagation();
   if(working)return;
   const id=btn.dataset.v58Convert;
   hideTableContext();
   const s=state.sessions.find(x=>x.id===id&&!x.ended_at);
   if(!s||s.mode!=='unlimited'){msg('Hesap artık süresiz açık değil. Yenileyin.',true);return;}
   const value=prompt('Bu masa için şu andan itibaren kaç dakika daha süre verilsin? (1–1440)', '60');
   if(value===null)return;
   const minutes=Number(value);
   if(!Number.isInteger(minutes)||minutes<1||minutes>1440){msg('1 ile 1440 arasında tam dakika gir.',true);return;}
   const estimatedGame=gameAmount(s);
   const hourly=Number(s.hourly_price||0);
   if(hourly<=0){msg('Bu masa için geçerli saatlik tarife yok.',true);return;}
   const estimatedExtra=hourly*minutes/60;
   if(!confirm(`${minutes} dakika ek süreyle süreli hesaba dönüştürülsün mü?\n\nGeçmiş oyun ücreti (tahmini): ${money(estimatedGame)}\nEk süre ücreti (yaklaşık): ${money(estimatedExtra)}\n\nMevcut kısmi tahsilat ve adisyonlar korunacaktır. Kesin tutar sunucuda hesaplanır.`))return;
   working=true;btn.disabled=true;
   try{
     const result=await db.rpc('cafe_convert_unlimited_to_timed_v58',{p_session_id:id,p_extra_minutes:minutes});
     if(result.error)throw result.error;
     await reload(true);
     updateBalance();
     msg('Masa süreliye çevrildi; mevcut tahsilatlar ve adisyonlar korundu.');
   }catch(err){msg('Süreliye çevirme başarısız: '+err.message,true);alert('Süreliye çevirme başarısız: '+err.message);}
   finally{working=false;}
 },false);
})();

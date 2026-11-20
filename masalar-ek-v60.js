/* Beta Playstation V60 — only install after masalar.js (V57) and V54 context JS. */
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
   btn.title='Toplam oyun süresini ve sabit toplam oyun ücretini belirle.';
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
    const s=state.sessions.find(x=>String(x.id)===String(id)&&!x.ended_at);
    if(!s||s.mode!=='unlimited'){msg('Hesap artık süresiz açık değil. Yenileyin.',true);return;}
    const elapsedMinutes=Math.ceil(elapsed(s)/60);
    const totalValue=prompt(`Oyun başladığından itibaren TOPLAM kaç dakika oynansın?\nŞu ana kadar ${elapsedMinutes} dakika geçti.\n(Örn. 30 dakika oynandıysa, toplam 60 yaz.)`,String(Math.max(60,elapsedMinutes+30)));
    if(totalValue===null)return;
    const totalMinutes=Number(totalValue.trim());
    if(!Number.isInteger(totalMinutes)||totalMinutes<=elapsedMinutes||totalMinutes>1440){
      msg(`Toplam süre, geçen ${elapsedMinutes} dakikadan büyük ve en fazla 1440 olmalı.`,true);return;
    }
    const priceValue=prompt('Hesap kapanışında sabit OYUN ÜCRETİ kaç TL olsun? (Adisyonlar ayrıca eklenir.)\nÖrnek: 200',String(Math.max(0,Math.round(gameAmount(s)))));
    if(priceValue===null)return;
    const totalPrice=Number(priceValue.trim().replace(',','.'));
    if(!Number.isFinite(totalPrice)||totalPrice<=0||totalPrice>100000||Math.round(totalPrice*100)!==totalPrice*100){
      msg('Oyun ücreti 0 ile 100.000 TL arasında ve en fazla 2 ondalık basamaklı olmalı.',true);return;
    }
    const remaining=totalMinutes-elapsedMinutes;
    if(!confirm(`Süresiz hesap süreliye çevrilsin mi?\n\nToplam oyun süresi: ${totalMinutes} dakika\nGeçen: ${elapsedMinutes} dakika\nKalan yaklaşık: ${remaining} dakika\nSabit OYUN ücreti: ${money(totalPrice)}\n\nAdisyonlar ayrıca eklenir, alınan kısmi ödemeler korunur. Bu işlem mevcut oyun ücretini ${money(totalPrice)} olarak yeniden belirler.`))return;
    working=true;btn.disabled=true;
    try{
      const result=await db.rpc('cafe_convert_unlimited_to_timed_v60',{
        p_session_id:id,p_total_minutes:totalMinutes,p_total_game_price:totalPrice
      });
      if(result.error)throw result.error;
      await reload(true);
      updateBalance();
      msg(`Süreliye çevrildi: toplam ${totalMinutes} dk, sabit oyun ücreti ${money(totalPrice)}.`);
    }catch(err){msg('Süreliye çevirme başarısız: '+err.message,true);alert('Süreliye çevirme başarısız: '+err.message);}
    finally{working=false;}
  },false);
})();

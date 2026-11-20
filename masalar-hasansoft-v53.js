/* Beta Playstation V53 — Hasansoft-inspired desktop controls.
 * Non-destructive UI layer: uses existing authorized actions; no Supabase writes.
 * Load after masalar.js and v47 scripts. */
(()=>{'use strict';
 const byId=id=>document.getElementById(id);
 const moneyTR=n=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(Number(n)||0);
 const clock=d=>{const t=new Date(d);return Number.isNaN(+t)?'—':t.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})};
 const minutes=s=>Math.max(0,Math.floor(Number(s||0)/60));
 const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const findTable=id=>state.tables.find(t=>String(t.id)===String(id));
 const live=id=>{const t=findTable(id);return t?active(t):null};
 const dd=document.createElement('dialog');dd.id='hsAccountSummary';dd.className='hs-account-dialog';
 dd.innerHTML='<div class="hs-summary-head"><h2 id="hsSummaryTitle">Hesap Özeti</h2><button type="button" id="hsSummaryClose" aria-label="Kapat">✕</button></div><div id="hsSummaryContent"></div><div class="hs-summary-footer"><button type="button" id="hsSummaryOk">✓ Tamam</button></div>';
 document.body.append(dd);
 byId('hsSummaryClose').onclick=byId('hsSummaryOk').onclick=()=>dd.close();
 dd.addEventListener('click',e=>{if(e.target===dd)dd.close()});
 let currentSummary=null;
 function updateSummary(){
  if(!dd.open||!currentSummary)return;
  const s=state.sessions.find(x=>String(x.id)===String(currentSummary));if(!s||s.ended_at){dd.close();return;}
  const t=findTable(s.table_id),r=receiptData(s),sec=elapsed(s),left=s.mode==='timed'?Math.max(0,Number(s.planned_seconds||0)-sec):null;
  const paid=typeof advanceAmount==='function'?advanceAmount(s.id):0;
  const ends=s.mode==='timed'?new Date(new Date(s.started_at).getTime()+Number(s.planned_seconds||0)*1000):null;
  byId('hsSummaryTitle').textContent=(t?.name||'Masa')+' · Hesap Özeti';
  const fields=[['Tarife',Number(s.controllers||1)+' KOL'],['Başlama Saati',clock(s.started_at)],['Geçen Süre',minutes(sec)+' dk'],
    ...(s.mode==='timed'?[['Kalan Süre',minutes(left)+' dk'],['Bitiş Saati',clock(ends)]]:[]),
    ['Kullanım Ücreti',moneyTR(r.game)],['Adisyon Tutarı',moneyTR(r.orders)],
    ['Hesabı Açan','BETA / Yetkili kullanıcı'],
    ...(paid>0?[['Önceden Tahsil Edilen',moneyTR(paid)]]:[]),['Toplam Tutar',moneyTR(r.total)]];
  // We cannot rely on username data in sessions: don't invent the opener.
  fields.splice(fields.findIndex(f=>f[0]==='Hesabı Açan'),1);
  const rows=fields.map(([label,val])=>`<div class="hs-summary-pair ${label==='Toplam Tutar'?'hs-sum-total':''}"><span>${safe(label)}</span><strong>${safe(val)}</strong></div>`).join('');
  const orderRows=r.items.map(it=>`<tr><td>${safe(it.name)}</td><td>${Number(it.qty)||0}</td><td>${moneyTR((Number(it.qty)||0)*(Number(it.price)||0))}</td></tr>`).join('');
  byId('hsSummaryContent').innerHTML=`<div class="hs-summary-layout"><section class="hs-summary-fields">${rows}<small>Hesap türü: ${s.mode==='timed'?'Süreli':'Süresiz'} · Kol: ${Number(s.controllers)||1}</small></section><section class="hs-summary-adisyon"><h3>Adisyonlar</h3><div class="hs-summary-scroll"><table><thead><tr><th>Ürün</th><th>Adet</th><th>Fiyat</th></tr></thead><tbody>${orderRows||'<tr><td colspan="3">Bu hesapta ürün yok.</td></tr>'}</tbody></table></div><h3>Açıklama</h3><p>Hesap açık. Bu ekran yalnızca bilgi verir; hesabı kapatmaz, ödeme kaydetmez.</p></section></div>`;
 }
 function showSummary(id){if(document.querySelector('dialog[open]'))return;currentSummary=id;dd.showModal();updateSummary();}
 // Capture before legacy dblclick handler; the legacy handler immediately opens payment.
 document.addEventListener('dblclick',e=>{
  const tile=e.target.closest('.desk-tile[data-table-id]');if(!tile||!byId('cards')?.contains(tile))return;
  if(window.betaMultiSelectMode)return;
  const s=live(tile.dataset.tableId);if(!s)return; // Keep existing account-opening flow for empty tables.
  e.preventDefault();e.stopImmediatePropagation();
  if(document.querySelector('dialog[open]'))return;
  showSummary(s.id);
 },true);
 // Context extension retains original safe actions and visually separates open/unlimited and timed menu choices.
 const menu=byId('tableContextMenu');
 if(menu){
  const extra=document.createElement('div');extra.className='hs-context-extra';menu.prepend(extra);
  const originalShow=showTableContext;
  showTableContext=function(id,x,y){
   originalShow(id,x,y);
   const s=live(id);let actions=[];
   if(!s){actions=[['open-unlimited','▶ Süresiz Hesap Aç'],['open-timed','◷ Süreli Hesap Aç']];}
   else{actions=[['summary','🧾 Hesap Özeti'],['move','↔ Masa Değiştir'],['refresh','⟳ Yenile'],
     ...(s.mode==='timed'?[['adjust-time','◷ Süre Ekle / Düş']]:[]),['controllers','🎮 Kol Ekle / Çıkar']];}
   extra.innerHTML=actions.map(([id,label])=>`<button type="button" data-hs-action="${id}" role="menuitem">${label}</button>`).join('');
   const set=(name,visible)=>{const b=menu.querySelector(`[data-context-action="${name}"]`);if(b)b.hidden=!visible;};
   set('close',!!s);set('manual',!!s);set('manage',!!s);set('partial',false);
   set('restore',!s);set('settings',true);
   menu.style.top=Math.max(8,Math.min(y,innerHeight-menu.offsetHeight-12))+'px';
  };
  menu.addEventListener('click',e=>{
   const b=e.target.closest('[data-hs-action]');if(!b)return;
   e.preventDefault();e.stopImmediatePropagation();
   const action=b.dataset.hsAction,id=menu.dataset.hsTable||window.__hsContextTableId;
   hideTableContext();const s=id&&live(id);
   if(action==='open-unlimited'||action==='open-timed'){
     if(id&&!s){openSessionDialog(id);byId('mode').value=action==='open-timed'?'timed':'unlimited';byId('mode').dispatchEvent(new Event('change',{bubbles:true}));}
   }else if(action==='summary'&&s)showSummary(s.id);
   else if(action==='refresh')reload();
   else if(['move','controllers','adjust-time'].includes(action)&&s){
    openManageSession(s.id);
    const target=action==='move'?'manageTarget':action==='controllers'?'manageControllers':'manageDelta';byId(target)?.focus();
   }
  },true);
  // The base program stores contextTableId privately. Remember it from the right-click event.
  document.addEventListener('contextmenu',e=>{const tile=e.target.closest('.desk-tile[data-table-id]');if(tile){window.__hsContextTableId=tile.dataset.tableId;menu.dataset.hsTable=tile.dataset.tableId;}},true);
 }
 // Add visual detail from Hasansoft to the existing left-panel (not replacing controls).
 const oldSelect=selectDeskTable;
 selectDeskTable=function(id){
  oldSelect(id);
  const panel=byId('selectedTablePanel'),s=live(id);if(!panel||!s)return;
  const detail=document.createElement('div');detail.className='hs-side-extras';
  const remaining=s.mode==='timed'?Math.max(0,Number(s.planned_seconds||0)-elapsed(s)):null;
  detail.innerHTML=`<div class="side-line"><span>Hesap türü</span><strong>${s.mode==='timed'?'Süreli':'Süresiz'}</strong></div><div class="side-line"><span>Başlama</span><strong>${clock(s.started_at)}</strong></div>${s.mode==='timed'?`<div class="side-line"><span>Kalan</span><strong>${minutes(remaining)} dk</strong></div>`:''}<button type="button" class="secondary hs-summary-side">🧾 Hesap Özeti</button><button type="button" class="secondary hs-manage-side">⚙️ Masa / Kol / Süre İşlemleri</button>`;
  const firstButton=panel.querySelector('#sideManual');if(firstButton)firstButton.before(detail);else panel.append(detail);
  detail.querySelector('.hs-summary-side').onclick=()=>showSummary(s.id);
  detail.querySelector('.hs-manage-side').onclick=()=>openManageSession(s.id);
 };
 setInterval(()=>{if(dd.open)updateSummary()},1000);
})();

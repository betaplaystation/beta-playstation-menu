/* Beta Playstation V62 | Kol fiyatini simdi itibariyla ekle/cikar */
'use strict';
(function(){
 const menu=document.getElementById('tableContextMenu');
 if(!menu || document.getElementById('betaKolV62'))return;
 const item=document.createElement('button');
 item.type='button';item.id='betaKolV62';
 item.textContent='🎮 Kol Ücreti Ekle / Çıkar';
 item.className='beta-kol-menu-v62';
 // Mevcut sag tik menusunun sonunda gorebilir.
 menu.appendChild(item);
 const dlg=document.createElement('dialog');dlg.id='betaKolDialogV62';dlg.className='beta-kol-dialog-v62';
 dlg.innerHTML=`<form id="betaKolFormV62" method="dialog">
  <header><h2>🎮 Kol Ücreti Ekle / Çıkar</h2><button type="button" id="betaKolXV62" aria-label="Kapat">✕</button></header>
  <p id="betaKolNameV62"></p>
  <label>İşlem<select id="betaKolActionV62"><option value="add">➕ Saatlik ücrete ekle</option><option value="remove">➖ Saatlik ücretten çıkar</option></select></label>
  <label>Tutar (TL/saat)<input id="betaKolAmountV62" type="number" min="0.01" max="100000" step="0.01" value="40" required></label>
  <div class="beta-kol-preview-v62"><div>Mevcut saatlik ücret <b id="betaKolOldV62"></b></div><div>Yeni saatlik ücret <strong id="betaKolNewV62"></strong></div></div>
  <p class="beta-kol-note-v62">Önceki oyun süresi eski ücretinden kalır. Yeni ücret yalnızca bu işlemden sonraki süreye uygulanır. Masa açık kalır.</p>
  <p id="betaKolErrorV62" role="alert" class="beta-kol-error-v62"></p>
  <footer><button type="button" id="betaKolCancelV62">Vazgeç</button><button type="submit" id="betaKolSaveV62">Kaydet</button></footer>
 </form>`;
 document.body.appendChild(dlg);
 const $=id=>document.getElementById(id),fmt=n=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(n);
 let sessionId=null,oldRate=0,busy=false;
 const refreshPreview=()=>{
  const delta=Number($('betaKolAmountV62').value);const newRate=oldRate+($('betaKolActionV62').value==='add'?delta:-delta);
  $('betaKolOldV62').textContent=fmt(oldRate);
  $('betaKolNewV62').textContent=Number.isFinite(newRate)?fmt(newRate):'—';
  $('betaKolNewV62').style.color=newRate>0&&newRate<=100000?'#71e5a4':'#ff767d';
  return Number.isFinite(delta)&&delta>0&&delta<=100000&&Math.round(delta*100)===delta*100&&newRate>0&&newRate<=100000;
 };
 $('betaKolActionV62').addEventListener('change',refreshPreview);
 $('betaKolAmountV62').addEventListener('input',refreshPreview);
 const dismiss=()=>{if(!busy)dlg.close()};
 $('betaKolXV62').onclick=dismiss;$('betaKolCancelV62').onclick=dismiss;
 dlg.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
 // Context menu first declares contextTableId at module scope in masalar.js.
 menu.addEventListener('contextmenu',e=>e.preventDefault());
 document.addEventListener('contextmenu', e=>{
  const tile=e.target.closest?.('.desk-tile');
  if(!tile){item.hidden=true;return}
  // Menunun gosterilmesi eski kodda bu event ile gerceklesir.
  const t=state.tables.find(x=>x.id===tile.dataset.tableId);
  const s=t&&state.sessions.find(x=>x.table_id===t.id&&!x.ended_at);
  item.hidden=!s||s.mode!=='unlimited';
 },true);
 item.addEventListener('click',e=>{
  e.stopPropagation();e.preventDefault();
  const id=contextTableId;
  if(!id)return;
  const t=state.tables.find(x=>x.id===id);
  const s=t&&state.sessions.find(x=>x.table_id===id&&!x.ended_at);
  hideTableContext();
  if(!s||s.mode!=='unlimited')return;
  sessionId=s.id;oldRate=Number(s.hourly_price);
  $('betaKolNameV62').textContent=t.name+' · Süresiz hesap';
  $('betaKolAmountV62').value='40';$('betaKolActionV62').value='add';$('betaKolErrorV62').textContent='';
  refreshPreview();dlg.showModal();
 });
 $('betaKolFormV62').addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!sessionId)return;
  if(!refreshPreview()){$('betaKolErrorV62').textContent='Tutarı ve yeni saatlik ücreti kontrol et.';return}
  const action=$('betaKolActionV62').value,amount=Number($('betaKolAmountV62').value);
  if(!confirm(`${fmt(amount)} / saat ${action==='add'?'eklenecek':'çıkarılacak'}. Değişiklik şimdi başlayacak. Onaylıyor musun?`))return;
  busy=true;$('betaKolSaveV62').disabled=true;$('betaKolErrorV62').textContent='Kaydediliyor…';
  try{
   const result=await db.rpc('cafe_adjust_hourly_v62',{p_session_id:sessionId,p_action:action,p_amount:amount});
   if(result.error)throw result.error;
   dlg.close();await reload(true);msg('Saatlik kol ücreti güncellendi: '+fmt(Number(result.data))+'/saat');
  }catch(err){$('betaKolErrorV62').textContent='İşlem başarısız: '+err.message;}
  finally{busy=false;$('betaKolSaveV62').disabled=false}
 });
})();

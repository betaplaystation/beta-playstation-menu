/* Beta Playstation V56 — adisyon viewer + existing safe manual void flow.
   Replaces v55 JS; do not load both. QR orders remain read-only. */
(()=>{'use strict';
 const panel=document.getElementById('selectedTablePanel');
 if(!panel)return;
 const dialog=document.createElement('dialog');
 dialog.id='betaAdisyonEyeDialog';dialog.className='beta-adisyon-eye-dialog';
 dialog.innerHTML=`<div class="beta-eye-top"><h2 id="betaEyeTitle">👁 Adisyon İçeriği</h2><button class="beta-eye-exit" type="button" aria-label="Kapat">✕</button></div><p class="beta-eye-note">Açık masaya bağlı ürünler. Kasa adisyonundaki ürünleri silebilirsin; QR siparişleri sipariş yönetiminden iptal edilir.</p><div id="betaEyeContents"></div><div class="beta-eye-bottom"><button type="button" id="betaEyeAdd" class="beta-eye-add">＋ Adisyon Ekle</button><button type="button" class="beta-eye-exit">Kapat</button></div>`;
 document.body.append(dialog);
 const contents=dialog.querySelector('#betaEyeContents');
 const title=dialog.querySelector('#betaEyeTitle');
 const moneyV=v=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(Number(v)||0);
 let working=false;
 const current=()=>{
  if(typeof state==='undefined'||typeof active!=='function')return null;
  const t=state.tables.find(t=>t.id===selectedTableId);
  return t?{t,s:active(t)}:null;
 };
 const note=(txt,style='')=>{const p=document.createElement('p');p.className='beta-eye-note '+style;p.textContent=txt;contents.append(p)};
 const row=(block,i,isManual)=>{
  const item=document.createElement('div');item.className='beta-eye-item';
  const name=document.createElement('span');name.className='beta-eye-item-name';name.textContent=`${i.qty} × ${i.name}`;
  const price=document.createElement('strong');price.textContent=moneyV(i.qty*i.price);
  item.append(name,price);
  if(isManual){
   const del=document.createElement('button');del.type='button';del.className='beta-eye-remove';del.textContent='Sil';del.title='Bu kasa adisyon kalemini iptal et';
   del.addEventListener('click',async()=>{
    if(working)return;
    const now=current();
    if(!now?.s||now.s.id!==i.sessionId){alert('Bu hesap artık açık değil. Adisyonu güncelle.');return;}
    if(typeof voidManual!=='function'){alert('Adisyon silme işlemi mevcut sürümde kullanılamıyor.');return;}
    working=true;del.disabled=true;
    try{
     // Existing function confirms, invokes authorized Supabase RPC and reloads app state.
     await voidManual(i.id);
     if(dialog.open){
      if(current()?.s?.id===i.sessionId)render();else dialog.close();
     }
    }catch(err){console.error('Adisyon silme hatası',err);alert('Adisyon silinemedi. Tekrar deneyin.');}
    finally{working=false;del.disabled=false;}
   });
   item.append(del);
  }
  block.append(item);
 };
 const section=(heading,items,isManual)=>{
  const h=document.createElement('h3');h.textContent=heading;contents.append(h);
  if(!items.length){note('Bu bölümde ürün bulunmuyor.','beta-eye-empty');return;}
  const block=document.createElement('div');block.className='beta-eye-items';contents.append(block);
  items.forEach(i=>row(block,i,isManual));
 };
 function render(){
  const selected=current();
  if(!selected?.s){dialog.close();return;}
  const {t,s}=selected;
  title.textContent=`👁 ${t.name} · Adisyon İçeriği`;
  contents.replaceChildren();
  const qr=[],manual=[];
  for(const o of ordersForSession(s.id))if(o.status!=='cancelled')for(const i of o.order_items||[])
   qr.push({name:String(i.product_name||'Ürün'),qty:Number(i.qty)||0,price:Number(i.unit_price)||0});
  for(const i of manualForSession(s.id))manual.push({id:i.id,sessionId:s.id,name:String(i.product_name||'Ürün'),qty:Number(i.qty)||0,price:Number(i.unit_price)||0});
  section('📱 QR Siparişleri',qr,false);
  section('🧾 Kasa Adisyonu',manual,true);
  const sum=document.createElement('div');sum.className='beta-eye-total';
  const lbl=document.createElement('span');lbl.textContent='Ürünler toplamı';
  const val=document.createElement('strong');val.textContent=moneyV(productAmount(s.id));
  sum.append(lbl,val);contents.append(sum);
  note('Oyun ücreti dahil değildir. Silme işlemi kasa adisyonunu iptal eder; sipariş geçmişini silmez.');
 }
 function show(){try{if(!current()?.s)return;render();dialog.showModal();}catch(err){console.error('Adisyon göz hatası',err);alert('Adisyon bilgisi görüntülenemedi.');}}
 dialog.querySelectorAll('.beta-eye-exit').forEach(b=>b.addEventListener('click',()=>dialog.close()));
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 dialog.querySelector('#betaEyeAdd').addEventListener('click',()=>{
  if(working)return;
  const btn=document.getElementById('sideManual');
  dialog.close();
  if(btn)btn.click();else alert('Adisyon Ekle butonu bulunamadı; açık bir masa seçip tekrar dene.');
 });
 function attach(){
  const manual=document.getElementById('sideManual');
  if(!manual||document.getElementById('betaAdisyonEyeBtn'))return;
  const wrapper=document.createElement('div');wrapper.className='beta-eye-actions';
  manual.replaceWith(wrapper);wrapper.append(manual);
  const eye=document.createElement('button');eye.type='button';eye.id='betaAdisyonEyeBtn';eye.className='beta-eye-button';eye.textContent='👁';eye.title='Bu masanın adisyonunu gör';eye.setAttribute('aria-label','Adisyon içeriğini görüntüle');
  eye.addEventListener('click',show);wrapper.append(eye);
 }
 const observer=new MutationObserver(attach);observer.observe(panel,{childList:true,subtree:true});attach();
})();

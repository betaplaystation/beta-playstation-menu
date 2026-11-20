/* Beta Playstation V55: Open-table QR + manual adisyon viewer.
   Read-only. Does not create payments, orders or database writes. */
(()=>{'use strict';
 const panel=document.getElementById('selectedTablePanel');
 if(!panel)return;
 const dialog=document.createElement('dialog');
 dialog.id='betaAdisyonEyeDialog'; dialog.className='beta-adisyon-eye-dialog';
 dialog.innerHTML=`<div class="beta-eye-top"><h2 id="betaEyeTitle">👁 Adisyon İçeriği</h2><button class="beta-eye-exit" type="button" aria-label="Kapat">✕</button></div><p class="beta-eye-note">Açık masaya bağlı QR siparişleri ve kasa adisyonları. İptal edilen siparişler toplama dahil değildir.</p><div id="betaEyeContents"></div><div class="beta-eye-bottom"><button type="button" class="beta-eye-exit">Kapat</button></div>`;
 document.body.append(dialog);
 dialog.querySelectorAll('.beta-eye-exit').forEach(b=>b.addEventListener('click',()=>dialog.close()));
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 const contents=dialog.querySelector('#betaEyeContents');
 const title=dialog.querySelector('#betaEyeTitle');
 const format=v=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(Number(v)||0);
 const addLine=(container,name,qty,price)=>{
  const item=document.createElement('div');item.className='beta-eye-item';
  const label=document.createElement('span');label.textContent=`${qty} × ${name}`;
  const amount=document.createElement('strong');amount.textContent=format(qty*price);
  item.append(label,amount);container.append(item);
 };
 const section=(heading,items)=>{
  const h=document.createElement('h3');h.textContent=heading;contents.append(h);
  if(!items.length){const empty=document.createElement('p');empty.className='beta-eye-empty';empty.textContent='Bu bölümde ürün bulunmuyor.';contents.append(empty);return;}
  const block=document.createElement('div');block.className='beta-eye-items';contents.append(block);
  for(const i of items)addLine(block,i.name,i.qty,i.price);
 };
 async function show(){
  try{
   if(typeof state==='undefined'||typeof active!=='function')return;
   const selected=state.tables.find(t=>t.id===selectedTableId);
   const s=selected&&active(selected);
   if(!s)return;
   title.textContent=`👁 ${selected.name} · Adisyon İçeriği`;
   contents.replaceChildren();
   const qr=[];const manual=[];
   // These helpers already handle cancelled QR orders and voided manual items.
   for(const o of ordersForSession(s.id))if(o.status!=='cancelled')for(const i of o.order_items||[]){
     qr.push({name:String(i.product_name||'Ürün'),qty:Number(i.qty)||0,price:Number(i.unit_price)||0});
   }
   for(const i of manualForSession(s.id))manual.push({name:String(i.product_name||'Ürün'),qty:Number(i.qty)||0,price:Number(i.unit_price)||0});
   section('📱 QR Siparişleri',qr);
   section('🧾 Kasa Adisyonu',manual);
   const sum=document.createElement('div');sum.className='beta-eye-total';
   const label=document.createElement('span');label.textContent='Ürünler toplamı';
   const value=document.createElement('strong');value.textContent=format(productAmount(s.id));
   sum.append(label,value);contents.append(sum);
   const note=document.createElement('p');note.className='beta-eye-note';note.textContent='Bu pencere yalnızca ürün adisyonunu gösterir. Oyun ücreti dahil değildir. Yeni siparişler için Yenile butonuna basıp tekrar açabilirsin.';contents.append(note);
   dialog.showModal();
  }catch(error){console.error('Adisyon göz hatası',error);alert('Adisyon bilgisi gösterilemedi. Sayfayı yenileyip tekrar deneyin.');}
 }
 function attach(){
  const manual=document.getElementById('sideManual');
  if(!manual||document.getElementById('betaAdisyonEyeBtn'))return;
  const wrapper=document.createElement('div');wrapper.className='beta-eye-actions';
  manual.replaceWith(wrapper);wrapper.append(manual);
  const eye=document.createElement('button');eye.type='button';eye.id='betaAdisyonEyeBtn';eye.className='beta-eye-button';eye.textContent='👁';eye.title='Bu masanın adisyon içeriğini gör';eye.setAttribute('aria-label','Adisyon içeriğini görüntüle');
  eye.addEventListener('click',show);wrapper.append(eye);
 }
 const observer=new MutationObserver(attach);observer.observe(panel,{childList:true,subtree:true});attach();
})();

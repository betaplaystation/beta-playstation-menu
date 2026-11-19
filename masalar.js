'use strict';
const $=id=>document.getElementById(id);
const cfg=window.BETA_CONFIG||{};
const db=window.supabase&&cfg.supabaseUrl&&cfg.supabaseAnonKey?window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey):null;
const state={tables:[],rates:[],sessions:[],links:[],orders:[],user:null,refreshBusy:false};
const money=n=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(Number(n)||0);
const msg=(s,bad=false)=>{$('notice').textContent=s;$('notice').classList.toggle('error',bad)};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTime=seconds=>{const n=Math.max(0,Math.floor(seconds));return `${String(Math.floor(n/3600)).padStart(2,'0')}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`};
const elapsed=s=>Math.max(0,Math.floor((Date.now()-new Date(s.started_at).getTime())/1000));
const active=t=>state.sessions.find(s=>s.table_id===t.id&&!s.ended_at);
const rate=(id,n)=>Number(state.rates.find(r=>r.table_id===id&&r.controllers===Number(n))?.hourly_price||0);
const gameAmount=s=>s.mode==='timed'?Number(s.agreed_price):Math.round(Number(s.hourly_price)*elapsed(s)/36)/100;
function setAuth(on){$('login').hidden=on;$('app').hidden=!on;$('logout').hidden=!on;}
async function requireAuthorized(){const {data:{user},error}=await db.auth.getUser();if(error)throw error;if(!user)return false;const a=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();if(a.error)throw a.error;state.user=a.data?user:null;return Boolean(a.data)}
async function init(){if(!db){msg('Supabase config.js bağlantısı eksik.',true);return;}try{if(await requireAuthorized()){setAuth(true);await reload();}else setAuth(false);}catch(e){msg(e.message,true)}}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();if(!db)return;const b=e.currentTarget.querySelector('button');b.disabled=true;try{const r=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(r.error)throw r.error;if(!await requireAuthorized()){await db.auth.signOut();throw Error('Bu hesap yönetici değil.')}setAuth(true);msg('');await reload();}catch(x){msg(x.message,true)}finally{b.disabled=false}});
$('logout').addEventListener('click',async()=>{await db.auth.signOut();state.user=null;setAuth(false);msg('Çıkış yapıldı.');});
async function reload(silent=false){
 if(!db||!state.user||state.refreshBusy)return;
 state.refreshBusy=true;
 try{
  const r=await Promise.all([
   db.from('cafe_tables').select('*').order('created_at'),
   db.from('cafe_table_rates').select('*'),
   db.from('cafe_sessions').select('*').order('started_at',{ascending:false}).limit(250)
  ]);
  for(const x of r)if(x.error)throw x.error;
  [state.tables,state.rates,state.sessions]=r.map(x=>x.data||[]);
  const interesting=state.sessions.filter(s=>!s.ended_at).concat(state.sessions.filter(s=>s.ended_at).slice(0,15));
  const sessionIds=interesting.map(s=>s.id);
  state.links=[];state.orders=[];
  if(sessionIds.length){
   const links=await db.from('cafe_session_orders').select('session_id,order_id').in('session_id',sessionIds).limit(1000);
   if(links.error)throw links.error;
   state.links=links.data||[];
   const orderIds=[...new Set(state.links.map(l=>l.order_id))];
   // Supabase sorgusunu makul boyutta tut: her adisyonda en fazla 1000 baglanti.
   for(let i=0;i<orderIds.length;i+=100){
    const or=await db.from('orders')
     .select('id,loca_code,status,total,created_at,order_items(product_name,qty,unit_price)')
     .in('id',orderIds.slice(i,i+100));
    if(or.error)throw or.error;
    state.orders.push(...(or.data||[]));
   }
  }
  render();if(!silent)msg('Masalar ve siparişler güncellendi.');
 }catch(e){msg('Masa veya sipariş verisi alınamadı: '+e.message,true)}
 finally{state.refreshBusy=false}
}
const ordersForSession=id=>{
 const ids=new Set(state.links.filter(l=>l.session_id===id).map(l=>l.order_id));
 return state.orders.filter(o=>ids.has(o.id)).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
};
const orderAmount=id=>ordersForSession(id).filter(o=>o.status!=='cancelled')
 .reduce((sum,o)=>sum+Number(o.total||0),0);
const orderDetails=id=>{
 const os=ordersForSession(id);
 if(!os.length)return '<div class="muted">Henüz QR siparişi yok.</div>';
 return os.map(o=>`<div class="order-item"><div class="minirow"><span>${new Date(o.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})} · ${o.status==='cancelled'?'İPTAL · ':''}#${esc(o.id.slice(0,8))}</span><strong>${o.status==='cancelled'?'<s>'+money(o.total)+'</s>':money(o.total)}</strong></div>${(o.order_items||[]).map(i=>`<div class="muted">${Number(i.qty)||0} × ${esc(i.product_name)}</div>`).join('')}</div>`).join('');
};
function render(){const ts=state.tables.filter(t=>t.active),busy=ts.filter(t=>active(t));$('totalTables').textContent=ts.length;$('busyTables').textContent=busy.length;$('freeTables').textContent=ts.length-busy.length;
 $('cards').innerHTML=ts.length?ts.map(t=>{const s=active(t);return `<article class="card"><div class="cardtop"><h3>${esc(t.name)}</h3><span class="tag ${s?'busy':''}" id="tag-${t.id}">${s?'● DOLU':'● BOŞ'}</span></div><div class="line"></div>${s?`<div class="muted">${s.controllers} Kol · ${s.mode==='timed'?'Süreli':'Süresiz'} · ${money(s.hourly_price)}/saat</div><div class="minirow"><span>Geçen süre</span><strong class="time" data-timer="${s.id}">00:00:00</strong></div>${s.mode==='timed'?`<div class="minirow"><span>Kalan süre</span><strong data-left="${s.id}">—</strong></div>`:''}<div class="minirow"><span>Oyun ücreti</span><strong class="amount" data-amount="${s.id}"></strong></div><div class="minirow"><span>QR siparişleri</span><strong>${money(orderAmount(s.id))}</strong></div><div class="minirow due"><span>TOPLAM ADİSYON</span><strong data-total="${s.id}">${money(gameAmount(s)+orderAmount(s.id))}</strong></div><details class="order-detail"><summary>🧾 Siparişler (${ordersForSession(s.id).length})</summary>${orderDetails(s.id)}</details><div class="actions"><button data-close-session="${s.id}">Hesabı Kapat</button><button class="secondary" data-edit-table="${t.id}">Ayarlar</button></div>`:`<div class="muted">Hesap açılmayı bekliyor</div><p class="muted">1–4 kol için ayrı saatlik ücret</p><div class="actions"><button data-open-table="${t.id}">Hesap Aç</button><button class="secondary" data-edit-table="${t.id}">Ayarlar</button></div>`}</article>`;}).join(''):'<p class="muted">Henüz aktif masa yok. “Masa Ekle” ile başlayın.</p>';
 document.querySelectorAll('[data-open-table]').forEach(b=>b.onclick=()=>openSessionDialog(b.dataset.openTable));document.querySelectorAll('[data-edit-table]').forEach(b=>b.onclick=()=>editTable(b.dataset.editTable));document.querySelectorAll('[data-close-session]').forEach(b=>b.onclick=()=>showReceipt(b.dataset.closeSession));document.querySelectorAll('[data-receipt-history]').forEach(b=>b.onclick=()=>showReceipt(b.dataset.receiptHistory));
 const closed=state.sessions.filter(s=>s.ended_at).slice(0,15);$('history').innerHTML=closed.length?closed.map(s=>`<div class="historyrow"><span><b>${esc(state.tables.find(t=>t.id===s.table_id)?.name||'Masa')}</b> · ${s.controllers} Kol · ${new Date(s.ended_at).toLocaleString('tr-TR')}</span><strong>${money(s.final_total_amount??s.final_game_amount)} <small class="muted">(oyun ${money(s.final_game_amount)}, ürün ${money(s.final_order_amount??0)})</small></strong><button class="secondary" type="button" data-receipt-history="${s.id}">🧾 Adisyonu Gör</button></div>`).join(''):'<p class="muted">Henüz kapatılmış hesap yok.</p>';tick();}
function tick(){if($('app').hidden)return;for(const s of state.sessions.filter(s=>!s.ended_at)){const e=elapsed(s),a=document.querySelector(`[data-timer="${s.id}"]`),b=document.querySelector(`[data-left="${s.id}"]`),c=document.querySelector(`[data-amount="${s.id}"]`),t=$(`tag-${s.table_id}`);if(a)a.textContent=fmtTime(e);if(b){const left=s.planned_seconds-e;b.textContent=left>0?fmtTime(left):'SÜRE DOLDU · +'+fmtTime(-left);b.style.color=left<=0?'#ff6369':'';if(t){t.classList.toggle('expired',left<=0);t.textContent=left<=0?'⏰ SÜRE DOLDU':'● DOLU'}}if(c)c.textContent=money(gameAmount(s));const total=document.querySelector(`[data-total="${s.id}"]`);if(total)total.textContent=money(gameAmount(s)+orderAmount(s.id));}}
$('refresh').onclick=()=>reload();setInterval(()=>{if(!$('app').hidden)tick()},1000);setInterval(()=>{if(!$('app').hidden)reload(true)},15000);
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('newTable').onclick=()=>{$('tableForm').reset();$('tableId').value='';$('tableTitle').textContent='Yeni Masa Ekle';$('tableDialog').showModal()};
function editTable(id){const t=state.tables.find(x=>x.id===id);if(!t)return;$('tableId').value=id;$('tableName').value=t.name;for(let i=1;i<=4;i++)$('rate'+i).value=rate(id,i);$('tableTitle').textContent='Masa ve Fiyatları';$('tableDialog').showModal();}
$('tableForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.currentTarget.querySelector('[type=submit]');b.disabled=true;try{const name=$('tableName').value.trim(),prices=[1,2,3,4].map(i=>Number($('rate'+i).value));if(!name||prices.some(v=>!Number.isFinite(v)||v<0))throw Error('İsim ve fiyatlar geçerli olmalı');const r=await db.rpc('cafe_save_table',{p_id:$('tableId').value||null,p_name:name,p_prices:prices});if(r.error)throw r.error;$('tableDialog').close();await reload();msg('Masa kaydedildi.');}catch(x){msg(x.message,true)}finally{b.disabled=false}});
let currentTable=null;function openSessionDialog(id){const t=state.tables.find(x=>x.id===id);if(!t||active(t))return;currentTable=t;$('sessionForm').reset();$('sessionTable').value=id;$('sessionTitle').textContent=t.name+' · Hesap Aç';updatePreview();$('sessionDialog').showModal();}
for(const id of ['controllers','mode','entryType','entryValue'])$(id).addEventListener(id==='entryValue'?'input':'change',updatePreview);
function updatePreview(){if(!currentTable)return;const n=Number($('controllers').value),hourly=rate(currentTable.id,n),mode=$('mode').value,typ=$('entryType').value,val=Number($('entryValue').value);$('timedFields').hidden=mode==='unlimited';$('valueLabel').firstChild.textContent=typ==='minutes'?'Dakika':'Tutar (TL)';$('entryValue').step=typ==='minutes'?'1':'0.01';$('entryValue').placeholder=typ==='minutes'?'Ör. 80':'Ör. 250';if(mode==='unlimited'){$('calculated').textContent=`Saatlik: ${money(hourly)} · Süre otomatik sayılacak.`;return;}if(hourly<=0){$('calculated').textContent='Bu kol için saatlik fiyatı önce masa ayarlarından belirle.';return;}if(!Number.isFinite(val)||val<=0){$('calculated').textContent=`Saatlik ${money(hourly)} · Dakika veya tutar gir.`;return;}const seconds=typ==='minutes'?val*60:Math.round(val*3600/hourly),amount=typ==='minutes'?hourly*val/60:val;$('calculated').textContent=`Seçim: ${n} Kol · Süre: ${fmtTime(seconds)} · Sabit oyun ücreti: ${money(amount)}`;}
$('sessionForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.currentTarget.querySelector('[type=submit]');b.disabled=true;try{const timed=$('mode').value==='timed',val=timed?Number($('entryValue').value):null;if(timed&&(!Number.isFinite(val)||val<=0))throw Error('Pozitif bir dakika veya tutar gir.');const r=await db.rpc('cafe_open_session',{p_table_id:$('sessionTable').value,p_controllers:Number($('controllers').value),p_mode:$('mode').value,p_entry_type:timed?$('entryType').value:null,p_entry_value:val});if(r.error)throw r.error;$('sessionDialog').close();await reload();msg('Hesap açıldı, süre başladı.');}catch(x){msg(x.message,true)}finally{b.disabled=false}});
let receiptSessionId=null;
let receiptClosed=false;
let receiptSnapshot=null;
function receiptData(s){
 const closed=Boolean(s.ended_at);
 const game=closed?Number(s.final_game_amount||0):gameAmount(s);
 const orders=closed?Number(s.final_order_amount||0):orderAmount(s.id);
 const total=closed?Number(s.final_total_amount??game+orders):game+orders;
 const seconds=closed?Math.max(0,Math.floor((new Date(s.ended_at)-new Date(s.started_at))/1000)):elapsed(s);
 const items=[];
 for(const o of ordersForSession(s.id)){
  if(o.status==='cancelled')continue;
  for(const i of o.order_items||[])items.push({name:i.product_name,qty:Number(i.qty)||0,price:Number(i.unit_price)||0});
 }
 return {id:s.id,closed,game,orders,total,seconds,items,
  name:state.tables.find(t=>t.id===s.table_id)?.name||'Masa',controllers:s.controllers,
  mode:s.mode,started:s.started_at,ended:s.ended_at};
}
const receiptHTML=r=>`<div class="receipt-brand">BETA <span>PLAYSTATION</span></div>
 <p class="receipt-sub">${r.closed?'KAPANMIŞ HESAP':'HESAP KAPATMA ÖNCESİ'} · ${esc(r.name)}</p>
 <div class="receipt-meta"><div><span>Masa</span><strong>${esc(r.name)}</strong></div><div><span>Kol sayısı</span><strong>${r.controllers} Kol</strong></div>
 <div><span>Hesap türü</span><strong>${r.mode==='timed'?'Süreli':'Süresiz'}</strong></div>
 <div><span>Oynanan süre</span><strong>${fmtTime(r.seconds)} (${Math.floor(r.seconds/60)} dk ${r.seconds%60} sn)</strong></div>
 <div><span>Açılış</span><strong>${new Date(r.started).toLocaleString('tr-TR')}</strong></div>
 <div><span>${r.closed?'Kapanış':'Durum'}</span><strong>${r.closed?new Date(r.ended).toLocaleString('tr-TR'):'Hesap açık'}</strong></div></div>
 <div class="receipt-line"><span>🎮 Oyun ücreti</span><strong>${money(r.game)}</strong></div>
 <h3>Alınan ürünler</h3>
 ${r.items.length?`<div class="receipt-products">${r.items.map(i=>`<div class="receipt-line"><span>${i.qty} × ${esc(i.name)} <small>(${money(i.price)} / adet)</small></span><strong>${money(i.qty*i.price)}</strong></div>`).join('')}</div>`:'<p class="muted">Bu hesapta ürün siparişi bulunmuyor.</p>'}
 <div class="receipt-line receipt-subtotal"><span>Ürün toplamı</span><strong>${money(r.orders)}</strong></div>
 <div class="receipt-line receipt-total"><span>GENEL TOPLAM</span><strong>${money(r.total)}</strong></div>
 <p class="receipt-foot">Bu ekran bir adisyon özetidir, mali fiş değildir. Ödeme kaydı oluşturulmaz.</p>`;
async function showReceipt(id){
 const s=state.sessions.find(x=>x.id===id);
 if(!s)return;
 receiptSessionId=id;
 // Son QR siparislerini almadan eski bir adisyonla masayi kapatma.
 await reload(true);
 const fresh=state.sessions.find(x=>x.id===id);
 if(!fresh){msg('Hesap bulunamadı; sayfayı yenileyin.',true);return;}
 receiptClosed=Boolean(fresh.ended_at);
 receiptSnapshot=receiptData(fresh);
 $('receiptTitle').textContent=receiptClosed?'🧾 Kapanmış Hesap Adisyonu':'🧾 Hesabı Kapat · Adisyon';
 $('receiptBody').innerHTML=receiptHTML(receiptSnapshot);
 $('receiptWarning').textContent=receiptClosed?'Bu hesap daha önce kapatılmıştır.':'Hesabı Kapat işlemini onaylayana kadar süre saymaya devam eder. Son tutar kapanış anında sunucuda hesaplanır.';
 $('receiptConfirm').hidden=receiptClosed;
 $('receiptCancel').textContent=receiptClosed?'Kapat':'Geri Dön';
 $('receiptDialog').showModal();
}
$('receiptCancel').onclick=()=>$('receiptDialog').close();
$('receiptPrint').onclick=()=>window.print();
$('receiptConfirm').onclick=async()=>{
 if(!receiptSessionId||receiptClosed)return;
 const button=$('receiptConfirm');button.disabled=true;
 try{
  const id=receiptSessionId;
  // Veritabanı kapanış RPC'si gerçek final tutarları kalıcı şekilde kaydeder.
  const r=await db.rpc('cafe_close_session',{p_session_id:id});
  if(r.error)throw r.error;
  await reload(true);
  const closed=state.sessions.find(x=>x.id===id);
  if(!closed||!closed.ended_at)throw Error('Hesap kapatıldı ancak kapanış detayları alınamadı. Sayfayı yenileyin.');
  receiptClosed=true;receiptSnapshot=receiptData(closed);
  $('receiptTitle').textContent='✅ Hesap Kapatıldı · Adisyon';
  $('receiptBody').innerHTML=receiptHTML(receiptSnapshot);
  $('receiptWarning').textContent='Hesap kapatıldı. Adisyonu yazdırabilir veya pencereyi kapatabilirsiniz. Ödeme kaydı oluşturulmadı.';
  button.hidden=true;$('receiptCancel').textContent='Kapat';
  msg(`${receiptSnapshot.name} hesabı kapatıldı. Toplam ${money(receiptSnapshot.total)}.`);
 }catch(e){msg(e.message,true);$('receiptWarning').textContent='İşlem doğrulanamadı: '+e.message;}
 finally{button.disabled=false}
};
init();

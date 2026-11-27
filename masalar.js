'use strict';
const $=id=>document.getElementById(id);
const cfg=window.BETA_CONFIG||{};
const db=window.supabase&&cfg.supabaseUrl&&cfg.supabaseAnonKey?window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey):null;
let selectedTableId=null, currentDeskTab="tables";
const bulkSelected=new Set();let bulkMode=null,bulkWorking=false,bulkSuppressClick=false;
const state={tables:[],rates:[],sessions:[],links:[],orders:[],manualItems:[],products:[],charges:[],segments:[],payments:[],advances:[],partials:[],hiddenReports:[],restoreEvents:[],user:null};
const money=n=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(Number(n)||0);
const msg=(s,bad=false)=>{$('notice').textContent=s;$('notice').classList.toggle('error',bad)};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTime=seconds=>{const n=Math.max(0,Math.floor(seconds));return `${String(Math.floor(n/3600)).padStart(2,'0')}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`};
const elapsed=s=>Math.max(0,Math.floor((Date.now()-new Date(s.started_at).getTime())/1000));
const active=t=>state.sessions.find(s=>s.table_id===t.id&&!s.ended_at);
const validTableColor=c=>/^#[0-9a-fA-F]{6}$/.test(String(c||""))?c:"#84232b";
const rate=(id,n)=>Number(state.rates.find(r=>r.table_id===id&&r.controllers===Number(n))?.hourly_price||0);
const tariff=(id,n)=>state.rates.find(r=>r.table_id===id&&r.controllers===Number(n))||{};
const roundToStep=(n,step)=>{const v=Number(step)||5;return Math.ceil((Math.max(0,Number(n)||0)-1e-9)/v)*v};
// Oyun hesabı: geçen süreyi üst tam dakikaya, oyun ücretini üst 5 TL'ye tamamla.
// Süreli hesapta fiyat doğrudan girildiyse kullanıcının belirlediği sabit tutara dokunma.
const roundUpFive=n=>Math.ceil((Number(n)-1e-9)/5)*5;
const gameAmount=s=>{
 if(s.ended_at)return Number(s.final_game_amount||0);
 if(s.mode==='timed'&&!s.pricing_modified)return Number(s.agreed_price||0);
 const start=Date.parse(s.started_at);
 const end=s.mode==='timed'?start+Number(s.planned_seconds||0)*1000:start+Math.ceil(Math.max(0,Date.now()-start)/60000)*60000;
 const segs=state.segments.filter(x=>x.session_id===s.id).sort((a,b)=>Date.parse(a.started_at)-Date.parse(b.started_at));
 if(!segs.length)return roundToStep(Math.max(Number(s.hourly_price)*Math.ceil(elapsed(s)/60)/60,0),5);
 let total=Number(s.pricing_adjustment||0);
 for(let i=0;i<segs.length;i++){
  const from=Math.max(start,Date.parse(segs[i].started_at));
  const to=Math.min(end,i+1<segs.length?Date.parse(segs[i+1].started_at):end);
  if(to>from)total+=(to-from)*Number(segs[i].hourly_price)/3600000;
 }
 const first=segs[0],last=segs[segs.length-1];
 const minPrice=Number(first.short_fee||0);
 return roundToStep(Math.max(0,total,minPrice),Number(last.rounding_step)||5);
};
function setAuth(on){$('login').hidden=on;$('app').hidden=!on;$('logout').hidden=!on;}
async function requireAuthorized(){const {data:{user},error}=await db.auth.getUser();if(error)throw error;if(!user)return false;const a=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();if(a.error)throw a.error;state.user=a.data?user:null;return Boolean(a.data)}
async function init(){if(!db){msg('Supabase config.js bağlantısı eksik.',true);return;}try{if(await requireAuthorized()){setAuth(true);await reload();}else setAuth(false);}catch(e){msg(e.message,true)}}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();if(!db)return;const b=e.currentTarget.querySelector('button');b.disabled=true;try{const r=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(r.error)throw r.error;if(!await requireAuthorized()){await db.auth.signOut();throw Error('Bu hesap yönetici değil.')}setAuth(true);msg('');await reload();}catch(x){msg(x.message,true)}finally{b.disabled=false}});
$('logout').addEventListener('click',async()=>{await db.auth.signOut();state.user=null;setAuth(false);msg('Çıkış yapıldı.');});
let snapshotReady=false, snapshotLoading=false;
let reloadQueue=Promise.resolve();
function reload(silent=false){
 const next=reloadQueue.then(()=>loadSnapshot(silent));
 reloadQueue=next.catch(()=>false);
 return next;
}
async function loadSnapshot(silent){
 if(!db||!state.user)return false;
 const snapshot={};
 snapshotLoading=true;
 try{
  const r=await Promise.all([
   db.from('cafe_tables').select('*').order('sort_order',{ascending:true}).order('created_at',{ascending:true}),
   db.from('cafe_table_rates').select('*'),
   db.from('cafe_sessions').select('*',{count:'exact'}).is('ended_at',null).order('started_at',{ascending:false}),
   db.from('cafe_sessions').select('*').not('ended_at','is',null).order('started_at',{ascending:false}).limit(250),
   db.from('cafe_charge_catalog').select('id,name,category,price,active,sort_order').order('sort_order',{ascending:true}).order('name',{ascending:true})
  ]);
  for(const x of r)if(x.error)throw x.error;
  snapshot.tables=r[0].data||[];snapshot.rates=r[1].data||[];snapshot.charges=r[4].data||[];
  const openSessions=completeRows(r[2]);
  const closedIds=new Set((r[3].data||[]).map(session=>session.id));
  snapshot.sessions=[...openSessions.filter(session=>!closedIds.has(session.id)),...(r[3].data||[])];
  const interesting=snapshot.sessions.filter(s=>!s.ended_at).concat(snapshot.sessions.filter(s=>s.ended_at).slice(0,15));
  const sessionIds=[...new Set(interesting.map(s=>s.id))];
  snapshot.links=[];snapshot.orders=[];snapshot.manualItems=[];snapshot.segments=[];snapshot.payments=[];snapshot.advances=[];snapshot.partials=[];
  const hidden=await db.from('cafe_report_hidden_v26').select('session_id').limit(1000);
  if(hidden.error)throw hidden.error;snapshot.hiddenReports=(hidden.data||[]).map(x=>x.session_id);
  const rev=await db.from('cafe_restore_events_v41').select('session_id,table_id,restored_at,closing_snapshot,payment_snapshot,advance_snapshot').order('restored_at',{ascending:false}).limit(50);
  if(rev.error)throw rev.error;snapshot.restoreEvents=rev.data||[];
  if(sessionIds.length){
   const sg=await db.from('cafe_session_segments').select('session_id,table_id,controllers,hourly_price,short_fee,rounding_step,started_at',{count:'exact'}).in('session_id',sessionIds).order('started_at',{ascending:true}).limit(1000);
   if(sg.error)throw sg.error;
   snapshot.segments=completeRows(sg);
   const advances=await db.from('cafe_session_advances_v26').select('session_id,amount,method,paid_at',{count:'exact'}).in('session_id',sessionIds);
   if(advances.error)throw advances.error;snapshot.advances=completeRows(advances);
   const partials=await db.from('cafe_partial_payments_v57').select('id,session_id,amount,method,paid_at',{count:'exact'}).in('session_id',sessionIds).limit(1000);
   if(partials.error)throw partials.error;snapshot.partials=completeRows(partials);
   const payments=await db.from('cafe_payments').select('session_id,gross_amount,discount_amount,cash_amount,card_amount,paid_at',{count:'exact'}).in('session_id',sessionIds).limit(1000);
   if(payments.error)throw payments.error;
   snapshot.payments=completeRows(payments);
   const manual=await db.from('cafe_manual_items').select('id,session_id,product_id,product_name,qty,unit_price,created_at,voided_at',{count:'exact'}).in('session_id',sessionIds).order('created_at',{ascending:true}).limit(1000);
   if(manual.error)throw manual.error;
   snapshot.manualItems=completeRows(manual);
   const links=await db.from('cafe_session_orders').select('session_id,order_id',{count:'exact'}).in('session_id',sessionIds).limit(1000);
   if(links.error)throw links.error;
   snapshot.links=completeRows(links);
   const orderIds=[...new Set(snapshot.links.map(l=>l.order_id))];
   // Supabase sorgusunu makul boyutta tut: her adisyonda en fazla 1000 baglanti.
   for(let i=0;i<orderIds.length;i+=100){
    const or=await db.from('orders')
     .select('id,loca_code,status,total,created_at,order_items(product_name,qty,unit_price)',{count:'exact'})
     .in('id',orderIds.slice(i,i+100));
    if(or.error)throw or.error;
    const orders=completeRows(or);
    if(orders.length!==orderIds.slice(i,i+100).length)throw Error('Bağlı QR siparişleri eksik.');
    snapshot.orders.push(...orders);
   }
  }
  Object.assign(state,snapshot);
  snapshotReady=true;
  snapshotLoading=false;
  render();if(!silent)msg('Masalar ve siparişler güncellendi.');
  return true;
 }catch(e){msg('Masa veya sipariş verisi alınamadı: '+e.message,true);return false}
 finally{snapshotLoading=false;}
}
function completeRows(result){
 if(result.error)throw result.error;
 if(!Array.isArray(result.data)||result.count!==result.data.length)throw Error('Hesap kayıtlarının tamamı alınamadı.');
 return result.data;
}
const advanceFor=id=>state.advances.find(x=>x.session_id===id);
const advanceAmount=id=>Number(advanceFor(id)?.amount||0);
const partialPayments=id=>state.partials.filter(p=>p.session_id===id);
const partialAmount=id=>fromCentsSafe(partialPayments(id).reduce((a,p)=>a+Number(p.amount||0),0));
const fromCentsSafe=n=>Math.round((Number(n)||0)*100)/100;
const upfrontAmount=id=>fromCentsSafe(advanceAmount(id)+partialAmount(id));
const isReportHidden=id=>state.hiddenReports.includes(id);
const manualForSession=id=>state.manualItems.filter(i=>i.session_id===id&&!i.voided_at);
const manualAmount=id=>manualForSession(id).reduce((a,i)=>a+Number(i.unit_price||0)*Number(i.qty||0),0);
const productAmount=id=>orderAmount(id)+manualAmount(id);
const manualDetails=(id,allowRemove=false)=>manualForSession(id).length?manualForSession(id).map(i=>`<div class="manual-row muted"><span>${Number(i.qty)} × ${esc(i.product_name)} · ${money(Number(i.qty)*Number(i.unit_price))}</span>${allowRemove?`<button class="secondary danger-small" type="button" data-void-item="${esc(i.id)}">Sil</button>`:''}</div>`).join(''):'<div class="muted">Elle eklenen ürün yok.</div>';
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
 $('cards').innerHTML=ts.length?ts.map(t=>{const s=active(t);return `<article class="card ${s?'card-open':'card-closed'}" style="--closed-color:${validTableColor(t.closed_color)}"><div class="cardtop"><h3>${esc(t.name)}</h3><span class="tag ${s?'busy':''}" id="tag-${t.id}">${s?'● DOLU':'● BOŞ'}</span></div><div class="line"></div>${s?`<div class="muted">${s.controllers} Kol · ${s.mode==='timed'?'Süreli':'Süresiz'} · ${money(s.hourly_price)}/saat</div><div class="minirow"><span>Geçen süre</span><strong class="time" data-timer="${s.id}">00:00:00</strong></div>${s.mode==='timed'?`<div class="minirow"><span>Kalan süre</span><strong data-left="${s.id}">—</strong></div>`:''}<div class="minirow"><span>Oyun ücreti</span><strong class="amount" data-amount="${s.id}"></strong></div><div class="minirow"><span>QR siparişleri</span><strong>${money(orderAmount(s.id))}</strong></div><div class="minirow"><span>Manuel adisyon</span><strong>${money(manualAmount(s.id))}</strong></div><div class="minirow due"><span>TOPLAM ADİSYON</span><strong data-total="${s.id}">${money(gameAmount(s)+productAmount(s.id))}</strong></div><details class="order-detail"><summary>🧾 Siparişler (${ordersForSession(s.id).length})</summary>${orderDetails(s.id)}<hr><b>Manuel eklenenler</b>${manualDetails(s.id,true)}</details><div class="actions"><button type="button" class="secondary" data-add-manual="${s.id}">+ Adisyon Ekle</button><button data-close-session="${s.id}">Hesabı Kapat</button><button class="secondary" data-manage-session="${s.id}">⚙️ Hesabı Düzenle</button><button class="secondary" data-edit-table="${t.id}">Ayarlar</button></div>`:`<div class="muted">Hesap açılmayı bekliyor</div><p class="muted">1–4 kol için ayrı saatlik ücret</p><div class="actions"><button data-open-table="${t.id}">Hesap Aç</button><button class="secondary" data-edit-table="${t.id}">Ayarlar</button></div>`}</article>`;}).join(''):'<p class="muted">Henüz aktif masa yok. “Masa Ekle” ile başlayın.</p>';
 document.querySelectorAll('[data-open-table]').forEach(b=>b.onclick=()=>openSessionDialog(b.dataset.openTable));document.querySelectorAll('[data-edit-table]').forEach(b=>b.onclick=()=>editTable(b.dataset.editTable));document.querySelectorAll('[data-add-manual]').forEach(b=>b.onclick=()=>openManualDialog(b.dataset.addManual));document.querySelectorAll('[data-close-session]').forEach(b=>b.onclick=()=>showReceipt(b.dataset.closeSession));
 document.querySelectorAll('[data-manage-session]').forEach(b=>b.onclick=()=>openManageSession(b.dataset.manageSession));
 document.querySelectorAll('[data-void-item]').forEach(b=>b.onclick=()=>voidManual(b.dataset.voidItem));
 // Son işlemler: Hesap açılışı ve kapanışı ayrı satırlar halinde, zaman sırasına göre.
 // Rapor düğmesi yalnızca kapanış işlemlerinde gösterilir.
 const lastEvents=state.sessions.filter(s=>!isReportHidden(s.id)).flatMap(s=>{
  const events=[{type:'open',at:s.started_at,session:s}];
  if(s.ended_at&&!isReportHidden(s.id))events.push({type:'close',at:s.ended_at,session:s});
  return events;
 }).concat(state.restoreEvents.map(r=>({type:'restore',at:r.restored_at,session:state.sessions.find(s=>s.id===r.session_id)||r.closing_snapshot,restore:r})))
   .filter(e=>Number.isFinite(Date.parse(e.at)))
   .sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,20);
 $('history').innerHTML=lastEvents.length?lastEvents.map(e=>{
  const s=e.session;
  const initial=state.segments.filter(z=>z.session_id===s.id)
   .sort((a,b)=>Date.parse(a.started_at)-Date.parse(b.started_at))[0];
  const name=esc(state.tables.find(t=>t.id===s.table_id)?.name||'Masa');
  const when=new Date(e.at).toLocaleString('tr-TR');
  if(e.type==='restore'){
   const former=e.restore.payment_snapshot;
   const advance=e.restore.advance_snapshot;
   const total=(Number(former?.cash_amount||0)+Number(former?.card_amount||0))+(former?0:Number(advance?.amount||0));
   return `<div class="historyrow recent-event recent-open"><div class="recent-info"><strong>↩ 🟢 ${name} — HESAP GERİ ALINDI</strong><div>Geri alma: ${when}</div><div>Ödeme kaydı iptal edildi: ${money(total)} · Hesap tekrar açık</div></div></div>`;
  }
  if(e.type==='open'){
   return `<div class="historyrow recent-event recent-open"><div class="recent-info"><strong>🟢 ${name} — HESAP AÇILDI</strong><div>Açılış: ${when}</div><div>🎮 ${Number(initial?.controllers||s.controllers)||1} kol ile açıldı</div></div></div>`;
  }
  const secs=Math.max(0,Math.floor((Date.parse(s.ended_at)-Date.parse(s.started_at))/1000));
  const total=Number(s.final_total_amount??(Number(s.final_game_amount||0)+Number(s.final_order_amount||0)));
  return `<div class="historyrow recent-event recent-close"><div class="recent-info"><strong>🔴 ${name} — HESAP KAPANDI</strong><div>Kapanış: ${when} · Süre: ${Math.ceil(secs/60)} dakika</div><div><b>TOPLAM: ${money(total)}</b></div></div><div class="history-actions"><button class="secondary" type="button" data-receipt-history="${esc(s.id)}">🧾 Rapor / Adisyon</button>${state.payments.some(p=>p.session_id===s.id)?`<span class="payment-ok">✓ Ödendi</span>`:`<button class="payment-history-btn" type="button" data-pay-history="${esc(s.id)}">💳 Ödeme Al</button>`}<button class="secondary restore-history-btn" type="button" data-restore-session="${esc(s.id)}">↩ Hesabı Geri Al</button></div></div>`;
 }).join(''):'<p class="muted">Henüz hesap açılışı veya kapanışı yok.</p>';
 document.querySelectorAll('[data-restore-session]').forEach(b=>b.onclick=()=>openRestoreDialog(b.dataset.restoreSession));document.querySelectorAll('[data-receipt-history]').forEach(b=>b.onclick=()=>showReceipt(b.dataset.receiptHistory));document.querySelectorAll('[data-pay-history]').forEach(b=>b.onclick=()=>openPayment(b.dataset.payHistory));renderDesktop();tick();}

// V38: yanlışlıkla kapatılan fakat ödeme kaydı olmayan hesabı güvenli aç.
let restoreId=null;
function openRestoreDialog(id){
 const s=state.sessions.find(x=>x.id===id&&x.ended_at);if(!s)return;
 restoreId=id;
 const t=state.tables.find(x=>x.id===s.table_id);
 $('restoreDetails').textContent=`${t?.name||'Masa'} · ${new Date(s.started_at).toLocaleString('tr-TR')} açıldı · ${new Date(s.ended_at).toLocaleString('tr-TR')} kapandı · ${money(s.final_total_amount||0)}`;
 $('restoreDialog').showModal();
}
$('restoreConfirm').addEventListener('click',async()=>{
 if(!restoreId)return;
 const btn=$('restoreConfirm');btn.disabled=true;
 try{
  const r=await db.rpc('cafe_restore_closed_v41',{p_session_id:restoreId});if(r.error)throw r.error;
  $('restoreDialog').close();restoreId=null;await reload();msg('Hesap geri alındı. Rapor ve aktif ödeme kaydı kaldırıldı; Son İşlemler güncellendi. Gerçek nakit/POS iadesini ayrıca yapmalısın.');
 }catch(e){msg('Hesap geri alınamadı: '+e.message,true);alert('Hesap geri alınamadı: '+e.message)}finally{btn.disabled=false}
});
// V30: kompakt masa planı, seçilen masanın bütün işlemleri sol detay panelinde.
const tableDeviceArt={
 lounge:'<svg viewBox="0 0 72 52" aria-hidden="true"><rect x="9" y="15" width="54" height="27" rx="8" fill="#8f3049" stroke="#ff819d" stroke-width="2"/><rect x="14" y="23" width="44" height="18" rx="6" fill="#bb4562"/><path d="M10 30H5v13h62V30h-5" fill="#6b2339" stroke="#ff819d" stroke-width="2"/><path d="M18 45v4m36-4v4" stroke="#f6d2d9" stroke-width="4" stroke-linecap="round"/><path d="M32 5h8v7h-8z" fill="#eeeeff"/><path d="M29 10h14" stroke="#eeeeff" stroke-width="2"/></svg>',

 playstation:'<svg viewBox="0 0 72 52" aria-hidden="true"><path d="M22 16h28c7 0 12 5 14 13l4 12c2 10-8 14-14 8l-9-8H27l-9 8C12 55 2 51 4 41l4-12c2-8 7-13 14-13Z" fill="#eee" stroke="#a7a7b6" stroke-width="2"/><path d="M19 27v12m-6-6h12" stroke="#303344" stroke-width="4" stroke-linecap="round"/><circle cx="48" cy="29" r="3.5" fill="#ff4655"/><circle cx="56" cy="35" r="3.5" fill="#4baaf1"/><circle cx="37" cy="33" r="4" fill="#b7b9c6"/></svg>',
 computer:'<svg viewBox="0 0 72 52" aria-hidden="true"><rect x="7" y="6" width="58" height="35" rx="4" fill="#dce8f5" stroke="#7696b5" stroke-width="2"/><rect x="12" y="11" width="48" height="25" rx="1" fill="#1e5d87"/><path d="M36 41v6M22 48h28" stroke="#c8d1dc" stroke-width="4" stroke-linecap="round"/></svg>',
 billiards:'<svg viewBox="0 0 72 52" aria-hidden="true"><rect x="5" y="6" width="62" height="40" rx="5" fill="#653c1c"/><rect x="10" y="11" width="52" height="30" rx="3" fill="#138a5c"/><g fill="#131619"><circle cx="11" cy="12" r="4"/><circle cx="61" cy="12" r="4"/><circle cx="11" cy="40" r="4"/><circle cx="61" cy="40" r="4"/></g><circle cx="26" cy="24" r="4" fill="#fafafa"/><circle cx="43" cy="31" r="4" fill="#f4d75a"/><circle cx="48" cy="20" r="4" fill="#fff"/></svg>'
};
function selectDeskTable(id){
 const t=state.tables.find(x=>x.id===id&&x.active);if(!t)return;
 selectedTableId=id;
 const panel=$('selectedTablePanel');panel.replaceChildren();
 const heading=document.createElement('div');heading.className='selected-heading';heading.textContent='MASA · '+t.name;panel.append(heading);
 const s=active(t);
 const box=document.createElement('div');box.className='side-summary';
 if(!s){
  box.innerHTML='<div class="side-empty">Bu masada açık hesap bulunmuyor.</div><button class="side-primary" type="button" id="sideOpenAccount">▶ Hesap Aç</button>';
  panel.append(box);$('sideOpenAccount').onclick=()=>openSessionDialog(t.id);
 }else{
  const date=new Date(s.started_at),local=new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
  const end=new Date(date.getTime()+Number(s.planned_seconds||0)*1000);
  const endLocal=new Intl.DateTimeFormat('tr-TR',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}).format(end);
  box.innerHTML=`
  <div class="side-label">🕓 Açılış tarihi ve saati
   <input id="sideStartDate" type="date" value="${local.slice(0,10)}" aria-label="Açılış tarihi" style="width:100%;box-sizing:border-box;margin-top:6px">
   <div style="display:flex;align-items:center;gap:6px;margin-top:7px">
    <select id="sideStartHour" aria-label="Açılış saati" style="flex:1;min-width:0">${Array.from({length:24},(_,h)=>{const v=String(h).padStart(2,'0');return `<option value="${v}" ${h===date.getHours()?'selected':''}>${v}</option>`}).join('')}</select>
    <span aria-hidden="true" style="font-weight:700">:</span>
    <select id="sideStartMinute" aria-label="Açılış dakikası" style="flex:1;min-width:0">${Array.from({length:60},(_,m)=>{const v=String(m).padStart(2,'0');return `<option value="${v}" ${m===date.getMinutes()?'selected':''}>${v}</option>`}).join('')}</select>
   </div>
   <button id="sideSaveStart" type="button" class="secondary" style="width:100%;margin-top:7px">🕓 Saati Kaydet</button>
  </div>
  ${s.mode==='timed'?`<div class="side-line"><span>🕔 Bitiş saati</span><strong>${esc(endLocal)}</strong></div><div class="side-line"><span>⏳ Kalan süre</span><strong class="side-remain" data-left="${s.id}">—</strong></div>`:''}
  <label class="side-label">🎮 Kol sayısı
   <select id="sideControllers">${[1,2,3,4].map(n=>`<option value="${n}" ${n===Number(s.controllers)?'selected':''}>${n} Kol · ${esc(money(rate(t.id,n)))}/saat</option>`).join('')}</select>
  </label>
  <div class="side-line"><span>⏱ Geçen süre</span><strong data-timer="${s.id}">—</strong></div>
  <div class="side-line"><span>🎮 Oyun ücreti</span><strong data-amount="${s.id}">${esc(money(gameAmount(s)))}</strong></div>
  <div class="side-line"><span>🧾 QR + Adisyon</span><strong>${esc(money(productAmount(s.id)))}</strong></div>
  <div class="side-line"><span>💰 Kısmi tahsilat</span><strong>${esc(money(partialAmount(s.id)))}</strong></div>
  <div class="side-line side-total"><span>💰 Toplam ücret</span><strong data-total="${s.id}">${esc(money(gameAmount(s)+productAmount(s.id)))}</strong></div>
  <button class="side-manual" id="sideManual" type="button">＋ Adisyon Ekle</button>
  <button class="side-primary" id="sideClose" type="button">💳 Hesap Kes</button>`;
  panel.append(box);
  $('sideManual').onclick=()=>openManualDialog(t.id);
  $('sideClose').onclick=()=>showReceipt(s.id);
  $('sideSaveStart').addEventListener('click',async()=>{
   const dateValue=$('sideStartDate').value;
   const hour=$('sideStartHour').value,minute=$('sideStartMinute').value;
   const value=`${dateValue}T${hour}:${minute}:00`;
   const proposed=new Date(value);
   // Tarih eksik, takvim dışı ya da ileri bir zamansa veritabanına gönderme.
   if(!dateValue||!Number.isFinite(proposed.getTime())||
      proposed.getFullYear()!==Number(dateValue.slice(0,4))||
      proposed.getMonth()+1!==Number(dateValue.slice(5,7))||
      proposed.getDate()!==Number(dateValue.slice(8,10))||
      proposed.getHours()!==Number(hour)||proposed.getMinutes()!==Number(minute)){
    msg('Geçerli bir açılış tarihi ve saati seç.',true);return;
   }
   if(proposed.getTime()>Date.now()) {msg('Açılış saati gelecekte olamaz.',true);return;}
   const currentMinute=Math.floor(date.getTime()/60000);
   if(Math.floor(proposed.getTime()/60000)===currentMinute){msg('Açılış saati zaten bu değer.',false);return;}
   if(!confirm('Açılış tarihi ve saati '+dateValue+' '+hour+':'+minute+' olarak güncellensin mi?'))return;
   const controls=[$('sideStartDate'),$('sideStartHour'),$('sideStartMinute'),$('sideSaveStart')];
   controls.forEach(el=>el.disabled=true);
   try{
    const r=await db.rpc('cafe_change_start_v10',{p_session_id:s.id,p_started_at:proposed.toISOString()});
    if(r.error)throw r.error;
    await reload();
    msg('Açılış saati değiştirildi.');
   }catch(err){controls.forEach(el=>el.disabled=false);msg('Açılış saati değiştirilemedi: '+err.message,true);}
  });
  $('sideControllers').addEventListener('change',async e=>{
   const select=e.currentTarget,n=Number(select.value),hour=rate(t.id,n);
   if(hour<=0){msg(n+' kol için saatlik fiyat ayarlanmamış.',true);select.value=String(s.controllers);return;}
   if(!confirm(n+' kola geçilsin mi? Önceki oyun süresi eski tarifeden, bundan sonraki süre '+money(hour)+'/saat üzerinden hesaplanır.')){select.value=String(s.controllers);return;}
   select.disabled=true;
   try{const r=await db.rpc('cafe_change_controllers_v38',{p_session_id:s.id,p_controllers:n});if(r.error)throw r.error;await reload();msg('Kol tarifesi '+n+' kol olarak güncellendi.');}
   catch(err){select.disabled=false;select.value=String(s.controllers);msg('Kol değiştirilemedi: '+err.message,true);}
  });
 }
 document.querySelectorAll('.desk-tile').forEach(el=>{const on=el.dataset.tableId===id;el.classList.toggle('is-selected',on);el.setAttribute('aria-pressed',String(on));});
 tick();
}
const desktopFullCards=new Map();
function updateDesktopTimers(){
 for(const t of state.tables.filter(t=>t.active)){
  const s=active(t),timer=document.querySelector(`[data-tile-time="${t.id}"]`);
  if(!timer)continue;
  if(!s){timer.textContent='BOŞ';continue;}
  const seconds=elapsed(s);
  if(s.mode==='timed'){
   const left=Number(s.planned_seconds||0)-seconds;
   timer.textContent=left>0?fmtTime(left):'SÜRE DOLDU';
   timer.classList.toggle('expired',left<=0);
  }else{timer.textContent=fmtTime(seconds);timer.classList.remove('expired');}
 }
}
function renderOrdersDesk(){
 const list=$('ordersDeskList');
 const orders=state.orders.slice().sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,75);
 list.innerHTML=orders.length?orders.map(o=>{
  const link=state.links.find(l=>l.order_id===o.id);
  const sess=state.sessions.find(s=>s.id===link?.session_id);
  const t=state.tables.find(t=>t.id===sess?.table_id);
  return `<article class="desk-order-row"><div><strong>${esc(t?.name||o.loca_code||'Masa')}</strong><div class="muted">${new Date(o.created_at).toLocaleString('tr-TR')} · ${esc(o.status||'')}</div><div>${(o.order_items||[]).map(i=>`${Number(i.qty)||0} × ${esc(i.product_name)}`).join(' · ')}</div></div><div><strong>${money(o.total)}</strong>${t?`<button type="button" class="secondary" data-desk-select="${t.id}">Masayı Aç</button>`:''}</div></article>`;
 }).join(''):'<p class="muted">Açık masa hesaplarına bağlı QR siparişi bulunamadı. Tüm siparişler Yönetici Paneli → Siparişler bölümündedir.</p>';
 list.querySelectorAll('[data-desk-select]').forEach(b=>b.addEventListener('click',()=>{setDeskTab('tables');selectDeskTable(b.dataset.deskSelect)}));
}
// V32: Masalar, Siparişler ve Raporlar birbirinden tamamen ayrı görünümlerdir.
// Böylece Siparişler sayfasında raporlar ve Son İşlemler görünmez.
function setDeskTab(tab){
 if(!['tables','orders','reports'].includes(tab))tab='tables';
 currentDeskTab=tab;
 $('tableWorkspace').hidden=tab!=='tables';
 $('ordersDeskView').hidden=tab!=='orders';
 $('reportsView').hidden=tab!=='reports';
 document.querySelector('.stats').hidden=tab!=='tables';
 $('recentHistory').hidden=tab!=='tables';
 $('tabTables').classList.toggle('active',tab==='tables');
 $('tabOrders').classList.toggle('active',tab==='orders');
 $('showReports').classList.toggle('active',tab==='reports');
 if(tab==='orders')renderOrdersDesk();
}
$('tabTables').addEventListener('click',()=>setDeskTab('tables'));
$('tabOrders').addEventListener('click',()=>setDeskTab('orders'));
function renderDesktop(){
 const grid=$('cards'),cards=[...grid.querySelectorAll(':scope > article.card')];
 desktopFullCards.clear();
 const ts=state.tables.filter(t=>t.active);
 const fragment=document.createDocumentFragment();
 for(let i=0;i<ts.length;i++){
  const t=ts[i],s=active(t),full=cards[i];
  if(full)desktopFullCards.set(t.id,full);
  const tile=document.createElement('button');tile.type='button';tile.className='desk-tile '+(s?'desk-busy':'desk-free');
  tile.dataset.tableId=t.id;tile.classList.toggle('bulk-selected',bulkSelected.has(t.id));tile.style.setProperty('--closed-color',validTableColor(t.closed_color));
  tile.setAttribute('aria-label',t.name+' · '+(s?'Dolu':'Boş')+' · bilgileri aç');
  const kind=['lounge','playstation','computer','billiards'].includes(t.device_type)?t.device_type:'playstation';
  // Sadece süreli açık hesaplar: açılışta ödeme alınmışsa yeşil, alınmamışsa kırmızı nokta.
  // Bu gösterge nakit/kart tahsilat kaydını değiştirmez.
  const paidMarker=s&&s.mode==='timed'
   ? `<span class="desk-prepaid-dot ${advanceFor(s.id)?'paid':'unpaid'}" title="${advanceFor(s.id)?'Süreli hesap: açılış ücreti alındı':'Süreli hesap: açılış ücreti alınmadı'}" aria-label="${advanceFor(s.id)?'Açılış ücreti alındı':'Açılış ücreti alınmadı'}"></span>`
   : '';
  tile.dataset.deviceKind=kind;
  tile.innerHTML=`<span class="desk-tile-status">${s?'● DOLU':'● BOŞ'}</span>${paidMarker}<span class="desk-tile-clock" data-tile-time="${esc(t.id)}">${s?'—':'BOŞ'}</span><span class="desk-tile-art">${tableDeviceArt[kind]}</span><span class="desk-tile-name">${esc(t.name)}</span>`;
  // Tek tık: masayı sol panelde seç. Çift tık: boşsa hesap aç, doluysa ödeme ekranı.
  tile.addEventListener('click',e=>{
   if(bulkSuppressClick){e.preventDefault();return;}
   if(e.ctrlKey||e.metaKey||e.shiftKey){e.preventDefault();if(bulkSelected.has(t.id))bulkSelected.delete(t.id);else bulkSelected.add(t.id);updateBulkSelection();return;}
   if(window.betaMultiSelectMode){e.preventDefault();if(bulkSelected.has(t.id))bulkSelected.delete(t.id);else bulkSelected.add(t.id);updateBulkSelection();return;}
   if(bulkSelected.size){bulkSelected.clear();updateBulkSelection();}
   selectDeskTable(t.id);
  });
  tile.addEventListener('dblclick',async (event)=>{
   event.preventDefault();
   if(bulkSelected.size||bulkSuppressClick)return;
   selectDeskTable(t.id);
   // Açık bir modalın üstüne başka bir modal açılmasını önle.
   if(document.querySelector('dialog[open]'))return;
   const liveTable=state.tables.find(x=>x.id===t.id);
   if(!liveTable)return;
   const liveSession=active(liveTable);
   if(liveSession){
    if(tile.dataset.openingPayment==='true')return;
    tile.dataset.openingPayment='true';
    try{await showReceipt(liveSession.id)}
    finally{tile.dataset.openingPayment='false'}
   }else{openSessionDialog(t.id)}
  });
  tile.title='Tek tık: masayı seç · Çift tık: '+(s?'hesabı kapat / ödeme':'hesap aç');
  tile.addEventListener('contextmenu',e=>{e.preventDefault();selectDeskTable(t.id);showTableContext(t.id,e.clientX,e.clientY)});
  tile.addEventListener('pointerdown',e=>beginTilePlacement(e,tile));
  applyGridPlacement(tile,t.id,i);
  fragment.append(tile);
 }
 grid.replaceChildren(fragment);
 updateBulkSelection();
 if(!ts.length){$('selectedTablePanel').textContent='Henüz masa bulunamadı.';return;}
 if(!ts.some(t=>t.id===selectedTableId))selectedTableId=ts[0].id;
 selectDeskTable(selectedTableId);
 renderOrdersDesk();
 setDeskTab(currentDeskTab);
}

// V34: Windows benzeri çoklu seçim ve toplu oyun hesapları.
function updateBulkSelection(){
 const ids=new Set(state.tables.filter(t=>t.active).map(t=>t.id));
 for(const id of [...bulkSelected])if(!ids.has(id))bulkSelected.delete(id);
 document.querySelectorAll('#cards .desk-tile').forEach(el=>el.classList.toggle('bulk-selected',bulkSelected.has(el.dataset.tableId)));
 const selected=state.tables.filter(t=>bulkSelected.has(t.id));
 const free=selected.filter(t=>!active(t)).length,busy=selected.length-free;
 $('bulkCount').textContent=`${selected.length} masa seçildi · ${free} boş · ${busy} açık`;
 $('bulkOpen').disabled=!free||bulkWorking;
 $('bulkClose').disabled=!busy||bulkWorking;
}
$('bulkClear').onclick=()=>{bulkSelected.clear();updateBulkSelection()};
// Boş alandan sürükleme veya ikonların üzerinden fareyle seçim dikdörtgeni.
(function initMarquee(){
 const grid=$('cards');let origin=null,frame=null,oldSelected=null;
 grid.addEventListener('pointerdown',e=>{
  if(e.button!==0||e.pointerType==='touch'||document.querySelector('dialog[open]'))return;
  // Ctrl+tık tekil seçim için mevcut davranışı bırak.
  if(e.ctrlKey||e.metaKey)return;
  if(layoutEditMode)return;
  origin={x:e.clientX,y:e.clientY,id:e.pointerId};oldSelected=new Set(e.shiftKey?bulkSelected:[]);
 });
 window.addEventListener('pointermove',e=>{
  if(!origin||e.pointerId!==origin.id)return;
  if(!frame&&Math.hypot(e.clientX-origin.x,e.clientY-origin.y)<9)return;
  if(!frame){frame=document.createElement('div');frame.className='bulk-marquee';document.body.append(frame);document.body.classList.add('bulk-dragging');}
  const x=Math.min(origin.x,e.clientX),y=Math.min(origin.y,e.clientY),w=Math.abs(e.clientX-origin.x),h=Math.abs(e.clientY-origin.y);
  Object.assign(frame.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});
  bulkSelected.clear();for(const id of oldSelected)bulkSelected.add(id);
  const r={left:x,right:x+w,top:y,bottom:y+h};
  for(const el of grid.querySelectorAll('.desk-tile')){const b=el.getBoundingClientRect();if(b.left<r.right&&b.right>r.left&&b.top<r.bottom&&b.bottom>r.top)bulkSelected.add(el.dataset.tableId)}
  updateBulkSelection();
 });
 const end=()=>{if(frame){frame.remove();frame=null;bulkSuppressClick=true;setTimeout(()=>bulkSuppressClick=false,120);}
  origin=null;document.body.classList.remove('bulk-dragging');};
 window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);
})();
window.betaMultiSelectMode=false;
$('bulkSelectMode').addEventListener('click',()=>{
 window.betaMultiSelectMode=!window.betaMultiSelectMode;
 const b=$('bulkSelectMode');b.setAttribute('aria-pressed',String(window.betaMultiSelectMode));
 b.textContent=window.betaMultiSelectMode?'✓ Çoklu Seçim: Açık':'▧ Çoklu Seçim: Kapalı';
 b.classList.toggle('active',window.betaMultiSelectMode);
 if(!window.betaMultiSelectMode){bulkSelected.clear();updateBulkSelection();}
 msg(window.betaMultiSelectMode?'Masaların üzerine tıklayarak veya fareyle dikdörtgen çizerek çoklu seçim yapabilirsin.':'Çoklu seçim kapatıldı.');
});
const bulkSelectedTables=()=>state.tables.filter(t=>bulkSelected.has(t.id));
const bulkRowSession=id=>state.sessions.find(s=>s.table_id===id&&!s.ended_at);
function renderBulkOpen(){
 const tables=bulkSelectedTables().filter(t=>!active(t));
 $('bulkRows').innerHTML=tables.map(t=>`<tr data-bulk-id="${esc(t.id)}"><th scope="row">${esc(t.name)}</th><td><select data-bulk-field="controllers" aria-label="${esc(t.name)} kol sayısı">${[1,2,3,4].map(i=>`<option value="${i}">${i} kol · ${money(rate(t.id,i))}/saat</option>`).join('')}</select></td><td><select data-bulk-field="mode"><option value="timed" selected>Süreli</option><option value="unlimited">Süresiz</option></select></td><td><select data-bulk-field="entryType"><option value="minutes">Dakika</option><option value="amount">Fiyat (₺)</option></select></td><td><input data-bulk-field="entryValue" type="number" min="0.01" step="any" placeholder="Dakika / ₺" value="60"></td><td><label class="bulk-paid"><input data-bulk-field="paid" type="checkbox"> Peşin alındı</label><select data-bulk-field="payMethod" disabled><option value="card">Kart</option><option value="cash">Nakit</option></select></td></tr>`).join('');
 $('bulkRows').querySelectorAll('tr').forEach(tr=>{
  const mode=tr.querySelector('[data-bulk-field=mode]');const paid=tr.querySelector('[data-bulk-field=paid]');
  const update=()=>{const timed=mode.value==='timed';for(const key of ['entryType','entryValue','paid'])tr.querySelector(`[data-bulk-field=${key}]`).disabled=!timed;tr.querySelector('[data-bulk-field=payMethod]').disabled=!timed||!paid.checked};
  mode.addEventListener('change',update);paid.addEventListener('change',update);
 });
 $('bulkFooter').innerHTML='';
}
function renderBulkClose(){
 const tables=bulkSelectedTables().filter(t=>active(t));let gross=0,advance=0;
 $('bulkRows').innerHTML=tables.map(t=>{const s=active(t),r=receiptData(s),upfront=upfrontAmount(s.id),balance=Math.max(0,r.total-upfront);gross+=r.total;advance+=upfront;
  return `<tr data-bulk-id="${esc(t.id)}"><th scope="row">${esc(t.name)}</th><td>${Number(s.controllers)} kol</td><td>${fmtTime(r.seconds)}</td><td>${money(r.game)}</td><td>${money(r.orders)}</td><td>${money(upfront)}</td><td><strong>${money(balance)}</strong><details><summary>Alınan ürünler</summary>${r.items.length?r.items.map(i=>`<div>${esc(i.name)} · ${Number(i.qty)} × ${money(i.price)}</div>`).join(''):'Ürün yok'}</details></td></tr>`}).join('');
 $('bulkFooter').innerHTML=`<tr><th colspan="5">GENEL TOPLAM <strong>${money(gross)}</strong></th><th>Ön ödeme ${money(advance)}</th><th>TAHSİL EDİLECEK <strong>${money(Math.max(0,gross-advance))}</strong></th></tr>`;
}
function showBulk(mode){
 if(document.querySelector('dialog[open]'))return;
 bulkMode=mode;
 const n=bulkSelectedTables().filter(t=>mode==='open'?!active(t):!!active(t)).length;
 if(!n)return;
 $('bulkTitle').textContent=mode==='open'?`🎮 ${n} Masaya Toplu Hesap Aç`:`💳 ${n} Masanın Hesabını Kapat`;
 $('bulkHelp').textContent=mode==='open'?'Her masa için ayrı kol sayısı, süreli/süresiz ve dakika ya da fiyat belirle. Tek ekrandan başlat.':'Her masanın oyun ve ürün tutarı ayrı listelenir. Kapanışta kesin tutar sunucuda yeniden hesaplanır; ödeme seçilen yöntemle ayrı ayrı kaydedilir.';
 $('bulkPaymentRow').hidden=mode!=='close';
 $('bulkThead').innerHTML=mode==='open'?'<tr><th>Masa</th><th>Kol</th><th>Hesap türü</th><th>Giriş</th><th>Değer</th><th>Ön ödeme</th></tr>':'<tr><th>Masa</th><th>Kol</th><th>Süre</th><th>Oyun</th><th>Adisyon</th><th>Ön ödeme</th><th>Kalan / Detay</th></tr>';
 $('bulkResult').textContent='';$('bulkSubmit').disabled=false;
 $('bulkSubmit').textContent=mode==='open'?'Seçilen Masaları Aç':'Seçilen Hesapları Kapat ve Kaydet';
 if(mode==='open')renderBulkOpen();else renderBulkClose();
 $('bulkDialog').showModal();
}
$('bulkOpen').onclick=()=>showBulk('open');$('bulkClose').onclick=()=>showBulk('close');
function closeBulkDialog(){if(!bulkWorking)$('bulkDialog').close()}
$('bulkCancel').onclick=closeBulkDialog;$('bulkX').onclick=closeBulkDialog;
$('bulkDialog').addEventListener('cancel',e=>{if(bulkWorking)e.preventDefault()});
async function runBulkOpen(){
 const rows=[...$('bulkRows').querySelectorAll('tr[data-bulk-id]')].map(tr=>{
  const v=key=>tr.querySelector(`[data-bulk-field=${key}]`);
  return {id:tr.dataset.bulkId,name:state.tables.find(t=>t.id===tr.dataset.bulkId)?.name||'Masa',controllers:Number(v('controllers').value),mode:v('mode').value,entryType:v('entryType').value,value:Number(v('entryValue').value),paid:v('paid').checked,payment:v('payMethod').value};
 });
 for(const x of rows){
  if(rate(x.id,x.controllers)<=0)throw Error(x.name+': Seçili kolun saatlik fiyatını önce Ayarlar bölümünden belirle.');
  if(x.mode==='timed'&&(!Number.isFinite(x.value)||x.value<=0))throw Error(x.name+': Geçerli dakika veya tutar gir.');
 }
 if(!confirm(`${rows.length} farklı masada hesap açılacak. Onaylıyor musun?`))return;
 let successes=[];const failures=[];
 for(const x of rows){
  try{
   const r=await db.rpc('cafe_open_session',{p_table_id:x.id,p_controllers:x.controllers,p_mode:x.mode,p_entry_type:x.mode==='timed'?x.entryType:null,p_entry_value:x.mode==='timed'?x.value:null});
   if(r.error)throw r.error;
   let note='';
   if(x.paid&&x.mode==='timed'){
    const a=await db.rpc('cafe_mark_advance_v26',{p_session_id:r.data,p_method:x.payment});
    if(a.error)note=' (HESAP AÇILDI ancak ön ödeme kaydı başarısız: '+a.error.message+')';
   }
   successes.push(x.name+note);bulkSelected.delete(x.id);
  }catch(e){failures.push(x.name+': '+e.message)}
  $('bulkResult').textContent=`${successes.length} açıldı · ${failures.length} hata · ${successes.length+failures.length}/${rows.length} tamamlandı`;
 }
 await reload(true);
 return {successes,failures};
}
function askBulkCloseConfirmation(tables,estimate,method){
 const dlg=$('bulkConfirmDialog');
 $('bulkConfirmText').textContent=`${tables.length} masanın hesabı kapatılacak. Ödeme yöntemi: ${method==='card'?'KART':'NAKİT'}.`;
 const rows=tables.map(t=>{
  const s=active(t);if(!s)return '';
  const r=receiptData(s),paid=upfrontAmount(s.id);
  return `<div class="bulk-confirm-item"><span>${esc(t.name)}</span><span>${money(Math.max(0,r.total-paid))}</span></div>`;
 }).join('');
 $('bulkConfirmList').innerHTML=rows+`<div class="bulk-confirm-sum"><strong>TAHSİL EDİLECEK (TAHMİNİ)</strong><strong>${money(estimate)}</strong></div>`;
 return new Promise(resolve=>{
  let answer=false;
  const yes=$('bulkConfirmYes'),no=$('bulkConfirmCancel');
  const accept=()=>{answer=true;dlg.close()};
  const reject=()=>{answer=false;dlg.close()};
  const finish=()=>{yes.removeEventListener('click',accept);no.removeEventListener('click',reject);dlg.removeEventListener('close',finish);resolve(answer)};
  yes.addEventListener('click',accept);no.addEventListener('click',reject);dlg.addEventListener('close',finish);
  dlg.showModal();
 });
}
async function runBulkClose(){
 const tables=bulkSelectedTables().filter(t=>active(t));
 const method=$('bulkPaymentMethod').value;
 const estimate=tables.reduce((sum,t)=>{const s=active(t);return sum+Math.max(0,receiptData(s).total-upfrontAmount(s.id))},0);
 // İkinci, büyük onay penceresi: burada onaylanmadan hiçbir hesabı kapatma.
 const approved=await askBulkCloseConfirmation(tables,estimate,method);
 if(!approved)return;
 const successes=[],failures=[];
 for(const t of tables){
  const s=active(t);if(!s)continue;
  try{
   const close=await db.rpc('cafe_close_session',{p_session_id:s.id});
   if(close.error)throw close.error;
   // Kapanıştan sonra kesin ücreti yeniden oku; önizlemeden ödeme alma.
   const fresh=await db.from('cafe_sessions').select('id,ended_at,final_total_amount,final_game_amount,final_order_amount').eq('id',s.id).single();
   if(fresh.error)throw fresh.error;
   if(!fresh.data?.ended_at)throw Error('Kapanış kaydı doğrulanamadı');
   const total=Number(fresh.data.final_total_amount??(Number(fresh.data.final_game_amount||0)+Number(fresh.data.final_order_amount||0)));
   if(!Number.isFinite(total)||total<0)throw Error('Kesin hesap tutarı geçersiz');
   const due=fromCents(cents(total)-cents(upfrontAmount(s.id)));if(due<0)throw Error('Önceden alınan para kesin hesap tutarını aşıyor; manuel kontrol gerekli.');
   // Yeniden denemede aynı oturuma iki ödeme yazılmaması sunucu RPC kontrolüne dayanır.
   const payment=await db.rpc('cafe_record_payment_v26',{p_session_id:s.id,p_discount_amount:0,p_cash_amount:method==='cash'?due:0,p_card_amount:method==='card'?due:0});
   if(payment.error)throw Error('Hesap KAPANDI, ÖDEME kaydedilemedi: '+payment.error.message);
   successes.push(`${t.name}: ${money(total)} (ön ödeme ${money(advanceAmount(s.id))}, ${method==='card'?'kart':'nakit'} ${money(due)})`);
   bulkSelected.delete(t.id);
  }catch(e){failures.push(t.name+': '+e.message)}
  $('bulkResult').textContent=`${successes.length} kapandı/ödendi · ${failures.length} hata · ${successes.length+failures.length}/${tables.length} işlendi`;
 }
 await reload(true);return {successes,failures};
}
$('bulkSubmit').addEventListener('click',async()=>{
 if(bulkWorking)return;bulkWorking=true;
 const btn=$('bulkSubmit');btn.disabled=true;$('bulkCancel').disabled=true;$('bulkX').disabled=true;
 try{
  const r=bulkMode==='open'?await runBulkOpen():await runBulkClose();
  if(!r)return;
  $('bulkResult').innerHTML=`<strong>${r.successes.length} başarılı · ${r.failures.length} hata</strong><div>${r.successes.map(x=>`<p class="bulk-ok">✓ ${esc(x)}</p>`).join('')}${r.failures.map(x=>`<p class="bulk-error">✕ ${esc(x)}</p>`).join('')}</div>`;
  btn.hidden=true;msg(r.failures.length?'Bazı toplu işlemler başarısız oldu. Ayrıntılar pencerede.':'Toplu işlem tamamlandı.',!!r.failures);
 }catch(e){$('bulkResult').textContent=e.message;msg(e.message,true)}
 finally{bulkWorking=false;btn.disabled=false;$('bulkCancel').disabled=false;$('bulkX').disabled=false}
});
$('bulkDialog').addEventListener('close',()=>{$('bulkSubmit').hidden=false;bulkMode=null;updateBulkSelection()});
function updateOutstanding(){
 if(!snapshotReady||snapshotLoading)return;
 const live=state.sessions.filter(session=>!session.ended_at);
 const due=live.reduce((sum,session)=>sum+Math.max(
  0,gameAmount(session)+productAmount(session.id)-upfrontAmount(session.id)
 ),0);
 const display=money(due);
 const amount=$('outstandingAmount');
 if(amount.textContent!==display)amount.textContent=display;
 const label=live.length+' açık hesap · anlık tahmin (5 TL dilimi)';
 const count=$('outstandingCount');
 if(count.textContent!==label)count.textContent=label;
}
function tick(){if($('app').hidden)return;updateOutstanding();for(const s of state.sessions.filter(s=>!s.ended_at)){const e=elapsed(s),a=document.querySelector(`[data-timer="${s.id}"]`),b=document.querySelector(`[data-left="${s.id}"]`),c=document.querySelector(`[data-amount="${s.id}"]`),t=$(`tag-${s.table_id}`);if(a)a.textContent=fmtTime(e);if(b){const left=s.planned_seconds-e;b.textContent=left>0?fmtTime(left):'SÜRE DOLDU · +'+fmtTime(-left);b.style.color=left<=0?'#ff6369':'';if(t){t.classList.toggle('expired',left<=0);t.textContent=left<=0?'⏰ SÜRE DOLDU':'● DOLU'}}if(c)c.textContent=money(gameAmount(s));const total=document.querySelector(`[data-total="${s.id}"]`);if(total)total.textContent=money(gameAmount(s)+productAmount(s.id));}updateDesktopTimers();}
$('refresh').onclick=()=>reload();setInterval(()=>{if(!$('app').hidden)tick()},1000);setInterval(()=>{if(!$('app').hidden&&!bulkWorking)reload(true)},15000);
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('newTable').onclick=()=>{$('tableForm').reset();$('tableSort').value=state.tables.length?Math.max(...state.tables.map(t=>Number(t.sort_order)||0))+1:1;$('tableId').value='';$('tableColor').value='#84232b';$('tableDevice').value='playstation';for(let i=1;i<=4;i++){$('short'+i).value=0;$('round'+i).value=5;}$('tableTitle').textContent='Yeni Masa Ekle';$('tableDialog').showModal()};
function editTable(id){const t=state.tables.find(x=>x.id===id);if(!t)return;$('tableId').value=id;$('tableName').value=t.name;$('tableSort').value=Number(t.sort_order)||0;$('tableColor').value=validTableColor(t.closed_color);$('tableDevice').value=t.device_type||'playstation';for(let i=1;i<=4;i++){const tr=tariff(id,i);$('rate'+i).value=rate(id,i);$('short'+i).value=Number(tr.short_fee||0);$('round'+i).value=Number(tr.rounding_step||5);}$('tableTitle').textContent='Masa ve Fiyatları';$('tableDialog').showModal();}
$('tableForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.currentTarget.querySelector('[type=submit]');b.disabled=true;try{const name=$('tableName').value.trim(),prices=[1,2,3,4].map(i=>Number($('rate'+i).value));if(!name||prices.some(v=>!Number.isFinite(v)||v<0))throw Error('İsim ve fiyatlar geçerli olmalı');const r=await db.rpc('cafe_save_table',{p_id:$('tableId').value||null,p_name:name,p_prices:prices});if(r.error)throw r.error;
 const sort=Number($('tableSort').value);
 if(!Number.isInteger(sort)||sort<0||sort>999999)throw Error('Masa sırası 0–999999 arasında tam sayı olmalı.');
 const orderSave=await db.rpc('cafe_set_table_order',{p_table_id:r.data,p_sort_order:sort});
 if(orderSave.error)throw orderSave.error;
 const colorSave=await db.rpc('cafe_set_table_color',{p_table_id:r.data,p_closed_color:$('tableColor').value});
 if(colorSave.error)throw colorSave.error;
 const typeSave=await db.rpc('cafe_set_table_device_v30',{p_table_id:r.data,p_device_type:$('tableDevice').value});
 if(typeSave.error)throw typeSave.error;
 const rules=[1,2,3,4].map(i=>({controllers:i,short_fee:Number($('short'+i).value),rounding_step:Number($('round'+i).value)}));
 if(rules.some(x=>!Number.isFinite(x.short_fee)||x.short_fee<0||!Number.isFinite(x.rounding_step)||x.rounding_step<=0))throw Error('Aç/Kapa ve yuvarlama değerlerini kontrol edin.');
 const tariffSave=await db.rpc('cafe_save_tariff_rules_v25',{p_table_id:r.data,p_rules:rules});
 if(tariffSave.error)throw tariffSave.error;
 $('tableDialog').close();await reload();msg('Masa, sıralama ve renk kaydedildi.');}catch(x){msg(x.message,true)}finally{b.disabled=false}});
let currentTable=null;function openSessionDialog(id){const t=state.tables.find(x=>x.id===id);if(!t||active(t))return;currentTable=t;$('sessionForm').reset();$('advancePaid').checked=false;$('advanceMethod').value='card';$('mode').value='unlimited';$('sessionTable').value=id;$('sessionTitle').textContent=t.name+' · Hesap Aç';refreshAdvanceControls();updatePreview();$('sessionDialog').showModal();}
for(const id of ['controllers','mode','entryType','entryValue'])$(id).addEventListener(id==='entryValue'?'input':'change',updatePreview);
function updatePreview(){if(!currentTable)return;const n=Number($('controllers').value),hourly=rate(currentTable.id,n),mode=$('mode').value,typ=$('entryType').value,val=Number($('entryValue').value);$('timedFields').hidden=mode==='unlimited';$('valueLabel').firstChild.textContent=typ==='minutes'?'Dakika':'Tutar (TL)';$('entryValue').step=typ==='minutes'?'1':'0.01';$('entryValue').placeholder=typ==='minutes'?'Ör. 80':'Ör. 250';if(mode==='unlimited'){const tr=tariff(currentTable.id,n);$('calculated').textContent=`Saatlik: ${money(hourly)} · Aç/Kapa: ${money(tr.short_fee||0)} · Yuvarlama: ${money(tr.rounding_step||5)}`;return;}if(hourly<=0){$('calculated').textContent='Bu kol için saatlik fiyatı önce masa ayarlarından belirle.';return;}if(!Number.isFinite(val)||val<=0){$('calculated').textContent=`Saatlik ${money(hourly)} · Dakika veya tutar gir.`;return;}const tr=tariff(currentTable.id,n),seconds=typ==='minutes'?val*60:Math.round(val*3600/hourly),amount=typ==='minutes'?roundToStep(Math.max(hourly*val/60,Number(tr.short_fee||0)),Number(tr.rounding_step)||5):val;$('calculated').textContent=`Seçim: ${n} Kol · Süre: ${fmtTime(seconds)} · Sabit oyun ücreti: ${money(amount)}`;}
function refreshAdvanceControls(){const timed=$('mode').value==='timed';$('advanceRow').hidden=!timed;$('advanceMethodRow').hidden=!timed||!$('advancePaid').checked;if(!timed)$('advancePaid').checked=false;}
$('mode').addEventListener('change',refreshAdvanceControls);$('advancePaid').addEventListener('change',refreshAdvanceControls);
$('sessionForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.currentTarget.querySelector('[type=submit]');b.disabled=true;try{const timed=$('mode').value==='timed',val=timed?Number($('entryValue').value):null;if(timed&&(!Number.isFinite(val)||val<=0))throw Error('Pozitif bir dakika veya tutar gir.');const r=await db.rpc('cafe_open_session',{p_table_id:$('sessionTable').value,p_controllers:Number($('controllers').value),p_mode:$('mode').value,p_entry_type:timed?$('entryType').value:null,p_entry_value:val});if(r.error)throw r.error;let advanceWarning='';if(timed&&$('advancePaid').checked){const ar=await db.rpc('cafe_mark_advance_v26',{p_session_id:r.data,p_method:$('advanceMethod').value});if(ar.error)advanceWarning='ÖNEMLİ: Hesap açıldı ama ön ödeme kaydı başarısız: '+ar.error.message;}$('sessionDialog').close();await reload();msg(advanceWarning||'Hesap açıldı, süre başladı.',Boolean(advanceWarning));}catch(x){msg(x.message,true)}finally{b.disabled=false}});
// V38: müşteri QR ürünlerinden ayrı, çoklu kasa adisyon sepeti.
let manualSessionId=null,manualPickId=null,manualQueue=new Map(),manualBusy=false;
const manualCatalogProduct=id=>state.charges.find(p=>p.id===id&&p.active);
function renderManualQueue(){
 const entries=[...manualQueue].map(([id,qty])=>({p:manualCatalogProduct(id),id,qty})).filter(x=>x.p);
 $('manualQueued').innerHTML=entries.length?entries.map(({p,id,qty})=>`<div class="manual-queue-line"><span>${esc(p.name)} · ${qty} × ${money(p.price)}</span><strong>${money(qty*Number(p.price))}</strong><button type="button" class="secondary" data-queue-remove="${esc(id)}">Sil</button></div>`).join(''):'<p class="muted">Henüz ürün seçilmedi.</p>';
 const total=entries.reduce((s,x)=>s+x.qty*Number(x.p.price),0);
 $('manualPreview').textContent=`${entries.length} farklı kalem · ${money(total)} toplam`;
 $('manualQueued').querySelectorAll('[data-queue-remove]').forEach(b=>b.onclick=()=>{manualQueue.delete(b.dataset.queueRemove);renderManualQueue()});
}
function openManualDialog(id){
 // Masa kartı/sağ tık masa ID gönderir, eski kısa yol oturum ID gönderir.
 // Her iki yolu aktif oturuma eşleştir; adisyon kayıtları her zaman session_id ile tutulur.
 const s=state.sessions.find(x=>!x.ended_at && (x.id===id || x.table_id===id));
 if(!s){msg('Adisyon eklemek için önce bu masada hesap açmalısın.',true);return;}
 manualSessionId=s.id;manualPickId=null;manualQueue=new Map();$('manualForm').reset();$('manualPick').hidden=true;
 $('manualSession').textContent=state.tables.find(t=>t.id===s.table_id)?.name||'Masa';
 const products=state.charges.filter(p=>p.active);
 $('manualCatalog').innerHTML=products.length?products.map(p=>`<button type="button" class="manual-catalog-item" data-catalog-pick="${esc(p.id)}"><strong>${esc(p.name)}</strong><small>${esc(p.category)}</small><b>${money(p.price)}</b></button>`).join(''):'<p class="muted">Aktif kasa adisyon kalemi yok. Önce Adisyon Kalemleri bölümünden ekle.</p>';
 $('manualCatalog').querySelectorAll('[data-catalog-pick]').forEach(b=>b.onclick=()=>{
  manualPickId=b.dataset.catalogPick;const p=manualCatalogProduct(manualPickId);if(!p)return;
  $('manualPickedName').textContent=p.name+' · '+money(p.price);$('manualQty').value='1';$('manualPick').hidden=false;$('manualQty').focus();
  $('manualCatalog').querySelectorAll('.manual-catalog-item').forEach(c=>c.classList.toggle('picked',c===b));
 });
 if($('manualDialog').open){$('manualDialog').close();}
 renderManualQueue();$('manualDialog').showModal();
}
$('manualQty').max='9999'; // V59: kasa adisyonu adet ust siniri
$('manualQueueAdd').addEventListener('click',()=>{
 if(!manualPickId)return msg('Önce ürün seç.',true);
 const q=Number($('manualQty').value);if(!Number.isInteger(q)||q<1||q>9999)return msg('1 ile 9999 arasında adet gir.',true);
 const existing=manualQueue.get(manualPickId)||0;
 if(existing+q>9999)return msg('Bir ürün için en fazla 9999 adet eklenebilir.',true);
 manualQueue.set(manualPickId,existing+q);$('manualPick').hidden=true;manualPickId=null;
 $('manualCatalog').querySelectorAll('.manual-catalog-item').forEach(c=>c.classList.remove('picked'));
 renderManualQueue();
});
$('manualForm').addEventListener('submit',async e=>{
 e.preventDefault();if(manualBusy)return;
 if(!manualSessionId||!manualQueue.size)return msg('Kaydetmek için en az bir ürün eklemelisin.',true);
 manualBusy=true;const b=e.currentTarget.querySelector('[type=submit]');b.disabled=true;
 try{
  const cart=[...manualQueue].map(([id,qty])=>({id,qty}));
  const r=await db.rpc('cafe_add_catalog_cart_v38',{p_session_id:manualSessionId,p_items:cart});
  if(r.error)throw r.error;
  $('manualDialog').close();manualQueue.clear();await reload();msg('Tüm kasa adisyon kalemleri tek seferde eklendi.');
 }catch(err){msg('Adisyon kaydedilemedi: '+err.message,true)}finally{manualBusy=false;b.disabled=false}
});
// V5: kasa icin ayri adisyon kalemleri. Musteri urunleri (products) hic degismez.
function renderChargeList(){
 const list=$('chargeList');
 list.innerHTML=state.charges.length?state.charges.map((c,index)=>`<div class="charge-row" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><strong>${esc(c.name)}</strong><div class="muted">${esc(c.category)} · ${money(c.price)} · ${c.active?'Aktif':'Pasif'}</div></div><div style="display:flex;align-items:center;gap:6px"><label class="muted" style="display:flex;align-items:center;gap:5px">Sıra <input aria-label="${esc(c.name)} sırası" data-charge-order="${esc(c.id)}" type="number" min="0" max="999999" value="${Number(c.sort_order)||0}" style="width:78px;margin:0;padding:7px"/></label><button type="button" class="secondary" data-move-charge="${esc(c.id)}" data-direction="up" ${index===0?'disabled':''} title="Yukarı taşı">↑</button><button type="button" class="secondary" data-move-charge="${esc(c.id)}" data-direction="down" ${index===state.charges.length-1?'disabled':''} title="Aşağı taşı">↓</button><button type="button" class="secondary" data-edit-charge="${esc(c.id)}">Düzenle</button></div></div>`).join(''):'<p class="muted">Henüz kasa adisyon kalemi eklenmedi.</p>';
 list.querySelectorAll('[data-charge-order]').forEach(input=>input.addEventListener('change',async()=>{
  const value=Number(input.value);if(!Number.isSafeInteger(value)||value<0||value>999999){msg('Sıra 0 ile 999999 arasında bir tam sayı olmalı.',true);renderChargeList();return;}
  input.disabled=true;
  try{const r=await db.rpc('cafe_set_charge_order_v45',{p_item_id:input.dataset.chargeOrder,p_sort_order:value});if(r.error)throw r.error;await reload(true);renderChargeList();msg('Adisyon sırası güncellendi.');}
  catch(err){msg('Sıra kaydedilemedi: '+err.message,true);input.disabled=false;}
 }));
 list.querySelectorAll('[data-move-charge]').forEach(b=>b.addEventListener('click',async()=>{
  const ix=state.charges.findIndex(c=>c.id===b.dataset.moveCharge);const nx=ix+(b.dataset.direction==='up'?-1:1);if(ix<0||nx<0||nx>=state.charges.length)return;
  b.disabled=true;
  try{
   const first=state.charges[ix],second=state.charges[nx];
   // Ara sıralama değerleri eşit olsa bile tam sıra değişimi için atomik işlem.
   const r=await db.rpc('cafe_swap_charge_order_v45',{p_first_id:first.id,p_second_id:second.id});if(r.error)throw r.error;
   await reload(true);renderChargeList();msg('Adisyon sırası değiştirildi.');
  }catch(err){msg('Sıra değiştirilemedi: '+err.message,true);b.disabled=false;}
 }));
 list.querySelectorAll('[data-edit-charge]').forEach(b=>b.onclick=()=>{
  const c=state.charges.find(x=>x.id===b.dataset.editCharge);if(!c)return;
  $('chargeId').value=c.id;$('chargeName').value=c.name;$('chargeCategory').value=c.category;
  $('chargePrice').value=c.price;$('chargeActive').checked=c.active;
 });
}
function clearChargeForm(){
 $('chargeForm').reset();$('chargeId').value='';$('chargeCategory').value='Diğer';$('chargeActive').checked=true;
}
$('chargeClear').onclick=clearChargeForm;
$('manageCharges').onclick=()=>{clearChargeForm();renderChargeList();$('chargesDialog').showModal()};
$('chargeForm').addEventListener('submit',async e=>{
 e.preventDefault();const btn=e.currentTarget.querySelector('[type=submit]');btn.disabled=true;
 try{
  const name=$('chargeName').value.trim(),category=$('chargeCategory').value.trim(),raw=$('chargePrice').value;
  const price=Number(raw);
  if(!name||!category||raw.trim()===''||!Number.isFinite(price)||price<0)throw Error('Ad, kategori ve fiyatı kontrol edin.');
  const r=await db.rpc('cafe_save_charge',{p_id:$('chargeId').value||null,p_name:name,p_category:category,p_price:price,p_active:$('chargeActive').checked});
  if(r.error)throw r.error;
  await reload(true);renderChargeList();clearChargeForm();msg('Kasa adisyon kalemi kaydedildi.');
 }catch(err){msg('Adisyon kalemi kaydedilemedi: '+err.message,true)}finally{btn.disabled=false}
});
// V10 — HESAP DUZENLEME: tum islemler sunucudaki yetkili RPC ile yapilir.
let manageSessionId=null;
function openManageSession(id){
 const s=state.sessions.find(x=>x.id===id&&!x.ended_at);if(!s)return;
 manageSessionId=id;
 const t=state.tables.find(x=>x.id===s.table_id);
 $('manageTitle').textContent='⚙️ '+(t?.name||'Masa')+' · Hesap İşlemleri';
 const d=new Date(s.started_at),local=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
 $('manageStart').value=local;
 $('manageTarget').innerHTML='<option value="">Hedef masa seç</option>'+state.tables.filter(x=>x.active&&x.id!==s.table_id&&!active(x)).map(x=>`<option value="${esc(x.id)}">${esc(x.name)} · ${money(rate(x.id,s.controllers))}/saat</option>`).join('');
 $('manageControllers').value=String(s.controllers);
 $('manageDelta').value='15';$('timedEdit').hidden=s.mode!=='timed';
 $('manageInfo').textContent=`${s.controllers} kol · ${s.mode==='timed'?'Süreli':'Süresiz'} · Güncel tarife: ${money(rate(s.table_id,s.controllers))}/saat · Oyun: ${money(gameAmount(s))}`;
 updateManageRatePreview();
 $('manageDialog').showModal();
}
async function manageAction(fn,args,success){
 if(!manageSessionId)return;
 const buttons=[...$('manageDialog').querySelectorAll('button[data-operation]')];buttons.forEach(x=>x.disabled=true);
 try{
  const r=await db.rpc(fn,{p_session_id:manageSessionId,...args});if(r.error)throw r.error;
  $('manageDialog').close();await reload();msg(success);
 }catch(e){msg('İşlem yapılamadı: '+e.message,true)}finally{buttons.forEach(x=>x.disabled=false)}
}
function updateManageRatePreview(){
 const s=state.sessions.find(x=>x.id===manageSessionId);if(!s)return;
 const n=Number($('manageControllers').value),hour=rate(s.table_id,n);
 let line=$('manageRatePreview');if(!line){line=document.createElement('div');line.id='manageRatePreview';line.className='manage-rate-preview';$('manageControllers').closest('label').after(line);}
 line.textContent=`Mevcut: ${s.controllers} Kol · ${money(rate(s.table_id,s.controllers))}/saat  →  Yeni: ${n} Kol · ${money(hour)}/saat`;
 line.classList.toggle('invalid',hour<=0);
}
$('manageControllers').addEventListener('change',updateManageRatePreview);
$('manageDialog').querySelectorAll('[data-operation]').forEach(b=>b.addEventListener('click',async()=>{
 const op=b.dataset.operation;
 if(op==='start'){
  const raw=$('manageStart').value;if(!raw)return msg('Geçerli açılış saati gir.',true);
  const date=new Date(raw);if(Number.isNaN(+date))return msg('Açılış tarihi geçersiz.',true);
  if(!confirm('Hesap açılış saatini değiştirmek istediğine emin misin?'))return;
  await manageAction('cafe_change_start_v10',{p_started_at:date.toISOString()},'Açılış saati değiştirildi.');
 }else if(op==='move'){
  const id=$('manageTarget').value;if(!id)return msg('Hedef masa seç.',true);
  if(!confirm('Masa değişikliği bu andan itibaren yeni masanın tarifesine göre hesaplanacak. Onaylıyor musun?'))return;
  await manageAction('cafe_move_session_v10',{p_target_table_id:id},'Hesap başka masaya taşındı; eski süre eski tarifede kaldı.');
 }else if(op==='controllers'){
  const n=Number($('manageControllers').value);
  if(rate(state.sessions.find(s=>s.id===manageSessionId)?.table_id,n)<=0)return msg('Bu kol için geçerli saatlik fiyat tanımlı değil.',true);
  if(!confirm(`${n} kol tarifesine geçilecek: ${money(rate(state.sessions.find(s=>s.id===manageSessionId)?.table_id,n))}/saat. Önceki süre eski tarifede kalır. Onaylıyor musun?`))return;
  await manageAction('cafe_change_controllers_v38',{p_controllers:n},'Kol sayısı değiştirildi; bundan sonraki süre yeni kol tarifesinden hesaplanacak.');
 }else if(op==='plus'||op==='minus'){
  const m=Number($('manageDelta').value);
  if(!Number.isInteger(m)||m<1||m>1440)return msg('1–1440 dakika gir.',true);
  await manageAction('cafe_change_timed_minutes_v10',{p_delta_minutes:op==='plus'?m:-m},'Süre güncellendi.');
 }
}));
async function voidManual(id){
 const row=state.manualItems.find(m=>m.id===id);
 if(!row||!confirm(`${row.product_name} · ${row.qty} adet manuel adisyon iptal edilsin mi?`))return;
 const r=await db.rpc('cafe_void_manual_v10',{p_item_id:id});
 if(r.error){msg('Adisyon silinemedi: '+r.error.message,true);return;}
 await reload();msg('Yanlış manuel adisyon iptal edildi; QR siparişleri etkilenmedi.');
}
let receiptSessionId=null;
let receiptClosed=false;
let receiptSnapshot=null;
function receiptData(s){
 const closed=Boolean(s.ended_at);
 const game=closed?Number(s.final_game_amount||0):gameAmount(s);
 const orders=closed?Number(s.final_order_amount||0):productAmount(s.id);
 const total=closed?Number(s.final_total_amount??game+orders):game+orders;
 const seconds=closed?Math.max(0,Math.floor((new Date(s.ended_at)-new Date(s.started_at))/1000)):elapsed(s);
 const items=[];
 for(const m of manualForSession(s.id))items.push({name:m.product_name,qty:Number(m.qty)||0,price:Number(m.unit_price)||0,source:'manual'});
 for(const o of ordersForSession(s.id)){
  if(o.status==='cancelled')continue;
  for(const i of o.order_items||[])items.push({name:i.product_name,qty:Number(i.qty)||0,price:Number(i.unit_price)||0,source:'qr'});
 }
 return {id:s.id,closed,game,orders,total,seconds,items,
  name:state.tables.find(t=>t.id===s.table_id)?.name||'Masa',controllers:s.controllers,segments:state.segments.filter(z=>z.session_id===s.id).sort((a,b)=>Date.parse(a.started_at)-Date.parse(b.started_at)),
  mode:s.mode,started:s.started_at,ended:s.ended_at};
}
const receiptHTML=r=>`<div class="receipt-brand">BETA <span>PLAYSTATION</span></div>
 <p class="receipt-sub">${r.closed?'KAPANMIŞ HESAP':'HESAP KAPATMA ÖNCESİ'} · ${esc(r.name)}</p>
 <div class="receipt-meta"><div><span>Masa</span><strong>${esc(r.name)}</strong></div><div><span>Kol sayısı</span><strong>${r.controllers} Kol</strong></div>
 <div><span>Hesap türü</span><strong>${r.mode==='timed'?'Süreli':'Süresiz'}</strong></div>
 <div><span>Oynanan süre</span><strong>${fmtTime(r.seconds)} (${Math.floor(r.seconds/60)} dk ${r.seconds%60} sn)</strong></div>
 <div><span>Açılış</span><strong>${new Date(r.started).toLocaleString('tr-TR')}</strong></div>
 <div><span>${r.closed?'Kapanış':'Durum'}</span><strong>${r.closed?new Date(r.ended).toLocaleString('tr-TR'):'Hesap açık'}</strong></div></div>
 ${r.segments.length>1?`<h3>Oyun / Masa / Kol Değişiklikleri</h3>${r.segments.map((x,i)=>`<div class="receipt-line"><span>${i?'Değişiklik':'Başlangıç'} · ${new Date(x.started_at).toLocaleTimeString('tr-TR')} · ${esc(state.tables.find(t=>t.id===x.table_id)?.name||'Masa')} · ${Number(x.controllers)} kol</span><strong>${money(x.hourly_price)}/saat</strong></div>`).join('')}`:''}
 <div class="receipt-line"><span>🎮 Oyun ücreti</span><strong>${money(r.game)}</strong></div>
 <h3>Alınan ürünler</h3>
 ${r.items.length?`<div class="receipt-products">${r.items.map(i=>`<div class="receipt-line"><span>${i.qty} × ${esc(i.name)} ${i.source==='manual'?'<small>• Manuel</small>':''} <small>(${money(i.price)} / adet)</small></span><strong>${money(i.qty*i.price)}</strong></div>`).join('')}</div>`:'<p class="muted">Bu hesapta ürün siparişi bulunmuyor.</p>'}
 <div class="receipt-line receipt-subtotal"><span>Ürün toplamı</span><strong>${money(r.orders)}</strong></div>
 ${advanceAmount(r.id)>0?`<div class="receipt-line"><span>✓ Açılışta tahsil edildi (${advanceFor(r.id)?.method==='card'?'Kart':'Nakit'})</span><strong>${money(advanceAmount(r.id))}</strong></div>`:''}
 ${partialAmount(r.id)>0?`<div class="receipt-line"><span>✓ Ara tahsilat</span><strong>${money(partialAmount(r.id))}</strong></div>`:''}
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
 // V21: aktif hesapta yalnızca ödeme ekranı; adisyon önizlemesi gösterilmez.
 $('receiptTitle').textContent=receiptClosed?'🧾 Kapanmış Hesap / Ödeme':'💳 Hesabı Kapat · Ödeme Al';
 $('receiptBody').hidden=!receiptClosed;
 $('receiptBody').innerHTML=receiptClosed?receiptHTML(receiptSnapshot):'';
 $('receiptPrint').hidden=!receiptClosed;
 $('receiptWarning').textContent=receiptClosed?'Bu hesap daha önce kapatılmıştır.':'Ödemeyi kaydettiğinde hesap kapanır. İşlem tamamlanmadan masanın süresi işlemeye devam eder.';
 $('receiptConfirm').hidden=true;
 $('receiptCancel').textContent=receiptClosed?'Kapat':'Vazgeç';
 $('embeddedPayment').hidden=false;
 if(receiptClosed)fillPayment(id);else fillPendingPayment(id);
 $('receiptDialog').showModal();
}
$('receiptCancel').onclick=()=>$('receiptDialog').close();
$('receiptPrint').onclick=()=>window.print();
async function closeReceiptAccount(){
 if(!receiptSessionId||receiptClosed)return false;
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
  // Ara 'Hesap Kapatıldı' ekranını gösterme: ödeme tek akışta devam eder.
  $('receiptTitle').textContent='💳 Hesabı Kapat · Ödeme Al';
  $('receiptBody').innerHTML='';
  $('receiptBody').hidden=true;
  $('receiptWarning').textContent='Ödeme kaydı tamamlanıyor…';
  $('embeddedPayment').hidden=false;
  button.hidden=true;$('receiptCancel').textContent='Kapat';
  // Ödeme doğrulanmadan 'işlem tamamlandı' bildirimi verme.
  fillPayment(id);
  return true;
 }catch(e){msg(e.message,true);$('receiptWarning').textContent='İşlem doğrulanamadı: '+e.message;return false;}
 finally{button.disabled=false}
}
$('receiptConfirm').onclick=closeReceiptAccount;

// V16 - hesap kapandiktan sonra nakit, kart ve iskonto. Server yeniden hesaplar.
let paymentSessionId=null;
const cents=n=>Math.round((Number(n)+Number.EPSILON)*100);
const fromCents=n=>Number((n/100).toFixed(2));
function currentPaymentSession(){return state.sessions.find(s=>s.id===paymentSessionId&&s.ended_at)}
function paymentTotal(){const s=currentPaymentSession();return s?Number(s.final_total_amount??(Number(s.final_game_amount||0)+Number(s.final_order_amount||0))):(!receiptClosed&&receiptSnapshot&&receiptSnapshot.id===paymentSessionId?receiptSnapshot.total:0)}
function discountValue(gross){
 const n=Number($('payDiscount').value||0);
 if(!Number.isFinite(n)||n<0)throw Error('İskonto geçersiz.');
 const val=$('payDiscountType').value==='percent'?Math.round(cents(gross)*n/100):cents(n);
 if($('payDiscountType').value==='percent'&&n>100)throw Error('İskonto %100 üzerinde olamaz.');
 if(val>cents(gross))throw Error('İskonto toplam tutarı aşamaz.');
 return fromCents(val);
}
function updatePaymentPreview(){
 const total=paymentTotal(),advance=upfrontAmount(paymentSessionId);
 try{
  const discount=discountValue(Math.max(0,total-advance)),net=fromCents(cents(total)-cents(advance)-cents(discount));
  const cash=Number($('payCash').value||0),card=Number($('payCard').value||0);
  if(!Number.isFinite(cash)||!Number.isFinite(card)||cash<0||card<0)throw Error('Ödeme tutarları geçersiz.');
  const diff=fromCents(cents(net)-cents(cash)-cents(card));
  $('paymentAdvance').textContent=money(advance);
  $('paymentSummary').innerHTML=`<div class="payment-line"><span>Hesap tutarı</span><strong>${money(total)}</strong></div><div class="payment-line"><span>Önceden tahsil edilen</span><strong>− ${money(advance)}</strong></div><div class="payment-line"><span>İskonto</span><strong>− ${money(discount)}</strong></div><div class="payment-line payment-net"><span>Ödenecek</span><strong>${money(net)}</strong></div><div class="payment-line"><span>Nakit + Kart</span><strong>${money(cash+card)}</strong></div><div class="payment-line"><span>${diff>=0?'Kalan':'Fazla girilen'}</span><strong>${money(Math.abs(diff))}</strong></div>`;
  $('paymentSave').disabled=diff!==0;
  $('paymentWarning').textContent=diff===0?'Tutarlar eşleşiyor; ödemeyi kaydedebilirsin.':'Nakit ve kart toplamı ödenecek tutara eşit olmalı.';
 }catch(e){$('paymentSummary').textContent='Kontrol: '+e.message;$('paymentSave').disabled=true;$('paymentWarning').textContent=e.message}
}
function fillPendingPayment(id){
 paymentSessionId=id;
 $('paymentTableName').textContent=receiptSnapshot.name;
 $('paymentGross').textContent=money(paymentTotal());
 $('paymentForm').reset();$('payDiscountType').value='amount';$('payDiscount').value='0';
 $('payCash').value='0';$('payCard').value=Math.max(0,paymentTotal()-upfrontAmount(id)).toFixed(2);
 for(const input of $('paymentForm').querySelectorAll('input,select'))input.disabled=false;
 $('paymentSave').hidden=false;
 $('paymentSave').textContent='✓ Hesabı Kapat ve Ödemeyi Kaydet';
 updatePaymentPreview();
}
function fillPayment(id){
 const s=state.sessions.find(x=>x.id===id&&x.ended_at);
 if(!s){msg('Ödeme için önce hesabı kapatmalısın.',true);return;}
 paymentSessionId=id;
 const paid=state.payments.find(p=>p.session_id===id);
 $('paymentTableName').textContent=state.tables.find(t=>t.id===s.table_id)?.name||'Masa';
 $('paymentGross').textContent=money(paymentTotal());
 $('paymentForm').reset();$('payDiscountType').value='amount';$('payDiscount').value='0';
 $('payCash').value=Math.max(0,paymentTotal()-upfrontAmount(id)).toFixed(2);$('payCard').value='0';
 const disabled=Boolean(paid);
 for(const input of $('paymentForm').querySelectorAll('input,select'))input.disabled=disabled;
 $('paymentSave').hidden=disabled;
 if(disabled){
  $('paymentSummary').innerHTML=`<div class="payment-line"><span>Önceden alınan</span><strong>${money(upfrontAmount(id))}</strong></div><div class="payment-line"><span>İskonto</span><strong>${money(paid.discount_amount)}</strong></div><div class="payment-line"><span>Nakit</span><strong>${money(paid.cash_amount)}</strong></div><div class="payment-line"><span>Kart</span><strong>${money(paid.card_amount)}</strong></div><div class="payment-line payment-net"><span>Tahsil edilen</span><strong>${money(Number(paid.cash_amount)+Number(paid.card_amount))}</strong></div>`;
  $('paymentWarning').textContent='✓ Ödeme daha önce kaydedildi. İkinci tahsilat yapılamaz.';
 }else updatePaymentPreview();
}
async function openPayment(id){
 await showReceipt(id);
 if(!receiptClosed)return;
 $('embeddedPayment').hidden=false;
}
for(const id of ['payDiscountType','payDiscount','payCash','payCard'])$(id).addEventListener('input',updatePaymentPreview);
let paymentSaving=false;
async function savePaymentRecord(){
 const button=$('paymentSave');
 if(button.disabled||!paymentSessionId||paymentSaving)return false;
 paymentSaving=true;button.disabled=true;
 try{
  const preTotal=paymentTotal();
  const discountType=$('payDiscountType').value;
  const discountInput=$('payDiscount').value;
  const upfront=upfrontAmount(paymentSessionId),discount=discountValue(Math.max(0,preTotal-upfront)),cash=Number($('payCash').value||0),card=Number($('payCard').value||0);
  if(![cash,card].every(n=>Number.isFinite(n)&&n>=0))throw Error('Nakit ve kart negatif olamaz.');
  if(cents(cash)+cents(card)!==cents(preTotal)-cents(upfront)-cents(discount))throw Error('Nakit + Kart toplamı ödenecek tutara eşit olmalı.');
  const id=paymentSessionId;
  // Aktif masada sadece ödeme ekranı gösterilir. Önce sunucuda kesin kapanış tutarı alınır.
  if(!receiptClosed){
   const fullCard=cents(cash)===0&&cents(discount)===0&&cents(card)===cents(preTotal)-cents(upfront);
   const fullCash=cents(card)===0&&cents(discount)===0&&cents(cash)===cents(preTotal)-cents(upfront);
   $('paymentWarning').textContent='Hesap kapatılıyor, kesin tutar hesaplanıyor…';
   const ok=await closeReceiptAccount();
   if(!ok)return false;
   // Kapanış RPC'si birkaç saniye daha ücret yazabilir. Tamamen kart/nakit seçilmişse yeni kesin tutara uyarla.
   const actual=paymentTotal();
   $('receiptBody').hidden=true;$('receiptPrint').hidden=true;
   // Sunucuda hesap kapandığında araya ikinci ödeme ekranı girmesin.
   // Aynı işlem içerisinde ödeme kaydına devam ediyoruz.
   $('payDiscountType').value=discountType;$('payDiscount').value=discountInput;
   // Kesin hesap birkaç saniye farklı olabilir: ikinci onay ekranı açmadan ödeme dağılımını güncelle.
   // Tam kart veya tam nakitse tutarı kesin değere otomatik uyarla.
   // Parçalı işlemde kullanıcı nakit tutarını koru, farkı kartta dengele.
   const finalDue=Math.max(0,fromCents(cents(actual)-cents(upfrontAmount(id))-cents(discountValue(Math.max(0,actual-upfrontAmount(id))))));
   if(fullCard){$('payCash').value='0';$('payCard').value=finalDue.toFixed(2)}
   else if(fullCash){$('payCard').value='0';$('payCash').value=finalDue.toFixed(2)}
   else{
    if(cents(cash)>cents(finalDue)){
     // Nakit seçimi yeni tutarı aşıyorsa otomatik değiştirmek yerine hatayı açıkça bildir.
     throw Error('Kesin tutar değişti ve girilen nakit ödenecek tutarı aşıyor. Masa kapandı; Son İşlemler içinden ödeme tutarını yeniden gir.');
    }
    $('payCash').value=cash.toFixed(2);
    $('payCard').value=fromCents(cents(finalDue)-cents(cash)).toFixed(2);
   }
   updatePaymentPreview();
  }
  const finalDiscount=discountValue(Math.max(0,paymentTotal()-upfrontAmount(id))),finalCash=Number($('payCash').value||0),finalCard=Number($('payCard').value||0);
  if(cents(finalCash)+cents(finalCard)!==cents(paymentTotal())-cents(upfrontAmount(id))-cents(finalDiscount)){
   throw Error('Kapanıştaki kesin tutar değişti. Nakit / kart değerlerini kontrol edip Ödemeyi Kaydet butonuna tekrar bas. Masa kapandı, ödeme henüz kaydedilmedi.');
  }
  const r=await db.rpc('cafe_record_payment_v26',{p_session_id:id,p_discount_amount:finalDiscount,p_cash_amount:finalCash,p_card_amount:finalCard});
  if(r.error)throw r.error;
  await reload(true);
  fillPayment(id);
  $('receiptWarning').textContent='✓ Hesap kapatıldı ve ödeme kaydedildi.';
  msg('Ödeme kaydedildi: Nakit '+money(finalCash)+' · Kart '+money(finalCard)+' · İskonto '+money(finalDiscount));
  $('receiptDialog').close();
  return true;
 }catch(err){
  $('paymentWarning').textContent='Ödeme kaydedilemedi: '+err.message;
  msg(err.message,true);updatePaymentPreview();return false;
 }finally{paymentSaving=false;button.disabled=false;}
}
$('paymentForm').addEventListener('submit',async e=>{e.preventDefault();await savePaymentRecord()});

// V21: ödeme penceresi açıkken Enter => kesin tutarın tamamı kart, iskonto sıfır.
let enterCloseBusy=false;
$('receiptDialog').addEventListener('keydown',async e=>{
 if(e.key!=='Enter'||e.repeat||e.ctrlKey||e.altKey||e.metaKey||e.shiftKey||enterCloseBusy)return;
 const el=e.target;
 if(el.closest('input,select,textarea')||el.isContentEditable)return;
 if(receiptClosed&&state.payments.some(p=>p.session_id===receiptSessionId))return;
 e.preventDefault();e.stopPropagation();enterCloseBusy=true;
 try{
  $('payDiscountType').value='amount';$('payDiscount').value='0';
  $('payCash').value='0';$('payCard').value=Math.max(0,paymentTotal()-upfrontAmount(paymentSessionId)).toFixed(2);
  updatePaymentPreview();
  await savePaymentRecord();
 }finally{enterCloseBusy=false;}
});

// V7 Rapor ekranı: geçmiş hesaplar ana masa yükleme sınırından bağımsız alınır.
const reportDate=d=>{const a=new Date(d);return `${a.getFullYear()}-${String(a.getMonth()+1).padStart(2,'0')}-${String(a.getDate()).padStart(2,'0')}`};
function initReportDates(){const now=new Date();$('reportTo').value=reportDate(now);const earlier=new Date(now);earlier.setDate(earlier.getDate()-29);$('reportFrom').value=reportDate(earlier)}
function switchReports(show){if(show){setDeskTab('reports');$('reportTable').innerHTML='<option value="">Tüm masalar</option>'+state.tables.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');$('reportsView').scrollIntoView({behavior:'smooth',block:'start'});}else{setDeskTab('tables');window.scrollTo({top:0,behavior:'smooth'});}}
$('showReports').onclick=()=>{switchReports(true);if(!$('reportRows').children.length)loadReport()};
$('backToTables').onclick=()=>switchReports(false);
$('reportFilters').addEventListener('submit',e=>{e.preventDefault();loadReport()});
const dateStart=s=>new Date(`${s}T00:00:00`).toISOString();
const dateEnd=s=>{const d=new Date(`${s}T00:00:00`);d.setDate(d.getDate()+1);return d.toISOString()};
const minutesLabel=seconds=>{const m=Math.ceil(Math.max(0,seconds)/60);return `${m} dk (${fmtTime(seconds)})`};
let reportLoading=false;
async function loadReport(){
 if(reportLoading)return;
 const from=$('reportFrom').value,to=$('reportTo').value,table=$('reportTable').value;
 if(!from||!to||from>to){$('reportStatus').textContent='Başlangıç ve bitiş tarihlerini kontrol edin.';return;}
 reportLoading=true;$('reportStatus').textContent='Kapanan hesaplar ve adisyon kalemleri yükleniyor...';
 $('reportRows').replaceChildren();$('reportFooter').replaceChildren();$('reportSummary').replaceChildren();
 try{
  // Bütün sayfalar okunur: yalnızca en son 250 hesaba dayanılmaz.
  const sessions=[];let offset=0;
  while(true){
   let q=db.from('cafe_sessions').select('id,table_id,controllers,mode,started_at,ended_at,final_game_amount,final_order_amount,final_total_amount')
     .not('ended_at','is',null).gte('ended_at',dateStart(from)).lt('ended_at',dateEnd(to))
     .order('ended_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+249);
   if(table)q=q.eq('table_id',table);
   const r=await q;if(r.error)throw r.error;sessions.push(...(r.data||[]));
   if(!r.data||r.data.length<250)break;
   offset+=250;if(offset>=25000)throw Error('Bu tarih aralığında 25.000’den fazla hesap var. Daha kısa bir tarih aralığı seç.');
  }
  const hiddenReportIds=new Set();let hOffset=0;while(true){const v=await db.from('cafe_report_hidden_v26').select('session_id').range(hOffset,hOffset+999);if(v.error)throw v.error;(v.data||[]).forEach(x=>hiddenReportIds.add(x.session_id));if((v.data||[]).length<1000)break;hOffset+=1000;}
  const shownSessions=sessions.filter(s=>!hiddenReportIds.has(s.id));
  if(!shownSessions.length){$('reportStatus').textContent='Seçilen tarih aralığında kapanmış hesap bulunamadı.';return;}
  const ids=shownSessions.map(s=>s.id),manual=[],links=[],reportSegments=[];
  for(let i=0;i<ids.length;i+=100){
   const slice=ids.slice(i,i+100);
   const sgs=await db.from('cafe_session_segments').select('session_id,table_id,controllers,hourly_price,short_fee,rounding_step,started_at').in('session_id',slice).order('started_at',{ascending:true}).limit(1000);
   if(sgs.error)throw sgs.error;reportSegments.push(...(sgs.data||[]));
   let start=0;while(true){const r=await db.from('cafe_manual_items').select('session_id,product_name,qty,unit_price,voided_at').in('session_id',slice).range(start,start+999);if(r.error)throw r.error;manual.push(...(r.data||[]));if((r.data||[]).length<1000)break;start+=1000;}
   start=0;while(true){const r=await db.from('cafe_session_orders').select('session_id,order_id').in('session_id',slice).range(start,start+999);if(r.error)throw r.error;links.push(...(r.data||[]));if((r.data||[]).length<1000)break;start+=1000;}
  }
  const orders=new Map(),orderIds=[...new Set(links.map(l=>l.order_id))];
  for(let i=0;i<orderIds.length;i+=100){const r=await db.from('orders').select('id,status,total,order_items(product_name,qty,unit_price)').in('id',orderIds.slice(i,i+100));if(r.error)throw r.error;for(const o of r.data||[])orders.set(o.id,o);}
  const reportAdvances=new Map(),reportPayments=new Map(),reportPartials=new Map();for(let i=0;i<ids.length;i+=100){const chunk=ids.slice(i,i+100);const [a,p,pp]=await Promise.all([db.from('cafe_session_advances_v26').select('session_id,amount,method').in('session_id',chunk),db.from('cafe_payments').select('session_id,cash_amount,card_amount,discount_amount').in('session_id',chunk),db.from('cafe_partial_payments_v57').select('session_id,amount,method').in('session_id',chunk)]);if(a.error)throw a.error;if(p.error)throw p.error;if(pp.error)throw pp.error;for(const z of a.data||[])reportAdvances.set(z.session_id,z);for(const z of p.data||[])reportPayments.set(z.session_id,z);for(const z of pp.data||[])reportPartials.set(z.session_id,fromCentsSafe((reportPartials.get(z.session_id)||0)+Number(z.amount||0)));}
  const mBy=new Map(),lBy=new Map();
  for(const m of manual){if(!mBy.has(m.session_id))mBy.set(m.session_id,[]);mBy.get(m.session_id).push(m)}
  for(const l of links){if(!lBy.has(l.session_id))lBy.set(l.session_id,[]);lBy.get(l.session_id).push(l.order_id)}
  const summary={count:shownSessions.length,seconds:0,game:0,qr:0,manual:0,total:0};
  const rows=[];
  for(const s of shownSessions){
   const secs=Math.max(0,Math.floor((new Date(s.ended_at)-new Date(s.started_at))/1000));
   const manualItems=(mBy.get(s.id)||[]).filter(m=>!m.voided_at),qrIds=lBy.get(s.id)||[];
   const qrItems=[];
   let qrTotal=0;
   for(const id of qrIds){const o=orders.get(id);if(!o||o.status==='cancelled')continue;qrTotal+=Number(o.total||0);for(const p of o.order_items||[])qrItems.push({name:p.product_name,qty:Number(p.qty||0),price:Number(p.unit_price||0)});}
   const manualTotal=manualItems.reduce((n,m)=>n+Number(m.qty||0)*Number(m.unit_price||0),0);
   const game=Number(s.final_game_amount||0),total=Number(s.final_total_amount??(game+Number(s.final_order_amount||0)));
   summary.seconds+=secs;summary.game+=game;summary.qr+=qrTotal;summary.manual+=manualTotal;summary.total+=total;
   const details=(title,items)=>`<div class="report-group"><b>${title}</b>${items.length?items.map(x=>`<div>${Number(x.qty)} × ${esc(x.name)} — ${money(Number(x.qty)*Number(x.price))}</div>`).join(''):'<div>Yok</div>'}</div>`;
   const name=state.tables.find(t=>t.id===s.table_id)?.name||'Silinmiş masa';
   const sSeg=reportSegments.filter(z=>z.session_id===s.id),first=sSeg[0];
   const changes=sSeg.length>1?`<div class="report-group"><b>Tarife değişiklikleri</b>${sSeg.map(z=>`<div>${new Date(z.started_at).toLocaleString('tr-TR')} · ${esc(state.tables.find(t=>t.id===z.table_id)?.name||'Masa')} · ${z.controllers} Kol · ${money(z.hourly_price)}/saat</div>`).join('')}</div>`:'';
   const advance=reportAdvances.get(s.id),payment=reportPayments.get(s.id),partial=reportPartials.get(s.id)||0;
   const payStatus=payment?`<small class="paid-state">✓ Ödendi · açılış ${money(advance?.amount||0)} · ara ödeme ${money(partial)} · kapanış ${money(Number(payment.cash_amount)+Number(payment.card_amount)-Number(advance?.amount||0)-partial)}</small>`:advance?`<small class="partial-state">◐ Açılışta ${money(advance.amount)} alındı · ara ödeme ${money(partial)} · kalan bekliyor</small>`:partial?`<small class="partial-state">◐ Ara ödeme ${money(partial)} alındı · kapanış tahsilatı bekliyor</small>`:'<small class="unpaid-state">⚠ Tahsilat kaydı yok</small>';
   rows.push(`<tr><td><strong>${esc(name)}</strong><br><small class="report-start">🟢 Açılış: ${new Date(s.started_at).toLocaleString('tr-TR')} · ${Number(first?.controllers||s.controllers)} Kol</small><br><small class="report-end">🔴 Kapanış: ${new Date(s.ended_at).toLocaleString('tr-TR')}</small><br><small>${s.mode==='timed'?'Süreli':'Süresiz'}</small><details class="report-detail"><summary>Alınanları göster</summary>${details('QR siparişleri',qrItems)}${details('Kasa adisyonu',manualItems.map(m=>({name:m.product_name,qty:m.qty,price:m.unit_price})))}${changes}</details></td><td>${minutesLabel(secs)}</td><td>${money(game)}</td><td>${money(qrTotal)}</td><td>${money(manualTotal)}</td><td><strong>${money(total)}</strong><br>${payStatus}</td><td><button type="button" class="secondary report-hide" data-hide-report="${esc(s.id)}">Rapordan kaldır</button></td></tr>`);
  }
  $('reportRows').innerHTML=rows.join('');
  $('reportFooter').innerHTML=`<tr><th>GENEL TOPLAM · ${summary.count} hesap</th><th>${Math.ceil(summary.seconds/60)} dk</th><th>${money(summary.game)}</th><th>${money(summary.qr)}</th><th>${money(summary.manual)}</th><th>${money(summary.total)}</th><th></th></tr>`;
  $('reportSummary').innerHTML=`<div><span>Kapanan hesap</span><strong>${summary.count}</strong></div><div><span>Oyun geliri</span><strong>${money(summary.game)}</strong></div><div><span>QR + Kasa adisyonu</span><strong>${money(summary.qr+summary.manual)}</strong></div><div><span>TOPLAM TUTAR</span><strong>${money(summary.total)}</strong></div>`;
  document.querySelectorAll('[data-hide-report]').forEach(b=>b.addEventListener('click',()=>hideReport(b.dataset.hideReport)));
  $('reportStatus').textContent=`${summary.count} kapanmış hesap listelendi. Tahsil edildi durumları ayrıca gösterilir. “Rapordan kaldır” işlemi kayıtları veritabanından silmez; yalnızca raporda gizler.`;
 }catch(e){$('reportStatus').textContent='Rapor alınamadı: '+e.message;}
 finally{reportLoading=false}
}
initReportDates();


// V39 — masaüstü kareli düzen. Görsel konumlar yalnızca bu bilgisayarın
// tarayıcı deposunda saklanır; masa fiyatları ve adisyonlar etkilenmez.
const TABLE_GRID_COLS=12, TABLE_GRID_ROWS=10;
const TABLE_GRID_KEY='beta_playstation_layout_v39';
let layoutEditMode=false, layoutMove=null;
function getGridPositions(){try{const p=JSON.parse(localStorage.getItem(TABLE_GRID_KEY)||'{}');return p&&typeof p==='object'?p:{}}catch{return {}}}
function setGridPositions(p){try{localStorage.setItem(TABLE_GRID_KEY,JSON.stringify(p))}catch(e){console.warn('Yerleşim kaydedilemedi',e)}}
function applyGridPlacement(tile,id,index){
 if(window.matchMedia('(max-width:900px)').matches)return;
 const p=getGridPositions(),v=p[id];
 const row=Number.isInteger(v?.row)&&v.row>=1&&v.row<=TABLE_GRID_ROWS?v.row:Math.floor(index/TABLE_GRID_COLS)+1;
 const col=Number.isInteger(v?.col)&&v.col>=1&&v.col<=TABLE_GRID_COLS?v.col:index%TABLE_GRID_COLS+1;
 tile.style.gridRow=String(row);tile.style.gridColumn=String(col);
 tile.classList.toggle('layout-movable',layoutEditMode);
}
const layoutButton=$('layoutEditToggle');
layoutButton.addEventListener('click',()=>{
 layoutEditMode=!layoutEditMode;
 layoutButton.textContent=layoutEditMode?'✓ Yerleşimi Bitir':'▦ Yerleşimi Düzenle';
 layoutButton.classList.toggle('active',layoutEditMode);
 $('layoutHint').hidden=!layoutEditMode;
 $('cards').classList.toggle('grid-editing',layoutEditMode);
 document.querySelectorAll('#cards .desk-tile').forEach(x=>x.classList.toggle('layout-movable',layoutEditMode));
});
function beginTilePlacement(e,tile){
 if(!layoutEditMode||e.button!==0||window.matchMedia('(max-width:900px)').matches)return;
 e.preventDefault();e.stopPropagation();
 const startX=e.clientX,startY=e.clientY,id=tile.dataset.tableId;
 let dragged=false;
 const onMove=ev=>{if(Math.hypot(ev.clientX-startX,ev.clientY-startY)>4){dragged=true;tile.classList.add('grid-dragging')}};
 const onUp=ev=>{
  document.removeEventListener('pointermove',onMove,true);document.removeEventListener('pointerup',onUp,true);
  tile.classList.remove('grid-dragging');
  if(!dragged)return;
  const grid=$('cards'),bounds=grid.getBoundingClientRect(),style=getComputedStyle(grid);
  const width=grid.firstElementChild?.getBoundingClientRect().width||112;
  const height=grid.firstElementChild?.getBoundingClientRect().height||137;
  const gapX=parseFloat(style.columnGap)||12,gapY=parseFloat(style.rowGap)||12;
  const col=Math.min(TABLE_GRID_COLS,Math.max(1,Math.floor((ev.clientX-bounds.left+grid.scrollLeft)/(width+gapX))+1));
  const row=Math.min(TABLE_GRID_ROWS,Math.max(1,Math.floor((ev.clientY-bounds.top+grid.scrollTop)/(height+gapY))+1));
  const positions=getGridPositions();
  const old={col:Number(tile.style.gridColumn),row:Number(tile.style.gridRow)};
  const other=[...grid.querySelectorAll('.desk-tile')].find(x=>x!==tile&&Number(x.style.gridColumn)===col&&Number(x.style.gridRow)===row);
  positions[id]={col,row};
  if(other){positions[other.dataset.tableId]=old;other.style.gridColumn=String(old.col);other.style.gridRow=String(old.row)}
  tile.style.gridColumn=String(col);tile.style.gridRow=String(row);setGridPositions(positions);
  msg('Masa konumu kaydedildi.');
 };
 document.addEventListener('pointermove',onMove,true);document.addEventListener('pointerup',onUp,true);
}
const contextMenu=$('tableContextMenu');let contextTableId=null;
function hideTableContext(){contextMenu.hidden=true;contextTableId=null}
function showTableContext(id,x,y){
 contextTableId=id;const t=state.tables.find(t=>t.id===id),s=t&&active(t);
 const last=state.sessions.find(s=>s.table_id===id&&s.ended_at);
 for(const b of contextMenu.querySelectorAll('button')){
  const a=b.dataset.contextAction;
  b.disabled=(a==='manual'||a==='manage'||a==='close')&&!s || a==='restore'&&(!last||!!s);
  if(a==='partial'){b.disabled=!s;b.title=s?'Masa açık kalırken nakit veya kart ara tahsilatı kaydet':'Kısmi ödeme için önce hesap açılmalı';b.textContent='💰 Kısmi Ödeme';}
 }
 contextMenu.hidden=false;contextMenu.style.left=Math.max(8,Math.min(x,window.innerWidth-255))+'px';
 contextMenu.style.top=Math.max(8,Math.min(y,window.innerHeight-305))+'px';
}
contextMenu.addEventListener('click',async e=>{
 const b=e.target.closest('[data-context-action]');if(!b||b.disabled)return;
 const id=contextTableId;hideTableContext();const t=state.tables.find(x=>x.id===id);if(!t)return;
 const s=active(t),a=b.dataset.contextAction;
 if(a==='settings')editTable(id);
 else if(a==='manual'&&s)openManualDialog(id);
 else if(a==='partial'&&s)openPartialPayment(s.id);
 else if(a==='manage'&&s)openManageSession(s.id);
 else if(a==='close'&&s)await showReceipt(s.id);
 else if(a==='restore'){
  const latest=state.sessions.find(x=>x.table_id===id&&x.ended_at);
  if(latest)openRestoreDialog(latest.id);
 }
});
document.addEventListener('pointerdown',e=>{if(!contextMenu.hidden&&!contextMenu.contains(e.target))hideTableContext()},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideTableContext()});
window.addEventListener('scroll',hideTableContext,true);

init();

// V26: Geri alınabilir rapor gizleme; mali kayıtları ve ödemeleri silmez.
async function hideReport(id){
 if(!confirm('Bu hesabı rapor listesinden gizlemek istiyor musun? Ödeme/adisyon kayıtları silinmeyecek, işlem denetim kaydında tutulacaktır.'))return;
 try{const r=await db.rpc('cafe_hide_report_v26',{p_session_id:id});if(r.error)throw r.error;await reload(true);await loadReport();msg('Kayıt rapor görünümünden kaldırıldı; mali kayıt korunuyor.');}
 catch(e){msg('Rapor gizlenemedi: '+e.message,true)}
}


// V57 - kismi tahsilat: veritabaninda yetkili, server-side sinirli ve tekil islem.
// Ayni para kapanista tekrar tahsil edilmez; tum parasal degerler SQL RPC ile onaylanir.
(function initPartialPaymentsV57(){
 const d=document.createElement('dialog');d.id='partialPayDialogV57';d.className='partial-pay-v57';
 d.innerHTML=`<form id="partialPayFormV57"><div class="modalhead"><h2>💰 Kısmi Ödeme Al</h2><button type="button" class="secondary" id="partialPayCancelXV57">✕</button></div><p id="partialPayNameV57"></p><div class="partial-pay-values"><div>Güncel toplam <strong id="partialPayTotalV57"></strong></div><div>Önceden alınan <strong id="partialPayPreviousV57"></strong></div><div>En fazla tahsil edilebilir <strong id="partialPayMaxV57"></strong></div></div><label>Ödeme tutarı (₺)<input type="number" id="partialPayAmountV57" min="0.01" step="0.01" required></label><label>Ödeme yöntemi<select id="partialPayMethodV57"><option value="cash">💵 Nakit</option><option value="card">💳 Kart</option></select></label><p class="muted" id="partialPayWarningV57">Masa açık kalır. Bu işlem uygulama içi tahsilat kaydıdır; fiziksel POS çekimi yapmaz.</p><div class="row end"><button type="button" class="secondary" id="partialPayCancelV57">Vazgeç</button><button type="submit" id="partialPaySaveV57">Ödemeyi Kaydet</button></div></form>`;
 document.body.appendChild(d);
 const input=d.querySelector('#partialPayAmountV57'),save=d.querySelector('#partialPaySaveV57');
 let session=null,busy=false,requestId=null;
 function dismiss(){if(!busy)d.close()}
 d.querySelector('#partialPayCancelV57').onclick=dismiss;
 d.querySelector('#partialPayCancelX'+'V57').onclick=dismiss;
 d.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
 window.openPartialPayment=async function(id){
  if(busy)return;
  await reload(true);
  const s=state.sessions.find(x=>x.id===id&&!x.ended_at);
  if(!s){msg('Bu masa artık açık değil.',true);return;}
  session=id;requestId=crypto.randomUUID();const maximum=fromCentsSafe(Math.max(0,gameAmount(s)+productAmount(id)-upfrontAmount(id)));
  if(maximum<=0){msg('Güncel hesapta ara tahsil edilecek tutar bulunmuyor.',true);return;}
  d.querySelector('#partialPayNameV57').textContent=state.tables.find(t=>t.id===s.table_id)?.name||'Masa';
  d.querySelector('#partialPayTotalV57').textContent=money(gameAmount(s)+productAmount(id));
  d.querySelector('#partialPayPreviousV57').textContent=money(upfrontAmount(id));
  d.querySelector('#partialPayMaxV57').textContent=money(maximum);
  d.querySelector('#partialPayWarningV57').textContent='Masa açık kalır. Kısmi ödeme kapanıştan düşülür; POS cihazından para çekilmez.';
  input.max=String(maximum);input.value=maximum.toFixed(2);
  d.showModal();
 };
 d.querySelector('#partialPayFormV57').addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!session)return;
  const amount=Number(input.value),method=d.querySelector('#partialPayMethodV57').value;
  if(!Number.isFinite(amount)||amount<=0||Math.round(amount*100)!==amount*100&&Math.abs(amount*100-Math.round(amount*100))>0.0001){msg('En fazla iki ondalıklı, pozitif bir tutar gir.',true);return;}
  if(!confirm(`${money(amount)} ${method==='card'?'KART':'NAKİT'} kısmi tahsilat kaydedilsin mi? Masa açık kalacak.`))return;
  busy=true;save.disabled=true;
  try{
   const r=await db.rpc('cafe_record_partial_v57',{p_session_id:session,p_amount:amount,p_method:method,p_request_id:requestId});
   if(r.error)throw r.error;
   d.close();await reload(true);
   if(selectedTableId)selectDeskTable(selectedTableId);
   msg(`Kısmi ödeme kaydedildi: ${money(amount)} (${method==='cash'?'Nakit':'Kart'}). Masa açık.`);
  }catch(err){msg('Kısmi ödeme kaydedilemedi: '+err.message,true);d.querySelector('#partialPayWarningV57').textContent=err.message;}
  finally{busy=false;save.disabled=false;}
 });
})();

'use strict';
const $=id=>document.getElementById(id);
const cfg=window.BETA_CONFIG||{};
const db=window.supabase&&cfg.supabaseUrl&&cfg.supabaseAnonKey?window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey):null;
let selectedTableId=null, currentDeskTab="tables";
const state={tables:[],rates:[],sessions:[],links:[],orders:[],manualItems:[],products:[],charges:[],segments:[],payments:[],advances:[],hiddenReports:[],user:null,refreshBusy:false};
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
async function reload(silent=false){
 if(!db||!state.user||state.refreshBusy)return;
 state.refreshBusy=true;
 try{
  const r=await Promise.all([
   db.from('cafe_tables').select('*').order('sort_order',{ascending:true}).order('created_at',{ascending:true}),
   db.from('cafe_table_rates').select('*'),
   db.from('cafe_sessions').select('*').order('started_at',{ascending:false}).limit(250),
   db.from('cafe_charge_catalog').select('id,name,category,price,active,sort_order').order('category').order('name')
  ]);
  for(const x of r)if(x.error)throw x.error;
  [state.tables,state.rates,state.sessions,state.charges]=r.map(x=>x.data||[]);
  const interesting=state.sessions.filter(s=>!s.ended_at).concat(state.sessions.filter(s=>s.ended_at).slice(0,15));
  const sessionIds=[...new Set(interesting.map(s=>s.id))];
  state.links=[];state.orders=[];state.manualItems=[];state.segments=[];state.payments=[];state.advances=[];
  const hidden=await db.from('cafe_report_hidden_v26').select('session_id').limit(1000);
  if(hidden.error)throw hidden.error;state.hiddenReports=(hidden.data||[]).map(x=>x.session_id);
  if(sessionIds.length){
   const sg=await db.from('cafe_session_segments').select('session_id,table_id,controllers,hourly_price,short_fee,rounding_step,started_at').in('session_id',sessionIds).order('started_at',{ascending:true}).limit(1000);
   if(sg.error)throw sg.error;
   state.segments=sg.data||[];
   const advances=await db.from('cafe_session_advances_v26').select('session_id,amount,method,paid_at').in('session_id',sessionIds);
   if(advances.error)throw advances.error;state.advances=advances.data||[];
   const payments=await db.from('cafe_payments').select('session_id,gross_amount,discount_amount,cash_amount,card_amount,paid_at').in('session_id',sessionIds).limit(1000);
   if(payments.error)throw payments.error;
   state.payments=payments.data||[];
   const manual=await db.from('cafe_manual_items').select('id,session_id,product_id,product_name,qty,unit_price,created_at,voided_at').in('session_id',sessionIds).order('created_at',{ascending:true}).limit(1000);
   if(manual.error)throw manual.error;
   state.manualItems=manual.data||[];
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
const advanceFor=id=>state.advances.find(x=>x.session_id===id);
const advanceAmount=id=>Number(advanceFor(id)?.amount||0);
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
 }).filter(e=>Number.isFinite(Date.parse(e.at)))
   .sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,20);
 $('history').innerHTML=lastEvents.length?lastEvents.map(e=>{
  const s=e.session;
  const initial=state.segments.filter(z=>z.session_id===s.id)
   .sort((a,b)=>Date.parse(a.started_at)-Date.parse(b.started_at))[0];
  const name=esc(state.tables.find(t=>t.id===s.table_id)?.name||'Masa');
  const when=new Date(e.at).toLocaleString('tr-TR');
  if(e.type==='open'){
   return `<div class="historyrow recent-event recent-open"><div class="recent-info"><strong>🟢 ${name} — HESAP AÇILDI</strong><div>Açılış: ${when}</div><div>🎮 ${Number(initial?.controllers||s.controllers)||1} kol ile açıldı</div></div></div>`;
  }
  const secs=Math.max(0,Math.floor((Date.parse(s.ended_at)-Date.parse(s.started_at))/1000));
  const total=Number(s.final_total_amount??(Number(s.final_game_amount||0)+Number(s.final_order_amount||0)));
  return `<div class="historyrow recent-event recent-close"><div class="recent-info"><strong>🔴 ${name} — HESAP KAPANDI</strong><div>Kapanış: ${when} · Süre: ${Math.ceil(secs/60)} dakika</div><div><b>TOPLAM: ${money(total)}</b></div></div><div class="history-actions"><button class="secondary" type="button" data-receipt-history="${esc(s.id)}">🧾 Rapor / Adisyon</button>${state.payments.some(p=>p.session_id===s.id)?`<span class="payment-ok">✓ Ödendi</span>`:`<button class="payment-history-btn" type="button" data-pay-history="${esc(s.id)}">💳 Ödeme Al</button>`}</div></div>`;
 }).join(''):'<p class="muted">Henüz hesap açılışı veya kapanışı yok.</p>';
 updateOutstanding();
 document.querySelectorAll('[data-receipt-history]').forEach(b=>b.onclick=()=>showReceipt(b.dataset.receiptHistory));document.querySelectorAll('[data-pay-history]').forEach(b=>b.onclick=()=>openPayment(b.dataset.payHistory));renderDesktop();tick();}

// V30: kompakt masa planı, seçilen masanın bütün işlemleri sol detay panelinde.
const tableDeviceArt={
 playstation:'<svg viewBox="0 0 72 52" aria-hidden="true"><path d="M22 16h28c7 0 12 5 14 13l4 12c2 10-8 14-14 8l-9-8H27l-9 8C12 55 2 51 4 41l4-12c2-8 7-13 14-13Z" fill="#eee" stroke="#a7a7b6" stroke-width="2"/><path d="M19 27v12m-6-6h12" stroke="#303344" stroke-width="4" stroke-linecap="round"/><circle cx="48" cy="29" r="3.5" fill="#ff4655"/><circle cx="56" cy="35" r="3.5" fill="#4baaf1"/><circle cx="37" cy="33" r="4" fill="#b7b9c6"/></svg>',
 computer:'<svg viewBox="0 0 72 52" aria-hidden="true"><rect x="7" y="6" width="58" height="35" rx="4" fill="#dce8f5" stroke="#7696b5" stroke-width="2"/><rect x="12" y="11" width="48" height="25" rx="1" fill="#1e5d87"/><path d="M36 41v6M22 48h28" stroke="#c8d1dc" stroke-width="4" stroke-linecap="round"/></svg>',
 billiards:'<svg viewBox="0 0 72 52" aria-hidden="true"><rect x="5" y="6" width="62" height="40" rx="5" fill="#653c1c"/><rect x="10" y="11" width="52" height="30" rx="3" fill="#138a5c"/><g fill="#131619"><circle cx="11" cy="12" r="4"/><circle cx="61" cy="12" r="4"/><circle cx="11" cy="40" r="4"/><circle cx="61" cy="40" r="4"/></g><circle cx="26" cy="24" r="4" fill="#fafafa"/><circle cx="43" cy="31" r="4" fill="#f4d75a"/><circle cx="48" cy="20" r="4" fill="#fff"/></svg>'
};
function selectDeskTable(id){
 const ts=state.tables.filter(t=>t.active);
 const t=ts.find(t=>t.id===id);
 if(!t)return;
 selectedTableId=id;
 const selected=desktopFullCards.get(id);
 const panel=$('selectedTablePanel');
 panel.replaceChildren();
 const label=document.createElement('div');label.className='selected-heading';label.textContent='MASA BİLGİLERİ · '+t.name;
 panel.append(label);
 if(selected){selected.classList.add('desktop-detail');panel.append(selected);}
 document.querySelectorAll('.desk-tile').forEach(el=>{const active=el.dataset.tableId===id;el.classList.toggle('is-selected',active);el.setAttribute('aria-pressed',String(active));});
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
function setDeskTab(tab){
 currentDeskTab=tab;
 $('tableWorkspace').hidden=tab!=='tables';
 $('ordersDeskView').hidden=tab!=='orders';
 $('tabTables').classList.toggle('active',tab==='tables');
 $('tabOrders').classList.toggle('active',tab==='orders');
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
  tile.dataset.tableId=t.id;tile.style.setProperty('--closed-color',validTableColor(t.closed_color));
  tile.setAttribute('aria-label',t.name+' · '+(s?'Dolu':'Boş')+' · bilgileri aç');
  const kind=['playstation','computer','billiards'].includes(t.device_type)?t.device_type:'playstation';
  tile.innerHTML=`<span class="desk-tile-status">${s?'● DOLU':'● BOŞ'}</span><span class="desk-tile-clock" data-tile-time="${esc(t.id)}">${s?'—':'BOŞ'}</span><span class="desk-tile-art">${tableDeviceArt[kind]}</span><span class="desk-tile-name">${esc(t.name)}</span>`;
  tile.addEventListener('click',()=>selectDeskTable(t.id));fragment.append(tile);
 }
 grid.replaceChildren(fragment);
 if(!ts.length){$('selectedTablePanel').textContent='Henüz masa bulunamadı.';return;}
 if(!ts.some(t=>t.id===selectedTableId))selectedTableId=ts[0].id;
 selectDeskTable(selectedTableId);
 renderOrdersDesk();
 setDeskTab(currentDeskTab);
}

function updateOutstanding(){const live=state.sessions.filter(s=>!s.ended_at);const due=live.reduce((sum,s)=>sum+Math.max(0,gameAmount(s)+productAmount(s.id)-advanceAmount(s.id)),0);$('outstandingAmount').textContent=money(due);$('outstandingCount').textContent=live.length+' açık hesap · anlık tahmin (5 TL dilimi)';}
function tick(){if($('app').hidden)return;updateOutstanding();for(const s of state.sessions.filter(s=>!s.ended_at)){const e=elapsed(s),a=document.querySelector(`[data-timer="${s.id}"]`),b=document.querySelector(`[data-left="${s.id}"]`),c=document.querySelector(`[data-amount="${s.id}"]`),t=$(`tag-${s.table_id}`);if(a)a.textContent=fmtTime(e);if(b){const left=s.planned_seconds-e;b.textContent=left>0?fmtTime(left):'SÜRE DOLDU · +'+fmtTime(-left);b.style.color=left<=0?'#ff6369':'';if(t){t.classList.toggle('expired',left<=0);t.textContent=left<=0?'⏰ SÜRE DOLDU':'● DOLU'}}if(c)c.textContent=money(gameAmount(s));const total=document.querySelector(`[data-total="${s.id}"]`);if(total)total.textContent=money(gameAmount(s)+productAmount(s.id));}updateDesktopTimers();}
$('refresh').onclick=()=>reload();setInterval(()=>{if(!$('app').hidden)tick()},1000);setInterval(()=>{if(!$('app').hidden)reload(true)},15000);
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
let manualSessionId=null;
function openManualDialog(id){
 const s=state.sessions.find(x=>x.id===id&&!x.ended_at);if(!s)return;
 manualSessionId=id;
 $('manualForm').reset();
 $('manualSession').textContent=state.tables.find(t=>t.id===s.table_id)?.name||'Masa';
 const ps=state.charges.filter(p=>p.active);
 $('manualProduct').innerHTML='<option value="">Ürün seç</option>'+ps.map(p=>`<option value="${esc(p.id)}">${esc(p.category)} · ${esc(p.name)} · ${money(p.price)}</option>`).join('');
 $('manualQty').value='1';updateManualPreview();$('manualDialog').showModal();
}
function updateManualPreview(){
 const p=state.charges.find(x=>x.id===$('manualProduct').value),q=Number($('manualQty').value);
 $('manualPreview').textContent=p&&Number.isInteger(q)&&q>=1&&q<=99?`Birim fiyat: ${money(p.price)} · Toplam: ${money(q*Number(p.price))}`:'Ürün ve adet seçin.';
}
$('manualProduct').addEventListener('change',updateManualPreview);
$('manualQty').addEventListener('input',updateManualPreview);
$('manualForm').addEventListener('submit',async e=>{
 e.preventDefault();const b=e.currentTarget.querySelector('[type=submit]');b.disabled=true;
 try{
  if(!manualSessionId)throw Error('Masa seçilmedi');
  const id=$('manualProduct').value,qty=Number($('manualQty').value);
  if(!id||!Number.isInteger(qty)||qty<1||qty>99)throw Error('Ürün ve 1–99 arası adet seçin.');
  const r=await db.rpc('cafe_add_catalog_charge',{p_session_id:manualSessionId,p_catalog_item_id:id,p_qty:qty});
  if(r.error)throw r.error;
  $('manualDialog').close();await reload();msg('Ürün açık masa adisyonuna eklendi.');
 }catch(err){msg('Adisyon eklenemedi: '+err.message,true)}finally{b.disabled=false}
});
// V5: kasa icin ayri adisyon kalemleri. Musteri urunleri (products) hic degismez.
function renderChargeList(){
 const list=$('chargeList');
 list.innerHTML=state.charges.length?state.charges.map(c=>`<div class="charge-row"><div><strong>${esc(c.name)}</strong><div class="muted">${esc(c.category)} · ${money(c.price)} · ${c.active?'Aktif':'Pasif'}</div></div><button type="button" class="secondary" data-edit-charge="${esc(c.id)}">Düzenle</button></div>`).join(''):'<p class="muted">Henüz kasa adisyon kalemi eklenmedi.</p>';
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
 $('manageInfo').textContent=`${s.controllers} kol · ${s.mode==='timed'?'Süreli':'Süresiz'} · Oyun: ${money(gameAmount(s))}`;
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
  if(!confirm('Kol değişikliğinden sonraki süre yeni kol fiyatına göre hesaplanacak. Onaylıyor musun?'))return;
  await manageAction('cafe_change_controllers_v10',{p_controllers:n},'Kol sayısı yeni fiyatıyla güncellendi.');
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
  $('receiptTitle').textContent='✅ Hesap Kapatıldı · Adisyon';
  $('receiptBody').innerHTML='';
  $('receiptBody').hidden=true;
  $('receiptWarning').textContent='Hesap kapatıldı. Şimdi Nakit / Kart / İskonto bölümünden ödeme kaydedebilirsin.';
  $('embeddedPayment').hidden=false;
  button.hidden=true;$('receiptCancel').textContent='Kapat';
  msg(`${receiptSnapshot.name} hesabı kapatıldı. Toplam ${money(receiptSnapshot.total)}.`);
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
 const total=paymentTotal(),advance=advanceAmount(paymentSessionId);
 try{
  const discount=discountValue(Math.max(0,total-advance)),net=fromCents(cents(total)-cents(advance)-cents(discount));
  const cash=Number($('payCash').value||0),card=Number($('payCard').value||0);
  if(!Number.isFinite(cash)||!Number.isFinite(card)||cash<0||card<0)throw Error('Ödeme tutarları geçersiz.');
  const diff=fromCents(cents(net)-cents(cash)-cents(card));
  $('paymentAdvance').textContent=money(advance);
  $('paymentSummary').innerHTML=`<div class="payment-line"><span>Hesap tutarı</span><strong>${money(total)}</strong></div><div class="payment-line"><span>Açılışta alınan</span><strong>− ${money(advance)}</strong></div><div class="payment-line"><span>İskonto</span><strong>− ${money(discount)}</strong></div><div class="payment-line payment-net"><span>Ödenecek</span><strong>${money(net)}</strong></div><div class="payment-line"><span>Nakit + Kart</span><strong>${money(cash+card)}</strong></div><div class="payment-line"><span>${diff>=0?'Kalan':'Fazla girilen'}</span><strong>${money(Math.abs(diff))}</strong></div>`;
  $('paymentSave').disabled=diff!==0;
  $('paymentWarning').textContent=diff===0?'Tutarlar eşleşiyor; ödemeyi kaydedebilirsin.':'Nakit ve kart toplamı ödenecek tutara eşit olmalı.';
 }catch(e){$('paymentSummary').textContent='Kontrol: '+e.message;$('paymentSave').disabled=true;$('paymentWarning').textContent=e.message}
}
function fillPendingPayment(id){
 paymentSessionId=id;
 $('paymentTableName').textContent=receiptSnapshot.name;
 $('paymentGross').textContent=money(paymentTotal());
 $('paymentForm').reset();$('payDiscountType').value='amount';$('payDiscount').value='0';
 $('payCash').value='0';$('payCard').value=Math.max(0,paymentTotal()-advanceAmount(id)).toFixed(2);
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
 $('payCash').value=Math.max(0,paymentTotal()-advanceAmount(id)).toFixed(2);$('payCard').value='0';
 const disabled=Boolean(paid);
 for(const input of $('paymentForm').querySelectorAll('input,select'))input.disabled=disabled;
 $('paymentSave').hidden=disabled;
 if(disabled){
  $('paymentSummary').innerHTML=`<div class="payment-line"><span>Açılışta alınan</span><strong>${money(advanceAmount(id))}</strong></div><div class="payment-line"><span>İskonto</span><strong>${money(paid.discount_amount)}</strong></div><div class="payment-line"><span>Nakit</span><strong>${money(paid.cash_amount)}</strong></div><div class="payment-line"><span>Kart</span><strong>${money(paid.card_amount)}</strong></div><div class="payment-line payment-net"><span>Tahsil edilen</span><strong>${money(Number(paid.cash_amount)+Number(paid.card_amount))}</strong></div>`;
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
  const upfront=advanceAmount(paymentSessionId),discount=discountValue(Math.max(0,preTotal-upfront)),cash=Number($('payCash').value||0),card=Number($('payCard').value||0);
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
   const finalDue=Math.max(0,fromCents(cents(actual)-cents(advanceAmount(id))-cents(discountValue(Math.max(0,actual-advanceAmount(id))))));
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
  const finalDiscount=discountValue(Math.max(0,paymentTotal()-advanceAmount(id))),finalCash=Number($('payCash').value||0),finalCard=Number($('payCard').value||0);
  if(cents(finalCash)+cents(finalCard)!==cents(paymentTotal())-cents(advanceAmount(id))-cents(finalDiscount)){
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
  $('payCash').value='0';$('payCard').value=Math.max(0,paymentTotal()-advanceAmount(paymentSessionId)).toFixed(2);
  updatePaymentPreview();
  await savePaymentRecord();
 }finally{enterCloseBusy=false;}
});

// V7 Rapor ekranı: geçmiş hesaplar ana masa yükleme sınırından bağımsız alınır.
const reportDate=d=>{const a=new Date(d);return `${a.getFullYear()}-${String(a.getMonth()+1).padStart(2,'0')}-${String(a.getDate()).padStart(2,'0')}`};
function initReportDates(){const now=new Date();$('reportTo').value=reportDate(now);const earlier=new Date(now);earlier.setDate(earlier.getDate()-29);$('reportFrom').value=reportDate(earlier)}
function switchReports(show){$('reportsView').hidden=!show;$('tableWorkspace').hidden=show;$('ordersDeskView').hidden=true;document.querySelector('.stats').hidden=show;$('recentHistory').hidden=show;if(show){$('reportTable').innerHTML='<option value="">Tüm masalar</option>'+state.tables.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');$('reportsView').scrollIntoView({behavior:'smooth',block:'start'});}else {setDeskTab('tables');window.scrollTo({top:0,behavior:'smooth'});}}
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
  const reportAdvances=new Map(),reportPayments=new Map();for(let i=0;i<ids.length;i+=100){const chunk=ids.slice(i,i+100);const [a,p]=await Promise.all([db.from('cafe_session_advances_v26').select('session_id,amount,method').in('session_id',chunk),db.from('cafe_payments').select('session_id,cash_amount,card_amount,discount_amount').in('session_id',chunk)]);if(a.error)throw a.error;if(p.error)throw p.error;for(const z of a.data||[])reportAdvances.set(z.session_id,z);for(const z of p.data||[])reportPayments.set(z.session_id,z);}
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
   const advance=reportAdvances.get(s.id),payment=reportPayments.get(s.id);
   const payStatus=payment?`<small class="paid-state">✓ Ödendi · açılış ${money(advance?.amount||0)} · kapanış ${money(Number(payment.cash_amount)+Number(payment.card_amount)-Number(advance?.amount||0))}</small>`:advance?`<small class="partial-state">◐ Açılışta ${money(advance.amount)} alındı · kalan ödeme bekliyor</small>`:'<small class="unpaid-state">⚠ Tahsilat kaydı yok</small>';
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

init();

// V26: Geri alınabilir rapor gizleme; mali kayıtları ve ödemeleri silmez.
async function hideReport(id){
 if(!confirm('Bu hesabı rapor listesinden gizlemek istiyor musun? Ödeme/adisyon kayıtları silinmeyecek, işlem denetim kaydında tutulacaktır.'))return;
 try{const r=await db.rpc('cafe_hide_report_v26',{p_session_id:id});if(r.error)throw r.error;await reload(true);await loadReport();msg('Kayıt rapor görünümünden kaldırıldı; mali kayıt korunuyor.');}
 catch(e){msg('Rapor gizlenemedi: '+e.message,true)}
}
